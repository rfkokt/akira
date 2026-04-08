/**
 * MCP Settings Component
 *
 * UI for managing MCP servers
 */

import React, { useState, useEffect } from 'react';
import { useWorkspaceStore } from '@/store/workspaceStore';
import {
  useMcpStore,
  useMcpServers,
  useMcpLoading,
  useMcpError,
  getServerStatusColor,
  getServerStatusLabel,
} from '@/store/mcpStore';
import {
  McpTransport,
    McpServerDto,
  } from '@/lib/mcp/types';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  } from '@/components/ui/dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Plus,
  Trash2,
    Power,
  PowerOff,
  ChevronDown,
  Wrench,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
} from 'lucide-react';

export function McpSettings() {
  const activeWorkspace = useWorkspaceStore((state) => state.activeWorkspace);
  const servers = useMcpServers();
  const isLoading = useMcpLoading();
  const error = useMcpError();
  const { loadServers, deleteServer, connectServer, disconnectServer } =
    useMcpStore();

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [expandedServer, setExpandedServer] = useState<string | null>(null);

  // Load servers when workspace changes
  useEffect(() => {
    if (activeWorkspace?.id) {
      loadServers(activeWorkspace.id);
    }
  }, [activeWorkspace?.id, loadServers]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">MCP Servers</h2>
          <p className="text-muted-foreground">
            Connect to external MCP servers to extend AI capabilities
          </p>
        </div>
        <Button onClick={() => setIsAddDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Server
        </Button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-500" />
          <span className="text-red-700">{error}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => useMcpStore.getState().clearError()}
            className="ml-auto"
          >
            Dismiss
          </Button>
        </div>
      )}

      {/* Servers List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="ml-2 text-muted-foreground">Loading servers...</span>
        </div>
      ) : servers.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Wrench className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium mb-2">No MCP Servers</h3>
            <p className="text-muted-foreground mb-4">
              Add your first MCP server to extend AI capabilities
            </p>
            <Button onClick={() => setIsAddDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Server
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {servers.map((server) => (
            <ServerCard
              key={server.id}
              server={server}
              isExpanded={expandedServer === server.id}
              onToggle={() =>
                setExpandedServer(expandedServer === server.id ? null : server.id)
              }
              onDelete={() => deleteServer(server.id)}
              onConnect={() => connectServer(server.id)}
              onDisconnect={() => disconnectServer(server.id)}
            />
          ))}
        </div>
      )}

      {/* Add Server Dialog */}
      <AddServerDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        workspaceId={activeWorkspace?.id || ''}
      />
    </div>
  );
}

// ============================================================================
// Server Card Component
// ============================================================================

interface ServerCardProps {
  server: McpServerDto;
  isExpanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
}

