import { useState, useEffect, useRef, memo, useCallback } from 'react'
import { X, Send, Loader2, Copy, Check, MessageSquare } from 'lucide-react'
import { useAIChatStore, useEngineStore, useConfigStore } from '@/store'
import { useImageAnalysis, buildMessageWithImageAnalysis } from '@/hooks/useImageAnalysis'
import type { Task, ChatMessage as DbChatMessage } from '@/types'
import type { ChatMessage } from '@/store/aiChatStore'
import { dbService } from '@/lib/db'
import { ImageInput, processPastedImages, type ImageAttachment } from '@/components/shared/ImageInput'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '@/components/ui/button'

const EMPTY_ARRAY: ChatMessage[] = []

const CodeBlock = memo(function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);
  
  return (
    <div className="my-3 rounded-xl overflow-hidden border border-app-border/40 bg-app-bg shadow-md">
      <div className="flex items-center justify-between px-3 py-1.5 bg-app-sidebar/40 border-b border-app-border/40">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
            <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
          </div>
          <span className="text-[10px] text-app-text-muted font-mono tracking-wider uppercase ml-1">
            {language || 'code'}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="h-6 px-2 text-[10px] text-app-text-muted hover:text-white"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-green-400 mr-1" />
              <span className="text-green-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3 mr-1" />
              <span>Copy</span>
            </>
          )}
        </Button>
      </div>
      <pre className="p-3 overflow-x-auto text-[11px] font-mono leading-relaxed text-app-text">
        <code>{code}</code>
      </pre>
    </div>
  );
});

const MarkdownContent = memo(function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ node, className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '');
          const isInline = !match && !className;
          
          if (isInline) {
            return (
              <code className="px-1.5 py-0.5 rounded bg-app-accent/10 text-app-accent font-mono text-[11px] border border-app-accent/20" {...props}>
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
            <a 
              href={href} 
              className="text-app-accent hover:text-app-accent-hover hover:underline transition-colors cursor-pointer" 
              onClick={async (e) => {
                e.preventDefault();
                if (href) {
                  const { open } = await import('@tauri-apps/plugin-shell');
                  await open(href);
                }
              }}
            >
              {children}
            </a>
          );
        },
        h1({ children }) {
          return <h1 className="text-lg font-bold text-app-text mt-3 mb-2">{children}</h1>;
        },
        h2({ children }) {
          return <h2 className="text-base font-semibold text-app-text mt-3 mb-1.5">{children}</h2>;
        },
        h3({ children }) {
          return <h3 className="text-sm font-medium text-app-text mt-2 mb-1">{children}</h3>;
        },
        ul({ children }) {
          return <ul className="list-disc list-inside space-y-1 ml-2 text-app-text/90">{children}</ul>;
        },
        ol({ children }) {
          return <ol className="list-decimal list-inside space-y-1 ml-2 text-app-text/90">{children}</ol>;
        },
        li({ children }) {
          return <li className="text-app-text/90">{children}</li>;
        },
        p({ children }) {
          return <p className="mb-2.5 last:mb-0 leading-relaxed text-app-text/90 break-words overflow-wrap-anywhere">{children}</p>;
        },
        blockquote({ children }) {
          return (
            <blockquote className="border-l-2 border-app-accent/50 bg-app-accent/5 pl-3 py-1.5 pr-2 rounded-r italic text-app-text-muted my-3 shadow-inner">
              {children}
            </blockquote>
          );
        },
        table({ children }) {
          return (
            <div className="overflow-x-auto my-3 border border-app-border/50 rounded-lg">
              <table className="w-full border-collapse text-left">
                {children}
              </table>
            </div>
          );
        },
        th({ children }) {
          return <th className="border-b border-app-border/60 px-3 py-2 bg-app-sidebar/40 font-semibold text-app-text">{children}</th>;
        },
        td({ children }) {
          return <td className="border-b border-app-border/30 px-3 py-2 text-app-text/90">{children}</td>;
        },
        hr() {
          return <hr className="border-app-border/50 my-4" />;
        },
        strong({ children }) {
          return <strong className="font-semibold text-app-text">{children}</strong>;
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
});

interface TaskChatBoxProps {
  task: Task;
  isOpen: boolean;
  onClose: () => void;
}

interface MessageItemProps {
  msg: {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
  };
  currentStreamingId?: string;
}

const MessageItem = memo(function MessageItem({ msg, currentStreamingId }: MessageItemProps) {
  return (
    <div
      className={`flex flex-col gap-1 ${
        msg.role === 'user' ? 'items-end' : 'items-start'
      }`}
    >
      <div className={`px-4 py-3 max-w-[90%] rounded-2xl shadow-sm border ${
        msg.role === 'user'
          ? 'bg-app-accent/15 border border-app-accent/20 text-blue-50 rounded-tr-sm'
          : msg.role === 'system'
            ? 'bg-yellow-500/10 text-yellow-200 border-yellow-500/20 rounded-bl-sm'
            : 'bg-app-bg/50 border-app-border text-app-text rounded-tl-sm'
      }`}>
        {msg.role === 'assistant' ? (
          <div className="text-[13px] leading-relaxed min-w-0 overflow-hidden">
            <MarkdownContent content={msg.content} />
            {currentStreamingId === msg.id && (
              <span className="inline-flex mt-1">
                <span className="w-1.5 h-1.5 bg-app-accent rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-app-accent rounded-full animate-bounce ml-1" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-app-accent rounded-full animate-bounce ml-1" style={{ animationDelay: '300ms' }} />
              </span>
            )}
          </div>
        ) : (
          <pre className="whitespace-pre-wrap break-all text-[13px] leading-relaxed font-geist">{msg.content}</pre>
        )}
      </div>
    </div>
  );
});

