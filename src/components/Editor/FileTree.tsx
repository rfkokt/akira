import { useState, useCallback, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Folder, FolderOpen, File, ChevronRight, ChevronDown, FolderOpenDot } from 'lucide-react'

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
        return <FolderOpenDot className="w-4 h-4 text-[#dcb67a]" />
      }
      return <Folder className="w-4 h-4 text-[#dcb67a]" />
    }

    const ext = entry.name.split('.').pop()?.toLowerCase()
    switch (ext) {
      case 'js':
      case 'ts':
      case 'jsx':
      case 'tsx':
        return <File className="w-4 h-4 text-[#519aba]" />
      case 'json':
        return <File className="w-4 h-4 text-[#cbcb41]" />
      case 'md':
        return <File className="w-4 h-4 text-[#ffffff]" />
      case 'css':
      case 'scss':
        return <File className="w-4 h-4 text-[#563d7c]" />
      case 'html':
        return <File className="w-4 h-4 text-[#e44d26]" />
      case 'rs':
        return <File className="w-4 h-4 text-[#dea584]" />
      case 'py':
        return <File className="w-4 h-4 text-[#3572A5]" />
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
        <button
          onClick={() => toggleDir(node)}
          className={`w-full flex items-center gap-1 py-1 text-left hover:bg-white/5 transition-colors group ${
            isSelected ? 'bg-[#0e639c]/20' : ''
          }`}
          style={{ paddingLeft: `${paddingLeft}px` }}
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
        </button>
        
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
    <div className="flex flex-col h-full bg-[#252526] border-r border-white/5">
      {/* Header */}
      <div className="px-3 py-2 border-b border-white/5 flex items-center justify-between">
        <span className="text-xs font-medium text-neutral-400 font-geist uppercase tracking-wide">
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
            <div className="w-4 h-4 border-2 border-[#0e639c] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div>
            {/* Root Folder */}
            <button
              onClick={() => {
                const newExpanded = new Set(expandedDirs)
                if (newExpanded.has(rootPath)) {
                  newExpanded.delete(rootPath)
                } else {
                  newExpanded.add(rootPath)
                }
                setExpandedDirs(newExpanded)
              }}
              className="w-full flex items-center gap-1 px-3 py-1 text-left hover:bg-white/5 transition-colors"
            >
              <span className="text-neutral-500 w-3 flex-shrink-0">
                {expandedDirs.has(rootPath) ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronRight className="w-3 h-3" />
                )}
              </span>
              <FolderOpen className="w-4 h-4 text-[#dcb67a]" />
              <span className="flex-1 truncate text-xs font-medium text-white font-geist">
                {rootName || rootPath.split('/').pop() || rootPath}
              </span>
            </button>
            
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
