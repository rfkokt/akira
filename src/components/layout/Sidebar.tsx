import { useState } from 'react'
import { LayoutGrid, FileCode, GitBranch, Puzzle, Plug, PanelLeft, Folder } from 'lucide-react'

interface NavItem {
  id: string
  label: string
  icon: React.ReactNode
}

const navItems: NavItem[] = [
  // { id: 'kanban', label: 'Board', icon: <LayoutGrid className="w-3.5 h-3.5" /> },
  // { id: 'files', label: 'Files', icon: <FileCode className="w-3.5 h-3.5" /> },
  // { id: 'git', label: 'Source Control', icon: <GitBranch className="w-3.5 h-3.5" /> },
  // { id: 'skills', label: 'Skills', icon: <Puzzle className="w-3.5 h-3.5" /> },
  // { id: 'mcp', label: 'MCP', icon: <Plug className="w-3.5 h-3.5" /> },
]

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const [activeTab, setActiveTab] = useState('kanban')

  return (
    <aside 
      className={`flex flex-col bg-[#252526] border-r border-white/5 transition-all duration-200 ${
        collapsed ? 'w-12' : 'w-52'
      }`}
    >
      {/* Activity Bar - VS Code Style */}
      <div className="flex-1 py-2">
        <div className="flex flex-col gap-0.5">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`relative flex items-center gap-3 px-4 py-2.5 text-xs transition-colors font-geist ${
                activeTab === item.id
                  ? 'text-white'
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              {/* Active indicator */}
              {activeTab === item.id && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-white rounded-r" />
              )}
              <span className={activeTab === item.id ? 'text-white' : ''}>
                {item.icon}
              </span>
              {!collapsed && <span>{item.label}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Bottom Actions */}
      <div className="py-2 border-t border-white/5">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={`flex items-center gap-3 px-3 py-2 text-sm text-neutral-500 hover:text-neutral-300 transition-colors font-geist ${
            collapsed ? 'justify-center' : ''
          }`}
        >
          <PanelLeft className={`w-4 h-4 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>

      {/* Project Info */}
      {!collapsed && (
        <div className="p-3 border-t border-white/5 bg-[#2d2d2d]">
          <div className="flex items-center gap-2">
            <Folder className="w-4 h-4 text-neutral-400" />
            <div className="overflow-hidden">
              <p className="text-xs font-medium text-neutral-300 font-geist truncate">korlap-x</p>
              <p className="text-xs text-neutral-500 font-geist truncate">~/Projects</p>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
