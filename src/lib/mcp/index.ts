/**
 * MCP (Model Context Protocol) Library
 * 
 * Export all MCP-related types and functions
 */

// Types
export * from './types';

// Client
export * from './client';

// Hooks
export { useMcpTools } from './hooks';

// Tool Registry
export {
  useToolRegistry,
  namespacedToolName,
  parseToolName,
  getToolDisplayName,
  categorizeTools,
  getAllTools,
  getTool,
  getExternalTools,
  getConnectedServerTools,
} from './registry';

// Tool Router
export {
  ToolRouter,
  executeTool,
  executeTools,
} from './router';

// AI Integration
export {
  useAvailableTools,
  getToolSchemas,
  detectToolCallFromOutput,
  extractToolCallsFromResponse,
  executeToolCalls,
  formatToolResultsForPrompt,
  formatToolResultsForDisplay,
  buildToolPromptForChat,
  shouldInjectTools,
} from './aiIntegration';

export type {
  ToolCallInfo,
  ToolResultInfo,
  ToolCallingOptions,
  ToolSchema,
} from './aiIntegration';

// Tool Injection
export {
  injectToolsIntoPrompt,
  getAvailableToolsForPrompt,
  buildToolPrompt,
  buildContextualToolPrompt,
  getToolSuggestionsForTask,
  formatToolSuggestions,
} from './injectTools';

export type { ToolPromptOptions } from './injectTools';

// Adapters
export {
  createSkillTools,
  registerSkillTools,
  unregisterSkillTools,
} from './adapters';

export type { SkillToolContext } from './adapters';

// Internal Servers
export {
  internalServerRegistry,
  initializeInternalServers,
} from './servers';

export {
  createTaskServerTools,
  registerTaskServerTools,
} from './servers/taskServer';

export {
  createProjectServerTools,
  registerProjectServerTools,
} from './servers/projectServer';

export {
  createFileServerTools,
  registerFileServerTools,
} from './servers/fileServer';

export {
  createBashServerTools,
  registerBashServerTools,
} from './servers/bashServer';
