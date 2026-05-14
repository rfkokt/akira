import { useEffect } from 'react';
import { Loader2, CheckCircle2, XCircle, RefreshCw, Terminal } from 'lucide-react';
import { usePiStore } from '@/store/piStore';
import { Button } from '@/components/ui/button';

/**
 * Displays Pi authentication status on the Settings page.
 * Shows verifying, connected, auth_error, and error states with
 * appropriate guidance and a re-check button.
 */
export function PiAuthStatus() {
  const piStatus = usePiStore((s) => s.piStatus);
  const piError = usePiStore((s) => s.piError);
  const checkAuth = usePiStore((s) => s.checkAuth);

  // Trigger auth check on mount if not already connected
  useEffect(() => {
    if (piStatus === 'disconnected') {
      checkAuth();
    }
  }, [piStatus, checkAuth]);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-white flex items-center gap-2">
          <Terminal className="w-4 h-4 text-app-accent" />
          Pi Connection
        </h3>
        <p className="text-xs text-neutral-500 mt-1">
          Authentication status for the Pi coding agent.
        </p>
      </div>

      <div className="bg-app-panel rounded-lg border border-app-border p-5 space-y-4">
        {/* Status Display */}
        {piStatus === 'verifying' && (
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-app-accent animate-spin" />
            <div>
              <p className="text-sm font-medium text-white">Verifying connection...</p>
              <p className="text-xs text-neutral-500 mt-0.5">
                Checking Pi authentication status
              </p>
            </div>
          </div>
        )}

        {piStatus === 'connected' && (
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-400" />
            <div>
              <p className="text-sm font-medium text-green-400">Connected</p>
              <p className="text-xs text-neutral-500 mt-0.5">
                Pi is authenticated and ready to use.
              </p>
            </div>
          </div>
        )}

        {piStatus === 'auth_error' && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <XCircle className="w-5 h-5 text-red-400" />
              <div>
                <p className="text-sm font-medium text-red-400">Authentication Failed</p>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Pi is not authenticated. Please set up authentication.
                </p>
              </div>
            </div>
            <div className="p-3 bg-black/30 rounded-md border border-app-border">
              <p className="text-xs text-neutral-300 mb-2">
                To authenticate Pi, run the following command in your terminal:
              </p>
              <code className="block text-sm font-mono text-app-accent bg-app-accent/10 px-3 py-2 rounded-md">
                pi auth
              </code>
              <p className="text-xs text-neutral-500 mt-2">
                After authenticating, click Re-check below to verify.
              </p>
            </div>
            {piError && (
              <p className="text-xs text-red-400/80">{piError}</p>
            )}
          </div>
        )}

        {piStatus === 'error' && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <XCircle className="w-5 h-5 text-red-400" />
              <div>
                <p className="text-sm font-medium text-red-400">Connection Error</p>
                <p className="text-xs text-neutral-400 mt-0.5">
                  {piError?.toLowerCase().includes('timeout')
                    ? 'Pi did not respond within the timeout period.'
                    : 'Failed to connect to Pi.'}
                </p>
              </div>
            </div>
            {piError && (
              <div className="p-3 bg-black/30 rounded-md border border-red-500/20">
                <p className="text-xs text-neutral-400 mb-1">Error details:</p>
                <p className="text-xs text-red-400 font-mono">{piError}</p>
              </div>
            )}
          </div>
        )}

        {piStatus === 'disconnected' && (
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 rounded-full border-2 border-neutral-600" />
            <div>
              <p className="text-sm font-medium text-neutral-400">Not checked</p>
              <p className="text-xs text-neutral-500 mt-0.5">
                Click Re-check to verify Pi connection.
              </p>
            </div>
          </div>
        )}

        {/* Re-check Button */}
        <div className="pt-2 border-t border-app-border">
          <Button
            variant="secondary"
            size="sm"
            onClick={checkAuth}
            disabled={piStatus === 'verifying'}
            className="text-xs h-8"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-2 ${piStatus === 'verifying' ? 'animate-spin' : ''}`} />
            Re-check
          </Button>
        </div>
      </div>
    </div>
  );
}
