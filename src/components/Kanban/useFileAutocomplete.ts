import { useState, useCallback, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'

interface FileEntry {
  name: string
  path: string
  is_dir: boolean
  relativePath?: string
}

export function useFileAutocomplete(workspacePath: string | undefined) {
  const [files, setFiles] = useState<FileEntry[]>([])
  const [showFileSuggestions, setShowFileSuggestions] = useState(false)
  const [selectedFileIndex, setSelectedFileIndex] = useState(0)
  const [atSymbolIndex, setAtSymbolIndex] = useState(-1)

  const fetchFiles = useCallback(async (path: string) => {
    if (!path) return
    try {
      const entries = await invoke<FileEntry[]>('read_directory', { path })
      const allFiles: FileEntry[] = []
      
      const processEntries = async (entries: FileEntry[], relativePath: string = '') => {
        for (const entry of entries) {
          if (entry.is_dir) {
            // Skip hidden directories and common non-code directories
            if (entry.name.startsWith('.') || 
                ['node_modules', 'dist', 'build', '.git', '.next', 'out', 'target', 'vendor'].includes(entry.name)) {
              continue
            }
            try {
              const subEntries = await invoke<FileEntry[]>('read_directory', { path: entry.path })
              await processEntries(subEntries, relativePath ? `${relativePath}/${entry.name}` : entry.name)
            } catch {
              // Skip directories we can't read
            }
          } else if (!entry.name.startsWith('.')) {
            allFiles.push({
              name: entry.name,
              path: entry.path,
              is_dir: false,
              relativePath: relativePath ? `${relativePath}/${entry.name}` : entry.name,
            })
          }
        }
      }
      
      await processEntries(entries, path)
      allFiles.sort((a, b) => (a.relativePath || a.name).localeCompare(b.relativePath || b.name))
      setFiles(allFiles)
    } catch (err) {
      console.error('Failed to fetch files:', err)
      setFiles([])
    }
  }, [])

  useEffect(() => {
    if (workspacePath) {
      fetchFiles(workspacePath)
    }
  }, [workspacePath, fetchFiles])

  const filterFiles = useCallback((query: string): FileEntry[] => {
    if (!query) return files.slice(0, 10)
    const lowerQuery = query.toLowerCase()
    return files
      .filter(f => {
        const relativePath = (f.relativePath || f.name).toLowerCase()
        return relativePath.includes(lowerQuery)
      })
      .sort((a, b) => {
        const aPath = a.relativePath || a.name
        const bPath = b.relativePath || b.name
        const aStartsWith = aPath.toLowerCase().startsWith(lowerQuery)
        const bStartsWith = bPath.toLowerCase().startsWith(lowerQuery)
        if (aStartsWith && !bStartsWith) return -1
        if (!aStartsWith && bStartsWith) return 1
        return aPath.localeCompare(bPath)
      })
      .slice(0, 10)
  }, [files])

  const handleAtDetection = useCallback((value: string, cursorPosition: number) => {
    const textBeforeCursor = value.slice(0, cursorPosition)
    const lastAt = textBeforeCursor.lastIndexOf('@')
    
    if (lastAt !== -1) {
      const textAfterAt = textBeforeCursor.slice(lastAt + 1)
      const hasSpace = textAfterAt.includes(' ') || textAfterAt.includes('\n')
      
      if (!hasSpace && textAfterAt.length <= 50) {
        setAtSymbolIndex(lastAt)
        const filtered = filterFiles(textAfterAt)
        setShowFileSuggestions(filtered.length > 0)
        setSelectedFileIndex(0)
        return
      }
    }
    
    setShowFileSuggestions(false)
    setAtSymbolIndex(-1)
  }, [filterFiles])

  const insertFileReference = useCallback((
    file: FileEntry,
    message: string,
    textareaRef: React.RefObject<HTMLTextAreaElement | null>,
    setMessage: (msg: string) => void
  ) => {
    if (atSymbolIndex === -1) return
    
    const beforeAt = message.slice(0, atSymbolIndex)
    const cursorPos = textareaRef.current?.selectionStart || message.length
    const afterCursor = message.slice(cursorPos)
    
    const newMessage = beforeAt + '@' + file.name + ' ' + afterCursor
    setMessage(newMessage)
    setShowFileSuggestions(false)
    setAtSymbolIndex(-1)
    
    setTimeout(() => {
      if (textareaRef.current) {
        const newPos = atSymbolIndex + file.name.length + 2
        textareaRef.current.focus()
        textareaRef.current.selectionStart = textareaRef.current.selectionEnd = newPos
      }
    }, 0)
  }, [atSymbolIndex])

  return {
    files,
    showFileSuggestions,
    setShowFileSuggestions,
    selectedFileIndex,
    setSelectedFileIndex,
    atSymbolIndex,
    filterFiles,
    handleAtDetection,
    insertFileReference,
  }
}
