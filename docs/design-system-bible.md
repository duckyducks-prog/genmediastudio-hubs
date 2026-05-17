# Gen Media Studio — Design System Bible

A complete reference for building the Gen Media Studio interface. Read this once to absorb the system. Reference it endlessly while building. Send it to every new engineer.

This document is the source of truth. If something in code conflicts with this, the code is wrong.

---

## Table of contents

**Part 1 — Philosophy and principles**
1.1 What this product is
1.2 Why design quality matters here
1.3 The four foundational principles
1.4 Design vocabulary

**Part 2 — Foundations**
2.1 Color tokens (dark theme)
2.2 Color tokens (light theme)
2.3 Typography
2.4 Spacing and layout
2.5 Border radii
2.6 Motion and easing

**Part 3 — The elevation system**
3.1 Elevation = Function (the core rule)
3.2 Raised surfaces (pressable)
3.3 Indented surfaces (receives input)
3.4 Flat surfaces (informational)
3.5 The shadow recipes

**Part 4 — Surface patterns**
4.1 When to use a modal
4.2 When to use a side panel
4.3 When to use an inline popover
4.4 When to use an inline morph
4.5 The backdrop treatment system

**Part 5 — Reusable components**
5.1 Button — primary (soft sage)
5.2 Button — ghost (outline)
5.3 Toggle (with size variants)
5.4 Tab pill (segmented selector)
5.5 Chip popover
5.6 Input field (text input)
5.7 Text area (multi-line)
5.8 Card picker (radio group with cards)
5.9 Card (asset, workflow, folder)
5.10 Icon menu (overflow popover)
5.11 Count pill
5.12 Toast
5.13 Empty state
5.14 AI tag
5.15 Confirm modal
5.16 Side panel shell
5.17 Modal shell

**Part 6 — Microcopy and language**
6.1 Tone of voice
6.2 Button labels
6.3 Empty states
6.4 Error and warning copy
6.5 Forbidden phrases

**Part 7 — Accessibility**
7.1 Keyboard navigation
7.2 Screen reader support
7.3 Reduced motion
7.4 Color contrast
7.5 Focus indicators

**Part 8 — Implementation guidance**
8.1 CSS variable architecture
8.2 Component library structure
8.3 The "before you build" checklist
8.4 Common mistakes to avoid

**Part 9 — Decisions log**
9.1 Why dark mode is the default
9.2 Why pink is rare
9.3 Why we use CSS-only thumbnails
9.4 Why we don't use Material Design
9.5 Why neumorphism (carefully)

---

# Part 1 — Philosophy and principles

## 1.1 What this product is

Gen Media Studio is a node-based AI workflow tool for creatives at HubSpot. Users build complex content pipelines that combine generative AI services (Veo, Midjourney, ElevenLabs, etc.) into reusable workflows, then turn those workflows into simple apps for non-technical recipients.

It is an internal tool, but it serves creatives — filmmakers, designers, copywriters — who spend their days inside professional creative software (Adobe Premiere, DaVinci Resolve, Figma, Photoshop). Their baseline expectation for software quality is high.

**The product is for them. The design must rise to their standard.**

## 1.2 Why design quality matters here

For a tool used by creatives, the interface itself sets the emotional ceiling of the work made inside it. A clunky tool produces clunky output. A considered tool produces considered output. This isn't aesthetics — it's psychology.

The animating ambition of this design system is best summarized as: **"B2B that feels like A24."**

Most enterprise software is built for "completion of tasks." This one is built to *inspire* — every micro-interaction should make the user feel like a craftsperson, not a worker.

Concrete consequences of this ambition:
- Every element earns its existence — no decorative noise
- The interface respects the user's intelligence — no over-explanation
- Small details (timings, easing, microcopy, sound) get the same care as big features
- Defaults are opinionated — the system makes choices so the user doesn't have to

## 1.3 The four foundational principles

Every design decision in this system traces back to one of these four principles. When in doubt, return to them.

### Principle 1: Elevation = Function

Surfaces tell the user what they can do without words. Raised = pressable. Indented = receives input. Flat = informational. Once these conventions are established, the user's hand intuitively knows where to go without having to read.

**This is the most important rule in the system.** A violation anywhere breaks the language everywhere.

### Principle 2: Defaults are opinionated

The app makes choices on the user's behalf where it can — about color, motion, layout — so the user can focus on their creative work, not on configuration. Settings are minimal. Defaults are intentional.

Concrete examples:
- Dark mode is the default (light is an opt-out)
- Workflow auto-saves silently — no save button hunting
- AI drafts names and descriptions so users don't face blank fields
- The dot grid is on by default — users opt out, not in

### Principle 3: Restraint over decoration

Every element on screen earns its existence. We don't add visual interest "to liven things up." We trust the design — when something is intentionally quiet, it has authority.

This means:
- We have ONE accent color (sage) used for everything actionable
- Pink is used only for *rare emphasis* — never decoratively
- Drop shadows have purpose (elevation) — they're not vibes
- Icons are flat unless they're inside a pressable surface

### Principle 4: Time matters as much as space

The static design is half the design. Timing, easing, and motion communicate as much as layout. Every animation has a duration and a curve documented here — they're not "felt out" per component. Consistency in motion creates the sense that the same intelligence designed every part of the app.

## 1.4 Design vocabulary

Terms used throughout this document:

- **Surface** — any UI element with its own visual treatment (a card, a button, a panel)
- **Elevation** — a surface's z-axis position, expressed via shadow treatment
- **Token** — a design value stored as a CSS variable (color, size, duration, easing)
- **Treatment** — a complete visual style applied to a surface (raised, indented, flat)
- **Component** — a reusable UI piece with documented props (`<Toggle>`, `<Modal>`)
- **Pattern** — a recurring composition of components (a side panel, a card grid)
- **Microcopy** — small text in the UI (button labels, hints, empty states)
- **Moment** — an emotionally significant interaction (sign-in, generate-and-wait, completion)

---

# Part 2 — Foundations

## 2.1 Color tokens (dark theme — default)

