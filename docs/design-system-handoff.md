# Gen Media Studio - Design System Handoff

> **For Figma designers** — Everything needed to recreate the UI accurately.
> Font: Inter (Google Fonts) | Component library: shadcn/ui (Radix primitives) | Framework: Tailwind CSS

---

## 1. Color Tokens

### CSS Custom Properties (HSL values, used via `hsl(var(--name))`)

#### Light Mode (`:root`) — Lavender Theme
| Token                        | HSL Value        | Hex Approx   | Usage                         |
|------------------------------|------------------|--------------|-------------------------------|
| `--background`               | 288 24% 81%     | `#D6C2D9`    | Page background               |
| `--foreground`               | 0 0% 12%        | `#1F1F1F`    | Primary text                  |
| `--card`                     | 288 20% 90%     | `#E8DDE9`    | Card backgrounds              |
| `--card-foreground`          | 0 0% 12%        | `#F1F11F`    | Card text                     |
| `--popover`                  | 288 20% 90%     | `#E8DDE9`    | Popover backgrounds           |
| `--primary`                  | 325 84% 15%     | `#46062B`    | Buttons, links, accents       |
| `--primary-foreground`       | 42 45% 95%      | `#F8F5EE`    | Text on primary               |
| `--secondary`                | 288 18% 75%     | `#C5B0C9`    | Secondary surfaces            |
| `--secondary-foreground`     | 0 0% 12%        | `#1F1F1F`    | Text on secondary             |
| `--muted`                    | 288 15% 85%     | `#DDD3DE`    | Muted backgrounds             |
| `--muted-foreground`         | 0 0% 35%        | `#595959`    | Muted/placeholder text        |
| `--accent`                   | 325 84% 15%     | `#46062B`    | Accent (same as primary)      |
| `--destructive`              | 0 84% 40%       | `#BC0F0F`    | Error/destructive actions      |
| `--border`                   | 288 15% 70%     | `#B8A5BB`    | Borders                       |
| `--input`                    | 288 15% 70%     | `#B8A5BB`    | Input borders                 |
| `--ring`                     | 325 84% 15%     | `#46062B`    | Focus ring                    |
| `--radius`                   | —               | `0.75rem`    | Base border-radius (12px)     |

#### Dark Mode (`.dark`) — Purple Theme
| Token                        | HSL Value        | Hex Approx   | Usage                         |
|------------------------------|------------------|--------------|-------------------------------|
| `--background`               | 283 88% 14%     | `#1E0545`    | Page background               |
| `--foreground`               | 210 40% 98%     | `#F8FAFC`    | Primary text                  |
| `--card`                     | 283 50% 20%     | `#2C1847`    | Card backgrounds              |
| `--card-foreground`          | 210 40% 98%     | `#F8FAFC`    | Card text                     |
| `--primary`                  | 324 73% 84%     | `#F0A0C8`    | Primary accent                |
| `--primary-foreground`       | 283 88% 14%     | `#1E0545`    | Text on primary               |
| `--secondary`                | 283 40% 28%     | `#352060`    | Secondary surfaces            |
| `--muted`                    | 283 40% 28%     | `#352060`    | Muted backgrounds             |
| `--muted-foreground`         | 210 40% 65%     | `#8BA3BD`    | Muted text                    |
| `--accent`                   | 217 91% 60%     | `#3B82F6`    | Accent (blue)                 |
| `--destructive`              | 0 84% 60%       | `#E83A3A`    | Error/destructive             |
| `--border`                   | 283 40% 28%     | `#352060`    | Borders                       |
| `--ring`                     | 262 83% 58%     | `#7C3AED`    | Focus ring (violet)           |

### Hardcoded Hex Colors (Wizard/Legacy Pages)
| Hex       | Usage                                          |
|-----------|-------------------------------------------------|
| `#360F46` | Wizard page background                          |
| `#41204E` | Card backgrounds (wizard)                       |
| `#2A1A3F` | Input backgrounds (wizard)                      |
| `#3D2D4F` | Input borders, dividers (wizard)                |
| `#9B6C94` | Buttons, accent (wizard)                        |
| `#8A5B84` | Button hover (wizard)                           |
| `#F8F5EE` | Light cream text on dark                        |
| `#0a0a0a` | Canvas background (workflow)                    |

