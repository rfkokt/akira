/**
 * MCP Settings — Dynamic Catalog from Official MCP Registry
 *
 * Fetches available servers from registry.modelcontextprotocol.io
 * User browses, searches, and connects with one click.
 * No manual form configuration needed.
 */

import { useState, useEffect } from 'react';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { useMcpStore } from '@/store/mcpStore';
import { McpToolsList } from './McpToolsList';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  Plug,
  PlugZap,
  Loader2,
  Wrench,
  Search,
  Globe,
  RefreshCw,
  Terminal,
} from 'lucide-react';
import {
  connectExternalServer,
  disconnectExternalServer,
  getActiveServers,
} from '@/lib/mcp/externalManager';
import type { ExternalMcpTransport } from '@/lib/mcp/externalClient';

// ============================================================================
// Types from MCP Registry
// ============================================================================

interface RegistryHeader {
  name: string;
  description?: string;
  isRequired?: boolean;
  isSecret?: boolean;
}

interface RegistryRemote {
  type: 'streamable-http' | 'sse' | 'http';
  url: string;
  headers?: RegistryHeader[];
}

interface RegistryPackage {
  registryType: string;
  identifier: string;
  version?: string;
  runtimeHint?: string;
  transport: { type: 'stdio' | string };
  environmentVariables?: Array<{
    name: string;
    description?: string;
    isRequired?: boolean;
    isSecret?: boolean;
  }>;
}

interface RegistryServer {
  name: string;
  title?: string;
  description?: string;
  version?: string;
  websiteUrl?: string;
  remotes?: RegistryRemote[];
  packages?: RegistryPackage[];
  icons?: Array<{ src: string; mimeType?: string }>;
}

interface RegistryMeta {
  'io.modelcontextprotocol.registry/official'?: {
    isLatest: boolean;
    status: 'active' | 'deprecated' | 'deleted';
  };
}

interface RegistryEntry {
  server: RegistryServer;
  _meta: RegistryMeta;
}

interface RegistryResponse {
  servers: RegistryEntry[];
  metadata?: { nextCursor?: string; count?: number };
}


// ============================================================================
// Catalog Fetch Hook — uses official /v0.1/servers API with server-side search
// ============================================================================

// API base: v0.1 supports ?search=<query>&version=latest&limit=<n>&cursor=<cursor>
const REGISTRY_BASE = 'https://registry.modelcontextprotocol.io/v0.1/servers';
const PAGE_SIZE = 50;

