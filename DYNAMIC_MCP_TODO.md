# Dynamic MCP Tools per Workspace - Implementation Plan

## 📋 Overview

Implementasi MCP tools yang dinamis - bisa "membaca" project dan generate tools sesuai:
1. **Standards/Best Practices** - Coding rules dari project
2. **Utils/Helpers** - Utility functions jadi MCP tools
3. **Hooks** - Custom hooks jadi MCP tools
4. **Skills** - Installed skills jadi MCP tools (workspace-specific)
5. **Per-Workspace** - Masing-masing workspace punya MCP tools beda

---

## 🎯 Goals

- ✅ Context-aware tools (AI tahu utils/hooks/skills project)
- ✅ Standards enforcement (otomatis ikutin aturan project)
- ✅ Skills integration (skills jadi callable tools)
- ✅ No manual setup (scan dan generate otomatis)
- ✅ Workspace-specific (masing-masing project tools beda)

---

## 📂 File Structure

```
akira/src/lib/mcp/
├── scanners/
│   ├── index.ts                 # Export all scanners
│   ├── workspaceScanner.ts      # Main scanner coordinator
│   ├── utilsScanner.ts          # Scan src/utils/
│   ├── hooksScanner.ts          # Scan src/hooks/
│   ├── skillsScanner.ts         # Parse installed skills
│   ├── standardsScanner.ts      # Parse config files
│   ├── techStackScanner.ts      # Detect tech stack
│   └── helpers/
│       ├── parseParameters.ts   # Extract params from TS AST
│       └── executeHookAction.ts  # React hooks wrapper
├── servers/
│   ├── index.ts                # Existing
│   ├── taskServer.ts           # Existing
│   ├── projectServer.ts        # Existing
│   └── workspaceServer.ts      # NEW: Dynamic workspace tools
└── injectTools.ts              # NEW: Inject tools to AI prompt
```

---

## 🚀 Implementation Phases

### **Phase 1: Infrastructure** (Critical - 2-3 jam)

#### Task 1.1: Create scanner directory structure
- [ ] Create `lib/mcp/scanners/` directory
- [ ] Create `lib/mcp/scanners/helpers/` subdirectory
- [ ] Setup TypeScript config for scanners

**Files to create:**
```
lib/mcp/scanners/.gitkeep
lib/mcp/scanners/helpers/.gitkeep
```

---

#### Task 1.2: Create WorkspaceMCPServer class
- [ ] Create `lib/mcp/servers/workspaceServer.ts`
- [ ] Implement class with methods:
  - `initialize()` - Scan and register tools
  - `getTools()` - Return all workspace tools
  - `rescan()` - Force rescan
  - `clearCache()` - Clear cached tools

**Code structure:**
```typescript
class WorkspaceMCPServer {
  private workspacePath: string
  private tools: Map<string, InternalTool>
  private scanCache?: WorkspaceTools
  
  async initialize(): Promise<void>
  getTools(): InternalTool[]
  async rescan(): Promise<void>
  clearCache(): void
}

// Singleton per workspace
const workspaceServers = new Map<string, WorkspaceMCPServer>()
```

---

#### Task 1.3: Create workspaceScanner.ts (coordinator)
- [ ] Create main scanner that coordinates all sub-scanners
- [ ] Define `WorkspaceTools` interface
- [ ] Implement scan orchestration

**Interface:**
```typescript
interface WorkspaceTools {
  defaultTools: InternalTool[]      // Task, Project tools
  skillsTools: InternalTool[]        // From installed skills
  standardsTools: InternalTool[]     // From configs
  utilsTools: InternalTool[]         // From src/utils/
  hooksTools: InternalTool[]         // From src/hooks/
  techTools: InternalTool[]          // Tech-specific
}

async function scanWorkspace(workspacePath: string, workspaceId: string): Promise<WorkspaceTools>
```

---

### **Phase 2: Scanners** (High Priority - 4-5 jam)

