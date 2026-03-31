import { useState, useCallback, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Folder, FolderOpen, File, ChevronRight, ChevronDown, FolderOpenDot } from 'lucide-react'
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

export function FileTree({ rootPath, rootName, onFileSelect, selectedPath }: FileTreeProps) {
  const [treeData, setTreeData] = useState<TreeNode[]>([])
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(new Set())

  const loadDirectory = useCallback(async (path: string): Promise<FileEntry[]> => {
    try {
      const result = await invoke<FileEntry[]>('read_directory', { path })
      return result
    } catch (error) {
      console.error('Failed to read directory:', error)
      return []
    }
  }, [])

  // Load root directory when rootPath changes
  useEffect(() => {
    if (!rootPath) {
      setTreeData([])
      setExpandedDirs(new Set())
      return
    }

    const loadRoot = async () => {
      const entries = await loadDirectory(rootPath)
      setTreeData(entries.map(e => ({ ...e })))
      // Expand root by default
      setExpandedDirs(new Set([rootPath]))
    }

    loadRoot()
  }, [rootPath, loadDirectory])

  const toggleDir = async (node: TreeNode) => {
    if (!node.is_dir) {
      onFileSelect?.(node.path)
      return
    }

    const newExpanded = new Set(expandedDirs)
    
    if (newExpanded.has(node.path)) {
      // Collapse
      newExpanded.delete(node.path)
    } else {
      // Expand - load children if not loaded
      newExpanded.add(node.path)
      
      if (!node.isLoaded && !loadingDirs.has(node.path)) {
        setLoadingDirs(prev => new Set(prev).add(node.path))
        const children = await loadDirectory(node.path)
        
        // Update tree data with children
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

  const getFileIcon = (entry: FileEntry, isExpanded: boolean) => {
    if (entry.is_dir) {
      if (isExpanded) {
        return <FolderOpenDot className="w-4 h-4 text-app-accent" />
      }
      return <Folder className="w-4 h-4 text-app-accent" />
    }

    const ext = entry.name.split('.').pop()?.toLowerCase()
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

  const renderNode = (node: TreeNode, depth: number = 0) => {
    const isExpanded = expandedDirs.has(node.path)
    const isSelected = selectedPath === node.path
    const isLoading = loadingDirs.has(node.path)
    const paddingLeft = depth * 12 + 12

    return (
      <div key={node.path}>
        <Button
          variant="ghost"
          className={`w-full justify-start h-auto py-1 text-left group transition-all duration-200 ${isSelected ? 'bg-app-accent-glow shadow-[inset_2px_0_0_var(--app-accent)]' : 'hover:bg-app-panel'}`}
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
          {getFileIcon(node, isExpanded)}
          <span
            className={`flex-1 truncate text-xs font-geist ${
              isSelected
                ? 'text-white'
                : node.is_dir
                ? 'text-neutral-300'
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
        
        {/* Render children if expanded */}
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
      </div>

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
