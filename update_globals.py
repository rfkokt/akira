import os
import re

file_path = '/Volumes/External M4/Project/ars-ai/akira/src/styles/globals.css'

with open(file_path, 'r') as f:
    content = f.read()

new_layer_base = """@layer base {
  :root, .dark {
    /* ─── Base Surfaces ─── */
    --app-bg: #0f1117;
    --app-panel: #161922;
    --app-sidebar: #131620;
    --app-titlebar: #0d0f14;
    
    /* ─── Surface Layers (replaces white/N and black/N) ─── */
    --app-surface-1: rgba(255, 255, 255, 0.03);
    --app-surface-2: rgba(255, 255, 255, 0.05);
    --app-surface-3: rgba(255, 255, 255, 0.08);
    --app-surface-hover: rgba(255, 255, 255, 0.10);
    --app-surface-active: rgba(255, 255, 255, 0.14);
    
    /* ─── Overlays (replaces bg-black/60, bg-black/80, etc.) ─── */
    --app-overlay-dim: rgba(0, 0, 0, 0.5);
    --app-overlay-heavy: rgba(0, 0, 0, 0.7);
    --app-overlay-opaque: rgba(0, 0, 0, 0.85);
    
    /* ─── Borders (replaces border-white/5, border-white/10) ─── */
    --app-border: rgba(255, 255, 255, 0.06);
    --app-border-highlight: rgba(255, 255, 255, 0.12);
    --app-border-focus: rgba(59, 130, 246, 0.5);
    
    /* ─── Accent ─── */
    --app-accent: #3b82f6;
    --app-accent-hover: #60a5fa;
    --app-accent-muted: rgba(59, 130, 246, 0.08);
    --app-accent-glow: rgba(59, 130, 246, 0.15);
    --app-accent-alt: #ff3366;
    
    /* ─── Text Hierarchy ─── */
    --app-text: #e8eaed;
    --app-text-secondary: #8b95a5;
    --app-text-muted: #5b6478;
    --app-text-disabled: #3d4556;
    
    /* ─── Semantic Colors ─── */
    --app-success: #22c55e;
    --app-warning: #f59e0b;
    --app-danger: #ef4444;
    --app-info: #3b82f6;
    
    /* ─── Typography Scale ─── */
    --font-2xs: 0.6875rem;  /* 11px */
    --font-xs: 0.75rem;     /* 12px */
    --font-sm: 0.8125rem;   /* 13px */
    --font-base: 0.875rem;  /* 14px */
    --font-lg: 0.9375rem;   /* 15px */
    --font-xl: 1.0625rem;   /* 17px */
    --font-2xl: 1.25rem;    /* 20px */
    --font-3xl: 1.5rem;     /* 24px */
    
    /* ─── Motion ─── */
    --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
    --ease-smooth: cubic-bezier(0.4, 0, 0.2, 1);
    --ease-snap: cubic-bezier(0.2, 0, 0, 1);
    --duration-fast: 150ms;
    --duration-normal: 250ms;
    --duration-slow: 400ms;

    /* Shadcn defaults mapped to our new colors */
    --background: var(--app-bg);
    --foreground: var(--app-text);
    --card: var(--app-panel);
    --card-foreground: var(--app-text);
    --popover: var(--app-panel);
    --popover-foreground: var(--app-text);
    --primary: var(--app-accent);
    --primary-foreground: #ffffff;
    --secondary: var(--app-surface-2);
    --secondary-foreground: var(--app-text);
    --muted: var(--app-surface-1);
    --muted-foreground: var(--app-text-muted);
    --accent: var(--app-surface-2);
    --accent-foreground: var(--app-text);
    --destructive: var(--app-danger);
    --destructive-foreground: #ffffff;
    --border: var(--app-border);
    --input: var(--app-border);
    --ring: var(--app-accent);
    --radius: 0.625rem;

    --chart-1: #0ea5e9;
    --chart-2: #38bdf8;
    --chart-3: #ff3366;
    --chart-4: #2c2d33;
    --chart-5: #ffffff;

    --sidebar: var(--app-sidebar);
    --sidebar-foreground: var(--app-text);
    --sidebar-primary: var(--app-accent);
    --sidebar-primary-foreground: #ffffff;
    --sidebar-accent: var(--app-surface-2);
    --sidebar-accent-foreground: var(--app-text);
    --sidebar-border: var(--app-border);
    --sidebar-ring: var(--app-accent);

    /* Original typography vars */
    --font-size-xs: var(--font-xs);
    --font-size-sm: var(--font-sm);
    --font-size-base: var(--font-base);
    --font-size-lg: var(--font-lg);
    --font-size-xl: var(--font-xl);
    --font-size-2xl: var(--font-2xl);
  }

  .theme {
    --font-heading: var(--font-sans);
    --font-sans: 'Geist', sans-serif;
  }

  * {
    @apply border-border;
  }

  html, body, #root {
    margin: 0;
    padding: 0;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    background-color: transparent !important;
    font-family: 'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  body {
    @apply bg-background text-foreground antialiased;
    font-feature-settings: "rlig" 1, "calt" 1;
  }
}

/* Animations */
@keyframes modal-enter { 
  from { opacity: 0; transform: scale(0.97); } 
  to { opacity: 1; transform: scale(1); } 
}
@keyframes modal-exit { 
  from { opacity: 1; transform: scale(1); } 
  to { opacity: 0; transform: scale(0.97); } 
}
.modal-content { 
  animation: modal-enter var(--duration-fast) var(--ease-smooth); 
}

/* VS Code-like Scrollbar */"""

match = re.search(r"@layer base \{.*?\/\* VS Code-like Scrollbar \*\/", content, re.DOTALL)
if match:
    new_content = content[:match.start()] + new_layer_base + content[match.end() - 28:]
    with open(file_path, 'w') as f:
        f.write(new_content)
    print("Success")
else:
    print("Failed finding block")
