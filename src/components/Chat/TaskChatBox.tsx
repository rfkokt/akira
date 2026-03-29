import { useState, useEffect, useRef } from 'react'
import { X, Send, Bot, Loader2, Terminal, Maximize2, Minimize2 } from 'lucide-react'
import { useAIChatStore, useEngineStore } from '@/store'
import type { Task } from '@/types'
import { marked } from 'marked'

interface TaskChatBoxProps {
  task: Task;
  isOpen: boolean;
  onClose: () => void;
}

// Simple markdown renderer component
function MarkdownContent({ content }: { content: string }) {
  const html = marked.parse(content, { async: false }) as string;
  
  return (
    <div 
      className="prose prose-invert prose-xs max-w-none"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function TaskChatBox({ task, isOpen, onClose }: TaskChatBoxProps) {
  const [message, setMessage] = useState('')
  const [isExpanded, setIsExpanded] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const aiChatStore = useAIChatStore()
  const { sendMessage, getMessages, isStreaming } = aiChatStore
  const { activeEngine } = useEngineStore()
  
  const taskMessages = getMessages(task.id)
  const isTaskStreaming = isStreaming(task.id)

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [taskMessages, isTaskStreaming])

  const handleSend = async () => {
    if (!message.trim() || !activeEngine) return
    
    const msg = message
    setMessage('')
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
      className={`fixed z-50 bg-[#1e1e1e] border border-white/10 rounded-lg shadow-2xl transition-all ${
        isExpanded 
          ? 'bottom-4 right-4 w-[800px] h-[600px]' 
          : 'bottom-4 right-4 w-[450px] h-[400px]'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#252526] border-b border-white/5 rounded-t-lg">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-[#0e639c]" />
          <div>
            <h3 className="text-xs font-semibold text-white font-geist">
              AI Assistant
            </h3>
            <p className="text-[10px] text-neutral-500 font-geist truncate max-w-[200px]">
              {task.title}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 rounded text-neutral-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded text-neutral-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Engine Status */}
      <div className="px-3 py-1.5 bg-[#1e1e1e] border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full ${activeEngine ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-[10px] text-neutral-400 font-geist">
            {activeEngine ? activeEngine.alias : 'No engine selected'}
          </span>
          {isTaskStreaming && (
            <span className="text-[10px] text-[#0e639c] font-geist flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              Thinking...
            </span>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 h-[calc(100%-110px)]">
        {taskMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Bot className="w-10 h-10 text-neutral-600 mb-2" />
            <p className="text-xs text-neutral-500 font-geist">
              Start a conversation about this task
            </p>
            <p className="text-[10px] text-neutral-600 font-geist mt-1">
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
              <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                msg.role === 'user' 
                  ? 'bg-[#0e639c]' 
                  : msg.role === 'system'
                    ? 'bg-yellow-500/20'
                    : 'bg-purple-500/20'
              }`}>
                {msg.role === 'user' ? (
                  <span className="text-[10px] text-white font-geist">You</span>
                ) : msg.role === 'system' ? (
                  <Terminal className="w-3 h-3 text-yellow-500" />
                ) : (
                  <Bot className="w-3 h-3 text-purple-400" />
                )}
              </div>
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-xs font-geist ${
                  msg.role === 'user'
                    ? 'bg-[#0e639c] text-white'
                    : msg.role === 'system'
                      ? 'bg-yellow-500/10 text-yellow-200 border border-yellow-500/20'
                      : 'bg-[#2d2d2d] text-neutral-200'
                }`}
              >
                {msg.role === 'assistant' ? (
                  <div className="prose prose-invert prose-xs max-w-none">
                    <MarkdownContent content={msg.content} />
                  </div>
                ) : (
                  <pre className="whitespace-pre-wrap font-geist text-[11px]">{msg.content}</pre>
                )}
                {msg.role === 'assistant' && isTaskStreaming && idx === taskMessages.length - 1 && (
                  <span className="inline-block w-1.5 h-3 bg-[#0e639c] ml-1 animate-pulse" />
                )}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="absolute bottom-0 left-0 right-0 p-3 bg-[#252526] border-t border-white/5 rounded-b-lg">
        <div className="flex items-center gap-2">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={activeEngine ? "Ask AI about this task..." : "Select an AI engine first"}
            disabled={!activeEngine || isTaskStreaming}
            className="flex-1 px-3 py-2 rounded text-xs bg-[#1e1e1e] text-white placeholder-neutral-600 border border-white/10 focus:outline-none focus:border-[#0e639c] font-geist resize-none"
            rows={1}
            style={{ minHeight: '32px', maxHeight: '80px' }}
          />
          <button
            onClick={handleSend}
            disabled={!message.trim() || !activeEngine || isTaskStreaming}
            className="p-2 rounded bg-[#0e639c] hover:bg-[#1177bb] disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
          >
            {isTaskStreaming ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
