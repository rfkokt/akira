# 🎨 Akira — Complete Component Styling Overhaul

> **Status**: Full Analysis Complete — Setiap komponen sudah di-review  
> **Total Components Analyzed**: 26 files  
> **Severity**: High — Styling inconsistency ada di hampir semua komponen

---

## 📋 Quick Index

| Category | Components | Severity |
|----------|-----------|----------|
| **Foundation** | `globals.css`, `tailwind.config.js`, `button.tsx`, `index.html` | 🔴 Critical |
| **Kanban** | `TaskCard`, `KanbanColumn`, `Board`, `TaskCreatorChat`, `TaskDetailModal`, `TaskImporter`, `AIActivityIndicator` | 🔴 Critical |
| **Git** | `GitGraph`, `GitSourceControl`, `GitBranchSelector`, `CommitDiffViewer`, `DiffViewer (Git)` | 🟡 Medium |
| **Editor** | `FileTree`, `FileViewer`, `MarkdownPreview` | 🟡 Medium |
| **AI** | `AIWorkflowPanel` | 🟡 Medium |
| **Diff** | `DiffViewer (main)` | 🟡 Medium |
| **Shared** | `ImageInput` | 🟢 Low |
| **MCP** | `ToolSuggestions` | 🟡 Medium |
| **Router** | `CostTrackingDashboard` | 🟡 Medium |
| **Layout** | `App.tsx`, `TerminalPanel` | 🟡 Medium |
| **Settings** | `SettingsPage` | 🟡 Medium |
| **Welcome** | `WelcomeScreen` | 🟡 Medium |

---

## 🔥 Masalah Global (Cross-Component)

### G1. Hardcoded VS Code Colors 🔴
**Temuan**: Banyak komponen masih pakai warna VS Code legacy (`#1e1e1e`, `#252526`, `#2d2d2d`, `#0e639c`, `#858585`, `#f48771`, `#9cdcfe`).

**Komponen terkena**:
- `DiffViewer.tsx` → `bg-[#1e1e1e]`, `bg-[#252526]`, `border-white/10`
- `AIWorkflowPanel.tsx` → `bg-[#1e1e1e]`, `bg-[#252526]`, `text-[#0e639c]`, `bg-[#0e639c]`
- `TaskImporter.tsx` → `bg-[#252526]`, `bg-[#2d2d2d]`, `bg-[#1e1e1e]`, `text-[#858585]`, `text-[#cccccc]`, `border-[#0e639c]`, `text-[#9cdcfe]`, `text-[#f48771]`
- `CostTrackingDashboard.tsx` → `bg-[#2d2d2d]`, `text-[#858585]`
- `GitPushFlow` → `bg-[#1e1e1e]`, `bg-[#252526]`, `bg-[#2d2d2d]`

**Fix**: Replace ALL hex literals with CSS variable equivalents:
```diff
- bg-[#1e1e1e] → bg-app-bg
- bg-[#252526] → bg-app-panel  
- bg-[#2d2d2d] → bg-app-sidebar
- text-[#0e639c] → text-app-accent
- bg-[#0e639c] → bg-app-accent
- text-[#858585] → text-app-text-muted
- text-[#cccccc] → text-app-text
- border-white/10 → border-app-border
- border-white/5 → border-app-border (standardize)
```

### G2. `font-geist` Class Spam 🟡
**Temuan**: `font-geist` class diterapkan di **setiap elemen teks** secara individual, padahal sudah di-set di body. Total ~200+ instances.

**Komponen terburuk**: `TaskCreatorChat.tsx` (30+ instances), `SettingsPage.tsx` (40+ instances), `GitSourceControl.tsx` (20+ instances)

**Fix**: Hapus `font-geist` dari semua elemen. Set sekali di `body { font-family: 'Geist', sans-serif }` di globals.css. Hanya pakai `font-mono` untuk code/terminal output.

### G3. `text-[10px]` dan `text-[9px]` Epidemic 🔴
**Temuan**: Font sizes yang tidak readable dipakai di 80+ tempat.