#### Task 2.1: Create utilsScanner.ts
- [ ] Implement `src/utils/` scanner
- [ ] Parse TypeScript files for exported functions
- [ ] Generate MCP tool for each function

**Implementation:**
```typescript
async function scanUtils(workspacePath: string): Promise<InternalTool[]>

// For each file in src/utils/:
// 1. Parse TypeScript AST
// 2. Find exported functions
// 3. Extract parameters
// 4. Generate tool

// Example output:
{
  name: "util_formatDate",
  description: "Format date using workspace utility",
  source: "internal",
  category: "utils",
  parameters: { date: "string" },
  handler: async (args) => {
    const { formatDate } = await import(file)
    return { success: true, data: formatDate(args.date) }
  }
}
```

---

#### Task 2.2: Create hooksScanner.ts
- [ ] Implement `src/hooks/` scanner
- [ ] Parse custom hooks (use*.ts)
- [ ] Handle React context limitations

**Challenges:**
- React hooks can't be called outside React context
- Need to extract callable methods from hooks

**Solution:**
```typescript
// Scan useAuth hook
export function useAuth() {
  return {
    login: (email, password) => {...},
    logout: () => {...},
    getUser: () => {...}
  }
}

// Generate separate tools for each method:
{
  name: "hook_useAuth_login",
  handler: async (args) => {
    // Special handling for React hooks
    return executeHookAction('useAuth', 'login', args)
  }
}
```

---

#### Task 2.3: Create standardsScanner.ts
- [ ] Parse `.eslintrc.json` / `.eslintrc.js`
- [ ] Parse `.prettierrc` / `.prettierrc.json`
- [ ] Parse `tsconfig.json`
- [ ] Generate validation tools

**Tools to generate:**
```typescript
// From ESLint rules
{
  name: "std_check_coding",
  description: "Check if code follows project standards",
  parameters: { code: "string" },
  handler: async (args) => {
    // Run ESLint on code snippet
    const violations = await eslint.lintText(args.code)
    return { success: violations.length === 0, violations }
  }
}

// From naming conventions
{
  name: "std_enforce_naming",
  description: "Check file naming convention",
  parameters: { filename: "string" }
}

// From project structure
{
  name: "std_suggest_location",
  description: "Suggest where to place a new file",
  parameters: { filename: "string", type: "string" }
}
```

---

#### Task 2.4: Create techStackScanner.ts
- [ ] Detect tech stack from `package.json`
- [ ] Check for Next.js, React, Tauri, etc.
- [ ] Load tech-specific skill templates
- [ ] Generate tech-specific tools

**Detection logic:**
```typescript
async function detectTechStack(workspacePath: string): Promise<TechStack> {
  const packageJson = await readJson(join(workspacePath, 'package.json'))
  const deps = { ...packageJson.dependencies, ...packageJson.devDependencies }
  
  return {
    isNextJs: 'next' in deps,
    isReact: 'react' in deps,
    isTauri: '@tauri-apps/api' in deps,
    isTypescript: fs.existsSync(join(workspacePath, 'tsconfig.json')),
    frameworks: [], // Vue, Svelte, etc
  }
}

// Generate tech-specific tools:
// - tech_nextjs_route: Get Next.js file routing info
// - tech_react_component: Analyze React component structure
// - tech_tauri_command: List available Tauri commands
```

---

#### Task 2.5: Create skillsScanner.ts
- [ ] Read workspace config for installed skills
- [ ] Parse skill content from SKILL.md files
- [ ] Convert skill functions to MCP tools
- [ ] Handle skill dependencies and resources

