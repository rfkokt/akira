'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { FileCode, Loader2 } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'

interface FileEntry {
  name: string
  path: string
  is_dir: boolean
}

interface DescriptionWithFileTagProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
  workspacePath?: string
}

export function DescriptionWithFileTag({
  value,
  onChange,
  placeholder = 'Enter task description...',
  rows = 3,
  workspacePath,
}: DescriptionWithFileTagProps) {
  const [files, setFiles] = useState<FileEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [suggestions, setSuggestions] = useState<FileEntry[]>([])
  const [cursorPosition, setCursorPosition] = useState(0)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const suggestionRefs = useRef<(HTMLButtonElement | null)[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const fetchFiles = useCallback(async (path: string) => {
    if (!path) return
    setLoading(true)
    try {
      const entries = await invoke<FileEntry[]>('read_directory', { path })
      const fileList = entries
        .filter(e => !e.is_dir && !e.name.startsWith('.'))
        .map(e => ({
          name: e.name,
          path: e.path,
          is_dir: false,
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
      setFiles(fileList)
    } catch (err) {
      console.error('Failed to fetch files:', err)
      setFiles([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (workspacePath) {
      fetchFiles(workspacePath)
    }
  }, [workspacePath, fetchFiles])

  const getAtSymbolPosition = (text: string): number => {
    const lastAt = text.lastIndexOf('@')
    if (lastAt === -1) return -1
    
    const afterAt = text.substring(lastAt + 1)
    if (afterAt.includes(' ') || afterAt.includes('\n')) return -1
    
    return lastAt
  }

  const filterFiles = (query: string): FileEntry[] => {
    if (!query) return files.slice(0, 10)
    const lowerQuery = query.toLowerCase()
    return files
      .filter(f => f.name.toLowerCase().includes(lowerQuery))
      .slice(0, 10)
  }

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value
    const newCursorPosition = e.target.selectionStart
    onChange(newValue)
    setCursorPosition(newCursorPosition)

    const textBeforeCursor = newValue.substring(0, newCursorPosition)
    const atPosition = getAtSymbolPosition(textBeforeCursor)

    if (atPosition !== -1) {
      const query = textBeforeCursor.substring(atPosition + 1)
      const filtered = filterFiles(query)
      setSuggestions(filtered)
      setShowSuggestions(filtered.length > 0)
      setSelectedIndex(0)
    } else {
      setShowSuggestions(false)
      setSelectedIndex(0)
    }
  }

  const handleSelectFile = (file: FileEntry) => {
    const textBeforeCursor = value.substring(0, cursorPosition)
    const atPosition = getAtSymbolPosition(textBeforeCursor)

    if (atPosition !== -1) {
      const beforeAt = value.substring(0, atPosition)
      const afterCursor = value.substring(cursorPosition)
      const newValue = `${beforeAt}@${file.name}${afterCursor}`
      onChange(newValue)
      setShowSuggestions(false)

      setTimeout(() => {
        const newCursorPos = atPosition + file.name.length + 2
        if (textareaRef.current) {
          textareaRef.current.focus()
          textareaRef.current.setSelectionRange(newCursorPos, newCursorPos)
        }
      }, 0)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        const newIndex = (selectedIndex + 1) % suggestions.length
        setSelectedIndex(newIndex)
        suggestionRefs.current[newIndex]?.scrollIntoView({ block: 'nearest' })
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        const newIndex = selectedIndex === 0 ? suggestions.length - 1 : selectedIndex - 1
        setSelectedIndex(newIndex)
        suggestionRefs.current[newIndex]?.scrollIntoView({ block: 'nearest' })
      } else if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault()
        handleSelectFile(suggestions[selectedIndex])
      } else if (e.key === 'Escape') {
        setShowSuggestions(false)
      }
    }
  }

  return (
    <div className="relative">
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          className="w-full px-3 py-2 rounded text-sm bg-[#3c3c3c] text-white placeholder-white/40 border border-white/10 focus:outline-none focus:border-[#0e639c] font-geist resize-none"
          rows={rows}
          placeholder={placeholder}
        />
        
        {loading && (
          <div className="absolute right-2 top-2">
            <Loader2 className="w-4 h-4 animate-spin text-neutral-500" />
          </div>
        )}
      </div>

      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-[#2d2d2d] border border-white/10 rounded-lg shadow-xl overflow-hidden max-h-60 overflow-y-auto">
          <div className="px-2 py-1.5 text-[10px] text-neutral-500 border-b border-white/5 font-geist">
            File references (↑↓ to navigate, Enter/Tab to insert)
          </div>
          {suggestions.map((file, index) => (
            <button
              key={file.path}
              ref={(el) => { suggestionRefs.current[index] = el }}
              type="button"
              onClick={() => handleSelectFile(file)}
              onMouseEnter={() => setSelectedIndex(index)}
              className={`w-full px-3 py-1.5 text-left text-xs flex items-center gap-2 font-geist transition-colors ${
                index === selectedIndex 
                  ? 'bg-[#094771] text-white' 
                  : 'hover:bg-[#094771]/50 text-neutral-300'
              }`}
            >
              <FileCode className="w-3.5 h-3.5 text-[#0e639c] shrink-0" />
              <span className="truncate">{file.name}</span>
              <span className="text-neutral-500 text-[10px] truncate ml-auto">
                {file.path.replace(workspacePath || '', '')}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
