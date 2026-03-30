import { useState, useEffect } from 'react'
import { Settings, Zap, ChevronDown, DollarSign } from 'lucide-react'
import { SettingsModal } from '@/components/SettingsModal'
import { CostTrackingDashboard } from '@/components/Router/CostTrackingDashboard'
import { useAIChatStore } from '@/store'
import { dbService } from '@/lib/db'
import type { RouterProviderInfo } from '@/types'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

export function Header() {
  const [showSettings, setShowSettings] = useState(false)
  const [showCostDashboard, setShowCostDashboard] = useState(false)
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
    <TooltipProvider>
      <header className="h-10 bg-[#252526] border-b border-white/5 flex items-center justify-between px-4 shrink-0">
        <nav className="flex items-center gap-1">
          <Button variant="secondary" size="sm" className="text-white bg-white/10">
            Tasks
          </Button>
          <Button variant="ghost" size="sm">
            Files
          </Button>
          <Button variant="ghost" size="sm">
            Git
          </Button>
        </nav>
        
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleToggleRouter}
            className={useRouter ? 'bg-yellow-500/20 text-yellow-400' : ''}
            title={useRouter ? 'Disable CLI Router' : 'Enable CLI Router'}
          >
            <Zap className="w-3.5 h-3.5 mr-1.5" />
            Router
          </Button>
          
          {useRouter && (
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex items-center h-7 px-2 text-xs rounded-md hover:bg-white/10 hover:text-white data-[popup-open]:bg-white/10 data-[popup-open]:text-white transition-colors gap-1">
                <span>{routerProvider || 'Select Provider'}</span>
                <ChevronDown className="w-3 h-3 text-neutral-500" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[160px] bg-[#252526] border border-white/10">
                {providers.length > 0 ? (
                  providers.map((provider) => (
                    <DropdownMenuItem
                      key={provider.alias}
                      onClick={() => handleSelectProvider(provider.alias)}
                      className={routerProvider === provider.alias ? 'text-yellow-400' : ''}
                    >
                      <div className="flex flex-col">
                        <span className="font-medium">{provider.alias}</span>
                        <span className="text-[10px] text-neutral-500">{provider.binary_path}</span>
                      </div>
                    </DropdownMenuItem>
                  ))
                ) : (
                  <div className="px-3 py-2 text-xs text-neutral-500">No providers available</div>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {useRouter && (
            <Tooltip>
              <TooltipTrigger
                className="inline-flex items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground"
                onClick={() => setShowCostDashboard(true)}
              >
                <div className="p-2">
                  <DollarSign className="w-4 h-4" />
                </div>
              </TooltipTrigger>
              <TooltipContent>Cost Tracking Dashboard</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger
              className="inline-flex items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground"
              onClick={() => setShowSettings(true)}
            >
              <div className="p-2">
                <Settings className="w-4 h-4" />
              </div>
            </TooltipTrigger>
            <TooltipContent>Settings</TooltipContent>
          </Tooltip>
        </div>
      </header>

      <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />
      <CostTrackingDashboard isOpen={showCostDashboard} onClose={() => setShowCostDashboard(false)} />
    </TooltipProvider>
  )
}