```css
:root,
:root[data-theme="dark"] {
  /* Background layers, darkest to lightest */
  --bg-canvas:   #010F11;  /* The deepest layer — workflow canvas, modal/page backgrounds */
  --bg-surface:  #021A1D;  /* Side panels, dropdowns, dialogs */
  --bg-element:  #042729;  /* Raised cards, active buttons, elevated content */

  /* Accents */
  --accent-primary:  #B9CDBE;  /* Sage. The ONLY actionable color. Used everywhere. */
  --accent-emphasis: #FCC3DC;  /* Pink. Rare emphasis only — AI moments, admin features. */
  --accent-danger:   #FF4800;  /* Orange. Destructive actions only. */

  /* Text hierarchy */
  --text-primary:   #F8F5EE;  /* Cream. Headings, primary body text. */
  --text-secondary: #D6C2D9;  /* Lavender-gray. Secondary labels, less important text. */
  --text-muted:     #A8C0C0;  /* Cool gray. Disabled-feeling labels, ghost button text. */
  --text-hint:      #7A8E90;  /* Darker cool gray. Hints, descriptions, captions. */

  /* Borders and dividers */
  --border-subtle: rgba(185, 205, 190, 0.06);  /* Hairline on cards */
  --border-medium: rgba(185, 205, 190, 0.12);  /* Active expanded states */
  --border-strong: rgba(185, 205, 190, 0.30);  /* Focus rings, hover states */

  /* Shadow recipes (see Section 3.5) */
  --shadow-raised-soft:   -1.5px -1.5px 4px rgba(30, 100, 105, 0.4), 1.5px 1.5px 5px rgba(0, 0, 0, 0.55);
  --shadow-raised-medium: -2.5px -2.5px 6px rgba(30, 100, 105, 0.4), 2.5px 2.5px 7px rgba(0, 0, 0, 0.6);
  --shadow-raised-strong: -5px -5px 12px rgba(30, 100, 105, 0.4), 5px 5px 14px rgba(0, 0, 0, 0.7);
  --shadow-indented:      inset 1.5px 1.5px 4px rgba(0, 0, 0, 0.55), inset -1.5px -1.5px 4px rgba(30, 100, 105, 0.18);
}
```

### Why these colors

**Sage (`#B9CDBE`)** is the actionable color across the entire app. Calm, grounded, slightly cool — it doesn't scream for attention but it's visible. We use it for everything pressable, every active state, every primary action.

**Pink (`#FCC3DC`)** is the rare emphasis color. It appears in genuinely special moments only:
- The "AI" tag on AI-drafted fields
- The "ADMIN" badge on admin-only features
- The "Unsaved changes" dot on the Make Into App panel
- Special generation node accents

When pink appears, it means *"pay attention — this is unusual."* If we use it for decoration, that signal degrades.

**Orange (`#FF4800`)** is for destructive actions only. Delete confirmations, revoke buttons, "remove from app" affordances. Never used for emphasis, never used decoratively.

**Cream (`#F8F5EE`)** is the brightest color in the design. Used for primary text, the handle of on-state toggles, and anywhere we need maximum readability against dark backgrounds.

## 2.2 Color tokens (light theme — opt-in alternative)

The light theme is intentionally NOT a simple inversion. It uses sage as the canvas itself, with teal-tinted darker surfaces — a designed light theme, not a corporate-software light theme.

```css
:root[data-theme="light"] {
  /* Background layers */
  --bg-canvas:   #B9CDBE;  /* Sage canvas — distinctive, not white */
  --bg-surface:  #C8D8CD;  /* Slightly lighter sage for panels */
  --bg-element:  #D4E1D9;  /* Lifted surfaces */

  /* Accents */
  --accent-primary:  #042729;  /* Deep teal — the actionable color */
  --accent-emphasis: #8B2C5A;  /* Darker pink — rare emphasis */
  --accent-danger:   #C53A00;  /* Burnt orange — destructive */

  /* Text */
  --text-primary:   #021A1D;  /* Near-black with teal tint */
  --text-secondary: #2D3F44;
  --text-muted:     #4F6166;
  --text-hint:      #6B7E81;

  /* Borders */
  --border-subtle: rgba(4, 39, 41, 0.10);
  --border-medium: rgba(4, 39, 41, 0.18);
  --border-strong: rgba(4, 39, 41, 0.35);

  /* Shadows — softer in light mode */
  --shadow-raised-soft:   -1.5px -1.5px 4px rgba(255, 255, 255, 0.5), 1.5px 1.5px 5px rgba(4, 39, 41, 0.12);
  --shadow-raised-medium: -2.5px -2.5px 6px rgba(255, 255, 255, 0.5), 2.5px 2.5px 7px rgba(4, 39, 41, 0.15);
  --shadow-raised-strong: -5px -5px 12px rgba(255, 255, 255, 0.5), 5px 5px 14px rgba(4, 39, 41, 0.18);
  --shadow-indented:      inset 1.5px 1.5px 4px rgba(4, 39, 41, 0.12), inset -1.5px -1.5px 4px rgba(255, 255, 255, 0.5);
}
```

### Why light theme is not white

A pure white interface would feel generic and unrelated to the dark theme's identity. By using sage as the canvas, the light theme maintains the brand identity — it's the same world, just illuminated. Teal as the accent (instead of sage) gives sufficient contrast against the sage canvas.

**The light theme is treated as the "exception" version.** Most users will stay in dark. We design dark first, light second.

## 2.3 Typography

The app uses the system's UI font stack (Inter, SF Pro, Segoe UI, system-ui). No web fonts — they introduce latency and the system fonts handle every weight we need.

```css
:root {
  --font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', system-ui, sans-serif;
  --font-family-mono: 'SF Mono', 'Monaco', 'Cascadia Mono', monospace;
}
```

### Type scale