function ServerCard({
  server,
  isExpanded,
  onToggle,
  onDelete,
  onConnect,
  onDisconnect,
}: ServerCardProps) {
  const statusColor = getServerStatusColor(server.status);
  const statusLabel = getServerStatusLabel(server.status);
  const isConnected = server.status === 'connected';
  const isConnecting = server.status === 'connecting';

  return (
    <Card
      className={`border-l-4 ${
        isConnected
          ? 'border-l-green-500'
          : server.status === 'failed'
          ? 'border-l-red-500'
          : 'border-l-gray-300'
      }`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${statusColor}`} />
            <div>
              <CardTitle className="text-lg">{server.name}</CardTitle>
              <CardDescription>
                {server.transportType} • {statusLabel}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isConnected ? (
              <Button
                variant="outline"
                size="sm"
                onClick={onDisconnect}
              >
                <PowerOff className="w-4 h-4 mr-1" />
                Disconnect
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={onConnect}
                disabled={isConnecting || !server.enabled}
              >
                {isConnecting ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <Power className="w-4 h-4 mr-1" />
                )}
                {isConnecting ? 'Connecting...' : 'Connect'}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              className="text-red-500 hover:text-red-700"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      {server.error && (
        <CardContent className="pt-0">
          <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md">
            {server.error}
          </div>
        </CardContent>
      )}

      <Collapsible open={isExpanded} onOpenChange={onToggle}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="w-full">
            <ChevronDown
              className={`w-4 h-4 mr-2 transition-transform ${
                isExpanded ? 'rotate-180' : ''
              }`}
            />
            {isExpanded ? 'Hide Details' : 'Show Details'}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            {server.description && (
              <p className="text-sm text-muted-foreground">{server.description}</p>
            )}

            {/* Tools List */}
            {server.tools.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">
                  Available Tools ({server.tools.length})
                </h4>
                <div className="flex flex-wrap gap-2">
                  {server.tools.map((tool) => (
                    <Badge key={tool.name} variant="secondary" className="text-xs">
                      {tool.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Server Info */}
            <div className="text-xs text-muted-foreground space-y-1">
              <p>ID: {server.id}</p>
              <p>Created: {new Date(server.createdAt * 1000).toLocaleString()}</p>
              <p>Updated: {new Date(server.updatedAt * 1000).toLocaleString()}</p>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

// ============================================================================
// Add Server Dialog
// ============================================================================

interface AddServerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
}

function AddServerDialog({ open, onOpenChange, workspaceId }: AddServerDialogProps) {
  const { createServer, testConnection } = useMcpStore();
  const [activeTab, setActiveTab] = useState('stdio');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState('');
  const [url, setUrl] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !workspaceId) return;

    setIsSubmitting(true);

    try {
      let transport: McpTransport;

      if (activeTab === 'stdio') {
        transport = {
          type: 'stdio',
          command,
          args: args.split(' ').filter(Boolean),
        };
      } else {
        transport = {
          type: activeTab as 'sse' | 'http',
          url,
        };
      }

      await createServer({
        workspaceId,
        name,
        description,
        transport,
      });

      // Reset form
      setName('');
      setDescription('');
      setCommand('');
      setArgs('');
      setUrl('');
      setTestResult(null);
      onOpenChange(false);
    } catch (err) {
      console.error('Failed to create server:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);

    try {
      let transport: McpTransport;

      if (activeTab === 'stdio') {
        transport = {
          type: 'stdio',
          command,
          args: args.split(' ').filter(Boolean),
        };
      } else {
        transport = {
          type: activeTab as 'sse' | 'http',
          url,
        };
      }

      const success = await testConnection(transport);
      setTestResult({
        success,
        message: success
          ? 'Connection test passed!'
          : 'Connection test failed. Please check your configuration.',
      });
    } catch (err) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : 'Test failed',
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add MCP Server</DialogTitle>
          <DialogDescription>
            Configure a new MCP server to extend AI capabilities
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Server Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Server Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., filesystem-server"
              required
            />
            <p className="text-xs text-muted-foreground">
              Use alphanumeric characters, dashes, and underscores only
            </p>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this server"
              rows={2}
            />
          </div>

          {/* Transport Type */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="stdio">Command (stdio)</TabsTrigger>
              <TabsTrigger value="sse">SSE (URL)</TabsTrigger>
            </TabsList>

            <TabsContent value="stdio" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="command">Command</Label>
                <Input
                  id="command"
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder="e.g., npx"
                  required={activeTab === 'stdio'}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="args">Arguments (space-separated)</Label>
                <Input
                  id="args"
                  value={args}
                  onChange={(e) => setArgs(e.target.value)}
                  placeholder="e.g., -y @modelcontextprotocol/server-filesystem /path"
                />
              </div>
            </TabsContent>

            <TabsContent value="sse" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="url">SSE URL</Label>
                <Input
                  id="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="e.g., https://api.example.com/mcp/sse"
                  required={activeTab === 'sse'}
                />
              </div>
            </TabsContent>
          </Tabs>

          {/* Test Result */}
          {testResult && (
            <div
              className={`p-3 rounded-md text-sm ${
                testResult.success
                  ? 'bg-green-50 text-green-700'
                  : 'bg-red-50 text-red-700'
              }`}
            >
              <div className="flex items-center gap-2">
                {testResult.success ? (
                  <CheckCircle className="w-4 h-4" />
                ) : (
                  <XCircle className="w-4 h-4" />
                )}
                {testResult.message}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleTest}
              disabled={isTesting || (!command && !url)}
            >
              {isTesting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              Test Connection
            </Button>
            <Button type="submit" disabled={isSubmitting || !name}>
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              Add Server
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
