# Akira

> **AI-Powered Task & Code Workflow Manager**

Desktop app untuk mengelola coding workflow dengan AI. Bukan chat biasa — Akira adalah task manager yang menjalankan AI agent langsung di codebase lo.

![Tauri](https://img.shields.io/badge/Tauri-v2-blueviolet?logo=tauri)
![React](https://img.shields.io/badge/React-v19-61DAFB?logo=react)
![Rust](https://img.shields.io/badge/Rust-white?logo=rust&logoColor=black)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

---

## Cara Kerjanya

```
1. Pilih workspace (project folder)
2. Describe task → AI generate title, description, priority
3. Klik Start → AI agent ngerjain langsung di codebase
4. Review diff → approve atau rollback
```

Tiap task berjalan di Kanban board: **Todo → In Progress → Review → Done**

---

## Fitur

### 🔀 CLI Router
Route task ke AI provider yang paling tepat.

- Support: Claude, OpenAI, Ollama (local), OpenCode, custom binary
- Auto-switch ke provider lain kalau token limit tercapai mid-session
- Context preservation saat switch — conversation tidak hilang
- Switch history tersimpan di database

### 📊 Cost Tracking
- Track usage per provider: requests, tokens, estimated cost
- Budget limit & alert threshold (configurable di Settings)
- Dashboard dengan breakdown per provider

### 🌿 Git Workflow
- View status, stage/unstage files, commit, push dari dalam app
- Multi-branch merge: `feature → development → staging → production`
- Task Done bisa di-merge berkali-kali, source branch otomatis ngambil dari branch terakhir

### 🧠 Project Analysis & Rules
AI scan project lo dan generate rules spesifik:
```
DO: gunakan pattern ini
DONT: hindari anti-pattern ini
```
Rules disimpan di `.akira/rules.md` dan otomatis masuk ke setiap system prompt.

### 💬 Chat per Task
- Tiap task punya conversation history sendiri
- Persist di SQLite — tidak hilang saat app di-restart
- Task Creator Chat: diskusi bebas dulu sama AI, baru generate task dari hasil diskusinya

### 🧩 Skills On-Demand
Inject pengetahuan domain ke AI hanya saat dibutuhkan.

```
# Manual load
/skill tauri-v2

# Auto-detect: AI emit sinyal saat butuh skill
[SKILL: frontend-design]
→ Sistem load konten lengkap ke prompt berikutnya
```

~8.000 karakter vs 50k+ kalau di-inject semua. Jalan di semua AI provider.

### 🖥️ Terminal
PTY-based terminal (bukan shell exec biasa).
- Multi-tab
- Resizable panel
- Powered by `portable-pty` (Rust) + xterm.js

### 🔌 MCP Integration
Support MCP servers untuk extend kemampuan AI agent. Tools discovery, stdio transport, per-workspace configuration.

### 📁 File Explorer & Editor
- Tree view dengan file type icons
- Monaco Editor dengan syntax highlighting
- Diff viewer untuk review perubahan AI

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/) (stable toolchain)
- Minimal satu AI CLI: [Claude Code](https://docs.anthropic.com/en/docs/claude-code), [Ollama](https://ollama.ai/), atau OpenCode

### Install & Run

```bash
git clone https://github.com/rfkokt/akira.git
cd akira
npm install
npm run tauri:dev
```

---

## Panduan Penggunaan

### 1. Buat Workspace

Workspace = project folder lo.

- Klik **+ New Workspace**
- Pilih folder project (native folder picker)
- Beri nama

### 2. Tambah AI Engine

- Buka **Settings → Engines**
- Klik **Add Engine**
- Isi:
  - **Name**: label yang ditampilkan
  - **Binary Path**: path ke CLI executable
  - **Args**: argumen default

Contoh:
| Engine | Binary | Args |
|--------|--------|------|
| Claude | `/usr/local/bin/claude` | `--dangerously-skip-permissions` |
| Ollama | `ollama` | `run llama3` |
| OpenCode | `/usr/local/bin/opencode` | *(kosong)* |

### 3. Analisa Project (Opsional tapi Recommended)

- Buka **Settings → Project Analysis**
- Klik **Analyze**
- AI akan scan codebase dan generate rules di `.akira/rules.md`
- Rules ini otomatis di-include ke setiap task yang dijalankan AI

### 4. Buat Task

**Cara 1 — Task Creator Chat:**
- Klik ikon chat di header
- Describe apa yang mau dibuat dalam bahasa natural
- AI generate task → review → confirm

**Cara 2 — Manual:**
- Klik **+ Add Task** di Kanban board
- Isi title, description, priority

### 5. Jalankan Task dengan AI

- Klik **Start AI** di task card
- Task otomatis pindah ke **In Progress**
- Output AI streaming masuk ke chat task tersebut
- Setelah selesai, task pindah ke **Review**

### 6. Review & Merge

- Lihat diff perubahan yang dilakukan AI
- **Approve** → commit & push
- **Rollback** → revert semua perubahan

### 7. Git Workflow

- Buka tab **Git** di sidebar
- Stage files, tulis commit message (atau generate dengan AI)
- Push ke remote
- Multi-branch: merge task ke development, lalu ke staging, lalu ke production

---

## Settings

| Tab | Fungsi |
|-----|--------|
| **Engines** | Tambah/kelola AI CLI providers |
| **Router** | Konfigurasi auto-switch, budget limit, alert threshold |
| **MCP** | Tambah MCP servers |
| **Project Analysis** | Jalankan analisis codebase |
| **Skills** | Kelola skills yang tersedia untuk AI |
| **Chat API** | Groq API untuk task creator chat (gratis 1M tokens/hari) |

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Framework | Tauri v2 |
| Frontend | React 19 + TypeScript + Vite |
| Styling | Tailwind CSS |
| State | Zustand |
| Editor | Monaco Editor |
| Terminal | xterm.js |
| Backend | Rust |
| Database | SQLite (rusqlite) |
| DnD | @dnd-kit |

---

## Development

```bash
npm run tauri:dev     # Development
npm run tauri:build   # Build untuk distribusi
npx tsc --noEmit      # TypeScript check
cargo check --manifest-path src-tauri/Cargo.toml  # Rust check
```

---

## License

MIT

---

<p align="center">Built for developers who want AI in their workflow, not the other way around.</p>
