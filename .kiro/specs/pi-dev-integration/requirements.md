# Requirements Document

## Introduction

This document specifies the requirements for replacing Akira's multi-provider CLI Router system with a single Pi (pi.dev) integration using its RPC protocol (JSON over stdin/stdout). The refactor removes the Engine management, MCP integration, Skills system, Task Creator Chat (Groq), and Cost tracking UI from Akira — delegating those responsibilities to Pi. The result is a simpler architecture where Akira spawns a single Pi subprocess from the Rust backend and communicates via structured JSON messages.

## Glossary

- **Akira**: The AI-Powered Task & Code Workflow Manager desktop application built with Tauri v2
- **Pi**: The pi.dev coding agent binary that supports RPC mode for programmatic interaction
- **Pi_RPC_Interface**: The JSON-over-stdin/stdout communication layer between Akira's Rust backend and the Pi subprocess
- **Pi_Session**: A persistent conversation context within Pi, associated with a single Akira task
- **Pi_Subprocess**: The operating system process running the Pi binary, spawned and managed by the Rust backend
- **Task_Chat**: The per-task chat UI that displays streaming Pi responses and accepts user input
- **Rust_Backend**: The Tauri v2 Rust application layer responsible for spawning Pi and relaying messages to the frontend
- **Frontend**: The React 19 + TypeScript UI layer communicating with the Rust backend via Tauri commands and events
- **Model_Selector**: The UI dropdown allowing users to choose which AI model Pi should use
- **Session_Stats**: Token usage, cost, and context window utilization data reported by Pi
- **Base_Branch**: The git branch a task branches off from, selected before task execution begins
- **Task_Branch**: The git branch automatically created for a task's work, derived from the base branch

## Requirements

### Requirement 1: Pi Binary Discovery

**User Story:** As a user, I want Akira to automatically find the Pi binary on my system, so that I do not need to manually configure binary paths.

#### Acceptance Criteria

1. WHEN Akira starts, THE Rust_Backend SHALL search for the `pi` binary in the following locations in priority order: the system PATH first, then `~/.pi/bin`, `/usr/local/bin`, and `~/.local/bin`, and SHALL use the first match found
2. WHEN the Pi binary is found, THE Rust_Backend SHALL store the resolved absolute path for subsequent use during the application lifetime
3. IF the Pi binary is not found in any searched location, THEN THE Rust_Backend SHALL return an error indicating Pi is not installed with a message listing all searched locations
4. WHEN the Pi binary path is resolved, THE Rust_Backend SHALL verify the binary is executable by checking file permissions
5. IF the resolved Pi binary file exists but is not executable, THEN THE Rust_Backend SHALL return an error indicating the binary was found but lacks execute permissions, including the file path

### Requirement 2: Pi Subprocess Lifecycle Management

**User Story:** As a user, I want Akira to manage the Pi process automatically, so that I can focus on tasks without worrying about process management.

#### Acceptance Criteria

1. WHEN a task requires AI interaction, THE Rust_Backend SHALL spawn a Pi subprocess in RPC mode with the arguments `--mode rpc --no-session` and JSON communication over stdin/stdout
2. THE Rust_Backend SHALL maintain at most one active Pi subprocess per task at any given time
3. WHEN the Pi subprocess exits unexpectedly, THE Rust_Backend SHALL emit an error event to the Frontend with the exit code and up to 4096 characters of stderr output
4. WHEN a task is completed or cancelled, THE Rust_Backend SHALL terminate the associated Pi subprocess gracefully by closing stdin and waiting up to 5 seconds before sending SIGKILL
5. WHEN the Akira application is shutting down, THE Rust_Backend SHALL terminate all active Pi subprocesses by closing stdin and force-killing any that do not exit within 3 seconds
6. THE Rust_Backend SHALL set the working directory of the Pi subprocess to the active workspace path
7. IF the workspace path does not exist or is not a directory, THEN THE Rust_Backend SHALL return an error and not spawn the subprocess

### Requirement 3: Pi RPC Command Communication

**User Story:** As a developer, I want Akira to send structured commands to Pi and receive responses, so that the frontend can drive AI interactions programmatically.

#### Acceptance Criteria

