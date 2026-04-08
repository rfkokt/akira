# 🎯 MCP (Model Context Protocol) Implementation TODO - Project Akira

> **Goal**: Implement dual MCP system for Akira
> - **External MCP**: Connect to official MCP servers (filesystem, git, postgres, etc)
> - **Internal MCP**: Convert Akira systems (skills, tasks, context) to MCP pattern
> 
> **Impact**: Modular architecture, token efficiency, extensibility

---

## 📊 Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Akira Core                              │
│                                                             │
│  ┌──────────────┐         ┌──────────────────────────┐     │
│  │ Internal MCP │         │    External MCP Client   │     │
│  │ (Simplified) │         │   (Official Protocol)    │     │
│  ├──────────────┤         ├──────────────────────────┤     │
│  │ • SkillServer│         │ • MCP SDK Client         │     │
│  │ • TaskServer │         │ • Transport (stdio/SSE)  │     │
│  │ • ProjectSvr │         │ • Auth (OAuth/API Key)   │     │
│  └──────┬───────┘         └───────────┬──────────────┘     │
│         │                             │                    │
│         └──────────┬──────────────────┘                    │
│                    │                                        │
│              ┌─────▼──────┐                                │
│              │ Tool Router │                                │
│              │  (Unified)  │                                │
│              └─────┬──────┘                                │
│                    │                                        │
│                    ▼                                        │
│           ┌─────────────────┐                              │
│           │   AI Provider   │                              │
│           │ (Claude/Gemini) │                              │
│           └─────────────────┘                              │
└─────────────────────────────────────────────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         │                    │                    │
         ▼                    ▼                    ▼
   ┌──────────┐      ┌──────────────┐     ┌──────────────┐
   │ Internal │      │   External   │     │   External   │
   │  Tools   │      │  MCP Server  │     │  MCP Server  │
   └──────────┘      │  (filesystem)│     │    (git)     │
                     └──────────────┘     └──────────────┘
```

---

## 🔴 Phase 1: External MCP Infrastructure

### P1.1 Database Schema

**Status**: ⏳ Pending  
**Priority**: HIGH  
**Estimated**: 2 days

**Files**:
- `src-tauri/src/db/migrations/xxx_add_mcp_servers.sql`
- `src-tauri/src/db/queries/mcp.rs`
- `src-tauri/src/db/mod.rs` (update)

**Schema**:
```rust
pub struct McpServerConfig {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub enabled: bool,
    pub transport_type: String,  // "stdio", "sse", "http"
    pub config_json: String,     // serialized transport config
    pub auth_type: Option<String>, // "oauth", "api_key", "none"
    pub auth_config: Option<String>, // encrypted auth data
    pub created_at: i64,
    pub updated_at: i64,
}

pub struct McpServerRuntime {
    pub server_id: String,
    pub status: String,  // "connected", "failed", "needs_auth", "disabled"
    pub tools_json: Option<String>,  // cached tools from server
    pub last_error: Option<String>,
    pub connected_at: Option<i64>,
}
```

**Tasks**:
- [ ] Create migration for `mcp_servers` table
- [ ] Create migration for `mcp_runtime` table (runtime state)
- [ ] Add queries: create, update, delete, list, get by id
- [ ] Add commands untuk CRUD operations
- [ ] Implement encryption untuk auth credentials

---

### P1.2 Backend MCP Server Manager (Rust)

**Status**: ⏳ Pending  
**Priority**: HIGH  
**Estimated**: 4 days

**Files**:
- `src-tauri/src/mcp/mod.rs`
- `src-tauri/src/mcp/server_manager.rs`
- `src-tauri/src/mcp/transport.rs`
- `src-tauri/src/mcp/process_handler.rs`

**Implementation**:
```rust
// src-tauri/src/mcp/server_manager.rs
pub struct McpServerManager {
    processes: HashMap<String, Child>,
    connections: HashMap<String, McpConnection>,
}