### Connector/Edge Colors (Workflow Canvas)
| Hex       | Usage                                          |
|-----------|-------------------------------------------------|
| `#fcc3dc` | Text / Video / Format / Any connector (pink)    |
| `#83d196` | Image connector (green)                         |
| `#6366f1` | "Any" animated connector (indigo)               |
| `#10b981` | Completion flash (emerald green)                |
| `#fca5a5` | Error text (light red)                          |

### Sticky Note Color Variants (Tailwind)
| Variant  | Background      | Border          | Text            |
|----------|-----------------|-----------------|-----------------|
| Yellow   | `bg-yellow-100` | `border-yellow-300` | `text-yellow-900` |
| Blue     | `bg-blue-100`   | `border-blue-300`   | `text-blue-900`   |
| Pink     | `bg-pink-100`   | `border-pink-300`   | `text-pink-900`   |
| Purple   | `bg-purple-100` | `border-purple-300` | `text-purple-900` |

### Shadow & Overlay RGBA Values
| Value                          | Usage                          |
|--------------------------------|--------------------------------|
| `rgba(0, 0, 0, 0.1)`          | Light box shadows              |
| `rgba(0, 0, 0, 0.2)`          | Medium box shadows, attribution bg |
| `rgba(0, 0, 0, 0.7)`          | Overlay backdrop               |
| `rgba(0, 0, 0, 0.9)`          | Overlay hover                  |
| `rgba(70, 6, 43, 0.6)`        | Minimap mask (dark purple)     |
| `rgba(59, 130, 246, 0.2)`     | Wizard card hover shadow (blue)|
| `rgba(155, 108, 148, 0.05)`   | Uploader hover shadow (purple) |
| `rgba(239, 68, 68, 0.1)`      | Error alert background (red)   |
| `rgba(239, 68, 68, 0.3)`      | Error alert border (red)       |

---

## 2. Typography

### Font Family
```
Primary: 'Inter', sans-serif (weights: 400, 500, 600, 700, 800)
Monospace: 'Courier New', monospace (slider values, code)
System fallback: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
```

### Type Scale
| Name          | Tailwind Class     | Size   | Weight    | Usage                              |
|---------------|-------------------|--------|-----------|-------------------------------------|
| Display       | `text-4xl`        | 36px   | Bold (700)| Page hero titles                    |
| Heading 1     | `text-3xl`        | 30px   | Bold (700)| Section titles (Workflows)          |
| Heading 2     | `text-2xl`        | 24px   | Bold (700)| Sub-section titles                  |
| Heading 3     | `text-xl`         | 20px   | —         | Large labels                        |
| Heading 4     | `text-lg`         | 18px   | Semibold (600) | Panel titles, modal headers    |
| Body          | `text-base`       | 16px   | Medium (500) | Default body text               |
| Body Small    | `text-sm`         | 14px   | Medium (500) | Node labels, form labels, descriptions |
| Caption       | `text-xs`         | 12px   | Medium (500) | Status text, helper text, metadata |
| Micro         | `text-[11px]`     | 11px   | Semibold (600) | Floating labels, compound descriptions |
| Nano          | `text-[10px]`     | 10px   | Medium (500) | Toolbar buttons, edge labels, attribution |
| Pico          | `text-[9px]`      | 9px    | —         | Badge indicators (VideoSegmentReplace) |

#### Wizard-Specific CSS Font Sizes (not Tailwind)
| Size   | Usage                                  |
|--------|----------------------------------------|
| 64px   | Wizard empty-state icon                |
| 40px   | Wizard section icon                    |
| 32px   | Wizard card icon, uploader icon        |
| 22px   | Wizard form title                      |
| 20px   | Wizard results title                   |
| 16px   | Wizard card name, button text          |
| 14px   | Wizard field label, form inputs        |
| 13px   | Wizard card description, compound name |
| 12px   | Wizard field value, slider value       |

### Font Weights Used
| Tailwind        | Weight | Usage                                        |
|-----------------|--------|----------------------------------------------|
| `font-normal`   | 400    | Body text                                    |
| `font-medium`   | 500    | Labels, node names, form labels              |
| `font-semibold` | 600    | Node headers, section titles, category labels |
| `font-bold`     | 700    | Page titles, headings                        |

