import { useState, useEffect } from 'react'
import { X, Plus, Trash2, Cpu } from 'lucide-react'
import { useEngineStore } from '@/store'
import type { CreateEngineRequest } from '@/types'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { engines, fetchEngines, createEngine, deleteEngine, toggleEngine, seedDefaultEngines, isLoading } = useEngineStore()
  const [showAddEngine, setShowAddEngine] = useState(false)
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

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[60vh]">
          {/* Engines Section */}
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
                            <span className="text-[10px] px-1.5 py-0.5 bg-[#0e639c]/20 text-[#0e639c] rounded">
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

            {/* Add Engine Form */}
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
        </div>
      </div>
    </div>
  )
}
