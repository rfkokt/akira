import { useEffect, useCallback, useRef } from 'react'

export type ShortcutCallback = (e: KeyboardEvent) => void

export interface ShortcutConfig {
  key: string
  metaKey?: boolean
  ctrlKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
  preventDefault?: boolean
  callback: ShortcutCallback
}

export interface ShortcutGroup {
  name: string
  shortcuts: ShortcutConfig[]
}

/**
 * Hook untuk mengelola keyboard shortcuts
 * 
 * Usage:
 * const shortcuts = useKeyboardShortcuts([
 *   {
 *     key: '1',
 *     metaKey: true,
 *     callback: () => setPage('tasks'),
 *     preventDefault: true
 *   },
 *   {
 *     key: 'n',
 *     metaKey: true,
 *     callback: () => setShowNewTask(true),
 *     preventDefault: true
 *   }
 * ])
 */
export function useKeyboardShortcuts(shortcuts: ShortcutConfig[]) {
  const shortcutsRef = useRef(shortcuts)
  
  // Update ref when shortcuts change
  useEffect(() => {
    shortcutsRef.current = shortcuts
  }, [shortcuts])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't trigger shortcuts when typing in input/textarea
    const target = e.target as HTMLElement
    const isInput = target.tagName === 'INPUT' || 
                    target.tagName === 'TEXTAREA' || 
                    target.isContentEditable
    
    // Special handling for Enter shortcuts (⌘Enter, ⌘⇧Enter)
    // These should work even in inputs
    const isEnterShortcut = e.key === 'Enter' && (e.metaKey || e.ctrlKey)
    
    if (isInput && !isEnterShortcut) {
      return
    }

    for (const shortcut of shortcutsRef.current) {
      const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase()
      const metaMatch = !!shortcut.metaKey === (e.metaKey || e.ctrlKey)
      const shiftMatch = !!shortcut.shiftKey === e.shiftKey
      const altMatch = !!shortcut.altKey === e.altKey

      if (keyMatch && metaMatch && shiftMatch && altMatch) {
        if (shortcut.preventDefault !== false) {
          e.preventDefault()
        }
        shortcut.callback(e)
        break
      }
    }
  }, [])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}

/**
 * Hook untuk menampilkan keyboard shortcut dalam format yang readable
 */
export function useShortcutDisplay() {
  const isMac = navigator.platform.toLowerCase().includes('mac')
  
  const formatShortcut = useCallback((shortcut: Omit<ShortcutConfig, 'callback'>) => {
    const parts: string[] = []
    
    if (shortcut.metaKey || shortcut.ctrlKey) {
      parts.push(isMac ? '⌘' : 'Ctrl')
    }
    if (shortcut.shiftKey) {
      parts.push(isMac ? '⇧' : 'Shift')
    }
    if (shortcut.altKey) {
      parts.push(isMac ? '⌥' : 'Alt')
    }
    
    // Map special keys
    const keyMap: Record<string, string> = {
      'enter': isMac ? '⏎' : 'Enter',
      'escape': 'Esc',
      'arrowup': '↑',
      'arrowdown': '↓',
      'arrowleft': '←',
      'arrowright': '→',
      'comma': isMac ? ',' : ',',
      'period': '.',
      'slash': '/',
    }
    
    parts.push(keyMap[shortcut.key.toLowerCase()] || shortcut.key.toUpperCase())
    
    return parts.join(isMac ? '' : '+')
  }, [isMac])

  return { formatShortcut, isMac }
}

/**
 * Default shortcuts configuration untuk Akira
 */
export const DEFAULT_SHORTCUTS = {
  // Navigation
  GO_TASKS: { key: '1', metaKey: true, preventDefault: true },
  GO_FILES: { key: '2', metaKey: true, preventDefault: true },
  GO_SETTINGS: { key: '3', metaKey: true, preventDefault: true },
  GO_TERMINAL: { key: '`', metaKey: true, preventDefault: true },
  
  // Actions
  NEW_TASK: { key: 'n', metaKey: true, preventDefault: true },
  SWITCH_WORKSPACE: { key: 'e', metaKey: true, preventDefault: true },
  TOGGLE_CHAT: { key: 'j', metaKey: true, preventDefault: true },
  
  // Search
  SEARCH_FILES: { key: 'f', metaKey: true, preventDefault: true },
  SEARCH_CONTENT: { key: 'f', metaKey: true, shiftKey: true, preventDefault: true },
  
  // Submit
  SUBMIT: { key: 'Enter', metaKey: true, preventDefault: true },
  SUBMIT_AND_START: { key: 'Enter', metaKey: true, shiftKey: true, preventDefault: true },
  
  // Zoom
  ZOOM_IN: { key: '=', metaKey: true, preventDefault: true },
  ZOOM_OUT: { key: '-', metaKey: true, preventDefault: true },
  ZOOM_RESET: { key: '0', metaKey: true, preventDefault: true },
  
  // Editor
  CLOSE_TAB: { key: 'w', metaKey: true, preventDefault: true },
  NEXT_TAB: { key: ']', metaKey: true, shiftKey: true, preventDefault: true },
  PREV_TAB: { key: '[', metaKey: true, shiftKey: true, preventDefault: true },
  
  // Git
  COMMIT: { key: 'Enter', ctrlKey: true, preventDefault: true },
  
  // Misc
  SETTINGS: { key: ',', metaKey: true, preventDefault: true },
  CLOSE: { key: 'Escape', preventDefault: false },
} as const

/**
 * Get all shortcuts as a list untuk display di help/settings
 */
export function getAllShortcuts() {
  return [
    {
      category: 'Navigation',
      items: [
        { keys: '⌘1', description: 'Go to Tasks' },
        { keys: '⌘2', description: 'Go to Files' },
        { keys: '⌘3', description: 'Go to Settings' },
        { keys: '⌘`', description: 'Toggle Terminal' },
      ]
    },
    {
      category: 'Actions',
      items: [
        { keys: '⌘N', description: 'New Task' },
        { keys: '⌘E', description: 'Switch Workspace' },
        { keys: '⌘J', description: 'Toggle Chat Panel' },
        { keys: '⌘,', description: 'Open Settings' },
      ]
    },
    {
      category: 'Search',
      items: [
        { keys: '⌘F', description: 'Find File' },
        { keys: '⌘⇧F', description: 'Search in Files' },
      ]
    },
    {
      category: 'Submit',
      items: [
        { keys: '⌘⏎', description: 'Submit' },
        { keys: '⌘⇧⏎', description: 'Submit & Start' },
      ]
    },
    {
      category: 'Zoom',
      items: [
        { keys: '⌘+', description: 'Zoom In' },
        { keys: '⌘-', description: 'Zoom Out' },
        { keys: '⌘0', description: 'Reset Zoom' },
      ]
    },
    {
      category: 'Editor',
      items: [
        { keys: '⌘W', description: 'Close Tab' },
        { keys: '⌘⇧]', description: 'Next Tab' },
        { keys: '⌘⇧[', description: 'Previous Tab' },
      ]
    },
    {
      category: 'Git',
      items: [
        { keys: 'Ctrl+⏎', description: 'Commit Changes' },
      ]
    },
  ]
}
