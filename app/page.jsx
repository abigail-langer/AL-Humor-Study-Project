import Link from "next/link";
import CaptionSort from "./CaptionSort";
import SignInButton from "./SignInButton";
import SignOutButton from "./SignOutButton";
import { submitCaptionVote } from "./actions";
import { createSupabaseServerClient } from "../lib/supabaseServer";

const PAGE_SIZE = 12;

export default async function Home({ searchParams }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userEmail = user?.email ?? null;
  const currentSort = searchParams?.sort || "recent";
  const currentPage = Math.max(
    1,
    Number.parseInt(searchParams?.page, 10) || 1
  );
  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  if (!user) {
    return (
      <main className="page">
        <div className="page-header">
          <h1 className="page-title">Captions</h1>
        </div>
        <div className="gate-card">
          <p className="gate-text">
            Sign in with Google to view and sort captions.
          </p>
          <SignInButton />
        </div>
      </main>
    );
  }

  let query = supabase
    .from("captions")
    .select(
      `
        id,
        content,
        like_count,
        image_id,
        image:images (*)
      `,
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
  const captionIds = (captions ?? []).map((caption) => caption.id);
  let voteByCaptionId = new Map();

  if (captionIds.length > 0) {
    const { data: existingVotes } = await supabase
      .from("caption_votes")
      .select("caption_id, vote_value")
      .eq("profile_id", user.id)
      .in("caption_id", captionIds);

    voteByCaptionId = new Map(
      (existingVotes ?? []).map((vote) => [vote.caption_id, vote.vote_value])
    );
  }

  const resolveImageUrl = (image) =>
    image?.url ||
    image?.image_url ||
    image?.public_url ||
    image?.file_url ||
    image?.storage_url ||
    image?.storage_path ||
    null;

  const totalPages = count ? Math.max(1, Math.ceil(count / PAGE_SIZE)) : 1;
  const prevPage = currentPage > 1 ? currentPage - 1 : null;
  const nextPage =
    count && currentPage < totalPages ? currentPage + 1 : null;
  const sortParam =
    currentSort && currentSort !== "recent" ? `&sort=${currentSort}` : "";
  const redirectParams = new URLSearchParams();

  Object.entries(searchParams ?? {}).forEach(([key, value]) => {
    if (typeof value === "string") {
      redirectParams.set(key, value);
    } else if (Array.isArray(value) && value.length > 0) {
      redirectParams.set(key, value[0]);
    }
  });

  const redirectTo = redirectParams.toString()
    ? `/?${redirectParams.toString()}`
    : "/";

  return (
    <main className="page">
      <div className="page-header">
        <h1 className="page-title">Captions</h1>
        <div className="page-actions">
          <CaptionSort value={currentSort} />
          {userEmail ? <span className="user-email">{userEmail}</span> : null}
          <SignOutButton />
        </div>
      </div>
      {error ? (
        <p className="caption">Failed to load captions: {error.message}</p>
      ) : captions && captions.length > 0 ? (
        <div className="caption-section">
          <div className="caption-grid" role="list">
            {captions.map((caption) => {
              const imageUrl = resolveImageUrl(caption.image);
              const voteValue = voteByCaptionId.get(caption.id);
              const hasUpvoted = voteValue === 1;
              const hasDownvoted = voteValue === -1;

              return (
                <article
                  className="caption-card"
                  key={caption.id}
                  role="listitem"
                >
                  {imageUrl ? (
                    <img
                      className="caption-image"
                      src={imageUrl}
                      alt={caption.content || "Caption image"}
                      loading="lazy"
                    />
                  ) : (
                    <div className="caption-image caption-image--placeholder">
                      <span>No image</span>
                    </div>
                  )}

                  <div className="caption-body">
                    <p className="caption-text">
                      {caption.content || "Untitled caption"}
                    </p>
                    <div className="caption-meta">
                      <span className="caption-like">
                        Likes: {caption.like_count ?? 0}
                      </span>
                      <form className="vote-form" action={submitCaptionVote}>
                        <input
                          type="hidden"
                          name="caption_id"
                          value={caption.id}
                        />
                        <input
                          type="hidden"
                          name="redirect_to"
                          value={redirectTo}
                        />
                        <button
                          className={`vote-button ${hasUpvoted ? "vote-button--active-up" : ""}`}
                          type="submit"
                          name="vote"
                          value="up"
                          aria-pressed={hasUpvoted}
                          disabled={hasUpvoted}
                        >
                          Upvote
                        </button>
                        <button
                          className={`vote-button vote-button--down ${hasDownvoted ? "vote-button--active-down" : ""}`}
                          type="submit"
                          name="vote"
                          value="down"
                          aria-pressed={hasDownvoted}
                          disabled={hasDownvoted}
                        >
                          Downvote
                        </button>
                      </form>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="pagination">
            <Link
              className={`page-link ${!prevPage ? "is-disabled" : ""}`}
              href={prevPage ? `/?page=${prevPage}${sortParam}` : "#"}
              aria-disabled={!prevPage}
              tabIndex={!prevPage ? -1 : 0}
            >
              Previous
            </Link>
            <span className="page-status">
              Page {currentPage} of {totalPages}
            </span>
            <Link
              className={`page-link ${!nextPage ? "is-disabled" : ""}`}
              href={nextPage ? `/?page=${nextPage}${sortParam}` : "#"}
              aria-disabled={!nextPage}
              tabIndex={!nextPage ? -1 : 0}
            >
              Next
            </Link>
          </div>
        </div>
      ) : (
        <p className="caption">No captions found.</p>
      )}
    </main>
  );
}
