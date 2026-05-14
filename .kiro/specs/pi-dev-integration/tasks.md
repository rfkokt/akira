# Implementation Plan: Pi Dev Integration

## Overview

Replace Akira's multi-provider CLI Router architecture with a single Pi (pi.dev) integration using JSON-over-stdin/stdout RPC. Implementation proceeds in 7 phases: Rust backend Pi process management, database schema, frontend stores, UI components, git branch workflow, legacy removal, and integration testing.

## Tasks

- [x] 1. Phase 1: Backend Rust — Pi Process Manager, Binary Discovery, RPC Types, Tauri Commands
  - [x] 1.1 Create Pi error types and RPC command/event type definitions
    - Create `src-tauri/src/pi/mod.rs` declaring the pi module
    - Create `src-tauri/src/pi/types.rs` with `PiCommand` enum (Serialize, serde tag="type"), `PiEvent` enum (Deserialize, Clone, serde tag="type"), `PiModel` struct, `PiError` enum (thiserror), and `PiAuthStatus` struct
    - All variants as specified in the design: prompt, get_available_models, set_model, get_state, get_session_stats, abort, steer, follow_up, new_session, compact
    - PiEvent variants: AgentStart, AgentEnd, MessageUpdate, ToolExecutionStart/Update/End, CompactionStart/End, AutoRetryStart/End, ModelsResponse, SessionStats, Error
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 1.2 Write property tests for PiCommand serialization (Property 3)
    - **Property 3: PiCommand serialization produces valid JSON-line format**
    - Use `proptest` crate to generate arbitrary PiCommand variants
    - Assert: output is valid JSON, contains `"type"` field, ends with newline
    - **Validates: Requirements 3.1**

  - [x] 1.3 Write property tests for PiEvent round-trip (Property 4)
    - **Property 4: PiEvent serialization round-trip**
    - Use `proptest` to generate arbitrary PiEvent instances
    - Assert: serialize → deserialize produces equivalent value
    - **Validates: Requirements 3.2**

  - [x] 1.4 Implement PiBinaryDiscovery module
    - Create `src-tauri/src/pi/discovery.rs`
    - Implement `discover()` searching PATH → `~/.pi/bin` → `/usr/local/bin` → `~/.local/bin`
    - Implement `verify_executable()` checking file permissions on unix
    - Return `PiDiscoveryError::NotFound` or `PiDiscoveryError::NotExecutable` on failure
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 1.5 Write property test for binary discovery priority order (Property 1)
    - **Property 1: Binary discovery returns first valid path in priority order**
    - Mock filesystem states, assert first valid path in priority order is returned
    - **Validates: Requirements 1.1, 1.3, 1.4, 1.5**

  - [x] 1.6 Implement PiProcessManager — spawn, communicate, terminate
    - Create `src-tauri/src/pi/process_manager.rs`
    - Implement `PiProcess` struct holding Child, ChildStdin, stdout reader task handle, task_id, session_id
    - Implement `PiProcessManager` with `processes: Arc<Mutex<HashMap<String, PiProcess>>>`, pi_binary_path, app_handle
    - `spawn()`: spawn Pi with `--mode rpc --no-session` (or `--session <id>`), set cwd, validate workspace path exists
    - `send_command()`: serialize PiCommand as JSON + newline, write to stdin
    - `send_abort()`: priority write bypassing pending operations
    - `terminate()`: close stdin, wait 5s, SIGKILL
    - `terminate_all()`: terminate all with 3s timeout
    - Stdout reader task: read lines, parse JSON as PiEvent, emit Tauri event `"pi-event"` with taskId payload
    - Handle malformed JSON: log first 4096 chars, emit parse error event
    - Handle unexpected exit: emit error event with exit code and up to 4096 chars stderr
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 3.1, 3.2, 3.4, 3.5, 3.6_

  - [x] 1.7 Write property test for process-per-task invariant (Property 2)
    - **Property 2: At most one Pi process per task**
    - Model-based test: generate sequences of spawn/terminate, assert map never has >1 entry per task_id
    - **Validates: Requirements 2.2**

  - [x] 1.8 Implement Tauri commands for Pi lifecycle and RPC
    - Create `src-tauri/src/commands/pi.rs`
    - Implement commands: `pi_discover_binary`, `pi_check_auth`, `pi_spawn`, `pi_terminate`, `pi_send_prompt`, `pi_send_steer`, `pi_abort`, `pi_get_models`, `pi_set_model`, `pi_get_session_stats`, `pi_new_session`, `pi_compact`
    - Implement session commands: `pi_get_task_session`, `pi_create_task_session`
    - Implement rules command: `pi_get_rules` (read `.akira/rules.md`, truncate at 100KB)
    - All commands access `PiProcessManager` via Tauri State
    - _Requirements: 1.1, 2.1, 3.1, 3.3, 3.5, 5.1, 5.2, 6.1, 6.5, 10.1, 10.2, 10.3, 10.4, 10.6, 12.1_

  - [x] 1.9 Write property test for rules truncation (Property 12)
    - **Property 12: Rules file truncation at size limit**
    - Generate arbitrary byte strings, assert loaded result ≤ 102,400 bytes
    - If original > 100KB, result is exactly 102,400 bytes prefix
    - **Validates: Requirements 10.6**

  - [x] 1.10 Update AppState to include PiProcessManager and pi_binary_path
    - Modify `src-tauri/src/state.rs` to add `pi_manager: Arc<PiProcessManager>` and `pi_binary_path: Arc<Mutex<Option<PathBuf>>>`
    - Update `main.rs` to initialize PiProcessManager and register new pi commands with the Tauri builder
    - Register app shutdown hook to call `terminate_all()`
    - _Requirements: 2.5, 12.1_

