import { useState, useEffect, useRef, useCallback } from 'react';
import { useSessionBrowserStore } from '../../store/sessionBrowserStore';
import { wsClient } from '../../services/websocket';

interface Props {
  currentPath: string | null;
  onSwitch: (path: string | null) => void;
}

function truncatePath(fullPath: string | null): string {
  if (!fullPath) return 'Server default';
  const parts = fullPath.split('/').filter(Boolean);
  if (parts.length <= 2) return fullPath;
  return '.../' + parts.slice(-2).join('/');
}

export default function WorkspaceSelector({ currentPath, onSwitch }: Props) {
  const [open, setOpen] = useState(false);
  const [customPath, setCustomPath] = useState('');
  const popoverRef = useRef<HTMLDivElement>(null);
  const workspaces = useSessionBrowserStore(s => s.workspaces);

  useEffect(() => {
    if (open) {
      wsClient.requestWorkspaces();
    }
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleSelect = useCallback((path: string | null) => {
    onSwitch(path);
    setOpen(false);
    setCustomPath('');
  }, [onSwitch]);

  const handleCustomSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customPath.trim();
    if (trimmed) {
      handleSelect(trimmed);
    }
  }, [customPath, handleSelect]);

  return (
    <div className="relative" ref={popoverRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-xs text-gray-300 hover:text-gray-100 bg-gray-800 rounded px-2 py-1 max-w-[180px] transition-colors"
        title={currentPath || 'Server default'}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
          <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
        </svg>
        <span className="truncate font-mono">{truncatePath(currentPath)}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-72 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden">
          {/* Server default */}
          <button
            onClick={() => handleSelect(null)}
            className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-gray-700 transition-colors border-b border-gray-700"
          >
            Server default (CWD)
          </button>

          {/* Workspace list */}
          {workspaces.length > 0 && (
            <div className="max-h-48 overflow-y-auto">
              <div className="px-3 py-1.5 text-[10px] text-gray-500 uppercase tracking-wider">
                Claude Workspaces
              </div>
              {workspaces.map((ws) => (
                  <button
                    key={ws.dirName}
                    onClick={() => handleSelect(ws.fullPath)}
                    className="w-full text-left px-3 py-2 text-xs font-mono text-gray-300 hover:bg-gray-700 transition-colors truncate"
                    title={ws.fullPath}
                  >
                    {ws.displayPath}
                    <span className="text-gray-600 ml-1">({ws.sessionCount})</span>
                  </button>
              ))}
            </div>
          )}

          {/* Custom path input */}
          <form
            onSubmit={handleCustomSubmit}
            className="border-t border-gray-700 px-3 py-2"
          >
            <div className="text-[10px] text-gray-500 mb-1">Custom path</div>
            <div className="flex gap-1">
              <input
                type="text"
                value={customPath}
                onChange={(e) => setCustomPath(e.target.value)}
                placeholder="/path/to/directory"
                className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs font-mono text-gray-200 focus:outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-500 transition-colors"
              >
                Go
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