| Token | Size | Use case |
|---|---|---|
| `--text-9` | 9px | Tiny meta (date stamps, counts in pills) |
| `--text-10` | 10px | Section labels, helper text, micro-meta |
| `--text-11` | 11px | Card meta, descriptions, settings labels |
| `--text-12` | 12px | Body text, button labels, input text |
| `--text-13` | 13px | Modal input text, primary button labels |
| `--text-14` | 14px | Modal titles |
| `--text-15` | 15px | Panel titles |
| `--text-16` | 16px | Page titles (rare — most surfaces don't have one) |

### Weights

We use only two weights: **400 (regular)** and **500 (medium)**. No bold.

- 400 — body text, descriptions, hints
- 500 — labels, titles, button text, anything that needs structural emphasis

Why no bold: 500 is enough emphasis at our sizes. Bold (700) would shout. Medium reads as "this matters" without being loud.

### Letter spacing

| Use case | Letter-spacing |
|---|---|
| Section labels (uppercase) | `0.12em` |
| Tiny meta (uppercase) | `0.10em` |
| Button labels | `0.04em` |
| Body text | `0` (default) |
| Titles | `-0.005em` (tightened slightly for visual density) |

### Line height

| Context | Line-height |
|---|---|
| UI labels and buttons | `1.0` (single line) |
| Body text and descriptions | `1.4` to `1.5` |
| Multi-line input fields | `1.45` |

## 2.4 Spacing and layout

We use a 4-pixel base scale. Most spacing is one of:

| Token | Value | Common use |
|---|---|---|
| `--space-1` | 4px | Tight component-internal spacing |
| `--space-2` | 8px | Standard tight gap |
| `--space-3` | 12px | Default gap between related items |
| `--space-4` | 16px | Gap between sections within a surface |
| `--space-5` | 20px | Panel padding |
| `--space-6` | 24px | Modal padding |
| `--space-8` | 32px | Empty-state padding |

### Surface widths (locked)

| Surface | Width |
|---|---|
| Settings panel | 420px |
| Asset Library panel | 580px |
| Make Into App panel | 440px |
| Workflows (Load) panel | 440px |
| Save Workflow modal | 400px |
| Confirm modals | 360px |

Don't deviate without explicit reason. Width discipline keeps surfaces feeling related across the app.

## 2.5 Border radii

| Token | Value | Use case |
|---|---|---|
| `--radius-sm` | 4-5px | Tiny icon buttons, micro-elements |
| `--radius-md` | 6-8px | Standard buttons, input fields |
| `--radius-lg` | 9-10px | Cards, input rows, callout surfaces |
| `--radius-xl` | 14px | Panels, modals, large containers |
| `--radius-full` | 999px | Pills, segmented selectors, toggles |

## 2.6 Motion and easing

Motion is half the design. Every animation in the app uses one of these timings.

```css
:root {
  /* Durations */
  --motion-instant: 0ms;       /* Reduced motion override */
  --motion-fast: 120ms;        /* Hover transitions, button feedback */
  --motion-medium: 200ms;      /* Toggles, micro-state changes */
  --motion-slow: 250ms;        /* Backdrop fades, dropdown open */
  --motion-deliberate: 280ms;  /* Side panel slide-in */

  /* Easing curves */
  --ease-out: ease-out;                              /* Default for state changes */
  --ease-in: ease-in;                                /* Default for exits */
  --ease-spring: cubic-bezier(0.16, 1, 0.3, 1);     /* The "alive" curve — slides, expands, important transitions */
}
```

### When to use which curve

- **`--ease-out`** for color changes, opacity transitions, hovers — anything that should feel responsive but unremarkable
- **`--ease-spring`** for movement — slides, expands, slide-outs. This curve gives motion a slight "settled" quality at the end, like the surface is finding its rest
- **`--ease-in`** for exits — fading out, sliding away

### Reduced motion

Everything respects `prefers-reduced-motion`:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0ms !important;
    transition-duration: 0ms !important;
  }
}
```

Plus the in-app "Reduce motion" toggle in Settings, which adds `data-reduced-motion="true"` to the root and CSS responds accordingly.

---

# Part 3 — The elevation system

## 3.1 Elevation = Function (the core rule)

The most important rule in the design system. Surfaces communicate function through their elevation treatment:

- **Raised** (positive shadow, lifted off the page) = **pressable**
- **Indented** (negative shadow, recessed into the page) = **receives input**
- **Flat** (no shadow) = **informational**

The user can scan any screen and instantly know what's interactive without reading a single word. This is the language of the entire interface.

**Once this rule is broken, the language degrades everywhere.** A decorative raised shadow on something non-interactive ruins the convention for every actual button. Be ruthless about this.

## 3.2 Raised surfaces (pressable)

A raised surface has shadow on its bottom-right (positive depth) and a soft highlight on its top-left (positive light). The eye reads this as "lifted off the page" — and the brain reads "lifted off the page" as "you can press this."

**Always raised:**
- All buttons (primary, secondary, ghost)
- Active state of toggles (the handle)
- Active state of segmented selectors (the selected option)
- Active state of card pickers (the selected card)
- Modal and panel surfaces themselves
- Cards (asset cards, workflow cards, folder rows)
- Nav bar icons (when they represent open panels)

**Hover behavior:**
Raised surfaces typically intensify their shadow on hover (subtle lift) and add a sage outline ring (1px). This signals "ready to receive your click."

```css
.raised-element:hover {
  box-shadow:
    -2px -2px 5px rgba(30, 100, 105, 0.5),
     2px  2px 6px rgba(0, 0, 0, 0.65),
     0 0 0 1px rgba(185, 205, 190, 0.3);
  transform: translateY(-1px);
}
```

## 3.3 Indented surfaces (receives input)

An indented surface has shadow on its top-left (negative depth) and a soft highlight on its bottom-right (negative light). The eye reads this as "recessed into the page" — and the brain reads "recessed into the page" as "you can put something here."

**Always indented:**
- Text input fields
- Text area fields
- Toggle grooves
- Segmented pill grooves
- Search bars
- URL display fields (the share link display)
- Any field that receives text or selection

**Hover/focus behavior:**
Indented surfaces don't lift on hover — that would contradict their function. On focus, they get a sage outline ring around the entire input to signal active editing:

```css
.indented-input:focus {
  box-shadow:
    inset 1.5px 1.5px 4px rgba(0, 0, 0, 0.55),
    inset -1.5px -1.5px 4px rgba(30, 100, 105, 0.18),
    0 0 0 1.5px rgba(185, 205, 190, 0.4);
}
```

## 3.4 Flat surfaces (informational)

A flat surface has no shadow at all — just color and content. The eye reads this as "this is on the page" — and the brain reads "this is on the page" as "this is information, not an action."

**Always flat:**
- Section labels ("APPEARANCE", "GENERATION", etc.)
- Hint text and descriptions
- Decorative icons (header icons, type icons, status indicators)
- Section dividers (hairline)
- Tooltips
- Inactive cards (in a picker before selection)
- The dashed-border "+ New workflow" tile

Flat does not mean invisible or unimportant. The settings gear icon next to "Settings" in the panel header is flat — and it's an essential visual anchor. But the icon doesn't pretend to be a button.

## 3.5 The shadow recipes

Locked-in shadow values for each elevation level. Don't compose your own — use these.

### Raised (soft) — small UI elements

```css
box-shadow:
  -1.5px -1.5px 4px rgba(30, 100, 105, 0.4),
   1.5px  1.5px 5px rgba(0, 0, 0, 0.55);
```

Used for: small icon buttons, close buttons, tab pill active states (small versions).

### Raised (medium) — standard UI elements

```css
box-shadow:
  -2.5px -2.5px 6px rgba(30, 100, 105, 0.4),
   2.5px  2.5px 7px rgba(0, 0, 0, 0.6);
```

Used for: primary buttons, card hover states, active card pickers, expanded node rows.

### Raised (strong) — major surfaces

```css
box-shadow:
  -5px -5px 12px rgba(30, 100, 105, 0.4),
   5px  5px 14px rgba(0, 0, 0, 0.7),
   0 0 0 1px rgba(185, 205, 190, 0.06);
