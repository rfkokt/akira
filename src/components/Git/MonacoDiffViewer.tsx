import { useState, useEffect, useCallback, useRef } from 'react';
import { DiffEditor } from '@monaco-editor/react';
import { invoke } from '@tauri-apps/api/core';
import type * as Monaco from 'monaco-editor';

interface MonacoDiffViewerProps {
  filePath: string;
  workspacePath: string;
}

export function MonacoDiffViewer({ filePath, workspacePath }: MonacoDiffViewerProps) {
  const [originalContent, setOriginalContent] = useState<string>('');
  const [modifiedContent, setModifiedContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editorRef = useRef<Monaco.editor.IStandaloneDiffEditor | null>(null);

  useEffect(() => {
    let isMounted = true;
    if (!filePath || !workspacePath) return;

    const loadDiff = async () => {
      setLoading(true);
      setError(null);
      try {
        // Fetch original (HEAD) content
        const orig = await invoke<string>('git_show_head', { cwd: workspacePath, path: filePath });
        
        let mod = '';
        try {
           mod = await invoke<string>('read_file', { path: `${workspacePath}/${filePath}` });
        } catch (e) {
           mod = ''; // File was deleted
        }

        if (isMounted) {
          setOriginalContent(orig);
          setModifiedContent(mod);
        }
      } catch (err) {
        if (isMounted) setError(String(err));
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadDiff();
    return () => { isMounted = false; };
  }, [filePath, workspacePath]);

  const handleBeforeMount = useCallback((monaco: typeof Monaco) => {
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

  const handleMount = useCallback((editor: Monaco.editor.IStandaloneDiffEditor) => {
    editorRef.current = editor;
  }, []);

  // Cleanup editor on unmount
  useEffect(() => {
    return () => {
      if (editorRef.current) {
        editorRef.current.dispose();
        editorRef.current = null;
      }
    };
  }, []);

  // Reset editor when file changes
  useEffect(() => {
    return () => {
      if (editorRef.current) {
        const originalModel = editorRef.current.getOriginalEditor().getModel();
        const modifiedModel = editorRef.current.getModifiedEditor().getModel();
        if (originalModel) originalModel.dispose();
        if (modifiedModel) modifiedModel.dispose();
      }
    };
  }, [filePath]);

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
     return <div className="h-full w-full flex items-center justify-center text-xs text-neutral-500">Loading diff...</div>;
  }

  if (error) {
     return <div className="h-full w-full flex items-center justify-center text-xs text-red-500">Error loading diff: {error}</div>;
  }

  return (
    <div className="h-full w-full flex flex-col relative bg-transparent overflow-hidden">
      <div className="px-5 py-2.5 border-b border-app-border flex items-center shrink-0 bg-black/10">
         <div className="flex items-center gap-2">
           <span className="text-xs font-semibold text-neutral-300 tracking-wide">{filePath.split('/').pop()}</span>
           <span className="text-xs text-neutral-600 truncate max-w-[400px]">({filePath})</span>
         </div>
      </div>
      <div className="flex-1 relative">
        <DiffEditor
          height="100%"
          language={getLanguage(filePath)}
          original={originalContent}
          modified={modifiedContent}
          theme="akira-dark"
          beforeMount={handleBeforeMount}
          onMount={handleMount}
          options={{
            fontSize: 13,
            fontFamily: 'JetBrains Mono, monospace',
            readOnly: true,
            minimap: { enabled: false },
            renderSideBySide: true,
            padding: { top: 16 },
            automaticLayout: true,
            wordWrap: 'on',
            diffWordWrap: 'on'
          }}
          loading={<div className="h-full w-full flex items-center justify-center text-xs text-neutral-500">Preparing diff viewer...</div>}
        />
      </div>
    </div>
  );
}
