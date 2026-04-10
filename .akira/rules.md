# Workspace Standards

## Overview
AI-powered desktop workspace manager for coding projects with Kanban task boards, context-aware AI chat, and file management

## Tech Stack
- **Runtime**: Node.js 20+ / TypeScript 5.x
- **Framework**: Tauri v2 (Rust backend) + React 19 frontend
- **Ui**: Base UI primitives + Tailwind CSS + custom design system
- **State**: Zustand with per-feature stores (workspace, task, aiChat, mcp, config)
- **Api**: Tauri invoke() for Rust commands, MCP (Model Context Protocol) for AI tools
- **Database**: SQLite via Rust rusqlite - one DB per workspace
- **Auth**: N/A (local desktop app)
- **Testing**: N/A (no test framework configured)
- **Build**: Vite 8 + esbuild

## Architecture
- **Pattern**: Feature-based with domain folders (Workspaces, Kanban, Chat, Editor, Settings)
- **Data Flow**: React components → Zustand stores → invoke() calls → Rust commands → SQLite database
- **Key Directories**:
  - src/components/ — Feature-based components organized by domain (Workspaces/, Kanban/, Chat/, Editor/, Settings/)
  - src/store/ — Zustand stores (workspaceStore, taskStore, aiChatStore, mcpStore, engineStore, configStore)
  - src/lib/ — Service layer (db.ts for Tauri commands, providers.ts for AI engines, mcp/ for MCP server management)
  - src/hooks/ — Custom React hooks (useAnalyzeProject, useTaskDrag, useGitOperations, useAIWorkflow)
  - src-tauri/src/ — Rust backend with commands/ and db/ modules
  - src/components/ui/ — Reusable UI components (button, input, dialog, select, etc.)

## Component Patterns
- **Reusability**: UI components in src/components/ui/ for reusability, feature components in domain folders (Chat/, Kanban/, Editor/)
- **Naming**: PascalCase for components (TaskCard.tsx, ChatBox.tsx), camelCase for utilities (db.ts, helpers.ts)
- **State Management**: Zustand stores with TypeScript interfaces, stores imported from @/store index, async actions with try/catch
- **Forms**: Controlled components with useState, Base UI primitives (Input, Textarea, Select), shadcn-style components
- **Styling**: Tailwind CSS with custom CSS variables for theming, cn() utility for className merging, CVA for variant-based styling

## Code Rules

### DO
- Use TypeScript strict mode with all type definitions in src/types/index.ts
- Import from '@/store' index rather than individual store files
- Use cn() utility from @/lib/utils for conditional className merging
- Use Tauri invoke() from @tauri-apps/api/core for all backend communication
- Define custom hooks for complex stateful logic (useTaskDrag, useAnalyzeProject)
- Organize imports: external libraries → internal imports → types
- Use async/await patterns in store actions with proper error handling

### DON'T
- Don't use CSS-in-JS libraries - use Tailwind classes with custom CSS variables
- Don't bypass Zustand stores for global state - use stores for shared state
- Don't hardcode paths - use @/ alias for imports
- Don't mix Rust backend code with React frontend - communicate via invoke()
- Don't use prop drilling for deeply nested state - use Zustand context
- Don't use class-based components - all components are functional with hooks

## Security
- **Auth Pattern**: N/A (local desktop app, no server authentication)
- **Role Check**: N/A (single-user desktop application)
- **Data Sanitization**: Rust backend validates file paths, TypeScript interfaces enforce type safety, AI responses handled as strings