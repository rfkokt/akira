import { useState, useEffect, useRef } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Settings, Cpu, LayoutList, FolderOpen, Brain, GitBranch, Folder, ArrowLeftRight, Calendar, Zap, ZoomIn, ZoomOut } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'
import { useEngineStore, useWorkspaceStore, useTaskStore, useZoomStore } from '@/store'
import { SettingsModal } from '@/components/SettingsModal'
import { WelcomeScreen } from '@/components/Workspaces/WelcomeScreen'
import { ConfigPanel } from './components/ProjectConfig/ConfigPanel'
import { KanbanBoard } from './components/Kanban/Board'
import { FileTree } from './components/Editor/FileTree'
import { GitBranchSelector } from './components/Git/GitBranchSelector'
import { AssessmentScheduler } from './components/Assessment'
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

type PageView = 'tasks' | 'files' | 'config' | 'git' | 'assessment';

function App() {
  const [showEngineDropdown, setShowEngineDropdown] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
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
            {/* Right: File Content (placeholder) */}
            <div className="flex-1 flex items-center justify-center text-neutral-500">
              {selectedFile ? (
                <div className="text-center">
                  <p className="text-sm font-geist">Selected: {selectedFile.split('/').pop()}</p>
                  <p className="text-xs font-geist text-neutral-600 mt-1">{selectedFile}</p>
                  <p className="text-xs font-geist text-neutral-600 mt-4">
                    Monaco Editor integration coming soon...
                  </p>
                </div>
              ) : (
                <div className="text-center">
                  <FolderOpen className="w-12 h-12 text-neutral-600 mb-3 mx-auto" />
                  <p className="text-sm font-geist">Select a file from the explorer</p>
                </div>
              )}
            </div>
          </div>
        )
      
      case 'config':
        return (
          <div className="h-full flex">
            {/* Left: Config Panel */}
            <div className="w-[320px] shrink-0 border-r border-white/5">
              {activeWorkspace && (
                <ConfigPanel projectId={activeWorkspace.id} />
              )}
            </div>
            {/* Right: Config Info */}
            <div className="flex-1 flex items-center justify-center text-neutral-500">
              <div className="text-center max-w-md px-4">
                <Brain className="w-12 h-12 text-neutral-600 mb-4 mx-auto" />
                <h2 className="text-lg font-semibold text-white font-geist mb-2">
                  Project Intelligence Config
                </h2>
                <p className="text-sm font-geist text-neutral-400 mb-4">
                  Configure your AI assistant with project-specific context
                </p>
                <div className="text-left text-xs font-geist text-neutral-500 space-y-2 bg-[#252526] p-4 rounded border border-white/5">
                  <p><strong className="text-neutral-400">Persona:</strong> Define AI role & expertise</p>
                  <p><strong className="text-neutral-400">Tech Stack:</strong> Technology context</p>
                  <p><strong className="text-neutral-400">Rules:</strong> Do & Don't guidelines</p>
                  <p><strong className="text-neutral-400">Tone:</strong> Communication style</p>
                </div>
              </div>
            </div>
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

      case 'assessment':
        return <AssessmentScheduler />
    }
  }

  const menuItems = [
    { id: 'tasks' as const, icon: LayoutList, label: 'Tasks' },
    { id: 'files' as const, icon: FolderOpen, label: 'Files' },
    { id: 'assessment' as const, icon: Calendar, label: 'Assessment' },
    { id: 'config' as const, icon: Brain, label: 'Config' },
    { id: 'git' as const, icon: GitBranch, label: 'Git' },
  ]

  return (
    <div className="h-screen w-screen bg-[#1e1e1e] text-[#cccccc] overflow-hidden flex flex-col">
      {/* Welcome Screen */}
      {showWelcome && (
        <WelcomeScreen onClose={() => setShowWelcome(false)} />
      )}

      {/* Recovery Modal */}
      {showRecovery && (
        <RecoveryModal onResume={handleResumeTask} onClose={() => setShowRecovery(false)} />
      )}

      {/* Title Bar */}
      <div className="h-[38px] bg-[#2d2d2d]/95 backdrop-blur border-b border-white/5 flex items-center shrink-0 relative">
        {/* Draggable background */}
        <div 
          className="absolute inset-0"
          data-tauri-drag-region
          onMouseDown={handleDrag}
        />
        
        {/* Left: Spacer untuk traffic lights native */}
        <div className="w-[80px] shrink-0 relative z-0" />
        
        {/* Center: Workspace Indicator */}
        <div className="flex-1 flex items-center justify-center relative z-0">
          {activeWorkspace ? (
            <div className="flex items-center gap-3 pointer-events-auto">
              <div className="flex items-center gap-2 pointer-events-none">
                <Folder className="w-3.5 h-3.5 text-[#dcb67a]" />
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
            <DropdownMenuTrigger>
              <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs">
                <Cpu className="size-3.5" />
                <span className="capitalize">{activeEngine?.alias || 'Engine'}</span>
                {activeEngine?.model && (
                  <Badge variant="secondary" className="text-[10px] h-4 px-1">{activeEngine.model}</Badge>
                )}
              </Button>
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
              onClick={() => setShowSettings(true)}
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
            onClick={() => setShowSettings(true)}
          >
            <Settings className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Main Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Navigation Sidebar (Left) */}
        <nav className="w-12 shrink-0 bg-secondary flex flex-col items-center py-2 gap-1 border-r border-border">
          {menuItems.map((item) => {
            const Icon = item.icon
            const isActive = currentPage === item.id
            
            return (
              <Tooltip key={item.id}>
                <TooltipTrigger>
                  <Button
                    variant={isActive ? 'secondary' : 'ghost'}
                    size="icon"
                    className={`size-12 relative ${isActive ? 'bg-accent' : ''}`}
                    onClick={() => setCurrentPage(item.id)}
                  >
                    <Icon className="size-6" />
                    {isActive && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-6 bg-primary rounded-r" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  {item.label}
                </TooltipContent>
              </Tooltip>
            )
          })}
        </nav>

        {/* Main Content Area */}
        <div className="flex-1 bg-[#1e1e1e] overflow-auto">
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

      <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  )
}

export default App
