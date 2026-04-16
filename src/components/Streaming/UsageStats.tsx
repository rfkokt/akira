import { BarChart3, Coins, ArrowRight, Database } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatTokenCount } from '@/lib/streaming';

interface UsageStatsProps {
  inputTokens: number;
  outputTokens: number;
  cacheTokens?: number;
  className?: string;
}

export function UsageStats({ inputTokens, outputTokens, cacheTokens, className }: UsageStatsProps) {
  const freshTokens = cacheTokens ? inputTokens - cacheTokens : inputTokens;
  const totalTokens = inputTokens + outputTokens;
  
  // Claude Sonnet pricing: $3/M input, $15/M output, cache write $3.75/M, cache read $0.30/M
  const estimatedCost =
    (freshTokens * 0.000003) +
    (cacheTokens ? cacheTokens * 0.0000003 : 0) +
    (outputTokens * 0.000015);
  
  return (
    <div className={cn(
      "flex items-center gap-3 px-3 py-2 rounded-lg border border-app-border bg-app-panel/50",
      className
    )}>
      {/* Token Icon */}
      <div className="flex items-center gap-1.5 text-neutral-400">
        <BarChart3 className="w-3.5 h-3.5" />
        <span className="text-[10px] uppercase tracking-wider">Tokens</span>
      </div>
      
      {/* Fresh Input Tokens */}
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-neutral-500">In:</span>
        <span className="text-xs font-mono text-emerald-400">
          {formatTokenCount(freshTokens)}
        </span>
      </div>

      {/* Cache Tokens (if present) */}
      {cacheTokens !== undefined && cacheTokens > 0 && (
        <div className="flex items-center gap-1">
          <Database className="w-3 h-3 text-sky-400" />
          <span className="text-[10px] text-neutral-500">Cache:</span>
          <span className="text-xs font-mono text-sky-400">
            {formatTokenCount(cacheTokens)}
          </span>
        </div>
      )}
      
      {/* Arrow */}
      <ArrowRight className="w-3 h-3 text-neutral-600" />
      
      {/* Output Tokens */}
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-neutral-500">Out:</span>
        <span className="text-xs font-mono text-blue-400">
          {formatTokenCount(outputTokens)}
        </span>
      </div>
      
      {/* Divider */}
      <div className="w-px h-4 bg-app-border" />
      
      {/* Total */}
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-neutral-500">Total:</span>
        <span className="text-xs font-mono text-white">
          {formatTokenCount(totalTokens)}
        </span>
      </div>
      
      {/* Cost */}
      <div className="flex items-center gap-1 ml-auto">
        <Coins className="w-3 h-3 text-amber-400" />
        <span className="text-[10px] text-neutral-500">~$</span>
        <span className="text-xs font-mono text-amber-400">
          {estimatedCost.toFixed(4)}
        </span>
      </div>
    </div>
  );
}

interface CompactUsageStatsProps {
  inputTokens: number;
  outputTokens: number;
  cacheTokens?: number;
  className?: string;
}

export function CompactUsageStats({ inputTokens, outputTokens, cacheTokens, className }: CompactUsageStatsProps) {
  const totalTokens = inputTokens + outputTokens;
  
  return (
    <div className={cn(
      "flex items-center gap-2 text-[10px] text-neutral-500",
      className
    )}>
      <span>{formatTokenCount(totalTokens)} tokens</span>
      <span className="text-neutral-700">•</span>
      <span className="text-emerald-500">{formatTokenCount(inputTokens)} in</span>
      {cacheTokens !== undefined && cacheTokens > 0 && (
        <>
          <span className="text-neutral-700">•</span>
          <span className="text-sky-400">{formatTokenCount(cacheTokens)} cache</span>
        </>
      )}
      <span className="text-neutral-700">/</span>
      <span className="text-blue-500">{formatTokenCount(outputTokens)} out</span>
    </div>
  );
}