```

Used for: side panels, modals, top-level containers. The hairline outline at the end gives a crisp edge against the canvas.

### Indented

```css
box-shadow:
  inset 1.5px 1.5px 4px rgba(0, 0, 0, 0.55),
  inset -1.5px -1.5px 4px rgba(30, 100, 105, 0.18);
```

Used for: input fields, toggle grooves, pill grooves, URL displays, anywhere that receives input.

### Indented (deep) — for emphasis

```css
box-shadow:
  inset 1.5px 1.5px 4px rgba(0, 0, 0, 0.6),
  inset -1.5px -1.5px 4px rgba(30, 100, 105, 0.18),
  inset 0 0 0 1px rgba(185, 205, 190, 0.05);
```

Used for: the toggle groove on the "on" state (where the recess is more pronounced because the surface above it is now bright sage).

---

# Part 4 — Surface patterns

## 4.1 When to use a modal

A modal interrupts the user's work to demand a decision. It's appropriate when:

- The decision is brief (under 3 fields, or a single confirmation)
- The action is destructive and irreversible
- The user must address it before continuing
- The user does NOT need to see the canvas during the task

**Examples:**
- Save Workflow modal (single name field + optional admin toggle)
- Delete confirmations
- "Save before loading?" prompt for Untitled workflows

**Width:** typically 360-400px.

**Backdrop:** heavy treatment (see Section 4.5).

## 4.2 When to use a side panel

A side panel lets the user configure or browse while keeping the canvas visible. It's appropriate when:

- The user is doing extensive configuration (Settings, Make Into App)
- The user is browsing a collection (Asset Library, Workflows)
- The action is reversible (the user can close without consequence)
- The user benefits from seeing the canvas alongside the panel

**Examples:**
- Settings panel
- Asset Library panel
- Make Into App panel
- Workflows (Load) panel

**Width:** locked per surface — Settings 420px, Asset Library 580px, Make Into App 440px, Workflows 440px.

**Backdrop:** subtle "lifted lens" treatment (see Section 4.5).

## 4.3 When to use an inline popover

An inline popover is a small overlay anchored to a specific control, used for quick choices.

It's appropriate when:
- The choice is one option from ≤8
- The user is editing a specific control's value
- The overlay should "feel attached" to its trigger

**Examples:**
- Chip popovers on the Generate page (aspect ratio, variations, folder picker)
- Overflow menus on cards (Workflow options, folder options)

Popovers anchor to their trigger and dismiss on click-outside.

## 4.4 When to use an inline morph

An inline morph transforms an element in-place rather than overlaying anything. It's appropriate when:

- The user is editing a field that's already visible (rename a folder)
- The change is brief (≤1 field)
- An overlay would be heavier than the action deserves

**Examples:**
- Renaming a folder in the Asset Library sidebar
- Renaming a workflow card name
- Renaming a share link

The element becomes editable in place. Press Enter to commit, Escape to cancel.

## 4.5 The backdrop treatment system

When a modal or side panel opens, the content behind it is blurred and dimmed. **Modals and side panels use intentionally different backdrop treatments.**

### Side panel backdrop — subtle (lifted lens)

```
Blur:        5px
Dim:         rgba(1, 15, 17, 0.12)    ← 12% canvas dim
Vignette:    sage edge glow at the panel boundary
Fade-in:     250ms ease-out
```

The canvas should still feel *present* behind the panel. The user is configuring or browsing, but their work is still there. The backdrop says "your work is paused, not hidden."

```css
.side-panel-backdrop {
  position: fixed;
  inset: 0;
  backdrop-filter: blur(5px);
  -webkit-backdrop-filter: blur(5px);
  background: rgba(1, 15, 17, 0.12);
  opacity: 0;
  transition: opacity 250ms ease-out;
}

.side-panel-vignette {
  position: fixed;
  inset: 0;
  right: var(--panel-width);
  background: linear-gradient(90deg,
    transparent 85%,
    rgba(30, 100, 105, 0.1) 100%);
  pointer-events: none;
}
```

### Modal backdrop — heavier (attention focus)

```
Blur:        6px
Dim:         rgba(1, 15, 17, 0.55)    ← 55% canvas dim
Vignette:    none
Fade-in:     200ms ease-out
```

The canvas should feel *paused and pushed back*. The user has a single thing to address. The backdrop says "stop and address this — then you can return."

```css
.modal-backdrop {
  position: fixed;
  inset: 0;
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  background: rgba(1, 15, 17, 0.55);
  opacity: 0;
  transition: opacity 200ms ease-out;
}
```

### Z-index stack

```
Side panel backdrop:   100
Side panel vignette:   101
Side panel:            102

Modal backdrop:        200
Modal:                 201
```

Modals always sit above side panels. If both are open (rare — e.g., delete confirmation while in Asset Library), the modal stack appears correctly.

### Click-to-close

- Clicking the backdrop closes the surface
- For destructive modals, backdrop click is treated as Cancel (never as confirm)

### Fallback for browsers without `backdrop-filter`

```css
@supports not (backdrop-filter: blur(5px)) {
  .side-panel-backdrop { background: rgba(1, 15, 17, 0.25); }
  .modal-backdrop { background: rgba(1, 15, 17, 0.7); }
}
```

Heavier dim compensates for missing blur. Graceful degradation.

---

# Part 5 — Reusable components

Every reusable component in the system, with full CSS and rationale.

## 5.1 Button — primary (soft sage)

The primary action on any surface. Soft-tinted sage fill with sage border — present and clear without shouting.

```css
.btn-primary {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 16px;
  background: rgba(185, 205, 190, 0.14);
  border: 1px solid rgba(185, 205, 190, 0.3);
  color: var(--accent-primary);
  border-radius: 10px;
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition: background var(--motion-fast) var(--ease-out),
              border-color var(--motion-fast) var(--ease-out);
  box-shadow: 0 0 0 1px rgba(185, 205, 190, 0.05);
}

.btn-primary:hover:not(:disabled) {
  background: rgba(185, 205, 190, 0.22);
  border-color: rgba(185, 205, 190, 0.5);
}

.btn-primary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-primary i { font-size: 13px; }
```

### Variants

- **Large** — 12px padding, used for surface-level primary CTAs (Make into app, Save)
- **Medium** (default) — 10px padding, used for inline actions
- **Pill** — `border-radius: 999px`, used for modal action buttons (Cancel/Save)

### When to use

- Top-level CTAs on a surface (one per surface)
- Form submission buttons
- Primary actions in modals

### When NOT to use

- Multiple primary buttons on one surface — pick one
- Destructive actions (use confirmation modal pattern with orange accent inside)

## 5.2 Button — ghost (outline)

A secondary action that needs to be present but visually subordinate to a primary CTA.

```css
.btn-ghost {
  background: transparent;
  border: 1px solid rgba(168, 192, 192, 0.18);
  color: var(--text-muted);
  padding: 7px 16px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition: color var(--motion-fast) var(--ease-out),
              border-color var(--motion-fast) var(--ease-out);
}

