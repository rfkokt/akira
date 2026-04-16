import { useState, useEffect, useRef, useCallback } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Settings, Cpu, LayoutList, FolderOpen, Folder, ArrowLeftRight, Zap, ZoomIn, ZoomOut, Terminal, X, File, MessageSquare, Plus, HelpCircle } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'
import { useEngineStore, useWorkspaceStore, useTaskStore, useZoomStore, useTerminalStore } from '@/store'
import { useMcpStore } from '@/store/mcpStore'
import { dbService } from '@/lib/db'
import { initializeInternalServers, ensureSerenaServer, checkUvInstalled } from '@/lib/mcp'
import { SettingsPage } from './components/Settings/SettingsPage'
import { WelcomeScreen } from '@/components/Workspaces/WelcomeScreen'
import { KeyboardShortcutsHelp } from '@/components/Help/KeyboardShortcutsHelp'
import { KanbanBoard } from './components/Kanban/Board'
import { TaskCreatorChat } from './components/Kanban/TaskCreatorChat'
import { FileTree } from './components/Editor/FileTree'
import { FileViewer } from './components/Editor/FileViewer'
import { GitSourceControl } from './components/Git/GitSourceControl'
import { MonacoDiffViewer } from './components/Git/MonacoDiffViewer'
import { CommitDiffViewer } from './components/Git/CommitDiffViewer'
import { GitBranchSelector } from './components/Git/GitBranchSelector'
import { RecoveryModal } from './components/RecoveryModal'
import { TerminalPanel } from './components/TerminalPanel'
import { getSavedRunningTask, useAIChatStore } from './store/aiChatStore'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Separator } from '@/components/ui/separator'
import { useKeyboardShortcuts, DEFAULT_SHORTCUTS } from '@/hooks/useKeyboardShortcuts'

type PageView = 'tasks' | 'files' | 'settings';

interface OpenFile {
  path: string
  name: string
}

interface CommitDiff {
  commitHash: string
  filePath: string
}

