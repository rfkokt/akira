import { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import '@xterm/xterm/css/xterm.css';
import { cn } from '@/lib/utils';

interface TerminalProps {
  sessionId: string;
  cwd: string;
  visible?: boolean;
  className?: string;
}

export function Terminal({ sessionId, cwd, visible = true, className }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [isReady, setIsReady] = useState(false);
  const unlistenRef = useRef<UnlistenFn | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  useEffect(() => {
    if (!containerRef.current || !visible || termRef.current) return;

    // Initialize xterm
    const term = new XTerm({
      scrollback: 10000,
      fontFamily: "'SF Mono', 'Fira Code', 'Menlo', monospace",
      fontSize: 13,
      theme: {
        background: '#1a1a1a',
        foreground: '#e0e0e0',
        cursor: '#e0e0e0',
        selectionBackground: '#264f78',
        black: '#1a1a1a',
        red: '#f48771',
        green: '#4ec9b0',
        yellow: '#dcdcaa',
        blue: '#569cd6',
        magenta: '#c586c0',
        cyan: '#9cdcfe',
        white: '#e0e0e0',
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    fitAddon.fit();

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // Spawn PTY session
    const spawnSession = async () => {
      try {
        // Listen for PTY output
        const unlisten = await listen<{ id: string; data: number[] }>('pty-output', (event) => {
          if (event.payload.id === sessionId && termRef.current) {
            const uint8Array = new Uint8Array(event.payload.data);
            termRef.current.write(uint8Array);
          }
        });
        unlistenRef.current = unlisten;

        // Spawn shell
        await invoke('spawn_pty_session', {
          sessionId,
          binary: '/bin/zsh',
          args: ['-l'],
          cwd,
        });

        // Send initial resize
        const { rows, cols } = term;
        await invoke('pty_resize', { sessionId, rows, cols });

        setIsReady(true);
      } catch (error) {
        console.error('[Terminal] Failed to spawn:', error);
        term.writeln(`\r\n\x1b[31mFailed to open terminal: ${error}\x1b[0m`);
      }
    };

    spawnSession();

    // Handle user input
    term.onData(async (data) => {
      try {
        await invoke('pty_write', { sessionId, data });
      } catch (error) {
        console.error('[Terminal] Write error:', error);
      }
    });

    // Setup resize observer
    resizeObserverRef.current = new ResizeObserver(() => {
      if (fitAddonRef.current && termRef.current) {
        fitAddonRef.current.fit();
        const { rows, cols } = termRef.current;
        invoke('pty_resize', { sessionId, rows, cols }).catch(() => {});
      }
    });

    if (containerRef.current) {
      resizeObserverRef.current.observe(containerRef.current);
    }

    return () => {
      cleanup();
    };
  }, [sessionId, cwd, visible]);

  const cleanup = async () => {
    resizeObserverRef.current?.disconnect();
    unlistenRef.current?.();
    termRef.current?.dispose();
    termRef.current = null;
    
    try {
      await invoke('pty_kill', { sessionId });
    } catch (error) {
      // Ignore cleanup errors
    }
  };

  if (!visible) return null;

  return (
    <div 
      ref={containerRef} 
      className={cn(
        "flex-1 min-h-0 bg-[#1a1a1a] overflow-hidden rounded-lg",
        !isReady && "opacity-50",
        className
      )}
    />
  );
}