### Line Heights
| Tailwind / CSS     | Value  | Usage                                |
|--------------------|--------|--------------------------------------|
| `leading-none`     | 1      | Alert titles, dialog titles          |
| `leading-tight`    | 1.25   | Alerts, text panels                  |
| (default)          | 1.4    | Wizard descriptions, compound nodes  |
| (default)          | 1.5    | Wizard form descriptions             |
| `leading-relaxed`  | 1.625  | Alert descriptions                   |

### Letter Spacing
| Tailwind           | Value     | Usage                              |
|--------------------|-----------|------------------------------------|
| `tracking-tight`   | -0.025em  | Dialog/card/drawer titles          |
| (default)          | 0         | Most text                          |
| `tracking-wide`    | 0.025em   | Node palette headers, floating labels |
| `tracking-widest`  | 0.1em     | Command keyboard shortcuts         |

### Text Styling
- `uppercase tracking-wide` — Category headers in node palette
- `truncate` — Overflow text in constrained areas
- `line-clamp-2` — Gallery card titles
- `font-mono` / `tabular-nums` — Numeric displays, code blocks

---

## 3. Spacing & Sizing

### Border Radius
| Token         | Value                          | Pixels  | Usage                      |
|---------------|--------------------------------|---------|----------------------------|
| `--radius`    | `0.75rem`                      | 12px    | Base radius                |
| `rounded-lg`  | `var(--radius)` = 12px         | 12px    | Cards, large containers    |
| `rounded-md`  | `calc(var(--radius) - 2px)`    | 10px    | Inputs, buttons            |
| `rounded-sm`  | `calc(var(--radius) - 4px)`    | 8px     | Small elements             |
| `rounded-xl`  | —                              | 12px    | Modals                     |
| `rounded`     | —                              | 4px     | Tags, small pills          |
| `rounded-full`| —                              | 9999px  | Avatars, handle dots       |

### Common Spacing Patterns
| Pattern       | Value  | Context                                 |
|---------------|--------|-----------------------------------------|
| `p-4`         | 16px   | Node internal padding                   |
| `p-3`         | 12px   | Card padding                            |
| `p-2`         | 8px    | Compact elements                        |
| `px-3 py-2`   | 12/8px | Button padding                          |
| `px-2 py-0.5` | 8/2px  | Floating labels, tags                   |
| `gap-2`       | 8px    | Standard flex gap                       |
| `gap-1.5`     | 6px    | Compact layouts                         |
| `gap-1`       | 4px    | Tight groupings                         |
| `gap-3`       | 12px   | Form fields                             |
| `space-y-2`   | 8px    | Vertical stacking                       |
| `space-y-3`   | 12px   | Form sections                           |

### Fixed Dimensions (Workflow Nodes)
| Component               | Width          | Notes                          |
|-------------------------|----------------|--------------------------------|
| Image filter nodes      | `min-w-[280px]`| Blur, Sharpen, Hue/Sat, etc.  |
| Generation nodes        | `min-w-[300px]`| Generate Image/Video/Music     |
| Script/Text Iterator    | `min-w-[320px]`| Wider for text content         |
| LLM Node                | `min-w-[320px] max-w-[400px]` | Constrained width  |
| Video Output            | `min-w-[350px]`| Wider for video preview        |
| Upload nodes            | `min-w-[250px]`| Image/Video upload             |
| Merge Videos            | `w-[280px]`    | Fixed width                    |
| Add Music               | `w-[300px]`    | Fixed width                    |
| Crop Node               | `min-w-[340px]`| Extra wide for controls        |
| Compound nodes (CSS)    | `min-w-250px, max-w-350px` | CSS class        |
| Workflow node (CSS)     | `min-w-200px`  | Base minimum                   |

### Node Internal Heights
| Element                 | Height          |
|-------------------------|-----------------|
| Empty state placeholder | `h-[100px]` to `h-[150px]` |
| Image/Video preview     | `max-h-[200px]` to `max-h-[250px]` |
| Text output area        | `max-h-[200px]` (scrollable) |
| Script editor           | `min-h-[150px]` |

