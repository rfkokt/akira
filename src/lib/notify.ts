import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';

/**
 * Send a native OS notification with permission check.
 * Safe to call — silently fails if permission is denied.
 */
export async function notify(title: string, body: string): Promise<void> {
  try {
    let permissionGranted = await isPermissionGranted();

    if (!permissionGranted) {
      const permission = await requestPermission();
      permissionGranted = permission === 'granted';
    }

    if (permissionGranted) {
      sendNotification({ title, body });
    }
  } catch (err) {
    // Silently fail — notifications are non-critical
    console.warn('[notify] Failed to send notification:', err);
  }
}
