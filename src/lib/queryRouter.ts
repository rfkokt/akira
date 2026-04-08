/**
 * Query Router
 * 
 * Smart model selection based on query complexity
 * Routes queries to appropriate AI tier for optimal cost/performance
 */

import { isSmallTalk } from './helpers';

export type QueryTier = 
  | 'instant'     // Groq API (small talk) - FREE, 0.1s
  | 'fast'        // Groq API (simple questions) - FREE, 0.5s  
  | 'standard'    // CLI (coding tasks) - $0.01-0.05, 3-5s
  | 'deep';       // CLI (complex tasks) - $0.05-0.30, 10-15s

export interface QueryRoutingResult {
  tier: QueryTier;
  provider: 'groq' | 'cli';
  estimatedTokens: number;
  estimatedCost: number;
  estimatedTime: number;
  reason: string;
}

// Simple ChatMessage interface for context awareness (avoids circular import)
interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * Check if we're in a technical conversation thread.
 * If recent messages were handled by CLI, treat current message as follow-up.
 */
function isTechnicalThread(
  message: string,
  history: ChatMessage[] = [],
  _currentProvider?: string
): boolean {
  // If no history or only 1 message, not a thread
  if (history.length < 2) return false;
  
  // Check last 3 messages for technical indicators
  const recentMessages = history.slice(-4); // Include current message context
  
  // If the last assistant message was from CLI, we're likely in a technical thread
  const lastAssistantMsg = [...history].reverse().find(m => m.role === 'assistant');
  if (lastAssistantMsg) {
    // Check if last response was from CLI (long, technical, contains code)
    const content = lastAssistantMsg.content;
    const isCLILikeResponse = 
      content.length > 500 ||
      content.includes('```') ||
      content.includes('✅ Completed') ||
      content.includes('❌ Error') ||
      content.includes('$') ||
      content.includes('[45 tokens |') === false && // Not from Groq
      content.includes('[200 tokens |') === false &&
      /\b(file|code|function|component|api|route|import|export|implements?|class|interface)\b/i.test(content);
    
    if (isCLILikeResponse) {
      // Current message is likely a follow-up
      // But still check if it's explicitly small talk like "thanks", "ok", etc.
      const msg = message.toLowerCase().trim();
      const explicitSmallTalk = /^(thanks?|thank you|makasih|terima kasih|oke|ok|baik|sip|bye|goodbye|sampai jumpa|dadah)$/i.test(msg);
      
      if (!explicitSmallTalk) {
        return true;
      }
    }
  }
  
  // Check for technical keywords in recent user messages (indicating ongoing work)
  const recentUserMessages = recentMessages.filter(m => m.role === 'user');
  const hasRecentTechnicalContext = recentUserMessages.some(m => {
    const content = m.content.toLowerCase();
    return /\b(code|file|function|component|implement|fix|bug|error|refactor|api|database|git|build|test|summary|endpoint|modal|schedule|employee|assess|assesment)\b/i.test(content);
  });
  
  // Also check if recent messages contain file paths or code snippets
  const hasCodeReferences = recentMessages.some(m => {
    return /\.[a-z]+\b/i.test(m.content) && 
           /\b(\.jsx?|\.tsx?|\.css|\.json|\.md|\.rs|\.go|\.py|\.java)\b/i.test(m.content);
  });
  
  return hasRecentTechnicalContext || hasCodeReferences;
}

/**
 * Route query to appropriate AI tier
 * 
 * @param message - Current user message
 * @param history - Optional conversation history for context awareness
 * @param currentProvider - Optional current provider to detect follow-ups
 */
