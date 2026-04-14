/**
 * Groq API Service
 * 
 * Free tier: 20 requests/min, 1,000,000 tokens/day
 * Used for small talk and chat to save CLI tokens
 */

export interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GroqResponse {
  id: string;
  choices: {
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'llama-3.1-8b-instant'; // Fast & free tier eligible

/**
 * Send chat completion request to Groq API
 */
export async function sendGroqChat(
  apiKey: string,
  messages: GroqMessage[],
  options: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
  } = {}
): Promise<{ content: string; usage?: GroqResponse['usage'] } | null> {
  const {
    model = DEFAULT_MODEL,
    maxTokens = 500,
    temperature = 0.7,
  } = options;

  try {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        temperature,
        stream: false,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[Groq] API error:', response.status, error);
      return null;
    }

    const data: GroqResponse = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (content) {
      console.log('[Groq] Success:', data.usage?.total_tokens, 'tokens');
      return { content: content.trim(), usage: data.usage };
    }
    
    return null;
  } catch (error) {
    console.error('[Groq] Failed:', error);
    return null;
  }
}

/**
 * Evaluate math expression safely
 */
function evaluateMath(expr: string): number | null {
  // Remove common prefixes/suffixes and clean
  const clean = expr
    .replace(/^(berapa|hitung|what is|calculate)\s*/i, '')
    .replace(/[\?=]$/, '')
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/x(?=\d)/gi, '*')
    .trim();
  
  // Only allow safe math characters
  if (!/^[\d+\-*/().\s]+$/.test(clean)) return null;
  
  try {
    // Safe evaluation using Function
    const result = new Function('return (' + clean + ')')();
    return typeof result === 'number' && isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

/**
 * Quick chat for small talk
 * Returns content and usage info for token tracking
 */
export async function sendGroqSmallTalk(
  apiKey: string,
  userMessage: string,
  systemPromptOverride?: string
): Promise<{ content: string; usage?: GroqResponse['usage']; model: string } | null> {
  const model = 'llama-3.1-8b-instant';
  
  // Try local math evaluation first for simple expressions
  const mathResult = evaluateMath(userMessage);
  if (mathResult !== null) {
    console.log('[Groq] Local math evaluation:', userMessage, '=', mathResult);
    return {
      content: String(mathResult),
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      model: 'local-math'
    };
  }
  
  // Use custom system prompt if provided, otherwise use default
  const systemPrompt = systemPromptOverride || 'You are a helpful assistant. Answer briefly and directly. Always respond in the same language as the user (Bahasa Indonesia if user speaks Indonesian, English if user speaks English).';
  
  const result = await sendGroqChat(apiKey, [
    {
      role: 'system',
      content: systemPrompt,
    },
    {
      role: 'user',
      content: userMessage,
    },
  ], {
    model,
    maxTokens: 150,
    temperature: 0.7,
  });

  if (result?.content) {
    return { 
      content: result.content.trim(), 
      usage: result.usage,
      model 
    };
  }
  return null;
}

/**
 * Extract tasks from conversation using Groq
 */
export async function sendGroqSummary(
  apiKey: string,
  conversationText: string,
  skillCatalog: string
): Promise<string | null> {
  const result = await sendGroqChat(apiKey, [
    {
      role: 'system',
      content: `You are a task extraction specialist. Analyze the conversation and extract coding tasks.

CRITICAL: Group related changes into SINGLE task. AVOID over-splitting!

Output format - VALID JSON array only, no markdown:
[
  {
    "title": "Short clear title, max 80 chars",
    "description": "Implementation requirements. Include: 1) All file paths with @ prefix, 2) Complete changes needed, 3) Technical requirements, 4) Expected behavior.",
    "priority": "high | medium | low",
    "recommendedSkills": ["skill-name-1", "skill-name-2"]
  }
]

MERGE vs SPLIT GUIDELINES:
→ MERGE into 1 task when:
  - Same feature/component (e.g., "create login form" = 1 task)
  - Related UI changes in same area
  - CRUD operations on same entity
  - Frontend + Backend for same API
  
→ SPLIT when:
  - Completely different features
  - Independent components
  - Task dependencies exist

Priority:
- "high": Bug fixes, security
- "medium": New features
- "low": Documentation

RULES:
- If ONE feature described → return 1 task
- If multiple independent features → return multiple
- No tasks for: git, PRs, testing
- If no tasks → return []

EXAMPLE (Single Feature - 1 Task):
"Create UserProfile in @src/components/UserProfile.tsx with avatar, name, email. Use @components/Button.tsx. Style with Tailwind. Accept 'user' prop with TypeScript types."`,
    },
    {
      role: 'user',
      content: `Available skills: ${skillCatalog || 'None'}

Conversation:
${conversationText}

Extract tasks as JSON ONLY:`,
    },
  ], {
    model: 'llama-3.1-8b-instant',
    maxTokens: 2500,
    temperature: 0.2,
  });

  return result?.content || null;
}

/**
 * Check if Groq API key is valid
 */
export async function validateGroqKey(apiKey: string): Promise<boolean> {
  try {
    const response = await fetch('https://api.groq.com/openai/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}
