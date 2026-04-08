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
  injectToolsIntoPrompt,
} from './aiIntegration';

export type {
  ToolCallInfo,
  ToolResultInfo,
  ToolCallingOptions,
  ToolSchema,
} from './aiIntegration';

// Adapters
export {
  createSkillTools,
  registerSkillTools,
  unregisterSkillTools,
} from './adapters';

export type { SkillToolContext } from './adapters';
