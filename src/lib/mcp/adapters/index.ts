/**
 * MCP Adapters
 * 
 * Adapters that convert different systems (skills, tasks, projects)
 * into internal MCP tools.
 */

export {
  createSkillTools,
  registerSkillTools,
  unregisterSkillTools,
} from './skillAdapter';

export type { SkillToolContext } from './skillAdapter';