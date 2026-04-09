/**
 * Execute Hook Action
 * 
 * Handle React hooks execution in non-React context
 */

import { readFileSync, existsSync } from 'fs'

export interface HookMethod {
  name: string
  parameters: string[]
  description?: string
}

export interface HookExecutionContext {
  hookName: string
  workspacePath: string
  hookPath: string
}

export async function executeHookAction(
  hookName: string,
  methodName: string,
  args: Record<string, any>,
  context: HookExecutionContext
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    // Option 1: Try to load hook implementation (experimental)
    // Note: This won't work for hooks that use React state/context
    const result = await tryExecuteDirect(context.hookPath, methodName, args)
    
    if (result.success) {
      return result
    }
    
    // Option 2: Return hook signature for AI to understand
    return {
      success: false,
      error: `Hook ${hookName}.${methodName} requires React context to execute. ` +
        `Use this method name in your React component instead. ` +
        `Signature: ${result.signature || methodName}(${Object.keys(args).join(', ')})`,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error executing hook',
    }
  }
}

async function tryExecuteDirect(
  hookPath: string,
  methodName: string,
  args: Record<string, any>
): Promise<{ success: boolean; data?: any; signature?: string; error?: string }> {
  try {
    if (!existsSync(hookPath)) {
      return { success: false, error: `Hook file not found: ${hookPath}` }
    }

    // Parse hook file to extract method signatures
    const hookContent = readFileSync(hookPath, 'utf-8')
    const methods = extractHookMethods(hookContent)
    
    const method = methods.find(m => m.name === methodName)
    if (!method) {
      return { 
        success: false, 
        error: `Method ${methodName} not found in hook`,
        signature: methodName 
      }
    }

    // For hooks with simple logic that don't use React features,
    // we can extract and execute them directly
    const extractedCode = extractMethodCode(hookContent, methodName)
    
    if (extractedCode && canExecuteSynchronously(extractedCode)) {
      // Create a simple function from extracted code
      const fn = new Function('args', `
        const { ${Object.keys(args).join(', ')} } = args;
        ${extractedCode}
        return ${methodName}(${Object.keys(args).map(k => k).join(', ')});
      `)
      
      const result = await fn(args)
      return { success: true, data: result }
    }

    // Return method signature for AI understanding
    return {
      success: false,
      signature: `${methodName}(${method.parameters.join(', ')})`,
      error: 'Hook method uses React features and cannot be executed outside React context',
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to execute hook method',
    }
  }
}

export function extractHookMethods(hookContent: string): HookMethod[] {
  const methods: HookMethod[] = []
  
  // Match return { ... } from hook
  const returnMatch = hookContent.match(/return\s*\{([^}]+)\}/s)
  if (!returnMatch) return methods

  const returnBody = returnMatch[1]
  
  // Match method definitions
  const methodRegex = /(\w+)\s*:\s*(?:async\s+)?(?:\([^)]*\)\s*=>|function\s*\([^)]*\))/g
  let match
  
  while ((match = methodRegex.exec(returnBody)) !== null) {
    const methodName = match[1]
    
    // Extract parameters from the full match
    const fullMatch = match[0]
    const paramsMatch = fullMatch.match(/\(([^)]*)\)/)
    const params = paramsMatch 
      ? paramsMatch[1].split(',').map(p => p.trim()).filter(Boolean)
      : []

    methods.push({
      name: methodName,
      parameters: params,
    })
  }

  return methods
}

export function extractMethodCode(hookContent: string, methodName: string): string | null {
  // Match const/let/var methodName = ...
  const constMatch = hookContent.match(
    new RegExp(`(?:const|let|var)\\s+${methodName}\\s*=\\s*(?:async\\s+)?(?:\\([^)]*\\)\\s*=>|function\\s*\\([^)]*\\))`, 'm')
  )
  
  if (constMatch) {
    // Find the arrow function or regular function body
    const startIndex = constMatch.index! + constMatch[0].length
    
    // Simple extraction for single-line or multi-line functions
    let depth = 0
    let inFunction = false
    let endIndex = startIndex
    
    for (let i = startIndex; i < hookContent.length; i++) {
      const char = hookContent[i]
      
      if (char === '{') {
        depth++
        inFunction = true
      } else if (char === '}') {
        depth--
        if (depth === 0 && inFunction) {
          endIndex = i + 1
          break
        }
      }
    }
    
    return hookContent.substring(startIndex, endIndex)
  }

  // Match function methodName(...) {...}
  const funcMatch = hookContent.match(
    new RegExp(`function\\s+${methodName}\\s*\\([^)]*\\)\\s*\\{([^}]*)\\}`, 'm')
  )
  
  if (funcMatch) {
    return funcMatch[0]
  }

  return null
}

export function canExecuteSynchronously(code: string): boolean {
  // Check if code uses React-specific features
  const reactFeatures = [
    'useState',
    'useEffect',
    'useContext',
    'useReducer',
    'useCallback',
    'useMemo',
    'useRef',
    'useLayoutEffect',
    'React.',
    'react.',
  ]

  return !reactFeatures.some(feature => code.includes(feature))
}

export function getHookSignature(hookName: string, hookPath: string): string {
  try {
    if (!existsSync(hookPath)) {
      return `${hookName}: Hook file not found`
    }

    const hookContent = readFileSync(hookPath, 'utf-8')
    const methods = extractHookMethods(hookContent)

    if (methods.length === 0) {
      return `${hookName}: No exported methods found`
    }

    const methodsStr = methods
      .map(m => `  - ${m.name}(${m.parameters.join(', ')})`)
      .join('\n')

    return `${hookName}:\n${methodsStr}`
  } catch (error) {
    return `${hookName}: Error reading hook - ${error instanceof Error ? error.message : 'Unknown error'}`
  }
}