# AI Engine Provider System

Akira menggunakan sistem provider registry untuk mendukung berbagai AI engine (CLI-based). Semua logika spesifik provider terpusat di satu file: `src/lib/providers.ts`.

## Arsitektur

```
┌─────────────────────────────────────────────────┐
│                  Provider Registry              │
│                 src/lib/providers.ts             │
│                                                 │
│  ┌───────────┐  ┌──────────┐  ┌──────────────┐ │
│  │  opencode  │  │  claude   │  │  (your new)  │ │
│  │  Provider  │  │  Provider │  │   Provider   │ │
│  └───────────┘  └──────────┘  └──────────────┘ │
└─────────────────────┬───────────────────────────┘
                      │ getProvider(alias)
         ┌────────────┼────────────┐
         ▼            ▼            ▼
   aiChatStore   TaskCreator    (any future
   (runAITask,   Chat.tsx       consumer)
    sendMessage)
```

## Provider yang Tersedia

| Alias | Engine | Prompt Delivery | Output Format |
|-------|--------|----------------|---------------|
| `opencode` | OpenCode CLI | Argument terakhir | JSON (streaming events) |
| `claude` | Claude Code | stdin | Plain text |
| `__default__` | Engine lainnya | stdin | Plain text |

## Menambah Provider Baru

### 1. Buka `src/lib/providers.ts`

### 2. Buat `ProviderConfig`

```typescript
const myNewProvider: ProviderConfig = {
  alias: 'my-engine',  // harus match dengan engine.alias di Settings

  buildArgs({ engineArgs, prompt, cwd }) {
    // Tentukan bagaimana prompt dikirim ke CLI
    return {
      args: ['--some-flag', '--cwd', cwd],
      stdinPrompt: prompt,  // '' jika prompt via argument
    };
  },

  parseOutputLine(line: string): ParsedOutput | null {
    // Parse satu baris output dari CLI
    // Return null untuk skip baris (heartbeat, etc.)
    if (!line.trim()) return null;
    
    return {
      displayText: line,  // tampil di chat bubble
      step: {             // tampil di progress panel
        type: 'text',     // 'step_start' | 'tool_use' | 'text' | 'error' | 'complete'
        content: line.substring(0, 100),
      },
    };
  },
};
```

### 3. Register di `PROVIDER_REGISTRY`

```typescript
const PROVIDER_REGISTRY: Record<string, ProviderConfig> = {
  opencode: opencodeProvider,
  claude: claudeProvider,
  'my-engine': myNewProvider,  // ← tambah di sini
};
```

### 4. Selesai!

Tidak perlu edit file lain. `aiChatStore.ts` dan `TaskCreatorChat.tsx` otomatis pakai provider baru via `getProvider(engine.alias)`.

## Interface

### `ProviderConfig`

```typescript
interface ProviderConfig {
  alias: string;
  
  buildArgs(params: {
    engineArgs: string;  // engine.args dari settings
    prompt: string;      // prompt yang sudah di-build
    cwd: string;         // workspace folder path
  }) => { args: string[]; stdinPrompt: string };
  
  parseOutputLine(line: string) => ParsedOutput | null;
}
```

### `ParsedOutput`

```typescript
interface ParsedOutput {
  displayText: string;  // Ditampilkan di chat message
  step?: {
    type: 'step_start' | 'tool_use' | 'text' | 'error' | 'complete';
    content: string;    // Ditampilkan di progress panel
  };
}
```

## API

```typescript
import { getProvider, registerProvider, getRegisteredProviders } from '@/lib/providers';

// Get provider (fallback ke default jika tidak ditemukan)
const provider = getProvider('opencode');

// Register provider baru saat runtime
registerProvider(myNewProvider);

// List semua provider yang terdaftar
const aliases = getRegisteredProviders(); // ['opencode', 'claude']
```

## Contoh: Provider untuk Aider

```typescript
const aiderProvider: ProviderConfig = {
  alias: 'aider',

  buildArgs({ prompt, cwd }) {
    return {
      args: ['--yes-always', '--no-git', '--message', prompt],
      stdinPrompt: '',
    };
  },

  parseOutputLine(line: string): ParsedOutput | null {
    if (!line.trim()) return null;
    
    // Aider uses specific prefixes
    if (line.startsWith('>>> ')) {
      return {
        displayText: line,
        step: { type: 'tool_use', content: line.replace('>>> ', '') },
      };
    }
    
    return {
      displayText: line,
      step: { type: 'text', content: line.substring(0, 100) },
    };
  },
};
```

## File yang Menggunakan Provider

| File | Fungsi | Penggunaan |
|------|--------|------------|
| `src/store/aiChatStore.ts` | `runAITask()` | Build args + parse output |
| `src/store/aiChatStore.ts` | `sendMessage()` | Build args + parse output |
| `src/components/Kanban/TaskCreatorChat.tsx` | CLI listener | Parse output untuk progress panel |
