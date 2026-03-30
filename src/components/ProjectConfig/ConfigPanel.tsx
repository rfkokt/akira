import { useState, useCallback, useEffect } from 'react';
import { Eye, Save, User, Layers, Shield, MessageSquare, Check } from 'lucide-react';
import { useConfigStore } from '@/store/configStore';
import { MarkdownEditor } from './MarkdownBlockEditor';

interface ConfigPanelProps {
  projectId: string;
}

const tabs = [
  { id: 'persona' as const, label: 'Persona', icon: User },
  { id: 'tech-stack' as const, label: 'Tech', icon: Layers },
  { id: 'rules' as const, label: 'Rules', icon: Shield },
  { id: 'tone' as const, label: 'Tone', icon: MessageSquare },
];

export function ConfigPanel({ projectId }: ConfigPanelProps) {
  const { 
    config, 
    activeTab, 
    setActiveTab, 
    loadConfig, 
    saveConfig, 
    updateField,
    getSystemPrompt,
    isLoading 
  } = useConfigStore();
  
  const [showPreview, setShowPreview] = useState(false);
  const [copied, setCopied] = useState(false);

  // Load config when component mounts or projectId changes
  useEffect(() => {
    loadConfig(projectId);
  }, [projectId, loadConfig]);

  const handleSave = useCallback(async () => {
    if (!config) return;
    await saveConfig(config);
  }, [config, saveConfig]);

  const handleEditorChange = useCallback((value: string) => {
    const fieldMap = {
      'persona': 'md_persona',
      'tech-stack': 'md_tech_stack',
      'rules': 'md_rules',
      'tone': 'md_tone',
    } as const;
    
    updateField(fieldMap[activeTab], value);
  }, [activeTab, updateField]);

  const handleCopyPrompt = useCallback(async () => {
    const prompt = getSystemPrompt();
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [getSystemPrompt]);

  const getCurrentValue = () => {
    if (!config) return '';
    switch (activeTab) {
      case 'persona': return config.md_persona;
      case 'tech-stack': return config.md_tech_stack;
      case 'rules': return config.md_rules;
      case 'tone': return config.md_tone;
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#252526] border-r border-white/5">
      {/* Header */}
      <div className="px-3 py-2 border-b border-white/5 flex items-center justify-between">
        <span className="text-xs font-medium text-neutral-400 font-geist uppercase tracking-wide">
          Project Config
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowPreview(!showPreview)}
            className={`p-1.5 rounded transition-colors ${
              showPreview ? 'text-[#0e639c] bg-[#0e639c]/10' : 'text-neutral-400 hover:text-white hover:bg-white/5'
            }`}
            title="Toggle Preview"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleSave}
            disabled={isLoading}
            className="p-1.5 text-neutral-400 hover:text-white hover:bg-white/5 rounded transition-colors"
            title="Save Config"
          >
            <Save className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>



      {/* Tabs */}
      <div className="flex border-b border-white/5">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1 px-2 py-2 text-xs font-medium transition-colors ${
                isActive 
                  ? 'text-white bg-white/5 border-b border-[#0e639c]' 
                  : 'text-neutral-500 hover:text-neutral-300 hover:bg-white/5'
              }`}
            >
              <Icon className="w-3 h-3" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {showPreview ? (
          /* Preview Mode */
          <div className="h-full flex flex-col">
            <div className="px-3 py-2 border-b border-white/5 flex items-center justify-between">
              <span className="text-xs text-neutral-400 font-geist uppercase tracking-wide">
                System Prompt
              </span>
              <button
                onClick={handleCopyPrompt}
                className="text-xs text-[#0e639c] hover:text-[#1177bb] font-geist flex items-center gap-1"
              >
                {copied ? (
                  <>
                    <Check className="w-3 h-3" />
                    Copied
                  </>
                ) : (
                  'Copy'
                )}
              </button>
            </div>
            <div className="flex-1 overflow-auto p-3">
              <pre className="text-xs text-neutral-300 font-geist whitespace-pre-wrap">
                {getSystemPrompt()}
              </pre>
            </div>
          </div>
        ) : (
          /* Editor Mode */
          <div className="h-full">
            {config ? (
              <MarkdownEditor
                value={getCurrentValue()}
                onChange={handleEditorChange}
                height="100%"
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="w-4 h-4 border-2 border-[#0e639c] border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
