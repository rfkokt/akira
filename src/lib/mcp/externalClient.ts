/**
 * External MCP Client (Frontend)
 * 
 * Connects to external MCP servers via SSE or HTTP transport.
 * Compatible with servers like Context7, Brave Search, etc.
 * 
 * MCP Protocol: JSON-RPC 2.0 over SSE or HTTP
 */

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpCallResult {
  content: Array<{ type: string; text?: string; [key: string]: unknown }>;
  isError?: boolean;
}

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// ============================================================================
// HTTP MCP Client (for servers like Context7 HTTP endpoint)
// ============================================================================

export class HttpMcpClient {
  private baseUrl: string;
  private headers: Record<string, string>;
  private requestId = 0;
  private initialized = false;

  constructor(url: string, headers: Record<string, string> = {}) {
    this.baseUrl = url.replace(/\/$/, '');
    this.headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...headers,
    };
  }

  private nextId(): number {
    return ++this.requestId;
  }

  private async rpc(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const body: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: this.nextId(),
      method,
      params,
    };

    const res = await fetch(this.baseUrl, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const json: JsonRpcResponse = await res.json();

    if (json.error) {
      throw new Error(`MCP Error ${json.error.code}: ${json.error.message}`);
    }

    return json.result;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.rpc('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      clientInfo: { name: 'akira', version: '1.0.0' },
    });

    await this.rpc('notifications/initialized', {}).catch(() => {
      // Some servers don't support this notification, ignore
    });

    this.initialized = true;
  }

  async listTools(): Promise<McpTool[]> {
    await this.initialize();
    const result = await this.rpc('tools/list') as { tools?: McpTool[] };
    return result?.tools || [];
  }

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<McpCallResult> {
    await this.initialize();
    const result = await this.rpc('tools/call', {
      name,
      arguments: args,
    }) as McpCallResult;
    return result;
  }

  isConnected(): boolean {
    return this.initialized;
  }

  disconnect(): void {
    this.initialized = false;
  }
}

// ============================================================================
// SSE MCP Client (for servers exposing SSE endpoint)
// ============================================================================

export class SseMcpClient {
  private sseUrl: string;
  private postUrl: string | null = null;
  private headers: Record<string, string>;
  private eventSource: EventSource | null = null;
  private pendingRequests = new Map<number | string, {
    resolve: (value: unknown) => void;
    reject: (reason: unknown) => void;
  }>();
  private requestId = 0;
  private initialized = false;
  private sessionId: string | null = null;

  constructor(sseUrl: string, headers: Record<string, string> = {}) {
    this.sseUrl = sseUrl;
    this.headers = headers;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Connect SSE endpoint
      const url = new URL(this.sseUrl);
      if (this.sessionId) url.searchParams.set('sessionId', this.sessionId);

      this.eventSource = new EventSource(url.toString());

      this.eventSource.addEventListener('endpoint', (e: MessageEvent) => {
        // Server sends back the POST endpoint URL via 'endpoint' event
        this.postUrl = e.data;
        resolve();
      });

      this.eventSource.addEventListener('message', (e: MessageEvent) => {
        try {
          const msg: JsonRpcResponse = JSON.parse(e.data);
          const pending = this.pendingRequests.get(msg.id);
          if (pending) {
            this.pendingRequests.delete(msg.id);
            if (msg.error) {
              pending.reject(new Error(`MCP Error ${msg.error.code}: ${msg.error.message}`));
            } else {
              pending.resolve(msg.result);
            }
          }
        } catch { /* ignore parse errors */ }
      });

      this.eventSource.onerror = (e) => {
        if (!this.postUrl) {
          reject(new Error('SSE connection failed'));
        }
        console.error('[SseMcpClient] SSE error:', e);
      };

      // Timeout if no endpoint event
      setTimeout(() => {
        if (!this.postUrl) {
          reject(new Error('SSE endpoint timeout — server did not send endpoint URL'));
        }
      }, 10000);
    });
  }

  private async rpc(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (!this.postUrl) {
      throw new Error('Not connected — call connect() first');
    }

    const id = ++this.requestId;
    const body: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      fetch(this.postUrl!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.headers },
        body: JSON.stringify(body),
      }).catch((err) => {
        this.pendingRequests.delete(id);
        reject(err);
      });

      // Timeout individual requests after 30s
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request timeout: ${method}`));
        }
      }, 30000);
    });
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (!this.postUrl) await this.connect();

    await this.rpc('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      clientInfo: { name: 'akira', version: '1.0.0' },
    });

    this.initialized = true;
  }

  async listTools(): Promise<McpTool[]> {
    await this.initialize();
    const result = await this.rpc('tools/list') as { tools?: McpTool[] };
    return result?.tools || [];
  }

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<McpCallResult> {
    await this.initialize();
    const result = await this.rpc('tools/call', {
      name,
      arguments: args,
    }) as McpCallResult;
    return result;
  }

  isConnected(): boolean {
    return this.initialized && this.eventSource?.readyState === EventSource.OPEN;
  }

  disconnect(): void {
    this.eventSource?.close();
    this.eventSource = null;
    this.postUrl = null;
    this.initialized = false;
    this.pendingRequests.clear();
  }
}

// ============================================================================
// Factory: create the right client based on transport config
// ============================================================================

export type ExternalMcpTransport =
  | { type: 'http'; url: string; headers?: Record<string, string> }
  | { type: 'sse'; url: string; headers?: Record<string, string> };

export function createExternalMcpClient(
  transport: ExternalMcpTransport
): HttpMcpClient | SseMcpClient {
  if (transport.type === 'http') {
    return new HttpMcpClient(transport.url, transport.headers);
  }
  return new SseMcpClient(transport.url, transport.headers);
}

// ============================================================================
// Known Server Presets
// ============================================================================

export const MCP_PRESETS: Array<{
  name: string;
  description: string;
  transport: ExternalMcpTransport;
}> = [
  {
    name: 'Context7',
    description: 'Up-to-date library documentation and code examples',
    transport: { type: 'http', url: 'https://mcp.context7.com/mcp' },
  },
  {
    name: 'Brave Search',
    description: 'Web search via Brave API',
    transport: {
      type: 'http',
      url: 'https://api.search.brave.com/mcp',
      headers: { Authorization: 'Bearer YOUR_BRAVE_API_KEY' },
    },
  },
];
