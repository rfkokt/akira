/**
 * Workspace Scanner
 * 
 * Main scanner that coordinates all sub-scanners
 */

import type { InternalTool } from '../types'
import type { WorkspaceTools, ScanResult, ScannerConfig, TechStack } from './types'
import { DEFAULT_SCANNER_CONFIG } from './types'
import { scanUtils } from './utilsScanner'
import { scanHooks } from './hooksScanner'
import { scanSkills } from './skillsScanner'
import { scanStandards } from './standardsScanner'
import { detectTechStack } from './techStackScanner'
import { getAllInternalTools } from '../registry'

export class WorkspaceScanner {
  private workspaceId: string
  private workspacePath: string
  private config: ScannerConfig
  private cache: Map<string, ScanResult> = new Map()

  constructor(
    workspaceId: string,
    workspacePath: string,
    config?: Partial<ScannerConfig>
  ) {
    this.workspaceId = workspaceId
    this.workspacePath = workspacePath
    this.config = { ...DEFAULT_SCANNER_CONFIG, ...config }
  }

  async scan(): Promise<ScanResult> {
    const startTime = Date.now()

    console.log(`[WorkspaceScanner] Scanning workspace: ${this.workspaceId}`)
    console.log(`[WorkspaceScanner] Path: ${this.workspacePath}`)

    try {
      // 1. Get default tools from registry
      const defaultTools = getAllInternalTools()
      console.log(`[WorkspaceScanner] Default tools: ${defaultTools.length}`)

      // 2. Scan utils
      const utilsTools = this.config.enableUtils
        ? await this.scanWithTimer('utils', () => scanUtils(this.workspacePath))
        : []
      console.log(`[WorkspaceScanner] Utils tools: ${utilsTools.length}`)

      // 3. Scan hooks
      const hooksTools = this.config.enableHooks
        ? await this.scanWithTimer('hooks', () => scanHooks(this.workspacePath))
        : []
      console.log(`[WorkspaceScanner] Hooks tools: ${hooksTools.length}`)

      // 4. Scan skills
      const skillsTools = this.config.enableSkills
        ? await this.scanWithTimer('skills', () => scanSkills(this.workspaceId))
        : []
      console.log(`[WorkspaceScanner] Skills tools: ${skillsTools.length}`)

      // 5. Scan standards
      const standardsTools = this.config.enableStandards
        ? await this.scanWithTimer('standards', () => scanStandards(this.workspacePath))
        : []
      console.log(`[WorkspaceScanner] Standards tools: ${standardsTools.length}`)

      // 6. Detect tech stack and generate tools
      const techStack = await detectTechStack(this.workspacePath)
      const techTools = this.generateTechTools(techStack)
      console.log(`[WorkspaceScanner] Tech tools: ${techTools.length}`)

      // 7. Combine all tools
      const tools: WorkspaceTools = {
        defaultTools,
        skillsTools,
        standardsTools,
        utilsTools,
        hooksTools,
        techTools,
      }

      const duration = Date.now() - startTime
      const hash = await this.computeHash()

      const result: ScanResult = {
        workspaceId: this.workspaceId,
        workspacePath: this.workspacePath,
        tools,
        timestamp: Date.now(),
        hash,
        duration,
      }

      // Cache result
      this.cache.set(this.workspaceId, result)

      console.log(`[WorkspaceScanner] Scan complete in ${duration}ms`)
      console.log(`[WorkspaceScanner] Total tools: ${this.countTools(tools)}`)

      return result
    } catch (error) {
      console.error(`[WorkspaceScanner] Scan failed:`, error)
      throw error
    }
  }

  private async scanWithTimer(
    name: string,
    scanner: () => Promise<InternalTool[]>
  ): Promise<InternalTool[]> {
    const start = Date.now()
    try {
      const tools = await scanner()
      const duration = Date.now() - start
      console.log(`[WorkspaceScanner] ${name} scanner completed in ${duration}ms`)
      return tools
    } catch (error) {
      console.error(`[WorkspaceScanner] ${name} scanner failed:`, error)
      return []
    }
  }

  private generateTechTools(techStack: TechStack): InternalTool[] {
    const tools: InternalTool[] = []

    // Next.js specific tools
    if (techStack.isNextJs) {
      tools.push({
        name: 'tech_nextjs_routes',
        description: 'Get Next.js file-based routing information',
        source: 'internal',
        category: 'tech',
        parameters: {
          type: 'object',
          properties: {},
        },
        handler: async () => {
          return {
            success: true,
            data: {
              framework: 'Next.js',
              routing: 'file-based',
              appDir: true,
            },
          }
        },
      })
    }

    // Tauri specific tools
    if (techStack.isTauri) {
      tools.push({
        name: 'tech_tauri_commands',
        description: 'List available Tauri IPC commands',
        source: 'internal',
        category: 'tech',
        parameters: {
          type: 'object',
          properties: {},
        },
        handler: async () => {
          return {
            success: true,
            data: {
              framework: 'Tauri',
              commands: ['invoke', 'listen', 'emit'],
            },
          }
        },
      })
    }

    // React specific tools
    if (techStack.isReact) {
      tools.push({
        name: 'tech_react_patterns',
        description: 'Get React best practices and patterns',
        source: 'internal',
        category: 'tech',
        parameters: {
          type: 'object',
          properties: {},
        },
        handler: async () => {
          return {
            success: true,
            data: {
              framework: 'React',
              patterns: ['hooks', 'context', 'composition'],
              bestPractices: ['functional components', 'custom hooks', 'memo for optimization'],
            },
          }
        },
      })
    }

    return tools
  }

  private async computeHash(): Promise<string> {
    // Simple hash based on workspace path and timestamp
    // In production, this should hash file contents
    const data = `${this.workspaceId}:${this.workspacePath}:${Date.now()}`
    return Buffer.from(data).toString('base64').substring(0, 16)
  }

  private countTools(tools: WorkspaceTools): number {
    return (
      tools.defaultTools.length +
      tools.skillsTools.length +
      tools.standardsTools.length +
      tools.utilsTools.length +
      tools.hooksTools.length +
      tools.techTools.length
    )
  }

  getCache(): ScanResult | undefined {
    return this.cache.get(this.workspaceId)
  }

  clearCache(): void {
    this.cache.delete(this.workspaceId)
  }

  needsRescan(): boolean {
    const cached = this.cache.get(this.workspaceId)
    if (!cached) return true

    const age = Date.now() - cached.timestamp
    return age > this.config.cacheTimeout
  }
}

// Singleton scanners per workspace
const scanners = new Map<string, WorkspaceScanner>()

export function getWorkspaceScanner(
  workspaceId: string,
  workspacePath: string,
  config?: Partial<ScannerConfig>
): WorkspaceScanner {
  if (!scanners.has(workspaceId)) {
    scanners.set(workspaceId, new WorkspaceScanner(workspaceId, workspacePath, config))
  }
  return scanners.get(workspaceId)!
}

export async function scanWorkspace(
  workspaceId: string,
  workspacePath: string,
  config?: Partial<ScannerConfig>
): Promise<ScanResult> {
  const scanner = getWorkspaceScanner(workspaceId, workspacePath, config)
  return scanner.scan()
}