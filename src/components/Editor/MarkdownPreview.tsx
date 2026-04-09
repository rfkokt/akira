import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeHighlight from 'rehype-highlight';
import { Code, Eye } from 'lucide-react';
import 'highlight.js/styles/github-dark.css';

interface MarkdownPreviewProps {
  content: string;
  viewMode?: 'code' | 'preview' | 'split';
  onViewModeChange?: (mode: 'code' | 'preview' | 'split') => void;
}

export function MarkdownPreview({ 
  content, 
  viewMode = 'preview',
}: MarkdownPreviewProps) {
  if (viewMode === 'code') {
    return (
      <div className="h-full overflow-auto">
        <pre className="p-4 text-sm font-mono text-neutral-200 whitespace-pre-wrap bg-transparent">
          {content}
        </pre>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="p-4 markdown-body">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkBreaks]}
          rehypePlugins={[rehypeHighlight]}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}

// View mode toggle buttons
export function MarkdownViewToggle({ 
  viewMode, 
  onChange 
}: { 
  viewMode: 'code' | 'preview' | 'split';
  onChange: (mode: 'code' | 'preview' | 'split') => void;
}) {
  return (
    <div className="flex items-center gap-0.5 bg-neutral-800 rounded-md p-0.5">
      <button
        onClick={() => onChange('code')}
        className={`px-2 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1 ${
          viewMode === 'code' 
            ? 'bg-neutral-700 text-white' 
            : 'text-neutral-400 hover:text-white'
        }`}
        title="View source code"
      >
        <Code className="w-3 h-3" />
        Code
      </button>
      <button
        onClick={() => onChange('preview')}
        className={`px-2 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1 ${
          viewMode === 'preview' 
            ? 'bg-neutral-700 text-white' 
            : 'text-neutral-400 hover:text-white'
        }`}
        title="View preview"
      >
        <Eye className="w-3 h-3" />
        Preview
      </button>
    </div>
  );
}