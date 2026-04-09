/**
 * Hooks Scanner
 * 
 * Scan src/hooks/ and generate MCP tools from custom hooks
 */

import { join } from 'path'
import { existsSync, readFileSync } from 'fs'
import { glob } from 'glob'
import type { InternalTool } from '../types'
import { executeHookAction, extractHookMethods, getHookSignature } from './helpers/executeHookAction'

export async function scanHooks(workspacePath: string): Promise<InternalTool[]> {
  const tools: InternalTool[] = []
  const hooksDir = join(workspacePath, 'src/hooks')

  if (!existsSync(hooksDir)) {
    console.log('[HooksScanner] No hooks directory found')
    return tools
  }

  try {
    const files = await glob('use*.{ts,tsx,js,jsx}', { cwd: hooksDir })

    for (const file of files) {
      const filePath = join(hooksDir, file)
      
      // Skip test files
      if (file.includes('.test.') || file.includes('.spec.')) {
        continue
      }

      try {
        const hookTools = await scanHookFile(filePath, file)
        tools.push(...hookTools)
      } catch (error) {
        console.error(`[HooksScanner] Error scanning ${file}:`, error)
      }
    }

    console.log(`[HooksScanner] Found ${tools.length} hooks tools`)
    return tools
  } catch (error) {
    console.error('[HooksScanner] Scan failed:', error)
    return tools
  }
}

async function scanHookFile(filePath: string, fileName: string): Promise<InternalTool[]> {
  const tools: InternalTool[] = []
  
  // Extract hook name from filename (useAuth.ts -> useAuth)
  const hookName = fileName.replace(/\.(ts|tsx|js|jsx)$/, '')
  
  // Read file content
  const content = readFileSync(filePath, 'utf-8')
  
  // Extract methods from hook
  const methods = extractHookMethods(content)
  
  // Create a load tool for the hook
  tools.push({
    name: `hook_${hookName.replace(/^use/, '').toLowerCase()}_load`,
    description: `Load ${hookName} hook context and available methods`,
    source: 'internal',
    category: 'hooks',
    parameters: {
      type: 'object',
      properties: {},
    },
    handler: async () => {
      const signature = getHookSignature(hookName, filePath)
      return {
        success: true,
        data: {
          hookName,
          methods: methods.map(m => m.name),
          signature,
          description: `React hook: ${hookName}`,
        },
      }
    },
  })
  
  // Create tools for each method
  for (const method of methods) {
    tools.push({
      name: `hook_${hookName.replace(/^use/, '').toLowerCase()}_${method.name}`,
      description: `Execute ${method.name} from ${hookName} hook${method.description ? ` - ${method.description}` : ''}`,
      source: 'internal',
      category: 'hooks',
      parameters: {
        type: 'object',
        properties: method.parameters.reduce((acc, param) => {
          acc[param] = { type: 'any', description: `Parameter: ${param}` }
          return acc
        }, {} as Record<string, any>),
        required: method.parameters,
      },
      handler: async (args: Record<string, unknown>) => {
        return executeHookAction(hookName, method.name, args, {
          hookName,
          workspacePath: filePath.split('/src/')[0],
          hookPath: filePath,
        })
      },
    })
  }

  return tools
}