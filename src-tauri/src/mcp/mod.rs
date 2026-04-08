//! MCP (Model Context Protocol) implementation for Akira
//!
//! This module provides:
//! - MCP server management (connect, disconnect, configure)
//! - Tool discovery and execution
//! - Transport layer (stdio, SSE, HTTP)
//! - Authentication handling

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

pub mod client;
pub mod commands;
pub mod manager;
pub mod transport;

// Re-export commonly used types
pub use client::{McpClient, McpClientError, ResourceContent};
pub use manager::{ConnectionState, McpConnectionManager, McpManagerError};
pub use transport::{JsonRpcMessage, JsonRpcError, McpTransport as McpTransportTrait, McpTransportError};

/// MCP Tool definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpTool {
    pub name: String,
    pub description: String,
    #[serde(rename = "inputSchema")]
    pub input_schema: serde_json::Value,
}

/// MCP Resource definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpResource {
    pub uri: String,
    pub name: String,
    #[serde(rename = "mimeType")]
    pub mime_type: Option<String>,
    pub description: Option<String>,
}

/// Server capabilities returned during initialization
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ServerCapabilities {
    #[serde(default)]
    pub tools: Option<serde_json::Value>,
    #[serde(default)]
    pub resources: Option<serde_json::Value>,
    #[serde(default)]
    pub prompts: Option<serde_json::Value>,
}

/// MCP Server information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerInfo {
    pub name: String,
    pub version: String,
}

/// Tool call result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCallResult {
    pub content: Vec<ToolContent>,
    #[serde(rename = "isError")]
    pub is_error: Option<bool>,
}

/// Tool content item
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ToolContent {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "image")]
    Image { data: String, mime_type: String },
    #[serde(rename = "resource")]
    Resource { resource: EmbeddedResource },
}

/// Embedded resource in tool result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbeddedResource {
    pub uri: String,
    pub mime_type: Option<String>,
    pub text: Option<String>,
    pub blob: Option<String>,
}

/// Transport types for MCP servers
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum McpTransport {
    #[serde(rename = "stdio")]
    Stdio {
        command: String,
        #[serde(default)]
        args: Vec<String>,
        #[serde(default)]
        env: HashMap<String, String>,
    },
    #[serde(rename = "sse")]
    Sse {
        url: String,
        #[serde(default)]
        headers: HashMap<String, String>,
    },
    #[serde(rename = "http")]
    Http {
        url: String,
        #[serde(default)]
        headers: HashMap<String, String>,
    },
}

/// Authentication types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum McpAuth {
    #[serde(rename = "none")]
    None,
    #[serde(rename = "api_key")]
    ApiKey { key: String, header: String },
    #[serde(rename = "bearer")]
    Bearer { token: String },
    #[serde(rename = "oauth")]
    OAuth {
        #[serde(rename = "clientId")]
        client_id: String,
        #[serde(rename = "clientSecret")]
        client_secret: Option<String>,
        #[serde(rename = "tokenUrl")]
        token_url: String,
    },
}

/// Request to add a new MCP server
#[derive(Debug, Clone, Deserialize)]
pub struct AddMcpServerRequest {
    pub workspace_id: String,
    pub name: String,
    pub description: Option<String>,
    pub transport: McpTransport,
    pub auth: Option<McpAuth>,
}

/// Request to update an MCP server
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateMcpServerRequest {
    pub server_id: String,
    pub name: Option<String>,
    pub description: Option<String>,
    pub enabled: Option<bool>,
    pub transport: Option<McpTransport>,
    pub auth: Option<McpAuth>,
}

/// MCP Server response DTO
#[derive(Debug, Clone, Serialize)]
pub struct McpServerDto {
    pub id: String,
    pub workspace_id: String,
    pub name: String,
    pub description: Option<String>,
    pub enabled: bool,
    pub transport_type: String,
    pub status: String,
    pub tools: Vec<McpTool>,
    pub error: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

/// Tool call request
#[derive(Debug, Clone, Deserialize)]
pub struct CallToolRequest {
    pub server_id: String,
    pub tool_name: String,
    pub arguments: serde_json::Value,
}

/// Resource read request
#[derive(Debug, Clone, Deserialize)]
pub struct ReadResourceRequest {
    pub server_id: String,
    pub uri: String,
}

/// Global MCP manager state (shared across Tauri)
pub struct McpManagerState {
    pub manager: Arc<RwLock<Option<McpConnectionManager>>>,
}

impl McpManagerState {
    pub fn new() -> Self {
        Self {
            manager: Arc::new(RwLock::new(None)),
        }
    }

    pub async fn initialize(&self, db_connection: rusqlite::Connection) -> Result<(), String> {
        let manager = McpConnectionManager::new(db_connection);
        manager.initialize().await.map_err(|e| e.to_string())?;
        
        let mut guard = self.manager.write().await;
        *guard = Some(manager);
        Ok(())
    }

    pub async fn get_manager(&self) -> Option<Arc<McpConnectionManager>> {
        let guard = self.manager.read().await;
        guard.as_ref().map(|m| Arc::new(m.clone()))
    }
}

impl Default for McpManagerState {
    fn default() -> Self {
        Self::new()
    }
}

// Make McpConnectionManager cloneable for Arc usage
impl Clone for McpConnectionManager {
    fn clone(&self) -> Self {
        // This is a simplified clone - in practice you might want to share the connections
        // For now, create a new manager with same db connection
        Self::new(rusqlite::Connection::open_in_memory().unwrap())
    }
}
