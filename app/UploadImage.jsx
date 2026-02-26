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

const STEPS = {
  IDLE: "idle",
  PRESIGNING: "presigning",
  UPLOADING: "uploading",
  REGISTERING: "registering",
  CAPTIONING: "captioning",
  DONE: "done",
  ERROR: "error",
};

const STEP_LABELS = {
  [STEPS.PRESIGNING]: "Step 1 of 4 — Generating upload URL…",
  [STEPS.UPLOADING]: "Step 2 of 4 — Uploading image…",
  [STEPS.REGISTERING]: "Step 3 of 4 — Registering image…",
  [STEPS.CAPTIONING]: "Step 4 of 4 — Generating captions…",
  [STEPS.DONE]: "Done!",
};

export default function UploadImage() {
  const [step, setStep] = useState(STEPS.IDLE);
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null);
  const [captions, setCaptions] = useState([]);
  const [resultImage, setResultImage] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  const reset = () => {
    setStep(STEPS.IDLE);
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

    // Local preview
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);

    try {
      // ── Step 1: Get presigned upload URL ────────────────────────────────
      setStep(STEPS.PRESIGNING);
      const presignRes = await fetch("/api/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // API expects camelCase contentType
        body: JSON.stringify({ content_type: file.type }),
      });
      const presignData = await presignRes.json();
      if (!presignRes.ok) {
        throw new Error(presignData.error || "Failed to get upload URL");
      }

      // Upstream response shape: { presignedUrl, cdnUrl }
      const { presignedUrl, cdnUrl } = presignData;

      if (!presignedUrl) {
        throw new Error(
          "Presign response missing presignedUrl. Got: " +
            JSON.stringify(presignData)
        );
      }
      if (!cdnUrl) {
        throw new Error(
          "Presign response missing cdnUrl. Got: " +
            JSON.stringify(presignData)
        );
      }

      // ── Step 2: PUT image bytes directly to the presigned S3 URL ────────
      // Do NOT go through api.almostcrackd.ai — PUT straight to presignedUrl.
      // Content-Type must exactly match what was sent in Step 1.
      setStep(STEPS.UPLOADING);
      const uploadRes = await fetch(presignedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!uploadRes.ok) {
        throw new Error(
          `Upload failed (${uploadRes.status} ${uploadRes.statusText})`
        );
      }

      // ── Step 3: Register the CDN URL with the pipeline ───────────────────
      // POST /pipeline/upload-image-from-url { imageUrl, isCommonUse }
      // Response: { imageId, now }
      setStep(STEPS.REGISTERING);
      const registerRes = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: cdnUrl }),
      });
      const registerData = await registerRes.json();
      if (!registerRes.ok) {
        throw new Error(registerData.error || "Failed to register image");
      }

      // Upstream returns { imageId, now } — extract imageId directly
      const { imageId } = registerData;

      if (!imageId) {
        throw new Error(
          "Register response missing imageId. Got: " +
            JSON.stringify(registerData)
        );
      }

      // The CDN URL is the public image URL (already known from Step 1)
      setResultImage(cdnUrl);

      // ── Step 4: Generate captions ─────────────────────────────────────────
      // POST /pipeline/generate-captions { imageId }
      // Response: array of caption records
      setStep(STEPS.CAPTIONING);
      const captionRes = await fetch("/api/captions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_id: imageId }),
      });
      const captionData = await captionRes.json();
      if (!captionRes.ok) {
        throw new Error(captionData.error || "Failed to generate captions");
      }

      // Response is an array of caption records saved by the system
      const rawCaptions = Array.isArray(captionData) ? captionData : [];

      const normalised = rawCaptions.map((c, i) => ({
        id: c.id ?? i,
        content:
          typeof c === "string"
            ? c
            : c.content || c.caption || c.text || JSON.stringify(c),
      }));

      setCaptions(normalised);
      setStep(STEPS.DONE);
    } catch (err) {
      console.error("[UploadImage] pipeline error:", err);
      setError(err.message || "An unexpected error occurred");
      setStep(STEPS.ERROR);
    }
  }, []);

  const handleFile = (file) => {
    if (!file) return;
    if (!SUPPORTED_TYPES.includes(file.type)) {
      setError(
        `Unsupported file type "${file.type}". Please use JPEG, PNG, WebP, GIF, or HEIC.`
      );
      setStep(STEPS.ERROR);
      return;
    }
    runPipeline(file);
  };

  const handleInputChange = (e) => {
    handleFile(e.target.files?.[0]);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    handleFile(e.dataTransfer.files?.[0]);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const isProcessing =
    step === STEPS.PRESIGNING ||
    step === STEPS.UPLOADING ||
    step === STEPS.REGISTERING ||
    step === STEPS.CAPTIONING;

  return (
    <section className="upload-section">
      <h2 className="upload-title">Upload an Image</h2>

      {/* Drop zone */}
      <div
        className={`upload-dropzone${isDragging ? " upload-dropzone--active" : ""}${isProcessing ? " upload-dropzone--busy" : ""}`}
        onClick={() => !isProcessing && fileInputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        role="button"
        tabIndex={isProcessing ? -1 : 0}
        aria-label="Upload image — click or drag and drop"
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !isProcessing) {
            fileInputRef.current?.click();
          }
        }}
      >
        {preview ? (
          <img
            className="upload-preview"
            src={preview}
            alt="Selected image preview"
          />
        ) : (
          <div className="upload-placeholder">
            <span className="upload-icon" aria-hidden="true">🖼️</span>
            <span className="upload-hint">
              Drag &amp; drop or <span className="upload-hint-link">browse</span>
            </span>
            <span className="upload-formats">
              JPEG · PNG · WebP · GIF · HEIC
            </span>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={SUPPORTED_TYPES.join(",")}
        className="upload-input-hidden"
        onChange={handleInputChange}
        disabled={isProcessing}
        aria-hidden="true"
        tabIndex={-1}
      />

      {/* Progress bar + step label */}
      {isProcessing && (
        <div className="upload-progress-wrap" role="status" aria-live="polite">
          <div className="upload-progress-bar">
            <div
              className="upload-progress-fill"
              style={{
                width: `${
                  step === STEPS.PRESIGNING
                    ? 15
                    : step === STEPS.UPLOADING
                      ? 40
                      : step === STEPS.REGISTERING
                        ? 65
                        : 85
                }%`,
              }}
            />
          </div>
          <p className="upload-step-label">{STEP_LABELS[step]}</p>
        </div>
      )}

      {/* Error state */}
      {step === STEPS.ERROR && (
        <div className="upload-error" role="alert">
          <p className="upload-error-msg">⚠️ {error}</p>
          <button className="auth-button auth-button--ghost upload-retry-btn" onClick={reset}>
            Try again
          </button>
        </div>
      )}

      {/* Results */}
      {step === STEPS.DONE && (
        <div className="upload-results">
          <div className="upload-result-header">
            {resultImage && (
              <img
                className="upload-result-thumb"
                src={resultImage}
                alt="Uploaded image"
              />
            )}
            <h3 className="upload-result-title">
              {captions.length > 0
                ? `${captions.length} caption${captions.length !== 1 ? "s" : ""} generated`
                : "No captions returned"}
            </h3>
          </div>

          {captions.length > 0 && (
            <ol className="upload-captions-list">
              {captions.map((c) => (
                <li key={c.id} className="upload-caption-item">
                  {c.content}
                </li>
              ))}
            </ol>
          )}

          <button className="auth-button upload-new-btn" onClick={reset}>
            Upload another image
          </button>
        </div>
      )}
    </section>
  );
}
