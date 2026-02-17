"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../lib/supabaseServer";

const normalizeRedirectPath = (value) => {
  if (typeof value !== "string" || !value.startsWith("/")) {
    return "/";
  }

  return value;
};

export async function submitCaptionVote(formData) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const redirectTo = normalizeRedirectPath(formData.get("redirect_to"));

  if (!user) {
    redirect(redirectTo);
  }

  const captionId = formData.get("caption_id");
  const voteDirection = formData.get("vote");
  const voteValue =
    voteDirection === "up" ? 1 : voteDirection === "down" ? -1 : null;
  const now = new Date().toISOString();

  if (typeof captionId !== "string" || captionId.length === 0 || voteValue === null) {
    redirect(redirectTo);
  }

  const { error: insertError } = await supabase.from("caption_votes").insert({
    caption_id: captionId,
    profile_id: user.id,
    vote_value: voteValue,
    created_datetime_utc: now,
  });

  if (insertError?.code === "23505") {
    const { error: updateError } = await supabase
      .from("caption_votes")
      .update({
        vote_value: voteValue,
        modified_datetime_utc: now,
      })
      .eq("profile_id", user.id)
      .eq("caption_id", captionId);

    if (updateError) {
      console.error("Failed to update caption vote:", updateError.message);
    }
  } else if (insertError) {
    console.error("Failed to insert caption vote:", insertError.message);
  }

  revalidatePath("/");
  redirect(redirectTo);
}
