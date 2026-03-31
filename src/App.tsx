import { useState, useEffect, useRef } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Settings, Cpu, LayoutList, FolderOpen, GitBranch, Folder, ArrowLeftRight, Zap, ZoomIn, ZoomOut } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'
import { useEngineStore, useWorkspaceStore, useTaskStore, useZoomStore } from '@/store'
import { dbService } from '@/lib/db'
import { SettingsPage } from './components/Settings/SettingsPage'
import { WelcomeScreen } from '@/components/Workspaces/WelcomeScreen'
import { KanbanBoard } from './components/Kanban/Board'
import { FileTree } from './components/Editor/FileTree'
import { FileViewer } from './components/Editor/FileViewer'
import { GitBranchSelector } from './components/Git/GitBranchSelector'
import { RecoveryModal } from './components/RecoveryModal'
import { getSavedRunningTask, useAIChatStore } from './store/aiChatStore'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Separator } from '@/components/ui/separator'

type PageView = 'tasks' | 'files' | 'settings' | 'git';

function App() {
  const [showEngineDropdown, setShowEngineDropdown] = useState(false)
  const [showWelcome, setShowWelcome] = useState(false)
  const [showRecovery, setShowRecovery] = useState(false)
  const [currentPage, setCurrentPage] = useState<PageView>('tasks')
  const [selectedFile, setSelectedFile] = useState<string | undefined>(undefined)
  const { engines, activeEngine, setActiveEngine, fetchEngines, seedDefaultEngines, isLoading } = useEngineStore()
  const { activeWorkspace, loadActiveWorkspace, loadWorkspaces } = useWorkspaceStore()
  const { setCurrentWorkspace } = useTaskStore()
  const { moveTask, tasks } = useTaskStore()
  const { enqueueTask } = useAIChatStore()
  const { scale, zoomIn, zoomOut, resetZoom } = useZoomStore()
  
  // RTK Status
  const [rtkInstalled, setRtkInstalled] = useState(false)
  const [rtkStats, setRtkStats] = useState<{ total_saved: number; avg_savings: number } | null>(null)

  // Check for saved running task on mount
  useEffect(() => {
    const savedTask = getSavedRunningTask()
    if (savedTask) {
      setShowRecovery(true)
    }
  }, [])

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
    const init = async () => {
      await loadActiveWorkspace()
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

  // Render main content based on current page
  const renderMainContent = () => {
    switch (currentPage) {
      case 'tasks':
        return <KanbanBoard />
      
      case 'files':
        return (
          <div className="h-full flex">
            {/* Left: File Tree */}
            <div className="w-[300px] shrink-0 border-r border-white/5">
              {activeWorkspace ? (
                <FileTree 
                  rootPath={activeWorkspace.folder_path}
                  rootName={activeWorkspace.name}
                  selectedPath={selectedFile}
                  onFileSelect={setSelectedFile}
                />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-xs text-neutral-500 font-geist">No workspace selected</p>
                </div>
              )}
            </div>
            {/* Right: File Content */}
            <div className="flex-1 flex flex-col overflow-hidden bg-app-bg relative">
              {selectedFile ? (
                <FileViewer filePath={selectedFile} />
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-neutral-500">
                  <div className="text-center">
                    <FolderOpen className="w-12 h-12 text-neutral-700/50 mb-3 mx-auto" />
                    <p className="text-sm font-geist">Select a file from the explorer</p>
                  </div>
                </div>
              )}
            </div>
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
      
      case 'git':
        return (
          <div className="h-full flex items-center justify-center text-neutral-500">
            <div className="text-center">
              <GitBranch className="w-12 h-12 text-neutral-600 mb-4 mx-auto" />
              <h2 className="text-lg font-semibold text-white font-geist mb-2">
                Git Workflow
              </h2>
              <p className="text-sm font-geist text-neutral-400">
                Stage → Commit → Tag → Push
              </p>
              <p className="text-xs font-geist text-neutral-600 mt-4">
                Coming soon...
              </p>
            </div>
          </div>
        )

    }
  }

  const menuItems = [
    { id: 'tasks' as const, icon: LayoutList, label: 'Tasks' },
    { id: 'files' as const, icon: FolderOpen, label: 'Files' },
    { id: 'settings' as const, icon: Settings, label: 'Settings' },
    { id: 'git' as const, icon: GitBranch, label: 'Git' },
  ]

  return (
    <div className="h-screen w-screen bg-app-bg text-app-text overflow-hidden flex flex-col font-geist">
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
        
        {/* Center: Workspace Indicator */}
        <div className="flex-1 flex items-center justify-center relative z-[60]">
          {activeWorkspace ? (
              <div className="flex items-center gap-3 pointer-events-auto">
              <div className="flex items-center gap-2 pointer-events-none">
                <Folder className="w-3.5 h-3.5 text-app-accent" />
                <span className="text-xs font-medium text-white font-geist select-none">
                  {activeWorkspace.name}
                </span>
                <span className="text-xs text-neutral-600 font-geist select-none">
                  {activeWorkspace.folder_path.split('/').slice(-2).join('/')}
                </span>
              </div>
              {/* Git Branch Selector */}
              <div className="pointer-events-auto" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
                <GitBranchSelector workspacePath={activeWorkspace.folder_path} />
              </div>
            </div>
          ) : (
            <span className="text-xs font-medium text-neutral-500 font-geist select-none pointer-events-none">Akira</span>
          )}
        </div>
        
        {/* Right: Engine & Settings */}
        <div className="flex items-center gap-1 pr-4 relative z-10" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {/* Engine Selector */}
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center gap-1.5 h-7 px-2 text-xs rounded-md hover:bg-accent hover:text-accent-foreground">
              <Cpu className="size-3.5" />
              <span className="capitalize">{activeEngine?.alias || 'Engine'}</span>
              {activeEngine?.model && (
                <Badge variant="secondary" className="text-[10px] h-4 px-1">{activeEngine.model}</Badge>
              )}
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
                    <div className="flex flex-col gap-0.5">
                      <span className="capitalize">{engine.alias}</span>
                      {engine.model && (
                        <span className="text-[10px] text-muted-foreground">{engine.model}</span>
                      )}
                    </div>
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
      <div className="flex flex-1 overflow-hidden">
        {/* Navigation Sidebar (Left) */}
        <nav className="w-14 shrink-0 bg-app-sidebar backdrop-blur-md flex flex-col items-center py-4 gap-2 border-r border-app-border z-10">
          {menuItems.map((item) => {
            const Icon = item.icon
            const isActive = currentPage === item.id
            
            return (
              <Tooltip key={item.id}>
                <TooltipTrigger
                  className="inline-flex items-center justify-center rounded-xl transition-all duration-300"
                  onClick={() => setCurrentPage(item.id)}
                >
                  <div className={`size-10 rounded-xl flex items-center justify-center relative transition-all duration-300 ${isActive ? 'bg-app-accent-glow text-app-accent shadow-[0_0_15px_var(--app-accent-glow)]' : 'text-app-text-muted hover:text-app-text hover:bg-app-panel'}`}>
                    <Icon className="size-[22px]" />
                    {isActive && (
                      <div className="absolute -left-2 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-app-accent rounded-r-full shadow-[0_0_8px_var(--app-accent)]" />
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right">
                  {item.label}
                </TooltipContent>
              </Tooltip>
            )
          })}
        </nav>

        {/* Main Content Area */}
        <div className="flex-1 bg-app-bg overflow-auto relative m-0">
          <main 
            className="h-full p-4 origin-top-left"
            style={{ 
              transform: `scale(${scale})`,
              width: `${100 / scale}%`,
              height: `${100 / scale}%`
            }}
          >
            {renderMainContent()}
          </main>
        </div>
      </div>
    </div>
  )
}

export default App
