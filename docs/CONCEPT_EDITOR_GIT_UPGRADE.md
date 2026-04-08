# 🎨 Konsep: Editor + MD Preview + Git Upgrade

> Design document untuk upgrade fitur editor dan git di Akira.
> Dokumen ini berisi konsep UI, data flow, dan arsitektur komponen.

---

## 📐 Layout Overview

Saat ini layout Files page di Akira:

```
┌─────────────────────────────────────────────────────────────────────┐
│  Title Bar  [Folder Icon] Workspace Name    [Engine ▾] [Switch]    │
├──────┬──────────────────────────────────────────┬───────────────────┤
│      │                                          │                   │
│  S   │          FILE TREE (300px)                │   GIT SOURCE      │
│  I   │          ├── src/                        │   CONTROL (300px)  │
│  D   │          │   ├── components/             │                   │
│  E   │          │   ├── lib/                    │   [Stage/Unstage]  │
│  B   │          │   └── App.tsx                 │   [Diff View]      │
│  A   │          ├── src-tauri/                  │                   │
│  R   │          └── package.json                │                   │
│      │                                          │                   │
│      ├──────────────────────────────────────────┤                   │
│      │          EDITOR / PREVIEW AREA           │                   │
│      │          (Monaco / MD Preview)           │                   │
│      │                                          │                   │
└──────┴──────────────────────────────────────────┴───────────────────┘
```

### Layout Setelah Upgrade:

```
┌─────────────────────────────────────────────────────────────────────┐
│  Title Bar  [Folder Icon] Workspace Name    [Engine ▾] [Switch]    │
├──────┬──────────────────────────────────────────┬───────────────────┤
│      │  ┌─── File Tabs ──────────────────────┐  │  SOURCE CONTROL   │
│  S   │  │ App.tsx │ README.md 👁 │ main.rs  │  │  ┌─────────────┐  │
│  I   │  ├────────────────────────────────────┤  │  │ Message... ⌘│  │
│  D   │  │                                    │  │  │ [Generate🤖]│  │
│  E   │  │  ┌──────────┐                     │  │  │ [✓ Commit ▾]│  │
│  B   │  │  │ FILE     │  EDITOR/PREVIEW     │  │  ├─────────────┤  │
│  A   │  │  │ TREE     │                     │  │  │ ▾ Changes  5│  │
│  R   │  │  │ (250px)  │  • .md → Preview    │  │  │  M file.ts  │  │
│      │  │  │          │  • .ts → Monaco     │  │  │  U new.tsx   │  │
│      │  │  │          │  • .rs → Monaco     │  │  │  D old.css   │  │
│      │  │  │          │                     │  │  ├─────────────┤  │
│      │  │  └──────────┘                     │  │  │ GIT GRAPH   │  │
│      │  │                                    │  │  │ ● commit 1  │  │
│      │  │                                    │  │  │ ● commit 2  │  │
│      │  │                                    │  │  │ ●─┐ merge   │  │
│      │  │                                    │  │  │ │ ● fix...  │  │
│      │  └────────────────────────────────────┘  │  └─────────────┘  │
├──────┴──────────────────────────────────────────┴───────────────────┤
│  Terminal Panel (collapsible)                                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 📄 Feature 1: Markdown Preview

### Konsep UI

Ketika file `.md` dibuka, tampilkan rich preview dengan opsi toggle ke raw code:

```
┌──────────────────────────────────────────────────────┐
│  README.md                   [Code] [Preview] [Split]│  ← Toggle buttons
├──────────────────────────────────────────────────────┤
│                                                      │
│  # 🎯 Core Concept: Workspaces                      │  ← Rendered h1
│                                                      │
│  > **Akira** is built around the concept of          │  ← Blockquote
│  > **Workspaces**.                                   │
│                                                      │
│  ┌────────────────────────────────────────────┐      │
│  │ Layer       │ Technology                   │      │  ← Rendered table
│  ├─────────────┼────────────────────────────┤      │
│  │ Framework   │ Tauri v2                    │      │
│  │ Frontend    │ React 19 + TypeScript       │      │
│  │ Backend     │ Rust                        │      │
│  └────────────────────────────────────────────┘      │
│                                                      │
│  ```typescript                                       │
│  function hello() {                                  │  ← Syntax highlighted
│    console.log("Hello, Akira!")                      │     code block
│  }                                                   │
│  ```                                                 │
│                                                      │
│  > [!NOTE]                                           │
│  > ┌─────────────────────────────────────────┐       │  ← GitHub alert
│  > │ ℹ️  This is an important note about...  │       │     (styled box)
│  > └─────────────────────────────────────────┘       │
│                                                      │
│  - [x] Task completed                                │  ← Checkboxes
│  - [ ] Task pending                                  │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### Komponen: `MarkdownPreview.tsx`

