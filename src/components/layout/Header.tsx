import { useState } from 'react'
import { Settings } from 'lucide-react'
import { SettingsModal } from '@/components/SettingsModal'

export function Header() {
  const [showSettings, setShowSettings] = useState(false)

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
        
        {/* Right - Settings */}
        <div className="flex items-center gap-2">
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
