# AlmostCrackd — Test Plan

## Application Tree

```
AlmostCrackd
├── Authentication
│   ├── Unauthenticated landing page
│   ├── Google OAuth sign-in flow
│   ├── /auth/callback — code exchange
│   │   ├── Valid code → session set, redirect to /
│   │   ├── Missing code → redirect to /
│   │   └── Missing env vars → redirect to /
│   ├── Middleware session refresh (every request)
│   └── Sign-out → clear session, redirect to /
│
├── Main Page (authenticated, tab-based routing)
│   ├── Unknown ?tab= value → defaults to "rate" tab
│   ├── Rate Tab (?tab=rate)
│   │   ├── Unvoted captions exist → show RateCard
│   │   │   ├── Upvote → animation, save vote, load next
│   │   │   │   ├── Vote succeeds → router.refresh()
│   │   │   │   └── Vote fails → reset to idle, show error
│   │   │   ├── Downvote → animation, save vote, load next
│   │   │   │   ├── Vote succeeds → router.refresh()
│   │   │   │   └── Vote fails → reset to idle, show error
│   │   │   └── Double-click guard (phase !== "idle" returns early)
│   │   ├── No unvoted captions → "You've rated everything!" empty state
│   │   └── DB error → feedError banner
│   │
│   ├── Liked Tab (?tab=liked)
│   │   ├── Has liked captions → caption grid with images, like counts, "Liked" badge
│   │   ├── Caption missing image → "No image" placeholder
│   │   ├── No liked captions → empty state message
│   │   └── DB error → feedError banner
│   │
│   ├── Disliked Tab (?tab=disliked)
│   │   ├── Has disliked captions → caption grid with "Disliked" badge
│   │   ├── Caption missing image → "No image" placeholder
│   │   ├── No disliked captions → empty state message
│   │   └── DB error → feedError banner
│   │
│   └── My Uploads Tab (?tab=uploads)
│       ├── Has uploads
│       │   ├── Image has captions → numbered list with vote buttons
│       │   │   ├── Upvote (no prior vote) → optimistic "up", persist to DB
│       │   │   ├── Downvote (no prior vote) → optimistic "down", persist to DB
│       │   │   ├── Change vote → update DB row (duplicate key → UPDATE)
│       │   │   └── Vote fails → roll back optimistic state
│       │   └── Image has no captions → "No captions yet"
│       ├── No uploads → empty state message
│       └── DB error → feedError banner
│
├── Image Upload Pipeline (sidebar, always visible)
│   ├── Idle state → drop zone with placeholder
│   ├── File selection
│   │   ├── Supported type (JPEG/PNG/WebP/GIF/HEIC) → run pipeline
│   │   └── Unsupported type → error state + "Try again" button
│   ├── Step 1: Presign
│   │   ├── Success → presignedUrl + cdnUrl returned
│   │   └── Failure → error state + "Try again" button
│   ├── Step 2: S3 Upload
│   │   ├── Success → proceed to register
│   │   └── Failure (non-2xx) → error state
│   ├── Step 3: Register
│   │   ├── Success → imageId returned
│   │   └── Failure → error state
│   ├── Step 4: Caption Generation
│   │   ├── Success + captions → show numbered caption list
│   │   ├── Success + empty array → "No captions returned"
│   │   └── Failure → error state
│   ├── Done state → uploaded image preview + captions + "Upload another" button
│   └── Drag-and-drop → same pipeline as file-input
│
├── API Routes
│   ├── POST /api/presign
│   │   ├── No session → 401 Unauthorized
│   │   ├── Invalid JSON → 400 Invalid JSON body
│   │   ├── Missing/unsupported content_type → 400 with list of valid types
│   │   ├── Upstream error → proxied status + error message
│   │   └── Success → { presignedUrl, cdnUrl }
│   │
│   ├── POST /api/register
│   │   ├── No session → 401 Unauthorized
│   │   ├── Invalid JSON → 400 Invalid JSON body
│   │   ├── Missing image_url → 400
│   │   ├── Upstream error → proxied status + error message
│   │   └── Success → { imageId, now }
│   │
│   └── POST /api/captions
│       ├── No session → 401 Unauthorized
│       ├── Invalid JSON → 400 Invalid JSON body
│       ├── Missing image_id → 400
│       ├── Upstream error → proxied status + error message
│       └── Success → caption records array
│
└── Server Actions (actions.js)
    ├── recordVote
    │   ├── Unauthenticated → { error: "Not authenticated" }
    │   ├── Invalid captionId or vote → { error: "Invalid input" }
    │   ├── First vote → INSERT succeeds → { ok: true }
    │   ├── Duplicate vote → INSERT 23505 → UPDATE → { ok: true }
    │   └── DB error → { error: message }
    │
    └── submitCaptionVote
        ├── Unauthenticated → redirect to redirect_to
        ├── Invalid redirect_to (open-redirect attempt) → normalized to "/"
        ├── Invalid captionId or vote → redirect without DB write
        ├── First vote → INSERT, revalidatePath("/"), redirect
        ├── Duplicate vote → INSERT 23505 → UPDATE, redirect
        └── DB error → logged, redirect still fires
```