```
Props:
  - content: string          // Raw markdown content
  - filePath: string         // For relative image/link resolution
  - className?: string

Dependencies (sudah installed):
  - react-markdown           // Core renderer
  - remark-gfm              // Tables, strikethrough, task lists
  - remark-breaks            // Line breaks
  - rehype-highlight         // Syntax highlighting code blocks

Styling:
  - Dark theme matching Akira design
  - prose-invert (Tailwind typography plugin — sudah installed)
  - Custom CSS untuk:
    - GitHub-style alerts (> [!NOTE], [!WARNING], dll.)
    - Table styling (zebra stripes, dark bg)
    - Code block (dark bg, border, rounded corners)
    - Task lists (checkboxes)
    - Heading anchors
    - Image rendering (lazy load)
```

### Komponen: `FileViewer.tsx` (Modified)

```
Perubahan:
  1. Detect extension:
     - .md, .markdown → MarkdownPreview
     - lainnya → Monaco Editor (current behavior)
  
  2. View mode state:
     - 'code'    → Monaco Editor (raw markdown)
     - 'preview' → MarkdownPreview (rendered)
     - 'split'   → Side-by-side (optional, phase 2)
  
  3. Toggle buttons di header bar:
     [Code] [Preview] [Split]
     
  4. Default mode untuk .md: 'preview'
  5. Keyboard shortcut: Cmd+Shift+V → toggle preview
```

### Data Flow

```
User clicks .md file in FileTree
  → handleFileOpen(path) [App.tsx]
    → setOpenFiles([...files, { path, name }])
    → setActiveFileIndex(newIndex)
      → FileViewer receives filePath prop
        → FileViewer detects .md extension
          → if viewMode === 'preview':
              → invoke('read_file', { path })
              → <MarkdownPreview content={rawContent} />
          → if viewMode === 'code':
              → <Editor ... /> (Monaco, current behavior)
```

---

## 📝 Feature 2: Source Control + AI Commit

### Konsep UI

Upgrade panel Source Control dengan commit area di bagian atas:

```
┌──────────────────────────────────────────┐
│  Source Control              [↻] [⊕] [≡] │  ← Header
├──────────────────────────────────────────┤
│                                          │
│  ▾ akira                  main*  ⊕ ✓ ↻  │  ← Repo header (multi-repo ready)
│  ┌──────────────────────────────────────┐│
│  │ Message (⌘Enter to commit)          ││  ← Placeholder text
│  │                                      ││  ← Textarea (resizable)
│  │                                      ││
│  └──────────────────────────────────────┘│
│         [Generate 🤖]   [✓ Commit  ▾]   │  ← Action buttons
│                          ├─ Commit       │
│                          ├─ Commit & Push│  ← Dropdown menu
│                          └─ Amend        │
│                                          │
│  ▾ Staged Changes                    2   │  ← Existing (sudah ada)
│    M  queryRouter.ts    src/lib      [−] │
│    M  config.json       akira/.akira [−] │
│                                          │
│  ▾ Changes                           3   │  ← Existing (sudah ada)
│    M  TOKEN_OPT...MD    akira/       [+] │
│    TS promptCompr...ts  akira/src/lib[+] │
│    U  aiChatStore.ts    akira/src/st [+] │
│                                          │
├──────────────────────────────────────────┤
│  ▸ Git Graph                        ▾   │  ← Collapsible section
└──────────────────────────────────────────┘
```

### "Generate" Button Flow

