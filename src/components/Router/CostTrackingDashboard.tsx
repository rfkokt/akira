import { useState, useEffect } from 'react';
import { X, TrendingUp, DollarSign, Activity } from 'lucide-react';
import { dbService } from '@/lib/db';
import type { RouterProviderInfo } from '@/types';

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

  if (!isOpen) return null;

  const filteredStats = selectedProvider
    ? providerStats.filter(p => p.alias === selectedProvider)
    : providerStats;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[#1e1e1e] rounded-lg w-[800px] max-h-[80vh] overflow-hidden border border-white/10">
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            Cost Tracking Dashboard
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded transition-colors"
          >
            <X className="w-5 h-5 text-[#cccccc]" />
          </button>
        </div>

        <div className="p-4">
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-[#2d2d2d] rounded-lg p-4">
              <div className="flex items-center gap-2 text-[#858585] text-sm mb-1">
                <DollarSign className="w-4 h-4" />
                Total Cost
              </div>
              <div className="text-2xl font-bold text-white">
                ${totalCost.toFixed(4)}
              </div>
            </div>
            <div className="bg-[#2d2d2d] rounded-lg p-4">
              <div className="flex items-center gap-2 text-[#858585] text-sm mb-1">
                <Activity className="w-4 h-4" />
                Total Requests
              </div>
              <div className="text-2xl font-bold text-white">
                {providerStats.reduce((sum, p) => sum + p.totalRequests, 0)}
              </div>
            </div>
            <div className="bg-[#2d2d2d] rounded-lg p-4">
              <div className="flex items-center gap-2 text-[#858585] text-sm mb-1">
                <TrendingUp className="w-4 h-4" />
                Total Tokens
              </div>
              <div className="text-2xl font-bold text-white">
                {totalTokens.toLocaleString()}
              </div>
            </div>
          </div>

          <div className="mb-4 flex gap-2 flex-wrap">
            <button
              onClick={() => setSelectedProvider(null)}
              className={`px-3 py-1 rounded text-sm transition-colors ${
                !selectedProvider
                  ? 'bg-[#0e639c] text-white'
                  : 'bg-[#3c3c3c] text-[#cccccc] hover:bg-[#4c4c4c]'
              }`}
            >
              All Providers
            </button>
            {providers.map(p => (
              <button
                key={p.alias}
                onClick={() => setSelectedProvider(p.alias)}
                className={`px-3 py-1 rounded text-sm transition-colors ${
                  selectedProvider === p.alias
                    ? 'bg-[#0e639c] text-white'
                    : 'bg-[#3c3c3c] text-[#cccccc] hover:bg-[#4c4c4c]'
                }`}
              >
                {p.alias}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="text-center py-8 text-[#858585]">Loading...</div>
          ) : filteredStats.length === 0 ? (
            <div className="text-center py-8 text-[#858585]">
              No cost data available
            </div>
          ) : (
            <div className="space-y-3 max-h-[300px] overflow-y-auto">
              {filteredStats.map(stat => {
                const provider = providers.find(p => p.alias === stat.alias);
                const avgCost = stat.totalRequests > 0 
                  ? stat.totalCost / stat.totalRequests 
                  : 0;
                
                return (
                  <div
                    key={stat.alias}
                    className="bg-[#2d2d2d] rounded-lg p-4"
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
                        <div className="text-[#858585] mb-1">Requests</div>
                        <div className="text-white">{stat.totalRequests}</div>
                      </div>
                      <div>
                        <div className="text-[#858585] mb-1">Input Tokens</div>
                        <div className="text-white">{stat.totalInputTokens.toLocaleString()}</div>
                      </div>
                      <div>
                        <div className="text-[#858585] mb-1">Output Tokens</div>
                        <div className="text-white">{stat.totalOutputTokens.toLocaleString()}</div>
                      </div>
                      <div>
                        <div className="text-[#858585] mb-1">Avg Cost/Req</div>
                        <div className="text-white">${avgCost.toFixed(6)}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
