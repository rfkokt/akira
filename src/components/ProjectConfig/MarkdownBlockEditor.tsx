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
        onMount={handleEditorDidMount}
        theme="vs-dark"
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
          <div className="flex items-center justify-center h-full text-neutral-500">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-[#0e639c] border-t-transparent rounded-full animate-spin" />
              <span className="text-xs font-geist">Loading editor...</span>
            </div>
          </div>
        }
      />
      
      {/* Language indicator */}
      <div className="absolute bottom-2 right-2 px-2 py-0.5 bg-[#1e1e1e] border border-white/10 rounded text-xs text-neutral-500 font-geist pointer-events-none">
        Markdown
      </div>
    </div>
  );
}
