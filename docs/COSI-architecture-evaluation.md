# COSI Architecture Evaluation — GenMedia Studio Hubs

## Context

This document evaluates the GenMedia Studio Hubs project using the COSI (Communication, Organization, Storage, Implementation) software architecture framework. GenMedia Studio is a visual workflow editor for AI-powered media generation — users build node-based pipelines that chain together image generation, video generation, audio, filters, and text processing.

---

## C — Communication

**Pattern: HTTP Request-Response (REST)**

All communication uses **synchronous REST over HTTPS** with JSON payloads. No WebSockets, SSE, gRPC, or message queues.

### Frontend → Backend
- Native `fetch()` API (no axios)
- Bearer token auth (Firebase ID tokens in `Authorization` header)
- Request tracing via `X-Request-ID` header
- Base URL: configurable via `VITE_API_BASE_URL`, defaults to Cloud Run endpoint

### API Surface

| Category | Endpoints | Method |
|----------|-----------|--------|
| Workflows | CRUD at `/v1/workflows`, clone | GET, POST, PUT, DELETE |
| Assets | Save/list/get/move/delete at `/v1/assets` | GET, POST, PATCH, DELETE |
| Folders | CRUD at `/v1/folders`, ZIP download | GET, POST, PATCH, DELETE |
| Generation | Image, video, text, upscale, music at `/v1/generate/*` | POST, GET |
| ElevenLabs | Voices, voice-change, music at `/v1/elevenlabs/*` | POST |
| Video Processing | Merge, add-music, filters, watermark, segment-replace at `/v1/video/*` | POST |
| Health | `/health`, `/health/live`, `/health/ready` | GET |

### Long-Running Operations
- **Polling pattern**: Video generation returns an `operation_name`, frontend polls `/v1/generate/video/status` until complete
- Max 30 attempts, 10s intervals (~5 min timeout)
- No push-based notifications

### Backend → External Services
- **Google Vertex AI** (Gemini/Veo/Imagen): via `google-genai` SDK + `httpx` async client with connection pooling (20 max connections, 600s timeout)
- **ElevenLabs**: via official SDK + direct HTTP for music composition
- **Firebase Admin**: server-side token verification
- **GCS**: file uploads/downloads via `google-cloud-storage` SDK

### Data Transfer Patterns
- Small media: base64-encoded in JSON body
- Large media: GCS URLs passed by reference
- Folder downloads: `StreamingResponse` with ZIP

### Key Files
- [frontend/src/lib/api-config.ts](frontend/src/lib/api-config.ts) — Centralized endpoint definitions
- [frontend/src/lib/api-helpers.ts](frontend/src/lib/api-helpers.ts) — Fetch helpers with auth
- [frontend/src/components/workflow/executionHelpers.ts](frontend/src/components/workflow/executionHelpers.ts) — `pollVideoStatus()` implementation
- [backend/app/main.py](backend/app/main.py) — FastAPI app, CORS, middleware
- [backend/app/services/generation.py](backend/app/services/generation.py) — External API calls

---

## O — Organization

**Patterns: Client-Server + Pipeline + Layered**

### Client-Server
React SPA (client) and FastAPI (server) are independently deployed and communicate only via REST. No shared code or monorepo coupling beyond the git repository.

### Pipeline (Workflow Execution Engine)
The core product feature is a **dataflow pipeline**:
1. User builds a directed acyclic graph (DAG) of nodes on a visual canvas
2. Nodes are topologically sorted by dependency level
3. Execution proceeds level-by-level; nodes at the same level run in parallel
4. Each node's outputs flow downstream through edges as inputs to connected nodes
5. Filter nodes accumulate a `FilterConfig[]` array that gets applied at render/download time

Node types span: inputs (text, image, video) → modifiers (filters, text ops) → actions (generate image/video/music, LLM) → outputs (preview, download, save)

### Layered Architecture (Backend)

```
Routers (API layer)     — request validation, auth, response formatting
    ↓
Services (Business)     — generation logic, asset management, workflow CRUD
    ↓
Data (Persistence)      — Firestore queries, GCS file operations
```

