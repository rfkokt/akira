/**
 * Tech Stack Scanner
 * 
 * Detect Next.js, React, Tauri, etc and generate tech-specific tools
 */

import { join } from 'path'
import { existsSync, readFileSync } from 'fs'
import type { TechStack } from './types'

export async function detectTechStack(workspacePath: string): Promise<TechStack> {
  const techStack: TechStack = {
    isNextJs: false,
    isReact: false,
    isTauri: false,
    isTypescript: false,
    frameworks: [],
    packageManager: 'unknown',
  }

  try {
    // Check for TypeScript
    techStack.isTypescript = existsSync(join(workspacePath, 'tsconfig.json'))

    // Parse package.json
    const packageJsonPath = join(workspacePath, 'package.json')
    if (existsSync(packageJsonPath)) {
      try {
        const content = readFileSync(packageJsonPath, 'utf-8')
        const packageJson = JSON.parse(content)
        const deps = { ...packageJson.dependencies, ...packageJson.devDependencies }

        // Detect frameworks
        techStack.isNextJs = 'next' in deps
        techStack.isReact = 'react' in deps
        techStack.isTauri = '@tauri-apps/api' in deps

        // Additional frameworks
        if ('vue' in deps) techStack.frameworks.push('vue')
        if ('svelte' in deps) techStack.frameworks.push('svelte')
        if ('angular' in deps || '@angular/core' in deps) techStack.frameworks.push('angular')
        if ('express' in deps) techStack.frameworks.push('express')
        if ('fastify' in deps) techStack.frameworks.push('fastify')
        if ('nestjs' in deps || '@nestjs/core' in deps) techStack.frameworks.push('nestjs')

        // Detect package manager
        const lockFiles = {
          'package-lock.json': 'npm',
          'yarn.lock': 'yarn',
          'pnpm-lock.yaml': 'pnpm',
        }

        for (const [file, manager] of Object.entries(lockFiles)) {
          if (existsSync(join(workspacePath, file))) {
            techStack.packageManager = manager as TechStack['packageManager']
            break
          }
        }
      } catch (e) {
        console.error('[TechStackScanner] Error parsing package.json:', e)
      }
    }

    // Check for Tauri config
    const tauriConfigPaths = [
      join(workspacePath, 'src-tauri/tauri.conf.json'),
      join(workspacePath, 'tauri.conf.json'),
    ]

    for (const path of tauriConfigPaths) {
      if (existsSync(path)) {
        techStack.isTauri = true
        break
      }
    }

    console.log('[TechStackScanner] Detected tech stack:', {
      nextjs: techStack.isNextJs,
      react: techStack.isReact,
      tauri: techStack.isTauri,
      typescript: techStack.isTypescript,
      frameworks: techStack.frameworks,
      packageManager: techStack.packageManager,
    })

    return techStack
  } catch (error) {
    console.error('[TechStackScanner] Detection failed:', error)
    return techStack
  }
}