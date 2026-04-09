# Stdio MCP Server Support for Akira

## Background

Akira currently supports connecting to **remote** MCP servers (HTTP/SSE) via the frontend `externalClient.ts`. However, the majority of MCP servers in the official registry are **stdio-based** — they run as local child processes (e.g. `npx @upstash/context7-mcp`), communicating via stdin/stdout JSON-RPC.

The Rust backend already has stub types (`StdioTransport`, `McpClient`, `McpConnectionManager`) but they are all "simplified" placeholders that don't actually spawn processes or speak the MCP protocol. The PTY manager (`pty_manager.rs`) proves Akira can already spawn child processes on macOS/Linux.

This plan implements real stdio MCP server support end-to-end: Rust backend spawns & manages child processes, speaks JSON-RPC over stdin/stdout, and exposes tools to the frontend.

---

## Current State

### What Works ✅
- **Remote MCP** (HTTP/SSE) — fully functional via `externalClient.ts` + `externalManager.ts`
- **MCP Registry UI** — dynamic catalog from `registry.modelcontextprotocol.io/v0.1/servers` with live search
- **Tool injection** — `injectToolsIntoPrompt()` already injects all registered tools into AI prompts
- **DB persistence** — `mcp_add_server` saves per-workspace, schema supports stdio transport type
- **Process spawning** — `pty_manager.rs` proves Tauri can spawn child processes on macOS/Linux

### What's Stub/Broken ❌
- `StdioTransport` — `connect()` just sets `self.connected = true`, no process spawned
- `McpClient` — `initialize()` returns mock data, `list_tools()` returns empty, `call_tool()` returns error
- `McpConnectionManager` — all methods are no-ops
- `commands.rs` — `mcp_connect_server` creates transport then immediately marks as "failed"
- `McpConnectionManager::clone()` — creates a new empty manager (broken)

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Frontend (TypeScript)                                    │
│                                                           │
│  McpSettings.tsx ──► mcpStore.ts ──► Tauri invoke          │
│       "Install Context7"     connectServer(id)            │
│                                      │                    │
│  Registry Catalog                    │                    │
│  (shows stdio servers               ▼                    │
│   with install hint)         ┌──────────────┐            │
│                              │ Tauri IPC    │            │
└──────────────────────────────┤              ├────────────┘
                               └──────┬───────┘
                                      │
┌──────────────────────────────────────▼───────────────────┐
│  Rust Backend (src-tauri/src/mcp/)                        │
│                                                           │
│  commands.rs ──► manager.rs ──► client.rs ──► transport.rs│
│  (Tauri cmds)   (lifecycle)    (JSON-RPC)    (stdin/out)  │
│                                                           │
│  transport.rs spawns:                                     │
│    npx @upstash/context7-mcp                              │
│    uvx some-python-server                                 │
│  Communicates via stdin/stdout JSON-RPC 2.0               │
└──────────────────────────────────────────────────────────┘
```

### AI Tool Pipeline (Already Working)

```
MCP Connected ──► externalManager.registerExternalTools()
                  ↓ registers with category='external'
              ──► useToolRegistry (Zustand store)
                  ↓ getAllInternalTools()
              ──► injectToolsIntoPrompt()
                  ↓ injected into system prompt
              ──► AI sees: [AVAILABLE TOOLS]
                  EXTERNAL:
                    ext:context7:resolve-library-id(libraryName) - Resolve a library ID
                    ext:context7:get-docs(libraryId, query) - Get library docs
                  [/AVAILABLE TOOLS]