1. WHEN the Frontend sends an RPC command, THE Rust_Backend SHALL serialize the command as a JSON object containing at minimum a `type` field identifying the command type, and write it to the Pi subprocess stdin followed by a newline character
2. WHEN Pi emits a newline-delimited JSON event on stdout, THE Rust_Backend SHALL parse the event and forward it to the Frontend via Tauri event emission within 100 milliseconds of receipt
3. THE Rust_Backend SHALL support sending the following RPC commands to Pi: `prompt`, `get_available_models`, `set_model`, `get_state`, `get_session_stats`, `abort`, `steer`, `follow_up`, `new_session`, `compact`
4. IF a malformed JSON response is received from Pi stdout, THEN THE Rust_Backend SHALL log up to the first 4096 characters of the raw output and emit a parse error event to the Frontend containing the line number of the failed parse
5. WHEN the `abort` command is sent, THE Rust_Backend SHALL forward it to Pi stdin within 50 milliseconds regardless of any pending write operations
6. IF the Rust_Backend attempts to write a command to Pi stdin and the write fails due to a closed pipe or terminated process, THEN THE Rust_Backend SHALL emit an error event to the Frontend indicating the Pi subprocess is unavailable and discard the pending command

### Requirement 4: Streaming Response Handling

**User Story:** As a user, I want to see AI responses appear in real-time as Pi generates them, so that I get immediate feedback during task execution.

#### Acceptance Criteria

1. WHEN Pi emits a `message_update` event with `text_delta`, THE Frontend SHALL append the delta text to the current message in the Task_Chat within the same rendering frame (no batching delay)
2. WHEN Pi emits a `message_update` event with `thinking_delta`, THE Frontend SHALL append the thinking content to a collapsible section within the current message in the Task_Chat, with the section collapsed by default
3. WHEN Pi emits an `agent_start` event, THE Frontend SHALL display an animated loading indicator in the Task_Chat and disable the submit button
4. WHEN Pi emits an `agent_end` event, THE Frontend SHALL remove the loading indicator, re-enable the submit button, and persist the completed message to the database
5. WHEN Pi emits a `tool_execution_start` event, THE Frontend SHALL display the tool name with a "running" status indicator in the Task_Chat
6. WHEN Pi emits a `tool_execution_update` event, THE Frontend SHALL update the tool execution display with the provided status text from the event payload
7. WHEN Pi emits a `tool_execution_end` event, THE Frontend SHALL display the tool result in a collapsible section and update the status indicator to "success" or "error" based on the event payload
8. WHILE streaming content is being appended to the Task_Chat, THE Frontend SHALL auto-scroll to the latest content only if the user was already scrolled to the bottom prior to the update
9. IF a streaming event is received after an `agent_end` event without a preceding `agent_start` event, THEN THE Frontend SHALL discard the event and log a warning to the console
10. IF the Pi subprocess terminates unexpectedly during an active stream (between `agent_start` and `agent_end`), THEN THE Frontend SHALL remove the loading indicator, display an error message indicating the stream was interrupted, and re-enable the submit button

### Requirement 5: Model Selection

**User Story:** As a user, I want to choose which AI model Pi uses, so that I can pick the best model for my task.

#### Acceptance Criteria

1. WHEN the Settings page is opened, THE Frontend SHALL send a `get_available_models` command to Pi and display the results in a dropdown within 10 seconds, with the currently active model pre-selected
2. WHEN the user selects a model from the Model_Selector, THE Frontend SHALL send a `set_model` command to Pi with the selected model identifier
3. WHEN Pi confirms the model change, THE Frontend SHALL update the displayed active model in the UI
4. IF the `get_available_models` command fails or does not respond within 10 seconds, THEN THE Frontend SHALL display an error message indicating models could not be loaded and provide a retry option
5. THE Frontend SHALL persist the user's model selection locally so it is restored on next application launch
6. IF the `set_model` command fails, THEN THE Frontend SHALL display an error message indicating the model could not be changed and revert the Model_Selector to the previously active model
7. IF the persisted model selection is not present in the list returned by `get_available_models`, THEN THE Frontend SHALL select the first model in the list and update the persisted selection

### Requirement 6: Session Per Task

