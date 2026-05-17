---
name: project-element-studio-image-only
description: Element Studio — character/location/prop must start from reference images, no prompt generation in studio
metadata:
  type: project
---

Character, Location, and Prop elements are image-first: they must be built from reference photos, not AI-generated prompts.

**Why:** The goal is visual consistency — the reference images are ingested every time that element chip is used in a generation. Starting from an uploaded photo ensures the AI anchors to a real-world visual, not a hallucinated one. Generating images inside the studio would defeat that purpose.

**How to apply:**
- `isImageOnly()` in `permissions.ts` returns true for character, location, prop
- `ElementStudioPage` hides the Generate tab entirely for these types (only References tab shown)
- References tab hint text is updated to explain the photo-anchoring purpose
- Camera Angles, Lighting, Style still have both References + Generate tabs

[[project-element-permissions]]
