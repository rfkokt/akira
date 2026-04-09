/**
 * Scanner Types
 * 
 * Type definitions for workspace scanners
 */

import type { InternalTool } from '../types'

export interface WorkspaceTools {
  defaultTools: InternalTool[]
  skillsTools: InternalTool[]
  standardsTools: InternalTool[]
  utilsTools: InternalTool[]
  hooksTools: InternalTool[]
  techTools: InternalTool[]
}

export interface ScanResult {
  workspaceId: string
  workspacePath: string
  tools: WorkspaceTools
  timestamp: number
  hash: string
  duration: number
}

export interface ScannerConfig {
  maxFileSize: number
  excludePatterns: string[]
  includePatterns: string[]
  cacheTimeout: number
  enableHooks: boolean
  enableUtils: boolean
  enableStandards: boolean
  enableSkills: boolean
}

export interface TechStack {
  isNextJs: boolean
  isReact: boolean
  isTauri: boolean
  isTypescript: boolean
  frameworks: string[]
  packageManager: 'npm' | 'yarn' | 'pnpm' | 'unknown'
}

export interface SkillInfo {
  id: string
  name: string
  description: string
  skillPath: string
  tools: InternalTool[]
}

export interface UtilFunction {
  name: string
  filePath: string
  category: string
  parameters: string[]
  returnType: string
  description?: string
}

export interface HookInfo {
  name: string
  filePath: string
  methods: string[]
  description?: string
}

export const DEFAULT_SCANNER_CONFIG: ScannerConfig = {
  maxFileSize: 100 * 1024,
  excludePatterns: [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/.next/**',
    '**/coverage/**',
  ],
  includePatterns: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
  cacheTimeout: 60 * 60 * 1000,
  enableHooks: true,
  enableUtils: true,
  enableStandards: true,
  enableSkills: true,
}