.btn-ghost:hover:not(:disabled) {
  color: var(--text-secondary);
  border-color: rgba(168, 192, 192, 0.3);
}
```

### When to use

- Cancel buttons in modals (paired with primary Save/Confirm)
- Preview button paired with primary CTA (Make Into App)
- "Discard" actions paired with a save action

## 5.3 Toggle (with size variants)

The canonical boolean control. Indented groove + raised handle. Different colors and positions for on/off.

```css
.toggle {
  position: relative;
  width: 36px;
  height: 20px;
  background: var(--bg-canvas);
  border-radius: 999px;
  cursor: pointer;
  flex-shrink: 0;
  border: none;
  padding: 0;
  box-shadow:
    inset 1.5px 1.5px 3px rgba(0, 0, 0, 0.6),
    inset -1.5px -1.5px 3px rgba(30, 100, 105, 0.18);
  transition: background var(--motion-medium) var(--ease-out),
              box-shadow var(--motion-medium) var(--ease-out);
}

.toggle::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  background: #5A6E70;
  border-radius: 50%;
  box-shadow:
    -1px -1px 2px rgba(30, 100, 105, 0.4),
     1px  1px 2px rgba(0, 0, 0, 0.6);
  transition: left var(--motion-medium) var(--ease-spring),
              background var(--motion-medium) var(--ease-out);
}

.toggle.on {
  background: var(--accent-primary);
  box-shadow:
    inset 1.5px 1.5px 3px rgba(80, 110, 95, 0.5),
    inset -1.5px -1.5px 3px rgba(220, 235, 220, 0.4),
    0 0 0 1px rgba(185, 205, 190, 0.3);
}

.toggle.on::after {
  left: 18px;
  background: var(--text-primary);
}
```

### Size variants

| Variant | Track | Handle |
|---|---|---|
| `size="sm"` | 28×16 | 12×12 |
| `size="md"` (default) | 36×20 | 16×16 |

Small variant used inside dense lists (e.g., the Make Into App panel's exposed-input toggles, the Save modal's admin template toggle). Medium variant used for Settings-level toggles.

### Why this design

The on state uses FOUR cumulative signals so the state is unmistakable:
1. Groove fills with sage
2. Handle becomes cream (the brightest color in the system)
3. Subtle outline ring around the toggle
4. Handle slides to the right

Any one of these would be enough. All four together leave zero ambiguity.

## 5.4 Tab pill (segmented selector)

A horizontal selector with multiple mutually-exclusive options. Used everywhere we need "pick one of N."

```css
.tab-pill {
  display: inline-flex;
  background: var(--bg-canvas);
  border-radius: 999px;
  padding: 3px;
  box-shadow:
    inset 1.5px 1.5px 4px rgba(0, 0, 0, 0.5),
    inset -1.5px -1.5px 4px rgba(30, 100, 105, 0.22);
}

.tab-opt {
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-muted);
  background: transparent;
  border: none;
  cursor: pointer;
  font-family: inherit;
  display: flex;
  align-items: center;
  gap: 5px;
  transition: color var(--motion-fast) var(--ease-out);
}

.tab-opt:hover:not(.active) {
  color: var(--text-secondary);
}

.tab-opt.active {
  background: var(--bg-element);
  color: var(--accent-primary);
  box-shadow:
    -2px -2px 5px rgba(30, 100, 105, 0.45),
     2px  2px 6px rgba(0, 0, 0, 0.65);
}
```

### Usage

The groove is **indented** (receives selection). The active option is **raised** (the selected pressable). Inactive options are flat.

Common uses:
- All / Images / Videos filter (Asset Library, Generate page)
- My workflows / Templates (Load Workflow panel)
- Light / Dark (when more than two theme options needed — currently we use a single toggle)

## 5.5 Chip popover

A small popover anchored to a clickable chip control. Used for quick value pickers on the Generate page.

Three variants:
- **Visual grid** — aspect ratio picker with proportional thumbnails
- **Mini-grid** — variations picker
- **Folder picker** — folders with 2x2 preview thumbnails

See the chip popover handoff for full implementation details. Key constraints:

- Anchor to trigger (positioned above the chip)
- 200ms slide-up + fade-in
- Dismiss on click-outside or selection
- Active option uses raised sage treatment
- Inactive options flat

## 5.6 Input field (text input)

Single-line text input with indented groove + focus ring.

```css
.input-field {
  width: 100%;
  background: var(--bg-canvas);
  border: none;
  outline: none;
  color: var(--text-primary);
  font-size: 12px;
  font-family: inherit;
  padding: 9px 11px;
  border-radius: 8px;
  box-shadow: var(--shadow-indented);
  transition: box-shadow var(--motion-fast) var(--ease-out);
}

.input-field::placeholder {
  color: #5A6E70;
}

.input-field:focus {
  box-shadow:
    inset 1.5px 1.5px 4px rgba(0, 0, 0, 0.55),
    inset -1.5px -1.5px 4px rgba(30, 100, 105, 0.18),
    0 0 0 1.5px rgba(185, 205, 190, 0.4);
}
```

### Variants

- **Inline** — used inside expanded rows (Make Into App config fields). Smaller padding.
- **Standard** (above) — used in modals and form sections.
- **Larger** — 10-12px padding, used in modal-level fields (Save Workflow name).

## 5.7 Text area (multi-line)

Same treatment as input field but multi-line:

```css
.text-area {
  /* Same as .input-field */
  resize: vertical;
  min-height: 60px;
  line-height: 1.45;
}
```

## 5.8 Card picker (radio group with cards)

A radio group where each option is a card with title + description.

```css
.card-picker {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.picker-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 11px 13px;
  border-radius: 9px;
  background: transparent;
  border: 1px solid rgba(185, 205, 190, 0.08);
  cursor: pointer;
  transition: border-color var(--motion-fast) var(--ease-out),
              background var(--motion-fast) var(--ease-out);
}

.picker-card:hover:not(.active) {
  background: rgba(185, 205, 190, 0.04);
  border-color: rgba(185, 205, 190, 0.15);
}

.picker-card.active {
  background: var(--bg-element);
  border-color: var(--border-strong);
  box-shadow: var(--shadow-raised-medium);
}