| Size | Count | Komponen |
|------|-------|----------|
| `text-[10px]` | ~50+ | GitSourceControl, TerminalPanel, TaskCreatorChat, GitBranchSelector, DiffViewer, AIWorkflowPanel |
| `text-[9px]` | ~5 | TaskCreatorChat (Groq badge, token info) |
| `text-[8px]` | ~2 | GitSourceControl (stash badge) |
| `text-[11px]` | ~8 | AIWorkflowPanel, GitPushFlow |

**Fix**: Minimum 11px everywhere. Define scale:
```css
--font-2xs: 0.6875rem;  /* 11px - absolute minimum */
--font-xs: 0.75rem;     /* 12px - labels, metadata */
--font-sm: 0.8125rem;   /* 13px - secondary text */
--font-base: 0.875rem;  /* 14px - default body */
```

### G4. Inconsistent `white/N` vs CSS Variables 🔴
**Temuan**: Background opacities inconsistent. Mix of `bg-white/5`, `bg-white/10`, `bg-black/20`, `bg-black/30`, `bg-black/40`, `bg-black/60`, `bg-black/70`, `bg-black/80`. None mapped to tokens.

**Fix**: Create surface layer tokens (lihat section "Proposed Design Direction" di bawah)

### G5. No Enter/Exit Animations for Modals 🟡
**Temuan**: Semua modal/dialog pakai `fixed inset-0` tapi langsung muncul tanpa transisi. Terasa jarring.

**Komponen terkena**: `DiffViewer`, `AIWorkflowPanel`, `TaskDetailModal`, `TaskImporter`, `GitSourceControl` (merge, stash modals), `TaskCreatorChat` (history modal), `WelcomeScreen`

**Fix**: Add shared animation classes:
```css
@keyframes modal-enter { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: scale(1); } }
@keyframes modal-exit { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(0.97); } }
.modal-content { animation: modal-enter 200ms var(--ease-smooth); }
```

### G6. Inconsistent Border Patterns 🟡
**Temuan**: 
- `border-white/5` (42 instances)
- `border-white/10` (25 instances)  
- `border-app-border` (80+ instances)
- `border-white/20` (3 instances)
- `border-transparent` (5 instances)

Semua seharusnya pakai `border-app-border` saja dengan opacity control.

---

## 🔴 Critical Component Issues

---

### C1. `TaskCreatorChat.tsx` — 1493 lines
**Location**: `src/components/Kanban/TaskCreatorChat.tsx`

| Issue | Line(s) | Current | Should Be |
|-------|---------|---------|-----------|
| Raw text messages, no bubbles | 1158-1201 | `text-blue-400` / `text-neutral-200` | Proper chat bubbles with distinct user/AI styling |
| Role label "user:"/"assistant:" | 1166 | `<span className="text-neutral-500">{msg.role}:</span>` | Replace with avatar icon + styled label |
| Groq badge `text-[9px]` | 1168 | `text-[9px]` | `text-xs` minimum |
| Token info `text-[9px]` | 1189-1192 | `text-[9px]` | `text-2xs` (11px min) |
| Bouncing dots indicator | 1196-1199 | 3 separate `animate-bounce` spans | Unified typing indicator component |
| Empty state too plain | 1083-1131 | Centered text, no visual | Add illustration + branded hero |
| Summary card `bg-green-500/10` | 1304 | Hardcoded green | Should use task status color tokens |
| Progress panel `bg-app-bg/50` | 1207 | Mix of bg patterns | Standardize panel styling |
| Model dropdown | 1435-1458 | Manual `absolute` positioned dropdown | Use shadcn `DropdownMenu` component |
| History modal | 1035-1081 | Raw `fixed inset-0` | Use `Dialog` component + animations |

**Proposed Chat Bubble Fix**:
```tsx
// User message → right-aligned, accent bubble
<div className="flex justify-end">
  <div className="max-w-[80%] bg-app-accent/15 border border-app-accent/20 rounded-2xl rounded-br-md px-4 py-2.5">
    ...
  </div>
</div>

// AI message → left-aligned, glass bubble  
<div className="flex justify-start">
  <div className="max-w-[85%] bg-app-surface-2 border border-app-border rounded-2xl rounded-bl-md px-4 py-2.5">
    ...
  </div>
</div>
```

---

### C2. `TaskCard.tsx` — 310 lines
**Location**: `src/components/Kanban/TaskCard.tsx`

