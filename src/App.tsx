import { useState, useEffect, useRef } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Settings, LayoutList, FolderOpen, Folder, ArrowLeftRight, ZoomIn, ZoomOut, Terminal, X, File, MessageSquare } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'
import { useWorkspaceStore, useTaskStore, useZoomStore, useTerminalStore } from '@/store'
import { usePiStore } from '@/store/piStore'
import { SettingsPage } from './components/Settings/SettingsPage'
import { WelcomeScreen } from '@/components/Workspaces/WelcomeScreen'
import { KanbanBoard } from './components/Kanban/Board'
import { FileTree } from './components/Editor/FileTree'
import { FileViewer } from './components/Editor/FileViewer'
import { GitSourceControl } from './components/Git/GitSourceControl'
import { MonacoDiffViewer } from './components/Git/MonacoDiffViewer'
import { CommitDiffViewer } from './components/Git/CommitDiffViewer'
import { GitBranchSelector } from './components/Git/GitBranchSelector'
import { RecoveryModal } from './components/RecoveryModal'
import { TerminalPanel } from './components/TerminalPanel'
import { getSavedRunningTask, useAIChatStore } from './store/aiChatStore'
import { TaskCreationDialog } from './components/Kanban/TaskCreationDialog'
import { Button } from '@/components/ui/button'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Separator } from '@/components/ui/separator'

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
  const [showWelcome, setShowWelcome] = useState(false)
  const [showRecovery, setShowRecovery] = useState(false)
  const [showGlobalChat, setShowGlobalChat] = useState(true)
  const [chatWidth, setChatWidth] = useState(480)
  const [gitSidebarWidth, setGitSidebarWidth] = useState(300)
  const isResizingRef = useRef(false)
  const isResizingGitRef = useRef(false)
  const [currentPage, setCurrentPage] = useState<PageView>('tasks')
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([])
  const [activeFileIndex, setActiveFileIndex] = useState<number | null>(null)
  const [selectedGitFile, setSelectedGitFile] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'normal' | 'diff' | 'commitDiff'>('normal')
  const [commitDiffInfo, setCommitDiffInfo] = useState<CommitDiff | null>(null)
  const { activeWorkspace, loadActiveWorkspace, loadWorkspaces } = useWorkspaceStore()
  const { setCurrentWorkspace } = useTaskStore()
  const { moveTask, tasks } = useTaskStore()
  const { enqueueTask } = useAIChatStore()
  const { scale, zoomIn, zoomOut, resetZoom } = useZoomStore()
  const { createSession, sessions, isPanelOpen, setActiveSession, setPanelOpen } = useTerminalStore()

  // Resizable Panels Handlers
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingRef.current) {
        // 56px is the left sidebar width
        const newWidth = e.clientX - 56
        if (newWidth > 300 && newWidth < 900) {
          setChatWidth(newWidth)
        }
      } else if (isResizingGitRef.current) {
        const newWidth = window.innerWidth - e.clientX
        if (newWidth > 200 && newWidth < 800) {
          setGitSidebarWidth(newWidth)
        }
      }
    }

    const handleMouseUp = () => {
      if (isResizingRef.current || isResizingGitRef.current) {
        isResizingRef.current = false
        isResizingGitRef.current = false
        document.body.style.cursor = 'default'
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

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
    }
    init()
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

  // Ensure .akira and .serena are in .gitignore when workspace changes
  useEffect(() => {
    if (!activeWorkspace) return

    const provisionWorkspace = async () => {
      const cwd = activeWorkspace.folder_path

      // Ensure .akira and .serena are in .gitignore (silently)
      try {
        const ENTRIES = ['.akira', '.serena']
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

  // Pi initialization: discover binary and check auth after workspace loads
  useEffect(() => {
    if (!activeWorkspace) return

    const initPi = async () => {
      try {
        await invoke('pi_discover_binary')
      } catch (e) {
        console.warn('[App] Pi binary discovery failed:', e)
      }
      try {
        await usePiStore.getState().checkAuth()
      } catch (e) {
        console.warn('[App] Pi auth check failed:', e)
      }
    }

    initPi()
  }, [activeWorkspace?.id])

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

  const handleDrag = () => {
    const appWindow = getCurrentWindow()
    appWindow.startDragging()
  }

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
    const newFiles = openFiles.filter((_, i) => i !== index)
    setOpenFiles(newFiles)
    
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
                    <span className="text-xs truncate max-w-[150px]" title={file.path}>
                      {getFileDisplayName(file)}
                    </span>
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
              <FileViewer filePath={activeFile} />
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
        
        {/* Right: Settings & Controls */}
        <div className="flex items-center gap-1 pr-4 relative z-10" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {/* Switch Workspace */}
          {activeWorkspace && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => setShowWelcome(true)}
            >
              <ArrowLeftRight className="size-3.5" />
              <span className="hidden sm:inline">Switch</span>
            </Button>
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
              <TooltipContent>Open Terminal</TooltipContent>
            </Tooltip>
          )}

          <Separator orientation="vertical" className="h-4" />

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
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setCurrentPage('settings')}
          >
            <Settings className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Main Layout */}
      <div className="flex flex-1 overflow-hidden relative">
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
            {menuItems.map((item) => {
              const Icon = item.icon
              const isActive = currentPage === item.id
            
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
                <TooltipContent side="right" className="bg-app-titlebar border-app-border text-white text-xs font-semibold px-2 py-1 rounded-sm shadow-md">
                  {item.label}
                </TooltipContent>
              </Tooltip>
            )
          })}

          <div className="w-full flex justify-center py-2">
            <Separator className="w-6 bg-app-border" />
          </div>

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
            <TooltipContent side="right" className="bg-app-titlebar border-app-border text-white text-xs font-semibold px-2 py-1 rounded-sm shadow-md">Toggle Chat Panel</TooltipContent>
          </Tooltip>

          <div className="flex-1" />
        </nav>

        {/* Global Chat Panel (Left Sidebar) */}
        {showGlobalChat && (
          <div 
            style={{ width: `${chatWidth}px` }}
            className="shrink-0 h-full z-20 shadow-[-10px_0_30px_rgba(0,0,0,0.5)] bg-app-bg border-r border-app-border relative flex flex-col"
          >
            <TaskCreationDialog onHide={() => setShowGlobalChat(false)} />
            
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
          <div className="w-[300px] shrink-0 border-r border-white/5 flex flex-col bg-transparent">
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
          </div>
        )}

        {/* Main Content Area (Middle) */}
        <div className="flex flex-col overflow-hidden bg-app-bg relative m-0 flex-1">
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
