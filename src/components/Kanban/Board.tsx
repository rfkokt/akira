import { useEffect, useState } from 'react'
import { Plus, MoreHorizontal, X, Upload } from 'lucide-react'
import { useTaskStore } from '@/store/taskStore'
import type { Task } from '@/types'
import { TaskImporter } from './TaskImporter'

const columns = [
  { id: 'todo', label: 'To Do', color: 'bg-neutral-600' },
  { id: 'in-progress', label: 'In Progress', color: 'bg-blue-500' },
  { id: 'review', label: 'Review', color: 'bg-yellow-500' },
  { id: 'done', label: 'Done', color: 'bg-green-500' },
] as const

export function KanbanBoard() {
  const { tasks, fetchTasks, moveTask, createTask, isLoading } = useTaskStore()
  const [showAddModal, setShowAddModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    priority: 'medium' as Task['priority'],
    status: 'todo' as Task['status'],
  })

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  const getTasksByStatus = (status: Task['status']) => 
    tasks.filter(task => task.status === status)

  const getPriorityColor = (priority: Task['priority']) => {
    switch (priority) {
      case 'high': return 'bg-red-500/20 text-red-400 border-red-500/30'
      case 'medium': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
      case 'low': return 'bg-green-500/20 text-green-400 border-green-500/30'
    }
  }

  const handleMoveTask = (taskId: string, newStatus: Task['status']) => {
    moveTask(taskId, newStatus)
  }

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTask.title.trim()) return
    
    await createTask({
      title: newTask.title,
      description: newTask.description,
      status: newTask.status,
      priority: newTask.priority,
    })
    
    setNewTask({ title: '', description: '', priority: 'medium', status: 'todo' })
    setShowAddModal(false)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-white font-geist">Board</h2>
          {isLoading && (
            <span className="text-xs text-neutral-500 font-geist">Loading...</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-neutral-300 hover:text-white hover:bg-white/5 rounded-md transition-colors font-geist border border-white/10"
          >
            <Upload className="w-4 h-4" />
            <span>Import</span>
          </button>
          <button 
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-[#0e639c] hover:bg-[#1177bb] rounded-md transition-colors font-geist"
          >
            <Plus className="w-4 h-4" />
            <span>New Task</span>
          </button>
        </div>
      </div>

      {/* Kanban Columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {columns.map(column => (
          <div 
            key={column.id}
            className="bg-[#252526] rounded-md flex flex-col max-h-[calc(100vh-280px)]"
          >
            {/* Column Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${column.color}`} />
                <span className="text-xs font-medium text-neutral-300 font-geist">
                  {column.label}
                </span>
                <span className="text-xs text-neutral-500 font-geist">
                  {getTasksByStatus(column.id).length}
                </span>
              </div>
              <button className="p-1 rounded text-neutral-500 hover:text-white hover:bg-white/5 transition-colors">
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Tasks */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {getTasksByStatus(column.id).map(task => (
                <div 
                  key={task.id}
                  className="group bg-[#2d2d2d] hover:bg-[#3c3c3c] rounded-md p-3 cursor-pointer transition-colors"
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <span className={`text-[10px] font-medium uppercase px-1.5 py-0.5 rounded border ${getPriorityColor(task.priority)} font-geist`}>
                      {task.priority}
                    </span>
                    
                    <select
                      value={task.status}
                      onChange={(e) => handleMoveTask(task.id, e.target.value as Task['status'])}
                      className="text-[10px] bg-transparent text-neutral-500 border-none outline-none cursor-pointer hover:text-white"
                    >
                      <option value="todo">To Do</option>
                      <option value="in-progress">In Progress</option>
                      <option value="review">Review</option>
                      <option value="done">Done</option>
                    </select>
                  </div>
                  <h3 className="text-sm font-medium text-neutral-200 font-geist mb-1">
                    {task.title}
                  </h3>
                  {task.description && (
                    <p className="text-xs text-neutral-500 font-geist line-clamp-2">
                      {task.description}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {/* Add Task Button */}
            <button 
              onClick={() => setShowAddModal(true)}
              className="mx-2 mb-2 flex items-center justify-center gap-1.5 py-2 rounded text-xs font-medium text-neutral-500 hover:text-neutral-300 hover:bg-white/5 transition-colors font-geist"
            >
              <Plus className="w-3.5 h-3.5" />
              Add task
            </button>
          </div>
        ))}
      </div>

      {/* Add Task Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-[#252526] rounded-lg border border-white/10 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
              <h3 className="text-sm font-semibold text-white font-geist">New Task</h3>
              <button 
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded text-neutral-500 hover:text-white hover:bg-white/5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <form onSubmit={handleCreateTask} className="p-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1 font-geist">Title</label>
                <input
                  type="text"
                  value={newTask.title}
                  onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                  className="w-full px-3 py-2 rounded text-sm bg-[#3c3c3c] text-white placeholder-white/40 border border-white/10 focus:outline-none focus:border-[#0e639c] font-geist"
                  placeholder="Enter task title..."
                  required
                />
              </div>
              
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1 font-geist">Description</label>
                <textarea
                  value={newTask.description}
                  onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                  className="w-full px-3 py-2 rounded text-sm bg-[#3c3c3c] text-white placeholder-white/40 border border-white/10 focus:outline-none focus:border-[#0e639c] font-geist resize-none"
                  rows={3}
                  placeholder="Enter task description..."
                />
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1 font-geist">Priority</label>
                  <select
                    value={newTask.priority}
                    onChange={(e) => setNewTask({ ...newTask, priority: e.target.value as Task['priority'] })}
                    className="w-full px-3 py-2 rounded text-sm bg-[#3c3c3c] text-white border border-white/10 focus:outline-none focus:border-[#0e639c] font-geist"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1 font-geist">Status</label>
                  <select
                    value={newTask.status}
                    onChange={(e) => setNewTask({ ...newTask, status: e.target.value as Task['status'] })}
                    className="w-full px-3 py-2 rounded text-sm bg-[#3c3c3c] text-white border border-white/10 focus:outline-none focus:border-[#0e639c] font-geist"
                  >
                    <option value="todo">To Do</option>
                    <option value="in-progress">In Progress</option>
                    <option value="review">Review</option>
                    <option value="done">Done</option>
                  </select>
                </div>
              </div>
              
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-1.5 rounded text-sm font-medium text-neutral-300 hover:text-white hover:bg-white/5 font-geist transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded text-sm font-medium text-white bg-[#0e639c] hover:bg-[#1177bb] font-geist transition-colors"
                >
                  Create Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import Modal */}
      <TaskImporter 
        isOpen={showImportModal} 
        onClose={() => setShowImportModal(false)} 
      />
    </div>
  )
}