| Issue | Line(s) | Current | Should Be |
|-------|---------|---------|-----------|
| Flat card bg | 71 | `bg-app-sidebar` | Subtle gradient or layered surface |
| AI working state barely visible | ~80 | `bg-yellow-500/5` | Animated border glow or pulse |
| Hover glow too subtle | ~82 | `shadow-[0_0_15px_var(--app-accent-glow)]` | More dramatic lift + shadow |
| Priority badge too small | Various | `text-[10px]` badges | Side stripe / colored left border |
| Done state not visually distinct | Conditional | Same card, different opacity | Faded with checkmark overlay |

**Proposed Card Fix**:
```tsx
// Card with left priority stripe
<div className={cn(
  "relative pl-1 rounded-lg overflow-hidden",
  "bg-gradient-to-br from-app-surface-2 to-app-surface-1",
  "border border-app-border hover:border-app-border-highlight",
  "transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5"
)}>
  <div className={cn(
    "absolute left-0 top-0 bottom-0 w-1 rounded-l-lg",
    priority === 'high' && 'bg-red-500',
    priority === 'medium' && 'bg-amber-500',
    priority === 'low' && 'bg-emerald-500',
  )} />
  ...
</div>
```

---

### C3. `KanbanColumn.tsx` — 84 lines
**Location**: `src/components/Kanban/KanbanColumn.tsx`

| Issue | Line(s) | Current | Should Be |
|-------|---------|---------|-----------|
| Column bg too dark | 30 | `bg-black/40 backdrop-blur-xl` | `bg-app-surface-1 backdrop-blur-md` |
| Header count badge | 45 | `bg-white/10 text-xs` | Proper styled Badge component |
| Drop indicator flat | Various | `bg-app-accent/10` | Dashed border + glow animation |
| No column icon | - | Just text label | Status icon next to label |

---

### C4. `DiffViewer.tsx` (Main) — 800 lines
**Location**: `src/components/DiffViewer/DiffViewer.tsx`

| Issue | Line(s) | Current | Should Be |
|-------|---------|---------|-----------|
| All hardcoded hex colors | 350-543 | `bg-[#1e1e1e]`, `bg-[#252526]`, `border-white/10`, `border-white/5` | CSS variable equivalents |
| Loading state card | 750-798 | `bg-[#252526]`, `bg-[#1e1e1e]` | CSS variables |
| Progress bar | 766-773 | `bg-neutral-800`, `from-blue-600 to-blue-400` | Token-based |
| Step dots hardcoded | 783-787 | `bg-blue-400`, `bg-neutral-600` | Token colors |
| Discard confirm modal | 514-541 | `bg-[#1e1e1e]`, `border-red-500/30` | Consistent with other modals |
| `text-[10px]` usage | 377, 382, 593 | Too small | `text-xs` minimum |
| View mode toggle | 396-419 | Manual tab styling | Shared `SegmentedControl` component |

---

### C5. `TaskImporter.tsx` — 399 lines
**Location**: `src/components/Kanban/TaskImporter.tsx`  
**WORST OFFENDER for hardcoded hex colors**

| Issue | Line(s) | Current | Should Be |
|-------|---------|---------|-----------|
| Container | 199 | `bg-[#252526] border-white/10` | `bg-app-panel border-app-border` |
| Header | 201 | `bg-[#2d2d2d]` | `bg-app-sidebar` |
| Close button | 207 | `text-[#858585]` | `text-app-text-muted` |
| Tab active state | 217 | `bg-[#0e639c]` | `bg-app-accent` |
| Drop zone | 252-256 | `border-[#0e639c]`, `bg-[#0e639c]/10`, `bg-[#1e1e1e]` | Token colors |
| Spinner | 268 | `border-[#0e639c]` | `border-app-accent` |
| Upload icon | 273 | `text-[#0e639c]`, `text-[#858585]` | Token text colors |
| Body text | 276, 279 | `text-[#cccccc]`, `text-[#6e6e6e]` | `text-app-text`, `text-app-text-muted` |
| File type cards | 289-300 | `bg-[#1e1e1e]`, `border-white/5`, `text-[#858585]` | Token equivalents |
| Code example | 309, 325 | `bg-[#1e1e1e]`, `text-[#9cdcfe]`, `border-white/5` | Token equivalents |
| Success/error colors | 229 | `text-[#f48771]` | `text-red-400` or token |
| Try Again button | 239 | `bg-[#0e639c]`, `hover:bg-[#1177bb]` | `bg-app-accent hover:bg-app-accent-hover` |
| Textarea | 356 | `bg-[#1e1e1e]`, `border-white/20`, `text-[#cccccc]`, `focus:border-[#0e639c]` | Token colors |
| Import button | 363 | `bg-[#0e639c]`, `hover:bg-[#1177bb]` | Token colors |
| NO `rounded-lg` on container | 199 | Sharp corners | Add `rounded-lg` |