```
User clicks [Generate 🤖]
  │
  ├─ Check staged files
  │   ├─ If staged files > 0:
  │   │     → invoke('git_get_staged_diff', { cwd })
  │   └─ If no staged files:
  │         → invoke('git_get_diff', { cwd }) // all changes
  │
  ├─ Get diff content (trimmed to ~2000 chars max)
  │
  ├─ Call Groq API (free, fast):
  │     System: "You are a git commit message generator. 
  │              Generate a concise conventional commit message.
  │              Format: type(scope): description
  │              Types: feat, fix, refactor, docs, style, test, chore
  │              Keep it under 72 characters.
  │              Reply ONLY with the commit message, nothing else."
  │     User:   "Generate commit message for:\n{diff}"
  │
  ├─ Receive response → Set commit message textarea
  │
  └─ UI: Button shows spinner while generating
```

### Commit Button Actions

```
[✓ Commit] (default action)
  → invoke('git_commit', { cwd, message })
  → fetchStatus()
  → clear commit message
  → toast.success("Committed: {message}")

[▾ Dropdown Menu]
  ├─ Commit
  │   → Same as default
  │
  ├─ Commit & Push
  │   → git_commit → git_push
  │   → toast.success("Committed and pushed")
  │
  ├─ Commit & Sync
  │   → git_commit → git_push → git pull (fetch latest)
  │
  └─ Amend Last Commit
      → invoke('git_commit', { cwd, message, amend: true })
      → Uses --amend flag
```

### Perubahan di `GitSourceControl.tsx`

```
State baru:
  - commitMessage: string
  - isGenerating: boolean  (loading state for AI generate)
  - commitAction: 'commit' | 'commit-push' | 'commit-sync' | 'amend'

Komponen baru di render:
  1. Textarea untuk commit message (sebelum staged/changes list)
  2. "Generate" button → call commitMessage.ts utility
  3. "Commit" button with dropdown menu
  4. Badge counter untuk staged files count

Keyboard shortcuts:
  - Cmd+Enter → Commit (saat focus di textarea)
```

### Utility: `commitMessage.ts`

```typescript
// src/lib/commitMessage.ts

interface CommitMessageOptions {
  diff: string;
  groqApiKey?: string;  // Optional, uses env var GROQ_API_KEY fallback
  language?: 'en' | 'id';  // Commit language preference
}

export async function generateCommitMessage(options: CommitMessageOptions): Promise<string> {
  // 1. Trim diff to max 2000 chars (cost optimization)
  // 2. Call Groq API with llama-3.1-8b-instant
  // 3. Parse response
  // 4. Return formatted commit message
}

// Fallback: Simple pattern-based generation (no API needed)
export function generateSimpleCommitMessage(stagedFiles: GitFileStatus[]): string {
  // Based on file types and status:
  // - M only .ts/.tsx files → "refactor: update ..."
  // - A new files → "feat: add ..."
  // - D deleted files → "chore: remove ..."
  // - Mix → "chore: update multiple files"
}
```

---

## 🌳 Feature 3: Git Graph

### Konsep UI

Panel collapsible di bawah Changes list, menampilkan visual commit history:

```
┌──────────────────────────────────────────┐
│  ▾ Git Graph                [branch ▾]   │  ← Collapsible header + branch filter
├──────────────────────────────────────────┤
│                                          │
│  ● feat: integrate Groq API   ⓜ main    │  ← Current commit (bright dot)
│  │   rf • 2 hours ago                    │     Author + time
│  │                                       │
│  ● feat: add skill recommend...          │  ← Regular commit
│  │   rf • 5 hours ago                    │
│  │                                       │
│  ● feat: implement automated git...      │
│  │   rf • yesterday                      │
│  │                                       │
│  ●─┐ Merge branch 'task/fix-from...'    │  ← Merge commit (two lines join)
│  │ │   rf • yesterday                    │
│  │ │                                     │
│  │ ● feat: Fix 'from branch' display    │  ← Branch commit (indented, diff color)
│  │ │   rf • yesterday                    │
│  │ │                                     │
│  │ ● feat: add merged_to_branch field   │
│  │ │   rf • 2 days ago                   │
│  │ │                                     │
│  ●─┘ refactor: improve chat layout...   │  ← Branch merge point
│  │   rf • 2 days ago                     │
│  │                                       │
│  ● refactor: update system prompts...    │
│  │   rf • 3 days ago                     │
│  │                                       │
│  ● feat: implement chat persistence...   │
│  │   rf • 3 days ago                     │
│  │                                       │
│  [Load more...]                          │  ← Pagination
│                                          │
└──────────────────────────────────────────┘
```