**Implementation:**
```typescript
async function scanSkills(workspaceId: string): Promise<InternalTool[]> {
  // 1. Get workspace from store
  const workspace = useWorkspaceStore.getState().workspaces.find(w => w.id === workspaceId)
  
  // 2. Get installed skills from config
  const config = await dbService.getWorkspaceConfig(workspaceId)
  const installedSkills = config?.skills || [] // ['frontend-design', 'tauri-v2']
  
  // 3. Load skill content
  const tools: InternalTool[] = []
  
  for (const skillId of installedSkills) {
    // Find skill in skill store
    const skill = useSkillStore.getState().installedSkills.find(s => s.id === skillId)
    
    if (!skill) continue
    
    // Load skill content (SKILL.md)
    const skillContent = await loadSkillContent(skill.skill_path)
    
    // Convert skill to tools
    const skillTools = convertSkillToTools(skill, skillContent)
    tools.push(...skillTools)
  }
  
  return tools
}

function convertSkillToTools(skill: Skill, content: SkillContent): InternalTool[] {
  const tools: InternalTool[] = []
  
  // Standard skill tools (always available)
  tools.push({
    name: `skill_${skill.id}_load`,
    description: `Load ${skill.name} skill context`,
    source: 'internal',
    category: 'skills',
    parameters: {},
    handler: async () => {
      return {
        success: true,
        data: {
          name: content.name,
          description: content.description,
          instructions: content.content
        }
      }
    }
  })
  
  tools.push({
    name: `skill_${skill.id}_get_patterns`,
    description: `Get code patterns from ${skill.name} skill`,
    source: 'internal',
    category: 'skills',
    parameters: {},
    handler: async () => {
      // Extract patterns from skill content
      const patterns = extractPatterns(content.content)
      return { success: true, data: patterns }
    }
  })
  
  tools.push({
    name: `skill_${skill.id}_get_examples`,
    description: `Get code examples from ${skill.name} skill`,
    source: 'internal',
    category: 'skills',
    parameters: { pattern_name: 'string' },
    handler: async (args) => {
      // Extract examples for specific pattern
      const examples = extractExamples(content.content, args.pattern_name)
      return { success: true, data: examples }
    }
  })
  
  // Custom tools defined in skill
  if (content.tools) {
    for (const tool of content.tools) {
      tools.push({
        name: `skill_${skill.id}_${tool.name}`,
        description: tool.description,
        source: 'internal',
        category: 'skills',
        parameters: tool.parameters,
        handler: async (args) => {
          // Execute skill-specific tool
          return await executeSkillTool(skill.id, tool.name, args)
        }
      })
    }
  }
  
  return tools
}

// Example skills and their tools:
// frontend-design skill:
// - skill_frontend_design_load
// - skill_frontend_design_get_patterns
// - skill_frontend_design_get_examples
// - skill_frontend_design_create_component (if defined)
//
// tauri-v2 skill:
// - skill_tauri_v2_load
// - skill_tauri_v2_get_patterns
// - skill_tauri_v2_invoke_command (custom tool)
```

**Config structure (workspace):**
```typescript
// In database: workspace_config table
{
  workspace_id: "workspace-123",
  skills: [
    "frontend-design",
    "tauri-v2",
    "supabase-postgres-best-practices"
  ]
}

// In UI: Settings → Workspace → Skills
// User can install/uninstall skills per workspace
```

**Skill SKILL.md format:**
```markdown
# Frontend Design Skill

## Description
Create distinctive, production-grade frontend interfaces...

## Patterns
- Component composition
- State management
- Styling patterns

## Examples
### Component Composition
```tsx
// Example code...
```

## Tools
### get_design_patterns
Description: Get design patterns for components
Parameters: {}

### create_component
Description: Create a new component
Parameters: {
  name: { type: "string" },
  type: { type: "string" }
}
```

---

### **Phase 3: Helpers** (High Priority - 2-3 jam)

#### Task 3.1: Create parseParameters helper
- [ ] Extract function parameters from TypeScript AST
- [ ] Handle different parameter types (string, number, object)
- [ ] Generate JSONSchema for parameters

