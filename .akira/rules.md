# Project Overview

## What This Project Does
**Akira** is a native desktop application that serves as an AI-powered workspace and task manager for software developers. Each workspace represents a local project folder with its own Kanban board for task management, Project Intelligence Config (PIC) for AI context customization, and task-scoped AI chat conversations. The app enables developers to run AI coding tasks (via CLI engines like Claude, Ollama, OpenCode), automatically create Git pull requests upon task completion, review diffs, and manage task workflows through a 4-column Kanban board (TODO → IN PROGRESS → REVIEW → DONE). Tasks can be imported from JSON/Markdown/Excel, and AI conversations can be scoped per task for context continuity.

## Tech Stack
- **Runtime/Language**: TypeScript (React frontend), Rust (Tauri backend)
- **Framework**: Tauri v2 (native desktop app), React 19, Vite
- **UI Library**: Tailwind CSS + shadcn/ui (custom UI components), @dnd-kit for drag-and-drop
- **Database**: SQLite via rusqlite (single `akira.db` per app installation)
- **Key Dependencies**: 
  - **Zustand** for state management
  - **Monaco Editor** for code viewing
  - **@xterm/xterm** for terminal emulation
  - **@tauri-apps/** plugins (shell, notification, window, fs, dialog)
  - **react-markdown** + **react-syntax-highlighter** for chat rendering
  - **lucide-react** for icons
  - **next-themes** for theme switching
- **Build/Deploy**: npm + Vite dev server, Tauri bundler for native executables

## Architecture
The app uses a **Tauri IPC bridge architecture**: React frontend communicates with Rust backend via Tauri commands (`invoke('command_name')`). State is managed through **Zustand stores** (`workspaceStore`, `taskStore`, `aiChatStore`, `engineStore`, `configStore`), which handle business logic and persist to SQLite via the Rust backend. Each workspace has isolated data (tasks, chat history, AI config) keyed by `workspace_id`. AI engines are CLI binaries (Claude, Ollama, OpenCode) executed via Rust's `portable-pty`, with output streamed to frontend via Tauri events (`cli-output`, `cli-complete`). The app features a **CLI Router** for multi-provider AI request routing with auto-switching, cost tracking, and session management. Git operations (diff, commit, branch, PR) are handled via Rust commands with optional RTK (Rust Token Killer) integration for token optimization.

## Key Directories
- `src/components/` — React UI components organized by feature (AI, Assessment, Chat, DiffViewer, Editor, Git, Kanban, MCP, Router, Settings, Skills, Workspaces, layout, ui)
- `src/store/` — Zustand state management stores (aiChatStore, assessmentStore, configStore, engineStore, taskStore, terminalStore, workspaceStore, zoomStore)
- `src/lib/` — Frontend utilities and services (db.ts for Tauri invoke wrappers, cli.ts for CLI runner, git.ts for Git operations, helpers.ts, notify.ts, providers.ts for AI providers, theme.ts, utils.ts)
- `src/types/` — TypeScript type definitions (Task, Engine, ChatMessage, CLI events, Assessment, RTK types, Router types)
- `src/hooks/` — Custom React hooks (useAnalyzeProject.ts)
- `src-tauri/src/commands/` — Rust Tauri command handlers (agents, akira_config, chat, cli, engines, fs, git, import, pr, project, pty, rtk, router, shell, tasks, workspaces)
- `src-tauri/src/db/` — SQLite database layer (mod.rs for schema/migrations, queries.rs for CRUD operations)
- `src-tauri/src/cli_router/` — CLI router module for multi-provider AI routing
- `src-tauri/src/models/` — Rust data models matching TypeScript types
- `src-tauri/src/services/` — Business logic services
- `src-tauri/src/utils/` — Rust utility functions

# Code Rules

## DO
- Use **Zustand stores** for all state management - stores are the source of truth for UI state
- Always **invoke Tauri commands via `dbService` wrapper** in `src/lib/db.ts` - never call `invoke()` directly from components
- Follow the **4-column Kanban workflow**: `todo` → `in-progress` → `review` → `done` (also `failed` and `backlog` for edge cases)
- **Scope AI conversations by task** - use `taskId` as the key for all chat messages stored in `aiChatStore.messages[taskId]`
- **Wrap all AI prompts with project config rules** from `configStore.getSystemPrompt()` unless the task description contains `<!-- auto-rules-embedded -->`
- **Use RTK (Rust Token Killer) prefix** for CLI commands in AI prompts: `rtk git <args>`, `rtk lint eslint`, `rtk test npm`, etc.
- **Persist chat history to SQLite** via `dbService.createChatMessage()` after AI responses complete
- **Handle workspace isolation** - always use `activeWorkspace.id` or `workspace_id` when fetching/creating tasks
- Use **crypto.randomUUID()** for generating new entity IDs (workspaces, tasks, chat messages)
- **Move tasks to 'review' status** after AI completion and PR creation - don't leave them in `in-progress`
- **Use `runCLIWithStreaming()` from `src/lib/cli.ts`** for all AI engine CLI execution (handles event listeners, timeout, output aggregation)
- **Export project rules to `.akira/rules.md`** in workspace folder for portability when saving config via `configStore.saveConfig()`
- **Use mobile-responsive design patterns** - the Kanban board should be responsive with horizontal scrolling, chat panels should use flex layouts that adapt to viewport width, and buttons/interactive elements should be touch-friendly with adequate padding

## DON'T
- Don't **bypass Zustand stores** and call Tauri commands directly from UI components - always go through the appropriate store
- Don't **mix `project_id` and `workspace_id`** - the project renamed "projects" to "workspaces" and all references should use `workspace_id`
- Don't **forget to handle RTK instruction injection** - all AI prompts except auto-generated tasks should include the RTK command guidelines
- Don't **leave tasks in `in-progress` status** after AI completion - always move to `review` or `failed` based on outcome
- Don't **create global singleton patterns** outside of Zustand stores - all shared state should be in a store
- Don't **hardcode workspace paths** - always use `activeWorkspace.folder_path` from workspaceStore
- Don't **use inline `invoke()` calls** without the `dbService` wrapper - the wrapper provides TypeScript types and consistency
- Don't **skip loading config before running AI tasks** - always ensure `configStore.config` is loaded for the current workspace
- Don't **ignore the task queue system** - tasks should be enqueued via `aiChatStore.enqueueTask()` not executed directly
- Don't **use fixed pixel widths** for layout - use Tailwind's responsive utilities (`sm:`, `md:`, `lg:`) and flex/grid layouts
- Don't **forget to handle `.akira/` folder import** - check for existing `.akira/rules.md` when loading workspace config via `import_akira_config` command
- Don't **clear task state on workspace switch** without persisting - always save running state to localStorage via `saveRunningTask()`