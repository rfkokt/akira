# Korlap Feature Adoption Plan for Akira

> Dokumen perencanaan lengkap pengadopsian fitur-fitur Korlap ke Akira
> Dibuat: 15 April 2026
> Coverage: Low + Medium + High Priority

---

## 📋 Executive Summary

Dokumen ini berisi rencana implementasi lengkap fitur-fitur dari Korlap yang belum ada di Akira. Diurutkan dari Low Priority (nice to have) ke High Priority (must have), dengan detail teknis untuk setiap fitur.

---

## 🔴 HIGH PRIORITY (Must Have)

### 1. Git Worktree Isolation ⭐⭐⭐

**Deskripsi:** Setiap task punya git worktree terpisah untuk true isolation. Setiap task = isolated branch + working directory terpisah.

**Masalah yang Dipecahkan:**
- Conflict antar task yang berjalan parallel
- Working directory utama tetap clean
- Easy rollback (delete worktree)
- Bisa review diff sebelum merge ke main

**Fitur Detail:**
- Auto-create worktree saat task start
- Worktree di folder terpisah (`.akira/workspaces/<task-id>/`)
- Task branch isolated dari working directory utama
- Diff viewer untuk compare worktree vs base branch
- Auto-cleanup saat task complete/cancel

**Implementasi Teknis:**

```rust
// src-tauri/src/worktree.rs
use std::path::PathBuf;
use std::process::Command;

pub struct WorktreeManager {
    base_path: PathBuf,  // ~/Library/Application Support/Akira/workspaces/
}

impl WorktreeManager {
    pub fn create_worktree(
        &self,
        task_id: &str,
        repo_path: &str,
        base_branch: &str,
    ) -> Result<PathBuf, String> {
        let worktree_path = self.base_path.join(task_id);
        let branch_name = format!("akira/{}", task_id);
        
        // Create worktree
        Command::new("git")
            .args([
                "worktree", "add",
                "-b", &branch_name,
                worktree_path.to_str().unwrap(),
                &format!("origin/{}", base_branch),
            ])
            .current_dir(repo_path)
            .output()
            .map_err(|e| format!("Failed to create worktree: {}", e))?;
        
        Ok(worktree_path)
    }
    
    pub fn remove_worktree(&self, task_id: &str, repo_path: &str) -> Result<(), String> {
        let worktree_path = self.base_path.join(task_id);
        
        // Remove worktree
        Command::new("git")
            .args(["worktree", "remove", "--force", worktree_path.to_str().unwrap()])
            .current_dir(repo_path)
            .output()
            .map_err(|e| format!("Failed to remove worktree: {}", e))?;
        
        // Prune worktree list
        Command::new("git")
            .args(["worktree", "prune"])
            .current_dir(repo_path)
            .output()
            .map_err(|e| format!("Failed to prune worktree: {}", e))?;
        
        Ok(())
    }
    
    pub fn get_diff(&self, task_id: &str, base_branch: &str) -> Result<String, String> {
        let worktree_path = self.base_path.join(task_id);
        
        let output = Command::new("git")
            .args(["diff", &format!("origin/{}", base_branch), "HEAD"])
            .current_dir(&worktree_path)
            .output()
            .map_err(|e| format!("Failed to get diff: {}", e))?;
        
        String::from_utf8(output.stdout)
            .map_err(|e| format!("Invalid UTF-8 in diff: {}", e))
    }
}
```

```typescript
// Frontend: src/store/worktreeStore.ts
import { create } from 'zustand';

interface WorktreeState {
  worktrees: Record<string, {
    path: string;
    branch: string;
    status: 'creating' | 'ready' | 'error';
  }>;
  
  createWorktree: (taskId: string, baseBranch: string) => Promise<void>;
  removeWorktree: (taskId: string) => Promise<void>;
  getDiff: (taskId: string, baseBranch: string) => Promise<string>;
}

export const useWorktreeStore = create<WorktreeState>((set, get) => ({
  worktrees: {},
  
  createWorktree: async (taskId, baseBranch) => {
    set(state => ({
      worktrees: {
        ...state.worktrees,
        [taskId]: { path: '', branch: `akira/${taskId}`, status: 'creating' }
      }
    }));
    
    try {
      const path = await invoke<string>('create_worktree', { taskId, baseBranch });
      set(state => ({
        worktrees: {
          ...state.worktrees,
          [taskId]: { path, branch: `akira/${taskId}`, status: 'ready' }
        }
      }));
    } catch (error) {
      set(state => ({
        worktrees: {
          ...state.worktrees,
          [taskId]: { path: '', branch: '', status: 'error' }
        }
      }));
      throw error;
    }
  },
  
  removeWorktree: async (taskId) => {
    await invoke('remove_worktree', { taskId });
    set(state => {
      const { [taskId]: _, ...rest } = state.worktrees;
      return { worktrees: rest };
    });
  },
  
  getDiff: async (taskId, baseBranch) => {
    return await invoke<string>('get_worktree_diff', { taskId, baseBranch });
  }
}));
```