### Interaksi

```
Click pada commit row:
  → Expand commit detail:
    ┌──────────────────────────────────────┐
    │  ● feat: integrate Groq API   main   │
    │  │   Rifki Okta • 2 hours ago        │
    │  │   Hash: a1b2c3d                   │
    │  │                                   │
    │  │   Changed files:                  │
    │  │     M  src/lib/groq.ts            │  ← Click → open diff
    │  │     M  src/store/aiChatStore.ts   │
    │  │     A  src/lib/queryRouter.ts     │
    │  │                                   │
    │  │   [View Full Diff] [Copy Hash]    │
    │  └───────────────────────────────────┘

Double-click / Enter pada commit:
  → Open full diff view of that commit
```

### Rust Command: `git_log`

```rust
// src-tauri/src/commands/git.rs — tambah command baru

#[derive(Serialize)]
pub struct GitLogEntry {
    hash: String,           // Short hash (7 chars)
    full_hash: String,      // Full SHA
    message: String,        // Commit message (first line)
    author: String,         // Author name
    email: String,          // Author email
    date: String,           // Relative date ("2 hours ago")
    date_iso: String,       // ISO date for sorting
    parents: Vec<String>,   // Parent hashes (for merge detection)
    refs: Vec<String>,      // Branch/tag labels ["main", "origin/main"]
    is_merge: bool,         // parents.len() > 1
}

#[tauri::command]
pub async fn git_log(
    cwd: String, 
    count: Option<u32>,     // Default 50
    branch: Option<String>, // Filter by branch, default "--all"
) -> Result<Vec<GitLogEntry>, String> {
    // Execute: git log --format="%H|%h|%s|%an|%ae|%ar|%aI|%P|%D" --all -50
    // Parse each line into GitLogEntry
    // Return structured data
}
```

### Komponen: `GitGraph.tsx`

```
Props:
  - maxEntries?: number     // Default 30
  - onCommitClick?: (hash: string) => void

State:
  - commits: GitLogEntry[]
  - loading: boolean
  - expandedCommit: string | null  // Hash of expanded commit
  - selectedBranch: string | null  // Branch filter

Render approach:
  - Simple list-based (NOT full SVG graph — keep it simple first)
  - Left column: colored dots + vertical lines (CSS borders)
  - Right column: commit info (message, author, date, refs)
  - Merge commits: show indented sub-branch
  
Color scheme:
  - main/master: green (#4ade80)
  - feature branches: cyan (#22d3ee)  
  - fix branches: yellow (#facc15)
  - merge commits: purple (#a78bfa)
  - HEAD: bright with glow effect
```

### Graph Line Rendering (CSS approach)

```
Setiap commit row adalah flex container:

┌─────────────────────────────────────────────┐
│ [GRAPH COLUMN 40px] │ [CONTENT COLUMN flex] │
│                     │                       │
│   ●                 │  feat: add feature    │
│   │                 │  rf • 2h ago          │
│                     │                       │
└─────────────────────────────────────────────┘

Graph Column rendering:
  - Single parent (linear):
      │
      ●    → border-left + dot
      │
      
  - Merge (2 parents):
      │
      ●─┐  → border-left + dot + branch-right
      │ │
      
  - Branch end:
      │ │
      ●─┘  → border-left + dot + merge-from-right
      │

CSS:
  .graph-line { border-left: 2px solid var(--branch-color); }
  .graph-dot  { width: 10px; height: 10px; border-radius: 50%; }
  .graph-branch { border-top: 2px solid ...; border-right: 2px solid ...; }
```

---

## 🔄 Data Flow Summary