**User Story:** As a user, I want each task to have its own persistent AI session, so that context is preserved when I return to a task.

#### Acceptance Criteria

1. WHEN a task transitions to "in-progress" status and no Pi_Session record exists for that task, THE Rust_Backend SHALL create a new Pi_Session by sending a `new_session` command to Pi and storing the returned session identifier in the SQLite database associated with the task ID
2. WHEN a user opens a task that has an existing Pi_Session record in the database, THE Rust_Backend SHALL resume the session by spawning Pi with the session identifier so that Pi restores its internal conversation history
3. THE Rust_Backend SHALL store Pi_Session identifiers in the SQLite database associated with the task ID
4. WHEN a task transitions to "done" status, THE Rust_Backend SHALL retain the Pi_Session record in the database and preserve Pi's session files on disk so the conversation history remains readable but the session is not used for new interactions
5. WHEN the user sends a message in a task's chat, THE Rust_Backend SHALL route the prompt to the Pi_Session associated with that task
6. IF the user sends a message for a task that has no associated Pi_Session, THEN THE Rust_Backend SHALL create a new Pi_Session for that task before routing the message
7. IF session creation or resumption fails, THEN THE Rust_Backend SHALL emit an error event to the Frontend indicating the session could not be established and the reason provided by Pi
8. WHEN Pi emits a `compaction_start` event, THE Frontend SHALL display an inline notification within the Task_Chat indicating that context is being compressed
9. WHEN Pi emits a `compaction_end` event, THE Frontend SHALL update the session stats display with the new context window usage

### Requirement 7: Task Chat Powered by Pi

**User Story:** As a user, I want to chat with Pi within each task to give instructions and see results, so that I can guide the AI agent interactively.

#### Acceptance Criteria

1. THE Task_Chat SHALL display all messages exchanged between the user and Pi for the active task in chronological order, including user messages, assistant responses, and system notifications
2. WHEN the user submits a message in the Task_Chat, THE Frontend SHALL send a `prompt` command to Pi via the Rust_Backend and display the user's message immediately in the chat history
3. WHILE Pi is generating a response (between `agent_start` and `agent_end` events), THE Task_Chat SHALL display an animated streaming indicator appended to the assistant message and disable the submit button to prevent duplicate submissions
4. WHEN the user clicks the abort button during generation, THE Frontend SHALL send an `abort` command to Pi, re-enable the submit button, remove the streaming indicator, and retain any partial response text already displayed
5. THE Task_Chat SHALL persist each message to the SQLite database immediately after it is sent (user messages) or after streaming completes (assistant messages), storing the task ID, role, content, and timestamp for retrieval across application restarts
6. WHEN Pi emits `toolcall_delta` events, THE Task_Chat SHALL render the tool name and execution status inline with the response text
7. WHEN Pi emits `auto_retry_start` event, THE Task_Chat SHALL display a notification indicating Pi is retrying the operation
8. WHEN Pi emits `auto_retry_end` event, THE Task_Chat SHALL remove the retry notification
9. IF the `prompt` command fails to deliver to Pi (subprocess not running or communication error), THEN THE Frontend SHALL display an error message in the Task_Chat indicating the message could not be sent and re-enable the submit button
10. WHEN the user submits a message, THE Task_Chat SHALL prevent submission if the message is empty or contains only whitespace

### Requirement 8: Session Statistics Display

**User Story:** As a user, I want to see token usage and context window utilization for my current session, so that I understand resource consumption.

#### Acceptance Criteria

1. WHEN the user views a task's chat, THE Frontend SHALL display current session statistics (token usage, context window percentage) in a status bar positioned within the Task_Chat view
2. WHEN the Frontend requests session stats, THE Rust_Backend SHALL send a `get_session_stats` command to Pi and return the response within 5 seconds
3. WHEN an `agent_end` event is received, THE Frontend SHALL request updated session statistics from the Rust_Backend and refresh the stats display
4. WHEN context window usage exceeds 80%, THE Frontend SHALL display a warning indicator in the session stats bar that is visually distinct from the normal state
5. IF the `get_session_stats` command fails or times out, THEN THE Frontend SHALL display the last known statistics with an indicator that the data may be stale
6. IF no Pi_Session exists for the current task, THEN THE Frontend SHALL display the session stats bar in an empty state indicating no active session

