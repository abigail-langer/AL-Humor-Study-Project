"use client";

import { useState, useRef, useCallback } from "react";

const SUPPORTED_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
];

const S = {
  IDLE:        "idle",
  PRESIGNING:  "presigning",
  UPLOADING:   "uploading",
  REGISTERING: "registering",
  CAPTIONING:  "captioning",
  DONE:        "done",
  ERROR:       "error",
};

const STEP_INDEX = {
  [S.PRESIGNING]:  0,
  [S.UPLOADING]:   1,
  [S.REGISTERING]: 2,
  [S.CAPTIONING]:  3,
};

const STEPS_META = [
  { label: "URL" },
  { label: "Upload" },
  { label: "Register" },
  { label: "Caption" },
];

// ── Inline VoteRow component ───────────────────────────────────────────────
// Handles optimistic up/down votes for a single caption card.
// voteValue:  1 | -1 | null  (current state for this user)
// likeCount:  number
// onVote(dir): "up" | "down" — called when user clicks a button
function VoteRow({ captionId, voteValue, likeCount, onVote, voting }) {
  const hasUp   = voteValue === 1;
  const hasDown = voteValue === -1;

  return (
    <div className="rc-vote-row">
      <span className="rc-like-badge">♥ {likeCount ?? 0}</span>
      <div className="rc-vote-btns">
        <button
          type="button"
          className={["rc-vote-btn", hasUp ? "rc-vote-btn--up-active" : ""].filter(Boolean).join(" ")}
          onClick={() => onVote("up")}
          disabled={voting}
          aria-pressed={hasUp}
          aria-label="Upvote this caption"
        >
          ↑ Up
        </button>
        <button
          type="button"
          className={["rc-vote-btn", hasDown ? "rc-vote-btn--down-active" : ""].filter(Boolean).join(" ")}
          onClick={() => onVote("down")}
          disabled={voting}
          aria-pressed={hasDown}
          aria-label="Downvote this caption"
        >
          ↓ Down
        </button>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function UploadImage() {
  const [step, setStep]               = useState(S.IDLE);
  const [error, setError]             = useState(null);
  const [preview, setPreview]         = useState(null);
  const [captions, setCaptions]       = useState([]);
  const [resultImage, setResultImage] = useState(null);
  const [isDragging, setIsDragging]   = useState(false);

  // votes: Map<captionId, { voteValue: 1|-1|null, likeCount: number, voting: bool }>
  const [votes, setVotes] = useState(new Map());

  const fileInputRef = useRef(null);

  const reset = () => {
    setStep(S.IDLE);
    setError(null);
    setPreview(null);
    setCaptions([]);
    setResultImage(null);
    setVotes(new Map());
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Pipeline ─────────────────────────────────────────────────────────────
  const runPipeline = useCallback(async (file) => {
    setError(null);
    setCaptions([]);
    setResultImage(null);
    setVotes(new Map());
    setPreview(URL.createObjectURL(file));

    try {
      // Step 1: Presign
      setStep(S.PRESIGNING);
      const presignRes  = await fetch("/api/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content_type: file.type }),
      });
      const presignData = await presignRes.json();
      if (!presignRes.ok) throw new Error(presignData.error || "Failed to get upload URL");

      const { presignedUrl, cdnUrl } = presignData;
      if (!presignedUrl) throw new Error("Presign response missing presignedUrl. Got: " + JSON.stringify(presignData));
      if (!cdnUrl)       throw new Error("Presign response missing cdnUrl. Got: "        + JSON.stringify(presignData));

      // Step 2: Upload bytes directly to S3
      setStep(S.UPLOADING);
      const uploadRes = await fetch(presignedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!uploadRes.ok) throw new Error(`Upload failed (${uploadRes.status} ${uploadRes.statusText})`);

      // Step 3: Register with pipeline
      setStep(S.REGISTERING);
      const registerRes  = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: cdnUrl }),
      });
      const registerData = await registerRes.json();
      if (!registerRes.ok) throw new Error(registerData.error || "Failed to register image");

      const { imageId } = registerData;
      if (!imageId) throw new Error("Register response missing imageId. Got: " + JSON.stringify(registerData));
      setResultImage(cdnUrl);

      // Step 4: Generate captions
      setStep(S.CAPTIONING);
      const captionRes  = await fetch("/api/captions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_id: imageId }),
      });
      const captionData = await captionRes.json();
      if (!captionRes.ok) throw new Error(captionData.error || "Failed to generate captions");

      const rawCaptions = Array.isArray(captionData) ? captionData : [];
      const normalised  = rawCaptions.map((c, i) => ({
        id:      c.id ?? i,
        content: typeof c === "string" ? c : c.content || c.caption || c.text || JSON.stringify(c),
        like_count: c.like_count ?? 0,
      }));

      setCaptions(normalised);

      // Seed the vote map from the API response (user's existing votes, if returned)
      const initVotes = new Map();
      normalised.forEach((c) => {
        initVotes.set(c.id, {
          voteValue: c.vote_value ?? null,   // server may or may not send this
          likeCount: c.like_count,
          voting: false,
        });
      });
      setVotes(initVotes);

      setStep(S.DONE);
    } catch (err) {
      console.error("[UploadImage]", err);
      setError(err.message || "An unexpected error occurred");
      setStep(S.ERROR);
    }
  }, []);

  // ── Vote handler ─────────────────────────────────────────────────────────
  const handleVote = useCallback(async (captionId, dir) => {
    const current = votes.get(captionId) ?? { voteValue: null, likeCount: 0, voting: false };
    if (current.voting) return;

    // Clicking the same direction again = remove vote (toggle off)
    const newDir       = current.voteValue === (dir === "up" ? 1 : -1) ? null : dir;
    const newVoteValue = newDir === "up" ? 1 : newDir === "down" ? -1 : null;

    // Optimistic like-count delta
    const oldValue  = current.voteValue ?? 0;
    const nextValue = newVoteValue ?? 0;
    const delta     = nextValue - oldValue;

    // Apply optimistic update immediately
    setVotes((prev) => {
      const next = new Map(prev);
      next.set(captionId, {
        voteValue: newVoteValue,
        likeCount: (current.likeCount ?? 0) + delta,
        voting: true,
      });
      return next;
    });

    try {
      const res  = await fetch("/api/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caption_id: captionId, vote: newDir }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Vote failed");

      // Settle with server-confirmed values
      setVotes((prev) => {
        const next = new Map(prev);
        next.set(captionId, {
          voteValue: data.vote_value,
          likeCount: data.like_count ?? (current.likeCount ?? 0) + delta,
          voting: false,
        });
        return next;
      });
    } catch (err) {
      console.error("[vote]", err);
      // Roll back optimistic update on failure
      setVotes((prev) => {
        const next = new Map(prev);
        next.set(captionId, { ...current, voting: false });
        return next;
      });
    }
  }, [votes]);

  const handleFile = (file) => {
    if (!file) return;
    if (!SUPPORTED_TYPES.includes(file.type)) {
      setError(`Unsupported type "${file.type}". Please use JPEG, PNG, WebP, GIF, or HEIC.`);
      setStep(S.ERROR);
      return;
    }
    runPipeline(file);
  };

  const isProcessing = [S.PRESIGNING, S.UPLOADING, S.REGISTERING, S.CAPTIONING].includes(step);
  const activeIdx    = STEP_INDEX[step] ?? -1;

  return (
    <div className="upload-card">
      <div className="upload-card-header">
        <h2 className="upload-card-title">Generate Captions</h2>
      </div>

      <div className="upload-card-body">

        {/* ── Drop zone (hidden once results are shown) ─────────────────── */}
        {step !== S.DONE && (
          <div
            className={[
              "dropzone",
              isDragging   ? "dropzone--drag" : "",
              isProcessing ? "dropzone--busy" : "",
            ].filter(Boolean).join(" ")}
            role="button"
            tabIndex={isProcessing ? -1 : 0}
            aria-label="Upload image — click or drag and drop"
            onClick={() => !isProcessing && fileInputRef.current?.click()}
            onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !isProcessing) fileInputRef.current?.click(); }}
            onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFile(e.dataTransfer.files?.[0]); }}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
          >
            {preview ? (
              <img className="dropzone-preview" src={preview} alt="Selected preview" />
            ) : (
              <div className="dropzone-placeholder">
                <span className="dropzone-icon" aria-hidden="true">☁️</span>
                <span className="dropzone-label">Drop image or <span>browse</span></span>
                <span className="dropzone-formats">JPEG · PNG · WebP · GIF · HEIC</span>
              </div>
            )}
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept={SUPPORTED_TYPES.join(",")}
          className="file-input-hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
          disabled={isProcessing}
          aria-hidden="true"
          tabIndex={-1}
        />

        {/* ── Stepper ────────────────────────────────────────────────────── */}
        {isProcessing && (
          <div className="stepper" role="status" aria-live="polite" aria-label="Processing pipeline">
            {STEPS_META.map((s, i) => {
              const isDone   = i < activeIdx;
              const isActive = i === activeIdx;
              return (
                <div
                  key={s.label}
                  className={[
                    "stepper-step",
                    isDone   ? "stepper-step--done"   : "",
                    isActive ? "stepper-step--active" : "",
                  ].filter(Boolean).join(" ")}
                >
                  <div className="stepper-dot">{isDone ? "✓" : i + 1}</div>
                  <span className="stepper-label">{s.label}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Error ──────────────────────────────────────────────────────── */}
        {step === S.ERROR && (
          <div className="upload-error-banner" role="alert">
            <p className="upload-error-msg">⚠️ {error}</p>
            <button className="btn btn-ghost btn-sm" onClick={reset}>Try again</button>
          </div>
        )}

        {/* ── Results + voting ───────────────────────────────────────────── */}
        {step === S.DONE && (
          <div className="upload-results">

            {/* Uploaded image thumbnail */}
            {resultImage && (
              <div className="upload-result-img-wrap">
                <img className="upload-result-img" src={resultImage} alt="Uploaded image" />
              </div>
            )}

            <p className="upload-result-label">
              {captions.length > 0
                ? `${captions.length} caption${captions.length !== 1 ? "s" : ""} — vote for your favourite`
                : "No captions returned"}
            </p>

            {captions.length > 0 && (
              <ol className="upload-captions-list" aria-label="Generated captions">
                {captions.map((c, i) => {
                  const v = votes.get(c.id) ?? { voteValue: null, likeCount: c.like_count ?? 0, voting: false };
                  return (
                    <li key={c.id} className="upload-caption-item">
                      <div className="rc-caption-content">
                        <span className="upload-caption-num">{i + 1}</span>
                        <span className="rc-caption-text">{c.content}</span>
                      </div>
                      <VoteRow
                        captionId={c.id}
                        voteValue={v.voteValue}
                        likeCount={v.likeCount}
                        voting={v.voting}
                        onVote={(dir) => handleVote(c.id, dir)}
                      />
                    </li>
                  );
                })}
              </ol>
            )}

            <button className="btn btn-ghost btn-sm" onClick={reset}>↑ Upload another</button>
          </div>
        )}
      </div>
    </div>
  );
}
