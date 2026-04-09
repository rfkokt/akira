/**
 * Utils Scanner
 * 
 * Scan src/utils/ and generate MCP tools from exported functions
 */

import { join } from 'path'
import { existsSync, readFileSync } from 'fs'
import * as ts from 'typescript'
import { glob } from 'glob'
import type { InternalTool } from '../types'
import { parseParameters } from './helpers/parseParameters'

export async function scanUtils(workspacePath: string): Promise<InternalTool[]> {
  const tools: InternalTool[] = []
  const utilsDir = join(workspacePath, 'src/utils')

  if (!existsSync(utilsDir)) {
    console.log('[UtilsScanner] No utils directory found')
    return tools
  }

  try {
    // Find all TypeScript/JavaScript files in utils
    const files = await glob('**/*.{ts,tsx,js,jsx}', { cwd: utilsDir })

    for (const file of files) {
      const filePath = join(utilsDir, file)
      
      // Skip test files
      if (file.includes('.test.') || file.includes('.spec.')) {
        continue
      }

      try {
        const fileTools = await scanFile(filePath, file)
        tools.push(...fileTools)
      } catch (error) {
        console.error(`[UtilsScanner] Error scanning ${file}:`, error)
      }
    }

    console.log(`[UtilsScanner] Found ${tools.length} utils tools`)
    return tools
  } catch (error) {
    console.error('[UtilsScanner] Scan failed:', error)
    return tools
  }
}

async function scanFile(filePath: string, relativePath: string): Promise<InternalTool[]> {
  const tools: InternalTool[] = []
  
  // Read file content
  const content = readFileSync(filePath, 'utf-8')
  
  // Parse TypeScript
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  )

  // Extract category from filename
  const category = extractCategory(relativePath)

  // Find all exported functions
  ts.forEachChild(sourceFile, (node) => {
    if (ts.isFunctionDeclaration(node) && hasExportModifier(node)) {
      const funcName = node.name?.getText()
      if (!funcName) return

      // Skip private/internal functions (starting with _)
      if (funcName.startsWith('_')) return

      const parameters = parseParameters(node)
      const description = extractDescription(node, sourceFile, content)

      tools.push({
        name: `util_${funcName}`,
        description: description || `Utility: ${funcName}`,
        source: 'internal',
        category: category as InternalTool['category'],
        parameters,
        handler: createHandler(funcName, filePath),
      })
    }
  })

  return tools
}

function extractCategory(filePath: string): string {
  const parts = filePath.split('/')
  
  // Get category from filename or parent directory
  if (parts.length >= 2) {
    const dirName = parts[parts.length - 2]
    return dirName.replace(/[-_]/g, ' ').toLowerCase()
  }
  
  return 'utils'
}

function extractDescription(
  node: ts.FunctionDeclaration,
  _sourceFile: ts.SourceFile,
  _content: string
): string | undefined {
  // Try JSDoc
  const jsDocTags = ts.getJSDocTags(node)
  const jsDocComments = ts.getJSDocCommentsAndTags(node)
  
  if (jsDocComments.length > 0) {
    const comment = jsDocComments[0].comment
    if (typeof comment === 'string') {
      return comment.split('\n')[0] // First line of JSDoc
    }
  }
  
  // Try @description tag
  const descTag = jsDocTags.find(tag => tag.tagName.getText() === 'description')
  if (descTag && typeof descTag.comment === 'string') {
    return descTag.comment
  }

  return undefined
}

function hasExportModifier(node: ts.Node): boolean {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined
  if (!modifiers) return false
  
  return modifiers.some(
    (modifier) =>
      modifier.kind === ts.SyntaxKind.ExportKeyword ||
      modifier.kind === ts.SyntaxKind.DefaultKeyword
  )
}

function createHandler(funcName: string, filePath: string): InternalTool['handler'] {
  return async (args: Record<string, unknown>) => {
    try {
      // Dynamic import
      const module = await import(filePath)
      const func = module[funcName] || module.default?.[funcName]
      
      if (typeof func !== 'function') {
        return {
          success: false,
          error: `Function ${funcName} not found in ${filePath}`,
        }
      }

      // Execute function with arguments
      const result = await func(...Object.values(args))
      
      return {
        success: true,
        data: result,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }
}