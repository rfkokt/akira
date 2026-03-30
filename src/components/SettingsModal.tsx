import { useState, useEffect } from 'react'
import { Plus, Trash2, Cpu, Zap, ChevronRight, Loader2, AlertTriangle, Check, Wallet } from 'lucide-react'
import { useEngineStore } from '@/store'
import { invoke } from '@tauri-apps/api/core'
import { dbService } from '@/lib/db'
import type { CreateEngineRequest, RouterProviderInfo } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

interface RtkStatus {
  installed: boolean
  path: string | null
  version: string | null
  error: string | null
}

interface RtkCommandResult {
  success: boolean
  output: string
  input_tokens: number
  output_tokens: number
  savings_pct: number
  raw_output?: string
}

interface RtkStats {
  total_commands: number
  total_saved: number
  avg_savings: number
  top_commands: Array<{ cmd: string; count: number; avg_savings: number }>
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { engines, fetchEngines, createEngine, deleteEngine, toggleEngine, seedDefaultEngines, isLoading, error } = useEngineStore()
  const [showAddEngine, setShowAddEngine] = useState(false)
  const [isSeeding, setIsSeeding] = useState(false)

  useEffect(() => {
    if (isOpen) {
      fetchEngines()
    }
  }, [isOpen, fetchEngines])

  const handleSeedDefaults = async () => {
    setIsSeeding(true)
    try {
      await seedDefaultEngines()
    } catch (err) {
      console.error('Seed error:', err)
    } finally {
      setIsSeeding(false)
    }
  }

  if (!isOpen) return null

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cpu className="size-4" />
            Settings
          </DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="h-[60vh] pr-4">
          <Tabs defaultValue="engines" className="w-full">
            <TabsList className="w-full grid grid-cols-3">
              <TabsTrigger value="engines" className="gap-1.5">
                <Cpu className="size-3.5" />
                CLI Engines
              </TabsTrigger>
              <TabsTrigger value="rtk" className="gap-1.5">
                <Zap className="size-3.5" />
                RTK
              </TabsTrigger>
              <TabsTrigger value="router" className="gap-1.5">
                <Zap className="size-3.5" />
                Router
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="engines" className="mt-4">
              <EnginesTab
                engines={engines}
                isLoading={isLoading}
                error={error}
                showAddEngine={showAddEngine}
                setShowAddEngine={setShowAddEngine}
                createEngine={createEngine}
                toggleEngine={toggleEngine}
                deleteEngine={deleteEngine}
                handleSeedDefaults={handleSeedDefaults}
                isSeeding={isSeeding}
              />
            </TabsContent>
            
            <TabsContent value="rtk" className="mt-4">
              <RTKTab />
            </TabsContent>
            
            <TabsContent value="router" className="mt-4">
              <RouterTab />
            </TabsContent>
          </Tabs>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

function EnginesTab({ engines, isLoading, error, showAddEngine, setShowAddEngine, createEngine, toggleEngine, deleteEngine, handleSeedDefaults, isSeeding }: {
  engines: any[]
  isLoading: boolean
  error: string | null
  showAddEngine: boolean
  setShowAddEngine: (v: boolean) => void
  createEngine: (engine: CreateEngineRequest) => Promise<void>
  toggleEngine: (id: number, enabled: boolean) => void
  deleteEngine: (id: number) => void
  handleSeedDefaults: () => void
  isSeeding: boolean
}) {
  const [newEngine, setNewEngine] = useState<CreateEngineRequest>({
    alias: '',
    binary_path: '',
    model: '',
    args: '',
  })

  const handleAddEngine = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newEngine.alias.trim() || !newEngine.binary_path.trim()) return
    
    await createEngine(newEngine)
    setNewEngine({ alias: '', binary_path: '', model: '', args: '' })
    setShowAddEngine(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">CLI Engines</h3>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleSeedDefaults} disabled={isSeeding}>
            {isSeeding ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Seeding...
              </>
            ) : (
              'Seed Defaults'
            )}
          </Button>
          <Button size="sm" onClick={() => setShowAddEngine(true)}>
            <Plus className="size-3.5" />
            Add Engine
          </Button>
        </div>
      </div>

