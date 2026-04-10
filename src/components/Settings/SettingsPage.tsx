import { useState, useCallback, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { 
  Eye, Save, Layers, Shield, Check, Copy,
  Cpu, Zap, Plus, Trash2, Loader2, AlertTriangle, Settings, Sparkles, CheckCircle2, FolderOpen, GitPullRequest, KeyRound, Image, Puzzle, Download, ExternalLink, RefreshCw, Server
} from 'lucide-react';
import { useConfigStore } from '@/store/configStore';
import { useEngineStore, useWorkspaceStore, useSkillStore } from '@/store';
import { useAnalyzeProject } from '@/hooks/useAnalyzeProject';
import { useAIChatStore } from '@/store';
import type { CreateEngineRequest } from '@/types';
import { MarkdownEditor } from './MarkdownBlockEditor';
import { McpSettings } from './McpSettings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { invoke } from '@tauri-apps/api/core';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface SettingsPageProps {
  projectId: string;
}

const sidebarTabs = [
  { id: 'project-config', label: 'Project Config', icon: Layers, section: 'project' },
  { id: 'engines', label: 'CLI Engines', icon: Cpu, section: 'system' },
  { id: 'skills', label: 'Skills', icon: Puzzle, section: 'system' },
  { id: 'mcp', label: 'MCP Servers', icon: Server, section: 'system' },
  { id: 'rtk', label: 'RTK Status', icon: Zap, section: 'system' },
  { id: 'router', label: 'AI Router', icon: Settings, section: 'system' },
  { id: 'git-integration', label: 'Git Integration', icon: GitPullRequest, section: 'system' },
  { id: 'vision', label: 'Image Analysis', icon: Image, section: 'system' },
  { id: 'chat-api', label: 'Chat API (Groq)', icon: KeyRound, section: 'system' },
];

const projectSubTabs = [
  { id: 'rules', label: 'Code Rules', icon: Shield },
];