---

### C6. `AIWorkflowPanel.tsx` — 509 lines
**Location**: `src/components/AI/AIWorkflowPanel.tsx`

| Issue | Line(s) | Current | Should Be |
|-------|---------|---------|-----------|
| Outer panel | 221 | `bg-[#252526] border-white/10` | `bg-app-panel border-app-border` |
| Header border | 222 | `border-white/5` | `border-app-border` |
| Action cards | 45, 73, 98, 138 | `bg-[#1e1e1e] border-white/5` | `bg-app-bg border-app-border` |
| Bot icon color | 46 | `text-[#0e639c]` | `text-app-accent` |
| Start button | 56-57 | `bg-[#0e639c] hover:bg-[#1177bb]` | `bg-app-accent hover:bg-app-accent-hover` |
| Merge info text | 181 | `bg-[#1a1a1a]` | `bg-app-bg` |
| GitPushFlow container | 380 | `bg-[#1e1e1e] border-white/10` | Token colors |
| GitPushFlow footer | 484 | `bg-[#1e1e1e]`, `border-white/5` | Token colors |
| Select content | 402 | `bg-[#2d2d2d] border-white/10` | Token colors |
| Tag card | 415, 464 | `bg-[#252526] border-white/5` | Token colors |
| Bump type buttons | 430, 439, 448 | `bg-[#0e639c]/20 border-[#0e639c] text-[#0e639c]` | Token colors |
| Git output log | 476 | `bg-black border-white/5` | `bg-app-bg border-app-border` |
| `text-[11px]` usage | 409, 419, 467, 475 | Inconsistent | Use `text-xs` |

---

## 🟡 Medium Component Issues

---

### M1. `GitSourceControl.tsx` — 1063 lines
**Location**: `src/components/Git/GitSourceControl.tsx`

| Issue | Line(s) | Current | Should Be |
|-------|---------|---------|-----------|
| Stash badge `text-[8px]` | 552 | Illegibly small | `text-2xs` (11px) |
| Merge modal | 755-800 | Mix of custom styling | Consistent Dialog component |
| Count badges | 655, 698 | `bg-white/10 text-[10px]` | Proper Badge component |
| Section headers `text-[10px]` | 654, 697 | Too small | `text-xs` |
| File path `text-[10px]` | 672, 733 | Too small | `text-xs text-app-text-muted` |
| Status badge `text-[10px]` | 680, 744 | Too small | `text-xs` |
| Empty state | 749 | `text-[10px]` | `text-xs` |
| Action buttons inconsistent | Various | Plain `<button>` tags | Use `Button` component |
| Commit input | 578 | `bg-app-bg border-app-border` | ✅ Already using tokens (rare!)|
| Generate button `text-[10px]` | 592 | Too small | `text-xs` |

---

### M2. `GitGraph.tsx` — 349 lines
**Location**: `src/components/Git/GitGraph.tsx`