### Layout Structure
| Element                    | Dimension                       | Notes                              |
|----------------------------|---------------------------------|------------------------------------|
| Image/Video controls panel | `340px`                         | Fixed grid column (`gridTemplateColumns: "340px 1fr"`) |
| Node palette width         | ~240px                          | Left sidebar (auto-layout based)   |
| Search dialog              | `w-[400px]`                     | Node search overlay                |
| Text modal                 | `max-w-[1400px] max-h-[900px]` | Full-screen text editor            |
| Side panel                 | `max-w-2xl` (672px)             | Text edit panel                    |
| Toast width                | `max-w-[420px]`                 | Notification toasts                |
| Workflow canvas height     | `h-[calc(100vh-180px)]`        | Full height minus header           |
| ReactFlow canvas           | Fills remaining space           | `min-height: 500px`               |
| Container max              | `1400px`                        | `2xl` breakpoint                   |
| Header padding             | `py-8` (32px) + `py-4` (16px)  | Header + sub-nav                   |

### Handle (Connection Point) Sizing
| Property     | Value  |
|--------------|--------|
| Width/Height | 12px   |
| Border       | 2px solid background |
| Hover scale  | 1.3x   |
| Badge size   | 16x16px (multi-connection count) |

---

## 4. Component Inventory

### UI Primitives (shadcn/ui - Radix based)
| Component       | File                      | Variants/Notes                     |
|-----------------|---------------------------|------------------------------------|
| Alert           | `ui/alert.tsx`            | Default, destructive               |
| AlertDialog     | `ui/alert-dialog.tsx`     | Confirmation dialogs               |
| Badge           | `ui/badge.tsx`            | Default, secondary, destructive    |
| Breadcrumb      | `ui/breadcrumb.tsx`       | Navigation trail                   |
| Button          | `ui/button.tsx`           | default, destructive, outline, secondary, ghost, link; sizes: default, sm, lg, icon |
| Calendar        | `ui/calendar.tsx`         | Date picker                        |
| Card            | `ui/card.tsx`             | Card, CardHeader, CardContent, CardFooter |
| Carousel        | `ui/carousel.tsx`         | With ArrowLeft/Right               |
| Chart           | `ui/chart.tsx`            | Recharts wrapper                   |
| Command         | `ui/command.tsx`          | Command palette (cmdk)             |
| Dialog          | `ui/dialog.tsx`           | Modal dialogs                      |
| Drawer          | `ui/drawer.tsx`           | Bottom/side drawer                 |
| Form            | `ui/form.tsx`             | React Hook Form wrapper            |
| Input           | `ui/input.tsx`            | Text input                         |
| InputOTP        | `ui/input-otp.tsx`        | OTP code input                     |
| Label           | `ui/label.tsx`            | Form labels                        |
| ModifierSlider  | `ui/modifier-slider.tsx`  | Custom slider for node parameters  |
| Pagination      | `ui/pagination.tsx`       | Page navigation                    |
| Progress        | `ui/progress.tsx`         | Progress bar                       |
| Resizable       | `ui/resizable.tsx`        | Resizable panels                   |
| Select          | `ui/select.tsx`           | Dropdown select                    |
| Separator       | `ui/separator.tsx`        | Horizontal/vertical divider        |
| Sheet           | `ui/sheet.tsx`            | Slide-over panel                   |
| Sidebar         | `ui/sidebar.tsx`          | App sidebar layout                 |
| Skeleton        | `ui/skeleton.tsx`         | Loading placeholder                |
| Slider          | `ui/slider.tsx`           | Range slider                       |
| Spinner         | `ui/spinner.tsx`          | Loading spinner                    |
| Switch          | `ui/switch.tsx`           | Toggle switch                      |
| Table           | `ui/table.tsx`            | Data table                         |
| Tabs            | `ui/tabs.tsx`             | Tab navigation                     |
| Textarea        | `ui/textarea.tsx`         | Multi-line text input              |
| ThemeProvider    | `ui/theme-provider.tsx`   | Dark/light mode                    |
| ThemeToggle      | `ui/theme-toggle.tsx`     | Sun/Moon toggle                    |
| Toast           | `ui/toast.tsx`            | Notification toasts                |
| Tooltip         | `ui/tooltip.tsx`          | Hover tooltips                     |
| Sonner          | `ui/sonner.tsx`           | Toast library wrapper              |