---

## Test Cases by Branch

### Branch 1: Authentication

| # | Scenario | Expected |
|---|----------|----------|
| A-1 | Visit `/` without session | Landing page with "Sign in with Google" button only |
| A-2 | Click "Sign in with Google" | Redirect to Google OAuth consent screen |
| A-3 | Complete OAuth → `/auth/callback?code=<valid>` | Session cookie set, redirect to `/` (authenticated) |
| A-4 | Visit `/auth/callback` with no `code` param | Redirect to `/` (no session, back to landing) |
| A-5 | Visit `/auth/callback` with expired/reused code | Redirect to `/` (silently fails, user sees landing) |
| A-6 | Missing `NEXT_PUBLIC_SUPABASE_URL` env var | Middleware no-ops; callback redirects to `/` |
| A-7 | Click "Sign out" | Session cleared, `window.location` → `/` (landing page) |
| A-8 | Authenticated user visits `/` | Full app rendered; user email shown in navbar |

### Branch 2: Rate Tab

| # | Scenario | Expected |
|---|----------|----------|
| R-1 | Unvoted captions in DB | RateCard rendered with image and caption text |
| R-2 | No image for caption | Grey "No image" placeholder in card |
| R-3 | Click 👍 | Exit-up animation; vote saved; next caption loads |
| R-4 | Click 👎 | Exit-down animation; vote saved; next caption loads |
| R-5 | Vote fails (network error) | Card resets to idle; error message shown |
| R-6 | Double-click vote button | Second click ignored while phase !== "idle" |
| R-7 | All captions rated | "🎉 You've rated everything!" empty state |
| R-8 | DB error fetching captions | feedError banner: "Failed to load: <message>" |

### Branch 3: Liked Tab

| # | Scenario | Expected |
|---|----------|----------|
| L-1 | User has liked captions | Grid of cards, each with image, text, ♥ count, "👍 Liked" badge |
| L-2 | Liked caption has no image | "No image" placeholder card |
| L-3 | No liked captions | "No liked captions yet — start rating on the Rate tab!" |
| L-4 | DB error | feedError banner |

### Branch 4: Disliked Tab

| # | Scenario | Expected |
|---|----------|----------|
| D-1 | User has disliked captions | Grid with "👎 Disliked" badge |
| D-2 | No disliked captions | "No disliked captions yet." |
| D-3 | DB error | feedError banner |

### Branch 5: My Uploads Tab

| # | Scenario | Expected |
|---|----------|----------|
| U-1 | User has uploaded images with captions | Each image shown with numbered caption list + vote buttons |
| U-2 | Caption has a prior vote | Vote button pre-highlighted (initialVote passed from server) |
| U-3 | Upvote a caption | Optimistic "up" state; DB persisted; no page reload |
| U-4 | Downvote a caption | Optimistic "down" state; DB persisted; no page reload |
| U-5 | Change vote (already voted) | Sends new direction; server UPDATE; optimistic state matches |
| U-6 | Vote fails | Optimistic state rolls back to previous value |
| U-7 | Image has no captions | "No captions yet" shown |
| U-8 | No uploaded images | "No uploads yet — use the panel on the left…" |
| U-9 | DB error on images query | feedError banner |

### Branch 6: Image Upload Pipeline

