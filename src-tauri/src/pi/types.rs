use std::path::PathBuf;

use serde::{Deserialize, Serialize};

/// Commands sent from Akira to the Pi subprocess via stdin.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type")]
pub enum PiCommand {
    #[serde(rename = "prompt")]
    Prompt { message: String },
    #[serde(rename = "get_available_models")]
    GetAvailableModels,
    #[serde(rename = "set_model")]
    SetModel { model: String },
    #[serde(rename = "get_state")]
    GetState,
    #[serde(rename = "get_session_stats")]
    GetSessionStats,
    #[serde(rename = "abort")]
    Abort,
    #[serde(rename = "steer")]
    Steer { message: String },
    #[serde(rename = "follow_up")]
    FollowUp { message: String },
    #[serde(rename = "new_session")]
    NewSession,
    #[serde(rename = "compact")]
    Compact,
}

/// Events received from the Pi subprocess via stdout (JSON lines).
/// Pi sends many event types — we use serde's deny_unknown_fields=false (default)
/// to gracefully handle fields we don't use.
#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(tag = "type")]
pub enum PiEvent {
    // ── Agent lifecycle ──────────────────────────────────────────────
    #[serde(rename = "agent_start")]
    AgentStart,
    #[serde(rename = "agent_end")]
    AgentEnd {
        #[serde(default)]
        messages: Option<serde_json::Value>,
    },

    // ── Turn lifecycle ───────────────────────────────────────────────
    #[serde(rename = "turn_start")]
    TurnStart,
    #[serde(rename = "turn_end")]
    TurnEnd {
        #[serde(default)]
        message: Option<serde_json::Value>,
    },

    // ── Message lifecycle ────────────────────────────────────────────
    #[serde(rename = "message_start")]
    MessageStart {
        #[serde(default)]
        message: Option<serde_json::Value>,
    },
    #[serde(rename = "message_end")]
    MessageEnd {
        #[serde(default)]
        message: Option<serde_json::Value>,
    },

    // ── Streaming deltas ─────────────────────────────────────────────
    /// The main streaming event. Contains nested `assistantMessageEvent` with delta info.
    #[serde(rename = "message_update")]
    MessageUpdate {
        #[serde(default)]
        message: Option<serde_json::Value>,
        #[serde(rename = "assistantMessageEvent", default)]
        assistant_message_event: Option<serde_json::Value>,
    },

    // ── Tool execution ───────────────────────────────────────────────
    #[serde(rename = "tool_execution_start")]
    ToolExecutionStart {
        #[serde(rename = "toolCallId", default)]
        tool_call_id: Option<String>,
        #[serde(rename = "toolName", default)]
        tool_name: Option<String>,
        #[serde(default)]
        args: Option<serde_json::Value>,
    },
    #[serde(rename = "tool_execution_update")]
    ToolExecutionUpdate {
        #[serde(rename = "toolCallId", default)]
        tool_call_id: Option<String>,
        #[serde(rename = "toolName", default)]
        tool_name: Option<String>,
        #[serde(rename = "partialResult", default)]
        partial_result: Option<serde_json::Value>,
    },
    #[serde(rename = "tool_execution_end")]
    ToolExecutionEnd {
        #[serde(rename = "toolCallId", default)]
        tool_call_id: Option<String>,
        #[serde(rename = "toolName", default)]
        tool_name: Option<String>,
        #[serde(default)]
        result: Option<serde_json::Value>,
        #[serde(rename = "isError", default)]
        is_error: bool,
    },

    // ── Compaction ───────────────────────────────────────────────────
    #[serde(rename = "compaction_start")]
    CompactionStart {
        #[serde(default)]
        reason: Option<String>,
    },
    #[serde(rename = "compaction_end")]
    CompactionEnd {
        #[serde(default)]
        reason: Option<String>,
        #[serde(default)]
        result: Option<serde_json::Value>,
    },