**Database Schema Update:**
```sql
-- Add worktree columns to tasks table
ALTER TABLE tasks ADD COLUMN worktree_path TEXT;
ALTER TABLE tasks ADD COLUMN worktree_branch TEXT;
ALTER TABLE tasks ADD COLUMN base_branch TEXT DEFAULT 'main';
```

**Directory Structure:**
```
~/Library/Application Support/Akira/
├── workspaces/
│   ├── task-uuid-1/          # Git worktree for task 1
│   │   ├── .git              # Git metadata (linked)
│   │   ├── src/
│   │   ├── package.json
│   │   └── ...
│   ├── task-uuid-2/          # Git worktree for task 2
│   └── ...
├── config/
│   └── settings.json
└── akira.db
```

**UI Changes:**
- Task card: show worktree status indicator (🌿 = isolated)
- Task detail: tab "Diff" untuk lihat changes
- Settings: worktree management (cleanup old worktrees)

**Integration Points:**
1. Task start → Create worktree → AI works in worktree
2. Task complete → Diff worktree → Create PR
3. Task cancel → Remove worktree → Cleanup

**Risks & Mitigations:**
| Risk | Impact | Mitigation |
|------|--------|------------|
| Disk space usage | High | Auto-cleanup worktrees > 30 days; warn if disk < 10GB |
| Slower git operations | Medium | Use git alternates untuk share object database |
| Worktree corruption | Medium | Backup mechanism; recreate worktree if error |

**Effort:** 5-7 hari
**Value:** Very High
**Priority:** P0

---

### 2. Code Editor (CodeMirror 6) ⭐⭐⭐

**Deskripsi:** Built-in code editor untuk view dan edit file langsung di Akira tanpa perlu buka IDE terpisah.

**Masalah yang Dipecahkan:**
- Context switching (buka VS Code hanya untuk edit 1-2 baris)
- Review AI changes tanpa keluar app
- Quick fixes langsung di diff view

**Fitur Detail:**
- Syntax highlighting untuk major languages (JS/TS, Rust, Python, Go, etc.)
- Line numbers dan minimap (opsional)
- Basic editing (edit, save, undo/redo)
- Auto-indentation
- Bracket matching
- Integration dengan diff viewer (accept/reject changes inline)

**Implementasi Teknis:**

```bash
# Install dependencies
npm install @codemirror/core @codemirror/state @codemirror/view
npm install @codemirror/lang-javascript @codemirror/lang-typescript
npm install @codemirror/lang-rust @codemirror/lang-python
npm install @codemirror/theme-one-dark
npm install @codemirror/commands @codemirror/search
npm install @codemirror/autocomplete @codemirror/lint
```

