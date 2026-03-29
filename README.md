# Akira

> **AI-Powered Workspace & Task Manager**

A native desktop application built with Tauri (Rust) + React for managing multiple coding workspaces with AI assistance. Each workspace represents a project folder with its own Kanban board, tasks, and AI chat context.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Tauri](https://img.shields.io/badge/Tauri-v2.0-blueviolet?logo=tauri)
![React](https://img.shields.io/badge/React-v19-61DAFB?logo=react)

## 🎯 Core Concept: Workspaces

**Akira** is built around the concept of **Workspaces**. Think of it like VS Code workspaces, but with AI-powered task management.

### What is a Workspace?
A workspace is a **project folder** on your computer that contains:
- 📁 **Project Files** - Your code, configs, documentation
- 📋 **Kanban Board** - Tasks organized in 4 columns (TODO → IN PROGRESS → REVIEW → DONE)
- 🤖 **AI Context** - Project-specific configuration (Persona, Tech Stack, Rules, Tone)
- 💬 **Chat History** - AI conversations, optionally organized per task

### Workflow Overview

```
┌─────────────────────────────────────────────────────────────┐
│  1. CREATE WORKSPACE                                        │
│     └─ Select a folder on your computer                     │
│     └─ Give it a name (e.g., "My React App")                │
│                                                             │
│  2. SETUP PROJECT (Optional)                                │
│     └─ Configure AI Persona (who the AI should be)          │
│     └─ Define Tech Stack (React, Node, etc.)                │
│     └─ Set Rules (Do's and Don'ts)                          │
│     └─ Adjust Tone (how AI should communicate)              │
│                                                             │
│  3. ADD TASKS                                               │
│     └─ Create tasks manually in Kanban board                │
│     └─ OR import from JSON/Markdown/Excel                   │
│                                                             │
│  4. START CODING WITH AI                                    │
│     └─ Select a task to set context                         │
│     └─ Chat with AI (context-aware)                         │
│     └─ Work on files                                        │
│     └─ Git workflow when done                               │
└─────────────────────────────────────────────────────────────┘
```

## ✨ Features

### 🏢 Multi-Workspace Support
- Create unlimited workspaces (one per project)
- Each workspace is tied to a specific folder
- Switch between workspaces instantly
- Each workspace has isolated data and context

### 📋 Kanban Task Management (Per Workspace)
- 4-column board: **TODO → IN PROGRESS → REVIEW → DONE**
- Drag & drop between columns
- Task priority levels (High, Medium, Low)
- Import tasks from JSON, Markdown, or Excel
- Link tasks to specific files

### 🧠 Project Intelligence Config (PIC)
Each workspace has its own AI configuration:
- **Persona**: Define AI role & expertise
  - Example: "You are a senior React engineer..."
- **Tech Stack**: Technology context
  - Example: "Next.js 14, TypeScript, Prisma, PostgreSQL"
- **Rules**: Do & Don't guidelines
  - Example: "Always use async/await, never use var"
- **Tone**: Communication style
  - Example: "Be concise, give max 2 options"

### 💬 Context-Aware AI Chat
- **Global Workspace Chat**: General discussion about the project
- **Task-Specific Chat**: Each task can have its own chat thread
- Real-time streaming from AI engines
- Support multiple AI engines (Ollama, Claude, Opencode, etc.)
- Full chat history persistence

### 📁 File Explorer
- Browse project files natively
- Tree view with file type icons
- Select files to show AI context
- Monaco Editor integration (coming soon)

### 🔀 Git Workflow (Coming Soon)
- Stage files
- AI-generated commit messages
- Auto tag versioning
- One-click push

## 🚀 Getting Started

### First Time Setup

```bash
# Clone and install
git clone https://github.com/rfkokt/akira.git
cd akira
npm install

# Run the app
npm run tauri:dev
```

### Creating Your First Workspace

1. **Launch Akira**
   - App opens with "Welcome" screen

2. **Create New Workspace**
   - Click "+ New Workspace" button
   - Select a folder (e.g., your project directory)
   - Name it (e.g., "My Web App")

3. **Add Tasks**
   - Go to Tasks tab
   - Click "Add Task" or import from file
   - Organize in Kanban board

4. **Configure AI (Optional but Recommended)**
   - Click Config icon (brain) in sidebar
   - Fill Persona, Tech Stack, Rules, Tone
   - Save configuration

5. **Start Working**
   - Select a task to set context
   - Open chat (floating box)
   - Ask AI for help!

### Quick Workflow Example

```
Workspace: "E-commerce Dashboard"
├── Kanban Tasks:
│   ├── [TODO] Setup authentication
│   ├── [IN PROGRESS] Create product API  ← Selected
│   └── [DONE] Initialize project
│
├── AI Context:
│   ├── Persona: "Senior Fullstack Dev"
│   ├── Tech: "Next.js, Prisma, PostgreSQL"
│   └── Rules: "Use TypeScript strictly"
│
└── Chat:
    └── Task: "Create product API"
        └── "How should I structure the product 
            controller with proper error handling?"
```

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Tauri v2 |
| **Frontend** | React 19 + TypeScript + Tailwind CSS |
| **Backend** | Rust |
| **Database** | SQLite (rusqlite) - per workspace |
| **Editor** | Monaco Editor |
| **State Management** | Zustand |
| **Icons** | Lucide React |

## 📁 Project Structure

```
akira/
├── src/                          # React Frontend
│   ├── components/
│   │   ├── Workspaces/          # Workspace management
│   │   ├── Kanban/              # Task board
│   │   ├── Chat/                # AI chat
│   │   ├── Editor/              # File explorer
│   │   └── ProjectConfig/       # PIC settings
│   ├── store/                   # Zustand stores
│   └── App.tsx
├── src-tauri/                    # Rust Backend
│   ├── src/
│   │   ├── commands/            # Tauri commands
│   │   ├── db/                  # Database layer
│   │   └── main.rs
│   └── Cargo.toml
└── README.md
```

## 🛠️ Development

### Available Scripts

```bash
# Development
npm run tauri:dev        # Start dev server

# Production
npm run tauri:build      # Build app for distribution
```

### Adding AI Engines

1. Open Settings (gear icon in header)
2. Register CLI binaries:
   - **Alias**: Display name
   - **Path**: Path to CLI binary
   - **Args**: Default arguments

Example configurations:
- **Claude**: `/usr/local/bin/claude` with args `--dangerously-skip-permissions`
- **Ollama**: `ollama` with args `run llama3`

## 🗺️ Roadmap

### ✅ Phase 1: Core Engine
- [x] Tauri + React setup
- [x] Multi-workspace support
- [x] SQLite database per workspace
- [x] AI engine management

### 🚧 Phase 2: Task & Context
- [x] Kanban board with 4 columns
- [x] Task importer (JSON/Markdown/Excel)
- [x] File tree explorer
- [x] Project Intelligence Config (PIC)
- [x] Task-specific chat
- [ ] Task card to system prompt binding

### 📋 Phase 3: Code Integration
- [ ] Monaco Editor integration
- [ ] Diff viewer for AI suggestions
- [ ] Auto-apply changes to files
- [ ] Git workflow (stage/commit/tag/push)

### 🔮 Phase 4: Advanced Features
- [ ] Skills manager (skills.sh)
- [ ] MCP server management
- [ ] Auto-debug capabilities
- [ ] Multi-language support

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📝 License

MIT License - see [LICENSE](LICENSE) file

## 🙏 Acknowledgments

- [Tauri](https://tauri.app/) - Native app framework
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) - Code editor
- [Lucide](https://lucide.dev/) - Beautiful icons
- VS Code for UI inspiration

---

<p align="center">Made with ❤️ and ☕ for developers who love AI</p>
