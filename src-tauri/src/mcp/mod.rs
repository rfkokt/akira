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
#[serde(rename_all = "camelCase")]
pub struct AddMcpServerRequest {
    pub workspace_id: String,
    pub name: String,
    pub description: Option<String>,
    pub transport: McpTransport,
    pub auth: Option<McpAuth>,
}

/// Request to update an MCP server
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
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
#[serde(rename_all = "camelCase")]
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
#[serde(rename_all = "camelCase")]
pub struct CallToolRequest {
    pub server_id: String,
    pub tool_name: String,
    pub arguments: serde_json::Value,
}

/// Resource read request
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadResourceRequest {
    pub server_id: String,
    pub uri: String,
}