```
┌─────────────────┐
│   User Action    │
└────────┬────────┘
         │
    ┌────▼─────────────────────────────────────────┐
    │                FRONTEND (React)               │
    │                                               │
    │  FileViewer                                   │
    │  ├─ .md files → MarkdownPreview              │
    │  └─ other files → Monaco Editor              │
    │                                               │
    │  GitSourceControl                             │
    │  ├─ Commit message textarea                  │
    │  ├─ [Generate] → commitMessage.ts → Groq API │
    │  ├─ [Commit ▾] → invoke('git_commit')        │
    │  ├─ Stage/Unstage files (existing)            │
    │  └─ GitGraph (collapsed section)             │
    │     └─ invoke('git_log') → render graph      │
    │                                               │
    └────────────────────┬──────────────────────────┘
                         │  Tauri IPC (invoke)
    ┌────────────────────▼──────────────────────────┐
    │              BACKEND (Rust)                    │
    │                                               │
    │  commands/git.rs                              │
    │  ├─ git_status        (existing)              │
    │  ├─ git_commit        (existing)              │
    │  ├─ git_push          (existing)              │
    │  ├─ git_get_staged_diff (existing)            │
    │  └─ git_log           (NEW)                  │
    │                                               │
    │  commands/fs.rs                               │
    │  └─ read_file          (existing)             │
    │                                               │
    └───────────────────────────────────────────────┘
```

---

## 📋 File Changes Summary

### New Files
| File | Deskripsi |
|------|-----------|
| `src/components/Editor/MarkdownPreview.tsx` | Rich markdown rendering component |
| `src/lib/commitMessage.ts` | AI commit message generation utility |
| `src/components/Git/GitGraph.tsx` | Visual commit history component |
| `src/styles/markdown.css` | Custom styles untuk markdown preview |

### Modified Files
| File | Perubahan |
|------|-----------|
| `src/components/Editor/FileViewer.tsx` | Add .md detection + view mode toggle |
| `src/components/Git/GitSourceControl.tsx` | Add commit textarea, Generate button, Commit dropdown |
| `src-tauri/src/commands/git.rs` | Add `git_log` command |
| `src-tauri/src/commands/mod.rs` | Register `git_log` |
| `src-tauri/src/main.rs` | Register `git_log` in invoke_handler |

### No New Dependencies Needed
Semua dependency yang dibutuhkan **sudah ter-install**:
- ✅ `react-markdown` — Markdown rendering
- ✅ `remark-gfm` — GitHub Flavored Markdown
- ✅ `remark-breaks` — Line breaks
- ✅ `rehype-highlight` — Code syntax highlighting
- ✅ `@tailwindcss/typography` — Prose styling
- ✅ `marked` — Alternative parser (backup)

---

## ⏱️ Estimasi Implementasi

| Phase | Fitur | Effort | Priority |
|-------|-------|--------|----------|
| 1 | Markdown Preview | ~2-3 jam | 🔴 High (quick win) |
| 2 | Source Control + AI Commit | ~3-4 jam | 🔴 High |
| 3 | Git Graph (basic) | ~4-5 jam | 🟡 Medium |
| 4 | Git Graph (branch lines) | ~2-3 jam | 🟢 Nice to have |
| 5 | Split view (MD Preview) | ~1-2 jam | 🟢 Nice to have |

**Total estimasi: ~12-17 jam**

---

## 🎯 Acceptance Criteria

### Markdown Preview
- [ ] Buka `.md` file → render preview (bukan raw text)
- [ ] Toggle Code/Preview view
- [ ] Tables render dengan proper styling
- [ ] Code blocks punya syntax highlighting
- [ ] GitHub alerts ([!NOTE], [!WARNING]) render sebagai styled boxes
- [ ] Task lists render sebagai checkboxes
- [ ] Dark theme yang consistent dengan Akira

### Source Control + AI Commit
- [ ] Commit message textarea visible di atas changed files list
- [ ] "Generate" button menghasilkan commit message dari diff
- [ ] "Commit" button melakukan git commit
- [ ] Commit dropdown (Commit, Commit & Push, Amend)
- [ ] ⌘+Enter shortcut untuk commit
- [ ] Loading state saat generate

### Git Graph
- [ ] Tampilkan 30+ commit terakhir
- [ ] Commit dots + vertical lines
- [ ] Branch labels (main, feature/...) sebagai badges
- [ ] Merge commits ditandai visual
- [ ] Click commit → expand detail (changed files, hash)
- [ ] Relative date (2 hours ago, yesterday, etc.)
- [ ] "Load more" pagination