### Frontend Component Structure

```
Pages (Index.tsx)
  ↓
WorkflowCanvas          — canvas interactions, save/load, node management
  ↓
registry/               — node registration, default data, error boundaries
nodes/                  — 33 individual node UI components
executors/              — per-node execution logic (executor map pattern)
  ↓
useWorkflowExecution    — orchestration: graph traversal, batch mode, abort
executionHelpers        — shared utilities (polling, input gathering, validation)
  ↓
WorkflowContext         — React context with useReducer for nodes/edges state
```

### Key Files
- [frontend/src/components/workflow/WorkflowCanvas.tsx](frontend/src/components/workflow/WorkflowCanvas.tsx) — Canvas UI orchestration
- [frontend/src/components/workflow/useWorkflowExecution.ts](frontend/src/components/workflow/useWorkflowExecution.ts) — Execution engine
- [frontend/src/components/workflow/registry/](frontend/src/components/workflow/registry/) — Node registration system
- [frontend/src/components/workflow/executors/](frontend/src/components/workflow/executors/) — Per-node executor functions
- [frontend/src/contexts/WorkflowContext.tsx](frontend/src/contexts/WorkflowContext.tsx) — State management
- [backend/app/routers/](backend/app/routers/) — API route handlers
- [backend/app/services/](backend/app/services/) — Business logic layer

---

## S — Storage

**Pattern: Document DB (metadata) + Object Store (media) + Client-side caching**

### Firestore (NoSQL Document Database)
Primary metadata store with environment-based namespacing (`dev_` prefix for dev):

| Collection | Key Fields | Indexes |
|------------|-----------|---------|
| `assets` | `id`, `user_id`, `asset_type`, `blob_path`, `mime_type`, `prompt`, `source`, `folder_id`, `created_at` | `user_id`, `asset_type`, `created_at` |
| `workflows` | `id`, `name`, `user_id`, `is_public`, `nodes[]`, `edges[]`, `thumbnail_ref`, `created_at`, `updated_at` | `user_id`, `is_public`, `created_at` |
| `folders` | `id`, `name`, `user_id`, `created_at` | `user_id` |

- Workflow nodes/edges stored inline (< 100KB per document)
- Asset references (`*Ref` fields) resolved to URLs via batch `Firestore.get_all()` on fetch

### Google Cloud Storage (GCS)
Binary media file store:
- Bucket: `genmediastudio-assets`
- Path structure: `users/{user_id}/{asset_type}s/{asset_id}.{ext}`
- Public URLs: `https://storage.googleapis.com/{bucket}/{blob_path}`
- Upload flow: base64 in request body → decode → upload to GCS → store blob_path in Firestore

### Frontend State Layers

| Layer | Technology | Purpose | Persistence |
|-------|-----------|---------|-------------|
| Component state | React useState/useReducer | UI interactions, form inputs | None (session) |
| Workflow state | WorkflowContext (useReducer) | Nodes, edges, viewport, dirty flag | Session + localStorage |
| Server cache | TanStack React Query v5 | API response caching | In-memory with stale-while-revalidate |
| Auto-save | localStorage | Workflow backup | `genmedia-workflow-state` key, debounced 1s |
| Templates | localStorage | Compound node templates | `compound-node-templates` key |

### React Query Cache Configuration
| Query | Stale Time | Cache Time |
|-------|-----------|------------|
| My workflows | 5 min | 30 min |
| Public templates | 10 min | 60 min |
| Individual workflow | 2 min | 30 min |

### Backend Caching
- Service singletons via `@lru_cache` decorators (LibraryService, WorkflowService)
- Shared `httpx.AsyncClient` connection pool (avoids 50-100ms per-request overhead)

### Key Files
- [backend/app/firestore.py](backend/app/firestore.py) — Firestore client, collection naming
- [backend/app/services/library_firestore.py](backend/app/services/library_firestore.py) — Asset CRUD + GCS uploads
- [backend/app/services/workflow_firestore.py](backend/app/services/workflow_firestore.py) — Workflow CRUD + asset ref resolution
- [frontend/src/lib/workflow-queries.ts](frontend/src/lib/workflow-queries.ts) — TanStack Query hooks + cache config
- [frontend/src/lib/firebase.ts](frontend/src/lib/firebase.ts) — Firebase client initialization
- [frontend/src/contexts/WorkflowContext.tsx](frontend/src/contexts/WorkflowContext.tsx) — Workflow state reducer