.picker-card-radio {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1.5px solid var(--border-strong);
  flex-shrink: 0;
  margin-top: 2px;
  position: relative;
}

.picker-card.active .picker-card-radio::after {
  content: '';
  position: absolute;
  inset: 3px;
  background: var(--accent-primary);
  border-radius: 50%;
  animation: scale-in 150ms var(--ease-spring);
}
```

### Usage

Used for "pick one with explanation" choices:
- Default model tier (Explore vs Project)
- Run mode (Sequential vs Parallel)

Active card is raised (the selected pressable element). Inactive cards are flat with subtle hairline border.

## 5.9 Card (asset, workflow, folder)

The general card pattern used across the app. Specific variants share these foundations:

```css
.card {
  background: var(--bg-element);
  border-radius: 10px;
  overflow: hidden;
  cursor: pointer;
  box-shadow: 0 0 0 1px rgba(185, 205, 190, 0.06);
  transition: box-shadow var(--motion-fast) var(--ease-out),
              transform var(--motion-fast) var(--ease-out);
  position: relative;
}

.card:hover {
  box-shadow: 0 0 0 1px rgba(185, 205, 190, 0.3);
  transform: translateY(-1px);
}
```

### Common features

- Hover lift (translateY -1px)
- Sage outline ring on hover (0 → 1px sage)
- Hover-reveal overflow menu (top-right of card)
- Click anywhere on the card triggers the primary action (load workflow, open asset, etc.)

### Workflow card thumbnails

Workflow cards use **CSS-only generated thumbnails** — not screenshots. The thumb is generated from the workflow's node graph:

- Color palette based on dominant output type (pink = images, green = audio, etc.)
- Dot positions based on actual node positions (normalized 0-1)
- Each workflow gets a unique-looking thumb based on its structure

This is intentional. Screenshots would require background rendering, queueing, caching, eventual consistency. CSS thumbs are instant, deterministic, and look intentionally designed.

## 5.10 Icon menu (overflow popover)

A horizontal popover of icon-only buttons, used as overflow menus on cards.

```css
.icon-menu {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px;
  background: var(--bg-surface);
  border-radius: 8px;
  box-shadow: var(--shadow-raised-medium);
  border: 1px solid var(--border-subtle);
}

.icon-menu-btn {
  width: 26px;
  height: 26px;
  border: none;
  background: transparent;
  border-radius: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background var(--motion-fast) var(--ease-out);
}

.icon-menu-btn:hover {
  background: rgba(185, 205, 190, 0.08);
}

.icon-menu-btn.danger:hover {
  background: rgba(255, 72, 0, 0.08);
}

.icon-menu-divider {
  width: 1px;
  height: 14px;
  background: var(--border-subtle);
  margin: 0 4px;
}
```

### Behavior

- Hover-reveal on cards (opacity 0 → 1 on parent hover)
- Tooltips on icon buttons appear with 250ms delay
- Vertical divider separates safe actions from destructive ones
- Click-outside dismisses

## 5.11 Count pill

A small pill showing a count or status, used in section headers.

```css
.count-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: rgba(185, 205, 190, 0.1);
  border-radius: 999px;
  font-size: 9px;
  color: var(--accent-primary);
  font-weight: 500;
}
```

### Usage

- "3 exposed" next to INPUTS section
- "1 active" next to SHARE LINKS section
- "12 assets" next to a folder

## 5.12 Toast

A small auto-dismissing notification, typically anchored to a corner or floating above content.

```css
.toast {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: var(--bg-element);
  border-radius: 8px;
  border: 1px solid var(--border-subtle);
  box-shadow: var(--shadow-raised-medium);
  color: var(--text-primary);
  font-size: 12px;
  animation: toast-enter 250ms var(--ease-spring);
}

