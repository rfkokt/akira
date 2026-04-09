import os

replacements = {
    'bg-[#1e1e1e]': 'bg-app-bg',
    'bg-[#252526]': 'bg-app-panel',
    'bg-[#2d2d2d]': 'bg-app-sidebar',
    'text-[#0e639c]': 'text-app-accent',
    'bg-[#0e639c]': 'bg-app-accent',
    'border-[#0e639c]': 'border-app-accent',
    'hover:bg-[#1177bb]': 'hover:bg-app-accent-hover',
    'text-[#858585]': 'text-app-text-muted',
    'text-[#cccccc]': 'text-app-text',
    'text-[#6e6e6e]': 'text-app-text-muted',
    'text-[#f48771]': 'text-red-400',
    'text-[#9cdcfe]': 'text-app-info',
    'border-white/10': 'border-app-border',
    'border-white/5': 'border-app-border',
    'border-white/20': 'border-app-border-highlight',
    'bg-[#0d0d0d]': 'bg-app-bg'
}

files_to_process = [
    '/Volumes/External M4/Project/ars-ai/akira/src/components/Kanban/TaskImporter.tsx',
    '/Volumes/External M4/Project/ars-ai/akira/src/components/AI/AIWorkflowPanel.tsx',
    '/Volumes/External M4/Project/ars-ai/akira/src/components/DiffViewer/DiffViewer.tsx',
    '/Volumes/External M4/Project/ars-ai/akira/src/components/Router/CostTrackingDashboard.tsx',
    '/Volumes/External M4/Project/ars-ai/akira/src/components/Kanban/AIActivityIndicator.tsx',
    '/Volumes/External M4/Project/ars-ai/akira/src/components/Settings/SettingsPage.tsx',
    '/Volumes/External M4/Project/ars-ai/akira/src/components/Kanban/TaskCreatorChat.tsx',
    '/Volumes/External M4/Project/ars-ai/akira/src/components/Settings/McpToolsList.tsx',
    '/Volumes/External M4/Project/ars-ai/akira/src/components/Git/GitPushFlow.tsx', # if exists
]

# We should also replace 'bg-[#0e639c]/20' which with pure string replacement
# might turn into 'bg-app-accent/20'. Wait, tailwind lets you do 'bg-app-accent/20' natively!

for filepath in files_to_process:
    if not os.path.exists(filepath):
        continue
    with open(filepath, 'r') as f:
        content = f.read()

    original = content
    for old, new in replacements.items():
        content = content.replace(old, new)
        
    if original != content:
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"Updated hex in {os.path.basename(filepath)}")

print("Hex purge completed")