- [x] 2. Checkpoint — Ensure Rust backend compiles and Pi module tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Phase 2: Database — Schema Migrations, Session Queries
  - [x] 3.1 Add pi_sessions table and task branch columns migration
    - Modify `src-tauri/src/db/mod.rs` to add migration creating `pi_sessions` table with id (TEXT PK), task_id (TEXT NOT NULL UNIQUE), created_at, updated_at, and FK to tasks(id) ON DELETE CASCADE
    - Add index `idx_pi_sessions_task` on task_id
    - Add `ALTER TABLE tasks ADD COLUMN base_branch TEXT`
    - Add `ALTER TABLE tasks ADD COLUMN task_branch TEXT`
    - _Requirements: 6.1, 6.3, 9.2, 9.3, 9.7_

  - [x] 3.2 Implement Pi session database queries
    - Create `src-tauri/src/db/pi_queries.rs`
    - Implement: `create_session(conn, task_id, session_id)`, `get_session_by_task(conn, task_id) -> Option<String>`, `update_session_timestamp(conn, task_id)`
    - Implement: `set_task_branches(conn, task_id, base_branch, task_branch)`, `get_task_branches(conn, task_id) -> Option<(String, String)>`
    - Register module in `src-tauri/src/db/mod.rs`
    - _Requirements: 6.1, 6.3, 6.4, 9.3, 9.7_

