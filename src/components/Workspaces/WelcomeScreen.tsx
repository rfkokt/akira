import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { FolderOpen, Plus, Trash2, Folder, ChevronRight } from 'lucide-react'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Card, CardContent } from '@/components/ui/card'

interface WelcomeScreenProps {
  onClose: () => void
}

export function WelcomeScreen({ onClose }: WelcomeScreenProps) {
  const { workspaces, createWorkspace, setActiveWorkspace, deleteWorkspace, loadWorkspaces } = useWorkspaceStore()
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newWorkspaceName, setNewWorkspaceName] = useState('')
  const [selectedFolder, setSelectedFolder] = useState<string>('')
  const [isCreating, setIsCreating] = useState(false)

  useEffect(() => {
    loadWorkspaces()
  }, [loadWorkspaces])

  const handlePickFolder = async () => {
    try {
      const folder = await invoke<string | null>('pick_folder')
      if (folder) {
        setSelectedFolder(folder)
        if (!newWorkspaceName) {
          const folderName = folder.split('/').pop() || 'New Workspace'
          setNewWorkspaceName(folderName)
        }
      }
    } catch (error) {
      console.error('Failed to pick folder:', error)
    }
  }

  const handleCreateWorkspace = async () => {
    if (!newWorkspaceName.trim() || !selectedFolder) return
    
    setIsCreating(true)
    try {
      await createWorkspace(newWorkspaceName.trim(), selectedFolder)
      setShowCreateDialog(false)
      setNewWorkspaceName('')
      setSelectedFolder('')
      onClose()
    } catch (error) {
      console.error('Failed to create workspace:', error)
    } finally {
      setIsCreating(false)
    }
  }

  const handleSelectWorkspace = async (id: string) => {
    await setActiveWorkspace(id)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#1e1e1e] flex items-center justify-center">
      <div className="w-[800px] max-h-[80vh] bg-[#252526] rounded-lg border border-white/10 shadow-2xl flex flex-col">
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-white font-geist">Welcome to Akira</h1>
            <p className="text-sm text-neutral-500 font-geist mt-1">
              AI-Powered Workspace & Task Manager
            </p>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-6">
            {workspaces.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-20 h-20 bg-[#0e639c]/10 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Folder className="w-10 h-10 text-[#0e639c]" />
                </div>
                <h2 className="text-lg font-medium text-white font-geist mb-2">
                  No Workspaces Yet
                </h2>
                <p className="text-sm text-neutral-500 font-geist mb-6 max-w-md mx-auto">
                  Create your first workspace by selecting a project folder. Each workspace represents a project with its own tasks and AI configuration.
                </p>
                <Button onClick={() => setShowCreateDialog(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Workspace
                </Button>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-medium text-neutral-400 font-geist uppercase tracking-wide">
                    Your Workspaces
                  </h2>
                  <Button size="sm" onClick={() => setShowCreateDialog(true)}>
                    <Plus className="w-3.5 h-3.5 mr-1.5" />
                    New Workspace
                  </Button>
                </div>

                <div className="space-y-2">
                  {workspaces.map((workspace) => (
                    <Card
                      key={workspace.id}
                      className={`cursor-pointer transition-all hover:bg-[#2d2d2d]/80 ${
                        workspace.is_active
                          ? 'bg-[#0e639c]/10 border-[#0e639c]/30'
                          : 'bg-[#2d2d2d] border-white/5 hover:border-white/10'
                      }`}
                      onClick={() => handleSelectWorkspace(workspace.id)}
                    >
                      <CardContent className="flex items-center gap-3 p-4">
                        <div className="w-10 h-10 bg-[#1e1e1e] rounded-lg flex items-center justify-center flex-shrink-0">
                          <Folder className="w-5 h-5 text-[#dcb67a]" />
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-medium text-white font-geist truncate">
                            {workspace.name}
                          </h3>
                          <p className="text-xs text-neutral-500 font-geist truncate">
                            {workspace.folder_path}
                          </p>
                        </div>

                        {workspace.is_active && (
                          <span className="text-xs px-2 py-0.5 bg-[#0e639c]/20 text-[#0e639c] rounded font-geist">
                            Active
                          </span>
                        )}

                        <Button
                          variant="ghost"
                          size="icon"
                          className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-red-400 hover:bg-red-400/10"
                          onClick={(e) => {
                            e.stopPropagation()
                            deleteWorkspace(workspace.id)
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>

                        <ChevronRight className="w-4 h-4 text-neutral-600" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Workspace</DialogTitle>
            <DialogDescription>
              Select a project folder and give your workspace a name.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="folder">Project Folder *</Label>
              <div className="flex gap-2">
                <div className="flex-1 px-3 py-2 bg-[#1e1e1e] border border-white/10 rounded-md text-sm text-neutral-300 font-geist truncate min-h-[40px] flex items-center">
                  {selectedFolder || 'No folder selected'}
                </div>
                <Button variant="secondary" onClick={handlePickFolder}>
                  <FolderOpen className="w-4 h-4 mr-1.5" />
                  Browse
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Workspace Name *</Label>
              <Input
                id="name"
                value={newWorkspaceName}
                onChange={(e) => setNewWorkspaceName(e.target.value)}
                placeholder="My Project"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setShowCreateDialog(false)
                setNewWorkspaceName('')
                setSelectedFolder('')
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateWorkspace}
              disabled={!newWorkspaceName.trim() || !selectedFolder || isCreating}
            >
              {isCreating ? 'Creating...' : 'Create Workspace'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
