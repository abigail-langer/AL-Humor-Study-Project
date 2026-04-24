"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { recordVote } from "./actions";

// Exit animation duration — keep in sync with the CSS keyframe duration
const EXIT_MS = 420;

export default function RateCard({ caption, imageUrl }) {
  const [phase, setPhase] = useState("idle"); // "idle" | "exit-up" | "exit-down"
  const [voteError, setVoteError] = useState(null);
  const formRef = useRef(null);
  const router = useRouter();

  const handleVote = async (direction) => {
    if (phase !== "idle") return;
    setVoteError(null);

    // Kick off the exit animation immediately
    setPhase(direction === "up" ? "exit-up" : "exit-down");

    // Record the vote in parallel with the animation
    const fd = new FormData(formRef.current);
    fd.set("vote", direction);
    const [_anim, result] = await Promise.all([
      new Promise((r) => setTimeout(r, EXIT_MS)),
      recordVote(fd),
    ]);

    if (result?.error) {
      // Vote failed — reset so the user can try again
      setPhase("idle");
      setVoteError("Could not save your vote. Please try again.");
      return;
    }

    // Refresh server component data → next caption loads with enter animation
    router.refresh();
  };

  const isExiting = phase !== "idle";

  return (
    <div className={`rate-card rate-card--${phase}`} style={{ position: "relative" }}>
      {/* Vote error */}
      {voteError && (
        <div className="feed-error" role="alert" style={{ marginBottom: "0.75rem" }}>
          {voteError}
        </div>
      )}

      {/* Vote confirmation overlay */}
      {isExiting && (
        <div
          className={`rate-vote-overlay rate-vote-overlay--${phase === "exit-up" ? "up" : "down"}`}
          aria-hidden="true"
        >
          {phase === "exit-up" ? "👍" : "👎"}
        </div>
      )}

      <div className="rate-image-wrap">
        {imageUrl ? (
          <img
            className="rate-image"
            src={imageUrl}
            alt={caption.content || "Caption image"}
          />
        ) : (
          <div className="rate-image--placeholder">No image</div>
        )}
      </div>

      <p className="rate-caption-text">{caption.content}</p>

      <form ref={formRef} className="rate-vote-form">
        <input type="hidden" name="caption_id" value={caption.id} />
        <input type="hidden" name="redirect_to" value="/?tab=rate" />
        <button
          className="rate-vote-btn rate-vote-btn--up"
          type="button"
          onClick={() => handleVote("up")}
          disabled={isExiting}
          aria-label="Upvote this caption"
        >
          👍
        </button>
        <button
          className="rate-vote-btn rate-vote-btn--down"
          type="button"
          onClick={() => handleVote("down")}
          disabled={isExiting}
          aria-label="Downvote this caption"
        >
          👎
        </button>
      </form>
    </div>
  );
}