| Issue | Line(s) | Current | Should Be |
|-------|---------|---------|-----------|
| Commit dots `w-3 h-3` | 225 | Too small | `w-3.5 h-3.5` or `w-4 h-4` |
| Hover `hover:bg-white/5` | 209 | Too subtle | `hover:bg-app-surface-hover` |
| Section header `text-[10px]` | 167 | Too small & sparse | `text-xs` with icon |
| Branch filter native `<select>` | 179-188 | Ugly native element | Custom Select component |
| Expanded detail | 276 | `bg-app-bg border-app-border` | Already decent |
| "Copy Hash" / "View Diff" buttons | 302, 313 | `text-[10px]` raw buttons | Proper `Button` variant="ghost" |
| Connection lines `w-0.5 bg-neutral-700` | 221 | Too thin, too dark | `w-px bg-neutral-600` or variable |
| Merge indicator position | 234 | `w-2 h-0.5 bg-purple-500` hardcoded | Token color |
| Ref badges inline styling | 250-259 | `style={{ backgroundColor, color, border }}` | Tailwind classes or CSS vars |
| "Load more" button | 334-342 | `text-neutral-500 hover:text-white text-xs` | Styled link or button |

---

### M3. `GitBranchSelector.tsx` — 316 lines
**Location**: `src/components/Git/GitBranchSelector.tsx`

| Issue | Line(s) | Current | Should Be |
|-------|---------|---------|-----------|
| Error checkout `text-[10px]` | 207 | Too small | `text-xs` |
| Select Branch label `text-[10px]` | 190 | Too small | `text-xs` |
| Refresh button `text-[10px]` | 197 | Too small | Use icon-only button |
| Section labels `text-[10px]` | 217, 251 | Too small | `text-xs` |
| Trigger button | 181 | Very long className string | Extract to component/util |
| Dropdown content | 188 | `bg-app-panel/95 backdrop-blur-2xl` | ✅ Good glassmorphism usage |
| New branch input | 279 | Good focus states | ✅ Decent |

---

### M4. `FileTree.tsx` — 634 lines
**Location**: `src/components/Editor/FileTree.tsx`

| Issue | Line(s) | Current | Should Be |
|-------|---------|---------|-----------|
| Search modal excellent ✅ | 481-628 | Spotlight-inspired design | ✅ Good |
| File tree item `h-7` | 329 | OK for density | Consider `h-8` for easier clicking |
| Selected item `bg-white/10` | 329 | Hardcoded | `bg-app-accent/10` for accent consistency |
| Action buttons `h-5 w-5` | 396, 410 | Very small | OK for condensed layout |
| Empty state | 431-435 | Too plain | Add folder illustration |
| `font-geist` spam | 355, 367, 389, 432, 464 | Should remove | Inherited from body |
| File size `text-neutral-600` | 367 | Hardcoded | `text-app-text-disabled` |
| Keyboard hints `bg-white/5` | 613, 617, 622 | ✅ Good | Already looks clean |

---

### M5. `FileViewer.tsx` — 126 lines
**Location**: `src/components/Editor/FileViewer.tsx`

| Issue | Line(s) | Current | Should Be |
|-------|---------|---------|-----------|
| Header `bg-black/10` | 92 | Hardcoded | `bg-app-surface-1` |
| File path `text-[10px]` | 95 | Too small | `text-xs` |
| `font-geist` on elements | 83, 87, 94, 95, 120 | Remove | Inherited |
| Loading text | 83 | Plain text | Add spinner |
| Error text | 87 | `text-red-500` | More informative error card |

---

### M6. `MarkdownPreview.tsx` — 78 lines
**Location**: `src/components/Editor/MarkdownPreview.tsx`

| Issue | Line(s) | Current | Should Be |
|-------|---------|---------|-----------|
| View toggle `bg-neutral-800` | 51 | Hardcoded | `bg-app-surface-2` |
| Active state `bg-neutral-700` | 56, 67 | Hardcoded | `bg-app-surface-3` |
| Text colors `text-neutral-400` | 57, 69 | Hardcoded | `text-app-text-muted` |
| Generally clean ✅ | Overall | Small, focused | Minor token fixes |

---

### M7. `CommitDiffViewer.tsx` — 174 lines
**Location**: `src/components/Git/CommitDiffViewer.tsx`

| Issue | Line(s) | Current | Should Be |
|-------|---------|---------|-----------|
| Commit hash badge `text-[10px]` | 140 | Too small | `text-xs` |
| File path `text-[10px]` | 144 | Too small | `text-xs` |
| `font-geist` on elements | 118, 126, 137, 169 | Remove | Inherited |
| Background `bg-black/10` | 134 | Hardcoded | Token |
| Otherwise decent ✅ | Overall | Uses tokens mostly | Minor fixes |

