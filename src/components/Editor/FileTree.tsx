import { useState, useCallback, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Folder, FolderOpen, File, ChevronRight, ChevronDown, FolderOpenDot, Search, X, FileSearch, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface FileEntry {
  name: string
  path: string
  is_dir: boolean
  size?: number
}

interface TreeNode extends FileEntry {
  children?: TreeNode[]
  isLoaded?: boolean
}

interface FileTreeProps {
  rootPath: string
  rootName?: string
  onFileSelect?: (path: string) => void
  selectedPath?: string
}

interface SearchResult {
  path: string
  name: string
  relative_path: string
  line_number?: number
  line_content?: string
  match_start?: number
  match_end?: number
}

type SearchMode = 'filename' | 'content'

export function FileTree({ rootPath, rootName, onFileSelect, selectedPath }: FileTreeProps) {
  const [treeData, setTreeData] = useState<TreeNode[]>([])
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [searchMode, setSearchMode] = useState<SearchMode>('filename')
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const loadDirectory = useCallback(async (path: string): Promise<FileEntry[]> => {
    try {
      const result = await invoke<FileEntry[]>('read_directory', { path })
      return result
    } catch (error) {
      console.error('Failed to read directory:', error)
      return []
    }
  }, [])

  useEffect(() => {
    if (!rootPath) {
      setTreeData([])
      setExpandedDirs(new Set())
      return
    }

    const loadRoot = async () => {
      const entries = await loadDirectory(rootPath)
      setTreeData(entries.map(e => ({ ...e })))
      setExpandedDirs(new Set([rootPath]))
    }

    loadRoot()
  }, [rootPath, loadDirectory])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault()
        setShowSearch(prev => !prev)
        setTimeout(() => searchInputRef.current?.focus(), 100)
      }
      if (e.key === 'Escape' && showSearch) {
        setShowSearch(false)
        setSearchQuery('')
        setSearchResults([])
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showSearch])

  const performSearch = useCallback(async (query: string, mode: SearchMode) => {
    if (!rootPath || !query.trim()) {
      setSearchResults([])
      return
    }

    setIsSearching(true)
    try {
      const command = mode === 'filename' ? 'search_files' : 'search_in_files'
      const results = await invoke<SearchResult[]>(command, {
        rootPath,
        query: query.trim()
      })
      setSearchResults(results)
    } catch (error) {
      console.error('Search failed:', error)
      setSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }, [rootPath])

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    if (searchQuery.trim()) {
      searchTimeoutRef.current = setTimeout(() => {
        performSearch(searchQuery, searchMode)
      }, 200)
    } else {
      setSearchResults([])
    }

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [searchQuery, searchMode, performSearch])

  const toggleDir = async (node: TreeNode) => {
    if (!node.is_dir) {
      onFileSelect?.(node.path)
      return
    }

    const newExpanded = new Set(expandedDirs)
    
    if (newExpanded.has(node.path)) {
      newExpanded.delete(node.path)
    } else {
      newExpanded.add(node.path)
      
      if (!node.isLoaded && !loadingDirs.has(node.path)) {
        setLoadingDirs(prev => new Set(prev).add(node.path))
        const children = await loadDirectory(node.path)
        setTreeData(prev => updateNodeChildren(prev, node.path, children))
        setLoadingDirs(prev => {
          const next = new Set(prev)
          next.delete(node.path)
          return next
        })
      }
    }
    
    setExpandedDirs(newExpanded)
  }

  const updateNodeChildren = (nodes: TreeNode[], targetPath: string, children: FileEntry[]): TreeNode[] => {
    return nodes.map(node => {
      if (node.path === targetPath) {
        return {
          ...node,
          children: children.map(c => ({ ...c })),
          isLoaded: true
        }
      }
      if (node.children) {
        return {
          ...node,
          children: updateNodeChildren(node.children, targetPath, children)
        }
      }
      return node
    })
  }

  const formatSize = (bytes?: number) => {
    if (bytes === undefined) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const getFileIcon = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase()
    switch (ext) {
      case 'js':
      case 'ts':
      case 'jsx':
      case 'tsx':
        return <File className="w-4 h-4 text-cyan-400" />
      case 'json':
        return <File className="w-4 h-4 text-yellow-500" />
      case 'md':
        return <File className="w-4 h-4 text-neutral-300" />
      case 'css':
      case 'scss':
        return <File className="w-4 h-4 text-purple-400" />
      case 'html':
        return <File className="w-4 h-4 text-orange-500" />
      case 'rs':
        return <File className="w-4 h-4 text-orange-300" />
      case 'py':
        return <File className="w-4 h-4 text-blue-400" />
      default:
        return <File className="w-4 h-4 text-neutral-500" />
    }
  }

  const highlightMatch = (text: string, start?: number, end?: number) => {
    if (start === undefined || end === undefined) {
      return <span className="text-neutral-300">{text}</span>
    }
    
    const before = text.slice(0, start)
    const match = text.slice(start, end)
    const after = text.slice(end)
    
    return (
      <span className="text-neutral-300">
        {before}
        <span className="bg-app-accent/30 text-app-accent rounded px-0.5">{match}</span>
        {after}
      </span>
    )
  }

  const handleResultClick = (result: SearchResult) => {
    onFileSelect?.(result.path)
    setShowSearch(false)
    setSearchQuery('')
    setSearchResults([])
  }

  const renderNode = (node: TreeNode, depth: number = 0) => {
    const isExpanded = expandedDirs.has(node.path)
    const isSelected = selectedPath === node.path
    const isLoading = loadingDirs.has(node.path)
    const paddingLeft = depth * 12 + 12

    return (
      <div key={node.path}>
        <Button
          variant="ghost"
          className={`w-full justify-start h-auto py-1 text-left group transition-none rounded-none h-7 ${isSelected ? 'bg-white/10 text-white' : 'text-neutral-400 hover:bg-white/5 hover:text-neutral-200'}`}
          style={{ paddingLeft: `${paddingLeft}px` }}
          onClick={() => toggleDir(node)}
        >
          {node.is_dir && (
            <span className="text-neutral-500 w-3 flex-shrink-0">
              {isLoading ? (
                <div className="w-3 h-3 border-2 border-neutral-600 border-t-transparent rounded-full animate-spin" />
              ) : isExpanded ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
            </span>
          )}
          {!node.is_dir && <span className="w-3 flex-shrink-0" />}
          {node.is_dir ? (
            isExpanded ? (
              <FolderOpenDot className="w-4 h-4 text-app-accent" />
            ) : (
              <Folder className="w-4 h-4 text-app-accent" />
            )
          ) : (
            getFileIcon(node.name)
          )}
          <span
            className={`flex-1 truncate text-xs font-geist ${
              isSelected
                ? 'text-white font-medium'
                : node.is_dir
                ? 'text-neutral-300 group-hover:text-neutral-200'
                : 'text-neutral-400 group-hover:text-neutral-300'
            }`}
            title={node.name}
          >
            {node.name}
          </span>
          {!node.is_dir && node.size !== undefined && (
            <span className="text-xs text-neutral-600 font-geist pr-2">
              {formatSize(node.size)}
            </span>
          )}
        </Button>
        
        {node.is_dir && isExpanded && node.children && (
          <div>
            {node.children.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  const isLoading = loadingDirs.size > 0 && treeData.length === 0

  return (
    <div className="flex flex-col h-full bg-transparent border-r border-app-border">
      {/* Header */}
      <div className="px-3 py-2 border-b border-app-border flex items-center justify-between">
        <span className="text-xs font-medium text-app-text-muted font-geist uppercase tracking-widest">
          Explorer
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 p-0 text-neutral-500 hover:text-neutral-300 hover:bg-white/5"
          onClick={() => {
            setShowSearch(prev => !prev)
            if (!showSearch) {
              setTimeout(() => searchInputRef.current?.focus(), 100)
            }
          }}
          title="Search files (Cmd/Ctrl+P)"
        >
          <Search className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Search Panel */}
      {showSearch && (
        <div className="border-b border-app-border p-2 space-y-2">
          {/* Mode Toggle */}
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              className={`flex-1 h-6 text-xs justify-center ${
                searchMode === 'filename' 
                  ? 'bg-app-accent/20 text-app-accent' 
                  : 'text-neutral-500 hover:text-neutral-300 hover:bg-white/5'
              }`}
              onClick={() => {
                setSearchMode('filename')
                setSearchResults([])
                if (searchQuery.trim()) {
                  performSearch(searchQuery, 'filename')
                }
              }}
            >
              <FileSearch className="w-3 h-3 mr-1" />
              Filename
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={`flex-1 h-6 text-xs justify-center ${
                searchMode === 'content' 
                  ? 'bg-app-accent/20 text-app-accent' 
                  : 'text-neutral-500 hover:text-neutral-300 hover:bg-white/5'
              }`}
              onClick={() => {
                setSearchMode('content')
                setSearchResults([])
                if (searchQuery.trim()) {
                  performSearch(searchQuery, 'content')
                }
              }}
            >
              <Search className="w-3 h-3 mr-1" />
              Content
            </Button>
          </div>
          
          {/* Search Input */}
          <div className="relative">
            <input
              ref={searchInputRef}
              type="text"
              placeholder={searchMode === 'filename' ? 'Search files...' : 'Search in files...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-7 px-2 pr-7 text-xs bg-app-bg border border-app-border rounded 
                         text-neutral-200 placeholder-neutral-500
                         focus:outline-none focus:border-app-accent focus:ring-1 focus:ring-app-accent/30"
            />
            {isSearching && (
              <Loader2 className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 text-neutral-500 animate-spin" />
            )}
            {searchQuery && !isSearching && (
              <button
                onClick={() => {
                  setSearchQuery('')
                  setSearchResults([])
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="max-h-64 overflow-auto border border-app-border rounded bg-app-bg/50">
              {searchResults.map((result, idx) => (
                <Button
                  key={`${result.path}-${result.line_number || idx}`}
                  variant="ghost"
                  className="w-full justify-start h-auto py-1.5 px-2 rounded-none"
                  onClick={() => handleResultClick(result)}
                >
                  <div className="flex flex-col items-start w-full min-w-0">
                    <div className="flex items-center gap-1.5 w-full min-w-0">
                      {getFileIcon(result.name)}
                      <span className="text-xs text-neutral-300 truncate flex-1">
                        {result.relative_path}
                      </span>
                    </div>
                    {result.line_content && (
                      <div className="w-full pl-5 mt-0.5">
                        <div className="flex items-start gap-1">
                          <span className="text-xs text-neutral-600 font-mono flex-shrink-0">
                            {result.line_number}:
                          </span>
                          <span className="text-xs text-neutral-500 truncate font-mono">
                            {highlightMatch(result.line_content, result.match_start, result.match_end)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </Button>
              ))}
            </div>
          )}

          {/* No Results */}
          {searchQuery.trim() && !isSearching && searchResults.length === 0 && (
            <div className="text-xs text-neutral-500 text-center py-2">
              No results found
            </div>
          )}

          {/* Shortcut hint */}
          <div className="text-[10px] text-neutral-600 text-center">
            Press <kbd className="px-1 py-0.5 bg-app-border rounded text-neutral-500">Esc</kbd> to close
          </div>
        </div>
      )}

      {/* File Tree */}
      <div className="flex-1 overflow-auto py-1">
        {!rootPath ? (
          <div className="flex flex-col items-center justify-center h-full px-4 text-center">
            <p className="text-xs text-neutral-500 font-geist">
              No workspace selected
            </p>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-4 h-4 border-2 border-app-accent border-t-transparent rounded-full animate-spin shadow-[0_0_10px_var(--app-accent)]" />
          </div>
        ) : (
          <div>
            {/* Root Folder */}
            <Button
              variant="ghost"
              className="w-full justify-start h-auto py-1 px-3"
              onClick={() => {
                const newExpanded = new Set(expandedDirs)
                if (newExpanded.has(rootPath)) {
                  newExpanded.delete(rootPath)
                } else {
                  newExpanded.add(rootPath)
                }
                setExpandedDirs(newExpanded)
              }}
            >
              <span className="text-app-text-muted w-3 flex-shrink-0">
                {expandedDirs.has(rootPath) ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronRight className="w-3 h-3" />
                )}
              </span>
              <FolderOpen className="w-4 h-4 text-app-accent drop-shadow-[0_0_5px_var(--app-accent)]" />
              <span className="flex-1 truncate text-xs font-medium text-app-text font-geist">
                {rootName || rootPath.split('/').pop() || rootPath}
              </span>
            </Button>
            
            {/* Children */}
            {expandedDirs.has(rootPath) && (
              <div>
                {treeData.map(node => renderNode(node, 0))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}