```typescript
// src/components/CodeEditor/CodeEditor.tsx
import { useEffect, useRef } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { javascript } from '@codemirror/lang-javascript';
import { rust } from '@codemirror/lang-rust';
import { python } from '@codemirror/lang-python';
import { invoke } from '@tauri-apps/api/core';

interface CodeEditorProps {
  filePath: string;
  workspaceId: string;
  readOnly?: boolean;
  onChange?: (content: string) => void;
  highlights?: Array<{ line: number; type: 'add' | 'del' | 'modify' }>;
}

const getLanguageExtension = (filename: string) => {
  if (filename.endsWith('.ts') || filename.endsWith('.tsx')) return javascript({ typescript: true });
  if (filename.endsWith('.js') || filename.endsWith('.jsx')) return javascript();
  if (filename.endsWith('.rs')) return rust();
  if (filename.endsWith('.py')) return python();
  // Add more languages as needed
  return [];
};

export function CodeEditor({ filePath, workspaceId, readOnly, onChange, highlights }: CodeEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!editorRef.current) return;

    // Load file content
    const loadContent = async () => {
      try {
        const content = await invoke<string>('read_file', { 
          path: filePath,
          workspaceId 
        });

        const state = EditorState.create({
          doc: content,
          extensions: [
            basicSetup,
            oneDark,
            getLanguageExtension(filePath),
            EditorView.editable.of(!readOnly),
            EditorView.updateListener.of((update) => {
              if (update.docChanged && onChange) {
                onChange(update.state.doc.toString());
              }
            }),
            // Custom highlighting for diff view
            highlights ? createDiffHighlighting(highlights) : [],
          ],
        });

        const view = new EditorView({
          state,
          parent: editorRef.current,
        });

        viewRef.current = view;
      } catch (error) {
        console.error('Failed to load file:', error);
      }
    };

    loadContent();

    return () => {
      viewRef.current?.destroy();
    };
  }, [filePath, workspaceId]);

  // Save file
  const saveFile = async () => {
    if (!viewRef.current) return;
    
    const content = viewRef.current.state.doc.toString();
    try {
      await invoke('write_file', {
        path: filePath,
        content,
        workspaceId,
      });
    } catch (error) {
      console.error('Failed to save file:', error);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 bg-app-sidebar border-b border-app-border">
        <span className="text-sm text-app-text font-mono">{filePath}</span>
        {!readOnly && (
          <button
            onClick={saveFile}
            className="px-3 py-1 text-xs bg-app-accent text-white rounded hover:bg-app-accent-hover"
          >
            Save (⌘S)
          </button>
        )}
      </div>
      <div ref={editorRef} className="flex-1 overflow-auto" />
    </div>
  );
}
```

```typescript
// src/components/CodeEditor/EditorTabs.tsx
import { useState } from 'react';
import { CodeEditor } from './CodeEditor';

interface OpenFile {
  path: string;
  workspaceId: string;
  isDirty: boolean;
}

export function EditorTabs() {
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);

  const openFile = (path: string, workspaceId: string) => {
    if (!openFiles.find(f => f.path === path)) {
      setOpenFiles([...openFiles, { path, workspaceId, isDirty: false }]);
    }
    setActiveFile(path);
  };

  const closeFile = (path: string) => {
    setOpenFiles(openFiles.filter(f => f.path !== path));
    if (activeFile === path) {
      setActiveFile(openFiles[0]?.path || null);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex items-center bg-app-sidebar border-b border-app-border overflow-x-auto">
        {openFiles.map(file => (
          <div
            key={file.path}
            onClick={() => setActiveFile(file.path)}
            className={`flex items-center gap-2 px-4 py-2 text-xs cursor-pointer border-r border-app-border ${
              activeFile === file.path
                ? 'bg-app-panel text-app-text'
                : 'text-app-text-muted hover:text-app-text'
            }`}
          >
            <span className="font-mono">{file.path.split('/').pop()}</span>
            {file.isDirty && <span className="text-app-accent">●</span>}
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeFile(file.path);
              }}
              className="ml-2 text-app-text-muted hover:text-white"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* Editor */}
      {activeFile ? (
        <CodeEditor
          filePath={activeFile}
          workspaceId={openFiles.find(f => f.path === activeFile)?.workspaceId || ''}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center text-app-text-muted">
          Select a file to edit
        </div>
      )}
    </div>
  );
}
```

**Backend Commands:**
```rust
// src-tauri/src/commands/files.rs

#[tauri::command]
pub async fn read_file(path: String, workspace_id: Option<String>) -> Result<String, String> {
    // If workspace_id provided, resolve path relative to worktree
    let full_path = if let Some(ws_id) = workspace_id {
        get_worktree_path(&ws_id)?.join(path)
    } else {
        PathBuf::from(path)
    };
    
    tokio::fs::read_to_string(&full_path)
        .await
        .map_err(|e| format!("Failed to read file: {}", e))
}

#[tauri::command]
pub async fn write_file(
    path: String,
    content: String,
    workspace_id: Option<String>,
) -> Result<(), String> {
    let full_path = if let Some(ws_id) = workspace_id {
        get_worktree_path(&ws_id)?.join(path)
    } else {
        PathBuf::from(path)
    };
    
    tokio::fs::write(&full_path, content)
        .await
        .map_err(|e| format!("Failed to write file: {}", e))
}
```