---

### M8. `DiffViewer.tsx` (Git) — 181 lines
**Location**: `src/components/Git/DiffViewer.tsx`

| Issue | Line(s) | Current | Should Be |
|-------|---------|---------|-----------|
| Code styling clean ✅ | Overall | Uses app tokens | Minor fixes |
| Hardcoded `bg-neutral-800/50` | 133 | Not token | `bg-app-surface-2` |
| `border-neutral-800` | 152 | Hardcoded | `border-app-border` |
| `font-geist` | 108 | Remove | Inherited |

---

### M9. `TaskDetailModal.tsx` — 451 lines
**Location**: `src/components/Kanban/TaskDetailModal.tsx`

| Issue | Line(s) | Current | Should Be |
|-------|---------|---------|-----------|
| Modal backdrop `bg-black/80` | 155 | Inconsistent with others (`bg-black/60`) | Standardize |
| `font-geist` on every label | 160, 179, 189, etc. | ~20 instances | Remove |
| Input styling `bg-app-sidebar` | 184, 193 | ✅ Uses tokens | Decent |
| Native `<select>` | 200-208 | Ugly native dropdown | Custom Select component |
| Priority colors function | 146-152 | Hardcoded switch | Use constants from `constants.ts` |
| Delete confirm inline | 343-351 | Inline confirmation | Modal or popover |
| AI status section `bg-yellow-500/5 border-yellow-500/10` | 244 | Barely visible | More prominent indicator card |

---

### M10. `CostTrackingDashboard.tsx` — 209 lines
**Location**: `src/components/Router/CostTrackingDashboard.tsx`

| Issue | Line(s) | Current | Should Be |
|-------|---------|---------|-----------|
| All stat cards `bg-[#2d2d2d]` | 94, 103, 112, 161 | Hardcoded hex | `bg-app-sidebar` or `bg-app-surface-2` |
| Label text `text-[#858585]` | 95, 104, 113, 183, 187, 191, 195 | Hardcoded VS Code colors | `text-app-text-muted` |
| Loading text `text-[#858585]` | 145 | Hardcoded | Token |
| Empty state `text-[#858585]` | 147 | Hardcoded | Token |
| Status badges hardcoded | 166-174 | Direct color classes | Token system |
| Uses Dialog component ✅ | 84-206 | Proper component | Good |

---

### M11. `ToolSuggestions.tsx` — 293 lines
**Location**: `src/components/MCP/ToolSuggestions.tsx`

| Issue | Line(s) | Current | Should Be |
|-------|---------|---------|-----------|
| Uses `muted-foreground` | 81, 96, 193, 200, etc. | shadcn tokens (correct!) | ✅ Good |
| Uses `bg-muted/30`, `bg-muted/50` | 247-262 | shadcn tokens | ✅ Good |
| Error items `bg-red-500/10 border-red-500/20` | 283 | Direct color | OK for errors |
| **Most consistent component** ✅ | Overall | Uses shadcn design tokens | Rare example of good practice |

---

### M12. `AIActivityIndicator.tsx` — 156 lines
**Location**: `src/components/Kanban/AIActivityIndicator.tsx`

| Issue | Line(s) | Current | Should Be |
|-------|---------|---------|-----------|
| Terminal bg `bg-[#0d0d0d]` | 116 | Too dark, hardcoded | `bg-app-bg` |
| Action labels inline | 77-93 | Hardcoded keyword detection | OK for logic, but styling mixed |
| Yellow divider `text-yellow-500/70` | 121 | Hardcoded | Token |
| Green cursor `bg-green-500` | 131 | Static terminal cursor | Fine for terminal aesthetic |
| `font-geist` on elements | 100, 108, 147 | Remove | Inherited |
| Output area `border-app-border` | 116 | ✅ Uses token | Good |

---

### M13. `TerminalPanel.tsx` — 269 lines
**Location**: `src/components/TerminalPanel.tsx`

