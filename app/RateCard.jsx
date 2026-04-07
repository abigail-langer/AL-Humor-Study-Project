"use client";

import { useState, useRef } from "react";
import { submitCaptionVote } from "./actions";

// Exit animation duration must match --rate-exit-duration in globals.css
const EXIT_MS = 420;

export default function RateCard({ caption, imageUrl }) {
  const [phase, setPhase] = useState("idle"); // "idle" | "exit-up" | "exit-down"
  const formRef = useRef(null);

  const handleVote = async (direction) => {
    if (phase !== "idle") return;

    setPhase(direction === "up" ? "exit-up" : "exit-down");

    // Let the exit animation play before the server action fires
    await new Promise((r) => setTimeout(r, EXIT_MS));

    const fd = new FormData(formRef.current);
    fd.set("vote", direction);
    await submitCaptionVote(fd);
    // Server action ends with redirect() → Next.js navigates to /?tab=rate
    // which re-renders the page with the next caption (enter animation plays)
  };

  const isExiting = phase !== "idle";

  return (
    <div className={`rate-card rate-card--${phase}`} style={{ position: "relative" }}>
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