**Bundle Size Optimization:**
```typescript
// Lazy load language modes
const languageLoaders: Record<string, () => Promise<any>> = {
  typescript: () => import('@codemirror/lang-javascript').then(m => m.javascript({ typescript: true })),
  rust: () => import('@codemirror/lang-rust').then(m => m.rust()),
  python: () => import('@codemirror/lang-python').then(m => m.python()),
  // etc
};

// Dynamic import based on file extension
const loadLanguage = async (filename: string) => {
  const ext = filename.split('.').pop();
  const loader = languageLoaders[ext || ''];
  return loader ? await loader() : [];
};
```

**Keyboard Shortcuts:**
- `⌘S` - Save file
- `⌘W` - Close tab
- `⌘⇧[` / `⌘⇧]` - Previous/Next tab
- `⌘P` - Quick open file (integrate dengan Search Modal)

**Effort:** 4-5 hari
**Value:** Very High
**Priority:** P0

---

### 3. Enhanced Diff Viewer ⭐⭐

**Deskripsi:** Diff viewer yang lebih powerful dengan syntax highlighting dan interactive features.

**Masalah yang Dipecahkan:**
- Diff saat ini terlalu sederhana (text only)
- Sulit review changes besar
- Tidak ada syntax highlighting untuk code changes

**Fitur Detail:**
- Side-by-side diff view
- Inline diff view (toggle)
- Syntax highlighting untuk code changes
- Fold/unfold unchanged regions
- Line numbers
- File stats (+N lines, -M lines)
- Jump to next/prev change
- Copy diff to clipboard

**Implementasi:**