| Issue | Line(s) | Current | Should Be |
|-------|---------|---------|-----------|
| Tab active `bg-app-accent/20 text-app-accent` | 126 | ✅ Uses tokens | Good |
| Tab shadow magic string | 126 | `shadow-[0_0_8px_rgba(255,255,255,0.05)]` | `shadow-sm` or token |
| Split view button | 157 | Mixed active/inactive styles | Consistent toggle component |
| Close tab `w-4 h-4` | 142 | Small hit target | OK for compact tabs |
| Resize handle | 106-110 | Invisible → visible on hover | ✅ Good UX pattern |
| Empty state | 256-260 | Plain icon + text | Add terminal illustration |
| Kill terminal `hover:bg-red-400/20 hover:text-red-400` | 183 | Hardcoded | Token for danger |
| `font-geist` | 116, 124, 258 | Remove | Inherited |
| `text-[10px]` on tab labels | 124 | Too small | `text-xs` |

---

## 🟢 Low Priority Issues

---

### L1. `ImageInput.tsx` — 295 lines (shared)
**The cleanest component** — mostly uses tokens correctly.

| Issue | Line(s) | Current | Should Be |
|-------|---------|---------|-----------|
| Border on images `border-app-border` | 136 | ✅ Token | Good |
| Loader `text-app-accent` | 281 | ✅ Token | Good |
| Remove button `bg-red-500/80` | 146, 287 | Direct color | OK for danger action |
| Only minor `text-neutral-*` usage | Various | Hardcoded neutrals | Could use tokens |

---

### L2. `Board.tsx` — 351 lines
Already reviewed in previous analysis. Main issues: drag overlay styling, absolute positioning.

---

## 📐 Proposed Design Direction

### New CSS Variable System
```css
:root {
  /* ─── Base Surfaces ─── */
  --app-bg: #0f1117;
  --app-panel: #161922;
  --app-sidebar: #131620;
  --app-titlebar: #0d0f14;
  
  /* ─── Surface Layers (replaces white/N and black/N) ─── */
  --app-surface-1: rgba(255, 255, 255, 0.03);
  --app-surface-2: rgba(255, 255, 255, 0.05);
  --app-surface-3: rgba(255, 255, 255, 0.08);
  --app-surface-hover: rgba(255, 255, 255, 0.10);
  --app-surface-active: rgba(255, 255, 255, 0.14);
  
  /* ─── Overlays (replaces bg-black/60, bg-black/80, etc.) ─── */
  --app-overlay-dim: rgba(0, 0, 0, 0.5);
  --app-overlay-heavy: rgba(0, 0, 0, 0.7);
  --app-overlay-opaque: rgba(0, 0, 0, 0.85);
  
  /* ─── Borders (replaces border-white/5, border-white/10) ─── */
  --app-border: rgba(255, 255, 255, 0.06);
  --app-border-highlight: rgba(255, 255, 255, 0.12);
  --app-border-focus: rgba(59, 130, 246, 0.5);
  
  /* ─── Accent ─── */
  --app-accent: #3b82f6;
  --app-accent-hover: #60a5fa;
  --app-accent-muted: rgba(59, 130, 246, 0.08);
  --app-accent-glow: rgba(59, 130, 246, 0.15);
  
  /* ─── Text Hierarchy ─── */
  --app-text: #e8eaed;
  --app-text-secondary: #8b95a5;
  --app-text-muted: #5b6478;
  --app-text-disabled: #3d4556;
  
  /* ─── Semantic Colors ─── */
  --app-success: #22c55e;
  --app-warning: #f59e0b;
  --app-danger: #ef4444;
  --app-info: #3b82f6;
  
  /* ─── Typography Scale ─── */
  --font-2xs: 0.6875rem;  /* 11px */
  --font-xs: 0.75rem;     /* 12px */
  --font-sm: 0.8125rem;   /* 13px */
  --font-base: 0.875rem;  /* 14px */
  --font-lg: 0.9375rem;   /* 15px */
  --font-xl: 1.0625rem;   /* 17px */
  --font-2xl: 1.25rem;    /* 20px */
  --font-3xl: 1.5rem;     /* 24px */
  
  /* ─── Motion ─── */
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --ease-smooth: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-snap: cubic-bezier(0.2, 0, 0, 1);
  --duration-fast: 150ms;
  --duration-normal: 250ms;
  --duration-slow: 400ms;
}
```