impl McpServerManager {
    /// Spawn MCP server process (stdio transport)
    pub async fn spawn_stdio_server(
        &self, 
        config: &McpStdioConfig
    ) -> Result<McpConnection> {
        // Spawn process dengan command & args
        // Setup stdin/stdout pipes
        // Initialize MCP protocol handshake
        // Return connection handle
    }
    
    /// Connect ke SSE server
    pub async fn connect_sse_server(
        &self,
        config: &McpSseConfig
    ) -> Result<McpConnection> {
        // HTTP SSE connection
        // Handle auth headers
        // Setup event stream
    }
    
    /// Kill server process
    pub async fn stop_server(&self, server_id: &str) -> Result<()> {
        // Cleanup process
        // Close connections
    }
    
    /// Get server capabilities & tools
    pub async fn discover_tools(
        &self, 
        server_id: &str
    ) -> Result<Vec<McpTool>> {
        // Call tools/list via MCP protocol
        // Cache results
    }
    
    /// Execute tool call
    pub async fn call_tool(
        &self,
        server_id: &str,
        tool_name: &str,
        arguments: Value
    ) -> Result<McpToolResult> {
        // Call tools/call via MCP protocol
        // Return result
    }
}
```

**Tasks**:
- [ ] Implement stdio transport (spawn process, stdin/stdout pipes)
- [ ] Implement SSE transport (HTTP event stream)
- [ ] Implement MCP protocol handshake (initialize)
- [ ] Implement tools/list method
- [ ] Implement tools/call method
- [ ] Implement connection lifecycle (connect, reconnect, disconnect)
- [ ] Error handling & logging
- [ ] Process cleanup on app exit

---

### P1.3 Frontend MCP Client

**Status**: ⏳ Pending  
**Priority**: HIGH  
**Estimated**: 3 days

**Files**:
- `src/lib/mcp/types.ts`
- `src/lib/mcp/external/client.ts`
- `src/lib/mcp/external/transportFactory.ts`
- `src/lib/mcp/external/authHandler.ts`

**Implementation**:
```typescript
// src/lib/mcp/types.ts
export interface McpServerConfig {
  id: string;
  name: string;
  enabled: boolean;
  transport: 'stdio' | 'sse' | 'http';
  config: McpStdioConfig | McpSseConfig | McpHttpConfig;
  auth?: McpAuthConfig;
}

export interface McpConnection {
  serverId: string;
  status: 'connected' | 'failed' | 'needs_auth' | 'disabled' | 'connecting';
  tools: McpTool[];
  error?: string;
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  serverId: string;  // Namespace: mcp_[server]_[tool]
}

// src/lib/mcp/external/client.ts
export class ExternalMcpClient {
  private connections: Map<string, McpConnection> = new Map();
  
  async connectServer(config: McpServerConfig): Promise<McpConnection> {
    // Via Tauri command: mcp_connect_server
    // Setup transport
    // Initialize MCP protocol
    // Discover tools
    // Return connection
  }
  
  async disconnectServer(serverId: string): Promise<void> {
    // Cleanup connection
    // Stop process (if stdio)
  }
  
  async callTool(
    serverId: string, 
    toolName: string, 
    args: any
  ): Promise<McpToolResult> {
    // Via Tauri command: mcp_call_tool
    // Execute tool on server
    // Return result
  }
  
  getAllTools(): McpTool[] {
    // Aggregate tools dari semua connected servers
    // Namespace: mcp_[servername]_[toolname]
    return Array.from(this.connections.values())
      .filter(c => c.status === 'connected')
      .flatMap(c => c.tools.map(t => ({
        ...t,
        name: `mcp_${c.serverId}_${t.name}`,
        serverId: c.serverId
      })));
  }
}
```

**Tasks**:
- [ ] Define all MCP types
- [ ] Implement connection management
- [ ] Implement tool discovery & caching
- [ ] Implement tool execution
- [ ] Handle authentication flows (OAuth, API key)
- [ ] Connection health monitoring
- [ ] Auto-reconnect logic

---

### P1.4 Settings UI for MCP Servers

**Status**: ⏳ Pending  
**Priority**: MEDIUM  
**Estimated**: 3 days

**Files**:
- `src/components/Settings/McpSettings.tsx`
- `src/components/Settings/McpServerForm.tsx`
- `src/components/Settings/McpServerList.tsx`
- `src/components/Settings/McpToolViewer.tsx`

**UI Components**:
```typescript
// src/components/Settings/McpSettings.tsx
export function McpSettings() {
  return (
    <div className="space-y-6">
      <McpHeader />
      <McpAddServerForm />
      <McpServerList />
      <McpMarketplaceSection />  // Optional: browse popular servers
    </div>
  );
}

