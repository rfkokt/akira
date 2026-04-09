import { useState, useEffect } from 'react';
import { TrendingUp, DollarSign, Activity } from 'lucide-react';
import { dbService } from '@/lib/db';
import type { RouterProviderInfo } from '@/types';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface CostTrackingDashboardProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ProviderStats {
  alias: string;
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  switchesIn: number;
  switchesOut: number;
}

export function CostTrackingDashboard({ isOpen, onClose }: CostTrackingDashboardProps) {
  const [providerStats, setProviderStats] = useState<ProviderStats[]>([]);
  const [providers, setProviders] = useState<RouterProviderInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [costs, provs] = await Promise.all([
        dbService.getProviderCosts(),
        dbService.getRouterProviders(),
      ]);
      setProviders(provs);
      
      const statsMap = new Map<string, ProviderStats>();
      for (const cost of costs) {
        const existing = statsMap.get(cost.provider_alias) || {
          alias: cost.provider_alias,
          totalRequests: 0,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          totalCost: 0,
          switchesIn: 0,
          switchesOut: 0,
        };
        existing.totalRequests += cost.total_requests;
        existing.totalInputTokens += cost.total_input_tokens;
        existing.totalOutputTokens += cost.total_output_tokens;
        existing.totalCost += cost.total_cost;
        statsMap.set(cost.provider_alias, existing);
      }
      
      setProviderStats(Array.from(statsMap.values()));
    } catch (err) {
      console.error('Failed to load cost data:', err);
    } finally {
      setLoading(false);
    }
  };

  const totalCost = providerStats.reduce((sum, p) => sum + p.totalCost, 0);
  const totalTokens = providerStats.reduce((sum, p) => sum + p.totalInputTokens + p.totalOutputTokens, 0);

  const filteredStats = selectedProvider
    ? providerStats.filter(p => p.alias === selectedProvider)
    : providerStats;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            Cost Tracking Dashboard
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-app-sidebar rounded-lg p-4">
            <div className="flex items-center gap-2 text-app-text-muted text-sm mb-1">
              <DollarSign className="w-4 h-4" />
              Total Cost
            </div>
            <div className="text-2xl font-bold text-white">
              ${totalCost.toFixed(4)}
            </div>
          </div>
          <div className="bg-app-sidebar rounded-lg p-4">
            <div className="flex items-center gap-2 text-app-text-muted text-sm mb-1">
              <Activity className="w-4 h-4" />
              Total Requests
            </div>
            <div className="text-2xl font-bold text-white">
              {providerStats.reduce((sum, p) => sum + p.totalRequests, 0)}
            </div>
          </div>
          <div className="bg-app-sidebar rounded-lg p-4">
            <div className="flex items-center gap-2 text-app-text-muted text-sm mb-1">
              <TrendingUp className="w-4 h-4" />
              Total Tokens
            </div>
            <div className="text-2xl font-bold text-white">
              {totalTokens.toLocaleString()}
            </div>
          </div>
        </div>

        <div className="mb-4 flex gap-2 flex-wrap">
          <Button
            variant={!selectedProvider ? "default" : "secondary"}
            size="sm"
            onClick={() => setSelectedProvider(null)}
          >
            All Providers
          </Button>
          {providers.map(p => (
            <Button
              key={p.alias}
              variant={selectedProvider === p.alias ? "default" : "secondary"}
              size="sm"
              onClick={() => setSelectedProvider(p.alias)}
            >
              {p.alias}
            </Button>
          ))}
        </div>

        <ScrollArea className="h-[300px]">
          {loading ? (
            <div className="text-center py-8 text-app-text-muted">Loading...</div>
          ) : filteredStats.length === 0 ? (
            <div className="text-center py-8 text-app-text-muted">
              No cost data available
            </div>
          ) : (
            <div className="space-y-3 pr-4">
              {filteredStats.map(stat => {
                const provider = providers.find(p => p.alias === stat.alias);
                const avgCost = stat.totalRequests > 0 
                  ? stat.totalCost / stat.totalRequests 
                  : 0;
                
                return (
                  <div
                    key={stat.alias}
                    className="bg-app-sidebar rounded-lg p-4"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-white">{stat.alias}</span>
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          provider?.status === 'idle' 
                            ? 'bg-green-500/20 text-green-400'
                            : provider?.status === 'running'
                            ? 'bg-blue-500/20 text-blue-400'
                            : 'bg-yellow-500/20 text-yellow-400'
                        }`}>
                          {provider?.status || 'unknown'}
                        </span>
                      </div>
                      <div className="text-xl font-bold text-white">
                        ${stat.totalCost.toFixed(4)}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-4 gap-4 text-sm">
                      <div>
                        <div className="text-app-text-muted mb-1">Requests</div>
                        <div className="text-white">{stat.totalRequests}</div>
                      </div>
                      <div>
                        <div className="text-app-text-muted mb-1">Input Tokens</div>
                        <div className="text-white">{stat.totalInputTokens.toLocaleString()}</div>
                      </div>
                      <div>
                        <div className="text-app-text-muted mb-1">Output Tokens</div>
                        <div className="text-white">{stat.totalOutputTokens.toLocaleString()}</div>
                      </div>
                      <div>
                        <div className="text-app-text-muted mb-1">Avg Cost/Req</div>
                        <div className="text-white">${avgCost.toFixed(6)}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
