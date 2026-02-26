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

// Index of the active step (0-based) for the stepper UI
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

export default function UploadImage() {
  const [step, setStep]           = useState(S.IDLE);
  const [error, setError]         = useState(null);
  const [preview, setPreview]     = useState(null);
  const [captions, setCaptions]   = useState([]);
  const [resultImage, setResultImage] = useState(null);
  const [isDragging, setIsDragging]   = useState(false);
  const fileInputRef = useRef(null);

  const reset = () => {
    setStep(S.IDLE);
    setError(null);
    setPreview(null);
    setCaptions([]);
    setResultImage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const runPipeline = useCallback(async (file) => {
    setError(null);
    setCaptions([]);
    setResultImage(null);
    setPreview(URL.createObjectURL(file));

    try {
      // ── Step 1: Presign ────────────────────────────────────────────────
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

      // ── Step 2: Upload directly to S3 ─────────────────────────────────
      setStep(S.UPLOADING);
      const uploadRes = await fetch(presignedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!uploadRes.ok) throw new Error(`Upload failed (${uploadRes.status} ${uploadRes.statusText})`);

      // ── Step 3: Register with pipeline ────────────────────────────────
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

      // ── Step 4: Generate captions ──────────────────────────────────────
      setStep(S.CAPTIONING);
      const captionRes  = await fetch("/api/captions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_id: imageId }),
      });
      const captionData = await captionRes.json();
      if (!captionRes.ok) throw new Error(captionData.error || "Failed to generate captions");

      const rawCaptions = Array.isArray(captionData) ? captionData : [];
      setCaptions(
        rawCaptions.map((c, i) => ({
          id: c.id ?? i,
          content: typeof c === "string" ? c : c.content || c.caption || c.text || JSON.stringify(c),
        }))
      );
      setStep(S.DONE);
    } catch (err) {
      console.error("[UploadImage]", err);
      setError(err.message || "An unexpected error occurred");
      setStep(S.ERROR);
    }
  }, []);

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
      {/* Card header */}
      <div className="upload-card-header">
        <h2 className="upload-card-title">Generate Captions</h2>
      </div>

      <div className="upload-card-body">
        {/* ── Drop zone ──────────────────────────────────────────────────── */}
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
                <span className="dropzone-label">
                  Drop image or <span>browse</span>
                </span>
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
                  <div className="stepper-dot">
                    {isDone ? "✓" : i + 1}
                  </div>
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
            <button className="btn btn-ghost btn-sm" onClick={reset}>
              Try again
            </button>
          </div>
        )}

        {/* ── Results ────────────────────────────────────────────────────── */}
        {step === S.DONE && (
          <div className="upload-results">
            {/* Uploaded image */}
            {resultImage && (
              <div className="upload-result-img-wrap">
                <img className="upload-result-img" src={resultImage} alt="Uploaded image" />
              </div>
            )}

            {/* Caption list */}
            <p className="upload-result-label">
              {captions.length > 0
                ? `${captions.length} caption${captions.length !== 1 ? "s" : ""} generated`
                : "No captions returned"}
            </p>

            {captions.length > 0 && (
              <ol className="upload-captions-list" aria-label="Generated captions">
                {captions.map((c, i) => (
                  <li key={c.id} className="upload-caption-item">
                    <span className="upload-caption-num">{i + 1}</span>
                    <span>{c.content}</span>
                  </li>
                ))}
              </ol>
            )}

            <button className="btn btn-ghost btn-sm" onClick={reset}>
              ↑ Upload another
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