**Implementation:**
```typescript
function parseParameters(node: ts.FunctionDeclaration): JSONSchema {
  const parameters: ts.ParameterDeclaration[] = node.parameters
  
  const properties: Record<string, any> = {}
  
  for (const param of parameters) {
    const name = param.name.getText()
    const type = param.type
    
    properties[name] = {
      type: mapTsTypeToJsonSchema(type),
      description: extractJsDocDescription(param)
    }
  }
  
  return {
    type: "object",
    properties,
    required: parameters.filter(p => !p.questionToken).map(p => p.name.getText())
  }
}

function mapTsTypeToJsonSchema(type: ts.TypeNode): string {
  if (type.kind === ts.SyntaxKind.StringKeyword) return "string"
  if (type.kind === ts.SyntaxKind.NumberKeyword) return "number"
  if (type.kind === ts.SyntaxKind.BooleanKeyword) return "boolean"
  // ... more mappings
  return "any"
}
```

---

#### Task 3.2: Create executeHookAction helper
- [ ] Handle React hooks in non-React context
- [ ] Extract callable methods from hooks
- [ ] Manage hook state and lifecycle

**Challenge:** Hooks can only be called inside React components

**Solution Strategy:**
```typescript
// Option 1: Mock React context
function executeHookAction(hookName: string, method: string, args: any) {
  // Create mock React context
  // Call hook
  // Extract method
  // Execute with args
}

// Option 2: Parse hook file and extract method implementations
function executeHookAction(hookName: string, method: string, args: any) {
  // Read hook file
  // Parse AST
  // Find method implementation
  // Execute as standalone function
}

// Option 3: Use hook adapter pattern
function createHookAdapter(hookPath: string) {
  // Create adapter that can be called outside React
  return {
    call: async (method: string, args: any) => {...}
  }
}
```

---

### **Phase 4: Integration** (High Priority - 2-3 jam)

#### Task 4.1: Integrate into workspaceStore.ts
- [ ] Initialize WorkspaceMCPServer on workspace change
- [ ] Clear previous workspace tools
- [ ] Register new workspace tools

**Code location:** `store/workspaceStore.ts`

```typescript
async function setActiveWorkspace(workspace: Workspace) {
  // ... existing code
  
  // Initialize dynamic MCP for this workspace
  const mcpServer = getWorkspaceServer(workspace.id)
  await mcpServer.initialize()
  
  console.log(`[MCP] Loaded ${mcpServer.getTools().length} tools for ${workspace.name}`)
}
```

---

#### Task 4.2: Update registry.ts
- [ ] Add support for dynamic tool registration
- [ ] Namespace tools by workspace
- [ ] Handle tool collisions

```typescript
// In useToolRegistry
registerWorkspaceTools: (workspaceId: string, tools: InternalTool[]) => {
  // Clear old workspace tools
  self.clearWorkspaceTools(workspaceId)
  
  // Register new tools with namespace
  tools.forEach(tool => {
    const namespacedTool = {
      ...tool,
      name: `${tool.name}_${workspaceId}`,
      workspaceId: workspaceId
    }
    self.registerInternalTool(namespacedTool)
  })
}

clearWorkspaceTools: (workspaceId: string) => {
  // Remove all tools for this workspace
}
```

---

#### Task 4.3: Add workspace tool caching
- [ ] Cache scan results per workspace
- [ ] Implement cache invalidation
- [ ] Add manual rescan option

```typescript
interface ScanCache {
  workspaceId: string
  timestamp: number
  tools: InternalTool[]
  hash: string  // Hash of files to detect changes
}

class WorkspaceMCPServer {
  private scanCache: Map<string, ScanCache> = new Map()
  
  async initialize() {
    // Check cache
    const cached = this.scanCache.get(workspaceId)
    if (cached && !this.needsRescan()) {
      return cached.tools
    }
    
    // Scan
    const tools = await this.scan()
    
    // Cache
    this.scanCache.set(workspaceId, {
      workspaceId,
      timestamp: Date.now(),
      tools,
      hash: this.computeHash()
    })
  }
  
  needsRescan(): boolean {
    // Check if files changed
    // Check timestamp
    // Check hash
  }
}
```

