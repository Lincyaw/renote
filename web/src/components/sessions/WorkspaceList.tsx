import { useEffect, useCallback } from 'react';
import { useSessionBrowserStore } from '../../store/sessionBrowserStore';
import { useConnectionStore } from '../../store/connectionStore';
import { wsClient } from '../../services/websocket';
import EmptyState from '../shared/EmptyState';
import type { WorkspaceInfo } from '../../types';

interface Props {
  onSelect: (workspace: WorkspaceInfo) => void;
}

export default function WorkspaceList({ onSelect }: Props) {
  const { workspaces, searchQuery, setSearchQuery, loading } = useSessionBrowserStore();
  const wsStatus = useConnectionStore(s => s.status.ws);

  useEffect(() => {
    if (wsStatus === 'connected') {
      wsClient.requestWorkspaces();
    }
  }, [wsStatus]);

  const handleRefresh = useCallback(() => {
    wsClient.requestWorkspaces();
  }, []);

  const decodeWorkspaceName = (encoded: string): string => {
    return '/' + encoded.replace(/-/g, '/');
  };

  const filtered = workspaces.filter(w => {
    if (!searchQuery) return true;
    const display = w.displayPath || decodeWorkspaceName(w.dirName);
    return display.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <div className="flex flex-col h-full">
      {/* Search bar */}
      <div className="p-3 border-b border-gray-800 flex gap-2">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search workspaces..."
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
        />
        <button
          onClick={handleRefresh}
          className="text-xs text-gray-400 hover:text-gray-200 px-2"
        >
          Refresh
        </button>
      </div>

      {/* Workspace list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-center text-gray-500 text-sm">Loading workspaces...</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              </svg>
            }
            title={workspaces.length === 0 ? 'No workspaces found' : 'No matches'}
            description={workspaces.length === 0 ? 'No Claude Code workspaces were found on the server.' : 'Try a different search term.'}
            action={workspaces.length === 0 ? { label: 'Refresh', onClick: handleRefresh } : undefined}
          />
        ) : (
          <div className="divide-y divide-gray-800/50">
            {filtered.map((workspace) => (
              <button
                key={workspace.dirName}
                onClick={() => onSelect(workspace)}
                className="w-full text-left px-4 py-3 hover:bg-gray-800/50 transition-colors"
              >
                <div className="text-sm text-gray-200 truncate font-mono">
                  {workspace.displayPath || decodeWorkspaceName(workspace.dirName)}
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                  <span>{workspace.sessionCount} sessions</span>
                  <span>{new Date(workspace.lastModified).toLocaleDateString()}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
