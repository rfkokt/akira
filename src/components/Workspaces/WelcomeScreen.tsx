import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FolderOpen, Plus, Trash2, Folder, ChevronRight, X } from 'lucide-react';
import { useWorkspaceStore } from '@/store/workspaceStore';

interface WelcomeScreenProps {
  onClose: () => void;
}

export function WelcomeScreen({ onClose }: WelcomeScreenProps) {
  const { workspaces, activeWorkspace, createWorkspace, setActiveWorkspace, deleteWorkspace, loadWorkspaces } = useWorkspaceStore();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<string>('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  const handlePickFolder = async () => {
    try {
      const folder = await invoke<string | null>('pick_folder');
      if (folder) {
        setSelectedFolder(folder);
        // Auto-fill name from folder if not set
        if (!newWorkspaceName) {
          const folderName = folder.split('/').pop() || 'New Workspace';
          setNewWorkspaceName(folderName);
        }
      }
    } catch (error) {
      console.error('Failed to pick folder:', error);
    }
  };

  const handleCreateWorkspace = async () => {
    if (!newWorkspaceName.trim() || !selectedFolder) return;
    
    setIsCreating(true);
    try {
      await createWorkspace(newWorkspaceName.trim(), selectedFolder);
      setShowCreateDialog(false);
      setNewWorkspaceName('');
      setSelectedFolder('');
      onClose();
    } catch (error) {
      console.error('Failed to create workspace:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleSelectWorkspace = async (id: string) => {
    await setActiveWorkspace(id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#1e1e1e] flex items-center justify-center">
      <div className="w-[800px] max-h-[80vh] bg-[#252526] rounded-lg border border-white/10 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-white font-geist">Welcome to Akira</h1>
            <p className="text-sm text-neutral-500 font-geist mt-1">
              AI-Powered Workspace & Task Manager
            </p>
          </div>
          {activeWorkspace && (
            <button
              onClick={onClose}
              className="p-2 text-neutral-400 hover:text-white hover:bg-white/5 rounded-md transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 p-6 overflow-auto">
          {workspaces.length === 0 ? (
            /* Empty State */
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
              <button
                onClick={() => setShowCreateDialog(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#0e639c] hover:bg-[#1177bb] text-white rounded-md font-medium font-geist transition-colors"
              >
                <Plus className="w-4 h-4" />
                Create Workspace
              </button>
            </div>
          ) : (
            /* Workspaces List */
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-medium text-neutral-400 font-geist uppercase tracking-wide">
                  Your Workspaces
                </h2>
                <button
                  onClick={() => setShowCreateDialog(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#0e639c] hover:bg-[#1177bb] rounded-md transition-colors font-geist"
                >
                  <Plus className="w-3.5 h-3.5" />
                  New Workspace
                </button>
              </div>

              <div className="space-y-2">
                {workspaces.map((workspace) => (
                  <div
                    key={workspace.id}
                    className={`group flex items-center gap-3 p-4 rounded-lg border transition-all cursor-pointer ${
                      workspace.is_active
                        ? 'bg-[#0e639c]/10 border-[#0e639c]/30'
                        : 'bg-[#2d2d2d] border-white/5 hover:border-white/10 hover:bg-[#2d2d2d]/80'
                    }`}
                    onClick={() => handleSelectWorkspace(workspace.id)}
                  >
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

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteWorkspace(workspace.id);
                      }}
                      className="p-1.5 text-neutral-500 hover:text-red-400 hover:bg-red-400/10 rounded opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>

                    <ChevronRight className="w-4 h-4 text-neutral-600" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Workspace Dialog */}
      {showCreateDialog && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center">
          <div className="w-[480px] bg-[#252526] rounded-lg border border-white/10 shadow-2xl p-6">
            <h3 className="text-lg font-semibold text-white font-geist mb-4">
              Create New Workspace
            </h3>

            <div className="space-y-4">
              {/* Folder Selection */}
              <div>
                <label className="block text-xs font-medium text-neutral-400 font-geist mb-1.5">
                  Project Folder *
                </label>
                <div className="flex gap-2">
                  <div className="flex-1 px-3 py-2 bg-[#1e1e1e] border border-white/10 rounded text-sm text-neutral-300 font-geist truncate">
                    {selectedFolder || 'No folder selected'}
                  </div>
                  <button
                    onClick={handlePickFolder}
                    className="px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-sm text-neutral-300 font-geist transition-colors flex items-center gap-1.5"
                  >
                    <FolderOpen className="w-4 h-4" />
                    Browse
                  </button>
                </div>
              </div>

              {/* Name Input */}
              <div>
                <label className="block text-xs font-medium text-neutral-400 font-geist mb-1.5">
                  Workspace Name *
                </label>
                <input
                  type="text"
                  value={newWorkspaceName}
                  onChange={(e) => setNewWorkspaceName(e.target.value)}
                  placeholder="My Project"
                  className="w-full px-3 py-2 bg-[#1e1e1e] border border-white/10 rounded text-sm text-white placeholder-neutral-600 font-geist focus:outline-none focus:border-[#0e639c]"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => {
                  setShowCreateDialog(false);
                  setNewWorkspaceName('');
                  setSelectedFolder('');
                }}
                className="px-4 py-2 text-sm font-medium text-neutral-400 hover:text-white font-geist transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateWorkspace}
                disabled={!newWorkspaceName.trim() || !selectedFolder || isCreating}
                className="px-4 py-2 text-sm font-medium text-white bg-[#0e639c] hover:bg-[#1177bb] rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-geist"
              >
                {isCreating ? 'Creating...' : 'Create Workspace'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