function useRegistryCatalog(searchQuery: string) {
  const [servers, setServers] = useState<RegistryServer[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  // Debounced search to avoid hammering the API
  const [debouncedSearch, setDebouncedSearch] = useState(searchQuery);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(searchQuery), 350);
    return () => clearTimeout(id);
  }, [searchQuery]);

  const fetchPage = async (nextCursor?: string | null, query?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const url = new URL(REGISTRY_BASE);
      url.searchParams.set('limit', String(PAGE_SIZE));
      // NOTE: ?search= matches server name field only (reverse-DNS format)
      // e.g. search=context7 won't find a server unless its name contains "context7"
      // version=latest param is unreliable — we filter isLatest client-side from _meta
      if (query?.trim()) url.searchParams.set('search', query.trim());
      if (nextCursor) url.searchParams.set('cursor', nextCursor);

      const res = await fetch(url.toString(), {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`Registry error: ${res.status}`);

      const data: RegistryResponse = await res.json();

      // Keep only: isLatest + active status
      const activeLatest = (data.servers ?? [])
        .filter((e) => e._meta?.['io.modelcontextprotocol.registry/official']?.isLatest === true)
        .filter((e) => e._meta?.['io.modelcontextprotocol.registry/official']?.status === 'active')
        .map((e) => e.server);

      // Append for pagination, reset for fresh search
      setServers((prev) => {
        if (!nextCursor) return activeLatest;
        const existingNames = new Set(prev.map((s) => s.name));
        return [...prev, ...activeLatest.filter((s) => !existingNames.has(s.name))];
      });

      setCursor(data.metadata?.nextCursor ?? null);
      setHasMore(!!data.metadata?.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setIsLoading(false);
    }
  };

  // Re-fetch from first page when debounced search changes
  useEffect(() => {
    setCursor(null);
    setHasMore(true);
    fetchPage(null, debouncedSearch);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  return {
    servers,
    isLoading,
    error,
    hasMore,
    loadMore: () => fetchPage(cursor, debouncedSearch),
    refetch: () => fetchPage(null, debouncedSearch),
  };
}

// ============================================================================
// Main Component
// ============================================================================

export function McpSettings() {
  const activeWorkspace = useWorkspaceStore((state) => state.activeWorkspace);
  const { loadServers } = useMcpStore();

  const [activeServers, setActiveServersState] = useState(getActiveServers());
  const [selectedServer, setSelectedServer] = useState<RegistryServer | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const { servers, isLoading, error, hasMore, loadMore, refetch } = useRegistryCatalog(searchQuery);

  useEffect(() => {
    if (activeWorkspace?.id) {
      loadServers(activeWorkspace.id).catch(() => {});
    }
  }, [activeWorkspace?.id, loadServers]);

  const refreshActive = () => setActiveServersState(getActiveServers());

  const connectedIds = new Set(activeServers.map((s) => s.id));

  const handleConnect = async (
    server: RegistryServer,
    headerValues: Record<string, string>,
  ) => {
    const remote = server.remotes?.[0];
    if (!remote) return;

    setConnectingId(server.name);
    try {
      const transportType: ExternalMcpTransport['type'] =
        remote.type === 'streamable-http' ? 'http' : remote.type;

      const transport: ExternalMcpTransport = {
        type: transportType,
        url: remote.url,
        // Auto-prefix Bearer for Authorization headers
        headers: Object.fromEntries(
          Object.entries(headerValues).map(([k, v]) => [
            k,
            k === 'Authorization' && !v.startsWith('Bearer ') ? `Bearer ${v}` : v,
          ]),
        ),
      };

      await connectExternalServer(server.name, server.title || server.name, transport);
      refreshActive();
      setSelectedServer(null);
    } catch (err) {
      console.error('[McpSettings] connect failed', err);
    } finally {
      setConnectingId(null);
    }
  };

  const handleDisconnect = async (serverId: string) => {
    await disconnectExternalServer(serverId);
    refreshActive();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">MCP Servers</h2>
          <p className="text-muted-foreground text-sm">
            Connect external AI tools from the official MCP registry
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refetch} disabled={isLoading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Active Connections */}
      {activeServers.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
            Connected ({activeServers.length})
          </h3>
          <div className="grid gap-2">
            {activeServers.map((server) => (
              <div
                key={server.id}
                className="flex items-center gap-3 p-3 border rounded-xl bg-green-500/5 border-green-500/20"
              >
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{server.name}</p>
                  <p className="text-xs text-muted-foreground">{server.tools.length} tools</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-red-500"
                  onClick={() => handleDisconnect(server.id)}
                >
                  <Plug className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search servers..."
          className="pl-9"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/5 text-sm text-red-400">
          {error} —{' '}
          <button className="underline" onClick={refetch}>
            retry
          </button>
        </div>
      )}

      {/* Catalog Grid */}
      <div className="space-y-2">
        {isLoading && servers.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-primary mr-2" />
            <span className="text-muted-foreground text-sm">Loading registry...</span>
          </div>
        ) : (
          <>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
              {searchQuery.trim()
                ? `Results for "${searchQuery}" (${servers.length} with remote endpoints)`
                : `Registry (${servers.length} with remote endpoints)`}
            </h3>

            <div className="grid gap-2">
              {servers.map((server) => (
                <ServerRow
                  key={server.name}
                  server={server}
                  isConnected={connectedIds.has(server.name)}
                  isConnecting={connectingId === server.name}
                  onSelect={setSelectedServer}
                />
              ))}
            </div>

            {servers.length === 0 && !isLoading && (
              <div className="py-12 text-center text-muted-foreground text-sm">
                {searchQuery.trim()
                  ? `No connectable servers found for "${searchQuery}"`
                  : 'No servers available'}
              </div>
            )}

            {/* Load More — only show when not searching */}
            {hasMore && (
              <Button
                variant="outline"
                className="w-full"
                onClick={loadMore}
                disabled={isLoading}
              >
                {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Load more
              </Button>
            )}
          </>
        )}
      </div>

      {/* Dynamic MCP Tools */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="w-5 h-5" />
            Dynamic Tools
          </CardTitle>
          <CardDescription>
            Auto-generated tools from workspace utils, hooks, skills, and standards
          </CardDescription>
        </CardHeader>
        <CardContent>
          <McpToolsList />
        </CardContent>
      </Card>

      {/* Connect Dialog */}
      {selectedServer && (
        <ConnectDialog
          server={selectedServer}
          isConnecting={connectingId === selectedServer.name}
          onConnect={handleConnect}
          onClose={() => setSelectedServer(null)}
        />
      )}
    </div>
  );
}

// ============================================================================
// Server Row (shared between pinned + registry)
// ============================================================================

interface ServerRowProps {
  server: RegistryServer;
  isConnected: boolean;
  isConnecting: boolean;
  onSelect: (server: RegistryServer) => void;
}

function ServerRow({ server, isConnected, isConnecting, onSelect }: ServerRowProps) {
  const remote = server.remotes?.[0];
  const isRemote = !!(remote?.url);
  const needsAuth = remote?.headers?.some((h) => h.isRequired && h.isSecret);
  const iconSrc = server.icons?.[0]?.src;
  // Stdio install hint
  const pkg = server.packages?.[0];
  const installCmd = pkg
    ? pkg.runtimeHint === 'npx'
      ? `npx ${pkg.identifier}`
      : pkg.runtimeHint === 'uvx'
        ? `uvx ${pkg.identifier}`
        : `${pkg.registryType} install ${pkg.identifier}`
    : null;

  const clickable = isRemote && !isConnected && !isConnecting;

  return (
    <div
      onClick={() => clickable && onSelect(server)}
      className={`group flex items-center gap-4 p-3.5 border rounded-xl transition-all ${
        isConnected
          ? 'border-green-500/30 bg-green-500/5 cursor-default'
          : isRemote
            ? 'border-border hover:border-primary/40 hover:bg-accent/20 cursor-pointer'
            : 'border-border/50 opacity-70 cursor-default'
      }`}
    >
      {/* Icon */}
      <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
        {iconSrc ? (
          <img
            src={iconSrc}
            alt={server.name}
            className="w-7 h-7 object-contain"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : isRemote ? (
          <Globe className="w-4 h-4 text-muted-foreground" />
        ) : (
          <Terminal className="w-4 h-4 text-muted-foreground" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm truncate">{server.title || server.name}</span>
          {!isRemote ? (
            <Badge variant="outline" className="text-xs py-0 shrink-0 border-dashed">Stdio</Badge>
          ) : needsAuth ? (
            <Badge variant="outline" className="text-xs py-0 shrink-0">Needs Key</Badge>
          ) : (
            <Badge className="text-xs py-0 shrink-0 bg-emerald-500/15 text-emerald-500 border-emerald-500/30">Free</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
          {!isRemote && installCmd
            ? <span className="font-mono">{installCmd}</span>
            : server.description}
        </p>
      </div>

      {/* Status / Action */}
      <div className="flex-shrink-0">
        {isConnected ? (
          <Badge className="bg-green-500/20 text-green-500 border-green-500/30 shrink-0">
            <PlugZap className="w-3 h-3 mr-1" /> On
          </Badge>
        ) : isConnecting ? (
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
        ) : isRemote ? (
          <span className="text-xs text-muted-foreground group-hover:text-primary transition-colors">Connect →</span>
        ) : (
          <span className="text-xs text-muted-foreground">Local only</span>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Connect Dialog
// ============================================================================

interface ConnectDialogProps {
  server: RegistryServer;
  isConnecting: boolean;
  onConnect: (server: RegistryServer, headers: Record<string, string>) => void;
  onClose: () => void;
}

function ConnectDialog({ server, isConnecting, onConnect, onClose }: ConnectDialogProps) {
  const remote = server.remotes?.[0];
  const requiredHeaders = remote?.headers?.filter((h) => h.isRequired) || [];
  const [headerValues, setHeaderValues] = useState<Record<string, string>>({});

  const allFilled = requiredHeaders.every((h) => headerValues[h.name]?.trim());
  const canConnect = requiredHeaders.length === 0 || allFilled;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            {server.icons?.[0]?.src ? (
              <img
                src={server.icons[0].src}
                alt={server.name}
                className="w-10 h-10 rounded-lg object-contain bg-muted p-1"
              />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                <Globe className="w-5 h-5 text-muted-foreground" />
              </div>
            )}
            <div>
              <DialogTitle>{server.title || server.name}</DialogTitle>
              {server.version && (
                <DialogDescription className="mt-0">v{server.version}</DialogDescription>
              )}
            </div>
          </div>
        </DialogHeader>

        {server.description && (
          <p className="text-sm text-muted-foreground">{server.description}</p>
        )}

        {remote && (
          <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2 font-mono truncate">
            {remote.url}
          </div>
        )}

        {/* Required headers / API keys */}
        {requiredHeaders.length > 0 ? (
          <div className="space-y-3">
            {requiredHeaders.map((header) => (
              <div key={header.name} className="space-y-1.5">
                <Label htmlFor={`hdr-${header.name}`}>
                  {header.name}
                  <span className="text-red-400 ml-0.5">*</span>
                </Label>
                <Input
                  id={`hdr-${header.name}`}
                  type={header.isSecret ? 'password' : 'text'}
                  placeholder={header.description || `Enter ${header.name}`}
                  value={headerValues[header.name] || ''}
                  onChange={(e) =>
                    setHeaderValues((prev) => ({ ...prev, [header.name]: e.target.value }))
                  }
                />
                {header.description && (
                  <p className="text-xs text-muted-foreground">{header.description}</p>
                )}
              </div>
            ))}
            {server.websiteUrl && (
              <a
                href={server.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline block"
              >
                Get your API key at {new URL(server.websiteUrl).hostname} →
              </a>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
            <PlugZap className="w-4 h-4 text-green-500 flex-shrink-0" />
            <span className="text-sm text-green-600 dark:text-green-400">
              No API key required — connect instantly
            </span>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isConnecting}>
            Cancel
          </Button>
          <Button onClick={() => onConnect(server, headerValues)} disabled={isConnecting || !canConnect}>
            {isConnecting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <PlugZap className="w-4 h-4 mr-2" />
            )}
            {isConnecting ? 'Connecting...' : 'Connect'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
