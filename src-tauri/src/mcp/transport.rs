//! MCP Transport Layer
//!
//! Provides the transport implementation to establish connections
//! with MCP servers via stdio, HTTP, and SSE.

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::oneshot;

/// MCP JSON-RPC message
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcMessage {
    pub jsonrpc: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub method: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<JsonRpcError>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcError {
    pub code: i32,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
}

impl JsonRpcMessage {
    #[allow(dead_code)]
    pub fn request(id: u64, method: &str, params: Value) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            id: Some(Value::Number(id.into())),
            method: Some(method.to_string()),
            params: Some(params),
            result: None,
            error: None,
        }
    }

    #[allow(dead_code)]
    pub fn notification(method: &str, params: Value) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            id: None,
            method: Some(method.to_string()),
            params: Some(params),
            result: None,
            error: None,
        }
    }
}

/// Transport trait for MCP connections
#[async_trait]
pub trait McpTransport: Send + Sync {
    /// Connect to the server
    async fn connect(&mut self) -> Result<(), McpTransportError>;

    /// Disconnect from the server
    async fn disconnect(&mut self) -> Result<(), McpTransportError>;

    /// Send a message and wait for response
    async fn send_request(
        &mut self,
        message: JsonRpcMessage,
    ) -> Result<JsonRpcMessage, McpTransportError>;

    /// Send a notification (no response expected)
    async fn send_notification(
        &mut self,
        message: JsonRpcMessage,
    ) -> Result<(), McpTransportError>;

    /// Check if connected
    fn is_connected(&self) -> bool;
}

/// Transport errors
#[derive(Debug, thiserror::Error)]
pub enum McpTransportError {
    #[error("IO error: {0}")]
    Io(String),

    #[error("JSON error: {0}")]
    Json(String),

    #[error("Connection timeout")]
    Timeout,

    #[error("Not connected")]
    NotConnected,

    #[error("Connection closed")]
    ConnectionClosed,

    #[error("Invalid response: {0}")]
    InvalidResponse(String),

    #[error("Request timeout")]
    RequestTimeout,

    #[error("Server error: {0}")]
    ServerError(String),

    #[error("HTTP error: {status} - {message}")]
    HttpError { status: u16, message: String },
}

/// Stdio transport implementation
pub struct StdioTransport {
    command: String,
    args: Vec<String>,
    env: HashMap<String, String>,
    
    // Runtime state
    child: Option<Child>,
    stdin: Option<ChildStdin>,
    pending: Arc<Mutex<HashMap<u64, oneshot::Sender<JsonRpcMessage>>>>,
    reader_handle: Option<tokio::task::JoinHandle<()>>,
    connected: bool,
}

impl StdioTransport {
    pub fn new(command: String, args: Vec<String>, env: HashMap<String, String>) -> Self {
        Self {
            command,
            args,
            env,
            child: None,
            stdin: None,
            pending: Arc::new(Mutex::new(HashMap::new())),
            reader_handle: None,
            connected: false,
        }
    }
}

#[async_trait]
impl McpTransport for StdioTransport {
    async fn connect(&mut self) -> Result<(), McpTransportError> {
        if self.connected {
            return Ok(());
        }

        // Determine actual path for command
        let resolved_command = self.command.clone();

        let mut cmd = Command::new(&resolved_command);
        cmd.args(&self.args);
        
        // Inherit current environment, then apply overrides
        for (k, v) in std::env::vars() {
            cmd.env(k, v);
        }

        #[cfg(target_family = "unix")]
        {
            let current_path = std::env::var("PATH").unwrap_or_default();
            let home = dirs::home_dir().map(|p| p.to_string_lossy().to_string()).unwrap_or_default();
            let augmented_path = format!(
                "{}:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:{}/.bun/bin:{}/.cargo/bin:{}/.local/bin",
                current_path, home, home, home
            );
            cmd.env("PATH", augmented_path);
        }
        for (k, v) in &self.env {
            cmd.env(k, v);
        }

        cmd.stdin(std::process::Stdio::piped());
        cmd.stdout(std::process::Stdio::piped());
        cmd.stderr(std::process::Stdio::piped());

        let mut child = cmd.spawn().map_err(|e| McpTransportError::Io(format!("Failed to spawn process {}: {}", resolved_command, e)))?;

        let stdin = child.stdin.take().ok_or_else(|| McpTransportError::Io("Failed to open stdin".to_string()))?;
        let stdout = child.stdout.take().ok_or_else(|| McpTransportError::Io("Failed to open stdout".to_string()))?;
        let stderr = child.stderr.take().ok_or_else(|| McpTransportError::Io("Failed to open stderr".to_string()))?;

        // Background task to read stderr for debugging
        tokio::spawn(async move {
            let mut reader = BufReader::new(stderr);
            let mut line = String::new();
            while let Ok(n) = reader.read_line(&mut line).await {
                if n == 0 { break; }
                log::warn!("[MCP STDERR] {}", line.trim_end());
                line.clear();
            }
        });

        // Background task to read stdout JSON-RPC messages
        let pending = self.pending.clone();
        let reader_handle = tokio::spawn(async move {
            let mut reader = BufReader::new(stdout);
            let mut line = String::new();
            while let Ok(n) = reader.read_line(&mut line).await {
                if n == 0 { break; } // EOF

                if let Ok(msg) = serde_json::from_str::<JsonRpcMessage>(&line) {
                    if let Some(id_val) = &msg.id {
                        if let Some(id) = id_val.as_u64() {
                            let mut map = pending.lock().unwrap();
                            if let Some(tx) = map.remove(&id) {
                                let _ = tx.send(msg);
                            }
                        }
                    } else if let Some(_method) = &msg.method {
                        // Handle server-to-client notifications here if needed in the future
                        log::debug!("[MCP NOTIFICATION] {:?}", msg);
                    }
                } else {
                    log::warn!("[MCP STDOUT INVALID JSON] {}", line.trim_end());
                }
                line.clear();
            }
        });

        self.child = Some(child);
        self.stdin = Some(stdin);
        self.reader_handle = Some(reader_handle);
        self.connected = true;

        Ok(())
    }

