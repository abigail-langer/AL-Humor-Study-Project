import SignInButton from "./SignInButton";
import SignOutButton from "./SignOutButton";
import UploadImage from "./UploadImage";
import { submitCaptionVote } from "./actions";
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
  const tab = searchParams?.tab ?? "rate"; // "rate" | "liked" | "disliked"

  /* ── Fetch data for the active tab ────────────────────────────────────── */
  let rateCaption    = null; // single caption for the "rate" tab
  let rateImage      = null;
  let likedCaptions  = [];   // array for "liked" tab
  let dislikedCaptions = []; // array for "disliked" tab
  let likedImages    = new Map();
  let dislikedImages = new Map();
  let feedError      = null;

  if (tab === "rate") {
    // Find one caption the user has NOT yet voted on, ordered randomly
    // Strategy: get the IDs the user has already voted on, then exclude them.
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
              <div className="rate-card">
                {/* Image */}
                <div className="rate-image-wrap">
                  {resolveImageUrl(rateImage) ? (
                    <img
                      className="rate-image"
                      src={resolveImageUrl(rateImage)}
                      alt={rateCaption.content || "Caption image"}
                    />
                  ) : (
                    <div className="rate-image--placeholder">No image</div>
                  )}
                </div>

                {/* Caption */}
                <p className="rate-caption-text">{rateCaption.content}</p>

                {/* Vote buttons */}
                <form className="rate-vote-form" action={submitCaptionVote}>
                  <input type="hidden" name="caption_id" value={rateCaption.id} />
                  <input type="hidden" name="redirect_to" value="/?tab=rate" />
                  <button
                    className="rate-vote-btn rate-vote-btn--up"
                    type="submit"
                    name="vote"
                    value="up"
                    aria-label="Upvote this caption"
                  >
                    👍
                  </button>
                  <button
                    className="rate-vote-btn rate-vote-btn--down"
                    type="submit"
                    name="vote"
                    value="down"
                    aria-label="Downvote this caption"
                  >
                    👎
                  </button>
                </form>
              </div>
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
                        {imgUrl ? (
                          <img className="caption-image" src={imgUrl} alt={caption.content} loading="lazy" />
                        ) : (
                          <div className="caption-image--placeholder">No image</div>
                        )}
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
                        {imgUrl ? (
                          <img className="caption-image" src={imgUrl} alt={caption.content} loading="lazy" />
                        ) : (
                          <div className="caption-image--placeholder">No image</div>
                        )}
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

        </main>
      </div>
    </div>
  );
}
