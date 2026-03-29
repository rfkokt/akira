# Akira

> **AI-Powered Task & Code Workflow Manager**

A native desktop application built with Tauri (Rust) + React that combines Kanban task management with multi-model AI chat integration.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Tauri](https://img.shields.io/badge/Tauri-v2.0-blueviolet?logo=tauri)
![React](https://img.shields.io/badge/React-v19-61DAFB?logo=react)

## ✨ Features

### 🤖 Multi-Model AI Integration
- Support for multiple AI engines (Ollama, Claude, Opencode, etc.)
- Generic CLI wrapper - use any AI tool with stdin/stdout
- Real-time streaming output
- Per-task chat history

### 📋 Kanban Task Management
- 4-column board: TODO → IN PROGRESS → REVIEW → DONE
- Drag & drop support
- Task priority levels
- Import tasks from JSON, Markdown, or Excel

### 📁 File Explorer
- Native file system access via Tauri
- Tree view with file type icons
- Select and preview files
- (Monaco Editor integration coming soon)

### 🧠 Project Intelligence Config (PIC)
- 4-tab configuration:
  - **Persona**: Define AI role & expertise
  - **Tech Stack**: Technology context
  - **Rules**: Do & Don't guidelines
  - **Tone**: Communication style
- Monaco Editor for markdown editing
- System prompt preview

### 💾 Persistence
- SQLite database for all data
- Local-first architecture
- No cloud dependency

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://rustup.rs/) (latest stable)
- macOS (Apple Silicon optimized)

### Installation

```bash
# Clone the repository
git clone https://github.com/rfkokt/akira.git
cd akira

# Install dependencies
npm install

# Run in development mode
npm run tauri:dev

# Build for production
npm run tauri:build
```

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Tauri v2 |
| **Frontend** | React 19 + TypeScript + Tailwind CSS |
| **Backend** | Rust |
| **Database** | SQLite (rusqlite) |
| **Editor** | Monaco Editor |
| **State** | Zustand |
| **Icons** | Lucide React |

## 📁 Project Structure

```
akira/
├── src/                    # React Frontend
│   ├── components/         # UI Components
│   │   ├── Chat/          # AI Chat components
│   │   ├── Editor/        # File tree & editor
│   │   ├── Kanban/        # Task board
│   │   ├── ProjectConfig/ # PIC components
│   │   └── layout/        # Layout components
│   ├── store/             # Zustand stores
│   └── styles/            # Global styles
├── src-tauri/             # Rust Backend
│   ├── src/
│   │   ├── db/           # Database layer
│   │   └── main.rs       # Tauri commands
│   └── Cargo.toml
└── package.json
```

## 🛠️ Development

### Available Scripts

```bash
npm run dev          # Start Vite dev server
npm run build        # Build for production
npm run tauri:dev    # Start Tauri in dev mode
npm run tauri:build  # Build Tauri app
```

### AI Engine Configuration

1. Open Settings (gear icon)
2. Register your AI CLI binary:
   - **Alias**: Display name (e.g., "Claude")
   - **Binary Path**: Path to CLI (e.g., `/usr/local/bin/claude`)
   - **Args**: Arguments (e.g., `--dangerously-skip-permissions`)
3. Enable/disable engines as needed

### Project Configuration

1. Click the Config icon (brain icon) in sidebar
2. Edit the 4 sections:
   - Persona: Who the AI should be
   - Tech Stack: Your project's technologies
   - Rules: Guidelines for the AI
   - Tone: How the AI should communicate
3. Click Save to store in database
4. Preview shows the combined system prompt

## 🗺️ Roadmap

### Phase 1: Core Engine ✅
- [x] Tauri + React setup
- [x] SQLite database
- [x] Kanban board
- [x] AI chat with streaming
- [x] Engine management

### Phase 2: Task & Context 🚧
- [x] Task importer (JSON/Markdown/Excel)
- [x] File tree sidebar
- [x] Project Intelligence Config (PIC)
- [ ] Task card binding to system prompt

### Phase 3: Code Interaction
- [ ] Monaco Editor integration
- [ ] Diff viewer
- [ ] Apply changes to disk
- [ ] Git workflow (stage/commit/tag/push)
- [ ] Skills manager (skills.sh integration)

### Phase 4: MCP & Polish
- [ ] MCP server management
- [ ] KORLAP-X as MCP server
- [ ] Multi-language support
- [ ] Auto-debug features

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [Tauri](https://tauri.app/)
- Icons by [Lucide](https://lucide.dev/)
- Editor powered by [Monaco](https://microsoft.github.io/monaco-editor/)
- UI inspired by VS Code

---

<p align="center">Made with ❤️ and ☕</p>
