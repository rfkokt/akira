import { X, Copy, Check } from 'lucide-react';
import { useConfigStore } from '@/store/configStore';
import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';

interface PromptPreviewProps {
  onClose: () => void;
}

export function PromptPreview({ onClose }: PromptPreviewProps) {
  const { getSystemPrompt } = useConfigStore();
  const [copied, setCopied] = useState(false);
  
  const systemPrompt = getSystemPrompt();

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(systemPrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [systemPrompt]);

  // Parse sections for better display
  const sections = systemPrompt.split('\n\n---\n\n').filter(Boolean);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-[700px] mx-4 max-h-[80vh] bg-[#1e1e1e] rounded-lg border border-white/10 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-[#252526]">
          <div>
            <h3 className="text-sm font-semibold text-white">
              System Prompt Preview
            </h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              This is the full prompt that will be sent to AI
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              className="text-neutral-300 hover:text-white"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-green-400 mr-1.5" />
                  <span className="text-green-400">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 mr-1.5" />
                  Copy
                </>
              )}
            </Button>
            
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8 text-neutral-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {sections.length === 0 ? (
            <div className="text-center py-8 text-neutral-500">
              <p className="text-sm">No configuration yet</p>
              <p className="text-xs mt-1">
                Configure Rules first
              </p>
            </div>
          ) : (
            sections.map((section, index) => (
              <div key={index} className="bg-[#252526] rounded border border-white/5 overflow-hidden">
                <div className="px-3 py-2 bg-[#2d2d2d] border-b border-white/5">
                  <span className="text-xs font-medium text-neutral-400 uppercase tracking-wide">
                    Section {index + 1}
                  </span>
                </div>
                <pre className="p-3 text-xs text-neutral-300 whitespace-pre-wrap overflow-x-auto">
                  {section}
                </pre>
              </div>
            ))
          )}
          
          {/* Full Prompt */}
          {sections.length > 0 && (
            <div className="mt-4 pt-4 border-t border-white/5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-neutral-400 uppercase tracking-wide">
                  Full Prompt
                </span>
                <span className="text-xs text-neutral-500">
                  {systemPrompt.length} characters
                </span>
              </div>
              <pre className="p-3 text-xs text-neutral-300 whitespace-pre-wrap bg-[#252526] rounded border border-white/5 overflow-x-auto max-h-[300px]">
                {systemPrompt}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-white/5 bg-[#252526] flex items-center justify-between">
          <div className="text-xs text-neutral-500">
            Project: Workspace Config
          </div>
          <Button
            size="sm"
            onClick={onClose}
            className="bg-[#0e639c] hover:bg-[#1177bb]"
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
