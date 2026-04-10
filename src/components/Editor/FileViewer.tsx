import { useState, useEffect, useCallback, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { invoke } from '@tauri-apps/api/core';
import { Save, Loader2, CheckCircle2 } from 'lucide-react';
import { MarkdownPreview, MarkdownViewToggle } from './MarkdownPreview';

interface FileViewerProps {
  filePath: string;
}

export function FileViewer({ filePath }: FileViewerProps) {
  const [content, setContent] = useState<string>('');
  const [originalContent, setOriginalContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'code' | 'preview'>('preview');

  const hasChanges = content !== originalContent;
  
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
          setOriginalContent(result);
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

    // Configure TypeScript to handle JSX and suppress missing module/semantic errors
    if (monaco.languages && monaco.languages.typescript) {
      monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
        jsx: monaco.languages.typescript.JsxEmit?.ReactJSX || 4, // Fallback to 4 if enum not available
        allowNonTsExtensions: true,
        allowJs: true,
        target: monaco.languages.typescript.ScriptTarget?.Latest || 99,
        moduleResolution: monaco.languages.typescript.ModuleResolutionKind?.NodeJs || 2,
      });

      monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
        noSemanticValidation: true,
        noSyntaxValidation: false,
      });

      monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
        noSemanticValidation: true,
        noSyntaxValidation: false,
      });
    }

    // Make sure Monaco exposes the CtrlCmd and KeyS constants
    if (!monaco.KeyMod) return;
    monaco.editor.addKeybindingRules([{
      keybinding: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
      command: 'save-file'
    }]);
  }, []);

  const handleSave = useCallback(async () => {
    if (!hasChanges || saving) return;
    setSaving(true);
    try {
      await invoke('write_file', { path: filePath, content });
      setOriginalContent(content);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      console.error('[FileViewer] Save failed:', err);
      // Optional: add a toast or error state here if needed
    } finally {
      setSaving(false);
    }
  }, [hasChanges, saving, filePath, content]);

  const handleSaveRef = useRef(handleSave);
  useEffect(() => {
    handleSaveRef.current = handleSave;
  }, [handleSave]);

  const handleEditorMount = useCallback((editor: any) => {
    editor.addAction({
      id: 'save-file',
      label: 'Save File',
      keybindings: [2048 | 49], // monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS
      run: () => {
        handleSaveRef.current();
      }
    });
  }, [handleSave]);
  
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

  // Global keyboard shortcut fallback
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave]);

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
          <span className="text-xs font-semibold text-neutral-300 tracking-wide flex items-center gap-1.5">
            {filePath.split('/').pop()}
            {hasChanges && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" title="Unsaved changes" />}
          </span>
          <span className="text-xs text-neutral-600 truncate max-w-[400px]">{filePath.split('/').slice(0,-1).join('/')}</span>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-2 py-0.5 rounded bg-violet-500/20 text-violet-400 hover:bg-violet-500/30 transition-colors flex items-center gap-1 text-[11px] font-medium mr-2 disabled:opacity-50"
              title="Save changes (Cmd+S)"
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : 
               saveSuccess ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : 
               <Save className="w-3 h-3" />}
              Save
            </button>
          )}
          {isMarkdown && (
            <MarkdownViewToggle viewMode={viewMode} onChange={(mode) => setViewMode(mode as 'code' | 'preview')} />
          )}
        </div>
      </div>
      <div className="flex-1 relative overflow-hidden">
        {isMarkdown && viewMode === 'preview' ? (
          <MarkdownPreview content={content} viewMode={viewMode} />
        ) : (
          <Editor
            height="100%"
            language={getLanguage(filePath)}
            path={filePath}
            value={content}
            beforeMount={handleBeforeMount}
            onChange={(val) => setContent(val || '')}
            onMount={handleEditorMount}
            theme="akira-dark"
            options={{
              fontSize: 13,
              fontFamily: 'JetBrains Mono, monospace',
              readOnly: false,
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