---

### **Phase 5: UI** (Medium Priority - 2-3 jam)

#### Task 5.1: Create McpToolsList.tsx
- [ ] Display all available workspace tools
- [ ] Group by category (utils, hooks, standards, tech)
- [ ] Show tool parameters and descriptions

**Component:**
```tsx
function McpToolsList() {
  const { activeWorkspace } = useWorkspaceStore()
  const { tools } = useToolRegistry()
  
  const workspaceTools = tools.filter(t => 
    t.source === 'internal' && 
    t.workspaceId === activeWorkspace?.id
  )
  
  const grouped = groupBy(workspaceTools, 'category')
  
  return (
    <div>
      <h3>Utils Tools ({grouped.utils?.length || 0})</h3>
      {grouped.utils?.map(tool => <ToolCard tool={tool} />)}
      
      <h3>Hooks Tools ({grouped.hooks?.length || 0})</h3>
      {grouped.hooks?.map(tool => <ToolCard tool={tool} />)}
      
      <h3>Standards Tools ({grouped.standards?.length || 0})</h3>
      {grouped.standards?.map(tool => <ToolCard tool={tool} />)}
    </div>
  )
}
```

---

#### Task 5.2: Add rescan button in Settings
- [ ] Add "Rescan Workspace Tools" button
- [ ] Show rescan progress
- [ ] Display new tools found

**Location:** `components/Settings/McpSettings.tsx`

```tsx
<Button onClick={handleRescan} disabled={isScanning}>
  {isScanning ? <Loader2 className="animate-spin" /> : <RefreshCw />}
  {isScanning ? 'Scanning...' : 'Rescan Workspace Tools'}
</Button>
```

---

#### Task 5.3: Show tool count badge
- [ ] Display tool count in MCP Settings tab
- [ ] Show breakdown by category
- [ ] Update count on workspace change

```tsx
<Badge>
  {workspaceTools.length} tools available
</Badge>
<Badge variant="secondary">
  Skills: {skillsCount} | Utils: {utilsCount} | Hooks: {hooksCount} | Standards: {standardsCount}
</Badge>
```

---

### **Phase 6: Enhancement** (Low Priority - 2-3 jam)

#### Task 6.1: Create injectTools.ts
- [ ] Dynamically inject tools into AI prompt
- [ ] Format tools as readable text
- [ ] Include only relevant tools

```typescript
function buildToolsPrompt(tools: InternalTool[], context: string): string {
  const relevantTools = filterRelevantTools(tools, context)
  
  return `
[AVAILABLE WORKSPACE TOOLS]
You have access to these workspace-specific tools:

${relevantTools.map(t => `- ${t.name}: ${t.description}`).join('\n')}

To use a tool, mention it in your response: [Tool: tool_name]
[/AVAILABLE WORKSPACE TOOLS]
`
}
```

---

#### Task 6.2: Add tool suggestions in TaskCreatorChat
- [ ] Analyze task description
- [ ] Suggest relevant tools
- [ ] Show tool usage examples

```tsx
function TaskCreatorChat() {
  const suggestedTools = useMemo(() => {
    const keywords = extractKeywords(taskDescription)
    return tools.filter(t => isRelevant(t, keywords))
  }, [taskDescription])
  
  return (
    <>
      {/* Existing task creator UI */}
      
      {suggestedTools.length > 0 && (
        <div className="suggested-tools">
          <p>Relevant tools: {suggestedTools.map(t => t.name).join(', ')}</p>
        </div>
      )}
    </>
  )
}
```

---

#### Task 6.3: Create tool usage analytics
- [ ] Track tool calls
- [ ] Count usage per tool
- [ ] Show most used tools

**Analytics schema:**
```typescript
interface ToolUsage {
  toolName: string
  callCount: number
  lastUsed: number
  averageDuration: number
  successRate: number
}

// Store in database
await dbService.trackToolCall({
  toolName: 'util_formatDate',
  duration: 45,
  success: true
})

// Display in UI
<TooltipAnalytics>
  Most used: util_formatDate (234 calls)
  Success rate: 99.2%
</TooltipAnalytics>
```