      {error && (
        <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">
          Error: {error}
        </div>
      )}

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading engines...</div>
      ) : engines.length === 0 ? (
        <div className="text-sm text-muted-foreground py-4">
          No engines configured. Add your first CLI engine below.
        </div>
      ) : (
        <div className="space-y-2">
          {engines.map(engine => (
            <div 
              key={engine.id}
              className="flex items-center justify-between p-3 bg-muted rounded-lg hover:bg-muted/80 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={engine.enabled}
                  onCheckedChange={(checked) => toggleEngine(engine.id, !!checked)}
                />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium capitalize">{engine.alias}</span>
                    {engine.model && (
                      <Badge variant="secondary" className="text-[10px]">{engine.model}</Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {engine.binary_path} {engine.args}
                  </div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => deleteEngine(engine.id)}
              >
                <Trash2 className="size-3.5 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={showAddEngine} onOpenChange={(open) => !open && setShowAddEngine(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Engine</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddEngine} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="alias">Alias</Label>
                <Input
                  id="alias"
                  value={newEngine.alias}
                  onChange={(e) => setNewEngine({ ...newEngine, alias: e.target.value })}
                  placeholder="e.g. claude"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="binary">Binary Path</Label>
                <Input
                  id="binary"
                  value={newEngine.binary_path}
                  onChange={(e) => setNewEngine({ ...newEngine, binary_path: e.target.value })}
                  placeholder="e.g. claude"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="model">Model (optional)</Label>
                <Input
                  id="model"
                  value={newEngine.model}
                  onChange={(e) => setNewEngine({ ...newEngine, model: e.target.value })}
                  placeholder="e.g. claude-3-5-sonnet-20241022"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="args">Args</Label>
                <Input
                  id="args"
                  value={newEngine.args}
                  onChange={(e) => setNewEngine({ ...newEngine, args: e.target.value })}
                  placeholder="e.g. --dangerously-skip-permissions"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowAddEngine(false)}>
                Cancel
              </Button>
              <Button type="submit">Add Engine</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function RTKTab() {
  const [rtkStatus, setRtkStatus] = useState<RtkStatus | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const [isInstalling, setIsInstalling] = useState(false)
  const [isInitializing, setIsInitializing] = useState(false)
  const [initMessage, setInitMessage] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<RtkCommandResult | null>(null)
  const [isTesting, setIsTesting] = useState(false)
  const [stats, setStats] = useState<RtkStats | null>(null)
  const [testOutput, setTestOutput] = useState('')
  const [expandedSection, setExpandedSection] = useState<string | null>(null)

  const checkStatus = async () => {
    setIsChecking(true)
    try {
      const status = await invoke<RtkStatus>('check_rtk_status')
      setRtkStatus(status)
    } catch (e) {
      setRtkStatus({ installed: false, path: null, version: null, error: String(e) })
    }
    setIsChecking(false)
  }

  const installRTK = async () => {
    setIsInstalling(true)
    try {
      const result = await invoke<RtkStatus>('install_rtk')
      setRtkStatus(result)
    } catch (e) {
      setRtkStatus(prev => prev ? { ...prev, error: String(e) } : { installed: false, path: null, version: null, error: String(e) })
    }
    setIsInstalling(false)
  }

  const initRTK = async () => {
    setIsInitializing(true)
    setInitMessage(null)
    try {
      const result = await invoke<{ success: boolean; message: string }>('init_rtk')
      setInitMessage(result.message)
    } catch (e) {
      setInitMessage(`Error: ${e}`)
    }
    setIsInitializing(false)
  }

  const runTest = async () => {
    setIsTesting(true)
    setTestOutput('')
    setTestResult(null)
    setTestOutput('Running git log --oneline -10...')
    try {
      const cwd = '/Volumes/External M4/Project/ars-ai/akira'
      const result = await invoke<RtkCommandResult>('run_rtk_command', {
        subcommand: 'git',
        args: ['diff', 'HEAD~5'],
        cwd: cwd
      })
      setTestResult(result)
      setTestOutput(result.output || 'No output')
    } catch (e) {
      setTestOutput(`Error: ${e}`)
    }
    setIsTesting(false)
  }

  const getStats = async () => {
    try {
      const s = await invoke<RtkStats>('get_rtk_gain_stats', { days: 30 })
      setStats(s)
    } catch (e) {
      console.error('Failed to get stats:', e)
    }
  }

  useEffect(() => {
    checkStatus()
  }, [])

  return (
    <div className="space-y-4">
      <div className="p-4 bg-muted rounded-lg space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="size-4 text-yellow-500" />
            <h3 className="text-sm font-medium">RTK Status</h3>
          </div>
          <Button variant="outline" size="sm" onClick={checkStatus} disabled={isChecking}>
            {isChecking ? 'Checking...' : 'Refresh'}
          </Button>
        </div>

        <div className="space-y-1.5 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Status:</span>
            <span className={rtkStatus?.installed ? 'text-green-500' : 'text-red-500'}>
              {rtkStatus?.installed ? 'Installed' : 'Not installed'}
            </span>
          </div>
          {rtkStatus?.version && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Version:</span>
              <span>{rtkStatus.version}</span>
            </div>
          )}
          {rtkStatus?.path && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Path:</span>
              <span className="font-mono text-[10px] text-muted-foreground/60">{rtkStatus.path}</span>
            </div>
          )}
          {rtkStatus?.error && (
            <div className="text-destructive">Error: {rtkStatus.error}</div>
          )}
        </div>

        {!rtkStatus?.installed && (
          <Button onClick={installRTK} disabled={isInstalling} className="w-full gap-2">
            {isInstalling ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Installing RTK...
              </>
            ) : (
              <>
                <Zap className="size-3.5" />
                Install RTK v0.34.1
              </>
            )}
          </Button>
        )}
      </div>

      {rtkStatus?.installed && (
        <>
          <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg space-y-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="size-4 text-yellow-500 mt-0.5 shrink-0" />
              <div className="flex-1 space-y-1.5 text-xs">
                <p className="font-medium">Important: Run `rtk init -g` for maximum savings!</p>
                <p className="text-muted-foreground">
                  Without initialization, savings are minimal (~1-5%). 
                  With <code className="text-yellow-400 bg-black/30 px-1 rounded">rtk init -g</code>, savings reach 60-90%.
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <Button size="sm" onClick={initRTK} disabled={isInitializing} className="gap-1.5">
                    {isInitializing ? (
                      <>
                        <Loader2 className="size-3 animate-spin" />
                        Initializing...
                      </>
                    ) : (
                      <>
                        <Zap className="size-3" />
                        Initialize RTK
                      </>
                    )}
                  </Button>
                  {initMessage && (
                    <span className={`text-xs ${initMessage.includes('Error') ? 'text-destructive' : 'text-green-500'}`}>
                      {initMessage}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 bg-muted rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Quick Test</h3>
              <Button onClick={runTest} disabled={isTesting} size="sm" className="gap-1.5">
                {isTesting ? (
                  <>
                    <Loader2 className="size-3 animate-spin" />
                    Running...
                  </>
                ) : (
                  <>
                    <Zap className="size-3" />
                    Run git diff
                  </>
                )}
              </Button>
            </div>

            {testResult && (
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  <div className="p-2 bg-background rounded-lg text-center">
                    <div className="text-muted-foreground text-xs">Input</div>
                    <div className="font-mono">{testResult.input_tokens} tok</div>
                  </div>
                  <div className="p-2 bg-background rounded-lg text-center">
                    <div className="text-muted-foreground text-xs">Output</div>
                    <div className="font-mono">{testResult.output_tokens} tok</div>
                  </div>
                  <div className="p-2 bg-background rounded-lg text-center">
                    <div className="text-muted-foreground text-xs">Saved</div>
                    <div className="text-green-500 font-mono font-bold">{testResult.savings_pct.toFixed(1)}%</div>
                  </div>
                </div>

                {testOutput && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Output:</div>
                    <pre className="p-2 bg-background rounded text-xs text-green-500 font-mono overflow-x-auto max-h-40 overflow-y-auto">
                      {testOutput}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="p-4 bg-muted rounded-lg">
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExpandedSection(expandedSection === 'stats' ? null : 'stats')}
                className="gap-2"
              >
                <ChevronRight className={`size-3 text-muted-foreground transition-transform ${expandedSection === 'stats' ? 'rotate-90' : ''}`} />
                <h3 className="text-sm font-medium">Statistics (30 days)</h3>
              </Button>
              <Button variant="ghost" size="sm" onClick={() => getStats()}>
                Refresh
              </Button>
            </div>

            {expandedSection === 'stats' && stats && (
              <div className="mt-3 space-y-2 text-xs">
                <div className="grid grid-cols-3 gap-2">
                  <div className="p-2 bg-background rounded-lg text-center">
                    <div className="text-muted-foreground">Commands</div>
                    <div className="font-medium">{stats.total_commands}</div>
                  </div>
                  <div className="p-2 bg-background rounded-lg text-center">
                    <div className="text-muted-foreground">Tokens Saved</div>
                    <div className="text-green-500 font-medium">{stats.total_saved.toLocaleString()}</div>
                  </div>
                  <div className="p-2 bg-background rounded-lg text-center">
                    <div className="text-muted-foreground">Avg Savings</div>
                    <div className="text-yellow-500 font-medium">{stats.avg_savings.toFixed(1)}%</div>
                  </div>
                </div>

                {stats.top_commands.length > 0 && (
                  <div className="mt-3">
                    <div className="text-muted-foreground mb-1.5">Top Commands:</div>
                    <div className="space-y-1">
                      {stats.top_commands.map((cmd, i) => (
                        <div key={i} className="flex items-center justify-between p-2 bg-background rounded-lg text-xs">
                          <span className="font-mono truncate flex-1 mr-2">{cmd.cmd}</span>
                          <span className="text-muted-foreground">{cmd.count}x</span>
                          <span className="text-green-500 ml-2">{cmd.avg_savings.toFixed(0)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {stats.total_commands === 0 && (
                  <div className="text-center text-muted-foreground py-4">
                    No RTK commands recorded yet. Run a test above!
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function RouterTab() {
  const [providers, setProviders] = useState<RouterProviderInfo[]>([])
  const [autoSwitchEnabled, setAutoSwitchEnabled] = useState(true)
  const [confirmBeforeSwitch, setConfirmBeforeSwitch] = useState(false)
  const [tokenLimitThreshold, setTokenLimitThreshold] = useState(150000)
  const [fallbackOrder, setFallbackOrder] = useState<string[]>([])
  const [budgetLimit, setBudgetLimit] = useState(0)
  const [budgetAlertThreshold, setBudgetAlertThreshold] = useState(0.8)
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    try {
      const [cfg, provs] = await Promise.all([
        dbService.getRouterConfig(),
        dbService.getRouterProviders(),
      ])
      setProviders(provs)
      
      if (cfg) {
        setAutoSwitchEnabled(cfg.auto_switch_enabled)
        setConfirmBeforeSwitch(cfg.confirm_before_switch)
        setTokenLimitThreshold(cfg.token_limit_threshold)
        setFallbackOrder(cfg.fallback_order.split(','))
        setBudgetLimit(cfg.budget_limit)
        setBudgetAlertThreshold(cfg.budget_alert_threshold)
      } else {
        setFallbackOrder(provs.map(p => p.alias))
      }
    } catch (err) {
      console.error('Failed to load router config:', err)
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    setSaveSuccess(false)
    try {
      await dbService.saveRouterConfig(
        autoSwitchEnabled,
        confirmBeforeSwitch,
        tokenLimitThreshold,
        fallbackOrder.join(','),
        budgetLimit,
        budgetAlertThreshold
      )
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2000)
    } catch (err) {
      console.error('Failed to save router config:', err)
    }
    setIsSaving(false)
  }

  const moveProvider = (index: number, direction: 'up' | 'down') => {
    const newOrder = [...fallbackOrder]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= newOrder.length) return
    ;[newOrder[index], newOrder[targetIndex]] = [newOrder[targetIndex], newOrder[index]]
    setFallbackOrder(newOrder)
  }

  return (
    <div className="space-y-4">
      <div className="p-4 bg-muted rounded-lg space-y-3">
        <div className="flex items-center gap-2">
          <Zap className="size-4 text-yellow-500" />
          <h3 className="text-sm font-medium">Router Configuration</h3>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-background rounded-lg">
            <div className="space-y-0.5">
              <Label>Auto-Switch Provider</Label>
              <div className="text-[10px] text-muted-foreground">Automatically switch when token limit is reached</div>
            </div>
            <Switch
              checked={autoSwitchEnabled}
              onCheckedChange={setAutoSwitchEnabled}
            />
          </div>

          {autoSwitchEnabled && (
            <div className="flex items-center justify-between p-3 bg-background rounded-lg">
              <div className="space-y-0.5">
                <Label>Confirm Before Switch</Label>
                <div className="text-[10px] text-muted-foreground">Ask for confirmation when switching providers</div>
              </div>
              <Switch
                checked={confirmBeforeSwitch}
                onCheckedChange={setConfirmBeforeSwitch}
              />
            </div>
          )}

          <div className="p-3 bg-background rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Token Limit Threshold</Label>
              <span className="text-xs font-mono text-muted-foreground">
                {tokenLimitThreshold.toLocaleString()}
              </span>
            </div>
            <Input
              type="range"
              min="50000"
              max="300000"
              step="10000"
              value={tokenLimitThreshold}
              onChange={(e) => setTokenLimitThreshold(parseInt(e.target.value))}
              className="h-1.5"
            />
          </div>

          <div className="p-3 bg-background rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wallet className="size-3.5 text-yellow-500" />
                <Label className="text-xs">Budget Limit</Label>
              </div>
              <span className="text-xs text-yellow-500 font-mono">
                {budgetLimit === 0 ? 'Unlimited' : `$${budgetLimit.toFixed(2)}`}
              </span>
            </div>
            <Input
              type="range"
              min="0"
              max="100"
              step="5"
              value={budgetLimit}
              onChange={(e) => setBudgetLimit(parseInt(e.target.value))}
              className="h-1.5"
            />
            <div className="text-[10px] text-muted-foreground">
              Set to 0 for unlimited budget
            </div>
          </div>

          {budgetLimit > 0 && (
            <div className="p-3 bg-background rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="size-3.5 text-orange-500" />
                  <Label className="text-xs">Alert Threshold</Label>
                </div>
                <span className="text-xs text-orange-500 font-mono">
                  {(budgetAlertThreshold * 100).toFixed(0)}%
                </span>
              </div>
              <Input
                type="range"
                min="50"
                max="95"
                step="5"
                value={budgetAlertThreshold * 100}
                onChange={(e) => setBudgetAlertThreshold(parseInt(e.target.value) / 100)}
                className="h-1.5"
              />
              <div className="text-[10px] text-muted-foreground">
                Alert when ${(budgetLimit * budgetAlertThreshold).toFixed(2)} spent
              </div>
            </div>
          )}

          <div className="p-3 bg-background rounded-lg space-y-2">
            <Label className="text-xs">Fallback Order</Label>
            <div className="space-y-1">
              {fallbackOrder.map((alias, index) => (
                <div key={alias} className="flex items-center justify-between p-2 bg-muted rounded">
                  <span className="text-xs">{alias}</span>
                  <div className="flex items-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      onClick={() => moveProvider(index, 'up')}
                      disabled={index === 0}
                    >
                      <ChevronRight className="size-3 rotate-180" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      onClick={() => moveProvider(index, 'down')}
                      disabled={index === fallbackOrder.length - 1}
                    >
                      <ChevronRight className="size-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="text-[10px] text-muted-foreground">
              Providers at top have higher priority
            </div>
          </div>
        </div>

        <Button
          onClick={handleSave}
          disabled={isSaving}
          className={`w-full gap-2 ${saveSuccess ? 'bg-green-600 hover:bg-green-600' : ''}`}
        >
          {isSaving ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Saving...
            </>
          ) : saveSuccess ? (
            <>
              <Check className="size-3.5" />
              Saved!
            </>
          ) : (
            'Save Configuration'
          )}
        </Button>
      </div>

      <div className="p-4 bg-muted rounded-lg">
        <div className="flex items-center gap-2 mb-3">
          <Cpu className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Registered Providers</h3>
        </div>
        
        <div className="space-y-2">
          {providers.map(provider => (
            <div 
              key={provider.alias}
              className="flex items-center justify-between p-3 bg-background rounded-lg"
            >
              <div>
                <div className="text-xs font-medium capitalize">{provider.alias}</div>
                <div className="text-[10px] text-muted-foreground font-mono">{provider.binary_path}</div>
              </div>
              <div className="flex items-center gap-2">
                <Badge 
                  variant={provider.status === 'idle' ? 'default' : provider.status === 'running' ? 'secondary' : 'destructive'}
                  className="text-[10px]"
                >
                  {provider.status}
                </Badge>
                <Badge 
                  variant={provider.enabled ? 'default' : 'outline'}
                  className="text-[10px]"
                >
                  {provider.enabled ? 'enabled' : 'disabled'}
                </Badge>
              </div>
            </div>
          ))}
          
          {providers.length === 0 && (
            <div className="text-xs text-muted-foreground text-center py-3">
              No providers registered. Add engines in the CLI Engines tab.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
