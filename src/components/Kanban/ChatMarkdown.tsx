import { memo } from 'react'
import { FileIcon } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

function FileReference({ path }: { path: string }) {
  const filename = path.split('/').pop() || path
  const isLongPath = path.length > 30
  const displayPath = isLongPath 
    ? `.../${filename}` 
    : path
  
  if (!isLongPath) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-app-accent/15 border border-app-accent/30 rounded text-app-accent font-mono text-xs">
        <FileIcon className="w-2.5 h-2.5 flex-shrink-0" />
        {displayPath}
      </span>
    )
  }
  
  return (
    <Tooltip>
      <TooltipTrigger className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-app-accent/15 border border-app-accent/30 rounded text-app-accent font-mono text-xs max-w-[200px] cursor-default">
        <FileIcon className="w-2.5 h-2.5 flex-shrink-0" />
        <span className="truncate">{displayPath}</span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[400px]">
        <code className="text-xs break-all">{path}</code>
      </TooltipContent>
    </Tooltip>
  )
}

export function renderContentWithFileRefs(content: string) {
  const parts = content.split(/(@[\w./\-]+)/g)
  return parts.map((part, idx) => {
    if (part.startsWith('@') && part.length > 1) {
      const path = part.slice(1)
      return <FileReference key={idx} path={path} />
    }
    return <span key={idx}>{part}</span>
  })
}

function MarkdownContent({ content }: { content: string }) {
  // Filter out tool calls and thinking blocks from display
  const filteredContent = content
    .replace(/\[TOOL_EXEC\].*(\n|$)/g, '') // Remove tool execution lines
    .replace(/\[TOOL_RES\].*(\n|$)/g, '') // Remove tool result lines
    .replace(/\[Tool: [^\]]+\]\s*(?=\[Tool:|$)/gi, '') // Remove empty tool calls
    .replace(/\[Tool: [^\]]+\]\s*/gi, '') // Remove tool call markers
    .replace(/<(?:think|thought)>[\s\S]*?(?:<\/(?:think|thought)>|$)/gi, '') // Remove thinking blocks
    .replace(/```thinking[\s\S]*?```/gi, '') // Remove thinking code blocks
    .trim()
  
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ node, className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '');
          const isInline = !match && !className;
          
          if (isInline) {
            return (
              <code className="px-1.5 py-0.5 rounded border-app-border-highlight text-app-accent font-mono text-xs" {...props}>
                {children}
              </code>
            );
          }
          
          return (
            <div className="my-2 rounded-lg overflow-hidden border border-app-border bg-app-panel">
              <pre className="overflow-x-auto p-3 m-0">
                <code className="text-xs font-mono leading-relaxed text-neutral-300 whitespace-pre">{String(children).replace(/\n$/, '')}</code>
              </pre>
            </div>
          );
        },
        a({ href, children }) {
          return (
            <a href={href} className="text-app-accent hover:underline" target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          );
        },
        p({ children }) {
          return <p className="mb-2 last:mb-0 break-words">{children}</p>;
        },
        hr() {
          return <hr className="my-3 border-app-border" />;
        },
        ul({ children }) {
          return <ul className="list-disc list-inside space-y-1 ml-2">{children}</ul>;
        },
        ol({ children }) {
          return <ol className="list-decimal list-inside space-y-1 ml-2">{children}</ol>;
        },
        li({ children }) {
          return <li className="text-neutral-200 break-words">{children}</li>;
        },
      }}
    >
      {filteredContent}
    </ReactMarkdown>
  );
}

// Memoize so only the actively-streaming message re-renders, not the whole list
export const MemoizedMarkdownContent = memo(MarkdownContent)
