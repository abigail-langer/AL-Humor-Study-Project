"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { recordVote } from "./actions";

export default function UploadCaptionVote({ captionId, initialVote }) {
  const [vote, setVote] = useState(initialVote); // null | "up" | "down"
  const [pending, setPending] = useState(false);
  const router = useRouter();

  const handleVote = async (direction) => {
    if (pending) return;
    setPending(true);
    setVote(direction); // optimistic update
    const fd = new FormData();
    fd.set("caption_id", String(captionId));
    fd.set("vote", direction);
    await recordVote(fd);
    router.refresh();
    setPending(false);
  };

  return (
    <div className="upload-caption-vote">
      <button
        className={[
          "upload-vote-btn",
          "upload-vote-btn--up",
          vote === "up" ? "upload-vote-btn--active-up" : "",
        ].filter(Boolean).join(" ")}
        type="button"
        onClick={() => handleVote("up")}
        disabled={pending}
        aria-label="Upvote this caption"
        aria-pressed={vote === "up"}
      >
        👍
      </button>
      <button
        className={[
          "upload-vote-btn",
          "upload-vote-btn--down",
          vote === "down" ? "upload-vote-btn--active-down" : "",
        ].filter(Boolean).join(" ")}
        type="button"
        onClick={() => handleVote("down")}
        disabled={pending}
        aria-label="Downvote this caption"
        aria-pressed={vote === "down"}
      >
        👎
      </button>
    </div>
  );
}