    // ── Auto retry ───────────────────────────────────────────────────
    #[serde(rename = "auto_retry_start")]
    AutoRetryStart {
        #[serde(default)]
        attempt: Option<u32>,
        #[serde(rename = "maxAttempts", default)]
        max_attempts: Option<u32>,
    },
    #[serde(rename = "auto_retry_end")]
    AutoRetryEnd {
        #[serde(default)]
        success: Option<bool>,
    },

    // ── Queue update ─────────────────────────────────────────────────
    #[serde(rename = "queue_update")]
    QueueUpdate {
        #[serde(default)]
        steering: Option<Vec<String>>,
        #[serde(rename = "followUp", default)]
        follow_up: Option<Vec<String>>,
    },

    // ── Command responses ────────────────────────────────────────────
    #[serde(rename = "response")]
    Response {
        command: String,
        success: bool,
        #[serde(default)]
        data: Option<serde_json::Value>,
        #[serde(default)]
        error: Option<String>,
    },

    // ── Extension errors ─────────────────────────────────────────────
    #[serde(rename = "extension_error")]
    ExtensionError {
        #[serde(default)]
        error: Option<String>,
    },
}

/// The nested event inside `message_update` that carries streaming deltas.
#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(tag = "type")]
pub enum AssistantMessageEvent {
    #[serde(rename = "start")]
    Start,
    #[serde(rename = "text_start")]
    TextStart {
        #[serde(rename = "contentIndex", default)]
        content_index: Option<u32>,
        #[serde(default)]
        partial: Option<serde_json::Value>,
    },
    #[serde(rename = "text_delta")]
    TextDelta {
        #[serde(rename = "contentIndex", default)]
        content_index: Option<u32>,
        #[serde(default)]
        delta: Option<String>,
        #[serde(default)]
        partial: Option<serde_json::Value>,
    },
    #[serde(rename = "text_end")]
    TextEnd {
        #[serde(rename = "contentIndex", default)]
        content_index: Option<u32>,
        #[serde(default)]
        content: Option<String>,
        #[serde(default)]
        partial: Option<serde_json::Value>,
    },
    #[serde(rename = "thinking_start")]
    ThinkingStart,
    #[serde(rename = "thinking_delta")]
    ThinkingDelta {
        #[serde(default)]
        delta: Option<String>,
    },
    #[serde(rename = "thinking_end")]
    ThinkingEnd,
    #[serde(rename = "toolcall_start")]
    ToolcallStart {
        #[serde(default)]
        id: Option<String>,
        #[serde(default)]
        name: Option<String>,
    },
    #[serde(rename = "toolcall_delta")]
    ToolcallDelta {
        #[serde(default)]
        delta: Option<String>,
    },
    #[serde(rename = "toolcall_end")]
    ToolcallEnd {
        #[serde(rename = "toolCall", default)]
        tool_call: Option<serde_json::Value>,
    },
    #[serde(rename = "done")]
    Done {
        #[serde(default)]
        reason: Option<String>,
    },
    #[serde(rename = "error")]
    Error {
        #[serde(default)]
        reason: Option<String>,
    },
}

/// A model available through Pi.
#[derive(Debug, Deserialize, Serialize, Clone, PartialEq)]
pub struct PiModel {
    pub id: String,
    pub name: String,
    pub provider: String,
}

/// Pi authentication status returned by the auth check command.
#[derive(Debug, Serialize, Clone)]
pub struct PiAuthStatus {
    pub authenticated: bool,
    pub error: Option<String>,
}

/// Errors that can occur during Pi operations.
#[derive(thiserror::Error, Debug)]
pub enum PiError {
    #[error("Pi binary not found. Searched: {searched_locations:?}")]
    BinaryNotFound { searched_locations: Vec<String> },

    #[error("Pi binary at {path} is not executable")]
    BinaryNotExecutable { path: PathBuf },

    #[error("Pi subprocess for task {task_id} is not running")]
    ProcessNotRunning { task_id: String },