@keyframes toast-enter {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

### Auto-dismiss

3 seconds for confirmations, 5 seconds for errors. User can dismiss manually with a small × button.

## 5.13 Empty state

The pattern for "nothing here yet" surfaces.

```css
.empty-state {
  padding: 32px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 10px;
}

.empty-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: rgba(185, 205, 190, 0.06);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;
}

.empty-icon i {
  font-size: 22px;
  color: rgba(185, 205, 190, 0.5);
}

.empty-title {
  font-size: 13px;
  color: var(--text-primary);
  font-weight: 500;
  margin: 0;
  letter-spacing: -0.005em;
}

.empty-desc {
  font-size: 11px;
  color: var(--text-hint);
  margin: 0;
  line-height: 1.4;
  max-width: 280px;
}
```

### Empty states are designed, not error messages

Empty states should feel like *invitations*, not failures. Headlines describe the opportunity ("Turn your workflow into a simple app") not the absence ("No inputs exposed yet"). The icon is flat sage in a tinted square — friendly but not childish.

## 5.14 AI tag

A small pink pill that marks fields with AI-drafted content.

```css
.ai-tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 6px;
  background: rgba(252, 195, 220, 0.1);
  border-radius: 999px;
  font-size: 8px;
  color: var(--accent-emphasis);
  font-weight: 600;
  letter-spacing: 0.04em;
  transition: opacity 250ms var(--ease-out);
}
```

### Behavior

The tag fades out when the user edits the AI-drafted text — signaling "this is now your version."

```js
input.addEventListener('input', () => {
  if (input.value !== originalAiValue) {
    tag.style.opacity = '0';
    setTimeout(() => tag.remove(), 250);
  }
});
```

## 5.15 Confirm modal

The pattern for destructive confirmations.

```html
<div class="modal confirm-modal">
  <div class="modal-icon-circle danger">
    <i class="ti ti-trash"></i>
  </div>
  <h3 class="confirm-title">Delete this folder?</h3>
  <p class="confirm-desc">
    The folder will be deleted. Assets inside will move to All assets.
  </p>
  <div class="modal-actions">
    <button class="btn-ghost">Cancel</button>
    <button class="btn-danger">Delete</button>
  </div>
</div>
```

```css
.modal-icon-circle.danger i {
  color: var(--accent-danger);
}

.btn-danger {
  background: rgba(255, 72, 0, 0.12);
  border: 1px solid rgba(255, 72, 0, 0.4);
  color: var(--accent-danger);
}

.btn-danger:hover {
  background: rgba(255, 72, 0, 0.2);
  border-color: rgba(255, 72, 0, 0.6);
}
```

### Behavior

- Initial focus on Cancel (the safe option)
- Backdrop click closes (treats as Cancel)
- Escape closes (treats as Cancel)
- Destructive button never receives initial focus

## 5.16 Side panel shell

The base shell for all side panels.

```css
.side-panel {
  background: var(--bg-surface);
  border-radius: 14px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  box-shadow: var(--shadow-raised-strong);
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(185, 205, 190, 0.2) transparent;
}

.side-panel::-webkit-scrollbar { width: 4px; }
.side-panel::-webkit-scrollbar-thumb {
  background: rgba(185, 205, 190, 0.15);
  border-radius: 2px;
}
```

### Panel header pattern

Every side panel has the same header structure:
- Flat sage icon + title on the left
- Raised close × button on the right

The icon is decorative (flat). The close is interactive (raised). Demonstrates the elevation rule in miniature.

### Animation

Slides in from the right with 280ms `cubic-bezier(0.16, 1, 0.3, 1)` easing. The spring curve gives a slight "settled" feeling at the end.

## 5.17 Modal shell

The base shell for all modals.

```css
.modal {
  background: var(--bg-surface);
  border-radius: 14px;
  padding: 18px 20px;
  box-shadow: var(--shadow-raised-strong);
  animation: modal-enter 200ms var(--ease-spring);
}

@keyframes modal-enter {
  from {
    opacity: 0;
    transform: scale(0.96);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
```

Slightly subtle scale-in (0.96 → 1.0) plus opacity. The motion signals "I'm appearing" without feeling theatrical.

---

# Part 6 — Microcopy and language

## 6.1 Tone of voice

The product talks to creatives like a thoughtful colleague — not a corporate IT system, not a chatbot.

**Voice characteristics:**
- Direct, no filler
- Slightly warm but never cute
- Confident, not hedging
- Respects the user's expertise
- Uses creator-friendly language, not technical jargon

**Examples — yes vs no:**

| Tone | Example |
|---|---|
| ✅ | "Turn your workflow into a simple app" |
| ❌ | "No inputs have been exposed yet" |
| ✅ | "Create branded social posts in seconds" |
| ❌ | "This workflow generates output from input parameters" |
| ✅ | "Recipients will see updates after saving" |
| ❌ | "Changes will not be propagated to active share links until commit" |
| ✅ | "Drafting a description…" |
| ❌ | "Initializing AI metadata generation pipeline" |

## 6.2 Button labels

Buttons describe **what will happen**, not what the user does.

| Action | ✅ Label | ❌ Label |
|---|---|---|
| Open the recipient view in new tab | "Preview" | "View as recipient" |
| Save the workflow | "Save" | "Submit" |
| Generate a share link | "Create share link" | "Generate share URL" |
| Update existing app | "Save changes" | "Update configuration" |
| Cancel | "Cancel" | "Close" / "Dismiss" |

### State-driven labels

When a button's meaning changes based on state, the label changes too:

- No app yet: **"Create share link"**
- App exists: **"Save changes"**

The icon also changes (sparkles → refresh). This is more truthful than a single label like "Save" that means different things at different times.

## 6.3 Empty states

Empty state copy describes the opportunity, not the absence.

| ✅ | ❌ |
|---|---|
| "Turn your workflow into a simple app" | "No inputs exposed yet" |
| "Add an input node to make this into an app" | "Cannot create app — no eligible inputs" |
| "No templates yet" + explanation of what templates are | "0 results found" |

Empty states should feel like *invitations*, not failures.

## 6.4 Error and warning copy

Errors describe what happened and what to do — never just what's broken.

- ✅ "Save failed. Check your connection and try again."
- ❌ "Error 500: Internal server error"
- ✅ "This workflow needs a name before you can save."
- ❌ "Validation error: name is required"

## 6.5 Forbidden phrases

Phrases that should never appear in the UI:

- "Please" — overly polite, feels apologetic
- "Sorry" — never apologize for the product's behavior
- "Oops" — childish, undermines confidence
- "Awesome!" / "Great job!" — cloying, treats user like a child
- "Loading..." — be specific ("Saving…", "Generating…")
- "Successfully saved" — just "Saved" is enough
- "Are you sure?" — ask the specific question ("Delete this folder?")
- Any all-caps word in body text (except `<strong>` semantic emphasis)

---

# Part 7 — Accessibility

## 7.1 Keyboard navigation

Every interactive element must be reachable and usable via keyboard alone.

**Required:**
- Tab order matches visual order
- All buttons reachable via Tab
- Toggles activate with Space and Enter
- Card pickers (radio groups) use arrow keys to move between options
- Modals trap focus until closed
- Escape closes modals and panels
- Focus returns to the trigger element when a panel/modal closes

**Common shortcuts:**
- `Cmd/Ctrl + A` — select all in selection-mode contexts
- `Shift + Click` — range select
- `Cmd/Ctrl + Enter` — submit forms in modals
- `Escape` — close modal, panel, or popover

## 7.2 Screen reader support

Every component uses appropriate ARIA roles and attributes.

| Component | ARIA role | Required attributes |
|---|---|---|
| Modal | `role="dialog"` | `aria-modal="true"`, `aria-labelledby`, `aria-describedby` |
| Side panel | `role="dialog"` | `aria-modal="false"`, `aria-labelledby` |
| Toggle | `role="switch"` | `aria-checked` |
| Tab pill | `role="tablist"` on container, `role="tab"` on each | `aria-selected` |
| Card picker | `role="radiogroup"` on container, `role="radio"` on each | `aria-checked` |
| Toast | `role="status"` for info, `role="alert"` for errors | — |

Labels and descriptions must be set via `aria-label` or `aria-labelledby`. Decorative elements use `aria-hidden="true"`.

## 7.3 Reduced motion

Every animation respects `prefers-reduced-motion`. The global rule:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0ms !important;
    transition-duration: 0ms !important;
  }
}
```

The in-app "Reduce motion" toggle adds `[data-reduced-motion="true"]` to the root for users who want to override without OS-level settings.

## 7.4 Color contrast

All text must meet WCAG AA contrast against its background:

- Body text vs canvas: 7:1+ (AAA)
- Body text vs surface: 7:1+ (AAA)
- Hint text vs canvas: 4.5:1+ (AA)
- Disabled text: at least 3:1 (acceptable for non-essential text)

Use a contrast checker for any new color pairing. The current `--text-hint: #7A8E90` is at the edge — don't use a lighter gray than this.

## 7.5 Focus indicators

Every interactive element has a visible focus indicator using sage outline:

```css
.interactive:focus-visible {
  outline: 2px solid var(--accent-primary);
  outline-offset: 2px;
}
```

For elements with their own complex visual state (toggles, card pickers), the focus indicator is integrated into their existing styling — e.g., the toggle uses a sage outline ring on focus.

**Never remove focus outlines without replacing them.** A keyboard user without focus indicators is lost.

---

# Part 8 — Implementation guidance

## 8.1 CSS variable architecture

