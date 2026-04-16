use serde::{Deserialize, Serialize};
use std::io::{self, BufRead};

/// Agent Event Types for structured streaming output
/// Each event represents a different type of output from the AI agent
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AgentEvent {
    /// AI thinking/reasoning process (shown in thinking block)
    Thinking {
        thinking: String,
    },
    
    /// Regular text output from AI
    Text {
        text: String,
    },
    
    /// Tool use call
    ToolUse {
        tool_name: String,
        tool_input: serde_json::Value,
    },
    
    /// Tool execution output
    ToolOutput {
        tool_output: String,
    },
    
    /// Token usage statistics
    Usage {
        input_tokens: u64,
        output_tokens: u64,
    },
    
    /// Stream complete
    Done,
    
    /// Error during processing
    Error {
        error: String,
    },
}

impl AgentEvent {
    /// Parse a single NDJSON line into AgentEvent
    pub fn from_ndjson(line: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(line.trim())
    }
    
    /// Convert AgentEvent to NDJSON string
    pub fn to_ndjson(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string(self)
    }
    
    /// Get a human-readable description of the event
    pub fn description(&self) -> String {
        match self {
            AgentEvent::Thinking { .. } => "Thinking".to_string(),
            AgentEvent::Text { .. } => "Text".to_string(),
            AgentEvent::ToolUse { tool_name, .. } => format!("Tool: {}", tool_name),
            AgentEvent::ToolOutput { .. } => "Tool Output".to_string(),
            AgentEvent::Usage { input_tokens, output_tokens } => {
                format!("Usage: {} in / {} out", input_tokens, output_tokens)
            }
            AgentEvent::Done => "Complete".to_string(),
            AgentEvent::Error { error } => format!("Error: {}", error),
        }
    }
}

/// NDJSON Parser for streaming agent output
pub struct NdjsonParser;

impl NdjsonParser {
    /// Parse multiple NDJSON lines
    pub fn parse_lines(lines: &str) -> Vec<Result<AgentEvent, serde_json::Error>> {
        lines
            .lines()
            .filter(|line| !line.trim().is_empty())
            .map(AgentEvent::from_ndjson)
            .collect()
    }
    
    /// Parse a stream reader line by line
    pub fn parse_stream<R: BufRead>(reader: R) -> impl Iterator<Item = Result<AgentEvent, io::Error>> + use<R> {
        reader
            .lines()
            .filter_map(|line| {
                match line {
                    Ok(line) if line.trim().is_empty() => None,
                    Ok(line) => Some(
                        AgentEvent::from_ndjson(&line)
                            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))
                    ),
                    Err(e) => Some(Err(e)),
                }
            })
    }
}

/// Streaming output accumulator
/// Collects events and provides methods to extract content
#[derive(Debug, Default)]
pub struct StreamAccumulator {
    events: Vec<AgentEvent>,
    text_buffer: String,
    thinking_buffer: String,
    total_input_tokens: u64,
    total_output_tokens: u64,
}

impl StreamAccumulator {
    pub fn new() -> Self {
        Self::default()
    }
    
    /// Add an event to the accumulator
    pub fn add_event(&mut self, event: AgentEvent) {
        match &event {
            AgentEvent::Text { text } => {
                self.text_buffer.push_str(text);
            }
            AgentEvent::Thinking { thinking } => {
                self.thinking_buffer.push_str(thinking);
            }
            AgentEvent::Usage { input_tokens, output_tokens } => {
                self.total_input_tokens = *input_tokens;
                self.total_output_tokens = *output_tokens;
            }
            _ => {}
        }
        self.events.push(event);
    }
    
    /// Get accumulated text content
    pub fn get_text(&self) -> &str {
        &self.text_buffer
    }
    
    /// Get accumulated thinking content
    pub fn get_thinking(&self) -> &str {
        &self.thinking_buffer
    }
    
    /// Get total token usage
    pub fn get_usage(&self) -> (u64, u64) {
        (self.total_input_tokens, self.total_output_tokens)
    }
    
    /// Get all events
    pub fn get_events(&self) -> &[AgentEvent] {
        &self.events
    }
    
    /// Check if stream is complete
    pub fn is_complete(&self) -> bool {
        self.events.iter().any(|e| matches!(e, AgentEvent::Done))
    }
    
    /// Check if there was an error
    pub fn has_error(&self) -> Option<&str> {
        self.events.iter().find_map(|e| match e {
            AgentEvent::Error { error } => Some(error.as_str()),
            _ => None,
        })
    }
    
    /// Get all tool uses
    pub fn get_tool_uses(&self) -> Vec<&AgentEvent> {
        self.events
            .iter()
            .filter(|e| matches!(e, AgentEvent::ToolUse { .. }))
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_thinking_event() {
        let json = r#"{"type":"thinking","thinking":"Let me analyze this..."}"#;
        let event = AgentEvent::from_ndjson(json).unwrap();
        
        match event {
            AgentEvent::Thinking { thinking } => {
                assert_eq!(thinking, "Let me analyze this...");
            }
            _ => panic!("Expected Thinking event"),
        }
    }

    #[test]
    fn test_parse_tool_use_event() {
        let json = r#"{"type":"tool_use","tool_name":"BashTool","tool_input":{"command":"ls -la"}}"#;
        let event = AgentEvent::from_ndjson(json).unwrap();
        
        match event {
            AgentEvent::ToolUse { tool_name, tool_input } => {
                assert_eq!(tool_name, "BashTool");
                assert!(tool_input.get("command").is_some());
            }
            _ => panic!("Expected ToolUse event"),
        }
    }

    #[test]
    fn test_accumulator() {
        let mut acc = StreamAccumulator::new();
        
        acc.add_event(AgentEvent::Thinking { thinking: "Step 1".to_string() });
        acc.add_event(AgentEvent::Text { text: "Hello ".to_string() });
        acc.add_event(AgentEvent::Text { text: "world!".to_string() });
        acc.add_event(AgentEvent::Usage { input_tokens: 100, output_tokens: 50 });
        acc.add_event(AgentEvent::Done);
        
        assert_eq!(acc.get_thinking(), "Step 1");
        assert_eq!(acc.get_text(), "Hello world!");
        assert_eq!(acc.get_usage(), (100, 50));
        assert!(acc.is_complete());
    }

    #[test]
    fn test_ndjson_parser() {
        let ndjson = r#"{"type":"thinking","thinking":"Thinking..."}
{"type":"text","text":"Hello"}
{"type":"done"}"#;
        
        let results = NdjsonParser::parse_lines(ndjson);
        assert_eq!(results.len(), 3);
        assert!(results.iter().all(|r| r.is_ok()));
    }
}