const ChatInput = memo(function ChatInput({ 
  onSend, 
  isStreaming, 
  hasEngine,
  placeholder,
  hasApiKey: hasApiKeyProp
}: { 
  onSend: (msg: string) => void; 
  isStreaming: boolean;
  hasEngine: boolean;
  placeholder: string;
  hasApiKey: boolean;
}) {
  const [message, setMessage] = useState('')
  const [attachedImages, setAttachedImages] = useState<ImageAttachment[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { isAnalyzing, analyzeImages, hasApiKey: hasApiKeyHook } = useImageAnalysis()
  
  // Use prop if provided, otherwise use hook value
  const hasApiKey = hasApiKeyProp ?? hasApiKeyHook
  
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`
    }
  }, [message])

  const handleSend = useCallback(async () => {
    const hasContent = message.trim() || attachedImages.length > 0
    if (!hasContent || isAnalyzing || isUploading) return
    
    const currentImages = [...attachedImages]
    const currentMessage = message.trim()
    
    // Clear immediately
    setMessage('')
    setAttachedImages([])
    
    if (currentImages.length > 0) {
      if (!hasApiKey) {
        // No API key - send with error message
        const errorMsg = `[ERROR: Cannot analyze images - Gemini API key not configured. Please add it in Settings → Image Analysis.]\n\n${currentMessage || '(image attached)'}`
        onSend(errorMsg)
        return
      }
      
      // Analyze images
      setIsUploading(true)
      try {
        const result = await analyzeImages(currentImages)
        
        let finalMessage: string
        if (result.analysis) {
          finalMessage = buildMessageWithImageAnalysis(currentMessage || 'Analyze this image', result.analysis)
        } else {
          const err = result.error || 'Unknown error'
          finalMessage = `[ERROR: Image analysis failed - ${err}]\n\n${currentMessage || '(image attached)'}`
        }
        
        onSend(finalMessage)
      } finally {
        setIsUploading(false)
      }
    } else {
      // No images, just text
      onSend(currentMessage)
    }
  }, [message, attachedImages, isAnalyzing, isUploading, hasApiKey, analyzeImages, onSend])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const handled = processPastedImages(e.nativeEvent, attachedImages, setAttachedImages, 3)
    if (handled) {
      e.preventDefault()
    }
  }, [attachedImages])

  const isDisabled = !hasEngine || isStreaming || isAnalyzing || isUploading

  return (
    <div className="shrink-0 p-3 bg-app-sidebar/80 backdrop-blur-md border-t border-app-border/60">
      {(isUploading || isAnalyzing) && (
        <div className="mb-2 flex items-center gap-2 text-xs text-app-accent">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Analyzing image{attachedImages.length > 1 ? 's' : ''}...</span>
        </div>
      )}
      
      {attachedImages.length > 0 && !isUploading && !isAnalyzing && (
        <div className="mb-2">
          <ImageInput
            images={attachedImages}
            onImagesChange={setAttachedImages}
            maxImages={3}
            disabled={isDisabled}
          />
          {!hasApiKey && (
            <p className="text-[10px] text-yellow-500 mt-1">
              ⚠️ Set Gemini API key in Settings → Image Analysis to analyze images
            </p>
          )}
        </div>
      )}
      
      <div className="flex items-end gap-2.5">
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={placeholder}
          disabled={isDisabled}
          className="flex-1 px-4 py-3 rounded-xl text-sm bg-[#1e1e1e] text-white placeholder-neutral-500 border border-app-border focus:outline-none focus:border-app-accent/70 focus:ring-1 focus:ring-app-accent/30 resize-none transition-all shadow-inner custom-scrollbar"
          rows={1}
          style={{ minHeight: '44px', maxHeight: '120px' }}
        />
        <div className="flex items-center gap-1.5 shrink-0">
          {attachedImages.length === 0 && !isUploading && !isAnalyzing && (
            <ImageInput
              images={attachedImages}
              onImagesChange={setAttachedImages}
              maxImages={3}
              disabled={isDisabled}
            />
          )}
          <Button
            size="icon"
            onClick={handleSend}
            disabled={(!message.trim() && attachedImages.length === 0) || isDisabled}
            className="w-11 h-11 shrink-0 rounded-xl bg-app-accent hover:bg-app-accent-hover disabled:opacity-50 shadow-[0_0_15px_var(--app-accent-glow)] transition-all disabled:shadow-none"
          >
            {isStreaming || isAnalyzing || isUploading ? (
              <Loader2 className="w-5 h-5 animate-spin text-white" />
            ) : (
              <Send className="w-4 h-4 text-white ml-0.5" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
});

export function TaskChatBox({ task, isOpen, onClose }: TaskChatBoxProps) {
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { sendMessage, setMessages, streamingMessageId } = useAIChatStore()
  const taskMessages = useAIChatStore(
    useCallback(state => state.messages[task.id] ?? EMPTY_ARRAY, [task.id])
  )
  const { activeEngine } = useEngineStore()
  const config = useConfigStore(state => state.config)
  const hasApiKey = !!config?.google_api_key
  
  const currentStreamingId = streamingMessageId[task.id]
  const isTaskStreaming = useAIChatStore(
    useCallback(state => state.streamingMessageId[task.id] != null, [task.id])
  )

  useEffect(() => {
    if (!task.id || historyLoaded) return
    
    const loadHistory = async () => {
      try {
        const history = await dbService.getChatHistory(task.id)
        console.log('[TaskChatBox] Loaded history from DB:', history.length, 'messages')
        if (history && history.length > 0) {
          const existingMessages = useAIChatStore.getState().messages[task.id] || []
          console.log('[TaskChatBox] Existing messages in store:', existingMessages.length)
          if (existingMessages.length === 0) {
            const storeMessages = history.map((msg: DbChatMessage) => ({
              id: `db-${msg.id}`,
              taskId: msg.task_id,
              role: msg.role as 'user' | 'assistant' | 'system',
              content: msg.content,
              timestamp: new Date(msg.created_at).getTime(),
            }))
            console.log('[TaskChatBox] Setting messages to store:', storeMessages.length)
            setMessages(task.id, storeMessages)
          }
        }
        setHistoryLoaded(true)
      } catch (err) {
        console.error('Failed to load chat history:', err)
        setHistoryLoaded(true)
      }
    }
    
    loadHistory()
  }, [task.id, historyLoaded, setMessages])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [taskMessages, isTaskStreaming])

  const handleSend = useCallback(async (msg: string) => {
    if (!activeEngine) return
    
    try {
      await dbService.createChatMessage(task.id, 'user', msg, activeEngine.alias)
      console.log('[TaskChatBox] Saved user message to DB')
    } catch (err) {
      console.error('Failed to save user message:', err)
    }
    
    await sendMessage(task.id, msg)
  }, [task.id, activeEngine, sendMessage])

  if (!isOpen) return null

  return (
    <div 
      className="fixed z-[60] bg-app-panel/95 backdrop-blur-2xl border border-app-border/60 rounded-2xl shadow-2xl overflow-hidden shadow-black/40 bottom-6 right-6 w-[450px] h-[550px] flex flex-col transition-all"
    >
      <div className="flex items-center justify-between px-4 py-3 bg-app-sidebar/40 border-b border-app-border/40 select-none">
        <div>
          <h3 className="text-sm font-semibold text-app-text font-geist tracking-wide">
            Task AI Assistant
          </h3>
          <p className="text-xs text-app-text-muted font-geist truncate max-w-[280px] mt-0.5">
            {task.title}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-7 w-7 rounded-lg text-app-text-muted hover:text-red-400 hover:bg-red-400/10"
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>

      <div className="px-4 py-2 bg-app-sidebar/20 border-b border-app-border/30">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${activeEngine ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.5)]' : 'bg-red-400'}`} />
          <span className="text-[10px] text-app-text-muted font-mono uppercase tracking-wider">
            {activeEngine ? activeEngine.alias : 'No engine selected'}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar min-h-0">
        {taskMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center mt-10">
            <div className="w-16 h-16 bg-app-accent/10 rounded-full flex items-center justify-center mb-4 shadow-[0_0_20px_var(--app-accent-glow)]">
              <MessageSquare className="w-7 h-7 text-app-accent opacity-60" />
            </div>
            <p className="text-sm font-medium text-app-text font-geist mb-1">
              {task.status === 'review' ? 'Request Revisions' : 'Start a conversation'}
            </p>
            <p className="text-xs text-app-text-muted/70 font-geist max-w-[220px] leading-relaxed">
              {task.status === 'review' 
                ? 'Tell the AI what to change — it will directly modify the code'
                : `AI is ready to help you implement "${task.title}"`}
            </p>
          </div>
        ) : (
          taskMessages.map((msg, idx) => (
            <MessageItem key={msg.id || idx} msg={msg} currentStreamingId={currentStreamingId ?? undefined} />
          ))
        )}
        <div ref={messagesEndRef} className="h-2" />
      </div>

      <ChatInput 
        onSend={handleSend}
        isStreaming={isTaskStreaming}
        hasEngine={!!activeEngine}
        placeholder={activeEngine ? (task.status === 'review' ? "Describe what to revise..." : "Ask AI about this task...") : "Select an AI engine first"}
        hasApiKey={hasApiKey}
      />
    </div>
  )
}