---

## I — Implementation

**Pattern: Serverless Containers (Google Cloud Run)**

### Deployment Model

| Component | Runtime | Container Base | Port | Scaling |
|-----------|---------|---------------|------|---------|
| Frontend | Node 20 Alpine + Express | Multi-stage Docker | 8080 | 0–10 instances |
| Backend | Python 3.11 slim + Uvicorn | Single-stage Docker | 8080 | Auto-scaled |

### Frontend Container
- **Build**: pnpm install → Vite build with `VITE_*` env vars baked in → production deps only
- **Runtime**: Express serving SPA (`node dist/server/node-build.mjs`)
- **Features**: `dumb-init` for PID 1, non-root user (`nodejs:1001`), healthcheck on `/ping`

### Backend Container
- **Dependencies**: FastAPI, firebase-admin, google-cloud-storage, google-genai, elevenlabs, httpx, ffmpeg (system), cairo libs
- **Package manager**: `uv` (fast, deterministic installs)
- **Runtime**: `uvicorn app.main:app --host 0.0.0.0 --port 8080`

### CI/CD: Google Cloud Build
- Config: [frontend/cloudbuild.yaml](frontend/cloudbuild.yaml)
- Build machine: `E2_HIGHCPU_8`, timeout: 15 min
- Steps: prepare env vars → Docker build with args → push to Artifact Registry → deploy to Cloud Run
- Images: `{region}-docker.pkg.dev/{PROJECT_ID}/{repo}/{service}:{tag}`

### Authentication & Security
- **Firebase Authentication** with Google OAuth (client-side)
- **Firebase Admin SDK** for server-side token verification
- **Access control**: Email whitelist + domain-based restrictions
- **CORS**: Configured per-origin (localhost:3000, localhost:8080, production domains)
- **Rate limiting**: Configurable via `RATE_LIMIT_MAX` env var (default 200)

### Environment Configuration
| Variable | Scope | Purpose |
|----------|-------|---------|
| `VITE_FIREBASE_*` | Build-time | Firebase client config (baked into JS bundle) |
| `VITE_API_BASE_URL` | Build-time | Backend API endpoint |
| `VITE_ALLOWED_EMAILS` | Build-time | Client-side email whitelist |
| `FIRESTORE_ENVIRONMENT` | Runtime | `dev`/`prod` collection namespacing |
| `ALLOWED_EMAILS`, `ALLOWED_DOMAINS` | Runtime | Server-side access control |
| `ADMIN_EMAILS` | Runtime | Admin privilege grants |
| `GCS_BUCKET` | Runtime | Storage bucket name |
| `ELEVENLABS_API_KEY` | Runtime | ElevenLabs API credentials |

### Key Files
- [frontend/Dockerfile](frontend/Dockerfile) — Multi-stage Node build
- [backend/Dockerfile](backend/Dockerfile) — Python + ffmpeg build
- [frontend/cloudbuild.yaml](frontend/cloudbuild.yaml) — CI/CD pipeline
- [backend/app/config.py](backend/app/config.py) — Settings (project_id, buckets, models, allowlists)
- [backend/app/auth.py](backend/app/auth.py) — Token verification + access control

---

## Summary Matrix

| Dimension | Pattern | Technologies |
|-----------|---------|-------------|
| **Communication** | REST Request-Response + Polling | fetch, FastAPI, httpx, Firebase Auth tokens |
| **Organization** | Client-Server + Pipeline + Layered | React SPA, FastAPI, DAG executor, Router→Service→Data |
| **Storage** | Document DB + Object Store + Client Cache | Firestore, GCS, localStorage, TanStack React Query |
| **Implementation** | Serverless Containers | Cloud Run, Cloud Build, Docker, Artifact Registry |