### Requirement 9: Git Branch Workflow Per Task

**User Story:** As a user, I want each task to require a base branch selection and auto-create a working branch, so that my git workflow is clean and predictable.

#### Acceptance Criteria

1. WHEN a task is moved to "in-progress" status, THE Frontend SHALL prompt the user to select a Base_Branch from available local branches if no base branch is already stored in the task record
2. WHEN the user selects a Base_Branch, THE Rust_Backend SHALL create a new Task_Branch named with the pattern `task/<slugified-title>-<task-id-first-8-chars>` from the selected Base_Branch, where the slugified title is the task title lowercased, stripped of non-alphanumeric characters except hyphens, with spaces and underscores replaced by hyphens, and truncated to a maximum of 50 characters
3. WHEN the Task_Branch is created, THE Rust_Backend SHALL checkout the Task_Branch and store both the Task_Branch name and the Base_Branch name in the task's database record
4. IF a Task_Branch already exists for a task being moved back to "in-progress" from "review" or "failed" status, THEN THE Rust_Backend SHALL checkout the existing Task_Branch without creating a new one
5. IF the Task_Branch creation fails due to a git error, THEN THE Rust_Backend SHALL leave the working tree on the original branch, not update the task record, and return an error message indicating the failure reason
6. WHEN a task transitions to "done" status, THE Frontend SHALL display a merge prompt offering the user the option to merge the Task_Branch back into the stored Base_Branch
7. THE Rust_Backend SHALL store the Base_Branch selection in the task's database record for persistence

### Requirement 10: Project Rules Injection

**User Story:** As a user, I want my project analysis rules to be sent to Pi as context, so that Pi follows project-specific conventions.

#### Acceptance Criteria

1. WHEN a Pi_Session is started for a task, THE Rust_Backend SHALL read the `.akira/rules.md` file from the workspace directory, up to a maximum file size of 100KB
2. WHEN rules content is available, THE Rust_Backend SHALL prepend the rules content to the first `prompt` command's system prompt sent to Pi for that session
3. IF the `.akira/rules.md` file does not exist, THEN THE Rust_Backend SHALL start the Pi_Session without injecting rules
4. IF the `.akira/rules.md` file exists but cannot be read due to a permissions error or I/O failure, THEN THE Rust_Backend SHALL start the Pi_Session without injecting rules and emit a warning event to the Frontend indicating the rules file could not be loaded
5. WHEN the user triggers a project re-analysis, THE Rust_Backend SHALL regenerate and overwrite the `.akira/rules.md` file content for use in subsequent new sessions
6. IF the `.akira/rules.md` file exceeds 100KB, THEN THE Rust_Backend SHALL truncate the content to 100KB and emit a warning event to the Frontend indicating the rules were truncated

### Requirement 11: Removal of Legacy Provider Systems

**User Story:** As a developer, I want the legacy multi-provider systems removed from the codebase, so that the architecture is simplified and maintainable.

#### Acceptance Criteria

1. THE Rust_Backend SHALL NOT contain CLI Router modules (`cli_router/`, `cli_router_core.rs`, `commands/router.rs`)
2. THE Rust_Backend SHALL NOT contain MCP modules (`mcp/` directory, `mcp/commands.rs`, `mcp/client.rs`, `mcp/manager.rs`, `mcp/transport.rs`, `db/mcp_queries.rs`)
3. THE Rust_Backend SHALL NOT contain Engine management commands (`commands/engines.rs`)
4. THE Rust_Backend SHALL NOT contain Skills management commands (`commands/skills.rs`)
5. THE Frontend SHALL NOT contain the Engine store (`engineStore.ts`), MCP store (`mcpStore.ts`), or Skill store (`skillStore.ts`)
6. THE Frontend SHALL NOT contain Settings UI panels for Engines, Router configuration, MCP servers, Skills, or Chat API (Groq)
7. THE Frontend SHALL NOT contain the Task Creator Chat component that uses the Groq API
8. WHEN all legacy modules listed in criteria 1–7 have been removed, THE Rust_Backend SHALL compile without errors and THE Frontend SHALL build without errors
9. THE Rust_Backend SHALL NOT register Tauri commands or invoke handlers referencing removed CLI Router, MCP, Engine, or Skills modules
10. THE Frontend SHALL NOT contain import statements or type references to removed stores (`engineStore`, `mcpStore`, `skillStore`) or removed components (`TaskCreatorChat`)

