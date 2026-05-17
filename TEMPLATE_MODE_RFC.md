# Template Mode — Problem Statement & Proposed Plan
*Revised after two rounds of engineering review*

---

## Background

Gimmedia has a node-based workflow builder where users construct complex media generation pipelines (e.g. 35 nodes: scripts, avatars, captions, music, merge). This is a power-user tool.

We want to expose these workflows to a second type of user — a **template user** — who should never see the canvas. They get a clean, full-screen form with only the "variable" inputs visible, fill them in, and get outputs.

The backend workflow execution is unchanged. The difference is purely in the UI surface.

---

## Current State

The following already exists and works:

- **Expose toggle** on Text Input nodes — the workflow author marks which nodes are variable inputs via an eye icon. Each exposed node gets a label (e.g. "Script", "Avatar").
- **`/share/:token` route** — renders `SharedWorkflow.tsx`, a clean full-screen form showing only exposed inputs. No canvas. Supports text and image. Runs the workflow via the backend.
- **Share panel** — workflow author generates a share link and sends it to template users.

This is currently local/test only — no live traffic. Safe to make breaking API changes.

For a **single run with a single variable**, the feature is already built end-to-end.

---

## The Problem

Template users need to produce **multiple outputs in one session** by specifying variations across one or more inputs. Examples:

- Same avatar, 3 different scripts → 3 videos
- Same script, 3 different avatars → 3 videos
- 3 scripts × 3 avatars → 9 videos

The current system only supports one set of inputs → one run → one output.

Additionally, **avatars** will come from a built-in library (not free text), so the input type needs to support selection from a curated set.

---

## Model: Cross-Product Rows

Each exposed field is independent. The user adds as many values ("rows") as they want per field. A field with 1 row is **pinned** (fixed across all runs). A field with N rows **varies**. The output is the cross-product of all field row counts.

**Examples:**

| Script rows | Avatar rows | Output runs |
|-------------|-------------|-------------|
| 3           | 1           | 3           |
| 1           | 3           | 3           |
| 3           | 3           | 9           |
| 2           | 4           | 8           |

The "paired model" (all fields must have same N) was rejected — it forces users to repeat fixed values, which feels broken.

**Terminology:** each value in a field's list is a **row**. Each output is a **result card**.

---

## Proposed Plan

### 1. Input UI — `SharedWorkflow.tsx`

Each exposed field gets its own independent row list:

- Field starts with 1 row (existing textarea / picker) — renders with no list chrome
- **"+ Add row"** button appends a new slot to that field only
- N>1 shows a numbered list of slots; rows can be reordered and deleted
- **Library inputs** (see §2): selecting multiple items in the picker automatically creates one row per selection. User can also add rows manually on top of picker selections.

**Confirmation gate** before submitting: "This will generate N videos — continue?" where N = cross-product of all field row counts (not row slots — a script N=3 × avatar N=3 = 9 runs, which is what the cap applies to).

**Hard cap: 12 output runs per submit** until quota tracking exists. This blocks the submit button and shows a message if the cross-product exceeds 12.

### 2. Input types — "Library Input" abstraction

Avatar is the first of many constrained-choice inputs (voice, music style, aspect ratio, brand presets). Defining a `"library"` type now rather than bolting on `"avatar"`, `"voice"` etc. individually later.

```typescript
type ExposedInputType = "text" | "image" | "video" | "library";

interface ExposedInput {
  node_id: string;
  type: ExposedInputType;
  label: string;
  library_key?: string; // e.g. "avatars", "voices" — scopes which picker to show
}
```

**v1 avatar assumption:** curated set (~10–20), global (not per-workspace), visual + voice bundled as one unit. Selecting an avatar passes an avatar ID into the workflow node which resolves to both likeness and voice.

### 3. API — single shape (no backwards-compat shim)

No existing live traffic, so dropping the old `{ inputs: {} }` path entirely. The new shape handles N=1 trivially (single-item `variations` array).

**Request:**
```json
POST /shared/:token/run
{
  "variations": [
    { "node_script": "Hello world", "node_avatar": "avatar_001" },
    { "node_script": "Another script", "node_avatar": "avatar_001" },
    { "node_script": "Third script", "node_avatar": "avatar_002" }
  ]
}
```

**Streaming via SSE** (see §4). The backend echoes input values in each result event so the frontend can label cards without re-deriving them from variation index:

```
data: {"variation_index": 0, "status": "running"}

data: {"variation_index": 2, "status": "completed", "inputs": {"node_script": "Third script", "node_avatar": "avatar_002"}, "outputs": ["https://...v3.mp4"]}

data: {"variation_index": 1, "status": "failed", "inputs": {"node_script": "Another script", "node_avatar": "avatar_001"}, "error": "Veo timeout"}

data: {"variation_index": 0, "status": "completed", "inputs": {"node_script": "Hello world", "node_avatar": "avatar_001"}, "outputs": ["https://...v1.mp4"]}

data: [DONE]
```

### 4. Execution — SSE + parallel with concurrency cap

**Transport: Server-Sent Events (SSE).** The frontend opens an EventSource connection on submit. The backend emits one event per status change per variation (started, completed, failed), then a final `[DONE]` sentinel.

- Variations run **in parallel**, concurrency cap of **3–5 in flight** server-side
- Results emit as they complete — UI does not wait for all N
- Each result card transitions independently: `pending → running → completed | failed`
- Failed cards show a **"Retry"** button — re-submits just that variation, same inputs
- No all-or-nothing failure

### 5. Output UI — result cards

Each result card shows:
- **Label** derived from echoed input values (e.g. "Script 2 × Avatar 1") — no index math needed
- **Media**: video player or image
- **Download** button
- **Regenerate** button — re-runs the same inputs through the workflow, producing a different output (Veo is non-deterministic). Does **not** open an edit UI for the inputs — that is a separate v2 feature.
- **Share single result** — GCS signed URL is sufficient for v1; no separate route needed

The grid updates progressively. Pending cards show a skeleton + spinner.

---

## What Is Not Changing

- The workflow canvas and node builder — unchanged
- The backend workflow executor — called N times, not modified internally
- The expose/label mechanism — unchanged
- The `/share/:token` route and `SharedWorkflow.tsx` structure — extended, not replaced

---

## Deferred to v2

- **Tab-close / resume**: results are lost if the tab closes mid-batch. Fix: attach a run history to the share token. Schema should leave room for it.
- **Quota tracking**: 12-run cap is the interim guard. Proper per-user credit tracking is separate.
- **User-uploadable avatars**: v1 is curated-only.
- **Input editing on regenerate**: v1 regenerate re-runs same inputs. v2 could let the user tweak one card's inputs before re-running.

---

## Genuinely Open (needs a human decision)

1. **Avatar library ownership** — who maintains the curated set, and in what format/location (GCS manifest, Firestore collection)?
2. **Cross-product cap scaling** — is 12 the right number for video? Should image workflows have a higher cap?