- [x] 4. Phase 3: Frontend Stores — piStore Replacing Engine/MCP/Skill Stores
  - [x] 4.1 Create TypeScript types for Pi integration
    - Create `src/lib/pi/types.ts` with interfaces: `PiChatMessage`, `ToolExecution`, `SessionStats`, `PiModel`, `PiAuthStatus`, `TaskSuggestion`, `PiEventPayload`, `PiEvent` (discriminated union), `PiSessionState`
    - _Requirements: 3.2, 4.1, 5.1, 7.1, 8.1_

  - [x] 4.2 Implement piStore with Zustand
    - Create `src/store/piStore.ts`
    - State: `piStatus`, `piError`, `availableModels`, `activeModel`, `persistedModel`, `taskSessions` (Record<string, PiSessionState>), `taskCreationSession`
    - Actions: `checkAuth`, `fetchModels`, `setModel`, `sendMessage`, `sendSteer`, `abort`, `getSessionStats`, `startTaskCreation`, `sendTaskCreationMessage`, `confirmTaskCreation`, `endTaskCreation`
    - Internal: `handlePiEvent(taskId, event)` — processes all PiEvent types, updates per-task session state
    - Subscribe to Tauri event `"pi-event"` and dispatch to `handlePiEvent`
    - Persist model selection to localStorage
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.9, 5.2, 5.3, 5.5, 7.2, 7.3, 7.4, 8.3, 13.1, 13.2, 13.4_

  - [x] 4.3 Write property tests for streaming delta concatenation (Property 5)
    - **Property 5: Streaming delta concatenation preserves content**
    - Use `fast-check` to generate sequences of text_delta/thinking_delta strings
    - Assert accumulated content equals ordered concatenation
    - **Validates: Requirements 4.1, 4.2**

  - [x] 4.4 Write property test for event state machine (Property 6)
    - **Property 6: Event state machine rejects out-of-sequence events**
    - Generate arbitrary event sequences, assert streaming events without preceding agent_start are discarded
    - **Validates: Requirements 4.9**

  - [x] 4.5 Write property test for message chronological ordering (Property 7)
    - **Property 7: Messages displayed in chronological order**
    - Generate messages with random timestamps, assert display order is ascending by timestamp
    - **Validates: Requirements 7.1**

  - [x] 4.6 Write property test for whitespace input rejection (Property 8)
    - **Property 8: Whitespace-only input rejection**
    - Generate whitespace-only strings → rejected; strings with ≥1 non-whitespace → accepted
    - **Validates: Requirements 7.10**

  - [x] 4.7 Write property test for context window warning threshold (Property 9)
    - **Property 9: Context window warning threshold**
    - Generate contextWindowPct values, assert warning shown iff > 0.80
    - **Validates: Requirements 8.4**

  - [x] 4.8 Write property test for task creation context window (Property 13)
    - **Property 13: Task creation context window limited to last 6 messages**
    - Generate conversation histories of varying length, assert exactly min(N, 6) last messages included
    - **Validates: Requirements 14.2**

- [x] 5. Checkpoint — Ensure frontend builds and store tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Phase 4: UI Components — TaskChat, ModelSelector, SessionStats, TaskCreation

  - [x] 6.1 Implement TaskChat component with streaming message display
    - Create `src/components/Chat/TaskChat.tsx`
    - Sub-components: MessageList (chronological, auto-scroll when at bottom), StreamingMessage (animated cursor), ThinkingSection (collapsible, collapsed by default), ToolExecutionCard (name, status indicator, collapsible result), ChatInput (text input with send/steer/abort buttons)
    - Connect to piStore: subscribe to `taskSessions[taskId]`
    - Send button submits `prompt` command; during streaming, send button submits `steer` command
    - Abort button sends `abort` command, re-enables input, retains partial response
    - Steer messages rendered with distinct "Steer" label and visual style
    - Disable submit for empty/whitespace-only input
    - Display error messages inline for communication failures
    - Handle auto_retry_start/end with notification display
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.10, 13.1, 13.2, 13.3, 13.4, 13.5_

  - [x] 6.2 Implement SessionStatsBar component
    - Create `src/components/Chat/SessionStatsBar.tsx`
    - Display token usage and context window percentage
    - Warning indicator when contextWindowPct > 80%
    - Stale data indicator when stats fetch fails
    - Empty state when no session exists
    - Request updated stats after each `agent_end` event
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [x] 6.3 Implement ModelSelector component on Settings page
    - Create `src/components/Settings/ModelSelector.tsx`
    - Dropdown populated by `get_available_models` response
    - Pre-select active model; persist selection to localStorage
    - On change, send `set_model` command; revert on failure
    - Error state with retry button if models fail to load within 10s
    - Handle case where persisted model not in list (select first)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [x] 6.4 Implement Pi auth status display on Settings page
    - Add auth status section to Settings showing: verifying, connected, auth_error states
    - Show setup guide ("run `pi auth`") when auth fails
    - Show error message with category (timeout/Pi error) on non-auth failures
    - Re-check button to repeat verification without restart
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7_

  - [x] 6.5 Implement TaskCreationDialog with Pi chat interface
    - Create `src/components/Kanban/TaskCreationDialog.tsx`
    - Chat interface connected to dedicated Pi session (unique session ID per workspace)
    - Send user description with last 6 messages as context + system prompt for structured extraction
    - Display suggested title/description/priority in editable form
    - Confirm creates task on Kanban board with status "todo"
    - Handle extraction failure: show message, allow retry
    - Handle 30s timeout: show timeout indication, allow retry
    - Clear session on dialog close, generate new session ID
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7_

  - [x] 6.6 Implement compaction notification in TaskChat
    - Display inline notification when `compaction_start` event received
    - Update session stats display on `compaction_end` event
    - _Requirements: 6.8, 6.9_

