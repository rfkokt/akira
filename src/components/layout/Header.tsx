import { useState, useEffect } from 'react'
import { Settings, Zap, ChevronDown } from 'lucide-react'
import { SettingsModal } from '@/components/SettingsModal'
import { useAIChatStore } from '@/store'
import { dbService } from '@/lib/db'
import type { RouterProviderInfo } from '@/types'

export function Header() {
  const [showSettings, setShowSettings] = useState(false)
  const [providers, setProviders] = useState<RouterProviderInfo[]>([])
  const { useRouter, setUseRouter, routerProvider, setRouterProvider } = useAIChatStore()

  useEffect(() => {
    loadProviders()
  }, [])

  const loadProviders = async () => {
    try {
      await dbService.syncEnginesToRouter()
      const list = await dbService.getRouterProviders()
      setProviders(list)
    } catch (err) {
      console.error('Failed to load router providers:', err)
    }
  }

  const handleToggleRouter = () => {
    setUseRouter(!useRouter)
  }

  const handleSelectProvider = (alias: string) => {
    setRouterProvider(alias)
  }

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
        
        {/* Center - CLI Router Toggle */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleRouter}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors font-geist ${
              useRouter 
                ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30' 
                : 'bg-white/5 text-neutral-400 hover:text-white hover:bg-white/10'
            }`}
            title={useRouter ? 'Disable CLI Router' : 'Enable CLI Router'}
          >
            <Zap className="w-3.5 h-3.5" />
            Router
          </button>
          
          {useRouter && (
            <div className="relative group">
              <button className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium bg-white/5 text-neutral-300 hover:text-white hover:bg-white/10 rounded-md transition-colors font-geist">
                {routerProvider || 'Select Provider'}
                <ChevronDown className="w-3 h-3" />
              </button>
              
              <div className="absolute top-full left-0 mt-1 bg-[#252526] border border-white/10 rounded-md shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 min-w-[160px]">
                {providers.length > 0 ? (
                  providers.map((provider) => (
                    <button
                      key={provider.alias}
                      onClick={() => handleSelectProvider(provider.alias)}
                      className={`w-full px-3 py-2 text-xs text-left hover:bg-white/5 transition-colors first:rounded-t-md last:rounded-b-md ${
                        routerProvider === provider.alias ? 'text-yellow-400 bg-white/5' : 'text-neutral-300'
                      }`}
                    >
                      <div className="font-medium">{provider.alias}</div>
                      <div className="text-neutral-500 text-[10px] mt-0.5">{provider.binary_path}</div>
                    </button>
                  ))
                ) : (
                  <div className="px-3 py-2 text-xs text-neutral-500">No providers available</div>
                )}
              </div>
            </div>
          )}
        </div>
        
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
