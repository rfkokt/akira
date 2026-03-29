import { useState, useCallback } from 'react'
import { Upload, FileJson, FileText, FileSpreadsheet, X, CheckCircle2, AlertCircle } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'
import { useTaskStore } from '@/store/taskStore'

interface TaskImporterProps {
  isOpen: boolean
  onClose: () => void
}

interface ImportResult {
  success: boolean
  count: number
  message: string
}

export function TaskImporter({ isOpen, onClose }: TaskImporterProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const { fetchTasks } = useTaskStore()

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const files = Array.from(e.dataTransfer.files)
    if (files.length === 0) return

    // Process only the first file
    const file = files[0]
    await importFile(file)
  }, [])

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const file = files[0]
    await importFile(file)
  }, [])

  const importFile = async (file: File) => {
    setIsImporting(true)
    setResult(null)

    try {
      // Convert file to array buffer
      const arrayBuffer = await file.arrayBuffer()
      const uint8Array = new Uint8Array(arrayBuffer)
      
      // Convert to regular array for Tauri
      const bytes = Array.from(uint8Array)

      let result: ImportResult

      if (file.name.endsWith('.json')) {
        const text = new TextDecoder().decode(uint8Array)
        const imported = await invoke<{ tasks: any[] }>('import_tasks_json', { content: text })
        result = {
          success: true,
          count: imported.tasks.length,
          message: `Imported ${imported.tasks.length} tasks from JSON`
        }
      } else if (file.name.endsWith('.md') || file.name.endsWith('.markdown')) {
        const text = new TextDecoder().decode(uint8Array)
        const imported = await invoke<{ tasks: any[] }>('import_tasks_markdown', { content: text })
        result = {
          success: true,
          count: imported.tasks.length,
          message: `Imported ${imported.tasks.length} tasks from Markdown`
        }
      } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        const imported = await invoke<{ tasks: any[] }>('import_tasks_excel', { bytes })
        result = {
          success: true,
          count: imported.tasks.length,
          message: `Imported ${imported.tasks.length} tasks from Excel`
        }
      } else {
        result = {
          success: false,
          count: 0,
          message: 'Unsupported file format. Please use JSON, Markdown, or Excel (.xlsx)'
        }
      }

      setResult(result)
      
      if (result.success) {
        await fetchTasks()
        setTimeout(() => {
          onClose()
          setResult(null)
        }, 2000)
      }
    } catch (error) {
      setResult({
        success: false,
        count: 0,
        message: `Import failed: ${error}`
      })
    } finally {
      setIsImporting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-[#252526] border border-white/10 w-full max-w-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-[#2d2d2d]">
          <h2 className="text-sm font-semibold text-white font-geist">Import Tasks</h2>
          <button 
            onClick={onClose}
            className="p-1 text-[#858585] hover:text-white hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6">
          {result ? (
            <div className={`text-center py-8 ${result.success ? 'text-green-400' : 'text-[#f48771]'}`}>
              {result.success ? (
                <CheckCircle2 className="w-12 h-12 mx-auto mb-4" />
              ) : (
                <AlertCircle className="w-12 h-12 mx-auto mb-4" />
              )}
              <p className="text-sm font-geist">{result.message}</p>
              {!result.success && (
                <button 
                  onClick={() => setResult(null)}
                  className="mt-4 px-4 py-2 text-xs bg-[#0e639c] hover:bg-[#1177bb] text-white font-geist"
                >
                  Try Again
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Drop Zone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`relative border-2 border-dashed transition-all duration-200 ${
                  isDragging 
                    ? 'border-[#0e639c] bg-[#0e639c]/10' 
                    : 'border-white/20 bg-[#1e1e1e] hover:border-white/40'
                }`}
              >
                <input
                  type="file"
                  accept=".json,.md,.markdown,.xlsx,.xls"
                  onChange={handleFileSelect}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                
                <div className="p-8 text-center">
                  {isImporting ? (
                    <div className="flex flex-col items-center">
                      <div className="w-8 h-8 border-2 border-[#0e639c] border-t-transparent rounded-full animate-spin mb-4" />
                      <p className="text-sm text-[#cccccc] font-geist">Importing...</p>
                    </div>
                  ) : (
                    <>
                      <Upload className={`w-10 h-10 mx-auto mb-4 transition-colors ${
                        isDragging ? 'text-[#0e639c]' : 'text-[#858585]'
                      }`} />
                      <p className="text-sm text-[#cccccc] font-geist mb-2">
                        Drop your file here, or click to browse
                      </p>
                      <p className="text-xs text-[#6e6e6e] font-geist">
                        Supports JSON, Markdown, and Excel files
                      </p>
                    </>
                  )}
                </div>
              </div>

              {/* File Types */}
              <div className="mt-6 grid grid-cols-3 gap-3">
                <div className="flex flex-col items-center p-3 bg-[#1e1e1e] border border-white/5">
                  <FileJson className="w-6 h-6 text-[#858585] mb-2" />
                  <span className="text-[10px] text-[#858585] font-geist">JSON</span>
                </div>
                <div className="flex flex-col items-center p-3 bg-[#1e1e1e] border border-white/5">
                  <FileText className="w-6 h-6 text-[#858585] mb-2" />
                  <span className="text-[10px] text-[#858585] font-geist">Markdown</span>
                </div>
                <div className="flex flex-col items-center p-3 bg-[#1e1e1e] border border-white/5">
                  <FileSpreadsheet className="w-6 h-6 text-[#858585] mb-2" />
                  <span className="text-[10px] text-[#858585] font-geist">Excel</span>
                </div>
              </div>

              {/* Format Examples */}
              <div className="mt-6 space-y-3">
                <details className="text-xs">
                  <summary className="text-[#858585] cursor-pointer font-geist hover:text-[#cccccc]">
                    View JSON format example
                  </summary>
                  <pre className="mt-2 p-3 bg-[#1e1e1e] text-[#9cdcfe] font-mono text-[10px] overflow-x-auto border border-white/5">
{`[
  {
    "title": "Implement feature X",
    "description": "Details about the feature",
    "status": "todo",
    "priority": "high"
  }
]`}
                  </pre>
                </details>

                <details className="text-xs">
                  <summary className="text-[#858585] cursor-pointer font-geist hover:text-[#cccccc]">
                    View Markdown format example
                  </summary>
                  <pre className="mt-2 p-3 bg-[#1e1e1e] text-[#9cdcfe] font-mono text-[10px] overflow-x-auto border border-white/5">
{`# Tasks

## TODO

- [ ] Implement feature X
- [ ] Fix bug in component Y

## In Progress

- [ ] Refactor codebase

## Done

- [x] Initial setup`}
                  </pre>
                </details>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