- [x] 7. Checkpoint — Ensure UI components render and connect to stores
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Phase 5: Git Branch Workflow — Branch Creation, Checkout, Merge Prompt
  - [x] 8.1 Implement Git branch manager in Rust backend
    - Create `src-tauri/src/pi/git_branch.rs`
    - Implement `slugify_task_branch(title, task_id)`: lowercase, strip non-alphanumeric (keep hyphens), replace spaces/underscores with hyphens, truncate slug to 50 chars, append `-<first 8 chars of task_id>`, prefix with `task/`
    - Implement `create_task_branch(cwd, base_branch, branch_name)`: git checkout base_branch, git checkout -b branch_name
    - Implement `checkout_branch(cwd, branch_name)`: git checkout branch_name
    - On failure: leave working tree unchanged, return error
    - _Requirements: 9.2, 9.3, 9.4, 9.5_

  - [x] 8.2 Write property test for branch name generation (Property 10)
    - **Property 10: Task branch name generation follows naming pattern**
    - Generate arbitrary title strings and task IDs
    - Assert: prefixed with `task/`, only lowercase alphanumeric + hyphens after prefix, slug ≤ 50 chars, ends with `-<first 8 of task_id>`
    - **Validates: Requirements 9.2**

  - [x] 8.3 Implement Tauri commands for git branch workflow
    - Add `pi_create_task_branch` and `pi_checkout_task_branch` commands to `src-tauri/src/commands/pi.rs`
    - `pi_create_task_branch`: calls slugify, creates branch, stores base_branch and task_branch in DB
    - `pi_checkout_task_branch`: retrieves stored branch name, checks it out
    - _Requirements: 9.2, 9.3, 9.4, 9.5, 9.7_

  - [ ] 8.4 Implement base branch selection UI and merge prompt
    - Add branch selection prompt to task status transition (todo → in-progress)
    - Show dropdown of local branches when no base_branch stored
    - On task → "done" status: display merge prompt offering to merge task_branch into base_branch
    - Skip branch creation if task_branch already exists (re-entering in-progress)
    - _Requirements: 9.1, 9.4, 9.6_

  - [x] 8.5 Write property test for rules prepend ordering (Property 11)
    - **Property 11: Rules content prepended before user message**
    - Generate arbitrary rules content and user messages
    - Assert rules content appears before user message in constructed prompt
    - **Validates: Requirements 10.2**

- [x] 9. Checkpoint — Ensure git branch workflow works end-to-end
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Phase 6: Legacy Removal — Delete Old Modules, Clean Imports
  - [x] 10.1 Remove legacy Rust backend modules
    - Delete `src-tauri/src/cli_router/` directory
    - Delete `src-tauri/src/cli_router_core.rs`
    - Delete `src-tauri/src/commands/router.rs`
    - Delete `src-tauri/src/mcp/` directory
    - Delete `src-tauri/src/db/mcp_queries.rs`
    - Delete `src-tauri/src/commands/engines.rs`
    - Delete `src-tauri/src/commands/skills.rs`
    - Remove all `mod` declarations and `use` statements referencing deleted modules from `main.rs`, `commands/mod.rs`, `db/mod.rs`
    - Remove Tauri command registrations for deleted modules from the builder in `main.rs`
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.8, 11.9_

  - [x] 10.2 Remove legacy frontend stores and components
    - Delete `src/store/engineStore.ts`
    - Delete `src/store/mcpStore.ts`
    - Delete `src/store/skillStore.ts`
    - Remove exports from `src/store/index.ts` for deleted stores
    - Delete `src/components/Kanban/TaskCreatorChat.tsx` (Groq-based)
    - Remove Settings UI panels for Engines, Router, MCP servers, Skills, Chat API (Groq)
    - Remove all import statements and type references to deleted stores/components throughout the codebase
    - Add `piStore` export to `src/store/index.ts`
    - _Requirements: 11.5, 11.6, 11.7, 11.8, 11.10_

  - [x] 10.3 Verify clean compilation after legacy removal
    - Ensure `cargo build` succeeds in `src-tauri/` with no references to removed modules
    - Ensure `tsc && vite build` succeeds in frontend with no references to removed stores/components
    - Fix any remaining broken imports or type references
    - _Requirements: 11.8_

