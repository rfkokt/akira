/**
 * AI Commit Message Generator
 * 
 * Generates commit messages using Groq API (free and fast)
 */

interface CommitMessageOptions {
  diff: string;
  groqApiKey?: string;
  language?: 'en' | 'id';
}

interface GroqResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

/**
 * Generate a commit message using Groq API
 */
export async function generateCommitMessage(options: CommitMessageOptions): Promise<string> {
  const { diff, groqApiKey, language = 'en' } = options;
  
  // Trim diff to max 2000 chars for cost optimization
  const trimmedDiff = diff.slice(0, 2000);
  
  // Get API key from options or environment (Vite env variable)
  const apiKey = groqApiKey || (typeof import.meta !== 'undefined' ? (import.meta as {env?: { VITE_GROQ_API_KEY?: string }}).env?.VITE_GROQ_API_KEY : undefined);
  
  if (!apiKey) {
    // Fallback to simple pattern-based generation
    return generateSimpleCommitMessage(trimmedDiff);
  }
  
  const systemPrompt = language === 'id' 
    ? `Kamu adalah generator pesan commit git. Buat pesan commit yang ringkas mengikuti conventional commit.
Format: type(scope): description
Types: feat, fix, refactor, docs, style, test, chore
Jaga agar pesan tidak lebih dari 72 karakter.
Jawab HANYA dengan pesan commit, tidak ada yang lain.`
    : `You are a git commit message generator. Generate a concise conventional commit message.
Format: type(scope): description
Types: feat, fix, refactor, docs, style, test, chore
Keep it under 72 characters.
Reply ONLY with the commit message, nothing else.`;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Generate commit message for:\n${trimmedDiff}` },
        ],
        temperature: 0.3,
        max_tokens: 100,
      }),
    });

    if (!response.ok) {
      console.error('Groq API error:', response.status);
      return generateSimpleCommitMessage(trimmedDiff);
    }

    const data: GroqResponse = await response.json();
    const message = data.choices?.[0]?.message?.content?.trim();
    
    if (!message) {
      return generateSimpleCommitMessage(trimmedDiff);
    }

    // Ensure message is not too long
    if (message.length > 72) {
      return message.slice(0, 69) + '...';
    }

    return message;
  } catch (error) {
    console.error('Failed to generate commit message:', error);
    return generateSimpleCommitMessage(trimmedDiff);
  }
}

/**
 * Simple pattern-based commit message generation (no API needed)
 */
export function generateSimpleCommitMessage(diff: string): string {
  // Analyze the diff content
  const lowerDiff = diff.toLowerCase();
  
  // Detect type based on patterns
  if (lowerDiff.includes('new file') || lowerDiff.includes('created') || diff.includes('--- /dev/null')) {
    return 'feat: add new feature';
  }
  
  if (lowerDiff.includes('fix') || lowerDiff.includes('bug') || lowerDiff.includes('error')) {
    return 'fix: resolve issue';
  }
  
  if (lowerDiff.includes('refactor') || lowerDiff.includes('clean') || lowerDiff.includes('improve')) {
    return 'refactor: improve code structure';
  }
  
  if (lowerDiff.includes('doc') || lowerDiff.includes('readme') || lowerDiff.includes('comment')) {
    return 'docs: update documentation';
  }
  
  if (lowerDiff.includes('style') || lowerDiff.includes('format') || lowerDiff.includes('lint')) {
    return 'style: format code';
  }
  
  if (lowerDiff.includes('test')) {
    return 'test: add or update tests';
  }
  
  if (lowerDiff.includes('config') || lowerDiff.includes('package') || lowerDiff.includes('dependency')) {
    return 'chore: update configuration';
  }
  
  // Default
  return 'chore: update files';
}

/**
 * Generate commit message from staged files
 */
export function generateCommitMessageFromFiles(
  stagedFiles: Array<{ path: string; status: string }>
): string {
  if (stagedFiles.length === 0) {
    return 'chore: no changes';
  }
  
  const extensions = new Set<string>();
  const hasNew = stagedFiles.some(f => f.status.trim() === 'A' || f.status.trim() === 'U');
  const hasDeleted = stagedFiles.some(f => f.status.trim() === 'D');
  const hasModified = stagedFiles.some(f => f.status.trim() === 'M');
  
  for (const file of stagedFiles) {
    const ext = file.path.split('.').pop()?.toLowerCase();
    if (ext) extensions.add(ext);
  }
  
  // Determine type
  let type = 'chore';
  let scope = '';
  let description = '';
  
  if (hasNew && !hasModified && !hasDeleted) {
    type = 'feat';
    description = `add ${stagedFiles.length === 1 ? stagedFiles[0].path.split('/').pop() : `${stagedFiles.length} files`}`;
  } else if (hasDeleted && !hasNew && !hasModified) {
    type = 'chore';
    description = `remove ${stagedFiles.length === 1 ? stagedFiles[0].path.split('/').pop() : `${stagedFiles.length} files`}`;
  } else {
    type = 'chore';
    description = `update ${stagedFiles.length} file${stagedFiles.length > 1 ? 's' : ''}`;
  }
  
  // Add scope based on file types
  if (extensions.has('ts') || extensions.has('tsx')) {
    scope = 'ts';
  } else if (extensions.has('rs')) {
    scope = 'rust';
  } else if (extensions.has('py')) {
    scope = 'py';
  } else if (extensions.has('md')) {
    scope = 'docs';
    type = 'docs';
  }
  
  const scopePart = scope ? `(${scope})` : '';
  return `${type}${scopePart}: ${description}`;
}

/**
 * Generate a detailed code review from a git diff using Groq API
 */
export async function generateCodeReview(diff: string, groqApiKey?: string): Promise<{ score: number; reviewMarkdown: string }> {
  // Trim diff to max 15000 chars to avoid token limits but give enough context
  const trimmedDiff = diff.slice(0, 15000);
  
  const apiKey = groqApiKey || (typeof import.meta !== 'undefined' ? (import.meta as {env?: { VITE_GROQ_API_KEY?: string }}).env?.VITE_GROQ_API_KEY : undefined);
  
  if (!apiKey) {
    return {
      score: 0,
      reviewMarkdown: "⚠️ **Groq API Key is missing.**\n\nPlease configure your Groq API in the Settings to enable AI Auto-Review."
    };
  }

  const systemPrompt = `You are a strict and highly experienced Senior Developer performing a Code Review.
Analyze the provided git diff carefully.

Your output MUST be in Markdown and MUST follow this structure EXACTLY:
SCORE: [Number between 0 and 100 representing code quality]
---
### 🔍 Review Summary
[1-2 sentences summarizing the change]

### 💡 Key Findings
- [Point 1]
- [Point 2]
...

### 🛠️ Suggestions & Improvements
- [Suggestion 1]
- [Suggestion 2]
...
(If there are no suggestions, write "Code looks solid!")
`;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant', // fast and decent enough
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Please review this diff:\n\n\`\`\`diff\n${trimmedDiff}\n\`\`\`` },
        ],
        temperature: 0.2, // Be deterministic regarding formatting
      }),
    });

    if (!response.ok) {
      console.error('Groq API error in code review:', response.status);
      return { score: 0, reviewMarkdown: "⚠️ **Error connecting to Groq API.**\n\nHTTP Status: " + response.status };
    }

    const data: GroqResponse = await response.json();
    const message = data.choices?.[0]?.message?.content?.trim();
    
    if (!message) {
      return { score: 0, reviewMarkdown: "⚠️ **No response received from Groq.**" };
    }

    // Extract score
    let score = 85; // Default score
    const scoreMatch = message.match(/SCORE:\s*(\d+)/i);
    if (scoreMatch && scoreMatch[1]) {
      score = parseInt(scoreMatch[1], 10);
    }
    
    // Clean up message by removing the score prefix
    const reviewMarkdown = message.replace(/SCORE:\s*\d+\s*[-]*\s*/i, '').trim();

    return { score, reviewMarkdown };
  } catch (error) {
    console.error('Failed to generate code review:', error);
    return { score: 0, reviewMarkdown: `⚠️ **Failed to generate review.**\n\n${error}` };
  }
}