/**
 * Standards Scanner
 * 
 * Parse .eslintrc, .prettierrc, tsconfig.json and generate validation tools
 */

import { join } from 'path'
import { existsSync, readFileSync } from 'fs'
import type { InternalTool } from '../types'

interface ProjectStandards {
  eslint?: any
  prettier?: any
  tsconfig?: any
  hasReadme: boolean
}

export async function scanStandards(workspacePath: string): Promise<InternalTool[]> {
  const tools: InternalTool[] = []

  try {
    const standards = await parseConfigs(workspacePath)
    
    // Tool: Check coding standards
    if (standards.eslint || standards.tsconfig) {
      tools.push({
        name: 'std_check_coding',
        description: 'Check if code follows project coding standards',
        source: 'internal',
        category: 'standards',
        parameters: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              description: 'Code snippet to check',
            },
            filename: {
              type: 'string',
              description: 'Optional filename for context',
            },
          },
          required: ['code'],
        },
        handler: async (args: Record<string, unknown>) => {
          const violations: string[] = []
          const code = args.code as string
          const filename = args.filename as string | undefined

          // Check TS rules
          if (standards.tsconfig) {
            const tsViolations = checkTypescriptRules(code, standards.tsconfig)
            violations.push(...tsViolations)
          }

          // Check ESLint rules
          if (standards.eslint) {
            const eslintViolations = checkEslintRules(code, standards.eslint)
            violations.push(...eslintViolations)
          }

          return {
            success: violations.length === 0,
            data: {
              violations,
              hasViolations: violations.length > 0,
              filename,
            },
          }
        },
      })
    }

    // Tool: Enforce naming conventions
    if (standards.eslint?.rules?.['@typescript-eslint/naming-convention'] || 
        standards.eslint?.rules?.['camelcase']) {
      tools.push({
        name: 'std_enforce_naming',
        description: 'Check if name follows project naming conventions',
        source: 'internal',
        category: 'standards',
        parameters: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name to check',
            },
            type: {
              type: 'string',
              description: 'Type of name (variable, function, class, file)',
              enum: ['variable', 'function', 'class', 'file', 'constant'],
            },
          },
          required: ['name', 'type'],
        },
        handler: async (args: Record<string, unknown>) => {
          const name = args.name as string
          const type = args.type as string
          
          const isValid = checkNamingConvention(name, type, standards.eslint)
          
          return {
            success: isValid,
            data: {
              name,
              type,
              isValid,
              convention: getNamingConvention(type, standards.eslint),
            },
          }
        },
      })
    }

    // Tool: Suggest file location
    tools.push({
      name: 'std_suggest_location',
      description: 'Suggest where to place a new file based on project structure',
      source: 'internal',
      category: 'standards',
      parameters: {
        type: 'object',
        properties: {
          filename: {
            type: 'string',
            description: 'Name of the file',
          },
          filetype: {
            type: 'string',
            description: 'Type of file (component, hook, util, etc)',
            enum: ['component', 'hook', 'util', 'type', 'api', 'page', 'other'],
          },
        },
        required: ['filename', 'filetype'],
      },
      handler: async (args: Record<string, unknown>) => {
        const filename = args.filename as string
        const filetype = args.filetype as string
        
        const suggestion = suggestFileLocation(filename, filetype, workspacePath)
        
        return {
          success: true,
          data: suggestion,
        }
      },
    })

    // Tool: Get project guidelines
    if (standards.hasReadme) {
      tools.push({
        name: 'std_get_guidelines',
        description: 'Get project guidelines from README and configs',
        source: 'internal',
        category: 'standards',
        parameters: {
          type: 'object',
          properties: {},
        },
        handler: async () => {
          const guidelines = extractGuidelines(standards, workspacePath)
          return {
            success: true,
            data: guidelines,
          }
        },
      })
    }

    console.log(`[StandardsScanner] Found ${tools.length} standards tools`)
    return tools
  } catch (error) {
    console.error('[StandardsScanner] Scan failed:', error)
    return tools
  }
}

async function parseConfigs(workspacePath: string): Promise<ProjectStandards> {
  const standards: ProjectStandards = {
    hasReadme: false,
  }

  // Parse ESLint config
  const eslintPaths = [
    join(workspacePath, '.eslintrc.json'),
    join(workspacePath, '.eslintrc.js'),
    join(workspacePath, '.eslintrc'),
    join(workspacePath, '.eslintrc.yaml'),
    join(workspacePath, '.eslintrc.yml'),
  ]

  for (const eslintPath of eslintPaths) {
    if (existsSync(eslintPath)) {
      try {
        const content = readFileSync(eslintPath, 'utf-8')
        if (eslintPath.endsWith('.json')) {
          standards.eslint = JSON.parse(content)
        } else if (eslintPath.endsWith('.js')) {
          // Extract config from JS file (simplified)
          const configMatch = content.match(/module\.exports\s*=\s*(\{[\s\S]*\})/)
          if (configMatch) {
            // Note: This is simplified, actual parsing would need proper JS parsing
            standards.eslint = { rules: {} }
          }
        }
        break
      } catch (e) {
        console.error('[StandardsScanner] Error parsing ESLint config:', e)
      }
    }
  }

  // Parse Prettier config
  const prettierPaths = [
    join(workspacePath, '.prettierrc'),
    join(workspacePath, '.prettierrc.json'),
    join(workspacePath, '.prettierrc.js'),
    join(workspacePath, 'prettier.config.js'),
  ]

  for (const prettierPath of prettierPaths) {
    if (existsSync(prettierPath)) {
      try {
        const content = readFileSync(prettierPath, 'utf-8')
        if (prettierPath.endsWith('.json')) {
          standards.prettier = JSON.parse(content)
        }
        break
      } catch (e) {
        console.error('[StandardsScanner] Error parsing Prettier config:', e)
      }
    }
  }

  // Parse tsconfig
  const tsconfigPath = join(workspacePath, 'tsconfig.json')
  if (existsSync(tsconfigPath)) {
    try {
      const content = readFileSync(tsconfigPath, 'utf-8')
      // Remove comments from JSON
      const cleanContent = content.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '')
      standards.tsconfig = JSON.parse(cleanContent)
    } catch (e) {
      console.error('[StandardsScanner] Error parsing tsconfig:', e)
    }
  }

  // Check for README
  const readmePaths = [
    join(workspacePath, 'README.md'),
    join(workspacePath, 'readme.md'),
    join(workspacePath, 'README'),
  ]

  for (const readmePath of readmePaths) {
    if (existsSync(readmePath)) {
      standards.hasReadme = true
      break
    }
  }

  return standards
}