export function routeQuery(
  message: string,
  history?: ChatMessage[],
  currentProvider?: string
): QueryRoutingResult {
  const msg = message.toLowerCase().trim();
  const length = msg.length;
  
  // Check if we're in a technical conversation thread
  const inTechnicalThread = isTechnicalThread(message, history, currentProvider);
  
  if (inTechnicalThread) {
    return {
      tier: 'standard',
      provider: 'cli',
      estimatedTokens: 8000,
      estimatedCost: 0.05,
      estimatedTime: 5,
      reason: 'Technical thread detected - maintaining context with CLI',
    };
  }
  
  // Check for small talk (free tier) - only if NOT in technical thread
  if (isSmallTalk(message)) {
    return {
      tier: 'instant',
      provider: 'groq',
      estimatedTokens: 50,
      estimatedCost: 0,
      estimatedTime: 0.5,
      reason: 'Small talk detected - using Groq (free)',
    };
  }
  
  // Check for simple questions (still free tier)
  const isSimpleQuestion = 
    length < 100 && 
    !msg.includes('@') && 
    !msg.includes('refactor') &&
    !msg.includes('architecture') &&
    !msg.includes('implement') &&
    !msg.includes('create') &&
    !msg.includes('build') &&
    !msg.includes('fix');
    
  if (isSimpleQuestion) {
    return {
      tier: 'fast',
      provider: 'groq',
      estimatedTokens: 200,
      estimatedCost: 0,
      estimatedTime: 1,
      reason: 'Simple question - using Groq (free)',
    };
  }
  
  // Check for complex tasks (CLI needed)
  const isComplexTask = 
    msg.includes('refactor') ||
    msg.includes('architecture') ||
    msg.includes('implement') && length > 200 ||
    msg.includes('create') && length > 150 ||
    msg.includes('build') && msg.includes('system') ||
    msg.includes('fix') && msg.includes('bug') && length > 100;
    
  if (isComplexTask) {
    return {
      tier: 'deep',
      provider: 'cli',
      estimatedTokens: 15000,
      estimatedCost: 0.15,
      estimatedTime: 12,
      reason: 'Complex task - using CLI with full context',
    };
  }
  
  // Default: standard coding tasks
  return {
    tier: 'standard',
    provider: 'cli',
    estimatedTokens: 8000,
    estimatedCost: 0.05,
    estimatedTime: 5,
    reason: 'Coding task - using CLI',
  };
}

/**
 * Get model recommendation based on tier
 */
export function getModelForTier(tier: QueryTier): string {
  switch (tier) {
    case 'instant':
      return 'llama-3.1-8b-instant (Groq)';
    case 'fast':
      return 'mixtral-8x7b (Groq)';
    case 'standard':
      return 'claude-sonnet / gemini-pro';
    case 'deep':
      return 'claude-opus / gpt-4';
    default:
      return 'auto';
  }
}

/**
 * Estimate cost for a query
 */
export function estimateQueryCost(message: string): {
  cost: number;
  provider: string;
  savings: number;
} {
  const routing = routeQuery(message);
  
  // Compare with baseline (CLI cost)
  const baselineCost = 0.13; // Average CLI cost
  const savings = baselineCost - routing.estimatedCost;
  
  return {
    cost: routing.estimatedCost,
    provider: routing.provider,
    savings: Math.max(0, savings),
  };
}

/**
 * Log routing decision for debugging
 */
export function logRoutingDecision(message: string, result: QueryRoutingResult): void {
  console.log(
    '[QueryRouter]',
    '\n  Message:', message.substring(0, 50) + (message.length > 50 ? '...' : ''),
    '\n  Tier:', result.tier,
    '\n  Provider:', result.provider,
    '\n  Est. Tokens:', result.estimatedTokens,
    '\n  Est. Cost: $' + result.estimatedCost.toFixed(4),
    '\n  Est. Time:', result.estimatedTime + 's',
    '\n  Reason:', result.reason
  );
}

/**
 * Get routing statistics for analytics
 */
export interface RoutingStats {
  totalQueries: number;
  groqQueries: number;
  cliQueries: number;
  totalSavings: number;
  avgResponseTime: number;
}

export function createRoutingTracker() {
  const stats: RoutingStats = {
    totalQueries: 0,
    groqQueries: 0,
    cliQueries: 0,
    totalSavings: 0,
    avgResponseTime: 0,
  };
  
  return {
    track: (message: string, actualTime: number) => {
      const routing = routeQuery(message);
      stats.totalQueries++;
      
      if (routing.provider === 'groq') {
        stats.groqQueries++;
      } else {
        stats.cliQueries++;
      }
      
      // Calculate savings (baseline: $0.13 per CLI query)
      const baselineCost = routing.provider === 'cli' ? 0.13 : 0;
      const actualCost = routing.estimatedCost;
      stats.totalSavings += (baselineCost - actualCost);
      
      // Update average response time
      stats.avgResponseTime = 
        (stats.avgResponseTime * (stats.totalQueries - 1) + actualTime) / 
        stats.totalQueries;
    },
    
    getStats: () => ({ ...stats }),
    
    getSummary: () => ({
      ...stats,
      groqPercentage: ((stats.groqQueries / stats.totalQueries) * 100).toFixed(1) + '%',
      cliPercentage: ((stats.cliQueries / stats.totalQueries) * 100).toFixed(1) + '%',
      totalSavingsFormatted: '$' + stats.totalSavings.toFixed(2),
    }),
  };
}