// Features:
// - Add server (stdio/SSE/HTTP tabs)
// - List connected servers dengan status indicator
// - Test connection button
// - View available tools per server
// - Enable/disable toggle
// - Delete server
// - OAuth authentication flow
```

**Tasks**:
- [ ] Create main MCP settings page
- [ ] Create add server form (tabs untuk stdio/SSE/HTTP)
- [ ] Create server list dengan status badges
- [ ] Create tool viewer (expandable list)
- [ ] Implement test connection functionality
- [ ] Implement OAuth flow UI
- [ ] Add confirmation dialogs untuk delete
- [ ] Toast notifications untuk success/error

---

### P1.5 MCP Store (State Management)

**Status**: ⏳ Pending  
**Priority**: MEDIUM  
**Estimated**: 2 days

**Files**:
- `src/store/mcpStore.ts`

**Implementation**:
```typescript
// src/store/mcpStore.ts
interface McpState {
  // Configs (persisted)
  servers: McpServerConfig[];
  
  // Runtime state (memory only)
  connections: Map<string, McpConnection>;
  isConnecting: boolean;
  
  // Actions
  loadServers: () => Promise<void>;
  addServer: (config: McpServerConfig) => Promise<void>;
  updateServer: (id: string, config: Partial<McpServerConfig>) => Promise<void>;
  deleteServer: (id: string) => Promise<void>;
  
  connectServer: (id: string) => Promise<void>;
  disconnectServer: (id: string) => Promise<void>;
  
  getAllTools: () => McpTool[];
  callTool: (serverId: string, toolName: string, args: any) => Promise<any>;
  
  // Computed
  connectedServers: McpConnection[];
  totalTools: number;
}
```

**Tasks**:
- [ ] Setup Zustand store
- [ ] Implement CRUD actions untuk configs
- [ ] Implement connection management
- [ ] Implement tool aggregation
- [ ] Persist configs ke database via Tauri
- [ ] Reactive UI updates saat connection status change

---

## 🟡 Phase 2: Unified Tool System

### P2.1 Tool Registry (Unified Internal + External)

**Status**: ⏳ Pending  
**Priority**: HIGH  
**Estimated**: 2 days

**Files**:
- `src/lib/mcp/registry.ts`
- `src/lib/mcp/router.ts`

**Implementation**:
```typescript
// src/lib/mcp/registry.ts
export class ToolRegistry {
  private internalTools: Map<string, InternalTool> = new Map();
  private externalClient: ExternalMcpClient;
  
  // Register internal tool (simplified MCP)
  registerInternalTool(tool: InternalTool): void {
    this.internalTools.set(tool.name, tool);
  }
  
  // Get all tools (internal + external)
  getAllTools(): UnifiedTool[] {
    const internal = Array.from(this.internalTools.values()).map(t => ({
      name: `internal_${t.name}`,
      description: t.description,
      parameters: t.parameters,
      source: 'internal' as const,
    }));
    
    const external = this.externalClient.getAllTools().map(t => ({
      name: t.name,  // Already namespaced: mcp_server_tool
      description: t.description,
      parameters: t.inputSchema,
      source: 'external' as const,
      serverId: t.serverId,
    }));
    
    return [...internal, ...external];
  }
  
