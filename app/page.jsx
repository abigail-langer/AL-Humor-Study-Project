import SignInButton from "./SignInButton";
import SignOutButton from "./SignOutButton";
import UploadImage from "./UploadImage";
import RateCard from "./RateCard";
import { createSupabaseServerClient } from "../lib/supabaseServer";

export const dynamic = "force-dynamic";

// ── helpers ──────────────────────────────────────────────────────────────────

const resolveImageUrl = (image) => {
  if (!image) return null;
  const candidates = [
    image.url,
    image.image_url,
    image.public_url,
    image.file_url,
    image.storage_url,
    image.storage_path,
    image.cdn_url,
    image.source_url,
    image.original_url,
  ];
  const named = candidates.find((v) => typeof v === "string" && v.length > 0);
  if (named) return named;
  return (
    Object.values(image).find(
      (v) => typeof v === "string" && (v.startsWith("http") || v.startsWith("/"))
    ) ?? null
  );
};

const fetchImagesByIds = async (supabase, ids) => {
  if (!ids.length) return new Map();
  const { data } = await supabase.from("images").select("*").in("id", ids);
  return new Map((data ?? []).map((img) => [img.id, img]));
};

// ── page ──────────────────────────────────────────────────────────────────────

export default async function Home({ searchParams }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  /* ── Sign-in gate ──────────────────────────────────────────────────────── */
  if (!user) {
    return (
      <div className="shell">
        <nav className="navbar">
          <span className="navbar-brand">
            <span className="navbar-logo" aria-hidden="true">✦</span>
            AlmostCrackd
          </span>
        </nav>
        <div className="landing">
          <div className="landing-card">
            <span className="landing-icon" aria-hidden="true">🖼️</span>
            <h1 className="landing-title">Caption your images</h1>
            <p className="landing-sub">
              Upload any photo and instantly get AI-generated captions.
              Rate captions one at a time and build your personal favourites list.
            </p>
            <SignInButton />
          </div>
        </div>
      </div>
    );
  }

  /* ── Tab routing ───────────────────────────────────────────────────────── */
  // tabs: "rate" | "liked" | "disliked" | "uploads"
  const tab = searchParams?.tab ?? "rate";

  /* ── Per-tab data fetching ─────────────────────────────────────────────── */
  let rateCaption      = null;
  let rateImage        = null;
  let likedCaptions    = [];
  let dislikedCaptions = [];
  let likedImages      = new Map();
  let dislikedImages   = new Map();

  // "uploads" tab data: images the user uploaded, each with their captions
  let uploadedImages   = [];   // array of image rows
  // captionsByImageId: Map<imageId, caption[]>
  let captionsByImageId = new Map();

  let feedError = null;

  if (tab === "rate") {
    const { data: votedRows } = await supabase
      .from("caption_votes")
      .select("caption_id")
      .eq("profile_id", user.id);

    const votedIds = (votedRows ?? []).map((r) => r.caption_id);

    let q = supabase
      .from("captions")
      .select("id, content, like_count, image_id")
      .limit(1);

    if (votedIds.length > 0) {
      q = q.not("id", "in", `(${votedIds.join(",")})`);
    }

    const { data, error } = await q;
    if (error) {
      feedError = error.message;
    } else {
      rateCaption = data?.[0] ?? null;
      if (rateCaption?.image_id) {
        const imageById = await fetchImagesByIds(supabase, [rateCaption.image_id]);
        rateImage = imageById.get(rateCaption.image_id) ?? null;
      }
    }

  } else if (tab === "liked") {
    const { data: votes, error } = await supabase
      .from("caption_votes")
      .select("caption_id")
      .eq("profile_id", user.id)
      .eq("vote_value", 1)
      .order("created_datetime_utc", { ascending: false });

    if (error) {
      feedError = error.message;
    } else {
      const ids = (votes ?? []).map((v) => v.caption_id);
      if (ids.length) {
        const { data } = await supabase
          .from("captions")
          .select("id, content, like_count, image_id")
          .in("id", ids);
        likedCaptions = data ?? [];
        likedImages = await fetchImagesByIds(
          supabase,
          [...new Set(likedCaptions.map((c) => c.image_id).filter(Boolean))]
        );
      }
    }

  } else if (tab === "disliked") {
    const { data: votes, error } = await supabase
      .from("caption_votes")
      .select("caption_id")
      .eq("profile_id", user.id)
      .eq("vote_value", -1)
      .order("created_datetime_utc", { ascending: false });

    if (error) {
      feedError = error.message;
    } else {
      const ids = (votes ?? []).map((v) => v.caption_id);
      if (ids.length) {
        const { data } = await supabase
          .from("captions")
          .select("id, content, like_count, image_id")
          .in("id", ids);
        dislikedCaptions = data ?? [];
        dislikedImages = await fetchImagesByIds(
          supabase,
          [...new Set(dislikedCaptions.map((c) => c.image_id).filter(Boolean))]
        );
      }
    }

  } else if (tab === "uploads") {
    // Fetch images uploaded by this user.
    // The images table is expected to have a profile_id (or user_id) column
    // linking the row to the uploader. We try profile_id first; if that column
    // doesn't exist Supabase returns an error and we surface a clear message.
    const { data: imgs, error: imgError } = await supabase
      .from("images")
      .select("*")
      .eq("profile_id", user.id)
      .order("created_datetime_utc", { ascending: false });

    if (imgError) {
      feedError = imgError.message;
    } else {
      uploadedImages = imgs ?? [];

      // Fetch all captions for these images in one query
      const imageIds = uploadedImages.map((img) => img.id).filter(Boolean);
      if (imageIds.length) {
        const { data: caps } = await supabase
          .from("captions")
          .select("id, content, like_count, image_id")
          .in("image_id", imageIds)
          .order("created_datetime_utc", { ascending: true });

        // Group captions by image_id
        for (const cap of caps ?? []) {
          if (!captionsByImageId.has(cap.image_id)) {
            captionsByImageId.set(cap.image_id, []);
          }
          captionsByImageId.get(cap.image_id).push(cap);
        }
      }
    }
  }

  const userEmail = user?.email ?? null;

  /* ── Render ────────────────────────────────────────────────────────────── */
  return (
    <div className="shell">
      {/* Navbar */}
      <nav className="navbar">
        <span className="navbar-brand">
          <span className="navbar-logo" aria-hidden="true">✦</span>
          AlmostCrackd
        </span>
        <div className="navbar-actions">
          {userEmail && (
            <span className="user-chip">
              <span className="user-chip-dot" aria-hidden="true" />
              {userEmail}
            </span>
          )}
          <SignOutButton />
        </div>
      </nav>

      {/* Two-column body */}
      <div className="page-body">

        {/* ── Left: sticky upload panel ───────────────────────────────────── */}
        <aside className="panel-upload">
          <UploadImage />
        </aside>

        {/* ── Right: feed panel ──────────────────────────────────────────── */}
        <main className="panel-feed">

          {/* Tab bar */}
          <div className="tab-bar" role="tablist">
            <a
              href="/?tab=rate"
              className={`tab-btn${tab === "rate" ? " tab-btn--active" : ""}`}
              role="tab"
              aria-selected={tab === "rate"}
            >
              Rate
            </a>
            <a
              href="/?tab=liked"
              className={`tab-btn${tab === "liked" ? " tab-btn--active" : ""}`}
              role="tab"
              aria-selected={tab === "liked"}
            >
              👍 Liked
            </a>
            <a
              href="/?tab=disliked"
              className={`tab-btn${tab === "disliked" ? " tab-btn--active" : ""}`}
              role="tab"
              aria-selected={tab === "disliked"}
            >
              👎 Disliked
            </a>
            <a
              href="/?tab=uploads"
              className={`tab-btn${tab === "uploads" ? " tab-btn--active" : ""}`}
              role="tab"
              aria-selected={tab === "uploads"}
            >
              🖼️ My Uploads
            </a>
          </div>

          {/* Error */}
          {feedError && (
            <div className="feed-error" role="alert">
              Failed to load: {feedError}
            </div>
          )}

          {/* ── Rate tab ─────────────────────────────────────────────────── */}
          {!feedError && tab === "rate" && (
            rateCaption ? (
              <RateCard
                caption={rateCaption}
                imageUrl={resolveImageUrl(rateImage)}
              />
            ) : (
              <div className="feed-empty" role="status">
                🎉 You&apos;ve rated everything! Check your liked and disliked tabs.
              </div>
            )
          )}

          {/* ── Liked tab ────────────────────────────────────────────────── */}
          {!feedError && tab === "liked" && (
            likedCaptions.length > 0 ? (
              <div className="caption-grid" role="list">
                {likedCaptions.map((caption) => {
                  const imgUrl = resolveImageUrl(likedImages.get(caption.image_id));
                  return (
                    <article className="caption-card" key={caption.id} role="listitem">
                      <div className="caption-image-wrap">
                        {imgUrl
                          ? <img className="caption-image" src={imgUrl} alt={caption.content} loading="lazy" />
                          : <div className="caption-image--placeholder">No image</div>}
                      </div>
                      <div className="caption-body">
                        <p className="caption-text">{caption.content}</p>
                        <div className="caption-footer">
                          <span className="caption-like-badge">♥ {caption.like_count ?? 0}</span>
                          <span className="voted-badge voted-badge--up">👍 Liked</span>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="feed-empty" role="status">
                No liked captions yet — start rating on the Rate tab!
              </div>
            )
          )}

          {/* ── Disliked tab ─────────────────────────────────────────────── */}
          {!feedError && tab === "disliked" && (
            dislikedCaptions.length > 0 ? (
              <div className="caption-grid" role="list">
                {dislikedCaptions.map((caption) => {
                  const imgUrl = resolveImageUrl(dislikedImages.get(caption.image_id));
                  return (
                    <article className="caption-card" key={caption.id} role="listitem">
                      <div className="caption-image-wrap">
                        {imgUrl
                          ? <img className="caption-image" src={imgUrl} alt={caption.content} loading="lazy" />
                          : <div className="caption-image--placeholder">No image</div>}
                      </div>
                      <div className="caption-body">
                        <p className="caption-text">{caption.content}</p>
                        <div className="caption-footer">
                          <span className="caption-like-badge">♥ {caption.like_count ?? 0}</span>
                          <span className="voted-badge voted-badge--down">👎 Disliked</span>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="feed-empty" role="status">
                No disliked captions yet.
              </div>
            )
          )}

          {/* ── My Uploads tab ───────────────────────────────────────────── */}
          {!feedError && tab === "uploads" && (
            uploadedImages.length > 0 ? (
              <div className="uploads-list">
                {uploadedImages.map((img) => {
                  const imgUrl = resolveImageUrl(img);
                  const captions = captionsByImageId.get(img.id) ?? [];
                  return (
                    <div className="upload-entry" key={img.id}>
                      {/* Image */}
                      <div className="upload-entry-image-wrap">
                        {imgUrl ? (
                          <img
                            className="upload-entry-image"
                            src={imgUrl}
                            alt="Uploaded image"
                            loading="lazy"
                          />
                        ) : (
                          <div className="upload-entry-image--placeholder">No image</div>
                        )}
                      </div>

                      {/* Captions list */}
                      <div className="upload-entry-captions">
                        <p className="upload-entry-caption-heading">
                          {captions.length > 0
                            ? `${captions.length} caption${captions.length !== 1 ? "s" : ""}`
                            : "No captions yet"}
                        </p>
                        {captions.length > 0 && (
                          <ol className="upload-entry-caption-list">
                            {captions.map((c, i) => (
                              <li key={c.id} className="upload-entry-caption-item">
                                <span className="upload-entry-caption-num">{i + 1}</span>
                                <span className="upload-entry-caption-text">{c.content}</span>
                                <span className="caption-like-badge">♥ {c.like_count ?? 0}</span>
                              </li>
                            ))}
                          </ol>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="feed-empty" role="status">
                No uploads yet — use the panel on the left to upload your first image!
              </div>
            )
          )}

        </main>
      </div>
    </div>
  );
}
