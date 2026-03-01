import Link from "next/link";
import CaptionSort from "./CaptionSort";
import SignInButton from "./SignInButton";
import SignOutButton from "./SignOutButton";
import UploadImage from "./UploadImage";
import { submitCaptionVote } from "./actions";
import { createSupabaseServerClient } from "../lib/supabaseServer";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 12;

export default async function Home({ searchParams }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  /* ── Sign-in gate ─────────────────────────────────────────────────────── */
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
              Browse, vote, and sort the community caption feed.
            </p>
            <SignInButton />
          </div>
        </div>
      </div>
    );
  }

  /* ── Data fetching ────────────────────────────────────────────────────── */
  const userEmail = user?.email ?? null;
  const currentSort = searchParams?.sort || "recent";
  const currentPage = Math.max(1, Number.parseInt(searchParams?.page, 10) || 1);
  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from("captions")
    .select(
      // Only request the specific image columns resolveImageUrl actually reads.
      // Selecting image:images (*) pulls every column and triggers statement
      // timeouts on large tables — named columns let Postgres push the projection
      // down to the join so far less data is transferred.
      `id,
       content,
       like_count,
       image_id,
       image:images (
         url,
         image_url,
         public_url,
         file_url,
         storage_url,
         storage_path
       )`,
      { count: "exact" }
    )
    .range(from, to);

  if (currentSort === "likes_desc") {
    query = query
      .order("like_count", { ascending: false })
      .order("created_datetime_utc", { ascending: false });
  } else if (currentSort === "likes_asc") {
    query = query
      .order("like_count", { ascending: true })
      .order("created_datetime_utc", { ascending: false });
  } else {
    query = query.order("created_datetime_utc", { ascending: false });
  }

  const { data: captions, error, count } = await query;

  let voteByCaptionId = new Map();
  const captionIds = (captions ?? []).map((c) => c.id);
  if (captionIds.length > 0) {
    const { data: existingVotes } = await supabase
      .from("caption_votes")
      .select("caption_id, vote_value")
      .eq("profile_id", user.id)
      .in("caption_id", captionIds);
    voteByCaptionId = new Map(
      (existingVotes ?? []).map((v) => [v.caption_id, v.vote_value])
    );
  }

  const resolveImageUrl = (image) =>
    image?.url || image?.image_url || image?.public_url ||
    image?.file_url || image?.storage_url || image?.storage_path || null;

  const totalPages = count ? Math.max(1, Math.ceil(count / PAGE_SIZE)) : 1;
  const prevPage = currentPage > 1 ? currentPage - 1 : null;
  const nextPage = count && currentPage < totalPages ? currentPage + 1 : null;
  const sortParam = currentSort !== "recent" ? `&sort=${currentSort}` : "";

  const redirectParams = new URLSearchParams();
  Object.entries(searchParams ?? {}).forEach(([key, value]) => {
    if (typeof value === "string") redirectParams.set(key, value);
    else if (Array.isArray(value) && value.length > 0) redirectParams.set(key, value[0]);
  });
  const redirectTo = redirectParams.toString() ? `/?${redirectParams.toString()}` : "/";

  /* ── Authenticated shell ──────────────────────────────────────────────── */
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

        {/* ── Left: sticky upload panel ─────────────────────────────────── */}
        <aside className="panel-upload">
          <UploadImage />
        </aside>

        {/* ── Right: caption feed ───────────────────────────────────────── */}
        <main className="panel-feed">
          <div className="feed-header">
            <h2 className="feed-title">Caption Feed</h2>
            <CaptionSort value={currentSort} />
          </div>

          {error ? (
            <div className="feed-error" role="alert">
              Failed to load captions: {error.message}
            </div>
          ) : captions && captions.length > 0 ? (
            <>
              <div className="caption-grid" role="list">
                {captions.map((caption) => {
                  const imageUrl = resolveImageUrl(caption.image);
                  const voteValue = voteByCaptionId.get(caption.id);
                  const hasUpvoted = voteValue === 1;
                  const hasDownvoted = voteValue === -1;

                  return (
                    <article className="caption-card" key={caption.id} role="listitem">
                      {/* Image */}
                      <div className="caption-image-wrap">
                        {imageUrl ? (
                          <img
                            className="caption-image"
                            src={imageUrl}
                            alt={caption.content || "Caption image"}
                            loading="lazy"
                          />
                        ) : (
                          <div className="caption-image--placeholder">
                            No image
                          </div>
                        )}
                      </div>

                      {/* Body */}
                      <div className="caption-body">
                        <p className="caption-text">
                          {caption.content || "Untitled caption"}
                        </p>

                        <div className="caption-footer">
                          <span className="caption-like-badge">
                            ♥ {caption.like_count ?? 0}
                          </span>

                          <form className="vote-form" action={submitCaptionVote}>
                            <input type="hidden" name="caption_id" value={caption.id} />
                            <input type="hidden" name="redirect_to" value={redirectTo} />
                            <button
                              className={`vote-btn ${hasUpvoted ? "vote-btn--up-active" : ""}`}
                              type="submit" name="vote" value="up"
                              aria-pressed={hasUpvoted} disabled={hasUpvoted}
                            >
                              ↑ Up
                            </button>
                            <button
                              className={`vote-btn ${hasDownvoted ? "vote-btn--down-active" : ""}`}
                              type="submit" name="vote" value="down"
                              aria-pressed={hasDownvoted} disabled={hasDownvoted}
                            >
                              ↓ Down
                            </button>
                          </form>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>

              {/* Pagination */}
              <div className="pagination">
                <Link
                  className={`page-btn ${!prevPage ? "page-btn--disabled" : ""}`}
                  href={prevPage ? `/?page=${prevPage}${sortParam}` : "#"}
                  aria-disabled={!prevPage}
                  tabIndex={!prevPage ? -1 : 0}
                >
                  ← Prev
                </Link>
                <span className="page-status">
                  {currentPage} / {totalPages}
                </span>
                <Link
                  className={`page-btn ${!nextPage ? "page-btn--disabled" : ""}`}
                  href={nextPage ? `/?page=${nextPage}${sortParam}` : "#"}
                  aria-disabled={!nextPage}
                  tabIndex={!nextPage ? -1 : 0}
                >
                  Next →
                </Link>
              </div>
            </>
          ) : (
            <div className="feed-empty" role="status">
              No captions yet — upload an image to generate the first ones!
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