    async fn disconnect(&mut self) -> Result<(), McpTransportError> {
        if !self.connected {
            return Ok(());
        }

        if let Some(mut child) = self.child.take() {
            let _ = child.kill().await;
        }

        if let Some(handle) = self.reader_handle.take() {
            handle.abort();
        }

        self.stdin = None;
        self.connected = false;

        Ok(())
    }

    async fn send_request(
        &mut self,
        message: JsonRpcMessage,
    ) -> Result<JsonRpcMessage, McpTransportError> {
        if !self.connected {
            return Err(McpTransportError::NotConnected);
        }

        let stdin = self.stdin.as_mut().ok_or(McpTransportError::NotConnected)?;
        
        let id = message.id.as_ref()
            .and_then(|v| v.as_u64())
            .ok_or_else(|| McpTransportError::InvalidResponse("Message ID must be u64".into()))?;

        let (tx, rx) = oneshot::channel();
        {
            let mut pending = self.pending.lock().unwrap();
            pending.insert(id, tx);
        }

        let mut data = serde_json::to_string(&message).map_err(|e| McpTransportError::Json(e.to_string()))?;
        data.push('\n');

        stdin.write_all(data.as_bytes()).await.map_err(|e| McpTransportError::Io(e.to_string()))?;
        stdin.flush().await.map_err(|e| McpTransportError::Io(e.to_string()))?;

        let response = rx.await.map_err(|_| McpTransportError::ConnectionClosed)?;
        
        if let Some(err) = response.error {
            return Err(McpTransportError::ServerError(err.message));
        }

        Ok(response)
    }

    async fn send_notification(
        &mut self,
        message: JsonRpcMessage,
    ) -> Result<(), McpTransportError> {
        if !self.connected {
            return Err(McpTransportError::NotConnected);
        }

        let stdin = self.stdin.as_mut().ok_or(McpTransportError::NotConnected)?;
        
        let mut data = serde_json::to_string(&message).map_err(|e| McpTransportError::Json(e.to_string()))?;
        data.push('\n');

        stdin.write_all(data.as_bytes()).await.map_err(|e| McpTransportError::Io(e.to_string()))?;
        stdin.flush().await.map_err(|e| McpTransportError::Io(e.to_string()))?;

        Ok(())
    }

    fn is_connected(&self) -> bool {
        self.connected
    }
}

/// SSE transport implementation (simplified for now as frontend handles SSE usually)
pub struct SseTransport {
    url: String,
    headers: HashMap<String, String>,
    connected: bool,
}

impl SseTransport {
    #[allow(dead_code)]
    pub fn new(url: String, headers: HashMap<String, String>) -> Self {
        Self {
            url,
            headers,
            connected: false,
        }
    }
}

#[async_trait]
impl McpTransport for SseTransport {
    async fn connect(&mut self) -> Result<(), McpTransportError> {
        self.connected = true;
        Ok(())
    }

    async fn disconnect(&mut self) -> Result<(), McpTransportError> {
        self.connected = false;
        Ok(())
    }

    fn is_connected(&self) -> bool {
        self.connected
    }

    async fn send_request(
        &mut self,
        _message: JsonRpcMessage,
    ) -> Result<JsonRpcMessage, McpTransportError> {
        Err(McpTransportError::NotConnected)
    }

    async fn send_notification(
        &mut self,
        _message: JsonRpcMessage,
    ) -> Result<(), McpTransportError> {
        Err(McpTransportError::NotConnected)
    }
}

/// Create transport based on configuration
pub fn create_transport(
    transport_type: &str,
    config: &Value,
) -> Result<Box<dyn McpTransport>, McpTransportError> {
    match transport_type {
        "stdio" => {
            let command = config["command"]
                .as_str()
                .ok_or_else(|| McpTransportError::InvalidResponse("Missing command".to_string()))?
                .to_string();
            let args: Vec<String> = config["args"]
                .as_array()
                .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
                .unwrap_or_default();
            let env: HashMap<String, String> = config["env"]
                .as_object()
                .map(|obj| {
                    obj.iter()
                        .filter_map(|(k, v)| v.as_str().map(|v| (k.clone(), v.to_string())))
                        .collect()
                })
                .unwrap_or_default();

            Ok(Box::new(StdioTransport::new(command, args, env)))
        }
        "sse" => {
            let url = config["url"]
                .as_str()
                .ok_or_else(|| McpTransportError::InvalidResponse("Missing URL".to_string()))?
                .to_string();
            let headers: HashMap<String, String> = config["headers"]
                .as_object()
                .map(|obj| {
                    obj.iter()
                        .filter_map(|(k, v)| v.as_str().map(|v| (k.clone(), v.to_string())))
                        .collect()
                })
                .unwrap_or_default();

            Ok(Box::new(SseTransport::new(url, headers)))
        }
        _ => Err(McpTransportError::InvalidResponse(format!(
            "Unknown transport type: {}",
            transport_type
        ))),
    }
}