### Tailwind Config Additions
```js
// Add to tailwind.config.js theme.extend.colors
'surface-1': 'var(--app-surface-1)',
'surface-2': 'var(--app-surface-2)',
'surface-3': 'var(--app-surface-3)',
'surface-hover': 'var(--app-surface-hover)',
'surface-active': 'var(--app-surface-active)',
'overlay-dim': 'var(--app-overlay-dim)',
'overlay-heavy': 'var(--app-overlay-heavy)',
'overlay-opaque': 'var(--app-overlay-opaque)',

// Add fontSize scale
fontSize: {
  '2xs': ['var(--font-2xs)', { lineHeight: '1.4' }],
}
```

---

## 🗺️ Implementation Roadmap (Updated)

### Phase 1: Foundation (2-3 hours)
1. ✍️ Update `globals.css` — new CSS variables + animation tokens
2. ✍️ Update `tailwind.config.js` — extend theme with new tokens  
3. ✍️ Set `font-family: 'Geist'` on body, remove all `font-geist` instances
4. ✍️ Global find-replace: `text-[9px]` → `text-2xs`, `text-[10px]` → `text-xs`
5. ✍️ Update `button.tsx` — remove hardcoded hex, use tokens

### Phase 2: Hex Color Purge (2 hours)
6. ✍️ `TaskImporter.tsx` — Replace all 20+ hex colors with tokens
7. ✍️ `AIWorkflowPanel.tsx` — Replace all 15+ hex colors with tokens
8. ✍️ `DiffViewer.tsx` (main) — Replace all hex colors
9. ✍️ `CostTrackingDashboard.tsx` — Replace hex colors
10. ✍️ `AIActivityIndicator.tsx` — Replace `bg-[#0d0d0d]`

### Phase 3: Core UI Redesign (3-4 hours)
11. ✍️ `TaskCreatorChat.tsx` — Chat bubbles, empty state, typing indicator
12. ✍️ `TaskCard.tsx` — Gradient bg, priority stripe, AI state glow
13. ✍️ `KanbanColumn.tsx` — Header refinement, drop indicator
14. ✍️ `TaskDetailModal.tsx` — Replace native select, modal transitions

### Phase 4: Git Components (2 hours)
15. ✍️ `GitGraph.tsx` — Larger nodes, custom select, better hover
16. ✍️ `GitSourceControl.tsx` — Standardize button usage, fix sizes
17. ✍️ `GitBranchSelector.tsx` — Fix tiny text sizes
18. ✍️ `CommitDiffViewer.tsx` — Minor text size fixes

### Phase 5: Polish (1-2 hours)
19. ✍️ `TerminalPanel.tsx` — Tab refinement, empty state
20. ✍️ `FileTree.tsx` — Selected state accent, empty state
21. ✍️ `FileViewer.tsx`, `MarkdownPreview.tsx` — Token cleanup
22. ✍️ `WelcomeScreen.tsx` — Branded hero, card hover effects
23. ✍️ Add modal enter/exit animations globally
24. ✍️ Standardize scrollbar, focus, selection styles
25. ✍️ Replace all remaining `border-white/5`, `border-white/10` → `border-app-border`
26. ✍️ Replace all remaining `bg-white/5`, `bg-white/10` → surface tokens

---

## 📊 Impact Summary

| Metric | Current | After Fix |
|--------|---------|-----------|
| Hardcoded hex colors | ~80+ instances | 0 |
| `text-[10px]` / `text-[9px]` usage | ~55 instances | 0 |
| `font-geist` class spam | ~200+ instances | 0 (body-level) |
| `border-white/N` usage | ~67 instances | 0 (all `border-app-border`) |
| CSS variable usage rate | ~40% | 100% |
| Modal animations | 0 components | All modals |
| Chat bubbles | 0 (raw text) | Proper bubbles |
| Native `<select>` elements | 3 instances | 0 (custom components) |
| Components using design tokens consistently | ~3/26 | 26/26 |

---

> **Rekomendasi**: Mulai dari **Phase 1 + Phase 2** karena ini murni find-replace yang tidak mengubah layout atau behavior, tapi memberikan dampak visual terbesar. Phase 3 baru menyentuh struktur komponen.
