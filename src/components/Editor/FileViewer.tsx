import { useState, useEffect, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { invoke } from '@tauri-apps/api/core';

interface FileViewerProps {
  filePath: string;
}

export function FileViewer({ filePath }: FileViewerProps) {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    if (!filePath) return;

    const loadFile = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await invoke<string>('read_file', { path: filePath });
        if (isMounted) {
          setContent(result);
        }
      } catch (err) {
        if (isMounted) setError(String(err));
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadFile();

    return () => {
      isMounted = false;
    };
  }, [filePath]);

  const handleBeforeMount = useCallback((monaco: any) => {
    monaco.editor.defineTheme('akira-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#00000000',
        'editorMargin.background': '#00000000',
      }
    });
  }, []);
  
  const getLanguage = (path: string) => {
    const ext = path.split('.').pop()?.toLowerCase();
    switch(ext) {
      case 'tsx':
      case 'ts': return 'typescript';
      case 'jsx':
      case 'js': return 'javascript';
      case 'json': return 'json';
      case 'css': return 'css';
      case 'html': return 'html';
      case 'rs': return 'rust';
      case 'md': return 'markdown';
      case 'py': return 'python';
      default: return 'plaintext';
    }
  }

  if (loading) {
     return <div className="h-full w-full flex items-center justify-center text-xs text-neutral-500 font-geist">Loading file...</div>;
  }

  if (error) {
     return <div className="h-full w-full flex items-center justify-center text-xs text-red-500 font-geist break-all px-6 text-center">Failed to load file: {error}</div>;
  }

  return (
    <div className="h-full w-full flex flex-col relative bg-transparent overflow-hidden">
      <div className="px-5 py-2.5 border-b border-app-border flex items-center shrink-0 bg-black/10">
         <div className="flex items-center gap-2">
           <span className="text-xs font-semibold text-neutral-300 font-geist tracking-wide">{filePath.split('/').pop()}</span>
           <span className="text-[10px] text-neutral-600 font-geist truncate max-w-[400px]">{filePath.split('/').slice(0,-1).join('/')}</span>
         </div>
      </div>
      <div className="flex-1 relative">
        <Editor
          height="100%"
          language={getLanguage(filePath)}
          value={content}
          beforeMount={handleBeforeMount}
          theme="akira-dark"
          options={{
            fontSize: 13,
            fontFamily: 'JetBrains Mono, monospace',
            readOnly: true,
            minimap: { enabled: true },
            wordWrap: 'off',
            scrollBeyondLastLine: false,
            padding: { top: 16 }
          }}
          loading={<div className="h-full w-full flex items-center justify-center text-xs text-neutral-500 font-geist">Preparing editor...</div>}
        />
      </div>
    </div>
  );
}