```typescript
// src/components/DiffViewer/DiffViewer.tsx
import { useState, useMemo } from 'react';
import { parseDiff, DiffFile } from './diff-parser';
import { DiffHunk } from './DiffHunk';

interface DiffViewerProps {
  diffText: string;
  viewMode?: 'split' | 'unified';
}

export function DiffViewer({ diffText, viewMode = 'split' }: DiffViewerProps) {
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set());
  
  const files = useMemo(() => parseDiff(diffText), [diffText]);
  
  const toggleFile = (filename: string) => {
    const newCollapsed = new Set(collapsedFiles);
    if (newCollapsed.has(filename)) {
      newCollapsed.delete(filename);
    } else {
      newCollapsed.add(filename);
    }
    setCollapsedFiles(newCollapsed);
  };

  return (
    <div className="flex flex-col h-full overflow-auto bg-app-panel">
      {files.map(file => (
        <div key={file.fromFile || file.toFile} className="border-b border-app-border">
          {/* File Header */}
          <div
            onClick={() => toggleFile(file.fromFile || file.toFile || '')}
            className="flex items-center justify-between px-4 py-2 bg-app-sidebar cursor-pointer hover:bg-app-sidebar/80"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono text-app-text">
                {file.fromFile === file.toFile
                  ? file.toFile
                  : `${file.fromFile} → ${file.toFile}`}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded ${
                file.type === 'add' ? 'bg-green-500/20 text-green-400' :
                file.type === 'delete' ? 'bg-red-500/20 text-red-400' :
                'bg-yellow-500/20 text-yellow-400'
              }`}>
                {file.type === 'add' ? 'Added' : file.type === 'delete' ? 'Deleted' : 'Modified'}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-green-400">+{file.additions}</span>
              <span className="text-red-400">-{file.deletions}</span>
            </div>
          </div>

          {/* File Content */}
          {!collapsedFiles.has(file.fromFile || file.toFile || '') && (
            <div className="p-2">
              {file.hunks.map((hunk, idx) => (
                <DiffHunk
                  key={idx}
                  hunk={hunk}
                  viewMode={viewMode}
                  fileExtension={file.toFile?.split('.').pop() || ''}
                />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```

```typescript
// src/components/DiffViewer/DiffHunk.tsx
import { highlightCode } from './syntax-highlighter';

interface DiffHunkProps {
  hunk: {
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    lines: Array<{
      type: 'context' | 'add' | 'del';
      content: string;
      oldLineNum?: number;
      newLineNum?: number;
    }>;
  };
  viewMode: 'split' | 'unified';
  fileExtension: string;
}

export function DiffHunk({ hunk, viewMode, fileExtension }: DiffHunkProps) {
  if (viewMode === 'split') {
    return (
      <div className="flex font-mono text-xs">
        {/* Old version */}
        <div className="flex-1 border-r border-app-border">
          {hunk.lines.map((line, idx) => (
            <div
              key={idx}
              className={`flex ${
                line.type === 'del' ? 'bg-red-500/10' :
                line.type === 'add' ? 'bg-app-panel/50' :
                ''
              }`}
            >
              <span className="w-12 text-right pr-2 text-app-text-muted select-none">
                {line.oldLineNum || ' '}
              </span>
              <span className="w-6 text-center text-app-text-muted select-none">
                {line.type === 'del' ? '-' : ' '}
              </span>
              <span className={`flex-1 ${line.type === 'del' ? 'text-red-300' : 'text-app-text'}`}>
                {line.type !== 'add' && highlightCode(line.content, fileExtension)}
              </span>
            </div>
          ))}
        </div>

        {/* New version */}
        <div className="flex-1">
          {hunk.lines.map((line, idx) => (
            <div
              key={idx}
              className={`flex ${
                line.type === 'add' ? 'bg-green-500/10' :
                line.type === 'del' ? 'bg-app-panel/50' :
                ''
              }`}
            >
              <span className="w-12 text-right pr-2 text-app-text-muted select-none">
                {line.newLineNum || ' '}
              </span>
              <span className="w-6 text-center text-app-text-muted select-none">
                {line.type === 'add' ? '+' : ' '}
              </span>
              <span className={`flex-1 ${line.type === 'add' ? 'text-green-300' : 'text-app-text'}`}>
                {line.type !== 'del' && highlightCode(line.content, fileExtension)}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Unified view
  return (
    <div className="font-mono text-xs">
      {hunk.lines.map((line, idx) => (
        <div
          key={idx}
          className={`flex ${
            line.type === 'add' ? 'bg-green-500/10' :
            line.type === 'del' ? 'bg-red-500/10' :
            ''
          }`}
        >
          <span className="w-12 text-right pr-2 text-app-text-muted select-none">
            {line.oldLineNum || ' '}
          </span>
          <span className="w-12 text-right pr-2 text-app-text-muted select-none">
            {line.newLineNum || ' '}
          </span>
          <span className="w-6 text-center text-app-text-muted select-none">
            {line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '}
          </span>
          <span className={`flex-1 ${
            line.type === 'add' ? 'text-green-300' :
            line.type === 'del' ? 'text-red-300' :
            'text-app-text'
          }`}>
            {highlightCode(line.content, fileExtension)}
          </span>
        </div>
      ))}
    </div>
  );
}
```

**Diff Parser:**
```typescript
// src/components/DiffViewer/diff-parser.ts

export interface DiffFile {
  type: 'add' | 'delete' | 'modify';
  fromFile?: string;
  toFile?: string;
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface DiffLine {
  type: 'context' | 'add' | 'del';
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
}

export function parseDiff(diffText: string): DiffFile[] {
  const files: DiffFile[] = [];
  const lines = diffText.split('\n');
  
  let currentFile: DiffFile | null = null;
  let currentHunk: DiffHunk | null = null;
  let oldLineNum = 0;
  let newLineNum = 0;
  
  for (const line of lines) {
    // File header
    if (line.startsWith('diff --git')) {
      if (currentFile) files.push(currentFile);
      currentFile = {
        type: 'modify',
        additions: 0,
        deletions: 0,
        hunks: [],
      };
    }
    
    // File paths
    if (line.startsWith('--- a/')) {
      currentFile!.fromFile = line.slice(6);
    }
    if (line.startsWith('+++ b/')) {
      currentFile!.toFile = line.slice(6);
    }
    
    // New file / deleted file
    if (line.startsWith('new file mode')) {
      currentFile!.type = 'add';
    }
    if (line.startsWith('deleted file mode')) {
      currentFile!.type = 'delete';
    }
    
    // Hunk header
    const hunkMatch = line.match(/@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/);
    if (hunkMatch) {
      if (currentHunk) currentFile!.hunks.push(currentHunk);
      currentHunk = {
        oldStart: parseInt(hunkMatch[1]),
        oldLines: parseInt(hunkMatch[2]) || 1,
        newStart: parseInt(hunkMatch[3]),
        newLines: parseInt(hunkMatch[4]) || 1,
        lines: [],
      };
      oldLineNum = currentHunk.oldStart;
      newLineNum = currentHunk.newStart;
    }
    
    // Diff lines
    if (currentHunk && (line.startsWith(' ') || line.startsWith('+') || line.startsWith('-'))) {
      const type = line.startsWith('+') ? 'add' : line.startsWith('-') ? 'del' : 'context';
      const content = line.slice(1);
      
      currentHunk.lines.push({
        type,
        content,
        oldLineNum: type !== 'add' ? oldLineNum++ : undefined,
        newLineNum: type !== 'del' ? newLineNum++ : undefined,
      });
      
      if (type === 'add') currentFile!.additions++;
      if (type === 'del') currentFile!.deletions++;
    }
  }
  
  if (currentHunk) currentFile?.hunks.push(currentHunk);
  if (currentFile) files.push(currentFile);
  
  return files;
}
```

**Effort:** 3-4 hari
**Value:** High
**Priority:** P1

---

## 🟡 MEDIUM PRIORITY

### 4. Search Modal (Global) ⭐⭐

**Deskripsi:** Quick file + content search seperti VS Code Command Palette (⌘P / ⌘Shift+F).

**Fitur:**
- Fuzzy file search (⌘P)
- Content search/grep (⌘Shift+F)
- Recent files
- Keyboard navigation
- Preview on hover

**Implementasi:**

```typescript
// src/components/SearchModal/SearchModal.tsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import fuzzysort from 'fuzzysort'; // or similar fuzzy matching lib

interface SearchResult {
  type: 'file' | 'content';
  path: string;
  line?: number;
  column?: number;
  preview?: string;
  score: number;
}

export function SearchModal({ isOpen, onClose, mode }: {
  isOpen: boolean;
  onClose: () => void;
  mode: 'files' | 'content';
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
    }
  }, [isOpen]);

  const search = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 2) {
      setResults([]);
      return;
    }

    try {
      if (mode === 'files') {
        const files = await invoke<string[]>('list_files_recursive', { workspaceId });
        const matches = fuzzysort.go(searchQuery, files, {
          key: 'path',
          limit: 20,
        });
        setResults(matches.map(m => ({
          type: 'file',
          path: m.target,
          score: m.score,
        })));
      } else {
        const matches = await invoke<Array<{ path: string; line: number; content: string }>>(
          'grep_files',
          { pattern: searchQuery, workspaceId }
        );
        setResults(matches.map(m => ({
          type: 'content',
          path: m.path,
          line: m.line,
          preview: m.content,
          score: 0,
        })));
      }
    } catch (error) {
      console.error('Search failed:', error);
    }
  }, [mode]);

  useEffect(() => {
    const timeout = setTimeout(() => search(query), 150);
    return () => clearTimeout(timeout);
  }, [query, search]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      const selected = results[selectedIndex];
      if (selected) {
        onSelect(selected);
        onClose();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-[20vh]">
      <div className="w-[600px] bg-app-panel rounded-lg shadow-2xl overflow-hidden">
        {/* Search Input */}
        <div className="flex items-center px-4 py-3 border-b border-app-border">
          <span className="text-app-text-muted mr-3">
            {mode === 'files' ? '🔍' : '🔎'}
          </span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={mode === 'files' ? 'Type to search files...' : 'Type to search content...'}
            className="flex-1 bg-transparent text-app-text outline-none"
          />
          <span className="text-xs text-app-text-muted">ESC to close</span>
        </div>

        {/* Results */}
        <div className="max-h-[400px] overflow-y-auto">
          {results.map((result, idx) => (
            <div
              key={`${result.path}-${result.line}`}
              onClick={() => {
                onSelect(result);
                onClose();
              }}
              className={`px-4 py-2 cursor-pointer ${
                idx === selectedIndex ? 'bg-app-accent/20' : 'hover:bg-app-hover'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-xs text-app-text-muted">
                  {result.type === 'file' ? '📄' : '📍'}
                </span>
                <span className="text-sm text-app-text font-mono">{result.path}</span>
                {result.line && (
                  <span className="text-xs text-app-text-muted">:{result.line}</span>
                )}
              </div>
              {result.preview && (
                <div className="text-xs text-app-text-muted mt-1 font-mono truncate">
                  {result.preview}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

**Backend:**
```rust
#[tauri::command]
pub async fn grep_files(
    pattern: String,
    workspace_id: String,
) -> Result<Vec<GrepMatch>, String> {
    let worktree_path = get_worktree_path(&workspace_id)?;
    
    let output = Command::new("rg")
        .args([
            "--line-number",
            "--column",
            "--max-count", "10",
            "--smart-case",
            &pattern,
        ])
        .current_dir(&worktree_path)
        .output()
        .map_err(|e| format!("Failed to run grep: {}", e))?;
    
    // Parse ripgrep output
    let matches = String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(|line| {
            let parts: Vec<&str> = line.splitn(3, ':').collect();
            if parts.len() >= 3 {
                Some(GrepMatch {
                    path: parts[0].to_string(),
                    line: parts[1].parse().ok()?,
                    content: parts[2].to_string(),
                })
            } else {
                None
            }
        })
        .collect();
    
    Ok(matches)
}
```

**Effort:** 2-3 hari
**Value:** High
**Priority:** P1

---

### 5. Script Runner Panel ⭐

**Deskripsi:** Panel untuk jalankan predefined shell scripts/commands.

**Fitur:**
- Predefined scripts per project
- One-click run
- Output viewer
- Keyboard shortcuts

**Implementasi:**

```typescript
// src/components/ScriptPanel/ScriptPanel.tsx
interface Script {
  id: string;
  name: string;
  command: string;
  cwd?: string;
  keybinding?: string;
}

const DEFAULT_SCRIPTS: Script[] = [
  { id: 'test', name: 'Run Tests', command: 'npm test', keybinding: '⌘1' },
  { id: 'lint', name: 'Lint', command: 'npm run lint', keybinding: '⌘2' },
  { id: 'build', name: 'Build', command: 'npm run build', keybinding: '⌘3' },
];

export function ScriptPanel() {
  const [scripts, setScripts] = useState<Script[]>(DEFAULT_SCRIPTS);
  const [runningScript, setRunningScript] = useState<string | null>(null);
  const [outputs, setOutputs] = useState<Record<string, string>>({});

  const runScript = async (script: Script) => {
    setRunningScript(script.id);
    setOutputs(prev => ({ ...prev, [script.id]: '' }));
    
    try {
      const output = await invoke<string>('run_script', {
        command: script.command,
        cwd: script.cwd || workspacePath,
        workspaceId,
      });
      
      setOutputs(prev => ({ ...prev, [script.id]: output }));
    } catch (error) {
      setOutputs(prev => ({ ...prev, [script.id]: `Error: ${error}` }));
    } finally {
      setRunningScript(null);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 p-2 border-b border-app-border">
        {scripts.map(script => (
          <button
            key={script.id}
            onClick={() => runScript(script)}
            disabled={runningScript === script.id}
            className={`px-3 py-1.5 text-xs rounded flex items-center gap-2 ${
              runningScript === script.id
                ? 'bg-app-accent/50 text-white'
                : 'bg-app-sidebar text-app-text hover:bg-app-hover'
            }`}
          >
            {runningScript === script.id && <Loader2 className="w-3 h-3 animate-spin" />}
            {script.name}
            {script.keybinding && (
              <span className="text-app-text-muted ml-1">{script.keybinding}</span>
            )}
          </button>
        ))}
      </div>
      
      <div className="flex-1 overflow-auto p-4 font-mono text-xs">
        {Object.entries(outputs).map(([id, output]) => (
          <div key={id} className="mb-4">
            <div className="text-app-text-muted mb-2">
              {scripts.find(s => s.id === id)?.name}
            </div>
            <pre className="text-app-text whitespace-pre-wrap">{output}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Effort:** 1-2 hari
**Value:** Medium
**Priority:** P2

---

### 6. File Browser Tree ⭐

**Deskripsi:** File tree navigation seperti VS Code.

**Fitur:**
- Collapsible folder tree
- File icons
- Context menu
- Click to open in Code Editor

**Implementasi:**

```typescript
// src/components/FileTree/FileTree.tsx
interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileNode[];
  isExpanded?: boolean;
}

export function FileTree({ onFileSelect }: { onFileSelect: (path: string) => void }) {
  const [tree, setTree] = useState<FileNode[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadTree();
  }, [workspaceId]);

  const loadTree = async () => {
    const files = await invoke<FileNode[]>('get_file_tree', { workspaceId });
    setTree(files);
  };

  const toggleFolder = (path: string) => {
    const newExpanded = new Set(expanded);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpanded(newExpanded);
  };

  const renderNode = (node: FileNode, depth: number = 0): JSX.Element => (
    <div key={node.path} style={{ paddingLeft: depth * 12 }}>
      <div
        onClick={() => node.isDirectory ? toggleFolder(node.path) : onFileSelect(node.path)}
        className="flex items-center gap-1 py-1 px-2 hover:bg-app-hover cursor-pointer"
      >
        {node.isDirectory ? (
          <>
            <span className="text-app-text-muted">
              {expanded.has(node.path) ? '▼' : '▶'}
            </span>
            <span>📁</span>
          </>
        ) : (
          <>
            <span className="w-4" />
            <span>{getFileIcon(node.name)}</span>
          </>
        )}
        <span className="text-sm text-app-text">{node.name}</span>
      </div>
      
      {node.isDirectory && expanded.has(node.path) && node.children?.map(child =>
        renderNode(child, depth + 1)
      )}
    </div>
  );

  return (
    <div className="h-full overflow-auto py-2">
      {tree.map(node => renderNode(node))}
    </div>
  );
}
```

**Effort:** 2-3 hari
**Value:** Medium
**Priority:** P2

---

## 🔵 LOW PRIORITY (Nice to Have)

### 7. Per-Repository GitHub Profile

**Deskripsi:** Bind GitHub auth profile per repository.

**Implementasi Singkat:**
```typescript
// Config structure
interface GhProfile {
  name: string;
  username: string;
  token: string; // encrypted
}

interface RepoSettings {
  repoId: string;
  ghProfileName?: string;
}

// Usage
const token = await invoke<string>('gh_get_token', { repoId });
// Returns token from profile yang bound ke repo ini
```

**Effort:** 1-2 hari
**Value:** Medium
**Priority:** P3

---

### 8. Jira Integration

**Deskripsi:** Sinkronisasi task dengan Jira tickets.

**Fitur:**
- Link task ke Jira ticket
- Import Jira tickets
- Sync status

**Implementasi Singkat:**
```typescript
// Frontend
interface JiraConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
  projectKey: string;
}

// Commands
invoke('jira_connect', { config });
invoke('jira_import_tickets', { projectKey });
invoke('jira_sync_status', { akiraTaskId, jiraTicketKey });
```

**Effort:** 3-4 hari
**Value:** Medium
**Priority:** P3

---

### 9. Staging Mode (Autopilot)

**Deskripsi:** AI eksekusi task tanpa konfirmasi manual.

**Fitur:**
- Toggle autopilot per task
- Safety guardrails
- Checkpoint system

**Guardrails:**
```rust
pub struct GuardrailConfig {
    max_files_modified: usize,        // default: 10
    max_lines_changed: usize,         // default: 500
    forbidden_commands: Vec<String>,  // ["rm -rf", "DROP TABLE"]
    require_approval_for: Vec<String>, // ["delete", "chmod"]
}
```

**Effort:** 5-7 hari
**Value:** High (tapi risky)
**Priority:** P3 (research phase)

---

## 📅 Implementation Roadmap

### Phase 1: Foundation (Week 1-2)
- [ ] Git Worktree Isolation (HIGH)
- [ ] Database migration system

### Phase 2: Core Features (Week 3-4)
- [ ] Code Editor - CodeMirror 6 (HIGH)
- [ ] Enhanced Diff Viewer (HIGH)

### Phase 3: Productivity (Week 5-6)
- [ ] Search Modal (MEDIUM)
- [ ] File Browser Tree (MEDIUM)
- [ ] Script Runner Panel (MEDIUM)

### Phase 4: Integrations (Week 7-8)
- [ ] Per-Repo GH Profile (LOW)
- [ ] Jira Integration (LOW)
- [ ] Staging Mode research (LOW)

---

## ⚠️ Risks & Dependencies

| Risk | Impact | Mitigation |
|------|--------|------------|
| Worktree disk usage | High | Auto-cleanup, disk space monitoring |
| CodeMirror bundle size | Medium | Lazy load languages, tree shaking |
| Staging mode safety | Critical | Strict guardrails, approval gates |
| Jira API limits | Low | Caching, rate limit handling |

---

## 🎯 Success Metrics

- Task isolation (worktree) → 100% task pakai worktree
- Code Editor usage → >50% file edits di Akira (bukan VS Code)
- Search adoption → >80% user pakai ⌘P search
- User satisfaction → >4.5/5 rating

---

*Last updated: 15 April 2026*