### Requirement 12: Pi Authentication Status

**User Story:** As a user, I want Akira to verify that Pi is authenticated before attempting operations, so that I get clear feedback if setup is incomplete.

#### Acceptance Criteria

1. WHEN Akira starts and the Pi binary is found, THE Rust_Backend SHALL verify Pi authentication status by spawning Pi, sending a `get_available_models` command, and waiting up to 10 seconds for a response
2. WHILE the authentication check is in progress, THE Frontend SHALL display a "verifying" status indicator on the Settings page
3. IF Pi returns an authentication error in response to the `get_available_models` command, THEN THE Frontend SHALL display a setup guide directing the user to run `pi auth` in their terminal
4. IF Pi fails to respond within 10 seconds or returns a non-authentication error during the verification check, THEN THE Frontend SHALL display an error message indicating the connection to Pi failed and the specific error category (timeout or Pi error)
5. WHEN Pi authentication is confirmed by a successful `get_available_models` response, THE Frontend SHALL display a connected status indicator in the Settings page
6. WHEN the user triggers a re-check action on the Settings page, THE Rust_Backend SHALL repeat the authentication verification without requiring an application restart
7. THE Rust_Backend SHALL NOT store or manage any API keys — authentication is handled entirely by Pi's own auth storage (`~/.pi/agent/auth.json`)

### Requirement 13: Steer and Follow-Up During Streaming

**User Story:** As a user, I want to send additional instructions while Pi is still generating a response, so that I can guide the AI without waiting for completion.

#### Acceptance Criteria

1. WHILE Pi is generating a response (between `agent_start` and `agent_end` events), THE Task_Chat SHALL keep the text input enabled and display a send button that submits the message as a steer command
2. WHEN the user submits a message during active generation, THE Rust_Backend SHALL send a `steer` command to Pi with the user's message content
3. THE Task_Chat SHALL render steered messages with a distinct label (e.g., "Steer") and a different visual style from regular user prompts so that a user can identify which messages were sent during active generation
4. WHEN a steer command is sent, THE Frontend SHALL continue rendering incoming `message_update` events from the active streaming response without interruption
5. IF the Rust_Backend fails to deliver the steer command to Pi (e.g., subprocess not running or stdin write error), THEN THE Frontend SHALL display an inline error notification in the Task_Chat indicating the steer was not delivered

### Requirement 14: Task Creation via Pi Chat

**User Story:** As a user, I want to describe what I need in natural language and have Pi help me create a well-structured task, so that task creation is conversational and intelligent.

#### Acceptance Criteria

1. WHEN the user opens the task creation dialog, THE Frontend SHALL provide a chat interface connected to a dedicated Pi_Session identified by a unique session ID scoped to the active workspace
2. WHEN the user describes a task in natural language, THE Rust_Backend SHALL send the description along with the last 6 conversation messages as context to Pi with a system prompt instructing Pi to generate a structured task containing title (maximum 100 characters), description (maximum 2500 characters), and priority (one of "high", "medium", or "low")
3. WHEN Pi responds with a structured task suggestion, THE Frontend SHALL display the suggested title, description, and priority fields in an editable form for user review within 2 seconds of receiving the response
4. WHEN the user confirms the task suggestion, THE Frontend SHALL create the task in the Kanban board with the confirmed fields and a default status of "todo"
5. WHEN the task creation session ends, THE Rust_Backend SHALL clear the conversation messages associated with the dedicated Pi_Session and generate a new session ID for subsequent use
6. IF Pi fails to extract a structured task from the conversation, THEN THE Frontend SHALL display a message indicating that task extraction was unsuccessful and allow the user to continue the conversation or retry summarization
7. IF the Rust_Backend does not receive a response from Pi within 30 seconds, THEN THE Frontend SHALL display a timeout indication and allow the user to retry the request