| # | Scenario | Expected |
|---|----------|----------|
| P-1 | Idle state | Drop zone with "Drop image or browse" placeholder |
| P-2 | Click drop zone → file picker opens | File input triggered |
| P-3 | Keyboard Enter/Space on drop zone | File input triggered |
| P-4 | Drag valid image onto drop zone | `dropzone--drag` class applied; file processed on drop |
| P-5 | DragLeave without drop | `dropzone--drag` class removed |
| P-6 | Select JPEG file | Pipeline runs; stepper shows 4 steps |
| P-7 | Select PNG file | Same as P-6 |
| P-8 | Select WebP file | Same as P-6 |
| P-9 | Select GIF file | Same as P-6 |
| P-10 | Select HEIC file | Same as P-6 |
| P-11 | Select unsupported file (e.g. PDF) | Error state: "Unsupported type…"; "Try again" resets |
| P-12 | Step 1 fails (/api/presign error) | Error state shown; "Try again" resets |
| P-13 | Step 2 fails (S3 PUT non-2xx) | Error state shown |
| P-14 | Step 3 fails (/api/register error) | Error state shown |
| P-15 | Step 4 fails (/api/captions error) | Error state shown |
| P-16 | All steps succeed, captions returned | Done state: image + numbered caption list |
| P-17 | All steps succeed, empty captions | Done state: "No captions returned" |
| P-18 | Click "Upload another" | Reset to idle; drop zone visible again |
| P-19 | Drop zone hidden during processing | `dropzone--busy` state; clicking does nothing |

### Branch 7: API Routes

| # | Scenario | Expected |
|---|----------|----------|
| API-1 | POST /api/presign — no session | 401 `{ error: "Unauthorized" }` |
| API-2 | POST /api/presign — invalid JSON | 400 `{ error: "Invalid JSON body" }` |
| API-3 | POST /api/presign — missing content_type | 400 with supported types list |
| API-4 | POST /api/presign — unsupported content_type | 400 with supported types list |
| API-5 | POST /api/presign — upstream error | Proxied status + error message |
| API-6 | POST /api/presign — success | 200 `{ presignedUrl, cdnUrl }` |
| API-7 | POST /api/register — no session | 401 |
| API-8 | POST /api/register — missing image_url | 400 |
| API-9 | POST /api/register — upstream error | Proxied status |
| API-10 | POST /api/register — success | 200 `{ imageId, now }` |
| API-11 | POST /api/captions — no session | 401 |
| API-12 | POST /api/captions — missing image_id | 400 |
| API-13 | POST /api/captions — upstream error | Proxied status |
| API-14 | POST /api/captions — success | 200 caption array |

### Branch 8: Vote Actions (Server Actions)

| # | Scenario | Expected |
|---|----------|----------|
| VA-1 | `recordVote` — unauthenticated | `{ error: "Not authenticated" }` |
| VA-2 | `recordVote` — empty captionId | `{ error: "Invalid input" }` |
| VA-3 | `recordVote` — invalid vote value | `{ error: "Invalid input" }` |
| VA-4 | `recordVote` — first vote up | INSERT succeeds → `{ ok: true }` |
| VA-5 | `recordVote` — first vote down | INSERT succeeds → `{ ok: true }` |
| VA-6 | `recordVote` — change vote (dup key 23505) | INSERT fails → UPDATE → `{ ok: true }` |
| VA-7 | `recordVote` — DB error | `{ error: message }` |
| VA-8 | `submitCaptionVote` — unauthenticated | `redirect(redirectTo)` |
| VA-9 | `submitCaptionVote` — redirect_to not starting with "/" | Normalized to "/" (open-redirect protection) |
| VA-10 | `submitCaptionVote` — success | `revalidatePath("/")`, `redirect(redirectTo)` |

### Branch 9: URL Routing Edge Cases

| # | Scenario | Expected |
|---|----------|----------|
| RT-1 | `/?tab=rate` | Rate tab active |
| RT-2 | `/?tab=liked` | Liked tab active |
| RT-3 | `/?tab=disliked` | Disliked tab active |
| RT-4 | `/?tab=uploads` | Uploads tab active |
| RT-5 | `/?tab=invalid` | Defaults to Rate tab (no blank screen) |
| RT-6 | `/` (no tab param) | Defaults to Rate tab |

---

## Issues Found & Fixed

See the bottom of this file.