All design tokens live as CSS custom properties on `:root`. Components reference these via `var(--token-name)`. Theme switching works by changing the root's `data-theme` attribute, which swaps the variable values.

```css
:root[data-theme="dark"] { /* dark tokens */ }
:root[data-theme="light"] { /* light tokens */ }
```

**Never hardcode color values in component CSS.** Every color reference must use a CSS variable. If a color isn't covered by an existing variable, the right move is to add a new variable — not to inline the hex.

## 8.2 Component library structure

Build components as a flat directory structure with co-located styles:

```
src/components/
  Toggle/
    Toggle.tsx
    Toggle.module.css
    Toggle.stories.tsx (Storybook)
    Toggle.test.tsx
  Button/
    ...
  SidePanel/
    ...
```

Each component exports:
- A typed React component
- A `Toggle.module.css` with the component's styles
- Optional Storybook stories for documentation
- Tests for behavior

**Components are pure.** They receive props, render output, and emit events via callbacks. They don't reach into global state. State management happens at the surface level (panel, page) and passes down.

## 8.3 The "before you build" checklist

Before writing any new component or surface, walk through this checklist:

- [ ] **Is there an existing component that does this?** Check the component library first. The Toggle, TabPill, Modal, etc. handle most cases.
- [ ] **What's the elevation treatment?** Raised, indented, or flat? If you can't articulate why, you don't know yet.
- [ ] **Is this a modal or a side panel?** Use the decision rule from Section 4. Does the user want to see the canvas during this task?
- [ ] **What's the empty state?** Every surface that can be empty needs designed empty-state copy.
- [ ] **What's the loading state?** Every async surface needs a designed loading affordance (shimmer, spinner, skeleton).
- [ ] **What's the error state?** What does the user see if the operation fails?
- [ ] **Is this accessible?** ARIA roles, keyboard navigation, focus management, reduced motion.
- [ ] **What microcopy?** Are the labels in our voice? Are empty states invitations?
- [ ] **Have you reviewed this doc?** If your component conflicts with the design system, something is wrong — usually with your component.

## 8.4 Common mistakes to avoid

These are the mistakes engineers make most often. Watch for them in code review.

**1. Decorative neumorphism.** Adding `box-shadow` to something flat because "it looks better." This violates the elevation rule and degrades the system.

**2. Multiple primary buttons on one surface.** Pick one. The whole point of a primary button is that it's *the* primary action. If you have two, neither is.

**3. Hardcoded colors.** `color: #B9CDBE` is wrong. `color: var(--accent-primary)` is right. Always.

**4. Animations without easing curves.** `transition: all 0.3s` is wrong. `transition: opacity 200ms ease-out` is right. Specify what's animating and how.

**5. Toggles without four cumulative on-state signals.** If your toggle only changes one thing between off and on, users will miss the state change. Use all four signals.

**6. Empty placeholder text instead of designed empty states.** "No items" is not enough. Design the empty state with an icon, title, and description.

**7. Loading states that show nothing.** A blank screen during loading is unacceptable. Use shimmer, spinner, or skeleton.

**8. Pink used for emphasis on regular actions.** Pink is for rare emphasis only. If you find yourself reaching for pink, ask if sage would work first. It almost always does.

**9. Section labels without uppercase + letter-spacing.** They should be 10px, uppercase, 0.12em letter-spacing, hint color. This is the convention.

**10. Forgetting reduced motion.** Every animation needs a reduced-motion fallback. Test with the OS setting enabled.

---

# Part 9 — Decisions log

The major architectural decisions in the design system, with the rationale documented. When future engineers ask "why did we do it this way?", this is the answer.

## 9.1 Why dark mode is the default

Most creative production tools (DaVinci Resolve, Adobe Premiere, Logic Pro, Figma) default to dark. The eye fatigue from staring at white screens for hours is real, and creative work benefits from a quieter visual environment that doesn't compete with the work itself.

Dark also matches the emotional register of the product — it's a tool for thoughtful, focused work, not a quick-task SaaS app.

Light is offered as an opt-out for users who genuinely prefer it (typically those working in very bright environments). It's not removed, but it's not the default.

## 9.2 Why pink is rare

The design system has ONE actionable color (sage) used everywhere consistent UI elements appear. Pink is reserved for genuinely unusual moments — AI assistance, admin features, unsaved-changes warnings.

When pink appears, it means *"pay attention, something here is different from normal."* If pink were used decoratively or on regular actions, that signal would degrade and pink would become just another color.

This is a discipline. New features will be tempted to use pink for "branding" or "interest." Resist. Sage handles 95% of cases. Pink only when the use case earns it.

## 9.3 Why we use CSS-only thumbnails

Workflow card thumbnails could be screenshots — but screenshots require:
- A background rendering pipeline
- A queue and worker system
- A cache layer
- Eventual consistency (thumbnails lag behind the latest edits)
- Storage for thumbnail images

CSS-generated thumbnails (gradients + colored dots based on node positions and types) require:
- A pure function
- Nothing else

They render instantly, update in real time, and look intentionally designed — not just "screenshot rendered small." A thumbnail's job is to communicate two things: *what kind of workflow is this* (color palette) and *roughly how complex is it* (dot distribution). CSS handles both perfectly.

## 9.4 Why we don't use Material Design

Material Design is a design language built for a different problem: making Android apps feel native. It's well-considered but tonally generic, and it carries enormous historical weight (every Material app looks like every other Material app).

For a creative tool that wants to feel distinctive, adopting Material Design means inheriting Material Design's vibe — which is the opposite of what we want. Our design system borrows ideas from neumorphism, Apple's macOS design language, and original direction tuned for creatives.

## 9.5 Why neumorphism (carefully)

Neumorphism (the soft, raised-or-indented surface treatment) fell out of fashion around 2020 because designers used it indiscriminately. Decorative neumorphism — applying the treatment to elements that don't function — created beautiful but unusable interfaces.

We use neumorphism with one strict rule: **only when it communicates function.** Raised = pressable. Indented = receives input. Flat = informational. With this discipline, neumorphism becomes a feature of the language, not a vibe.

Done this way, neumorphism creates an interface where the user's hand intuitively knows where to go — no labels needed for affordance. It's a *functional* design choice, not an aesthetic one.

---

# Closing

This document is the source of truth for the Gen Media Studio interface. When you build something, this is what you build toward.

If you find a case this document doesn't cover, two things are possible:
1. You're solving a problem that has a precedent here — search the doc carefully
2. You're solving a genuinely new problem — propose an extension to this doc before implementing

The system grows by intentional extension, not by accidental sprawl.

If your work conflicts with this document, your work is wrong — change your work, not the document. The document changes only by explicit revision with rationale.

Welcome to the project. Build something beautiful.
