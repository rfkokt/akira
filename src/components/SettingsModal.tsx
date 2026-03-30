import { useState, useEffect } from 'react'
import { X, Plus, Trash2, Cpu, Zap, ChevronRight, Loader2, AlertTriangle, Check, Wallet } from 'lucide-react'
import { useEngineStore } from '@/store'
import { invoke } from '@tauri-apps/api/core'
import { dbService } from '@/lib/db'
import type { CreateEngineRequest, RouterProviderInfo } from '@/types'

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
  const [activeTab, setActiveTab] = useState<'engines' | 'rtk' | 'router'>('engines')
  const [newEngine, setNewEngine] = useState<CreateEngineRequest>({
    alias: '',
    binary_path: '',
    model: '',
    args: '',
  })

  useEffect(() => {
    if (isOpen) {
      fetchEngines()
    }
  }, [isOpen, fetchEngines])

  const handleAddEngine = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newEngine.alias.trim() || !newEngine.binary_path.trim()) return
    
    await createEngine(newEngine)
    setNewEngine({ alias: '', binary_path: '', model: '', args: '' })
    setShowAddEngine(false)
  }

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-[#252526] border border-white/10 rounded-lg w-full max-w-2xl max-h-[80vh] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-[#2d2d2d]">
          <h2 className="text-sm font-semibold text-white font-geist">Settings</h2>
          <button 
            onClick={onClose}
            className="p-1 rounded text-neutral-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/5">
          <button
            onClick={() => setActiveTab('engines')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium transition-colors font-geist ${
              activeTab === 'engines'
                ? 'text-white border-b-2 border-[#0e639c]'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            CLI Engines
          </button>
          <button
            onClick={() => setActiveTab('rtk')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium transition-colors font-geist ${
              activeTab === 'rtk'
                ? 'text-white border-b-2 border-[#0e639c]'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            RTK
          </button>
          <button
            onClick={() => setActiveTab('router')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium transition-colors font-geist ${
              activeTab === 'router'
                ? 'text-white border-b-2 border-[#0e639c]'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            Router
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[60vh]">
          {activeTab === 'engines' && (
            <EnginesTab
              engines={engines}
              isLoading={isLoading}
              error={error}
              showAddEngine={showAddEngine}
              newEngine={newEngine}
              setShowAddEngine={setShowAddEngine}
              setNewEngine={setNewEngine}
              handleAddEngine={handleAddEngine}
              toggleEngine={toggleEngine}
              deleteEngine={deleteEngine}
              handleSeedDefaults={handleSeedDefaults}
              isSeeding={isSeeding}
            />
          )}
          {activeTab === 'rtk' && (
            <RTKTab />
          )}
          {activeTab === 'router' && (
            <RouterTab />
          )}
        </div>
      </div>
    </div>
  )
}

function EnginesTab({ engines, isLoading, error, showAddEngine, newEngine, setShowAddEngine, setNewEngine, handleAddEngine, toggleEngine, deleteEngine, handleSeedDefaults, isSeeding }: {
  engines: any[]
  isLoading: boolean
  error: string | null
  showAddEngine: boolean
  newEngine: CreateEngineRequest
  setShowAddEngine: (v: boolean) => void
  setNewEngine: (v: CreateEngineRequest) => void
  handleAddEngine: (e: React.FormEvent) => void
  toggleEngine: (id: number, enabled: boolean) => void
  deleteEngine: (id: number) => void
  handleSeedDefaults: () => void
  isSeeding: boolean
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-neutral-400" />
          <h3 className="text-sm font-medium text-white font-geist">CLI Engines</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddEngine(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#0e639c] hover:bg-[#1177bb] rounded-md transition-colors font-geist"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Engine
          </button>
          <button
            onClick={handleSeedDefaults}
            disabled={isSeeding}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:text-white hover:bg-white/5 rounded-md transition-colors font-geist disabled:opacity-50"
          >
            {isSeeding ? 'Seeding...' : 'Seed Defaults'}
          </button>
        </div>
      </div>

      {error && (
        <div className="text-xs text-red-400 bg-red-400/10 p-2 rounded mb-2">
          Error: {error}
        </div>
      )}

      {isLoading ? (
        <div className="text-sm text-neutral-400 font-geist">Loading engines...</div>
      ) : engines.length === 0 ? (
        <div className="text-sm text-neutral-500 font-geist py-4">
          No engines configured. Add your first CLI engine below.
        </div>
      ) : (
        <div className="space-y-1">
          {engines.map(engine => (
            <div 
              key={engine.id}
              className="flex items-center justify-between p-2.5 bg-[#2d2d2d] rounded-md hover:bg-[#3c3c3c] transition-colors"
            >
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={engine.enabled}
                  onChange={(e) => toggleEngine(engine.id, e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-white/20 bg-[#3c3c3c] text-[#0e639c] focus:ring-0"
                />
                <div>
                  <div className="text-sm font-medium text-white font-geist capitalize flex items-center gap-2">
                    {engine.alias}
                    {engine.model && (
                      <span className="text-xs px-1.5 py-0.5 bg-[#0e639c]/20 text-[#0e639c] rounded">
                        {engine.model}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-neutral-500 font-geist">
                    {engine.binary_path} {engine.args}
                  </div>
                </div>
              </div>
              <button
                onClick={() => deleteEngine(engine.id)}
                className="p-1.5 rounded text-neutral-500 hover:text-red-400 hover:bg-red-400/10 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {showAddEngine && (
        <form onSubmit={handleAddEngine} className="mt-3 p-3 bg-[#2d2d2d] rounded-md space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-neutral-400 mb-1 font-geist">Alias</label>
              <input
                type="text"
                value={newEngine.alias}
                onChange={(e) => setNewEngine({ ...newEngine, alias: e.target.value })}
                placeholder="e.g. claude"
                className="w-full px-2.5 py-1.5 rounded text-sm bg-[#3c3c3c] text-white placeholder-white/40 border border-white/10 focus:outline-none focus:border-[#0e639c] font-geist"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-400 mb-1 font-geist">Binary Path</label>
              <input
                type="text"
                value={newEngine.binary_path}
                onChange={(e) => setNewEngine({ ...newEngine, binary_path: e.target.value })}
                placeholder="e.g. claude"
                className="w-full px-2.5 py-1.5 rounded text-sm bg-[#3c3c3c] text-white placeholder-white/40 border border-white/10 focus:outline-none focus:border-[#0e639c] font-geist"
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-neutral-400 mb-1 font-geist">Model (optional)</label>
              <input
                type="text"
                value={newEngine.model}
                onChange={(e) => setNewEngine({ ...newEngine, model: e.target.value })}
                placeholder="e.g. claude-3-5-sonnet-20241022"
                className="w-full px-2.5 py-1.5 rounded text-sm bg-[#3c3c3c] text-white placeholder-white/40 border border-white/10 focus:outline-none focus:border-[#0e639c] font-geist"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-400 mb-1 font-geist">Args</label>
              <input
                type="text"
                value={newEngine.args}
                onChange={(e) => setNewEngine({ ...newEngine, args: e.target.value })}
                placeholder="e.g. --dangerously-skip-permissions"
                className="w-full px-2.5 py-1.5 rounded text-sm bg-[#3c3c3c] text-white placeholder-white/40 border border-white/10 focus:outline-none focus:border-[#0e639c] font-geist"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddEngine(false)}
              className="px-3 py-1.5 rounded text-xs font-medium text-neutral-300 hover:text-white hover:bg-white/5 font-geist transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3 py-1.5 rounded text-xs font-medium text-white bg-[#0e639c] hover:bg-[#1177bb] font-geist transition-colors"
            >
              Add Engine
            </button>
          </div>
        </form>
      )}
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
      // Use akira project folder as git repo
      const cwd = '/Volumes/External M4/Project/ars-ai/akira'
      console.log('[RTK Test] Starting with cwd:', cwd)
      
      const result = await invoke<RtkCommandResult>('run_rtk_command', {
        subcommand: 'git',
        args: ['diff', 'HEAD~5'],
        cwd: cwd
      })
      
      console.log('[RTK Test] Result:', result)
      setTestResult(result)
      setTestOutput(result.output || 'No output')
    } catch (e) {
      console.error('[RTK Test] Error:', e)
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
      {/* Status Section */}
      <div className="p-3 bg-[#2d2d2d] rounded-md">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-yellow-500" />
            <h3 className="text-sm font-medium text-white font-geist">RTK Status</h3>
          </div>
          <button
            onClick={checkStatus}
            disabled={isChecking}
            className="px-2.5 py-1 text-xs rounded bg-white/5 text-neutral-300 hover:bg-white/10 font-geist transition-colors disabled:opacity-50"
          >
            {isChecking ? 'Checking...' : 'Refresh'}
          </button>
        </div>

        <div className="space-y-1.5 text-xs font-geist">
          <div className="flex items-center gap-2">
            <span className="text-neutral-400">Status:</span>
            <span className={rtkStatus?.installed ? 'text-green-400' : 'text-red-400'}>
              {rtkStatus?.installed ? '✅ Installed' : '❌ Not installed'}
            </span>
          </div>
          {rtkStatus?.version && (
            <div className="flex items-center gap-2">
              <span className="text-neutral-400">Version:</span>
              <span className="text-white">{rtkStatus.version}</span>
            </div>
          )}
          {rtkStatus?.path && (
            <div className="flex items-center gap-2">
              <span className="text-neutral-400">Path:</span>
              <span className="text-white/60 font-mono text-[10px]">{rtkStatus.path}</span>
            </div>
          )}
          {rtkStatus?.error && (
            <div className="text-red-400">Error: {rtkStatus.error}</div>
          )}
        </div>

        {!rtkStatus?.installed && (
          <button
            onClick={installRTK}
            disabled={isInstalling}
            className="mt-3 w-full px-3 py-2 text-xs rounded bg-yellow-600 hover:bg-yellow-500 text-white font-medium font-geist transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isInstalling ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Installing RTK...
              </>
            ) : (
              <>
                <Zap className="w-3.5 h-3.5" />
                Install RTK v0.34.1
              </>
            )}
          </button>
        )}
      </div>

      {/* RTK Init Guidance */}
      {rtkStatus?.installed && (
        <div className="p-3 bg-yellow-900/20 border border-yellow-600/30 rounded-md">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1 space-y-1.5 text-xs font-geist">
              <p className="text-yellow-200 font-medium">Important: Run `rtk init -g` for maximum savings!</p>
              <p className="text-neutral-400">
                Without initialization, savings are minimal (~1-5%). 
                With <code className="text-yellow-400 bg-black/30 px-1 rounded">rtk init -g</code>, savings reach 60-90%.
              </p>
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={initRTK}
                  disabled={isInitializing}
                  className="px-3 py-1.5 text-xs rounded bg-yellow-600 hover:bg-yellow-500 text-white font-medium font-geist transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isInitializing ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Initializing...
                    </>
                  ) : (
                    <>
                      <Zap className="w-3 h-3" />
                      Initialize RTK
                    </>
                  )}
                </button>
                {initMessage && (
                  <span className={`text-xs ${initMessage.includes('Error') ? 'text-red-400' : 'text-green-400'}`}>
                    {initMessage}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Test Section */}
      {rtkStatus?.installed && (
        <>
          <div className="p-3 bg-[#2d2d2d] rounded-md">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-white font-geist">Quick Test</h3>
              <button
                onClick={runTest}
                disabled={isTesting}
                className="px-3 py-1.5 text-xs rounded bg-[#0e639c] hover:bg-[#1177bb] text-white font-medium font-geist transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {isTesting ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Running...
                  </>
                ) : (
                  <>
                    <Zap className="w-3 h-3" />
                    Run git diff
                  </>
                )}
              </button>
            </div>

            {testResult && (
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-2 text-xs font-geist">
                  <div className="p-2 bg-[#3c3c3c] rounded">
                    <div className="text-neutral-400">Input</div>
                    <div className="text-white font-mono">{testResult.input_tokens} tok</div>
                  </div>
                  <div className="p-2 bg-[#3c3c3c] rounded">
                    <div className="text-neutral-400">Output</div>
                    <div className="text-white font-mono">{testResult.output_tokens} tok</div>
                  </div>
                  <div className="p-2 bg-[#3c3c3c] rounded">
                    <div className="text-neutral-400">Saved</div>
                    <div className="text-green-400 font-mono font-bold">{testResult.savings_pct.toFixed(1)}%</div>
                  </div>
                </div>

                {testOutput && (
                  <div>
                    <div className="text-xs text-neutral-400 mb-1 font-geist">Output:</div>
                    <pre className="p-2 bg-[#1e1e1e] rounded text-xs text-green-400 font-mono overflow-x-auto max-h-40 overflow-y-auto">
                      {testOutput}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Statistics Section */}
          <div className="p-3 bg-[#2d2d2d] rounded-md">
            <div className="flex items-center justify-between mb-2">
              <button
                onClick={() => setExpandedSection(expandedSection === 'stats' ? null : 'stats')}
                className="flex items-center gap-2 hover:text-white transition-colors"
              >
                <ChevronRight className={`w-3 h-3 text-neutral-400 transition-transform ${expandedSection === 'stats' ? 'rotate-90' : ''}`} />
                <h3 className="text-sm font-medium text-white font-geist">Statistics (30 days)</h3>
              </button>
              <button
                onClick={() => getStats()}
                className="px-2 py-1 text-xs rounded bg-white/5 text-neutral-300 hover:bg-white/10 font-geist"
              >
                Refresh
              </button>
            </div>

            {expandedSection === 'stats' && stats && (
              <div className="mt-3 space-y-2 text-xs font-geist">
                <div className="grid grid-cols-3 gap-2">
                  <div className="p-2 bg-[#3c3c3c] rounded">
                    <div className="text-neutral-400">Commands</div>
                    <div className="text-white font-medium">{stats.total_commands}</div>
                  </div>
                  <div className="p-2 bg-[#3c3c3c] rounded">
                    <div className="text-neutral-400">Tokens Saved</div>
                    <div className="text-green-400 font-medium">{stats.total_saved.toLocaleString()}</div>
                  </div>
                  <div className="p-2 bg-[#3c3c3c] rounded">
                    <div className="text-neutral-400">Avg Savings</div>
                    <div className="text-yellow-400 font-medium">{stats.avg_savings.toFixed(1)}%</div>
                  </div>
                </div>

                {stats.top_commands.length > 0 && (
                  <div className="mt-3">
                    <div className="text-neutral-400 mb-1.5">Top Commands:</div>
                    <div className="space-y-1">
                      {stats.top_commands.map((cmd, i) => (
                        <div key={i} className="flex items-center justify-between p-2 bg-[#3c3c3c] rounded text-xs">
                          <span className="text-white font-mono truncate flex-1 mr-2">{cmd.cmd}</span>
                          <span className="text-neutral-400">{cmd.count}x</span>
                          <span className="text-green-400 ml-2">{cmd.avg_savings.toFixed(0)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {stats.total_commands === 0 && (
                  <div className="text-center text-neutral-500 py-4">
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
      <div className="p-3 bg-[#2d2d2d] rounded-md">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="w-4 h-4 text-yellow-500" />
          <h3 className="text-sm font-medium text-white font-geist">Router Configuration</h3>
        </div>

        <div className="space-y-3">
          <label className="flex items-center justify-between p-2 bg-[#3c3c3c] rounded cursor-pointer hover:bg-[#4c4c4c] transition-colors">
            <div>
              <div className="text-xs text-white font-geist">Auto-Switch Provider</div>
              <div className="text-[10px] text-neutral-400 font-geist">Automatically switch when token limit is reached</div>
            </div>
            <div 
              className={`w-10 h-5 rounded-full transition-colors relative ${autoSwitchEnabled ? 'bg-[#0e639c]' : 'bg-[#5a5a5a]'}`}
              onClick={() => setAutoSwitchEnabled(!autoSwitchEnabled)}
            >
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${autoSwitchEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
          </label>

          {autoSwitchEnabled && (
            <label className="flex items-center justify-between p-2 bg-[#3c3c3c] rounded cursor-pointer hover:bg-[#4c4c4c] transition-colors">
              <div>
                <div className="text-xs text-white font-geist">Confirm Before Switch</div>
                <div className="text-[10px] text-neutral-400 font-geist">Ask for confirmation when switching providers</div>
              </div>
              <div 
                className={`w-10 h-5 rounded-full transition-colors relative ${confirmBeforeSwitch ? 'bg-[#0e639c]' : 'bg-[#5a5a5a]'}`}
                onClick={() => setConfirmBeforeSwitch(!confirmBeforeSwitch)}
              >
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${confirmBeforeSwitch ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </div>
            </label>
          )}

          <div className="p-2 bg-[#3c3c3c] rounded">
            <div className="text-xs text-white font-geist mb-2">Token Limit Threshold</div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="50000"
                max="300000"
                step="10000"
                value={tokenLimitThreshold}
                onChange={(e) => setTokenLimitThreshold(parseInt(e.target.value))}
                className="flex-1 h-1.5 bg-[#5a5a5a] rounded-full appearance-none cursor-pointer accent-[#0e639c]"
              />
              <span className="text-xs text-white font-mono w-20 text-right">
                {tokenLimitThreshold.toLocaleString()}
              </span>
            </div>
          </div>

          <div className="p-2 bg-[#3c3c3c] rounded">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Wallet className="w-3.5 h-3.5 text-yellow-500" />
                <div className="text-xs text-white font-geist">Budget Limit</div>
              </div>
              <span className="text-xs text-yellow-400 font-mono">
                {budgetLimit === 0 ? 'Unlimited' : `$${budgetLimit.toFixed(2)}`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={budgetLimit}
                onChange={(e) => setBudgetLimit(parseInt(e.target.value))}
                className="flex-1 h-1.5 bg-[#5a5a5a] rounded-full appearance-none cursor-pointer accent-yellow-500"
              />
              <span className="text-xs text-neutral-400 font-mono w-12 text-right">
                {budgetLimit === 0 ? 'Off' : `$${budgetLimit}`}
              </span>
            </div>
            <div className="text-[10px] text-neutral-500 mt-1.5">
              Set to 0 for unlimited budget
            </div>
          </div>

          {budgetLimit > 0 && (
            <div className="p-2 bg-[#3c3c3c] rounded">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />
                  <div className="text-xs text-white font-geist">Alert Threshold</div>
                </div>
                <span className="text-xs text-orange-400 font-mono">
                  {(budgetAlertThreshold * 100).toFixed(0)}%
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="50"
                  max="95"
                  step="5"
                  value={budgetAlertThreshold * 100}
                  onChange={(e) => setBudgetAlertThreshold(parseInt(e.target.value) / 100)}
                  className="flex-1 h-1.5 bg-[#5a5a5a] rounded-full appearance-none cursor-pointer accent-orange-500"
                />
                <span className="text-xs text-neutral-400 font-mono w-12 text-right">
                  {(budgetAlertThreshold * 100).toFixed(0)}%
                </span>
              </div>
              <div className="text-[10px] text-neutral-500 mt-1.5">
                Alert when {(budgetLimit * budgetAlertThreshold).toFixed(2)} spent
              </div>
            </div>
          )}

          <div className="p-2 bg-[#3c3c3c] rounded">
            <div className="text-xs text-white font-geist mb-2">Fallback Order</div>
            <div className="space-y-1">
              {fallbackOrder.map((alias, index) => (
                <div key={alias} className="flex items-center justify-between p-1.5 bg-[#2d2d2d] rounded">
                  <span className="text-xs text-white font-geist">{alias}</span>
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => moveProvider(index, 'up')}
                      disabled={index === 0}
                      className="p-1 text-neutral-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ChevronRight className="w-3 h-3 rotate-180" />
                    </button>
                    <button
                      onClick={() => moveProvider(index, 'down')}
                      disabled={index === fallbackOrder.length - 1}
                      className="p-1 text-neutral-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="text-[10px] text-neutral-500 mt-1.5 font-geist">
              Providers at top have higher priority
            </div>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={isSaving}
          className={`mt-3 w-full px-3 py-2 text-xs rounded font-medium font-geist transition-colors flex items-center justify-center gap-2 ${
            saveSuccess 
              ? 'bg-green-600 text-white' 
              : 'bg-[#0e639c] hover:bg-[#1177bb] text-white'
          }`}
        >
          {isSaving ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Saving...
            </>
          ) : saveSuccess ? (
            <>
              <Check className="w-3.5 h-3.5" />
              Saved!
            </>
          ) : (
            'Save Configuration'
          )}
        </button>
      </div>

      <div className="p-3 bg-[#2d2d2d] rounded-md">
        <div className="flex items-center gap-2 mb-3">
          <Cpu className="w-4 h-4 text-neutral-400" />
          <h3 className="text-sm font-medium text-white font-geist">Registered Providers</h3>
        </div>
        
        <div className="space-y-1">
          {providers.map(provider => (
            <div 
              key={provider.alias}
              className="flex items-center justify-between p-2 bg-[#3c3c3c] rounded"
            >
              <div>
                <div className="text-xs text-white font-geist capitalize">{provider.alias}</div>
                <div className="text-[10px] text-neutral-500 font-mono">{provider.binary_path}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                  provider.status === 'idle' ? 'bg-green-500/20 text-green-400' :
                  provider.status === 'running' ? 'bg-blue-500/20 text-blue-400' :
                  provider.status === 'error' ? 'bg-red-500/20 text-red-400' :
                  'bg-yellow-500/20 text-yellow-400'
                }`}>
                  {provider.status}
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                  provider.enabled ? 'bg-green-500/20 text-green-400' : 'bg-neutral-500/20 text-neutral-400'
                }`}>
                  {provider.enabled ? 'enabled' : 'disabled'}
                </span>
              </div>
            </div>
          ))}
          
          {providers.length === 0 && (
            <div className="text-xs text-neutral-500 text-center py-3">
              No providers registered. Add engines in the CLI Engines tab.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
