import { useRef, useCallback } from 'react';
import Editor from '@monaco-editor/react';

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  height?: string;
}

export function MarkdownEditor({ value, onChange, height = '100%' }: MarkdownEditorProps) {
  const editorRef = useRef<any>(null);

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

  const handleEditorDidMount = useCallback((editor: any) => {
    editorRef.current = editor;
    
    // Set custom theme for dark mode
    editor.updateOptions({
      fontSize: 13,
      fontFamily: 'JetBrains Mono, monospace',
      lineNumbers: 'on',
      roundedSelection: false,
      scrollBeyondLastLine: false,
      minimap: { enabled: false },
      wordWrap: 'on',
      automaticLayout: true,
      padding: { top: 16 },
    });
  }, []);

  const handleChange = useCallback((newValue: string | undefined) => {
    if (newValue !== undefined) {
      onChange(newValue);
    }
  }, [onChange]);

  return (
    <div className="relative h-full w-full">
      <Editor
        height={height}
        defaultLanguage="markdown"
        value={value}
        onChange={handleChange}
        beforeMount={handleBeforeMount}
        onMount={handleEditorDidMount}
        theme="akira-dark"
        options={{
          fontSize: 13,
          fontFamily: 'JetBrains Mono, monospace',
          lineNumbers: 'on',
          roundedSelection: false,
          scrollBeyondLastLine: false,
          minimap: { enabled: false },
          wordWrap: 'on',
          automaticLayout: true,
          padding: { top: 16 },
        }}
        loading={
          <div className="flex items-center justify-center h-full text-neutral-500 bg-black/10">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-app-accent border-t-transparent rounded-full animate-spin shadow-[0_0_10px_var(--app-accent-glow)]" />
              <span className="text-sm tracking-wide font-geist">Initializing editor...</span>
            </div>
          </div>
        }
      />
      
      {/* Language indicator */}
      <div className="absolute bottom-4 right-6 px-3 py-1 bg-black/40 backdrop-blur-md border border-white/10 shadow-lg rounded-full text-xs text-neutral-400 font-mono tracking-wide pointer-events-none">
        Markdown
      </div>
    </div>
  );
}
