/**
 * MCP (Model Context Protocol) Types
 * 
 * TypeScript type definitions for MCP client
 */

// ============================================================================
// Transport Types
// ============================================================================

export type McpTransportType = 'stdio' | 'sse' | 'http' | 'websocket';

export interface McpStdioTransport {
  type: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface McpSseTransport {
  type: 'sse';
  url: string;
  headers?: Record<string, string>;
}

export interface McpHttpTransport {
  type: 'http';
  url: string;
  headers?: Record<string, string>;
}

export type McpTransport = McpStdioTransport | McpSseTransport | McpHttpTransport;

// ============================================================================
// Authentication Types
// ============================================================================

export type McpAuthType = 'none' | 'api_key' | 'bearer' | 'oauth';

export interface McpApiKeyAuth {
  type: 'api_key';
  key: string;
  header?: string;
}

export interface McpBearerAuth {
  type: 'bearer';
  token: string;
}

export interface McpOAuthAuth {
  type: 'oauth';
  clientId: string;
  clientSecret?: string;
  tokenUrl: string;
}

export type McpAuth = McpApiKeyAuth | McpBearerAuth | McpOAuthAuth;

// ============================================================================
// Server Configuration
// ============================================================================

export interface McpServerConfig {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  enabled: boolean;
  transportType: McpTransportType;
  transport: McpTransport;
  auth?: McpAuth;
  createdAt: number;
  updatedAt: number;
}

export interface McpServerRuntime {
  serverId: string;
  status: McpConnectionStatus;
  tools?: McpTool[];
  resources?: McpResource[];
  lastError?: string;
  connectedAt?: number;
  disconnectedAt?: number;
  updatedAt: number;
}

export type McpConnectionStatus = 
  | 'connected' 
  | 'connecting' 
  | 'failed' 
  | 'needs_auth' 
  | 'disabled';

// ============================================================================
// MCP Protocol Types
// ============================================================================

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpResource {
  uri: string;
  name: string;
  mimeType?: string;
  description?: string;
}

export interface McpServerCapabilities {
  tools?: Record<string, unknown>;
  resources?: Record<string, unknown>;
  prompts?: Record<string, unknown>;
}

export interface McpServerInfo {
  name: string;
  version: string;
}

// ============================================================================
// Tool Execution
// ============================================================================

export interface McpToolCallRequest {
  serverId: string;
  toolName: string;
  arguments: Record<string, unknown>;
}

export interface McpToolCallResult {
  content: McpToolContent[];
  isError?: boolean;
}

export type McpToolContent = 
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string }
  | { type: 'resource'; resource: McpEmbeddedResource };

export interface McpEmbeddedResource {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}

// ============================================================================
// Resource Reading
// ============================================================================

export interface McpResourceReadRequest {
  serverId: string;
  uri: string;
}

export interface McpResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}

// ============================================================================
// Tool Call History
// ============================================================================

export interface McpToolCallHistory {
  id: number;
  serverId: string;
  toolName: string;
  arguments?: Record<string, unknown>;
  result?: Record<string, unknown>;
  errorMessage?: string;
  durationMs?: number;
  createdAt: number;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface AddMcpServerRequest {
  workspaceId: string;
  name: string;
  description?: string;
  transport: McpTransport;
  auth?: McpAuth;
}

export interface UpdateMcpServerRequest {
  serverId: string;
  name?: string;
  description?: string;
  enabled?: boolean;
  transport?: McpTransport;
  auth?: McpAuth;
}

export interface McpServerDto {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  enabled: boolean;
  transportType: McpTransportType;
  status: McpConnectionStatus;
  tools: McpTool[];
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface TestConnectionRequest {
  transport: McpTransport;
  auth?: McpAuth;
}

export interface TestConnectionResult {
  success: boolean;
  message: string;
  transportType: string;
  serverInfo?: McpServerInfo;
  capabilities?: McpServerCapabilities;
  tools?: McpTool[];
}

// ============================================================================
// Internal MCP (Workspace Standards)
// ============================================================================

export interface WorkspaceStandard {
  version: string;
  generatedAt: string;
  techStack: TechStackInfo;
  sections: StandardSection[];
}

export interface TechStackInfo {
  framework?: string;
  language: string;
  styling?: string;
  stateManagement?: string;
  database?: string;
  testing?: string[];
}

export interface StandardSection {
  title: string;
  description?: string;
  rules: StandardRule[];
}

export interface StandardRule {
  title: string;
  description: string;
  examples?: string[];
}

export interface GenerateStandardsRequest {
  workspaceId: string;
  includeWorkflow?: boolean;
}

// ============================================================================
// Unified Tool System (Internal + External)
// ============================================================================

export type ToolSource = 'internal' | 'external';

export interface UnifiedTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  source: ToolSource;
  serverId?: string;
}

export interface InternalTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
  category?: 'skill' | 'task' | 'project' | 'utility' | 'hooks' | 'standards' | 'tech' | 'skills' | 'utils' | 'file' | 'bash';
  source?: 'internal';
  workspaceId?: string;
}

export interface ToolExecutionResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface ToolRegistryState {
  internalTools: Map<string, InternalTool>;
  externalTools: McpTool[];
  isLoading: boolean;
  error: string | null;
}