### Workflow Components
| Component             | File                              | Purpose                             |
|-----------------------|-----------------------------------|-------------------------------------|
| WorkflowCanvas        | `workflow/WorkflowCanvas.tsx`     | Main ReactFlow canvas               |
| WorkflowToolbar       | `workflow/WorkflowToolbar.tsx`    | Top toolbar with actions            |
| WorkflowGallery       | `workflow/WorkflowGallery.tsx`    | Workflow library/browser            |
| NodePalette           | `workflow/NodePalette.tsx`        | Left sidebar node picker            |
| NodeContextMenu       | `workflow/NodeContextMenu.tsx`    | Right-click menu on nodes           |
| NodeSearchDialog      | `workflow/NodeSearchDialog.tsx`   | Quick-add node search (400px wide)  |
| NodeLockToggle        | `workflow/NodeLockToggle.tsx`     | Lock/unlock node editing            |
| FloatingLabels        | `workflow/FloatingLabels.tsx`     | Labels floating above nodes         |
| TextEditSidePanel     | `workflow/TextEditSidePanel.tsx`  | Right slide-over for text editing   |
| TextExpandModal       | `workflow/TextExpandModal.tsx`    | Full-screen text editor             |
| SaveWorkflowDialog    | `workflow/SaveWorkflowDialog.tsx` | Save/load workflow modal            |
| WorkflowLoadDialog    | `workflow/WorkflowLoadDialog.tsx` | Load workflow picker                |
| CreateWizardModal     | `workflow/CreateWizardModal.tsx`  | Create wizard from workflow         |
| DeletedAssetWarning   | `workflow/DeletedAssetWarning.tsx`| Warning for missing assets          |
| RunNodeButton         | `workflow/nodes/RunNodeButton.tsx`| Play/loading button on nodes        |
| NodeErrorFallback     | `workflow/nodes/NodeErrorFallback.tsx` | Error state for crashed nodes |

### Workflow Node Types (33 total)

#### Input Nodes (4)
| Node              | Icon         | Min Width  | Description                    |
|-------------------|-------------|------------|--------------------------------|
| Image Input       | Upload       | 250px      | Upload or load an image        |
| Video Input       | Video        | 250px      | Upload or load a video file    |
| Text Input        | Type         | 280px      | Text input for AI generation   |
| Script Queue      | ListOrdered  | 320px      | Batch input for workflow runs  |

#### Modifier Nodes (13)
| Node                  | Icon     | Min Width  | Description                        |
|-----------------------|---------|------------|------------------------------------|
| Prompt Concatenator   | Combine  | 280px      | Combine multiple prompts           |
| Text Iterator         | List     | 320px      | Combine text with variables        |
| Brightness/Contrast   | Sun      | 280px      | Adjust brightness and contrast     |
| Blur                  | Blend    | 280px      | Add blur effect                    |
| Sharpen               | Focus    | 280px      | Sharpen image details              |
| Hue/Saturation        | Palette  | 280px      | Adjust hue and saturation          |
| Noise                 | Radio    | 280px      | Add noise texture                  |
| Film Grain            | Film     | 280px      | Add realistic film grain           |
| Vignette              | Circle   | 280px      | Add vignette effect                |
| Crop                  | Crop     | 340px      | Crop image to aspect ratio         |
| Image Composite       | Layers   | 280px      | Blend multiple images              |
| Video Compositing     | Layers   | —          | Add watermark/overlay to video     |
| Video Segment Replace | Scissors | 320px      | Replace video segment              |
| Extract Last Frame    | Film     | —          | Extract last frame from video      |

#### Action Nodes (7)
| Node              | Icon     | Min Width  | Description                        |
|-------------------|---------|------------|------------------------------------|
| Generate Image    | Image    | 300px      | AI image with Gemini 3             |
| Generate Video    | Video    | —          | AI video with Veo 3.1              |
| Generate Music    | Music    | 300px      | AI music with ElevenLabs           |
| Voice Changer     | Mic      | 300px      | Voice change with ElevenLabs       |
| Merge Videos      | Combine  | 280px      | Concatenate videos                 |
| Merge Audio       | Music    | 300px      | Mix audio tracks into video        |
| LLM               | Brain    | 320px      | Text generation/enhancement        |

