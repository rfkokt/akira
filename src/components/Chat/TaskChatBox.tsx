import { useState, useEffect, useRef } from 'react'
import { X, Send, Loader2, Copy, Check } from 'lucide-react'
import { useAIChatStore, useEngineStore } from '@/store'
import type { Task, ChatMessage as DbChatMessage } from '@/types'
import { dbService } from '@/lib/db'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '@/components/ui/button'

function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  return (
    <div className="my-2 rounded-lg overflow-hidden border border-white/10 bg-[#1e1e1e]">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#2d2d2d] border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/80" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
            <div className="w-3 h-3 rounded-full bg-green-500/80" />
          </div>
          <span className="text-xs text-neutral-500 font-mono">
            {language || 'code'}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-green-500" />
              <span className="text-green-500">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Copy</span>
            </>
          )}
        </Button>
      </div>
      <pre className="p-3 overflow-x-auto text-xs font-mono leading-relaxed text-neutral-300">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ node, className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '');
          const isInline = !match && !className;
          
          if (isInline) {
            return (
              <code className="px-1.5 py-0.5 rounded bg-white/10 text-blue-300 font-mono text-xs" {...props}>
                {children}
              </code>
            );
          }
          
          return (
            <CodeBlock
              code={String(children).replace(/\n$/, '')}
              language={match ? match[1] : ''}
            />
          );
        },
        a({ href, children }) {
          return (
            <a href={href} className="text-cyan-400 hover:underline" target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          );
        },
        h1({ children }) {
          return <h1 className="text-lg font-bold text-white mt-2 mb-1">{children}</h1>;
        },
        h2({ children }) {
          return <h2 className="text-base font-semibold text-white mt-2 mb-1">{children}</h2>;
        },
        h3({ children }) {
          return <h3 className="text-sm font-medium text-white mt-1 mb-1">{children}</h3>;
        },
        ul({ children }) {
          return <ul className="list-disc list-inside space-y-1 ml-2">{children}</ul>;
        },
        ol({ children }) {
          return <ol className="list-decimal list-inside space-y-1 ml-2">{children}</ol>;
        },
        li({ children }) {
          return <li className="text-neutral-200">{children}</li>;
        },
        p({ children }) {
          return <p className="mb-2 last:mb-0">{children}</p>;
        },
        blockquote({ children }) {
          return (
            <blockquote className="border-l-2 border-cyan-500/50 pl-3 italic text-neutral-400 my-2">
              {children}
            </blockquote>
          );
        },
        table({ children }) {
          return (
            <table className="w-full border-collapse my-2">
              {children}
            </table>
          );
        },
        th({ children }) {
          return <th className="border border-white/10 px-2 py-1 bg-white/5 text-left">{children}</th>;
        },
        td({ children }) {
          return <td className="border border-white/10 px-2 py-1">{children}</td>;
        },
        hr() {
          return <hr className="border-white/10 my-3" />;
        },
        strong({ children }) {
          return <strong className="font-semibold text-white">{children}</strong>;
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

interface TaskChatBoxProps {
  task: Task;
  isOpen: boolean;
  onClose: () => void;
}

export function TaskChatBox({ task, isOpen, onClose }: TaskChatBoxProps) {
  const [message, setMessage] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const aiChatStore = useAIChatStore()
  const { sendMessage, getMessages, isStreaming, setMessages } = aiChatStore
  const { activeEngine } = useEngineStore()
  
  const taskMessages = getMessages(task.id)
  const isTaskStreaming = isStreaming(task.id)

  useEffect(() => {
    if (!task.id) return
    
    const loadHistory = async () => {
      try {
        const history = await dbService.getChatHistory(task.id)
        if (history && history.length > 0) {
          const existingMessages = getMessages(task.id)
          if (existingMessages.length === 0) {
            const storeMessages = history.map((msg: DbChatMessage) => ({
              id: `db-${msg.id}`,
              taskId: msg.task_id,
              role: msg.role,
              content: msg.content,
              timestamp: new Date(msg.created_at).getTime(),
            }))
            setMessages(task.id, storeMessages)
          }
        }
      } catch (err) {
        console.error('Failed to load chat history:', err)
      }
    }
    
    loadHistory()
  }, [task.id])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [taskMessages, isTaskStreaming])

  const handleSend = async () => {
    if (!message.trim() || !activeEngine) return
    
    const msg = message
    setMessage('')
    
    try {
      await dbService.createChatMessage(task.id, 'user', msg, activeEngine.alias)
    } catch (err) {
      console.error('Failed to save user message:', err)
    }
    
    await sendMessage(task.id, msg)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (!isOpen) return null

  return (
    <div 
      className="fixed z-50 bg-[#1e1e1e] border border-white/10 rounded-lg shadow-2xl bottom-4 right-4 w-[450px] h-[400px]"
    >
      <div className="flex items-center justify-between px-3 py-2 bg-[#252526] border-b border-white/5 rounded-t-lg">
        <div>
          <h3 className="text-xs font-semibold text-white font-geist">
            AI Assistant
          </h3>
          <p className="text-xs text-neutral-500 font-geist truncate max-w-[200px]">
            {task.title}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>

      <div className="px-3 py-1.5 bg-[#1e1e1e] border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${activeEngine ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-xs text-neutral-400 font-geist">
            {activeEngine ? activeEngine.alias : 'No engine selected'}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 h-[calc(100%-110px)]">
        {taskMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <p className="text-xs text-neutral-500 font-geist">
              Start a conversation about this task
            </p>
            <p className="text-xs text-neutral-600 font-geist mt-1">
              AI will help you implement "{task.title}"
            </p>
          </div>
        ) : (
          taskMessages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex gap-2 ${
                msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'
              }`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-md'
                    : msg.role === 'system'
                      ? 'bg-yellow-500/10 text-yellow-200 border border-yellow-500/20 rounded-bl-md'
                      : 'bg-[#252526] text-neutral-200 border border-white/5 rounded-bl-md'
                }`}
              >
                {msg.role === 'assistant' ? (
                  <div className="text-sm leading-relaxed">
                    <MarkdownContent content={msg.content} />
                  </div>
                ) : (
                  <pre className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</pre>
                )}
                {msg.role === 'assistant' && isTaskStreaming && idx === taskMessages.length - 1 && (
                  <span className="inline-flex ml-1">
                    <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce ml-0.5" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce ml-0.5" style={{ animationDelay: '300ms' }} />
                  </span>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-3 bg-[#252526] border-t border-white/5 rounded-b-lg">
        <div className="flex items-end gap-2">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={activeEngine ? "Ask AI about this task..." : "Select an AI engine first"}
            disabled={!activeEngine || isTaskStreaming}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm bg-[#1e1e1e] text-white placeholder-neutral-600 border border-white/10 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 resize-none transition-all"
            rows={1}
            style={{ minHeight: '40px', maxHeight: '100px' }}
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!message.trim() || !activeEngine || isTaskStreaming}
            className="bg-gradient-to-br from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50 shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30"
          >
            {isTaskStreaming ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
