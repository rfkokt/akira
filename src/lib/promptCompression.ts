/**
 * Prompt Compression
 * 
 * Reduces conversation history tokens by 60-80%
 * Compresses older messages while keeping recent context
 */

// Simple ChatMessage interface for compression
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
}

export interface CompressedHistory {
  summary: string;
  recentMessages: string;
  totalTokens: number;
  compressionRatio: number;
}

/**
 * Extract key information from a message
 */
function extractKeyInfo(message: ChatMessage): string {
  const content = message.content || '';
  
  // Extract file references
  const fileRefs = content.match(/@\w+/g) || [];
  
  // Extract code blocks
  const codeBlocks = content.match(/```[\s\S]*?```/g) || [];
  
  // Extract URLs
  const urls = content.match(/https?:\/\/[^\s]+/g) || [];
  
  // Build summary
  const parts: string[] = [];
  
  if (fileRefs.length > 0) {
    parts.push(`files: ${fileRefs.join(', ')}`);
  }
  
  if (codeBlocks.length > 0) {
    parts.push(`code: ${codeBlocks.length} blocks`);
  }
  
  if (urls.length > 0) {
    parts.push(`links: ${urls.length} URLs`);
  }
  
  // If no special content, take first 50 chars
  if (parts.length === 0) {
    const truncated = content.replace(/\n/g, ' ').substring(0, 50);
    return truncated + (content.length > 50 ? '...' : '');
  }
  
  return parts.join(', ');
}

/**
 * Compress conversation history
 * 
 * Strategy:
 * - Keep last 3 messages in full
 * - Summarize older messages
 * - Extract key actions and decisions
 */
export function compressHistory(
  messages: ChatMessage[],
  _maxTokens: number = 2000
): CompressedHistory {
  if (messages.length <= 3) {
    // No compression needed
    const fullText = formatMessages(messages);
    return {
      summary: '',
      recentMessages: fullText,
      totalTokens: estimateTokens(fullText),
      compressionRatio: 1,
    };
  }
  
  // Split messages
  const recent = messages.slice(-3);
  const older = messages.slice(0, -3);
  
  // Summarize older messages
  const summaryParts: string[] = [];
  
  // Group by role
  const userMessages = older.filter(m => m.role === 'user');
  const assistantMessages = older.filter(m => m.role === 'assistant');
  
  if (userMessages.length > 0) {
    const topics = userMessages.map(extractKeyInfo).filter(Boolean);
    if (topics.length > 0) {
      summaryParts.push(`Previous topics: ${topics.join('; ')}`);
    }
  }
  
  // Extract key actions from assistant messages
  const actions = assistantMessages
    .map(m => {
      const content = m.content || '';
      // Look for action keywords
      const actionMatch = content.match(/(?:created|modified|deleted|fixed|added|updated|implemented)\s+(\S+)/i);
      return actionMatch ? actionMatch[0] : null;
    })
    .filter(Boolean);
  
  if (actions.length > 0) {
    summaryParts.push(`Actions: ${actions.join(', ')}`);
  }
  
  // Build compressed history
  const summary = summaryParts.join('\n');
  const recentMessages = formatMessages(recent);
  
  const fullText = summary 
    ? `${summary}\n\n--- Recent Messages ---\n${recentMessages}`
    : recentMessages;
  
  const originalText = formatMessages(messages);
  const totalTokens = estimateTokens(fullText);
  const originalTokens = estimateTokens(originalText);
  
  return {
    summary,
    recentMessages,
    totalTokens,
    compressionRatio: originalTokens / totalTokens,
  };
}

/**
 * Format messages for display
 */
function formatMessages(messages: ChatMessage[]): string {
  return messages
    .map(m => {
      const role = m.role === 'user' ? 'User' : 
                   m.role === 'assistant' ? 'Assistant' : 'System';
      // Clean content - remove token metadata
      const content = (m.content || '')
        .replace(/\s*\[\d+\s*tokens?\s*\|\s*[^\]]+\]$/i, '')
        .trim();
      return `${role}: ${content}`;
    })
    .join('\n\n');
}

/**
 * Estimate token count (rough approximation)
 */
function estimateTokens(text: string): number {
  // Average: 1 token ≈ 4 characters for English
  // For mixed content, use 3.5 as conservative estimate
  return Math.ceil(text.length / 3.5);
}

/**
 * Smart truncation - preserve important parts
 */
export function smartTruncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  
  // Try to find a good break point
  const breakPoints = ['\n\n', '. ', '! ', '? ', '\n', ' '];
  
  for (const bp of breakPoints) {
    const idx = text.lastIndexOf(bp, maxLength);
    if (idx > maxLength * 0.7) {
      return text.substring(0, idx) + '...';
    }
  }
  
  // Fallback: hard truncate
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Compress a single long message
 */
export function compressLongMessage(
  content: string,
  maxLength: number = 500
): string {
  if (content.length <= maxLength) return content;
  
  // Check if contains code
  const hasCode = content.includes('```');
  
  if (hasCode) {
    // Preserve code blocks, compress text
    const parts = content.split(/(```[\s\S]*?```)/);
    return parts
      .map((part, idx) => {
        // Even indices are text, odd are code blocks
        if (idx % 2 === 0) {
          // Text part - truncate if too long
          return smartTruncate(part, Math.min(maxLength / 2, 200));
        }
        // Code block - keep as is if short, else truncate
        return part.length > 400 
          ? part.substring(0, 400) + '\n// ... truncated ...\n```'
          : part;
      })
      .join('');
  }
  
  // No code - simple truncate
  return smartTruncate(content, maxLength);
}

/**
 * Create compression stats for analytics
 */
export function createCompressionStats() {
  let totalOriginal = 0;
  let totalCompressed = 0;
  let totalSavings = 0;
  
  return {
    record: (original: number, compressed: number) => {
      totalOriginal += original;
      totalCompressed += compressed;
      totalSavings += (original - compressed);
    },
    
    getStats: () => ({
      totalOriginal,
      totalCompressed,
      totalSavings,
      avgCompressionRatio: totalOriginal > 0 
        ? (totalOriginal / totalCompressed).toFixed(2) 
        : '1.00',
      savingsPercentage: totalOriginal > 0
        ? ((totalSavings / totalOriginal) * 100).toFixed(1) + '%'
        : '0%',
    }),
  };
}

/**
 * Log compression results
 */
export function logCompression(
  original: string,
  compressed: CompressedHistory
): void {
  console.log(
    '[PromptCompression]',
    '\n  Original tokens:', estimateTokens(original),
    '\n  Compressed tokens:', compressed.totalTokens,
    '\n  Compression ratio:', compressed.compressionRatio.toFixed(2) + 'x',
    '\n  Savings:', ((1 - 1/compressed.compressionRatio) * 100).toFixed(1) + '%'
  );
}
