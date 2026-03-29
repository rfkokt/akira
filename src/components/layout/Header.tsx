import { useEffect, useState } from 'react'
import { Settings, Cpu, ChevronDown } from 'lucide-react'
import { useEngineStore } from '@/store'
import { SettingsModal } from '@/components/SettingsModal'

export function Header() {
  const { engines, activeEngine, fetchEngines, setActiveEngine } = useEngineStore()
  const [showEngineDropdown, setShowEngineDropdown] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    fetchEngines()
  }, [fetchEngines])

  const enabledEngines = engines.filter(e => e.enabled)

  return (
    <>
      <header className="h-10 bg-[#252526] border-b border-white/5 flex items-center justify-between px-4 shrink-0">
        {/* Left - Navigation */}
        <nav className="flex items-center gap-1">
          <button className="px-3 py-1.5 text-sm font-medium text-white bg-white/10 rounded-md transition-colors font-geist">
            Tasks
          </button>
          <button className="px-3 py-1.5 text-sm font-medium text-neutral-400 hover:text-white hover:bg-white/5 rounded-md transition-colors font-geist">
            Files
          </button>
          <button className="px-3 py-1.5 text-sm font-medium text-neutral-400 hover:text-white hover:bg-white/5 rounded-md transition-colors font-geist">
            Git
          </button>
        </nav>
        
        {/* Right - Engine & Settings */}
        <div className="flex items-center gap-2">
          {/* Engine Selector */}
          <div className="relative">
            <button 
              onClick={() => setShowEngineDropdown(!showEngineDropdown)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-neutral-300 hover:text-white hover:bg-white/5 rounded-md transition-colors font-geist"
            >
              <Cpu className="w-4 h-4" />
              <span className="capitalize">{activeEngine?.alias || 'Select Engine'}</span>
              <ChevronDown className="w-3 h-3" />
            </button>
            
            {/* Engine Dropdown */}
            {showEngineDropdown && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-[#252526] border border-white/10 rounded-md shadow-xl py-1 z-50">
                {enabledEngines.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-neutral-500 font-geist">
                    No engines configured
                  </div>
                ) : (
                  enabledEngines.map(engine => (
                    <button
                      key={engine.id}
                      onClick={() => {
                        setActiveEngine(engine)
                        setShowEngineDropdown(false)
                      }}
                      className={`w-full px-3 py-2 text-left text-sm font-geist hover:bg-white/5 transition-colors ${
                        activeEngine?.id === engine.id ? 'text-white bg-white/10' : 'text-neutral-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="capitalize">{engine.alias}</span>
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
          
          <div className="w-px h-5 bg-white/10 mx-1" />
          
          <button 
            onClick={() => setShowSettings(true)}
            className="p-1.5 text-neutral-400 hover:text-white hover:bg-white/5 rounded-md transition-colors"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />
    </>
  )
}
