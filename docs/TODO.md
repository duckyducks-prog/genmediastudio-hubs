# GenMedia Frontend TODO

## Phase 1: Documentation & Technical Architecture
- [ ] **Architecture Diagram** - Document current vs proposed company infrastructure
  - Current: Leticia's GCP (Cloud Run frontend/backend, Firebase auth)
  - Proposed: compmany infrastructure (GCP account, auth strategy)
  - Include data flows, external dependencies, API integrations
- [ ] **Technical Requirements Documentation**
  - Video processing concerns & GPU requirements
  - Rate limiting implementation
  - Latency optimization opportunities
  - Spend control mechanisms

## Phase 2: Immediate Development Workflow (Priority)
- [x] **Frontend Deployment** - Test restructured code in Cloud Run ✅
- [ ] **Backend CORS Update** - Add frontend refactor URL to allowed origins
  ```
  https://genmedia-frontend-refactor-856765593724.us-central1.run.app
  ```
- [ ] **End-to-end Testing** - Verify all API calls work with deployed frontend
- [ ] **Firebase Console** - Add new domain to authorized domains ✅
- [ ] **Merge to Main** - Get clean base for continued development

## Phase 3: Code Quality & Organization
- [ ] **Frontend Refactor** + comprehensive testing
- [ ] **Backend Refactor** + comprehensive testing  
- [ ] **Tech Debt Resolution**:
  - Resolve conflicting deployment files
  - Standardize patterns across codebase
  - Add proper error handling
  - Address large bundle warning (1.5MB main chunk)
  - Review Firebase imports (mixed static/dynamic imports warning)

## Phase 4: Security & Deployment Strategy (company Compliance)
- [ ] **Repository Migration** - Move to company GitHub Enterprise
- [ ] **GCP Account Migration** - Move to company-owned GCP account
- [ ] **Environment Strategy Overhaul**:
  - Implement proper dev/staging/prod environment separation
  - Move secrets to GCP Secret Manager (or company standard)
  - Standardize environment variable naming across frontend/backend
  - Create environment-specific service accounts
  - Implement infrastructure as code (Terraform/Pulumi)
  - Add environment validation scripts
- [ ] **Secret Management** - Implement GCP Secret Manager
- [ ] **Authentication Migration** - Firebase → Okta with IAP
- [ ] **Security Hardening**:
  - Create new API keys for exposed secrets
  - Comprehensive security audit
  - Branch protection & CI/CD setup

## Phase 5: Performance & Production Readiness
- [ ] **Frontend Hosting Decision** - Firebase Hosting vs Cloud Run evaluation
- [ ] **Video Processing Optimization**:
  - NVIDIA GPU evaluation for video processing
  - Parallelize workflow nodes (currently sequential)  
  - Evaluate PIXI.js vs WebGL performance
- [ ] **Performance Optimization**:
  - Latency reduction opportunities
  - Fix script looping issues
  - Bundle size optimization

## Deployment Strategy Decision (Current)
- [ ] **Decision**: Cloud Run (current) vs Firebase Hosting for frontend
  - Current: Express server in Cloud Run container (working build ✅)
  - Alternative: Firebase Hosting for static React SPA (simpler, cheaper)
  - Note: Frontend server only does SPA serving + asset proxy routes - all video processing in Python backend
  - Question: Deploy current Cloud Run setup first to test E2E, or skip straight to Firebase Hosting migration?

## Immediate Technical Blockers
- [ ] Get environment variables/secrets from Leticia
- [ ] Test backend API connectivity with new frontend URL
- [ ] Resolve Firebase authentication domain issue ✅

---

## Feature Backlog

Ideas and improvements to consider in future iterations. Not prioritized — just captured so they don't get lost.

### Burn Captions node
- [ ] **RTL auto-detection** — Detect Hebrew/Arabic/Farsi in the Whisper transcript and wrap ASS lines with U+202B/U+202C before writing the subtitle file. Zero impact on existing English workflows (threshold: >30% RTL chars). Safe, no UI change needed.

### Element Studio / Character chips
- [ ] **Wardrobe style variants** — After saving a character, offer "Create wardrobe styles for [name]". Two creation modes: (1) prompt-based ("athletic look, casual look" → generate shots using character's 6 reference images + wardrobe prompt), (2) reference-image-based (upload wardrobe photos → generate character wearing that outfit). Data model: add `parent_element_id` to SceneElement; style variants are child elements linked to their base character. Character chip catalog shows base chip + expandable style sub-chips.
- [ ] **Location Studio** — Same 3-phase creation flow as Character Studio (upload base image → auto-generate 6 standardized shots → approval grid → save). Apply after character creation is proven.
- [ ] **Prop Studio** — Same pattern as Location. Lower priority.

### Prompt / chip system
- [ ] **Full @chip tokenization** — Replace the current text-injection approach (chips append text to the prompt field) with real @-mention chip tokens in the ChipTextarea. Chips would be rendered as pill tokens inside the textarea, removable with ×, and serialized separately from the plain text prompt. Requires a custom contenteditable or token-input component. Currently deferred because the text-injection approach works adequately.
- [ ] **Video chip support** — Character/location chips injecting reference images into GenerateVideoNode (first-frame flow). Currently chips only inject refs into GenerateImageNode. Needs design for how video uses reference images differently from image generation.

### Workflow canvas
- [ ] **Group Nodes ("Compound nodes")** — The `_createCompoundFromSelection` function exists in WorkflowCanvas.tsx but is not exposed in the UI. When ready, wire it to the bulk-selection context menu as "Group nodes". Selecting 2+ nodes and grouping them creates a reusable compound node with exposed input/output handles.

### Moodboard node
- [ ] **Moodboard → Generate connection** — Allow a Moodboard node's output (array of image URLs) to connect directly to GenerateImageNode's `reference_images` input handle. Currently the node exists and aggregates images, but the downstream injection into generation hasn't been validated end-to-end.

---

## Premiere Export — Known remaining issues

### Watermark PNG (Video Compositing node)
- [ ] PNG imports as "unlinked media" in Premiere despite being present in the ZIP with the correct `.png` extension and `<stillframe>TRUE</stillframe>` in the XML. The FCP7 file element structure for still images may still have a compatibility issue with Premiere's importer. Needs testing with a minimal FCP7 XML containing only a still image reference to isolate the exact format Premiere expects.

### Burn Captions SRT
- [ ] SRT file not appearing in the ZIP. The backend correctly generates `srt_data` and the frontend executor stores it as `srtData` on the node. Diagnostic logging has been added to the export endpoint — check backend terminal after exporting to see `has_srt=True/False` for the BurnCaptions node. Most likely cause: BurnCaptions node was run before the backend change that added `srt_data` to `BurnCaptionsResponse` — re-running the node after a backend restart should fix it. If `has_srt=False` persists after re-run, the node state is not persisting `srtData` correctly and needs further investigation.
