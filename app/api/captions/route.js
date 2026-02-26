import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabaseServer";

const API_BASE = "https://api.almostcrackd.ai";

// POST /api/captions
// Body: { image_id: "<imageId from Step 3>" }
// Calls POST /pipeline/generate-captions
// Returns: array of caption records generated and saved by the system
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

  const { image_id } = body;

  if (!image_id || typeof image_id !== "string") {
    return NextResponse.json(
      { error: "image_id is required and must be a string" },
      { status: 400 }
    );
  }

  try {
    const upstream = await fetch(`${API_BASE}/pipeline/generate-captions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      // camelCase imageId per API spec
      body: JSON.stringify({ imageId: image_id }),
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      return NextResponse.json(
        { error: data?.detail || data?.message || "Failed to generate captions" },
        { status: upstream.status }
      );
    }

    // Forward the caption records array directly to the client
    return NextResponse.json(data);
  } catch (err) {
    console.error("[captions] upstream error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