#### Output Nodes (5)
| Node              | Icon         | Min Width  | Description                    |
|-------------------|-------------|------------|--------------------------------|
| Preview           | Eye          | 300px      | Preview images/videos/text     |
| Download          | Download     | 250px      | Download media result          |
| Image Output      | Image        | 300px      | Save image to library          |
| Video Output      | Video        | 350px      | Save video to library          |
| Text Output       | Type         | 300px      | Display text output            |

#### Utility Nodes (1)
| Node              | Icon           | Description                    |
|-------------------|---------------|--------------------------------|
| Sticky Note       | MessageSquare  | Documentation notes (resizable, color variants) |

### Node Anatomy (Common Pattern)
```
┌─────────────────────────────────┐
│ [Icon] Node Name    [Lock][Run] │  ← Header: font-semibold text-sm
│─────────────────────────────────│
│ ○ input_handle    Label         │  ← Handle: 12px circle + text-xs label
│                                 │
│ [Controls Area]                 │  ← Sliders, dropdowns, textareas
│   Label            ────○── 0.5  │  ← ModifierSlider: label + range + value
│   Dropdown         [▼ Option ]  │  ← Select component
│                                 │
│ [Preview/Output Area]           │  ← Image/video preview or text output
│ ┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐ │
│ │   Empty state placeholder   │ │  ← Dashed border, muted bg
│ └─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘ │
│                                 │
│ Status: text-xs                 │  ← Status line with icon
│                     output_handle ○ │
└─────────────────────────────────┘

Base: bg-card border-2 rounded-lg p-4 shadow-lg
Selected: border-color #fcc3dc
```

### Node State Machine (Figma Variants)
Every node has a `status` property that drives its visual state:
- **ready** — Default idle state
- **executing** — Spinner (Loader2), animated edges
- **completed** — CheckCircle2 icon, green flash
- **error** — AlertCircle/AlertTriangle, destructive border

### Connector Types (Handle Colors)
Handles are color-coded by data type. Each input/output has one of:
| Type     | Handle Color | Edge Color |
|----------|-------------|------------|
| `text`   | `#fcc3dc`   | `#fcc3dc`  |
| `image`  | `#83d196`   | `#83d196`  |
| `images` | `#83d196`   | `#83d196`  |
| `video`  | `#fcc3dc`   | `#fcc3dc`  |
| `audio`  | `#fcc3dc`   | `#fcc3dc`  |
| `any`    | `#fcc3dc`   | `#6366f1` (animated) |

### Key Node Controls by Type
| Control Type    | Component Used   | Found In                                    |
|-----------------|------------------|---------------------------------------------|
| Slider (0-1)    | ModifierSlider   | Brightness, Contrast, Blur, Sharpen, Hue, Saturation, Noise, Vignette, Opacity |
| Dropdown        | Select           | Model picker, aspect ratio, blend mode, separator, voice picker |
| Textarea        | Textarea         | Prompt input, script queue, LLM prompt      |
| Toggle          | Switch           | Monochrome noise, trim silence              |
| File upload     | Custom drop zone | Image/Video input nodes                     |
| Audio player    | HTML `<audio>`   | Generate Music, Add Music, Voice Changer    |
| Video player    | HTML `<video>`   | Video nodes with preview                    |

---

## 5. Lucide Icons (Complete List — 68 unique)

```
AlertCircle, AlertTriangle, Archive, ArrowLeft, ArrowRight,
Blend, Brain,
Check, CheckCircle, CheckCircle2, ChevronDown, ChevronLeft,
ChevronRight, ChevronUp, Circle, ClipboardPaste, Combine,
Copy, Crop,
Dot, Download,
Eye,
Film, Focus, Folder, FolderOpen,
GripVertical, Home,
Image (aliased as ImageIcon), Info,
Layers, List, ListOrdered, Loader2, Lock, LockOpen,
Maximize2, MessageSquare, Mic, Moon, MoreHorizontal, Music,
Palette, PanelLeft, Pencil, Play, Plus, Power,
Radio, RefreshCw,
Save, Scissors, Search, Settings, Sparkles, Stamp, Sun,
Tag, Trash2, Type,
Upload,
Video (aliased as VideoIcon), Volume2,
WifiOff, Workflow (aliased as WorkflowIcon),
X, XCircle
```
**Total: 68 unique icons** (all from `lucide-react`, rendered at `w-4 h-4` / 16x16 inside nodes)

