import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabaseServer";

const API_BASE = "https://api.almostcrackd.ai";

// POST /api/presign
// Body: { content_type: "image/jpeg" }
// Returns: { presignedUrl, cdnUrl } from the upstream API
export async function POST(request) {
  // Verify the caller is authenticated via Supabase
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

  const { content_type } = body;

  const SUPPORTED = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/heic",
  ];

  if (!content_type || !SUPPORTED.includes(content_type)) {
    return NextResponse.json(
      {
        error: `Unsupported content_type. Must be one of: ${SUPPORTED.join(", ")}`,
      },
      { status: 400 }
    );
  }

  try {
    // Upstream expects camelCase "contentType" per the API spec
    const upstream = await fetch(`${API_BASE}/pipeline/generate-presigned-url`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ contentType: content_type }),
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      return NextResponse.json(
        { error: data?.detail || data?.message || "Failed to get presigned URL" },
        { status: upstream.status }
      );
    }

    // Forward { presignedUrl, cdnUrl } directly to the client
    return NextResponse.json(data);
  } catch (err) {
    console.error("[presign] upstream error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