---

## 🧪 Testing Strategy

### Unit Tests
```typescript
// scanners/utilsScanner.test.ts
describe('scanUtils', () => {
  it('should parse exported functions from utils', async () => {
    const tools = await scanUtils('/path/to/workspace')
    expect(tools).toContainEqual(
      expect.objectContaining({ name: 'util_formatDate' })
    )
  })
})

// scanners/standardsScanner.test.ts
describe('parseStandards', () => {
  it('should parse eslint config', async () => {
    const tools = await parseStandards('/path/to/workspace')
    expect(tools).toContainEqual(
      expect.objectContaining({ name: 'std_check_coding' })
    )
  })
})
```

### Integration Tests
```typescript
describe('WorkspaceMCPServer', () => {
  it('should scan and register workspace tools', async () => {
    const server = new WorkspaceMCPServer(workspacePath)
    await server.initialize()
    const tools = server.getTools()
    
    expect(tools.length).toBeGreaterThan(0)
    expect(tools).toContainEqual(expect.objectContaining({ 
      category: 'utils' 
    }))
  })
})
```

---

## 📊 Tool Naming Convention

### Format
```
{category}_{subcategory}_{action}
```

### Examples

**Default tools (static):**
```
task_list
task_create
project_get_info
```

**Skills tools (generated from installed skills):**
```
skill_frontend_design_load              // Load skill context
skill_frontend_design_get_patterns      // Get design patterns
skill_frontend_design_get_examples      // Get code examples
skill_tauri_v2_load                      // Load Tauri skill
skill_tauri_v2_invoke_command            // Custom Tauri tool
skill_supabase_postgres_optimize        // Custom Supabase tool
```

**Utils tools (generated from src/utils/):**
```
util_formatDate            // utils/date.ts::formatDate
util_validateEmail        // utils/validation.ts::validateEmail
util_parseConfig          // utils/config.ts::parseConfig
util_generateId           // utils/id.ts::generateId
```

**Hooks tools (generated from src/hooks/):**
```
hook_useAuth_login        // useAuth hook - login method
hook_useAuth_logout       // useAuth hook - logout method
hook_useApi_fetch         // useApi hook - fetch method
hook_useTheme_toggle      // useTheme hook - toggle method
```

**Standards tools (generated from configs):**
```
std_check_coding          // From ESLint rules
std_enforce_naming        // From naming conventions
std_suggest_location      // From project structure
std_format_code           // From Prettier config
```

**Tech-specific tools (generated based on stack):**
```
tech_nextjs_route         // Next.js routing info
tech_react_component      // React component analyzer
tech_tauri_command        // Tauri IPC commands
```

---

## ⚡ Performance Considerations

### Caching Strategy
- Cache scan results with file hash
- Only rescan on file changes
- Cache invalidation after 1 hour

### Lazy Loading
- Don't scan on app startup
- Scan on first workspace activation
- Background scan for non-active workspaces

### Optimization
- Use incremental scanning
- Parallel file processing
- Debounce rapid workspace switches

---

## 🔧 Configuration

### Scanner Config
```typescript
interface ScannerConfig {
  maxFileSize: number         // Max file size to scan (default: 100KB)
  excludePatterns: string[]   // Files/patterns to exclude
  includePatterns: string[]   // Files/patterns to include
  cacheTimeout: number        // Cache duration in ms
  enableHooks: boolean       // Scan hooks (default: true)
  enableUtils: boolean       // Scan utils (default: true)
  enableStandards: boolean   // Scan standards (default: true)
}

const defaultConfig: ScannerConfig = {
  maxFileSize: 100 * 1024,
  excludePatterns: ['**/node_modules/**', '**/dist/**'],
  includePatterns: ['**/*.ts', '**/*.tsx'],
  cacheTimeout: 60 * 60 * 1000, // 1 hour
  enableHooks: true,
  enableUtils: true,
  enableStandards: true,
}
```