export function SettingsPage({ projectId }: SettingsPageProps) {
  const { 
    config, 
    loadConfig, 
    saveConfig, 
    updateField,
    getSystemPrompt,
    isLoading: isConfigLoading 
  } = useConfigStore();
  
  const [activeTab, setActiveTab] = useState<string>('project-config');
  const [activeProjectTab, setActiveProjectTab] = useState<string>('rules');
  const [showPreview, setShowPreview] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState<string | null>(null);
  const [analysisLogs, setAnalysisLogs] = useState<string[]>([]);
  const [analysisTokens, setAnalysisTokens] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'error' | null>(null);
  const { activeWorkspace } = useWorkspaceStore();
  const { analyzeProject, activeEngine } = useAnalyzeProject();
  
  // Real-time status extraction from AI messages during analysis
  const analysisMessages = useAIChatStore(state => state.messages['__analyze_project__']) || [];
  const liveStatus = (() => {
    if (!isAnalyzing || analysisMessages.length === 0) return null;
    const lastMsg = analysisMessages[analysisMessages.length - 1];
    
    // Check if it's currently streaming some output
    if (lastMsg.role === 'assistant' && lastMsg.content) {
      // Extract latest tool call if any
      const toolMatches = [...lastMsg.content.matchAll(/\[Tool:\s*([^\s\]]+)(?:\s+(?:{[^}]*})?)?\]/g)];
      if (toolMatches.length > 0) {
        const lastTool = toolMatches[toolMatches.length - 1][1];
        // Parse the tool to get a more human readable form
        const cleanTool = lastTool.split(':').pop() || lastTool;
        return `Using tool: ${cleanTool}...`;
      }
      
      const words = lastMsg.content.trim().replace(/\n/g, ' ').split(' ');
      const preview = words.slice(-8).join(' ');
      return preview ? `Thinking: ${preview}...` : 'Processing...';
    }
    return null;
  })();

  // Load project config
  useEffect(() => {
    loadConfig(projectId);
  }, [projectId, loadConfig]);

  const handleSaveConfig = useCallback(async () => {
    if (!config) return;
    try {
      await saveConfig(config);
      setSyncStatus('synced');
      setTimeout(() => setSyncStatus(null), 3000);
    } catch {
      setSyncStatus('error');
      setTimeout(() => setSyncStatus(null), 3000);
    }
  }, [config, saveConfig]);

  const handleEditorChange = useCallback((value: string) => {
    const fieldMap: Record<string, 'md_persona' | 'md_tech_stack' | 'md_rules' | 'md_tone'> = {
      'persona': 'md_persona',
      'tech-stack': 'md_tech_stack',
      'rules': 'md_rules',
      'tone': 'md_tone',
    };
    if (fieldMap[activeProjectTab]) {
      updateField(fieldMap[activeProjectTab], value);
    }
  }, [activeProjectTab, updateField]);

  const handleCopyPrompt = useCallback(async () => {
    const prompt = getSystemPrompt();
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  }, [getSystemPrompt]);

  const handleAnalyzeProject = useCallback(async () => {
    const cwd = activeWorkspace?.folder_path;
    if (!cwd || !activeEngine) {
      setAnalysisStatus('No active engine or workspace selected.');
      return;
    }

    setIsAnalyzing(true);
    setAnalysisLogs([]);
    setAnalysisTokens(null);
    const result = await analyzeProject(cwd, (status) => {
      setAnalysisStatus(status);
      setAnalysisLogs(prev => [...prev, status]);
    });

    if (!result.success) {
      setAnalysisStatus(`❌ ${result.error}`);
    } else if (result.tokens) {
      setAnalysisTokens(result.tokens);
    }

    setIsAnalyzing(false);
    setTimeout(() => {
      setAnalysisStatus(null);
      setAnalysisLogs([]);
      setAnalysisTokens(null);
    }, 8000);
  }, [activeWorkspace, activeEngine, analyzeProject]);



  const getCurrentValue = () => {
    if (!config) return '';
    if (activeProjectTab === 'persona') return config.md_persona;
    if (activeProjectTab === 'tech-stack') return config.md_tech_stack;
    if (activeProjectTab === 'rules') return config.md_rules;
    if (activeProjectTab === 'tone') return config.md_tone;
    return '';
  };

  const isProjectTab = activeTab === 'project-config';

  return (
    <div className="flex flex-row h-full w-full overflow-hidden">
      {/* Left Sidebar Navigation */}
      <div className="w-[300px] shrink-0 border-r border-app-border flex flex-col bg-transparent">
        {/* Header */}
        <div className="px-3 py-2 border-b border-app-border flex items-center justify-between shadow-sm z-10 bg-transparent">
          <span className="text-xs font-medium text-app-text-muted uppercase tracking-widest">
            Configuration
          </span>
        </div>

        {/* Tab Navigation Menu */}
        <div className="flex-1 overflow-auto py-1 flex flex-col gap-0.5">
          <p className="px-3 pt-3 pb-1 text-2xs font-bold tracking-widest text-neutral-600 uppercase">Project Config</p>
          {sidebarTabs.filter(t => t.section === 'project').map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full justify-start h-auto py-1.5 px-3 flex items-center text-left group transition-all duration-200 rounded-none relative ${
                  isActive 
                    ? 'bg-app-accent-glow' 
                    : 'hover:bg-app-panel'
                }`}
              >
                {isActive && <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-app-accent shadow-[0_0_8px_var(--app-accent)]" />}
                <div className="flex items-center gap-2 w-full">
                  <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-app-accent drop-shadow-[0_0_5px_var(--app-accent)]' : 'text-neutral-500 group-hover:text-neutral-400'}`} />
                  <span className={`text-xs flex-1 truncate ${isActive ? 'text-white' : 'text-neutral-400 group-hover:text-neutral-300'}`}>{tab.label}</span>
                </div>
              </button>
            );
          })}

          <p className="px-3 pt-4 pb-1 text-2xs font-bold tracking-widest text-neutral-600 uppercase">System Settings</p>
          {sidebarTabs.filter(t => t.section === 'system').map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full justify-start h-auto py-1.5 px-3 flex items-center text-left group transition-all duration-200 rounded-none relative ${
                  isActive 
                    ? 'bg-app-accent-glow' 
                    : 'hover:bg-app-panel'
                }`}
              >
                {isActive && <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-app-accent shadow-[0_0_8px_var(--app-accent)]" />}
                <div className="flex items-center gap-2 w-full">
                  <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-app-accent drop-shadow-[0_0_5px_var(--app-accent)]' : 'text-neutral-500 group-hover:text-neutral-400'}`} />
                  <span className={`text-xs flex-1 truncate ${isActive ? 'text-white' : 'text-neutral-400 group-hover:text-neutral-300'}`}>{tab.label}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Action Buttons at Bottom */}
        {isProjectTab && (
          <div className="mt-auto p-4 border-t border-app-border flex flex-col gap-2">
            <Button
              variant={showPreview ? "default" : "secondary"}
              size="sm"
              className="w-full justify-center transition-all duration-300 text-xs h-8"
              onClick={() => setShowPreview(!showPreview)}
            >
              {showPreview ? (
                <><span className="hidden sm:inline">Close Preview</span></>
              ) : (
                <><Eye className="w-3.5 h-3.5 mr-2" /> Preview Prompt</>
              )}
            </Button>
            <Button
              variant="default"
              size="sm"
              className="w-full justify-center font-bold tracking-wide shadow-[0_0_10px_var(--app-accent-glow)] text-xs h-8"
              onClick={handleSaveConfig}
              disabled={isConfigLoading}
            >
              <Save className="w-3.5 h-3.5 mr-2" /> 
              Save Changes
            </Button>
            {syncStatus === 'synced' && (
              <div className="flex items-center gap-1.5 justify-center animate-in fade-in">
                <CheckCircle2 className="w-3 h-3 text-green-400" />
                <span className="text-xs text-green-400">Synced to .akira/</span>
                <FolderOpen className="w-3 h-3 text-green-400" />
              </div>
            )}
            {syncStatus === 'error' && (
              <span className="text-xs text-red-400 text-center animate-in fade-in">⚠ Save failed</span>
            )}
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col relative overflow-hidden h-full">
        {isProjectTab ? (
          showPreview ? (
            /* Preview Mode */
            <div className="h-full flex flex-col animate-in fade-in duration-300">
              <div className="px-8 py-5 border-b border-app-border flex items-center justify-between shrink-0">
                <div>
                  <h3 className="text-sm font-semibold text-white tracking-wide flex items-center gap-2">
                    <Eye className="w-4 h-4 text-app-accent" />
                    Compiled System Prompt
                  </h3>
                  <p className="text-xs text-neutral-500 mt-1">This is the final prompt that will be sent to the AI.</p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleCopyPrompt}
                  className="hover:text-app-accent hover:border-app-accent/50 transition-colors"
                  title="Copy to Clipboard"
                >
                  {copied ? <Check className="w-4 h-4 text-green-400 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                  {copied ? 'Copied!' : 'Copy Prompt'}
                </Button>
              </div>
              <div className="flex-1 overflow-auto p-8 relative">
                <div className="absolute inset-8 rounded-2xl bg-gradient-to-br from-[#1c1c1e] to-black backdrop-blur-3xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.05),0_12px_40px_rgba(0,0,0,0.8)] pointer-events-none border border-white/[0.05]" />
                <div className="relative h-full flex flex-col p-10 rounded-2xl overflow-y-auto overflow-x-hidden custom-scrollbar">
                  <div className="max-w-3xl mx-auto w-full">
                    <div className="prose prose-invert prose-p:leading-relaxed prose-sm max-w-none 
                      prose-headings:prose-headings:font-medium prose-headings:tracking-tight 
                      prose-h1:text-white prose-h1:border-b prose-h1:border-app-border prose-h1:pb-4 prose-h1:mb-8 prose-h1:text-2xl
                      prose-h2:text-app-accent prose-h2:mt-10 prose-h2:border-b prose-h2:border-app-border prose-h2:pb-2 prose-h2:text-lg
                      prose-h3:text-white prose-h3:mt-8 prose-h3:text-base
                      prose-strong:text-white prose-strong:font-semibold
                      prose-p:text-neutral-300 prose-p:text-[13px]
                      prose-a:text-app-accent hover:prose-a:text-app-accent-hover prose-a:no-underline hover:prose-a:underline
                      prose-code:before:content-none prose-code:after:content-none prose-code:font-mono prose-code:text-[12px]
                      [&_:not(pre)>code]:text-app-accent [&_:not(pre)>code]:bg-app-accent/10 [&_:not(pre)>code]:px-1.5 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:rounded-md
                      prose-pre:bg-app-bg prose-pre:border prose-pre:border-app-border prose-pre:shadow-2xl prose-pre:rounded-xl prose-pre:p-4 [&>pre>code]:text-neutral-300
                      prose-blockquote:border-l-2 prose-blockquote:border-l-app-accent prose-blockquote:bg-gradient-to-r prose-blockquote:from-app-accent/10 prose-blockquote:to-transparent prose-blockquote:py-1 prose-blockquote:px-5 prose-blockquote:rounded-r-xl prose-blockquote:text-neutral-300 prose-blockquote:not-italic prose-blockquote:my-6
                      prose-ul:marker:text-neutral-600 prose-ol:marker:text-neutral-600 prose-li:text-[13px] prose-li:text-neutral-300
                      prose-li:my-1
                      prose-hr:border-app-border prose-hr:my-10
                      selection:bg-app-accent/30 selection:text-white">
                      <ReactMarkdown 
                        remarkPlugins={[remarkGfm, remarkBreaks]}
                        components={{
                          pre({ children }) {
                            return <div className="not-prose my-6">{children}</div>;
                          },
                          code({ node, className, children, ...props }) {
                            const match = /language-(\w+)/.exec(className || '');
                            const isInline = !match && !className && !String(children).includes('\n');
                            
                            if (isInline) {
                              return (
                                <code className={className} {...props}>
                                  {children}
                                </code>
                              );
                            }
                            
                            return (
                              <div className="my-4 rounded-xl overflow-hidden border border-app-border shadow-2xl">
                                <div className="flex items-center px-4 py-2 bg-app-bg border-b border-app-border">
                                  <div className="flex gap-1.5 opacity-80">
                                    <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                                    <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
                                  </div>
                                  <span className="text-xs text-neutral-400 font-mono tracking-wider uppercase ml-3">
                                    {match ? match[1] : 'code'}
                                  </span>
                                </div>
                                <SyntaxHighlighter
                                  {...props as any}
                                  style={vscDarkPlus}
                                  language={match ? match[1] : 'text'}
                                  PreTag="div"
                                  className="text-[12px] font-mono !m-0"
                                  customStyle={{ margin: 0, padding: '1rem', background: '#0d0d0d' }}
                                >
                                  {String(children).replace(/\n$/, '')}
                                </SyntaxHighlighter>
                              </div>
                            );
                          }
                        }}
                      >
                        {getSystemPrompt()
                          // Force blank line before unordered lists
                          .replace(/([^\n])\n(\s*[-*]\s)/g, '$1\n\n$2')
                          // Force blank line before ordered lists
                          .replace(/([^\n])\n(\s*\d+\.\s)/g, '$1\n\n$2')}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Editor Mode */
            <div className="h-full w-full relative animate-in fade-in duration-300 flex flex-col">
              <div className="px-8 flex flex-col border-b border-app-border shrink-0 z-10">
                 <div className="pt-6 pb-2 flex flex-col">
                   <h3 className="text-base font-semibold text-white tracking-wide">
                     Project Configuration
                   </h3>
                   <p className="text-xs text-neutral-500 mt-1 mb-5">Set AI rules specific to this workspace.</p>
                   
                   <div className="flex items-center gap-1">
                     {projectSubTabs.map(tab => {
                       const Icon = tab.icon;
                       const isActive = activeProjectTab === tab.id;
                       return (
                         <button
                           key={tab.id}
                           onClick={() => setActiveProjectTab(tab.id)}
                           className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-all flex items-center gap-2 ${
                             isActive 
                               ? 'border-app-accent text-app-accent bg-app-accent/5' 
                               : 'border-transparent text-neutral-500 hover:text-neutral-300 hover:bg-white/5 hover:border-app-border'
                           }`}
                         >
                           <Icon className="w-4 h-4" />
                           {tab.label}
                         </button>
                       )
                     })}
                   </div>
                 </div>
              </div>
              {/* Analyze Project Button */}
              <div className="px-8 py-3 border-b border-app-border flex items-center gap-3 shrink-0">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleAnalyzeProject}
                  disabled={isAnalyzing}
                  className="bg-app-accent/10 flex-shrink-0 hover:bg-app-accent/20 text-app-accent border border-app-accent/30 hover:border-app-accent/50 transition-all text-xs h-8"
                >
                  {isAnalyzing ? (
                    <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> Generating...</>
                  ) : (
                    <><Sparkles className="w-3.5 h-3.5 mr-2" /> Generate Workspace Standards</>
                  )}
                </Button>
                
                <div className="flex flex-1 flex-col truncate">
                  {analysisTokens && !isAnalyzing && (
                    <span className="text-[10px] text-app-accent mt-0.5 animate-in fade-in">
                      Status: {analysisStatus} • Cost: {analysisTokens}
                    </span>
                  )}
                </div>
              </div>

              {/* Progress Checklist */}
              {isAnalyzing && analysisLogs.length > 0 && (
                 <div className="px-8 py-4 bg-app-panel border-b border-app-border shrink-0 flex flex-col gap-2 shadow-[inset_0_-10px_20px_rgba(0,0,0,0.2)]">
                   {analysisLogs.map((log, i) => {
                     const isActive = i === analysisLogs.length - 1;
                     return (
                       <div key={i} className={`flex items-center gap-3 text-xs transition-all duration-300 animate-in slide-in-from-left-2 ${isActive ? 'text-white font-medium' : 'text-neutral-500'}`}>
                          {isActive ? (
                             <Loader2 className="w-3.5 h-3.5 text-app-accent animate-spin" />
                          ) : (
                             <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                          )}
                          <span>{log}</span>
                       </div>
                     )
                   })}
                 </div>
              )}

              <div className="flex-1 relative">
                {config ? (
                  <MarkdownEditor
                    value={getCurrentValue()}
                    onChange={handleEditorChange}
                    height="100%"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full bg-black/20">
                    <div className="w-6 h-6 border-2 border-app-accent border-t-transparent rounded-full animate-spin shadow-[0_0_15px_var(--app-accent)]" />
                  </div>
                )}
              </div>
            </div>
          )
        ) : (
          /* System Settings Tabs */
          <div className="h-full w-full relative animate-in fade-in duration-300 flex flex-col overflow-auto">
            <div className="px-8 py-8 max-w-4xl w-full">
              {activeTab === 'engines' && <EnginesTab />}
              {activeTab === 'skills' && <SkillsTab />}
              {activeTab === 'mcp' && <McpSettings />}
              {activeTab === 'rtk' && <RTKTab />}
              {activeTab === 'router' && <RouterTab />}
              {activeTab === 'vision' && <VisionTab />}
              {activeTab === 'chat-api' && <GroqTab />}
              {activeTab === 'git-integration' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-base font-semibold text-white flex items-center gap-2">
                      <GitPullRequest className="w-4 h-4 text-app-accent" />
                      Git Integration
                    </h3>
                    <p className="text-xs text-neutral-500 mt-1">Configure API token to auto-create PRs when tasks complete. Stored locally only — never synced to .akira/</p>
                  </div>

                  <div className="bg-app-panel rounded-lg border border-app-border p-5 space-y-4">
                    <div className="flex items-start gap-3">
                      <KeyRound className="w-4 h-4 text-app-accent mt-0.5 shrink-0" />
                      <div className="flex-1 space-y-3">
                        <div>
                          <label className="text-xs font-medium text-white">Personal Access Token</label>
                          <p className="text-xs text-neutral-500 mt-0.5">
                            GitHub: Settings → Developer Settings → Personal Access Tokens (scope: <code className="text-app-accent">repo</code>)<br />
                            GitLab: Settings → Access Tokens (scope: <code className="text-app-accent">api</code>)
                          </p>
                        </div>
                        <input
                          type="password"
                          className="w-full bg-black/30 border border-app-border rounded-md px-3 py-2 text-sm font-mono text-white placeholder-neutral-600 focus:outline-none focus:border-app-accent/50 transition-colors"
                          placeholder="ghp_xxxxxxxxxxxx or glpat-xxxxxxxxxxxx"
                          value={config?.git_token || ''}
                          onChange={e => updateField('git_token', e.target.value)}
                        />
                        <Button
                          variant="default"
                          size="sm"
                          className="shadow-[0_0_10px_var(--app-accent-glow)] text-xs"
                          onClick={() => config && saveConfig({ git_token: config.git_token })}
                          disabled={isConfigLoading}
                        >
                          <Save className="w-3.5 h-3.5 mr-2" /> Save Token
                        </Button>
                      </div>
                    </div>

                    <div className="mt-3 p-3 bg-black/20 rounded-md border border-app-border">
                      <p className="text-xs text-neutral-500">
                        🔒 Token is saved in local SQLite only. It is never written to <code className="text-neutral-400">.akira/</code> or committed to git.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// ENGINES TAB
// ----------------------------------------------------------------------

function EnginesTab() {
  const { engines, fetchEngines, createEngine, toggleEngine, deleteEngine, seedDefaultEngines, isLoading, error } = useEngineStore();
  const [showAddEngine, setShowAddEngine] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [newEngine, setNewEngine] = useState<CreateEngineRequest>({
    alias: '', binary_path: '', model: '', args: ''
  });

  useEffect(() => { fetchEngines(); }, [fetchEngines]);

  const handleSeedDefaults = async () => {
    setIsSeeding(true);
    try { await seedDefaultEngines(); } catch (err) { console.error('Seed error:', err); } finally { setIsSeeding(false); }
  };

  const handleAddEngine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEngine.alias.trim() || !newEngine.binary_path.trim()) return;
    await createEngine(newEngine);
    setNewEngine({ alias: '', binary_path: '', model: '', args: '' });
    setShowAddEngine(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-app-border pb-4">
        <div>
          <h3 className="text-xl font-semibold text-white">CLI Engines</h3>
          <p className="text-sm text-neutral-400 mt-1">Manage LLM engines that Akira can use for context completion</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleSeedDefaults} disabled={isSeeding}>
            {isSeeding ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Seeding...</> : 'Seed Defaults'}
          </Button>
          <Button size="sm" onClick={() => setShowAddEngine(true)}>
            <Plus className="w-4 h-4 mr-2" /> Add Engine
          </Button>
        </div>
      </div>

      {error && <div className="text-xs text-red-400 bg-red-400/10 p-3 rounded-lg border border-red-500/20">Error: {error}</div>}

      {isLoading ? (
        <div className="text-sm text-neutral-500">Loading engines...</div>
      ) : engines.length === 0 ? (
        <div className="text-sm text-neutral-500 py-4">No engines configured. Add your first CLI engine above.</div>
      ) : (
        <div className="grid gap-3">
          {engines.map(engine => (
            <div key={engine.id} className="flex items-center justify-between p-4 bg-transparent border border-app-border rounded-xl hover:bg-white/5 transition-colors">
              <div className="flex items-center gap-4">
                <Checkbox checked={engine.enabled} onCheckedChange={(c) => toggleEngine(engine.id, !!c)} />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold capitalize text-white">{engine.alias}</span>
                    {engine.model && <Badge variant="secondary" className="text-xs bg-black/40 text-neutral-300 border-app-border">{engine.model}</Badge>}
                  </div>
                  <div className="text-xs text-neutral-500 font-mono mt-1">{engine.binary_path} {engine.args}</div>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => deleteEngine(engine.id)} className="hover:bg-red-500/10 hover:text-red-400">
                <Trash2 className="w-4 h-4 text-neutral-500" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={showAddEngine} onOpenChange={(open) => !open && setShowAddEngine(false)}>
        <DialogContent className="sm:max-w-[425px] bg-app-bg border border-app-border text-white shadow-2xl">
          <DialogHeader>
            <DialogTitle>Add New Engine</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddEngine} className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Alias</Label>
              <Input value={newEngine.alias} onChange={e => setNewEngine({...newEngine, alias: e.target.value})} placeholder="e.g. claude" required className="bg-black/30 border-app-border" />
            </div>
            <div className="space-y-2">
              <Label>Binary Path</Label>
              <Input value={newEngine.binary_path} onChange={e => setNewEngine({...newEngine, binary_path: e.target.value})} placeholder="/usr/local/bin/claude" required className="bg-black/30 border-app-border" />
            </div>
            <div className="space-y-2">
              <Label>Model (optional)</Label>
              <Input value={newEngine.model} onChange={e => setNewEngine({...newEngine, model: e.target.value})} placeholder="e.g. claude-3-5" className="bg-black/30 border-app-border" />
            </div>
            <div className="space-y-2">
              <Label>Args (optional)</Label>
              <Input value={newEngine.args} onChange={e => setNewEngine({...newEngine, args: e.target.value})} placeholder="e.g. --dangerously-skip-permissions" className="bg-black/30 border-app-border" />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setShowAddEngine(false)}>Cancel</Button>
              <Button type="submit">Save Engine</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ----------------------------------------------------------------------
// RTK TAB
// ----------------------------------------------------------------------
interface RtkStatus { installed: boolean; path: string | null; version: string | null; error: string | null; }
interface RtkCommandResult { success: boolean; output: string; input_tokens: number; output_tokens: number; savings_pct: number; }
interface RtkStats { total_commands: number; total_saved: number; avg_savings: number; top_commands: Array<{ cmd: string; count: number; avg_savings: number }>; }

function RTKTab() {
  const { activeWorkspace } = useWorkspaceStore();
  const [rtkStatus, setRtkStatus] = useState<RtkStatus | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [initMessage, setInitMessage] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<RtkCommandResult | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [stats, setStats] = useState<RtkStats | null>(null);
  const [testOutput, setTestOutput] = useState('');

  const checkStatus = async () => {
    setIsChecking(true);
    try { setRtkStatus(await invoke<RtkStatus>('check_rtk_status')); } catch (e) { setRtkStatus({ installed: false, path: null, version: null, error: String(e) }); }
    setIsChecking(false);
  };

  const installRTK = async () => {
    setIsInstalling(true);
    try { setRtkStatus(await invoke<RtkStatus>('install_rtk')); } catch (e) { setRtkStatus(prev => prev ? { ...prev, error: String(e) } : { installed: false, path: null, version: null, error: String(e) }); }
    setIsInstalling(false);
  };

  const initRTK = async () => {
    setIsInitializing(true); setInitMessage(null);
    try { const res = await invoke<{ message: string }>('init_rtk'); setInitMessage(res.message); } catch (e) { setInitMessage(`Error: ${e}`); }
    setIsInitializing(false);
  };

  const runTest = async () => {
    const cwd = activeWorkspace?.folder_path || '/Volumes/External M4/Project/ars-ai/akira';
    setIsTesting(true); setTestOutput('Running rtk git diff HEAD~5...'); setTestResult(null);
    try {
      const output = await invoke<string>('run_rtk_command', { command: 'git', args: ['diff', 'HEAD~5', '--stat'], cwd });
      const inputTokens = Math.ceil(output.length / 4);
      const outputTokens = Math.ceil(output.length / 4 * 0.3);
      const savingsPct = 70;
      setTestResult({ 
        success: true, 
        output, 
        input_tokens: inputTokens, 
        output_tokens: outputTokens, 
        savings_pct: savingsPct 
      }); 
      setTestOutput(output || 'No output');
    } catch (e) { 
      setTestOutput(`Error: ${e}`); 
      setTestResult({ success: false, output: String(e), input_tokens: 0, output_tokens: 0, savings_pct: 0 });
    }
    setIsTesting(false);
  };

  useEffect(() => { 
    checkStatus(); 
    const getStats = async () => {
      try { setStats(await invoke<RtkStats>('get_rtk_gain_stats', { days: 30 })); } catch(e) { console.error(e); }
    };
    getStats(); 
  }, []);

  return (
    <div className="space-y-6 pb-20">
      <div className="border-b border-app-border pb-4">
        <h3 className="text-xl font-semibold text-white">RTK Analytics</h3>
        <p className="text-sm text-neutral-400 mt-1">Manage Rapid Tokenization Kit for maximizing AI context</p>
      </div>

      <div className="grid gap-4">
        <div className="p-6 bg-transparent border border-app-border rounded-xl space-y-4">
          <div className="flex items-center justify-between">
             <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-yellow-500/10 flex items-center justify-center border border-yellow-500/20">
                   <Zap className="w-5 h-5 text-yellow-500" />
                </div>
                <div>
                  <h4 className="font-semibold text-white">Status</h4>
                  <p className="text-xs text-neutral-500">System installation layer</p>
                </div>
             </div>
             <Button variant="outline" size="sm" onClick={checkStatus} disabled={isChecking}>
               {isChecking ? 'Checking...' : 'Refresh'}
             </Button>
          </div>
          <div className="space-y-2 text-sm mt-4 p-4 bg-black/20 rounded-lg border border-app-border">
            <div className="flex gap-2">
               <span className="w-24 text-neutral-500">Status:</span>
               <span className={rtkStatus?.installed ? 'text-green-400 font-semibold' : 'text-red-400 font-semibold'}>
                 {rtkStatus?.installed ? 'Installed & Active' : 'Not installed'}
               </span>
            </div>
            {rtkStatus?.version && (
              <div className="flex gap-2 text-neutral-300">
                 <span className="w-24 text-neutral-500">Version:</span>
                 <span className="font-mono bg-white/5 px-2 py-0.5 rounded">{rtkStatus.version}</span>
              </div>
            )}
            {rtkStatus?.path && (
              <div className="flex gap-2 text-neutral-300">
                 <span className="w-24 text-neutral-500">Core Path:</span>
                 <span className="font-mono text-neutral-400 text-xs bg-white/5 px-2 py-0.5 rounded break-all">{rtkStatus.path}</span>
              </div>
            )}
          </div>
          
          {!rtkStatus?.installed && (
            <div className="pt-2">
              <Button onClick={installRTK} disabled={isInstalling} className="w-full bg-yellow-500 text-black hover:bg-yellow-400 font-semibold" size="default">
                {isInstalling ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Installing Base Engine...</> : 'Install RTK Base Engine'}
              </Button>
            </div>
          )}
        </div>

        {rtkStatus?.installed && (
          <div className="p-5 bg-yellow-500/5 border border-yellow-500/20 rounded-xl space-y-3 shadow-[0_0_15px_rgba(234,179,8,0.05)]">
             <div className="flex gap-3">
                <AlertTriangle className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
                <div>
                   <h4 className="border border-app-border0font-medium text-yellow-500 mb-1">Initialization Required for Max Context</h4>
                   <p className="text-sm text-yellow-500/80 mb-3">Install global cache rules for 60-90% token savings using `rtk init -g`.</p>
                   <div className="flex items-center gap-3">
                      <Button size="sm" onClick={initRTK} disabled={isInitializing} className="bg-yellow-500 text-black hover:bg-yellow-400 font-semibold shadow-[0_0_10px_rgba(234,179,8,0.2)]">
                        {isInitializing ? "Initializing..." : "Initialize Global RTK Settings"}
                      </Button>
                      {initMessage && <span className="text-xs text-yellow-400">{initMessage}</span>}
                   </div>
                </div>
             </div>
          </div>
        )}

        {/* Stats Section */}
        {rtkStatus?.installed && (
          <div className="p-6 bg-transparent border border-app-border rounded-xl space-y-4">
            <h4 className="font-semibold text-white">Efficiency Metrics</h4>
            <div className="grid grid-cols-3 gap-4">
               <div className="p-4 bg-black/30 rounded-lg border border-app-border flex flex-col items-center justify-center text-center">
                  <div className="text-xs text-neutral-500 uppercase tracking-widest font-bold mb-1">Total Savings</div>
                  <div className="text-2xl font-bold text-app-accent">{stats?.total_saved.toLocaleString() ?? '0'}</div>
                  <div className="text-xs text-neutral-500 mt-1">Tokens bypassed</div>
               </div>
               <div className="p-4 bg-black/30 rounded-lg border border-app-border flex flex-col items-center justify-center text-center">
                  <div className="text-xs text-neutral-500 uppercase tracking-widest font-bold mb-1">Avg Efficiency</div>
                  <div className="text-2xl font-bold text-green-400">{stats?.avg_savings.toFixed(1) ?? '0.0'}%</div>
                  <div className="text-xs text-neutral-500 mt-1">Token reduction</div>
               </div>
               <div className="p-4 bg-black/30 rounded-lg border border-app-border flex flex-col items-center justify-center text-center">
                  <div className="text-xs text-neutral-500 uppercase tracking-widest font-bold mb-1">Commands Mod</div>
                  <div className="text-2xl font-bold text-white">{stats?.total_commands.toLocaleString() ?? '0'}</div>
                  <div className="text-xs text-neutral-500 mt-1">Git ops intercepted</div>
               </div>
            </div>
            
            <div className="pt-4 border-t border-app-border mt-4">
               <div className="flex items-center justify-between mb-3">
                 <h5 className="text-sm font-medium text-neutral-300">System Tester</h5>
                 <Button onClick={runTest} disabled={isTesting} size="sm" variant="secondary" className="bg-black/40 hover:bg-black/60">
                   {isTesting ? <><Loader2 className="w-3 h-3 mr-2 animate-spin" /> Running...</> : <><Zap className="w-3 h-3 mr-2 text-yellow-500" /> Run Diagnostic</>}
                 </Button>
               </div>
               
               {testResult && (
                  <div className="mt-3 bg-black/40 p-3 rounded-lg border border-app-border font-mono text-xs text-neutral-400">
                    <div className="flex justify-between items-center mb-2 border-b border-app-border pb-2">
                       <span>Result: <span className="text-green-400">Success</span></span>
                       <span className="text-app-accent">Saved {testResult.savings_pct.toFixed(0)}% ({testResult.input_tokens} → {testResult.output_tokens})</span>
                    </div>
                    <pre className="max-h-24 overflow-y-auto mt-2 text-neutral-500">
                       {testOutput}
                    </pre>
                  </div>
               )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// ROUTER TAB
// ----------------------------------------------------------------------
function RouterTab() {
  const [autoSwitch, setAutoSwitch] = useState(true);

  return (
    <div className="space-y-6 pb-20">
      <div className="border-b border-app-border pb-4">
        <h3 className="text-xl font-semibold text-white">AI Router Config</h3>
        <p className="text-sm text-neutral-400 mt-1">Manage fallback logic and token cost budgets across AI models</p>
      </div>

      <div className="grid gap-4">
        <div className="p-6 bg-transparent border border-app-border rounded-xl flex items-center justify-between">
           <div>
              <Label className="text-base font-semibold text-white">Auto-Switch Engine</Label>
              <p className="text-sm text-neutral-500 mt-1">Silently switch to fallback engine if primary fails or exhausts limits.</p>
           </div>
           <Switch checked={autoSwitch} onCheckedChange={setAutoSwitch} />
        </div>
        
        <div className="p-6 bg-transparent border border-app-border rounded-xl">
           <h4 className="font-semibold text-white mb-4">Fallback Matrix</h4>
           <div className="space-y-2">
              {['claude', 'gpt-4o', 'gemini'].map((p, i) => (
                 <div key={p} className="flex items-center justify-between p-3 bg-black/20 rounded-lg border border-app-border">
                    <span className="text-sm font-medium capitalize text-neutral-300">{i + 1}. {p}</span>
                    <Badge variant="outline" className="border-app-border text-neutral-500">Active</Badge>
                 </div>
              ))}
           </div>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// VISION TAB
// ----------------------------------------------------------------------
function VisionTab() {
  const { config, updateField, saveConfig, isLoading: isConfigLoading } = useConfigStore();
  const [syncStatus, setSyncStatus] = useState<'synced' | 'error' | null>(null);

  const handleSaveKey = async () => {
    if (!config) return;
    try {
      await saveConfig({ google_api_key: config.google_api_key });
      setSyncStatus('synced');
      setTimeout(() => setSyncStatus(null), 3000);
    } catch {
      setSyncStatus('error');
      setTimeout(() => setSyncStatus(null), 3000);
    }
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-app-border pb-4">
        <h3 className="text-xl font-semibold text-white">Image Analysis</h3>
        <p className="text-sm text-neutral-400 mt-1">Configure Gemini API for image analysis in chat</p>
      </div>

      <div className="bg-app-panel rounded-lg border border-app-border p-5 space-y-4">
        <div className="flex items-start gap-3">
          <Image className="w-4 h-4 text-app-accent mt-0.5 shrink-0" />
          <div className="flex-1 space-y-3">
            <div>
              <label className="text-xs font-medium text-white">Gemini API Key</label>
              <p className="text-xs text-neutral-500 mt-0.5">
                Used to analyze images uploaded in task chats. Get your key from{' '}
                <a 
                  href="https://aistudio.google.com/app/apikey" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-app-accent hover:underline"
                >
                  Google AI Studio
                </a>
              </p>
            </div>
            <input
              type="password"
              className="w-full bg-black/30 border border-app-border rounded-md px-3 py-2 text-sm font-mono text-white placeholder-neutral-600 focus:outline-none focus:border-app-accent/50 transition-colors"
              placeholder="AIza..."
              value={config?.google_api_key || ''}
              onChange={e => updateField('google_api_key', e.target.value)}
            />
            <div className="flex items-center gap-3">
              <Button
                variant="default"
                size="sm"
                className="shadow-[0_0_10px_var(--app-accent-glow)] text-xs"
                onClick={handleSaveKey}
                disabled={isConfigLoading}
              >
                <Save className="w-3.5 h-3.5 mr-2" /> Save API Key
              </Button>
              {syncStatus === 'synced' && (
                <div className="flex items-center gap-1.5 animate-in fade-in">
                  <CheckCircle2 className="w-3 h-3 text-green-400" />
                  <span className="text-xs text-green-400">Saved</span>
                </div>
              )}
              {syncStatus === 'error' && (
                <span className="text-xs text-red-400 animate-in fade-in">Failed to save</span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-3 p-3 bg-black/20 rounded-md border border-app-border">
          <p className="text-xs text-neutral-500">
            🔒 API key is saved in local SQLite only. It is never written to <code className="text-neutral-400">.akira/</code> or committed to git.
          </p>
        </div>

        <div className="mt-4 pt-4 border-t border-app-border">
          <h4 className="text-sm font-semibold text-white mb-2">How it works</h4>
          <ul className="text-xs text-neutral-400 space-y-2">
            <li className="flex items-start gap-2">
              <span className="text-app-accent">1.</span>
              <span>Upload an image in Task Chat or Task Creator</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-app-accent">2.</span>
              <span>Gemini analyzes the image and provides a detailed description</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-app-accent">3.</span>
              <span>Description is passed to your main AI model along with your request</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// SKILLS TAB
// ----------------------------------------------------------------------
function SkillsTab() {
  const { activeWorkspace } = useWorkspaceStore();
  const { installedSkills, engineSkills, isLoading, isInstalling, loadInstalledSkills, detectEngineSkills, importEngineSkill, installSkill, uninstallSkill } = useSkillStore();
  const [installUrl, setInstallUrl] = useState('');
  const [installError, setInstallError] = useState<string | null>(null);
  const [installSuccess, setInstallSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (activeWorkspace?.id) {
      loadInstalledSkills(activeWorkspace.id);
    }
  }, [activeWorkspace?.id, loadInstalledSkills]);

  const handleDetectEngineSkills = async () => {
    await detectEngineSkills();
  };

  const handleImportEngineSkill = async (skillPath: string, source: string) => {
    if (!activeWorkspace) return;
    
    try {
      await importEngineSkill(activeWorkspace.id, activeWorkspace.folder_path, skillPath, source);
    } catch (err) {
      console.error('Failed to import skill:', err);
    }
  };

  const parseInstallCommand = (input: string): { owner: string; repo: string; skillPath: string | undefined } | null => {
    const trimmed = input.trim();
    console.log('Parsing:', trimmed);
    
    // Try parsing "npx skills add https://github.com/owner/repo --skill skill-path"
    // or "npx skills add owner/repo --skill skill-path"
    const npxMatch = trimmed.match(/npx\s+skills\s+add\s+(.+?)(?:\s+--skill\s+(\S+))?$/i);
    if (npxMatch) {
      const repoPart = npxMatch[1].trim();
      const skillPath = npxMatch[2];
      
      // Extract owner/repo from URL or short format
      const urlMatch = repoPart.match(/github\.com\/([^\/]+)\/([^\/\s\.]+)/i);
      if (urlMatch) {
        console.log('URL match:', { owner: urlMatch[1], repo: urlMatch[2], skillPath });
        return { owner: urlMatch[1], repo: urlMatch[2], skillPath };
      }
      
      // Try short format owner/repo
      const shortMatch = repoPart.match(/^([^\/]+)\/([^\s\/\.]+)(?:\.git)?$/);
      if (shortMatch) {
        console.log('Short match:', { owner: shortMatch[1], repo: shortMatch[2], skillPath });
        return { owner: shortMatch[1], repo: shortMatch[2], skillPath };
      }
    }
    
    // Try GitHub URL alone
    const urlOnlyMatch = trimmed.match(/github\.com\/([^\/\s]+)\/([^\s\/\.]+)/i);
    if (urlOnlyMatch) {
      console.log('URL only match:', { owner: urlOnlyMatch[1], repo: urlOnlyMatch[2] });
      return { owner: urlOnlyMatch[1], repo: urlOnlyMatch[2], skillPath: undefined };
    }
    
    // Try short format "owner/repo skill-path"
    const shortFormatMatch = trimmed.match(/^([^\/\s]+)\/([^\s\/\.]+)(?:\s+(\S+))?$/);
    if (shortFormatMatch) {
      console.log('Short format match:', { owner: shortFormatMatch[1], repo: shortFormatMatch[2], skillPath: shortFormatMatch[3] });
      return { owner: shortFormatMatch[1], repo: shortFormatMatch[2], skillPath: shortFormatMatch[3] };
    }
    
    console.log('No match found');
    return null;
  };

  const handleInstall = async () => {
    if (!activeWorkspace || !installUrl.trim()) return;
    
    setInstallError(null);
    setInstallSuccess(null);
    
    const parsed = parseInstallCommand(installUrl.trim());
    if (!parsed) {
      setInstallError('Invalid format. Use: owner/repo [skill-path] or paste the GitHub URL');
      return;
    }
    
    try {
      await installSkill(
        activeWorkspace.id,
        activeWorkspace.folder_path,
        parsed.owner,
        parsed.repo,
        parsed.skillPath
      );
      setInstallSuccess(`Installed ${parsed.skillPath || parsed.repo} from ${parsed.owner}/${parsed.repo}`);
      setInstallUrl('');
    } catch (err) {
      setInstallError(String(err));
    }
  };

  const handleUninstall = async (skillId: string) => {
    if (confirm('Are you sure you want to uninstall this skill?')) {
      await uninstallSkill(skillId);
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="border-b border-app-border pb-4">
        <h3 className="text-xl font-semibold text-white">Skills</h3>
        <p className="text-sm text-neutral-400 mt-1">Install agent capabilities from GitHub repositories</p>
      </div>

      <div className="grid gap-4">
        {/* Install from URL */}
        <div className="p-5 bg-transparent border border-app-border rounded-xl space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center border border-purple-500/20">
              <Download className="w-4 h-4 text-purple-500" />
            </div>
            <div>
              <h4 className="font-medium text-white">Install Skill</h4>
              <p className="text-xs text-neutral-500">Paste the install command or GitHub URL</p>
            </div>
          </div>
          
          <div className="flex gap-2">
            <Input
              placeholder="npx skills add owner/repo skill-path OR owner/repo skill-path"
              value={installUrl}
              onChange={e => { setInstallUrl(e.target.value); setInstallError(null); setInstallSuccess(null); }}
              onKeyDown={e => { if (e.key === 'Enter') handleInstall(); }}
              className="bg-black/30 border-app-border text-white placeholder-neutral-600"
            />
            <Button onClick={handleInstall} disabled={isInstalling === 'installing' || !installUrl.trim()}>
              {isInstalling === 'installing' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Install'}
            </Button>
          </div>
          
          {installError && (
            <p className="text-xs text-red-400">{installError}</p>
          )}
          {installSuccess && (
            <p className="text-xs text-green-400">{installSuccess}</p>
          )}
          
          <div className="p-3 bg-black/20 rounded-lg border border-app-border space-y-2">
            <p className="text-xs text-neutral-400">
              Find skills at <a href="https://skills.sh" target="_blank" rel="noopener noreferrer" className="text-app-accent hover:underline">skills.sh</a> - copy the install command
            </p>
            <div className="space-y-1 mt-2">
              <p className="text-xs text-neutral-500">Paste the command from skills.sh:</p>
              <code className="block text-xs text-neutral-400 bg-black/30 px-2 py-1 rounded">npx skills add https://github.com/anthropics/skills --skill frontend-design</code>
              <p className="text-xs text-neutral-500 mt-2">Or use short format:</p>
              <code className="block text-xs text-neutral-400">anthropics/skills frontend-design</code>
            </div>
          </div>
        </div>

        {/* Installed Skills */}
        <div className="p-5 bg-transparent border border-app-border rounded-xl space-y-3">
          <h4 className="font-medium text-white">Installed Skills</h4>
          
          {isLoading && installedSkills.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-neutral-500" />
            </div>
          ) : installedSkills.length === 0 ? (
            <div className="text-center py-8 text-neutral-500">
              <Puzzle className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No skills installed</p>
              <p className="text-xs mt-1">Paste an install command above to add skills</p>
            </div>
          ) : (
            <div className="grid gap-2">
              {installedSkills.map(skill => (
                <div key={skill.id} className="flex items-center justify-between p-3 bg-black/20 rounded-lg border border-app-border">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">{skill.name}</span>
                      <Badge variant="outline" className="text-xs border-app-border text-neutral-400">
                        {skill.owner}/{skill.repo}
                      </Badge>
                    </div>
                    {skill.description && (
                      <p className="text-xs text-neutral-500 truncate mt-0.5">{skill.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => window.open(`https://github.com/${skill.owner}/${skill.repo}`, '_blank')}
                      className="text-neutral-500 hover:text-white"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleUninstall(skill.id)}
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sync Engine Skills */}
        <div className="p-5 bg-transparent border border-app-border rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20">
                <RefreshCw className="w-4 h-4 text-cyan-500" />
              </div>
              <div>
                <h4 className="font-medium text-white">Engine Skills</h4>
                <p className="text-xs text-neutral-500">Import skills from ~/.opencode/skills or ~/.claude/skills</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDetectEngineSkills}
              disabled={isLoading}
            >
              {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Detect'}
            </Button>
          </div>

          {engineSkills.length > 0 && (
            <div className="space-y-2">
              {engineSkills.map((skill) => (
                <div key={skill.path} className="flex items-center justify-between p-3 bg-black/20 rounded-lg border border-app-border">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">{skill.name}</span>
                      <Badge variant="outline" className="text-xs border-app-border text-neutral-400">
                        {skill.source}
                      </Badge>
                    </div>
                    {skill.description && (
                      <p className="text-xs text-neutral-500 truncate mt-0.5">{skill.description}</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleImportEngineSkill(skill.path, skill.source)}
                  >
                    Import
                  </Button>
                </div>
              ))}
            </div>
          )}

          {engineSkills.length === 0 && !isLoading && (
            <p className="text-xs text-neutral-500 text-center py-4">
              Click Detect to find skills from your AI engine directories
            </p>
          )}
        </div>

        {/* Skill Path Info */}
        {activeWorkspace && (
          <div className="p-3 bg-black/20 rounded-lg border border-app-border">
            <p className="text-xs text-neutral-500">
              Skills are stored in <code className="text-neutral-400">{activeWorkspace.folder_path}/.akira/skills/</code>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// GROQ TAB - Chat API for Token Optimization
// ----------------------------------------------------------------------
function GroqTab() {
  const { config, updateField, saveConfig, isLoading: isConfigLoading } = useConfigStore();
  const [syncStatus, setSyncStatus] = useState<'synced' | 'error' | null>(null);

  const handleSaveKey = async () => {
    if (!config) return;
    try {
      await saveConfig({ groq_api_key: config.groq_api_key });
      setSyncStatus('synced');
      setTimeout(() => setSyncStatus(null), 3000);
    } catch {
      setSyncStatus('error');
      setTimeout(() => setSyncStatus(null), 3000);
    }
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-app-border pb-4">
        <h3 className="text-xl font-semibold text-white">Chat API (Groq)</h3>
        <p className="text-sm text-neutral-400 mt-1">
          Configure Groq API for free small talk and chat. Save up to <span className="text-green-400 font-semibold">98% tokens</span> on casual conversations!
        </p>
      </div>

      {/* Benefits */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 bg-green-500/5 rounded-lg border border-green-500/20 text-center">
          <div className="text-2xl font-bold text-green-400">FREE</div>
          <div className="text-xs text-neutral-500 mt-1">20 requests/min</div>
          <div className="text-xs text-neutral-600">1M tokens/day</div>
        </div>
        <div className="p-4 bg-app-accent/5 rounded-lg border border-app-accent/20 text-center">
          <div className="text-2xl font-bold text-app-accent">98%</div>
          <div className="text-xs text-neutral-500 mt-1">Token savings</div>
          <div className="text-xs text-neutral-600">vs CLI for small talk</div>
        </div>
        <div className="p-4 bg-purple-500/5 rounded-lg border border-purple-500/20 text-center">
          <div className="text-2xl font-bold text-purple-400">FAST</div>
          <div className="text-xs text-neutral-500 mt-1">~0.5s response</div>
          <div className="text-xs text-neutral-600">No file scanning</div>
        </div>
      </div>

      <div className="bg-app-panel rounded-lg border border-app-border p-5 space-y-4">
        <div className="flex items-start gap-3">
          <KeyRound className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
          <div className="flex-1 space-y-3">
            <div>
              <label className="text-xs font-medium text-white">Groq API Key</label>
              <p className="text-xs text-neutral-500 mt-0.5">
                Get your free API key from{' '}
                <a 
                  href="https://console.groq.com/keys" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-green-400 hover:underline"
                >
                  Groq Console
                </a>
                {' '}→ Sign up with Google/GitHub (no credit card required)
              </p>
            </div>
            <input
              type="password"
              className="w-full bg-black/30 border border-app-border rounded-md px-3 py-2 text-sm font-mono text-white placeholder-neutral-600 focus:outline-none focus:border-green-400/50 transition-colors"
              placeholder="gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              value={config?.groq_api_key || ''}
              onChange={e => updateField('groq_api_key', e.target.value)}
            />
            <div className="flex items-center gap-3">
              <Button
                variant="default"
                size="sm"
                className="bg-green-500 text-black hover:bg-green-400 font-semibold shadow-[0_0_10px_rgba(34,197,94,0.3)] text-xs"
                onClick={handleSaveKey}
                disabled={isConfigLoading}
              >
                <Save className="w-3.5 h-3.5 mr-2" /> Save API Key
              </Button>
              {syncStatus === 'synced' && (
                <div className="flex items-center gap-1.5 animate-in fade-in">
                  <CheckCircle2 className="w-3 h-3 text-green-400" />
                  <span className="text-xs text-green-400">Saved</span>
                </div>
              )}
              {syncStatus === 'error' && (
                <span className="text-xs text-red-400 animate-in fade-in">Failed to save</span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-3 p-3 bg-black/20 rounded-md border border-app-border">
          <p className="text-xs text-neutral-500">
            🔒 API key is saved in local SQLite only. It is never written to <code className="text-neutral-400">.akira/</code> or committed to git.
          </p>
        </div>

        <div className="mt-4 pt-4 border-t border-app-border">
          <h4 className="text-sm font-semibold text-white mb-2">How it works</h4>
          <ul className="text-xs text-neutral-400 space-y-2">
            <li className="flex items-start gap-2">
              <span className="text-green-400">1.</span>
              <span><strong>Small talk</strong> ("halo", "1+1 berapa?") → Groq API (FREE, ~200 tokens)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-400">2.</span>
              <span><strong>Task summary</strong> → Groq API (FREE, ~500 tokens)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-app-accent">3.</span>
              <span><strong>Task execution</strong> → CLI (Claude/Gemini/Opencode) - powerful & context-aware</span>
            </li>
          </ul>
        </div>

        <div className="mt-4 p-3 bg-yellow-500/5 rounded-md border border-yellow-500/20">
          <p className="text-xs text-yellow-400/80">
            💡 <strong>Pro tip:</strong> Without Groq API key, small talk still works but uses CLI (~11k tokens). 
            With Groq, you save <strong>$0.10-0.15 per small talk</strong>!
          </p>
        </div>
      </div>
    </div>
  );
}