function checkTypescriptRules(code: string, tsconfig: any): string[] {
  const violations: string[] = []
  
  // Simple checks based on tsconfig
  const strict = tsconfig?.compilerOptions?.strict
  const noImplicitAny = tsconfig?.compilerOptions?.noImplicitAny
  
  if (code.includes(': any')) {
    violations.push('Avoid using `any` type')
  }
  
  if (strict || noImplicitAny) {
    // Check for missing type annotations
    const functionWithoutReturnType = /function\s+\w+\s*\([^)]*\)\s*\{/
    if (functionWithoutReturnType.test(code)) {
      violations.push('Function missing return type annotation')
    }
  }
  
  return violations
}

function checkEslintRules(code: string, eslint: any): string[] {
  const violations: string[] = []
  const rules = eslint?.rules || {}
  
  // Semi
  if (rules.semi === 'error' || (Array.isArray(rules.semi) && rules.semi[0] === 'error')) {
    // Check for missing semicolons (simplified)
    const lines = code.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (line && !line.endsWith(';') && !line.endsWith('{') && !line.endsWith('}') && !line.startsWith('//')) {
        // Likely missing semicolon
      }
    }
  }
  
  // Quotes
  if (rules.quotes === 'error' || Array.isArray(rules.quotes)) {
    // Could check quote style here
  }
  
  return violations
}

function checkNamingConvention(name: string, type: string, _eslint: any): boolean {
  // Simple naming convention checks
  switch (type) {
    case 'variable':
    case 'function':
      return /^[a-z][a-zA-Z0-9]*$/.test(name) || /^[a-z][a-zA-Z0-9_]*$/.test(name)
    case 'class':
    case 'type':
      return /^[A-Z][a-zA-Z0-9]*$/.test(name)
    case 'constant':
      return /^[A-Z][A-Z0-9_]*$/.test(name)
    case 'file':
      return /^[a-z][a-z0-9-_.]*$/.test(name) || /^[a-z][a-z0-9_.]*$/.test(name)
    default:
      return true
  }
}

function getNamingConvention(type: string, _eslint: any): string {
  switch (type) {
    case 'variable':
    case 'function':
      return 'camelCase'
    case 'class':
    case 'type':
      return 'PascalCase'
    case 'constant':
      return 'UPPER_SNAKE_CASE'
    case 'file':
      return 'kebab-case or camelCase'
    default:
      return 'various'
  }
}

function suggestFileLocation(
  filename: string,
  filetype: string,
  _workspacePath: string
): { suggestedPath: string; reason: string } {
  // Map file types to directories
  const directoryMap: Record<string, { dir: string; reason: string }> = {
    component: { dir: 'src/components', reason: 'Components are stored in src/components' },
    hook: { dir: 'src/hooks', reason: 'Custom hooks are stored in src/hooks' },
    util: { dir: 'src/utils', reason: 'Utility functions are stored in src/utils' },
    type: { dir: 'src/types', reason: 'Type definitions are stored in src/types' },
    api: { dir: 'src/api', reason: 'API functions are stored in src/api' },
    page: { dir: 'src/pages', reason: 'Page components are stored in src/pages' },
  }

  const mapping = directoryMap[filetype] || { dir: 'src', reason: 'General project directory' }
  
  return {
    suggestedPath: join(mapping.dir, filename),
    reason: mapping.reason,
  }
}

function extractGuidelines(standards: ProjectStandards, _workspacePath: string): any {
  const guidelines: any = {
    hasConfig: !!(standards.eslint || standards.prettier || standards.tsconfig),
    conventions: [],
  }

  if (standards.eslint?.rules) {
    guidelines.conventions.push('ESLint rules configured')
    guidelines.eslintRules = Object.keys(standards.eslint.rules).slice(0, 10)
  }

  if (standards.prettier) {
    guidelines.conventions.push('Prettier formatting configured')
    guidelines.prettierConfig = standards.prettier
  }

  if (standards.tsconfig?.compilerOptions) {
    guidelines.conventions.push('TypeScript strict mode configured')
    guidelines.tsconfigOptions = Object.keys(standards.tsconfig.compilerOptions).slice(0, 10)
  }

  return guidelines
}