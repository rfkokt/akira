import { useState, useEffect, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { invoke } from '@tauri-apps/api/core';
import { MarkdownPreview, MarkdownViewToggle } from './MarkdownPreview';

interface FileViewerProps {
  filePath: string;
}

export function FileViewer({ filePath }: FileViewerProps) {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'code' | 'preview'>('preview');
  
  const isMarkdown = filePath.toLowerCase().endsWith('.md') || 
                     filePath.toLowerCase().endsWith('.markdown');

  // Reset view mode when file changes
  useEffect(() => {
    if (isMarkdown) {
      setViewMode('preview');
    }
  }, [filePath, isMarkdown]);

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
      case 'md':
      case 'markdown': return 'markdown';
      case 'py': return 'python';
      default: return 'plaintext';
    }
  }

  if (loading) {
    return <div className="h-full w-full flex items-center justify-center text-xs text-neutral-500">Loading file...</div>;
  }

  if (error) {
    return <div className="h-full w-full flex items-center justify-center text-xs text-red-500 break-all px-6 text-center">Failed to load file: {error}</div>;
  }

  return (
    <div className="h-full w-full flex flex-col relative bg-transparent overflow-hidden">
      <div className="px-5 py-2.5 border-b border-app-border flex items-center justify-between shrink-0 bg-black/10">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-neutral-300 tracking-wide">{filePath.split('/').pop()}</span>
          <span className="text-xs text-neutral-600 truncate max-w-[400px]">{filePath.split('/').slice(0,-1).join('/')}</span>
        </div>
        {isMarkdown && (
          <MarkdownViewToggle viewMode={viewMode} onChange={(mode) => setViewMode(mode as 'code' | 'preview')} />
        )}
      </div>
      <div className="flex-1 relative overflow-hidden">
        {isMarkdown && viewMode === 'preview' ? (
          <MarkdownPreview content={content} viewMode={viewMode} />
        ) : (
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
              wordWrap: 'on',
              automaticLayout: true,
              scrollBeyondLastLine: false,
              padding: { top: 16 }
            }}
            loading={<div className="h-full w-full flex items-center justify-center text-xs text-neutral-500">Preparing editor...</div>}
          />
        )}
      </div>
    </div>
  );
}