function App() {
  const [showEngineDropdown, setShowEngineDropdown] = useState(false)
  const [showWelcome, setShowWelcome] = useState(false)
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false)
  const [showRecovery, setShowRecovery] = useState(false)
  const [showGlobalChat, setShowGlobalChat] = useState(true)
  const [chatWidth, setChatWidth] = useState(380)
  const [gitSidebarWidth, setGitSidebarWidth] = useState(260)
  const [fileTreeWidth, setFileTreeWidth] = useState(220)
  const isResizingRef = useRef(false)
  const isResizingGitRef = useRef(false)
  const isResizingFileTreeRef = useRef(false)
  const [currentPage, setCurrentPage] = useState<PageView>('tasks')
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([])
  const [activeFileIndex, setActiveFileIndex] = useState<number | null>(null)
  const [dirtyFiles, setDirtyFiles] = useState<Set<string>>(new Set())
  const [selectedGitFile, setSelectedGitFile] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'normal' | 'diff' | 'commitDiff'>('normal')
  const [commitDiffInfo, setCommitDiffInfo] = useState<CommitDiff | null>(null)
  const { engines, activeEngine, setActiveEngine, fetchEngines, seedDefaultEngines, isLoading } = useEngineStore()
  const { activeWorkspace, loadActiveWorkspace, loadWorkspaces } = useWorkspaceStore()
  const { setCurrentWorkspace } = useTaskStore()
  const { moveTask, tasks } = useTaskStore()
  const { enqueueTask } = useAIChatStore()
  const { scale, zoomIn, zoomOut, resetZoom } = useZoomStore()
  const { createSession, sessions, isPanelOpen, setActiveSession, setPanelOpen } = useTerminalStore()
  
  // RTK Status
  const [rtkInstalled, setRtkInstalled] = useState(false)
  const [rtkStats, setRtkStats] = useState<{ total_saved: number; avg_savings: number } | null>(null)

  // Resizable Panels Handlers
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingRef.current) {
        // 56px is the left sidebar width
        const newWidth = e.clientX - 56
        if (newWidth > 280 && newWidth < 600) {
          setChatWidth(newWidth)
        }
      } else if (isResizingGitRef.current) {
        const newWidth = window.innerWidth - e.clientX
        if (newWidth > 200 && newWidth < 800) {
          setGitSidebarWidth(newWidth)
        }
      } else if (isResizingFileTreeRef.current) {
        // 56px nav + chatWidth if visible
        const offset = 56 + (showGlobalChat ? chatWidth : 0)
        const newWidth = e.clientX - offset
        if (newWidth > 160 && newWidth < 500) {
          setFileTreeWidth(newWidth)
        }
      }
    }

    const handleMouseUp = () => {
      if (isResizingRef.current || isResizingGitRef.current || isResizingFileTreeRef.current) {
        isResizingRef.current = false
        isResizingGitRef.current = false
        isResizingFileTreeRef.current = false
        document.body.style.cursor = 'default'
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [showGlobalChat, chatWidth])

  // Check for saved running task on mount
  useEffect(() => {
    const savedTask = getSavedRunningTask()
    if (savedTask) {
      setShowRecovery(true)
    }
  }, [])

  // Global UI Zoom functionality (VS Code style)
  useEffect(() => {
    let currentZoom = parseFloat(localStorage.getItem('akira-zoom') || '1');
    
    const applyZoom = (zoom: number) => {
      currentZoom = Math.max(0.6, Math.min(zoom, 2.5));
      document.documentElement.style.fontSize = `${16 * currentZoom}px`;
      localStorage.setItem('akira-zoom', currentZoom.toString());
    };
    
    // Apply initial zoom
    applyZoom(currentZoom);

    const handleKeyDown = (e: KeyboardEvent) => {
      // MacOS uses metaKey (Cmd), Windows uses ctrlKey
      if (e.metaKey || e.ctrlKey) {
        if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          applyZoom(currentZoom + 0.1);
        } else if (e.key === '-') {
          e.preventDefault();
          applyZoom(currentZoom - 0.1);
        } else if (e.key === '0') {
          e.preventDefault();
          applyZoom(1);
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handle resume task
  const handleResumeTask = async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId)
    if (task) {
      await moveTask(taskId, 'in-progress')
      await enqueueTask(task.id, task.title, task.description || undefined)
    }
  }

  // Load active workspace on mount
  useEffect(() => {
    console.log('[App] useEffect running, initializing...');
    const init = async () => {
      console.log('[App] loadActiveWorkspace...');
      await loadActiveWorkspace()
      console.log('[App] loadWorkspaces...');
      await loadWorkspaces()
      console.log('[App] Calling initializeInternalServers...');
      // Initialize internal MCP servers (task, project, skill tools)
      initializeInternalServers()
      console.log('[App] initializeInternalServers complete');
    }
    init()

    // Cleanup on unmount
    return () => {
      try {
        const { clearAllWorkspaceServers } = require('@/lib/mcp/servers/workspaceServer')
        clearAllWorkspaceServers()
        console.log('[App] Cleaned up Dynamic MCP servers')
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }, [loadActiveWorkspace, loadWorkspaces])

  // Show welcome screen if no active workspace and set current workspace for tasks
  useEffect(() => {
    if (activeWorkspace === null) {
      setShowWelcome(true)
      setCurrentWorkspace(null)
    } else {
      setShowWelcome(false)
      setCurrentWorkspace(activeWorkspace.id)
    }
  }, [activeWorkspace, setCurrentWorkspace])

  // Auto-provision Serena MCP server when workspace changes.
  // We load all MCP servers first so ensureSerenaServer can find existing records
  // without trying to create a duplicate.
  useEffect(() => {
    if (!activeWorkspace) return

    const provisionWorkspace = async () => {
      const cwd = activeWorkspace.folder_path

      // 0. Ensure .akira and .serena are in .gitignore (silently)
      try {
        const ENTRIES = ['.akira', '.serena']
        // Read current .gitignore (may not exist)
        let existing = ''
        try {
          existing = await invoke<string>('read_file', { path: `${cwd}/.gitignore` })
        } catch { /* file doesn't exist yet, that's fine */ }

        const missing = ENTRIES.filter(e => !existing.split('\n').map(l => l.trim()).includes(e))
        if (missing.length > 0) {
          const appendBlock = `\n# Akira AI workspace files (local only)\n${missing.join('\n')}\n`
          await invoke('run_shell_command', {
            command: 'sh',
            args: ['-c', `printf '${appendBlock.replace(/'/g, "'\"'\"'")}' >> .gitignore`],
            cwd,
          })
          console.log('[App] Added to .gitignore:', missing)
        }
      } catch (e) {
        console.warn('[App] Could not update .gitignore:', e)
      }

      // 1. Populate the MCP store so ensureSerenaServer can find the existing server
      const mcpStore = useMcpStore.getState()
      await mcpStore.loadServers(activeWorkspace.id)

      // 2. Check uv/uvx
      const uvVersion = await checkUvInstalled()
      if (!uvVersion) {
        console.warn('[App] uv/uvx not found — Serena will not be provisioned')
        return
      }

      // 3. Ensure Serena is connected (updates stale config + connects)
      const result = await ensureSerenaServer(activeWorkspace.id, activeWorkspace.folder_path)
      console.log('[App] Serena provisioning result:', result)
    }

    provisionWorkspace()
  }, [activeWorkspace?.id])

  // Auto-switch or create terminal session when workspace changes
  useEffect(() => {
    if (!activeWorkspace) return
    
    const currentSessions = useTerminalStore.getState().sessions
    const existingSession = currentSessions.find(s => s.workspaceId === activeWorkspace.id)
    const { createSession, setActiveSession } = useTerminalStore.getState()
    
    if (existingSession) {
      // Switch to existing terminal session for this workspace
      setActiveSession(existingSession.id)
    } else {
      // Create new terminal session for the workspace
      createSession(activeWorkspace.id, activeWorkspace.name, activeWorkspace.folder_path)
    }
  }, [activeWorkspace?.id])

  // Fetch engines on mount, seed defaults if empty
  useEffect(() => {
    const loadEngines = async () => {
      await fetchEngines()
      // Sync engines to router for cost tracking
      try {
        await dbService.syncEnginesToRouter()
        console.log('✓ Engines synced to router')
      } catch (err) {
        console.log('Note: Router sync not available yet')
      }
    }
    loadEngines()
  }, [])

  // Auto-seed defaults when engines are empty (run once after initial fetch)
  const hasSeeded = useRef(false)
  useEffect(() => {
    const autoSeed = async () => {
      if (!hasSeeded.current && engines.length === 0 && !isLoading) {
        hasSeeded.current = true
        console.log('No engines found, seeding defaults...')
        await seedDefaultEngines()
      }
    }
    autoSeed()
  }, [engines.length, isLoading])

  // Check RTK status on mount
  useEffect(() => {
    const checkRTK = async () => {
      try {
        const status = await invoke<{ installed: boolean }>('check_rtk_status')
        setRtkInstalled(status.installed)
        
        if (status.installed) {
          const stats = await invoke<{ total_saved: number; avg_savings: number }>('get_rtk_gain_stats', { days: 7 })
          setRtkStats(stats)
        }
      } catch (e) {
        console.error('RTK check failed:', e)
      }
    }
    checkRTK()
  }, [])

  // Zoom keyboard shortcuts (Cmd+=/+, Cmd+-, Cmd+0)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey
      
      if (isMeta && (e.key === '=' || e.key === '+')) {
        e.preventDefault()
        zoomIn()
      } else if (isMeta && e.key === '-') {
        e.preventDefault()
        zoomOut()
      } else if (isMeta && e.key === '0') {
        e.preventDefault()
        resetZoom()
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [zoomIn, zoomOut, resetZoom])

  // Close active tab via keyboard
  const handleCloseActiveTab = useCallback(() => {
    if (activeFileIndex !== null && currentPage === 'files') {
      const file = openFiles[activeFileIndex]
      if (file && dirtyFiles.has(file.path)) {
        const confirmed = window.confirm(`"${file.name}" has unsaved changes. Close anyway?`)
        if (!confirmed) return
      }
      const newFiles = openFiles.filter((_, i) => i !== activeFileIndex)
      setOpenFiles(newFiles)
      if (file) {
        setDirtyFiles(prev => {
          const next = new Set(prev)
          next.delete(file.path)
          return next
        })
      }
      if (newFiles.length > 0) {
        setActiveFileIndex(Math.min(activeFileIndex, newFiles.length - 1))
      } else {
        setActiveFileIndex(null)
      }
    }
  }, [activeFileIndex, openFiles, dirtyFiles, currentPage])

  const handleNextTab = useCallback(() => {
    if (openFiles.length > 1 && activeFileIndex !== null && currentPage === 'files') {
      setActiveFileIndex((activeFileIndex + 1) % openFiles.length)
    }
  }, [openFiles.length, activeFileIndex, currentPage])

  const handlePrevTab = useCallback(() => {
    if (openFiles.length > 1 && activeFileIndex !== null && currentPage === 'files') {
      setActiveFileIndex((activeFileIndex - 1 + openFiles.length) % openFiles.length)
    }
  }, [openFiles.length, activeFileIndex, currentPage])

  const handleFileDirtyChange = useCallback((filePath: string, dirty: boolean) => {
    setDirtyFiles(prev => {
      const next = new Set(prev)
      if (dirty) next.add(filePath)
      else next.delete(filePath)
      return next
    })
  }, [])

  // Global keyboard shortcuts
  useKeyboardShortcuts([
    // Navigation shortcuts
    {
      ...DEFAULT_SHORTCUTS.GO_TASKS,
      callback: () => setCurrentPage('tasks'),
    },
    {
      ...DEFAULT_SHORTCUTS.GO_FILES,
      callback: () => setCurrentPage('files'),
    },
    {
      ...DEFAULT_SHORTCUTS.GO_SETTINGS,
      callback: () => setCurrentPage('settings'),
    },
    {
      ...DEFAULT_SHORTCUTS.GO_TERMINAL,
      callback: () => {
        if (activeWorkspace) {
          const existingSession = sessions.find(s => s.workspaceId === activeWorkspace.id)
          if (existingSession) {
            setActiveSession(existingSession.id)
            setPanelOpen(!isPanelOpen)
          } else {
            createSession(activeWorkspace.id, activeWorkspace.name, activeWorkspace.folder_path)
          }
        }
      },
    },
    // Action shortcuts
    {
      ...DEFAULT_SHORTCUTS.NEW_TASK,
      callback: () => {
        // Scroll to top and focus on task creator
        window.scrollTo(0, 0)
        // Dispatch custom event to trigger new task
        window.dispatchEvent(new CustomEvent('akira:new-task'))
      },
    },
    {
      ...DEFAULT_SHORTCUTS.SWITCH_WORKSPACE,
      callback: () => setShowWelcome(true),
    },
    {
      ...DEFAULT_SHORTCUTS.TOGGLE_CHAT,
      callback: () => setShowGlobalChat(!showGlobalChat),
    },
    {
      ...DEFAULT_SHORTCUTS.SETTINGS,
      callback: () => setCurrentPage('settings'),
    },
    // Search shortcuts
    {
      ...DEFAULT_SHORTCUTS.SEARCH_FILES,
      callback: () => {
        // Skip global Cmd+F if Monaco editor is focused (let Monaco handle it)
        const active = document.activeElement
        if (active && active.closest('.monaco-editor')) return
        if (currentPage === 'files') {
          window.dispatchEvent(new CustomEvent('akira:search-files'))
        } else {
          setCurrentPage('files')
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('akira:search-files'))
          }, 100)
        }
      },
    },
    {
      ...DEFAULT_SHORTCUTS.SEARCH_CONTENT,
      callback: () => {
        // Dispatch event to trigger content search
        window.dispatchEvent(new CustomEvent('akira:search-content'))
      },
    },
    // Help shortcut - press ? to show keyboard shortcuts (without modifier)
    {
      key: '?',
      preventDefault: true,
      callback: () => setShowShortcutsHelp(true),
    },
    // Alternative: Cmd/Ctrl + / to show help
    {
      key: '/',
      metaKey: true,
      preventDefault: true,
      callback: () => setShowShortcutsHelp(true),
    },
    // Tab management shortcuts
    {
      ...DEFAULT_SHORTCUTS.CLOSE_TAB,
      callback: handleCloseActiveTab,
    },
    {
      ...DEFAULT_SHORTCUTS.NEXT_TAB,
      callback: handleNextTab,
    },
    {
      ...DEFAULT_SHORTCUTS.PREV_TAB,
      callback: handlePrevTab,
    },
  ])

  useEffect(() => {
    const handleClickOutside = () => setShowEngineDropdown(false)
    if (showEngineDropdown) {
      setTimeout(() => window.addEventListener('click', handleClickOutside), 0)
      return () => window.removeEventListener('click', handleClickOutside)
    }
  }, [showEngineDropdown])

  const handleDrag = () => {
    const appWindow = getCurrentWindow()
    appWindow.startDragging()
  }

  const enabledEngines = engines.filter(e => e.enabled)
  
  // Helper to get filename from path
  const getFileName = (path: string) => path.split('/').pop() || path
  
  // Helper to get relative path for duplicate filenames
  const getFileDisplayName = (file: OpenFile) => {
    // Check if there are other files with the same name
    const duplicateFiles = openFiles.filter(f => f.name === file.name)
    if (duplicateFiles.length > 1) {
      // Show parent folder name to differentiate
      const pathParts = file.path.split('/')
      const parentFolder = pathParts[pathParts.length - 2] || ''
      return `${parentFolder}/${file.name}`
    }
    return file.name
  }
  
  // Open file in tab
  const handleFileOpen = (path: string) => {
    const existingIndex = openFiles.findIndex(f => f.path === path)
    if (existingIndex >= 0) {
      setActiveFileIndex(existingIndex)
    } else {
      setOpenFiles([...openFiles, { path, name: getFileName(path) }])
      setActiveFileIndex(openFiles.length)
    }
    setViewMode('normal')
  }
  
  // Close file tab
  const handleFileClose = (index: number, e: React.MouseEvent) => {
    e.stopPropagation()
    const file = openFiles[index]
    if (file && dirtyFiles.has(file.path)) {
      const confirmed = window.confirm(`"${file.name}" has unsaved changes. Close anyway?`)
      if (!confirmed) return
    }
    const newFiles = openFiles.filter((_, i) => i !== index)
    setOpenFiles(newFiles)
    
    if (file) {
      setDirtyFiles(prev => {
        const next = new Set(prev)
        next.delete(file.path)
        return next
      })
    }

    if (activeFileIndex !== null) {
      if (index < activeFileIndex) {
        setActiveFileIndex(activeFileIndex - 1)
      } else if (index === activeFileIndex) {
        setActiveFileIndex(newFiles.length > 0 ? Math.min(activeFileIndex, newFiles.length - 1) : null)
      }
    }
  }

  // Get active file
  const activeFile = activeFileIndex !== null && openFiles[activeFileIndex] ? openFiles[activeFileIndex].path : null

  // Render main central content based on current page
  const renderMainContent = () => {
    switch (currentPage) {
      case 'tasks':
        return <KanbanBoard />
      
      case 'files':
        return (
          <div className="h-full flex flex-col overflow-hidden bg-app-bg relative">
            {/* File Tabs */}
            {openFiles.length > 0 && (
              <div className="flex items-center border-b border-app-border bg-app-sidebar/50 overflow-x-auto">
                {openFiles.map((file, index) => (
                  <div
                    key={file.path}
                    onClick={() => setActiveFileIndex(index)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 cursor-pointer border-r border-app-border group min-w-0 ${
                      index === activeFileIndex
                        ? 'bg-app-bg text-white'
                        : 'text-neutral-400 hover:text-neutral-200 hover:bg-white/5'
                    }`}
                  >
                    <File className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className={`text-xs truncate max-w-[150px]${dirtyFiles.has(file.path) ? ' italic' : ''}`} title={file.path}>
                      {getFileDisplayName(file)}
                    </span>
                    {dirtyFiles.has(file.path) && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />}
                    <button
                      onClick={(e) => handleFileClose(index, e)}
                      className="opacity-0 group-hover:opacity-100 hover:bg-white/10 rounded p-0.5 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {/* Content Area */}
            {viewMode === 'diff' && selectedGitFile && activeWorkspace ? (
              <MonacoDiffViewer filePath={selectedGitFile} workspacePath={activeWorkspace.folder_path} />
            ) : viewMode === 'commitDiff' && commitDiffInfo && activeWorkspace ? (
              <CommitDiffViewer 
                commitHash={commitDiffInfo.commitHash} 
                filePath={commitDiffInfo.filePath}
                workspacePath={activeWorkspace.folder_path}
              />
            ) : viewMode === 'normal' && activeFile ? (
              <FileViewer filePath={activeFile} onDirtyChange={(dirty) => handleFileDirtyChange(activeFile, dirty)} />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-neutral-500">
                <div className="text-center">
                  <FolderOpen className="w-12 h-12 text-neutral-700/50 mb-3 mx-auto" />
                  <p className="text-sm">Select a file from the explorer</p>
                  {openFiles.length > 1 && (
                    <p className="text-xs text-neutral-600 mt-1">
                      {openFiles.length} files open • Click tabs to switch
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      
      case 'settings':
        return (
          <div className="h-full flex flex-col md:flex-row overflow-hidden bg-transparent">
            {activeWorkspace ? (
              <SettingsPage projectId={activeWorkspace.id} />
            ) : (
              <div className="flex-1 flex items-center justify-center text-app-text-muted">
                <p>No workspace selected.</p>
              </div>
            )}
          </div>
        )
    }
  }

  const menuItems = [
    { id: 'tasks' as const, icon: LayoutList, label: 'Tasks' },
    { id: 'files' as const, icon: FolderOpen, label: 'Files' },
    { id: 'settings' as const, icon: Settings, label: 'Settings' },
  ]

  return (
    <div className="h-screen w-screen bg-app-bg text-app-text overflow-hidden flex flex-col">
      {/* Welcome Screen */}
      {showWelcome && (
        <WelcomeScreen onClose={() => setShowWelcome(false)} />
      )}

      {/* Recovery Modal */}
      {showRecovery && (
        <RecoveryModal onResume={handleResumeTask} onClose={() => setShowRecovery(false)} />
      )}

      {/* Keyboard Shortcuts Help */}
      <KeyboardShortcutsHelp 
        isOpen={showShortcutsHelp} 
        onClose={() => setShowShortcutsHelp(false)} 
      />

      {/* Title Bar - Glassmorphism */}
      <div className="h-[38px] bg-app-titlebar backdrop-blur-md border-b border-app-border flex items-center shrink-0 relative transition-colors duration-300">
        {/* Draggable background */}
        <div 
          className="absolute inset-0"
          data-tauri-drag-region
          onMouseDown={handleDrag}
        />
        
        {/* Left: Spacer untuk traffic lights native */}
        <div className="w-[80px] shrink-0 relative z-0" />
        
        {/* Empty Flex Spacer to push Right block to end */}
        <div className="flex-1 relative z-0" />

        {/* Center: Workspace Indicator (Absolutely Centered) */}
        <div className="absolute left-1/2 -translate-x-1/2 h-full flex items-center justify-center z-[60] pointer-events-none">
          {activeWorkspace ? (
            <div className="flex items-center gap-3 pointer-events-auto">
              <div className="flex items-center gap-2 pointer-events-none">
                <Folder className="w-3.5 h-3.5 text-app-accent" />
                <span className="text-xs font-medium text-white select-none">
                  {activeWorkspace.name}
                </span>
                <span className="text-xs text-neutral-600 select-none">
                  {activeWorkspace.folder_path.split('/').slice(-2).join('/')}
                </span>
              </div>
              {/* Git Branch Selector */}
              <div className="pointer-events-auto" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
                <GitBranchSelector workspacePath={activeWorkspace.folder_path} />
              </div>
            </div>
          ) : (
            <span className="text-xs font-medium text-neutral-500 select-none pointer-events-none">Akira</span>
          )}
        </div>
        
        {/* Right: Engine & Settings */}
        <div className="flex items-center gap-1 pr-4 relative z-10" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {/* Engine Selector */}
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center gap-1.5 h-7 px-2 text-xs rounded-md hover:bg-accent hover:text-accent-foreground">
              <Cpu className="size-3.5" />
              <span className="capitalize">{activeEngine?.alias || 'Engine'}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {enabledEngines.length === 0 ? (
                <DropdownMenuItem disabled>No engines</DropdownMenuItem>
              ) : (
                enabledEngines.map(engine => (
                  <DropdownMenuItem
                    key={engine.id}
                    onClick={() => setActiveEngine(engine)}
                    className={activeEngine?.id === engine.id ? 'bg-accent' : ''}
                  >
                    <span className="capitalize">{engine.alias}</span>
                    {activeEngine?.id === engine.id && (
                      <span className="ml-auto text-green-500">●</span>
                    )}
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          
          {/* Switch Workspace */}
          {activeWorkspace && (
            <Tooltip>
              <TooltipTrigger render={<Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setShowWelcome(true)} />}>
                <ArrowLeftRight className="size-3.5" />
                <span className="hidden sm:inline">Switch</span>
              </TooltipTrigger>
              <TooltipContent className="flex items-center gap-2">
                Switch Workspace
                <kbd className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded">⌘E</kbd>
              </TooltipContent>
            </Tooltip>
          )}

          {/* Terminal */}
          {activeWorkspace && (
            <Tooltip>
              <TooltipTrigger
                className={`inline-flex items-center justify-center rounded-md h-7 w-7 ${isPanelOpen ? 'text-app-accent' : 'text-neutral-400 hover:text-white'} transition-colors hover:bg-white/10`}
                onClick={() => {
                  const existingSession = sessions.find(s => s.workspaceId === activeWorkspace.id)
                  if (existingSession) {
                    setActiveSession(existingSession.id)
                    setPanelOpen(!isPanelOpen)
                  } else {
                    createSession(activeWorkspace.id, activeWorkspace.name, activeWorkspace.folder_path)
                  }
                }}
              >
                <Terminal className="size-4" />
              </TooltipTrigger>
              <TooltipContent className="flex items-center gap-2">
                Toggle Terminal
                <kbd className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded">⌘`</kbd>
              </TooltipContent>
            </Tooltip>
          )}

          <Separator orientation="vertical" className="h-4" />

          {/* RTK Status Indicator */}
          {rtkInstalled && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs text-yellow-400 hover:text-yellow-300 hover:bg-yellow-400/10"
              onClick={() => setCurrentPage('settings')}
            >
              <Zap className="size-3.5" />
              {rtkStats && rtkStats.total_saved > 0 && (
                <span className="font-mono">{rtkStats.avg_savings.toFixed(0)}%</span>
              )}
            </Button>
          )}

          {/* Zoom Controls */}
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={zoomOut}
              title="Zoom Out (Cmd+-)"
            >
              <ZoomOut className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="font-mono min-w-[52px]"
              onClick={resetZoom}
              title="Reset Zoom (Cmd+0)"
            >
              {Math.round(scale * 100)}%
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={zoomIn}
              title="Zoom In (Cmd+=)"
            >
              <ZoomIn className="size-4" />
            </Button>
          </div>

          <Separator orientation="vertical" className="h-4" />

          {/* Settings */}
          <Tooltip>
            <TooltipTrigger render={<Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCurrentPage('settings')} />}>
                <Settings className="size-3.5" />
              </TooltipTrigger>
            <TooltipContent className="flex items-center gap-2">
              Settings
              <kbd className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded">⌘,</kbd>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Main Layout */}
      <div className="flex flex-1 min-h-0 overflow-hidden relative">
        <div 
          className="absolute top-0 left-0 flex"
          style={{ 
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            width: scale === 1 ? '100%' : `${100 / scale}%`,
            height: scale === 1 ? '100%' : `${100 / scale}%`,
          }}
        >
          {/* Navigation Sidebar (Left) */}
          <nav className="w-12 shrink-0 bg-app-sidebar flex flex-col items-center py-0 gap-0 border-r border-app-border z-10">
          {menuItems.map((item, index) => {
          const Icon = item.icon
          const isActive = currentPage === item.id
            const shortcutKey = index + 1
          
          return (
          <Tooltip key={item.id}>
          <TooltipTrigger
          className="w-full h-12 flex items-center justify-center relative transition-none cursor-pointer group"
            onClick={() => setCurrentPage(item.id)}
          >
          <div className={`p-2 flex items-center justify-center relative ${isActive ? 'text-white' : 'text-neutral-500 group-hover:text-white'}`}>
          <Icon className="w-6 h-6 stroke-[1.5px]" />
          {isActive && (
            <div className="absolute -left-3 top-0 bottom-0 w-[2px] bg-app-accent" />
            )}
            </div>
          </TooltipTrigger>
          <TooltipContent side="right" className="bg-app-titlebar border-app-border text-white text-xs font-semibold px-2 py-1 rounded-sm shadow-md flex items-center gap-2">
            {item.label}
              <kbd className="ml-auto text-[10px] bg-white/10 px-1.5 py-0.5 rounded">⌘{shortcutKey}</kbd>
              </TooltipContent>
              </Tooltip>
            )
          })}

          <div className="w-full flex justify-center py-2">
            <Separator className="w-6 bg-app-border" />
          </div>

          {/* New Task */}
          <Tooltip>
            <TooltipTrigger
              className="w-full h-12 flex items-center justify-center relative transition-none cursor-pointer group"
              onClick={() => window.dispatchEvent(new CustomEvent('akira:new-task'))}
            >
              <div className="p-2 flex items-center justify-center relative text-neutral-500 group-hover:text-white">
                <Plus className="w-6 h-6 stroke-[1.5px]" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="right" className="bg-app-titlebar border-app-border text-white text-xs font-semibold px-2 py-1 rounded-sm shadow-md flex items-center gap-2">
              New Task
              <kbd className="ml-auto text-[10px] bg-white/10 px-1.5 py-0.5 rounded">⌘N</kbd>
            </TooltipContent>
          </Tooltip>

          {/* Global Chat Toggle */}
          <Tooltip>
            <TooltipTrigger
              className="w-full h-12 flex items-center justify-center relative transition-none cursor-pointer group"
              onClick={() => setShowGlobalChat(!showGlobalChat)}
            >
              <div className={`p-2 flex items-center justify-center relative ${showGlobalChat ? 'text-white' : 'text-neutral-500 group-hover:text-white'}`}>
                <MessageSquare className="w-6 h-6 stroke-[1.5px]" />
                {showGlobalChat && (
                  <div className="absolute -left-3 top-0 bottom-0 w-[2px] bg-app-accent" />
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent side="right" className="bg-app-titlebar border-app-border text-white text-xs font-semibold px-2 py-1 rounded-sm shadow-md flex items-center gap-2">
              Toggle Chat
              <kbd className="ml-auto text-[10px] bg-white/10 px-1.5 py-0.5 rounded">⌘J</kbd>
            </TooltipContent>
          </Tooltip>

          {/* Help */}
          <Tooltip>
            <TooltipTrigger
              className="w-full h-12 flex items-center justify-center relative transition-none cursor-pointer group"
              onClick={() => setShowShortcutsHelp(true)}
            >
              <div className="p-2 flex items-center justify-center relative text-neutral-500 group-hover:text-white">
                <HelpCircle className="w-6 h-6 stroke-[1.5px]" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="right" className="bg-app-titlebar border-app-border text-white text-xs font-semibold px-2 py-1 rounded-sm shadow-md flex items-center gap-2">
              Keyboard Shortcuts
              <kbd className="ml-auto text-[10px] bg-white/10 px-1.5 py-0.5 rounded">?</kbd>
            </TooltipContent>
          </Tooltip>

          <div className="flex-1" />
        </nav>

        {/* Global Chat Panel */}
        {showGlobalChat && (
          <div 
            style={{ width: `${chatWidth}px` }}
            className="shrink-0 h-full z-20 shadow-[-10px_0_30px_rgba(0,0,0,0.5)] bg-app-bg border-r border-app-border relative flex flex-col"
          >
            <TaskCreatorChat onHide={() => setShowGlobalChat(false)} />
            
            {/* Resizer Handle */}
            <div 
              className="absolute right-0 top-0 w-1.5 h-full cursor-col-resize hover:bg-app-accent/50 active:bg-app-accent z-30 transition-colors pointer-events-auto"
              onMouseDown={(e) => {
                e.preventDefault()
                isResizingRef.current = true
                document.body.style.cursor = 'col-resize'
              }}
            />
          </div>
        )}

        {/* Left: File Tree (Full Height) */}
        {currentPage === 'files' && (
          <div
            className="shrink-0 border-r border-white/5 flex flex-col bg-transparent relative"
            style={{ width: `${fileTreeWidth}px` }}
          >
            {activeWorkspace ? (
              <FileTree 
                rootPath={activeWorkspace.folder_path}
                rootName={activeWorkspace.name}
                selectedPath={activeFile || undefined}
                onFileSelect={handleFileOpen}
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-xs text-neutral-500">No workspace selected</p>
              </div>
            )}
            {/* File Tree Resize Handle */}
            <div
              className="absolute right-0 top-0 w-1.5 h-full cursor-col-resize hover:bg-app-accent/50 active:bg-app-accent z-30 transition-colors pointer-events-auto"
              onMouseDown={(e) => {
                e.preventDefault()
                isResizingFileTreeRef.current = true
                document.body.style.cursor = 'col-resize'
              }}
            />
          </div>
        )}

        {/* Main Content Area (Middle) */}
        <div className="flex flex-col overflow-hidden bg-app-bg relative m-0 flex-1 min-w-0 min-h-0">
          <main className="flex-1 overflow-auto relative flex flex-col min-h-0">
            {renderMainContent()}
          </main>
          
          {/* Terminal Panel */}
          <TerminalPanel />
        </div>

        {/* Right: Git Workflow (Full Height) */}
        {currentPage === 'files' && activeWorkspace && (
          <div 
            className="shrink-0 border-l border-app-border flex flex-col bg-transparent relative"
            style={{ width: `${gitSidebarWidth}px` }}
          >
            {/* Resizer Handle */}
            <div 
              className="absolute left-0 top-0 w-1.5 h-full cursor-col-resize hover:bg-app-accent/50 active:bg-app-accent z-[60] transition-colors pointer-events-auto -translate-x-1/2"
              onMouseDown={(e) => {
                e.preventDefault()
                isResizingGitRef.current = true
                document.body.style.cursor = 'col-resize'
              }}
            />
            <GitSourceControl 
              selectedFile={selectedGitFile} 
              onFileSelect={(path) => {
                setSelectedGitFile(path)
                setViewMode('diff')
              }}
              onShowDiff={(commitHash, filePath) => {
                setCommitDiffInfo({ commitHash, filePath })
                setViewMode('commitDiff')
              }}
            />
          </div>
        )}
        </div>
      </div>
    </div>
  )
}

export default App