  // Execute tool by name
  async executeTool(name: string, args: any): Promise<any> {
    if (name.startsWith('internal_')) {
      const tool = this.internalTools.get(name.replace('internal_', ''));
      return await tool.handler(args);
    } else if (name.startsWith('mcp_')) {
      const parts = name.split('_');
      const serverId = parts[1];
      const toolName = parts.slice(2).join('_');
      return await this.externalClient.callTool(serverId, toolName, args);
    }
    throw new Error(`Unknown tool: ${name}`);
  }
}
```

**Tasks**:
- [ ] Create unified tool interface
- [ ] Implement tool registration (internal)
- [ ] Implement tool aggregation (internal + external)
- [ ] Implement tool routing (execute ke handler yang tepat)
- [ ] Add namespacing untuk avoid conflicts

---

### P2.2 AI Provider Integration dengan Tools

**Status**: ⏳ Pending  
**Priority**: HIGH  
**Estimated**: 3 days

**Files**:
- `src/lib/providers.ts` (update)
- `src/lib/mcp/aiIntegration.ts`

**Implementation**:
```typescript
// src/lib/mcp/aiIntegration.ts
export async function sendMessageWithTools(
  message: string,
  options: {
    enableInternalTools?: boolean;
    enableExternalTools?: boolean;
    specificTools?: string[];  // Filter specific tools
  }
): Promise<string> {
  // 1. Get available tools dari registry
  const registry = useToolRegistry();
  const tools = registry.getAllTools();
  
  // 2. Filter berdasarkan options
  const filteredTools = filterTools(tools, options);
  
  // 3. Send ke AI dengan tools
  const response = await aiProvider.complete({
    prompt: message,
    tools: filteredTools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    })),
  });
  
  // 4. Handle tool calls dari AI
  if (response.toolCalls && response.toolCalls.length > 0) {
    const results = await Promise.all(
      response.toolCalls.map(async call => {
        const result = await registry.executeTool(call.name, call.arguments);
        return { call, result };
      })
    );
    
    // 5. Send results back to AI untuk final response
    const finalResponse = await aiProvider.complete({
      prompt: message,
      toolResults: results,
    });
    
    return finalResponse.content;
  }
  
  return response.content;
}
```

**Tasks**:
- [ ] Update AI providers untuk support tool calling
- [ ] Implement tool call detection dari AI response
- [ ] Implement tool execution & result handling
- [ ] Handle multiple tool calls dalam satu response
- [ ] Handle tool call errors gracefully
- [ ] Update chat UI untuk show tool usage

---

## 🟢 Phase 3: Internal MCP (Simplified)

### P3.1 Skill to MCP Server Adapter

**Status**: ⏳ Pending  
**Priority**: MEDIUM  
**Estimated**: 3 days

**Files**:
- `src/lib/mcp-internal/skillAdapter.ts`
- `src/lib/mcp-internal/skillServer.ts`

**Implementation**:
```typescript
// src/lib/mcp-internal/skillAdapter.ts
export class SkillMcpAdapter {
  /**
   * Convert existing skill content menjadi MCP tools
   */
  static parseSkillToTools(skillId: string, content: string): InternalTool[] {
    const tools: InternalTool[] = [];
    
    // Parse patterns dari skill markdown
    const patterns = this.extractPatterns(content);
    if (patterns.length > 0) {
      tools.push({
        name: `skill_${skillId}_get_patterns`,
        description: `Get ${skillId} patterns and best practices`,
        parameters: z.object({
          category: z.string().optional(),
        }),
        handler: async ({ category }) => {
          return {
            patterns: category 
              ? patterns.filter(p => p.name.includes(category))
              : patterns.slice(0, 5),
          };
        },
      });
    }
    
    // Parse examples
    const examples = this.extractExamples(content);
    if (examples.length > 0) {
      tools.push({
        name: `skill_${skillId}_get_examples`,
        description: `Get ${skillId} code examples`,
        parameters: z.object({
          keyword: z.string().optional(),
        }),
        handler: async ({ keyword }) => {
          return {
            examples: keyword
              ? examples.filter(e => e.title.includes(keyword))
              : examples.slice(0, 3),
          };
        },
      });
    }
    
    // Add validation tool
    tools.push({
      name: `skill_${skillId}_validate`,
      description: `Validate code against ${skillId} best practices`,
      parameters: z.object({
        code: z.string(),
        context: z.string().optional(),
      }),
      handler: async ({ code }) => {
        return {
          patterns: patterns.slice(0, 3),
          suggestions: patterns.map(p => p.description),
        };
      },
    });
    
    return tools;
  }
}