```

Called from:
- `aiChatStore.ts` (lines 233, 930) — powers TaskChatBox
- `TaskCreatorChat.tsx` (line 659) — powers task creator chat

---

## Proposed Changes

### Phase 1: Rust — Real Stdio Transport

**File:** `src-tauri/src/mcp/transport.rs`

Replace the stub `StdioTransport` with a real implementation:

- **Spawn child process** using `tokio::process::Command` with piped stdin/stdout/stderr
- **Line-buffered reader** on stdout — JSON-RPC messages are newline-delimited
- **Write to stdin** — serialize JSON-RPC requests, flush, newline-terminate
- **Reader task** — `tokio::spawn` a background task that reads stdout lines and routes responses to pending request channels (`tokio::sync::oneshot`)
- **Pending requests map** — `Arc<Mutex<HashMap<u64, oneshot::Sender<JsonRpcMessage>>>>` matching `id` → response
- **Process cleanup** — on disconnect, kill child process, join reader task
- **Environment variables** — pass `env` HashMap + inherit current env (important for `PATH` to find `npx`/`node`)
- **Stderr capture** — collect stderr in a buffer for error reporting

Key struct shape:
```rust
pub struct StdioTransport {
    command: String,
    args: Vec<String>,
    env: HashMap<String, String>,
    // Runtime state (None until connect())
    child: Option<tokio::process::Child>,
    stdin: Option<tokio::process::ChildStdin>,
    pending: Arc<Mutex<HashMap<u64, oneshot::Sender<JsonRpcMessage>>>>,
    reader_handle: Option<tokio::task::JoinHandle<()>>,
    connected: bool,
}
```

**Estimated effort:** ~200 lines of Rust

---

### Phase 2: Rust — Real MCP Client

**File:** `src-tauri/src/mcp/client.rs`

Replace stub methods with real JSON-RPC calls:

- **`initialize()`** — send `initialize` request with `protocolVersion: "2024-11-05"`, `clientInfo`, `capabilities`; then send `notifications/initialized`
- **`list_tools()`** — send `tools/list` request, parse `{ tools: [...] }` response
- **`call_tool(name, args)`** — send `tools/call` request with `{ name, arguments }`, return `ToolCallResult`
- **`list_resources()`** — send `resources/list`, parse response
- **`read_resource(uri)`** — send `resources/read`, parse response
- **`disconnect()`** — disconnect transport, kill child

Each method uses `transport.send_request()` which returns a `JsonRpcMessage` response.

**Estimated effort:** ~150 lines of Rust changes

---

### Phase 3: Rust — Real Connection Manager

**File:** `src-tauri/src/mcp/manager.rs`

Replace stub methods:

- **`connect_server(server_id)`** — load config from DB, create transport, create client, call `initialize()` + `list_tools()`, store tools in DB runtime state, update status to "connected"
- **`disconnect_server(server_id)`** — call `client.disconnect()`, update status to "disabled"
- **`call_tool(server_id, tool_name, args)`** — look up live client, call `client.call_tool()`, record call in DB
- **`read_resource(server_id, uri)`** — look up live client, call `client.read_resource()`

Store live connections in the `connections` HashMap:
```rust
struct ManagedConnection {
    config: McpServerConfig,
    client: McpClient,
    state: ConnectionState,
}
```

**Estimated effort:** ~200 lines of Rust changes

---

### Phase 4: Rust — Wire Commands to Manager

**File:** `src-tauri/src/mcp/commands.rs`

- **`mcp_connect_server`** — use `McpConnectionManager` instead of stub; return discovered tools
- **`mcp_call_tool`** — use `McpConnectionManager::call_tool()` instead of returning error
- **`mcp_disconnect_server`** — use `McpConnectionManager::disconnect_server()`

**File:** `src-tauri/src/mcp/mod.rs`

- Fix `McpConnectionManager::clone()` — current impl creates a new empty manager (broken). Change to shared `Arc` pattern so commands can access the singleton manager.

**Estimated effort:** ~100 lines of Rust changes

---

### Phase 5: Frontend — Enable Stdio Install Flow

**File:** `src/components/Settings/McpSettings.tsx`

- **Stdio server rows**: change "Local only" to clickable **"Install →"** button
- **Install dialog**: show package identifier, required env vars from registry metadata, let user fill API keys
- **On submit**: call `mcp_add_server` Tauri command with `transport: { type: "stdio", command: "npx", args: [package_identifier], env: {CONTEXT7_API_KEY: "..."} }`, then `mcp_connect_server`

**File:** `src/store/mcpStore.ts`

- **`connectServer`** — for stdio servers, use Tauri IPC directly instead of frontend `externalManager` (which is for HTTP/SSE only)
- Tools returned from connect get registered into the tool registry

**File:** `src/lib/mcp/externalClient.ts`

- Remove dead `MCP_PRESETS` constant (hardcoded Context7/Brave presets no longer needed)

**Estimated effort:** ~150 lines of TypeScript changes

---

### Phase 6: AI Integration — Making the AI Aware of MCP Tools

#### Auto-connect MCP servers on workspace load

**File:** `src/store/mcpStore.ts`

- When `loadServers(workspaceId)` runs (triggered on workspace change), auto-connect all `enabled` servers saved in DB
- This ensures MCP tools are available as soon as the user opens a workspace — no need to manually reconnect each time

#### Better context for the AI

**File:** `src/lib/mcp/injectTools.ts`

- In `buildCompactToolPrompt()`, add a note for `external` category tools:
  ```
  EXTERNAL (live MCP connections — use when user asks about docs, search, etc.):
    ext:context7:resolve-library-id(libraryName) - Resolve a library ID
    ext:context7:get-docs(libraryId, query) - Get library docs
  ```
- Add a usage hint to help the AI know when to reach for these tools

#### Workspace-level MCP config persistence

**File:** `src-tauri/src/mcp/commands.rs` — **No changes needed**

- `mcp_add_server` already saves to DB per-workspace (uses `workspace_id`)
- `mcp_list_servers` already filters by workspace
- DB schema already supports workspace-scoped MCP configs

#### TaskChatBox verification

**File:** `src/components/Chat/TaskChatBox.tsx` — **No changes needed**

- TaskChatBox uses `aiChatStore.sendTaskChat()` which already calls `injectToolsIntoPrompt()`
- Verify `processToolCallsFromResponse()` correctly handles `ext:` prefixed tool names

**Estimated effort:** ~80 lines of TypeScript changes

---

## Dependencies

No new Cargo dependencies needed:

| Dependency | Already In Cargo.toml | Used For |
|---|---|---|
| `tokio` (full) | ✅ | `process::Command`, `spawn`, channels |
| `serde_json` | ✅ | JSON-RPC serialization |
| `async-trait` | ✅ | Transport trait |
| `thiserror` | ✅ | Error types |

---

## Open Questions

### PATH Resolution for npx/uvx

When spawning `npx @upstash/context7-mcp`, Tauri apps don't inherit the user's shell PATH by default. Options:

1. Use existing shell plugin to resolve PATH
2. Let user configure node path in settings  
3. **Auto-detect via `which npx` at startup** ← Recommended

Recommendation: Option 3 — run `which npx` and `which uvx` at Tauri startup, cache the resolved absolute paths. Fall back to bare command name if `which` fails.

### Python uvx servers

Same PATH issue applies. Need to resolve `uvx` path too.

---

## Verification Plan

### Build Checks
1. `cargo build` — Rust compiles
2. `npx tsc --noEmit` — TypeScript compiles

### Functional Tests
1. Search "context7" in MCP Settings → click Install → paste API key → verify tools appear
2. AI chat: "use context7 to look up Next.js docs" → verify tool gets called, returns real docs
3. Disconnect → verify child process killed (no zombie `npx` processes)
4. Reconnect → verify works again
5. Close and reopen workspace → verify MCP tools auto-reconnect
6. TaskCreatorChat → new conversation → verify MCP tools in `[AVAILABLE TOOLS]`
7. TaskChatBox → open existing task → verify AI can use MCP tools in follow-up

### Edge Cases
- Kill Akira while stdio server running → no zombie processes
- Bad API key → clean error message
- Network loss during install → timeout and cleanup
- Server takes 10+ seconds to start → no premature timeout
- Multiple workspaces with different MCP configs → verify isolation

---

## Summary

| Phase | Scope | Files | Effort |
|---|---|---|---|
| 1 | Real Stdio Transport | `transport.rs` | ~200 LOC Rust |
| 2 | Real MCP Client | `client.rs` | ~150 LOC Rust |
| 3 | Real Connection Manager | `manager.rs` | ~200 LOC Rust |
| 4 | Wire Commands | `commands.rs`, `mod.rs` | ~100 LOC Rust |
| 5 | Frontend Install Flow | `McpSettings.tsx`, `mcpStore.ts` | ~150 LOC TS |
| 6 | AI Integration | `mcpStore.ts`, `injectTools.ts` | ~80 LOC TS |
| **Total** | | **8 files** | **~880 LOC** |
