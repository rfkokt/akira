import { useState, useCallback, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Folder, File, ChevronRight, ChevronDown, Search, X, FileSearch, Loader2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

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
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchMode, setSearchMode] = useState<SearchMode>('filename')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  
  // Git state
  const [isPushing, setIsPushing] = useState(false)
  const [currentBranch, setCurrentBranch] = useState<string>('')
  
  const loadDirectory = useCallback(async (path: string): Promise<FileEntry[]> => {
    try {
      const result = await invoke<FileEntry[]>('read_directory', { path })
      return result
    } catch (error) {
      console.error('Failed to read directory:', error)
      return []
    }
  }, [])

  // Load current branch
  const loadCurrentBranch = useCallback(async () => {
    if (!rootPath) return
    try {
      const result = await invoke<{ success: boolean; stdout: string }>('run_shell_command', {
        command: 'git',
        args: ['branch', '--show-current'],
        cwd: rootPath
      })
      if (result.success) {
        setCurrentBranch(result.stdout.trim())
      }
    } catch (error) {
      console.error('Failed to load current branch:', error)
    }
  }, [rootPath])

  // Git push handler
  const handlePush = useCallback(async () => {
    if (!rootPath || !currentBranch) return
    
    setIsPushing(true)
    try {
      // Check if branch has upstream
      const checkUpstream = await invoke<{ success: boolean; stdout: string }>('run_shell_command', {
        command: 'git',
        args: ['rev-parse', '--abbrev-ref', `${currentBranch}@{upstream}`],
        cwd: rootPath
      })
      
      const remote = 'origin'
      
      if (!checkUpstream.stdout.trim()) {
        // No upstream, set it
        await invoke('run_shell_command', {
          command: 'git',
          args: ['push', '-u', remote, currentBranch],
          cwd: rootPath
        })
        toast.success(`Pushed ${currentBranch} to ${remote}`)
      } else {
        // Has upstream, just push
        await invoke('run_shell_command', {
          command: 'git',
          args: ['push'],
          cwd: rootPath
        })
        toast.success(`Pushed ${currentBranch}`)
      }
    } catch (error) {
      console.error('Push failed:', error)
      toast.error(`Push failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsPushing(false)
    }
  }, [rootPath, currentBranch])

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
      loadCurrentBranch()
    }

    loadRoot()
  }, [rootPath, loadDirectory, loadCurrentBranch])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault()
        setShowSearch(true)
        setSearchQuery('')
        setSearchResults([])
        setSelectedIndex(0)
        setTimeout(() => searchInputRef.current?.focus(), 100)
      }
      
      if (showSearch) {
        if (e.key === 'Escape') {
          e.preventDefault()
          setShowSearch(false)
          setSearchQuery('')
          setSearchResults([])
        }
        
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setSelectedIndex(prev => Math.min(prev + 1, searchResults.length - 1))
        }
        
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setSelectedIndex(prev => Math.max(prev - 1, 0))
        }
        
        if (e.key === 'Enter' && searchResults.length > 0) {
          e.preventDefault()
          const selected = searchResults[selectedIndex]
          if (selected) {
            onFileSelect?.(selected.path)
            setShowSearch(false)
            setSearchQuery('')
            setSearchResults([])
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showSearch, searchResults, selectedIndex, onFileSelect])

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
      setSelectedIndex(0)
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
      }, 150)
    } else {
      setSearchResults([])
    }

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [searchQuery, searchMode, performSearch])

  useEffect(() => {
    setSelectedIndex(0)
  }, [searchResults])

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



  const getFileIcon = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase()
    
    // VSCode-like File Icons
    const iconClass = "w-[14px] h-[14px]"
    switch (ext) {
      case 'js':
      case 'jsx':
        return <File className={`${iconClass} text-[#f0e059]`} />
      case 'ts':
      case 'tsx':
        return <File className={`${iconClass} text-[#3178c6]`} />
      case 'json':
        return <File className={`${iconClass} text-[#cbcd30]`} />
      case 'md':
        return <File className={`${iconClass} text-[#519aba]`} />
      case 'css':
      case 'scss':
        return <File className={`${iconClass} text-[#42a5f5]`} />
      case 'html':
        return <File className={`${iconClass} text-[#e34c26]`} />
      case 'rs':
        return <File className={`${iconClass} text-[#dea584]`} />
      case 'py':
        return <File className={`${iconClass} text-[#3572A5]`} />
      default:
        return <File className={`${iconClass} text-neutral-500`} />
    }
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
    // VSCode usually indents ~12px to 14px per depth level (starting with 12px padding for the root elements)
    const paddingLeft = depth * 12 + 16

    return (
      <div key={node.path}>
        <div
          role="button"
          tabIndex={0}
          className={`group flex items-center justify-start h-[22px] w-full text-left cursor-pointer select-none transition-none ${isSelected ? 'bg-app-accent/20 text-white' : 'text-neutral-400 hover:bg-white/10 hover:text-neutral-200'}`}
          style={{ paddingLeft: `${paddingLeft}px` }}
          onClick={() => toggleDir(node)}
        >
          {/* Caret/Chevron */}
          <div className="flex items-center justify-center w-[18px] flex-shrink-0">
            {node.is_dir ? (
              <span className="text-neutral-500 transition-colors">
                {isLoading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : isExpanded ? (
                  <ChevronDown className="w-[14px] h-[14px]" />
                ) : (
                  <ChevronRight className="w-[14px] h-[14px]" />
                )}
              </span>
            ) : (
              <span className="w-3" />
            )}
          </div>
          
          {/* Icon */}
          <div className={`flex items-center justify-center mr-1.5 flex-shrink-0 ${node.is_dir ? 'text-[#e8a317]' : ''}`}>
            {node.is_dir ? (
              <Folder className="w-[14px] h-[14px] fill-current opacity-80" />
            ) : (
              getFileIcon(node.name)
            )}
          </div>

          {/* Label */}
          <span
            className={`flex-1 truncate text-[13px] leading-[22px] ${isSelected ? 'text-white font-medium' : 'text-[#ececec]'}`}
            title={node.name}
            style={{ fontFamily: "Inter, sans-serif" }}
          >
            {node.name}
          </span>
        </div>
        
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
    <>
      <div className="flex flex-col h-full bg-transparent border-r border-app-border">
        {/* Header */}
        <div className="px-3 py-2 border-b border-app-border flex items-center justify-between">
          <span className="text-xs font-medium text-app-text-muted uppercase tracking-widest">
            Explorer
          </span>
          <div className="flex items-center gap-1">
            {/* Git Push */}
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 p-0 text-neutral-500 hover:text-neutral-300 hover:bg-white/5"
              onClick={handlePush}
              disabled={isPushing || !currentBranch}
              title="Push to remote"
            >
              {isPushing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Upload className="w-3.5 h-3.5" />
              )}
            </Button>
            
            {/* Search */}
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 p-0 text-neutral-500 hover:text-neutral-300 hover:bg-white/5"
              onClick={() => {
                setShowSearch(true)
                setSearchQuery('')
                setSearchResults([])
                setSelectedIndex(0)
                setTimeout(() => searchInputRef.current?.focus(), 100)
              }}
              title="Search (Cmd/Ctrl+P)"
            >
              <Search className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* File Tree */}
        <div className="flex-1 overflow-auto py-1">
          {!rootPath ? (
            <div className="flex flex-col items-center justify-center h-full px-4 text-center">
              <p className="text-xs text-neutral-500">
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
              <div
                role="button"
                tabIndex={0}
                className="group flex items-center justify-start h-[22px] w-full text-left cursor-pointer select-none transition-none hover:bg-white/10"
                style={{ paddingLeft: '4px' }}
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
                <div className="flex items-center justify-center w-[18px] flex-shrink-0">
                  <span className="text-neutral-500 transition-colors">
                    {expandedDirs.has(rootPath) ? (
                      <ChevronDown className="w-[14px] h-[14px]" />
                    ) : (
                      <ChevronRight className="w-[14px] h-[14px]" />
                    )}
                  </span>
                </div>
                <div className="flex items-center justify-center mr-1.5 flex-shrink-0 text-app-accent">
                  <Folder className="w-[14px] h-[14px] fill-current opacity-80" />
                </div>
                <span className="flex-1 truncate text-[13px] leading-[22px] font-bold text-white tracking-wide" style={{ fontFamily: "Inter, sans-serif" }}>
                  {rootName || rootPath.split('/').pop() || rootPath}
                </span>
              </div>
              
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

      {/* Spotlight-like Search Modal */}
      {showSearch && (
        <div 
          className="fixed inset-0 z-50 flex items-start justify-center pt-[15%]"
          onClick={() => {
            setShowSearch(false)
            setSearchQuery('')
            setSearchResults([])
          }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          
          {/* Search Panel */}
          <div 
            className="relative w-full max-w-2xl bg-app-panel/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/10 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search Input */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-white/5">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setSearchMode('filename')
                    setSearchResults([])
                    if (searchQuery.trim()) {
                      performSearch(searchQuery, 'filename')
                    }
                  }}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    searchMode === 'filename'
                      ? 'bg-app-accent text-white'
                      : 'text-neutral-400 hover:text-neutral-200 hover:bg-white/5'
                  }`}
                >
                  <FileSearch className="w-3 h-3 inline mr-1" />
                  Files
                </button>
                <button
                  onClick={() => {
                    setSearchMode('content')
                    setSearchResults([])
                    if (searchQuery.trim()) {
                      performSearch(searchQuery, 'content')
                    }
                  }}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    searchMode === 'content'
                      ? 'bg-app-accent text-white'
                      : 'text-neutral-400 hover:text-neutral-200 hover:bg-white/5'
                  }`}
                >
                  <Search className="w-3 h-3 inline mr-1" />
                  Content
                </button>
              </div>
              <div className="flex-1 relative">
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder={searchMode === 'filename' ? 'Search files by name...' : 'Search in files...'}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-transparent text-white text-lg placeholder-neutral-500 outline-none"
                />
              </div>
              {isSearching && (
                <Loader2 className="w-5 h-5 text-neutral-400 animate-spin" />
              )}
              {searchQuery && !isSearching && (
                <button
                  onClick={() => {
                    setSearchQuery('')
                    setSearchResults([])
                  }}
                  className="text-neutral-500 hover:text-neutral-300 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Results */}
            <div className="max-h-[50vh] overflow-auto">
              {searchResults.length > 0 ? (
                <div className="py-2">
                  {searchResults.map((result, idx) => (
                    <div
                      key={`${result.path}-${result.line_number || idx}`}
                      className={`px-5 py-2.5 cursor-pointer transition-colors ${
                        idx === selectedIndex
                          ? 'bg-app-accent/20'
                          : 'hover:bg-white/5'
                      }`}
                      onClick={() => handleResultClick(result)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex-shrink-0">
                          {getFileIcon(result.name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-white truncate font-medium">
                            {result.name}
                          </div>
                          <div className="text-xs text-neutral-500 truncate mt-0.5">
                            {result.relative_path}
                          </div>
                          {result.line_content && (
                            <div className="mt-1 text-xs font-mono truncate">
                              <span className="text-neutral-600 mr-1">{result.line_number}:</span>
                              <span className="text-neutral-300">
                                {result.line_content.slice(0, 80)}
                                {result.line_content.length > 80 && '...'}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : searchQuery.trim() && !isSearching ? (
                <div className="py-12 text-center">
                  <div className="text-neutral-500 text-sm">No results found</div>
                  <div className="text-neutral-600 text-xs mt-1">Try a different search term</div>
                </div>
              ) : null}

              {/* Keyboard Hints */}
              <div className="px-5 py-3 border-t border-white/5 flex items-center justify-between text-xs text-neutral-600">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 bg-white/5 rounded text-neutral-500">↑↓</kbd>
                    Navigate
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 bg-white/5 rounded text-neutral-500">↵</kbd>
                    Open
                  </span>
                </div>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-white/5 rounded text-neutral-500">Esc</kbd>
                  Close
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      
    </>
  )
}