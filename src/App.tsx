import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Settings, Cpu, ChevronDown, LayoutList, FolderOpen, Brain, GitBranch } from 'lucide-react'
import { useEngineStore } from '@/store'
import { SettingsModal } from '@/components/SettingsModal'
import { ConfigPanel } from './components/ProjectConfig/ConfigPanel'
import { KanbanBoard } from './components/Kanban/Board'
import { ChatBox } from './components/Chat/ChatBox'
import { FileTree } from './components/Editor/FileTree'

type PageView = 'tasks' | 'files' | 'config' | 'git';

function App() {
  const [greetMsg, setGreetMsg] = useState('')
  const [name, setName] = useState('')
  const [showEngineDropdown, setShowEngineDropdown] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [currentPage, setCurrentPage] = useState<PageView>('tasks')
  const [selectedFile, setSelectedFile] = useState<string | undefined>(undefined)
  const [currentProjectId, setCurrentProjectId] = useState<string>('default-project')
  const { engines, activeEngine, setActiveEngine, fetchEngines, seedDefaultEngines, isLoading } = useEngineStore()

  // Fetch engines on mount, seed defaults if empty
  useEffect(() => {
    const loadEngines = async () => {
      await fetchEngines()
    }
    loadEngines()
  }, [fetchEngines])

  // Auto-seed defaults when engines are empty (run once after initial fetch)
  useEffect(() => {
    const autoSeed = async () => {
      if (engines.length === 0 && !isLoading) {
        console.log('No engines found, seeding defaults...')
        await seedDefaultEngines()
      }
    }
    autoSeed()
  }, [engines.length, isLoading, seedDefaultEngines])

  useEffect(() => {
    const handleClickOutside = () => setShowEngineDropdown(false)
    if (showEngineDropdown) {
      setTimeout(() => window.addEventListener('click', handleClickOutside), 0)
      return () => window.removeEventListener('click', handleClickOutside)
    }
  }, [showEngineDropdown])

  async function greet() {
    try {
      const msg = await invoke('greet', { name })
      setGreetMsg(msg as string)
    } catch (e) {
      console.error('Greet failed:', e)
    }
  }

  const handleDrag = () => {
    const appWindow = getCurrentWindow()
    appWindow.startDragging()
  }

  const enabledEngines = engines.filter(e => e.enabled)

  // Render main content based on current page
  const renderMainContent = () => {
    switch (currentPage) {
      case 'tasks':
        return (
          <>
            <div className="max-w-4xl mb-6">
              <div className="mb-6">
                <h1 className="text-xl font-semibold text-white tracking-tight font-geist">
                  AI-Native Task & Workflow Manager
                </h1>
                <p className="mt-1 text-xs text-neutral-500 font-geist">
                  Manage your tasks with AI-powered workflows
                </p>
              </div>

              <div className="bg-[#252526] rounded border border-white/5 p-3 mb-6">
                <div className="flex items-center gap-3">
                  <input
                    value={name}
                    onChange={(e) => setName(e.currentTarget.value)}
                    placeholder="Enter your name..."
                    className="flex-1 max-w-xs px-2.5 py-1.5 rounded text-xs bg-[#3c3c3c] text-white placeholder-white/40 border border-white/10 focus:outline-none focus:border-[#0e639c] font-geist"
                  />
                  <button
                    type="button"
                    onClick={greet}
                    className="px-3 py-1.5 rounded text-xs font-medium text-white bg-[#0e639c] hover:bg-[#1177bb] transition-colors font-geist"
                  >
                    Greet
                  </button>
                </div>
                {greetMsg && (
                  <p className="mt-2 text-xs text-neutral-300 font-geist">{greetMsg}</p>
                )}
              </div>
            </div>
            <KanbanBoard />
          </>
        )
      
      case 'files':
        return (
          <div className="h-full flex">
            {/* Left: File Tree */}
            <div className="w-[300px] shrink-0 border-r border-white/5">
              <FileTree 
                selectedPath={selectedFile}
                onFileSelect={setSelectedFile}
              />
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
              <ConfigPanel projectId={currentProjectId} />
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
    }
  }

  const menuItems = [
    { id: 'tasks' as const, icon: LayoutList, label: 'Tasks' },
    { id: 'files' as const, icon: FolderOpen, label: 'Files' },
    { id: 'config' as const, icon: Brain, label: 'Config' },
    { id: 'git' as const, icon: GitBranch, label: 'Git' },
  ]

  return (
    <div className="h-screen w-screen bg-[#1e1e1e] text-[#cccccc] overflow-hidden flex flex-col">
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
        
        {/* Center: Title (draggable) */}
        <div className="flex-1 flex items-center justify-center relative z-0 pointer-events-none">
          <span className="text-xs font-medium text-neutral-500 font-geist select-none">KORLAP-X</span>
        </div>
        
        {/* Right: Engine & Settings */}
        <div className="flex items-center gap-2 pr-4 relative z-10" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {/* Engine Selector */}
          <div className="relative">
            <button 
              onClick={(e) => {
                e.stopPropagation()
                setShowEngineDropdown(!showEngineDropdown)
              }}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-neutral-300 hover:text-white hover:bg-white/5 rounded-md transition-colors font-geist"
            >
              <Cpu className="w-3.5 h-3.5" />
              <span className="capitalize">{activeEngine?.alias || 'Engine'}</span>
              {activeEngine?.model && (
                <span className="text-[10px] px-1 py-0.5 bg-[#0e639c]/20 text-[#0e639c] rounded">
                  {activeEngine.model}
                </span>
              )}
              <ChevronDown className="w-3 h-3" />
            </button>
            
            {/* Engine Dropdown */}
            {showEngineDropdown && (
              <div className="absolute right-0 top-full mt-1 w-40 bg-[#252526] border border-white/10 rounded-md shadow-xl py-1 z-50">
                {enabledEngines.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-neutral-500 font-geist">
                    No engines
                  </div>
                ) : (
                  enabledEngines.map(engine => (
                    <button
                      key={engine.id}
                      onClick={(e) => {
                        e.stopPropagation()
                        setActiveEngine(engine)
                        setShowEngineDropdown(false)
                      }}
                      className={`w-full px-3 py-1.5 text-left text-xs font-geist hover:bg-white/5 transition-colors ${
                        activeEngine?.id === engine.id ? 'text-white bg-white/10' : 'text-neutral-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex flex-col">
                          <span className="capitalize">{engine.alias}</span>
                          {engine.model && (
                            <span className="text-[9px] text-neutral-500">{engine.model}</span>
                          )}
                        </div>
                        {activeEngine?.id === engine.id && (
                          <span className="ml-auto text-[10px] text-green-400">●</span>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          
          {/* Settings */}
          <button 
            onClick={() => setShowSettings(true)}
            className="p-1.5 text-neutral-400 hover:text-white hover:bg-white/5 rounded-md transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Navigation Sidebar (Left) */}
        <div className="w-[48px] shrink-0 bg-[#2d2d2d] border-r border-white/5 flex flex-col items-center py-2 gap-1">
          {menuItems.map((item) => {
            const Icon = item.icon
            const isActive = currentPage === item.id
            
            return (
              <button
                key={item.id}
                onClick={() => setCurrentPage(item.id)}
                className={`relative w-10 h-10 flex items-center justify-center rounded-md transition-all group ${
                  isActive 
                    ? 'text-white bg-white/10' 
                    : 'text-neutral-500 hover:text-neutral-300 hover:bg-white/5'
                }`}
                title={item.label}
              >
                <Icon className="w-5 h-5" />
                
                {/* Active indicator */}
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-5 bg-white rounded-r" />
                )}
                
                {/* Tooltip */}
                <div className="absolute left-full ml-2 px-2 py-1 bg-[#252526] border border-white/10 rounded text-xs text-neutral-300 font-geist whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                  {item.label}
                </div>
              </button>
            )
          })}
        </div>

        {/* Main Content Area */}
        <div className="flex-1 bg-[#1e1e1e] overflow-auto">
          <main className="h-full p-4">
            {renderMainContent()}
          </main>
        </div>
      </div>
      <ChatBox />

      <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  )
}

export default App
