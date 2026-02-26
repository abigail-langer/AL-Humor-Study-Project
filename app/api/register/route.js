import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabaseServer";

const API_BASE = "https://api.almostcrackd.ai";

// POST /api/register
// Body: { image_url: "<cdnUrl from Step 1>" }
// Calls POST /pipeline/upload-image-from-url
// Returns: { imageId, now }
export async function POST(request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { image_url } = body;

  if (!image_url || typeof image_url !== "string") {
    return NextResponse.json(
      { error: "image_url is required and must be a string" },
      { status: 400 }
    );
  }

  try {
    const upstream = await fetch(`${API_BASE}/pipeline/upload-image-from-url`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      // camelCase field names per API spec; isCommonUse always false for user uploads
      body: JSON.stringify({ imageUrl: image_url, isCommonUse: false }),
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      return NextResponse.json(
        { error: data?.detail || data?.message || "Failed to register image" },
        { status: upstream.status }
      );
    }

    // Forward { imageId, now } to the client
    return NextResponse.json(data);
  } catch (err) {
    console.error("[register] upstream error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
