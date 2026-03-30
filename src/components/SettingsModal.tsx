import { useState, useEffect } from 'react'
import { X, Plus, Trash2, Cpu, Zap, ChevronRight, Loader2, AlertTriangle } from 'lucide-react'
import { useEngineStore } from '@/store'
import { invoke } from '@tauri-apps/api/core'
import type { CreateEngineRequest } from '@/types'

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
  const { engines, fetchEngines, createEngine, deleteEngine, toggleEngine, seedDefaultEngines, isLoading } = useEngineStore()
  const [showAddEngine, setShowAddEngine] = useState(false)
  const [activeTab, setActiveTab] = useState<'engines' | 'rtk'>('engines')
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
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[60vh]">
          {activeTab === 'engines' && (
            <EnginesTab
              engines={engines}
              isLoading={isLoading}
              showAddEngine={showAddEngine}
              newEngine={newEngine}
              setShowAddEngine={setShowAddEngine}
              setNewEngine={setNewEngine}
              handleAddEngine={handleAddEngine}
              toggleEngine={toggleEngine}
              deleteEngine={deleteEngine}
              seedDefaultEngines={seedDefaultEngines}
            />
          )}
          {activeTab === 'rtk' && (
            <RTKTab />
          )}
        </div>
      </div>
    </div>
  )
}

function EnginesTab({ engines, isLoading, showAddEngine, newEngine, setShowAddEngine, setNewEngine, handleAddEngine, toggleEngine, deleteEngine, seedDefaultEngines }: {
  engines: any[]
  isLoading: boolean
  showAddEngine: boolean
  newEngine: CreateEngineRequest
  setShowAddEngine: (v: boolean) => void
  setNewEngine: (v: CreateEngineRequest) => void
  handleAddEngine: (e: React.FormEvent) => void
  toggleEngine: (id: number, enabled: boolean) => void
  deleteEngine: (id: number) => void
  seedDefaultEngines: () => void
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
            onClick={seedDefaultEngines}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:text-white hover:bg-white/5 rounded-md transition-colors font-geist"
          >
            Seed Defaults
          </button>
        </div>
      </div>

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