---

## 📈 Metrics to Track

1. **Scan Performance**
   - Time to scan workspace
   - Number of files scanned
   - Number of tools generated

2. **Tool Usage**
   - Most called tools
   - Success rate per tool
   - Average execution time

3. **Cache Efficiency**
   - Cache hit rate
   - Rescan frequency
   - Memory usage

---

## 🚦 Rollout Plan

### Week 1: Foundation
- Phase 1: Infrastructure ✅
- Phase 2: Scanners ✅

### Week 2: Core Features
- Phase 3: Helpers ✅
- Phase 4: Integration ✅

### Week 3: Polish
- Phase 5: UI ✅
- Phase 6: Enhancement ✅

---

## ✅ Success Criteria

- [ ] Utils from `src/utils/` automatically become MCP tools
- [ ] Custom hooks from `src/hooks/` become callable tools
- [ ] **Installed skills become MCP tools with load/get_patterns/get_examples**
- [ ] **Each workspace can have different skills installed**
- [ ] **Skills are converted to tools dynamically on workspace activation**
- [ ] ESLint/Prettier configs generate validation tools
- [ ] Tech stack detection generates relevant tools
- [ ] Tools change when switching workspaces
- [ ] No performance degradation (scan < 2s)
- [ ] 90%+ success rate on tool execution
- [ ] AI can successfully use workspace-specific tools

---

## 🐛 Known Challenges

1. **React Hooks Context**
   - Hooks can't be called outside React
   - Need special adapter/wrapper
   - May require mock React context

2. **Dynamic Imports**
   - Need to dynamically import utils
   - Handle different module systems
   - Cache imported modules

3. **TypeScript Parsing**
   - Complex TypeScript AST
   - Handle various parameter types
   - Extract JSDoc comments

4. **File Watching**
   - Detect file changes
   - Invalidate cache appropriately
   - Handle race conditions

5. **Skills Integration**
   - Skills may have dependencies on other skills
   - Skill content format varies
   - Need to extract tools from SKILL.md
   - Custom tools defined in skills
   - Skill installation/uninstallation dynamic

---

## 📚 References

- [MCP Specification](https://modelcontextprotocol.io)
- [TypeScript Compiler API](https://github.com/Microsoft/TypeScript/wiki/Using-the-Compiler-API)
- [ESLint Node.js API](https://eslint.org/docs/latest/developer-guide/nodejs-api)
- [React Hooks Rules](https://react.dev/warnings/invalid-hook-call-warning)
- [Akira Skills System](./.agents/skills/README.md) - How skills work in Akira

---

## 🎯 Quick Start Checklist

Before starting implementation, ensure:
- [ ] MCP infrastructure already implemented (Phase1-4 of MCP_TODO.md)
- [ ] Tool registry functional
- [ ] Tool router working
- [ ] AI integration tested
- [ ] At least one workspace to test with
- [ ] Skills system functional (install/uninstall skills)
- [ ] Workspace config can store installed skills

---

## 📊 Summary

**Total Tasks:** 19 tasks across 6 phases  
**Estimated Time:** 14-20 jam  
**Complexity:** Medium-High  
**Dependencies:** MCP infrastructure, Skills system  

**Key Features:**
1. ✅ Dynamic tools from project utils/hooks
2. ✅ Skills become callable MCP tools
3. ✅ Standards enforcement from configs
4. ✅ Tech-specific tools
5. ✅ Per-workspace tool namespaces
6. ✅ Automatic scanning on workspace change
7. ✅ Tool usage analytics

**Impact:**
- AI can use project-specific utils and hooks
- Skills are properly integrated as tools
- Coding standards enforced automatically
- Tech stack aware suggestions

---

Last updated: 2026-04-08  
Status: Planning Complete - Ready for Implementation