---

## 6. Node Palette Categories (Figma Component Set Structure)

```
Node Palette
├── Input (purple-ish accent)
│   ├── Image Input (Upload icon)
│   ├── Video Input (Video icon)
│   ├── Text Input (Type icon)
│   └── Script Queue (ListOrdered icon)
├── Modifier (blue-ish accent)
│   ├── Prompt Concatenator, Text Iterator
│   ├── Brightness/Contrast, Blur, Sharpen
│   ├── Hue/Saturation, Noise, Film Grain, Vignette
│   ├── Crop, Image Composite
│   └── Video Compositing, Video Segment Replace, Extract Last Frame
├── Action (accent color)
│   ├── Generate Image, Generate Video, Generate Music
│   ├── Voice Changer, Merge Videos, Merge Audio
│   └── LLM
└── Output (muted accent)
    ├── Preview, Download
    ├── Image Output, Video Output, Text Output
    └── Sticky Note
```

---

## 7. Shadows & Effects

| Effect                    | Value                                          |
|---------------------------|------------------------------------------------|
| Node shadow               | `shadow-lg` (0 10px 15px -3px rgba(0,0,0,0.1)) |
| Node hover shadow         | 0 10px 15px -3px rgb(0 0 0 / 0.2)             |
| Controls shadow           | 0 4px 6px -1px rgb(0 0 0 / 0.1)               |
| Edge glow (animated)      | `drop-shadow(0 0 6px <color>) drop-shadow(0 0 12px <color>66)` |
| Completion glow           | `drop-shadow(0 0 8px #10b981) drop-shadow(0 0 16px #10b98199)` |
| Selected node border      | 2px solid #fcc3dc (pink)                       |
| Panel shadow              | `shadow-2xl`                                   |

---

## 8. Animations & Transitions

| Animation              | Value                            | Usage                   |
|------------------------|----------------------------------|-------------------------|
| Edge dash animation    | `stroke-dasharray: 8 4` @ 0.5s linear infinite | Active data flow |
| Accordion open/close   | 0.2s ease-out                    | Collapsible sections    |
| Color transitions      | 0.2s ease / 0.3s ease           | Hover, state changes    |
| Handle hover           | `scale(1.3)` transition          | Connection points       |
| Sticky note hover      | `translateY(-2px)`               | Lift effect             |
| Side panel slide       | 300ms ease-out transform         | Text edit panel         |

---

## 9. Interaction States

| State       | Visual Treatment                                        |
|-------------|--------------------------------------------------------|
| Default     | `bg-card border-2 border-border`                       |
| Hover       | Elevated shadow, subtle color shift                    |
| Selected    | `border-2 border-[#fcc3dc]` (pink border)             |
| Disabled    | `opacity-50`, `cursor: not-allowed`                    |
| Running     | Animated dashed edges, Loader2 spinner icon            |
| Complete    | CheckCircle2 icon, green glow on edges                 |
| Error       | `border-destructive`, AlertCircle/AlertTriangle icon   |
| Empty       | Dashed border (`border-2 border-dashed`), muted bg    |
| Locked      | Lock icon, pointer-events disabled                     |

---

## 10. Key Figma Setup Notes

1. **Use Figma Variables** for all CSS custom properties — create a "Light" and "Dark" mode collection
2. **shadcn/ui components** are Radix-based — search for "shadcn Figma kit" for pre-built components
3. **ReactFlow** canvas uses a dot-grid pattern background at 0.3 opacity
4. **Node connections** use Bezier curves with color-coded strokes based on data type
5. **All nodes** share the same base pattern: `bg-card border-2 rounded-lg p-4 shadow-lg`
6. **Icons** are all from Lucide at 16x16 (`w-4 h-4`) inside nodes
7. **The app uses dark mode by default** in the workflow canvas area

---

*Generated from codebase on 2026-03-06*