    #[error("Failed to write to Pi stdin for task {task_id}: {reason}")]
    StdinWriteFailed { task_id: String, reason: String },

    #[error("Pi subprocess exited unexpectedly: code={exit_code:?}, stderr={stderr}")]
    UnexpectedExit {
        exit_code: Option<i32>,
        stderr: String,
    },

    #[error("Failed to parse Pi event: {raw_line}")]
    ParseError { raw_line: String, line_number: usize },

    #[error("Workspace path does not exist or is not a directory: {path}")]
    InvalidWorkspace { path: PathBuf },

    #[error("Pi authentication failed: {message}")]
    AuthenticationFailed { message: String },

    #[error("Pi session error: {message}")]
    SessionError { message: String },

    #[error("Operation timed out after {timeout_secs}s")]
    Timeout { timeout_secs: u64 },

    #[error("Rules file error: {message}")]
    RulesError { message: String },

    #[error("Git operation failed: {message}")]
    GitError { message: String },
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    /// Strategy to generate arbitrary PiCommand variants covering all 10 variants.
    fn arb_pi_command() -> impl Strategy<Value = PiCommand> {
        prop_oneof![
            any::<String>().prop_map(|message| PiCommand::Prompt { message }),
            Just(PiCommand::GetAvailableModels),
            any::<String>().prop_map(|model| PiCommand::SetModel { model }),
            Just(PiCommand::GetState),
            Just(PiCommand::GetSessionStats),
            Just(PiCommand::Abort),
            any::<String>().prop_map(|message| PiCommand::Steer { message }),
            any::<String>().prop_map(|message| PiCommand::FollowUp { message }),
            Just(PiCommand::NewSession),
            Just(PiCommand::Compact),
        ]
    }

    proptest! {
        /// **Validates: Requirements 3.1**
        ///
        /// Property 3: PiCommand serialization produces valid JSON-line format.
        /// For any valid PiCommand variant, serializing it produces a string that is
        /// valid JSON, contains a "type" field, and ends with exactly one newline
        /// character when formatted as a JSON line.
        #[test]
        fn pi_command_serialization_produces_valid_json_line(cmd in arb_pi_command()) {
            // Serialize the command to JSON
            let json_str = serde_json::to_string(&cmd)
                .expect("PiCommand serialization should not fail");

            // Format as a JSON line (append newline)
            let json_line = format!("{}\n", json_str);

            // Assert: the serialized string is valid JSON
            let parsed: serde_json::Value = serde_json::from_str(&json_str)
                .expect("Serialized PiCommand should be valid JSON");

            // Assert: the JSON contains a "type" field
            prop_assert!(
                parsed.get("type").is_some(),
                "Serialized PiCommand must contain a \"type\" field, got: {}",
                json_str
            );

            // Assert: the "type" field is a non-empty string
            let type_val = parsed.get("type").unwrap();
            prop_assert!(
                type_val.is_string() && !type_val.as_str().unwrap().is_empty(),
                "The \"type\" field must be a non-empty string, got: {:?}",
                type_val
            );

            // Assert: the JSON line ends with exactly one newline
            prop_assert!(
                json_line.ends_with('\n'),
                "JSON line must end with a newline character"
            );
            prop_assert!(
                !json_line.ends_with("\n\n"),
                "JSON line must end with exactly one newline, not multiple"
            );
        }
    }

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(100))]

        /// Ensure minimum 100 iterations are run for the property test.
        #[test]
        fn pi_command_serialization_100_iterations(cmd in arb_pi_command()) {
            let json_str = serde_json::to_string(&cmd).unwrap();
            let json_line = format!("{}\n", json_str);

            // Valid JSON
            let parsed: serde_json::Value = serde_json::from_str(&json_str).unwrap();

            // Contains "type" field
            prop_assert!(parsed.get("type").is_some());

            // Ends with newline
            prop_assert!(json_line.ends_with('\n'));
            prop_assert!(!json_line.ends_with("\n\n"));
        }
    }
}