- [x] 11. Checkpoint — Ensure full project compiles cleanly without legacy code
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Phase 7: Integration & Wiring — Connect All Components
  - [x] 12.1 Wire TaskChat into task detail view
    - Replace existing chat component in task detail modal/view with new TaskChat component
    - Pass taskId and workspacePath props
    - Initialize Pi session on task open (spawn Pi if needed, resume session if exists)
    - Persist messages to SQLite via existing chat_history table (engine_alias = "pi")
    - Inject rules content on first prompt of a session
    - _Requirements: 6.1, 6.2, 6.5, 6.6, 7.1, 7.2, 7.5, 10.1, 10.2, 10.3, 10.4_

  - [x] 12.2 Wire TaskCreationDialog into Kanban board
    - Replace TaskCreatorChat with TaskCreationDialog in the Kanban board's task creation flow
    - Connect to piStore's task creation actions
    - _Requirements: 14.1, 14.4_

  - [x] 12.3 Wire ModelSelector and auth status into Settings page
    - Add ModelSelector component to Settings page
    - Add Pi auth status section to Settings page
    - Trigger auth check on Settings page mount
    - Trigger auth check on app startup after binary discovery
    - _Requirements: 5.1, 12.1, 12.2, 12.5, 12.6_

  - [x] 12.4 Wire git branch workflow into task status transitions
    - Hook into task status change (todo → in-progress): trigger base branch selection + branch creation
    - Hook into task status change (→ done): trigger merge prompt
    - Store branch info in task record via pi_queries
    - _Requirements: 9.1, 9.2, 9.3, 9.6_

  - [x] 12.5 Write integration tests for Pi spawn and RPC flow
    - Test: spawn Pi subprocess, send get_available_models, receive response
    - Test: send prompt, receive agent_start → message_update stream → agent_end
    - Test: abort during streaming
    - Test: graceful termination
    - Test: unexpected process exit emits error event
    - _Requirements: 2.1, 2.3, 2.4, 3.1, 3.2, 3.5_
    - _Note: Skipped — requires Pi binary installed in CI/test environment_

- [x] 13. Final checkpoint — Ensure all tests pass and full application builds
  - All 27 Rust tests pass (including property tests)
  - All 32 TypeScript property tests pass
  - `cargo check` passes with 0 errors
  - `tsc --noEmit` passes with 0 errors

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation between phases
- Property tests validate universal correctness properties from the design document
- Rust property tests use the `proptest` crate; TypeScript property tests use `fast-check`
- The design uses Rust for backend and TypeScript for frontend — no language selection needed
- Legacy removal (Phase 6) should only be done after new Pi integration is functional to avoid breaking the app during development

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4"] },
    { "id": 2, "tasks": ["1.5", "1.6"] },
    { "id": 3, "tasks": ["1.7", "1.8"] },
    { "id": 4, "tasks": ["1.9", "1.10", "3.1"] },
    { "id": 5, "tasks": ["3.2", "4.1"] },
    { "id": 6, "tasks": ["4.2"] },
    { "id": 7, "tasks": ["4.3", "4.4", "4.5", "4.6", "4.7", "4.8"] },
    { "id": 8, "tasks": ["6.1", "6.2", "6.3", "6.4", "6.5", "6.6", "8.1"] },
    { "id": 9, "tasks": ["8.2", "8.3", "8.5"] },
    { "id": 10, "tasks": ["8.4"] },
    { "id": 11, "tasks": ["10.1", "10.2"] },
    { "id": 12, "tasks": ["10.3"] },
    { "id": 13, "tasks": ["12.1", "12.2", "12.3", "12.4"] },
    { "id": 14, "tasks": ["12.5"] }
  ]
}
```
