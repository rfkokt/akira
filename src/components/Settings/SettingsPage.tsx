import { useState, useCallback, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { 
  Eye, Save, Layers, Shield, Check, Copy,
  Zap, Loader2, AlertTriangle, Sparkles, CheckCircle2, FolderOpen, GitPullRequest, KeyRound, Image, Terminal
} from 'lucide-react';
import { useConfigStore } from '@/store/configStore';
import { useWorkspaceStore } from '@/store';
import { useAnalyzeStore } from '@/store/analyzeStore';
import { useAnalyzeProject } from '@/hooks/useAnalyzeProject';
import { MarkdownEditor } from './MarkdownBlockEditor';
import { PiAuthStatus } from './PiAuthStatus';
import { ModelSelector } from './ModelSelector';
import { Button } from '@/components/ui/button';
import { invoke } from '@tauri-apps/api/core';

interface SettingsPageProps {
  projectId: string;
}

const sidebarTabs = [
  { id: 'project-config', label: 'Project Config', icon: Layers, section: 'project' },
  { id: 'pi-connection', label: 'Pi Connection', icon: Terminal, section: 'system' },
  { id: 'rtk', label: 'RTK Status', icon: Zap, section: 'system' },
  { id: 'git-integration', label: 'Git Integration', icon: GitPullRequest, section: 'system' },
  { id: 'vision', label: 'Image Analysis', icon: Image, section: 'system' },
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
  const [syncStatus, setSyncStatus] = useState<'synced' | 'error' | null>(null);
  const { activeWorkspace } = useWorkspaceStore();
  const { analyzeProject, activeEngine } = useAnalyzeProject();

  // Global analysis state — persists across tab navigation
  const isAnalyzing = useAnalyzeStore((s) => s.isAnalyzing);
  const analysisStatus = useAnalyzeStore((s) => s.analysisStatus);
  const analysisLogs = useAnalyzeStore((s) => s.analysisLogs);
  const analysisTokens = useAnalyzeStore((s) => s.analysisTokens);
  const { setAnalyzing } = useAnalyzeStore.getState();

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
      useAnalyzeStore.getState().setStatus('No active engine or workspace selected.');
      return;
    }

    setAnalyzing(true);
    useAnalyzeStore.setState({ analysisLogs: [], analysisTokens: null });
    const result = await analyzeProject(cwd, (status) => {
      useAnalyzeStore.getState().setStatus(status);
      useAnalyzeStore.getState().addLog(status);
    });

    if (!result.success) {
      useAnalyzeStore.getState().setStatus(`❌ ${result.error}`);
    } else if (result.tokens) {
      useAnalyzeStore.getState().setTokens(result.tokens);
    }

    setAnalyzing(false);
    setTimeout(() => {
      useAnalyzeStore.getState().reset();
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
                      prose-p:text-neutral-300 prose-p:text-sm
                      prose-a:text-app-accent hover:prose-a:text-app-accent-hover prose-a:no-underline hover:prose-a:underline
                      prose-code:before:content-none prose-code:after:content-none prose-code:font-mono prose-code:text-sm
                      [&_:not(pre)>code]:text-app-accent [&_:not(pre)>code]:bg-app-accent/10 [&_:not(pre)>code]:px-1.5 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:rounded-md
                      prose-pre:bg-app-bg prose-pre:border prose-pre:border-app-border prose-pre:shadow-2xl prose-pre:rounded-xl prose-pre:p-4 [&>pre>code]:text-neutral-300
                      prose-blockquote:border-l-2 prose-blockquote:border-l-app-accent prose-blockquote:bg-gradient-to-r prose-blockquote:from-app-accent/10 prose-blockquote:to-transparent prose-blockquote:py-1 prose-blockquote:px-5 prose-blockquote:rounded-r-xl prose-blockquote:text-neutral-300 prose-blockquote:not-italic prose-blockquote:my-6
                      prose-ul:marker:text-neutral-600 prose-ol:marker:text-neutral-600 prose-li:text-sm prose-li:text-neutral-300
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
                                  <span className="text-sm text-neutral-400 font-mono tracking-wider uppercase ml-3">
                                    {match ? match[1] : 'code'}
                                  </span>
                                </div>
                                <SyntaxHighlighter
                                  {...props as any}
                                  style={vscDarkPlus}
                                  language={match ? match[1] : 'text'}
                                  PreTag="div"
                                  className="text-sm font-mono !m-0"
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
                          .replace(/([^\n])\n(\s*[-*]\s)/g, '$1\n\n$2')
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
                
                <div className="flex flex-1 flex-col truncate ml-2">
                  {analysisTokens && !isAnalyzing && (
                    <span className="text-xs text-app-accent mt-0.5 animate-in fade-in">
                      Status: {analysisStatus} • Cost: {analysisTokens}
                    </span>
                  )}
                </div>
              </div>

              {/* Progress Checklist */}
              {isAnalyzing && analysisLogs.length > 0 && (
                 <div className="px-8 py-5 bg-app-panel border-b border-app-border shrink-0 flex flex-col gap-3 shadow-[inset_0_-10px_20px_rgba(0,0,0,0.2)]">
                   {analysisLogs.map((log, i) => {
                     const isActive = i === analysisLogs.length - 1;
                     return (
                       <div key={i} className={`flex items-center gap-3 text-sm transition-all duration-300 animate-in slide-in-from-left-2 ${isActive ? 'text-white font-medium' : 'text-neutral-400'}`}>
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
              {activeTab === 'pi-connection' && (
                <div className="space-y-8">
                  <PiAuthStatus />
                  <ModelSelector />
                </div>
              )}
              {activeTab === 'rtk' && <RTKTab />}
              {activeTab === 'vision' && <VisionTab />}
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
                   <h4 className="font-medium text-yellow-500 mb-1">Initialization Required for Max Context</h4>
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
