import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabaseServer";

// POST /api/vote
// Body: { caption_id: string, vote: "up" | "down" | null }
//   vote: "up"   → +1  (upvote)
//   vote: "down" → -1  (downvote)
//   vote: null   → remove the existing vote
//
// Returns: { like_count: number, vote_value: number | null }
//   like_count  — the updated aggregate stored in captions.like_count
//   vote_value  — the caller's current vote (+1, -1, or null)
export async function POST(request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { caption_id, vote } = body;

  if (!caption_id || typeof caption_id !== "string") {
    return NextResponse.json(
      { error: "caption_id is required" },
      { status: 400 }
    );
  }

  const voteValue =
    vote === "up" ? 1 : vote === "down" ? -1 : null;

  const now = new Date().toISOString();

  if (voteValue === null) {
    // ── Remove vote ────────────────────────────────────────────────────────
    await supabase
      .from("caption_votes")
      .delete()
      .eq("profile_id", user.id)
      .eq("caption_id", caption_id);
  } else {
    // ── Upsert vote (insert or update on duplicate) ───────────────────────
    const { error: insertError } = await supabase
      .from("caption_votes")
      .insert({
        caption_id,
        profile_id: user.id,
        vote_value: voteValue,
        created_datetime_utc: now,
      });

    if (insertError?.code === "23505") {
      // Row already exists — update it instead
      const { error: updateError } = await supabase
        .from("caption_votes")
        .update({ vote_value: voteValue, modified_datetime_utc: now })
        .eq("profile_id", user.id)
        .eq("caption_id", caption_id);

      if (updateError) {
        console.error("[vote] update error:", updateError.message);
        return NextResponse.json(
          { error: "Failed to update vote" },
          { status: 500 }
        );
      }
    } else if (insertError) {
      console.error("[vote] insert error:", insertError.message);
      return NextResponse.json(
        { error: "Failed to record vote" },
        { status: 500 }
      );
    }
  }

  // ── Re-read the fresh like_count from the captions table ─────────────────
  const { data: caption, error: fetchError } = await supabase
    .from("captions")
    .select("like_count")
    .eq("id", caption_id)
    .single();

  if (fetchError) {
    // Non-fatal: return vote state without like_count
    console.error("[vote] fetch like_count error:", fetchError.message);
    return NextResponse.json({ vote_value: voteValue, like_count: null });
  }

  return NextResponse.json({
    vote_value: voteValue,
    like_count: caption.like_count ?? 0,
  });
}