// src/lib/mcp-internal/skillServer.ts
export class SkillMCPServer {
  private tools: Map<string, InternalTool> = new Map();
  
  loadSkill(skillId: string, content: string): void {
    const tools = SkillMcpAdapter.parseSkillToTools(skillId, content);
    for (const tool of tools) {
      this.tools.set(tool.name, tool);
    }
  }
  
  getTools(): InternalTool[] {
    return Array.from(this.tools.values());
  }
  
  async execute(toolName: string, args: any): Promise<any> {
    const tool = this.tools.get(toolName);
    if (!tool) throw new Error(`Tool ${toolName} not found`);
    return await tool.handler(args);
  }
}
```

**Tasks**:
- [ ] Create skill parser (extract patterns, examples, checklists)
- [ ] Convert skill content menjadi MCP tools
- [ ] Register tools ke internal registry
- [ ] Implement tool handlers untuk tiap skill
- [ ] Lazy loading (parse on-demand, cache results)

---

### P3.2 Task Management MCP Server

**Status**: ⏳ Pending  
**Priority**: MEDIUM  
**Estimated**: 2 days

**Files**:
- `src/lib/mcp-internal/taskServer.ts`

**Implementation**:
```typescript
// src/lib/mcp-internal/taskServer.ts
export class TaskMCPServer {
  getTools(): InternalTool[] {
    return [
      {
        name: 'task_extract_from_summary',
        description: 'Extract tasks from conversation summary',
        parameters: z.object({
          summary: z.string(),
          workspaceId: z.string(),
        }),
        handler: async ({ summary, workspaceId }) => {
          // Parse summary jadi structured tasks
          const tasks = await this.extractTasks(summary, workspaceId);
          return { tasks };
        },
      },
      
      {
        name: 'task_analyze_complexity',
        description: 'Analyze task complexity and suggest breakdown',
        parameters: z.object({
          taskTitle: z.string(),
          taskDescription: z.string(),
          relatedFiles: z.array(z.string()).optional(),
        }),
        handler: async (params) => {
          // Analyze complexity
          return {
            complexity: 'moderate',
            estimatedHours: 4,
            suggestedBreakdown: [...],
          };
        },
      },
      
      {
        name: 'task_create_to_board',
        description: 'Create tasks to kanban board',
        parameters: z.object({
          tasks: z.array(z.object({
            title: z.string(),
            description: z.string(),
            priority: z.enum(['low', 'medium', 'high']),
            column: z.enum(['backlog', 'todo', 'in-progress', 'review']).default('todo'),
          })),
          workspaceId: z.string(),
        }),
        handler: async ({ tasks, workspaceId }) => {
          // Create tasks via taskStore
          const created = await Promise.all(
            tasks.map(t => taskStore.createTask(workspaceId, t))
          );
          return { createdCount: created.length, tasks: created };
        },
      },
      
      {
        name: 'task_check_duplicates',
        description: 'Check for duplicate tasks before creating',
        parameters: z.object({
          proposedTasks: z.array(z.object({
            title: z.string(),
            description: z.string(),
          })),
          workspaceId: z.string(),
        }),
        handler: async ({ proposedTasks, workspaceId }) => {
          // Check existing tasks
          const existing = await taskStore.getTasksByWorkspace(workspaceId);
          // Return similarity analysis
        },
      },
    ];
  }
}
```

**Tasks**:
- [ ] Implement task extraction dari summary
- [ ] Implement complexity analyzer
- [ ] Implement task creation ke board
- [ ] Implement duplicate checker
- [ ] Integrasi dengan existing taskStore

---

### P3.3 Project Context MCP Server

**Status**: ⏳ Pending  
**Priority**: MEDIUM  
**Estimated**: 2 days

**Files**:
- `src/lib/mcp-internal/projectServer.ts`

**Tools**:
- `project_get_rules` - Get project rules/config
- `project_get_structure` - Get file structure
- `project_read_file` - Read specific file
- `project_search_code` - Search code dengan ripgrep
- `project_get_git_history` - Get recent commits
- `project_get_endpoints` - List API endpoints (auto-scan)

---

## 🔵 Phase 4: Integration & Polish

### P4.1 Chat Integration

**Status**: ⏳ Pending  
**Priority**: MEDIUM  
**Estimated**: 2 days

**Files**:
- `src/store/aiChatStore.ts` (update)
- `src/components/Chat/ToolCallIndicator.tsx` (new)

**Features**:
- [ ] Show tool calls dalam chat UI
- [ ] Loading state saat tool executing
- [ ] Show tool results (collapsed/expandable)
- [ ] Tool usage stats per message

### P4.2 Testing & Documentation

**Status**: ⏳ Pending  
**Priority**: LOW  
**Estimated**: 3 days

**Tasks**:
- [ ] Unit tests untuk MCP client
- [ ] Integration tests untuk tool execution
- [ ] End-to-end tests (add server → connect → use tool)
- [ ] Documentation: How to add MCP server
- [ ] Documentation: How to create internal tool
- [ ] Example MCP server configs untuk popular servers

---

## 📋 Progress Tracker

| Phase | Task | Status | Estimated | Actual |
|-------|------|--------|-----------|--------|
| **P1** | P1.1 Database Schema | ⏳ | 2 days | - |
| **P1** | P1.2 Backend Server Manager | ⏳ | 4 days | - |
| **P1** | P1.3 Frontend MCP Client | ⏳ | 3 days | - |
| **P1** | P1.4 Settings UI | ⏳ | 3 days | - |
| **P1** | P1.5 MCP Store | ⏳ | 2 days | - |
| **P2** | P2.1 Tool Registry | ⏳ | 2 days | - |
| **P2** | P2.2 AI Integration | ⏳ | 3 days | - |
| **P3** | P3.1 Skill Adapter | ⏳ | 3 days | - |
| **P3** | P3.2 Task Server | ⏳ | 2 days | - |
| **P3** | P3.3 Project Server | ⏳ | 2 days | - |
| **P4** | P4.1 Chat Integration | ⏳ | 2 days | - |
| **P4** | P4.2 Testing & Docs | ⏳ | 3 days | - |

**Total Estimated**: ~31 days  
**Status**: 0/12 tasks complete (0%)

---

## 🎯 Example Usage (Target)

### User tambah MCP Server
```
Settings → MCP Servers → Add Server
Name: filesystem
Transport: stdio
Command: npx -y @modelcontextprotocol/server-filesystem /project/path
[Test Connection] → ✅ Connected (5 tools available)
```

### AI menggunakan External Tool
```
User: "List files di folder components"
AI: ▶️ Calling tool: mcp_filesystem_list_directory
     Args: { "path": "/project/path/components" }
     Result: ["Button.tsx", "Card.tsx", "Modal.tsx"]
AI: Folder components berisi 3 file:
    - Button.tsx
    - Card.tsx  
    - Modal.tsx
```

### AI menggunakan Internal Tool
```
User: "Summary task dari diskusi tadi"
AI: ▶️ Calling tool: internal_task_extract_from_summary
     Args: { "summary": "Implement login page..." }
     Result: { "tasks": [...] }
AI: ▶️ Calling tool: internal_task_create_to_board
     Args: { "tasks": [...] }
     Result: { "createdCount": 3 }
AI: ✅ Created 3 tasks to board:
    - [HIGH] Implement login page
    - [MEDIUM] Create auth API
    - [LOW] Add tests
```

---

**Last Updated**: 2026-04-08  
**Author**: AI Assistant  
**Status**: 🚀 **READY TO START** | 0% Complete
