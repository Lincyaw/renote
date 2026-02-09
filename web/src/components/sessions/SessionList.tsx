import { useEffect, useCallback } from 'react';
import { useSessionBrowserStore } from '../../store/sessionBrowserStore';
import { wsClient } from '../../services/websocket';
import type { SessionInfo } from '../../types';

interface Props {
  workspaceDirName: string;
  onSelect: (session: SessionInfo) => void;
  onBack: () => void;
  onNewConversation: () => void;
}

export default function SessionList({ workspaceDirName, onSelect, onBack, onNewConversation }: Props) {
  const { sessions, loading } = useSessionBrowserStore();

  useEffect(() => {
    useSessionBrowserStore.getState().setLoading(true);
    wsClient.requestSessions(workspaceDirName);
  }, [workspaceDirName]);

  const handleRefresh = useCallback(() => {
    useSessionBrowserStore.getState().setLoading(true);
    wsClient.requestSessions(workspaceDirName);
  }, [workspaceDirName]);

  const handleSelect = useCallback((session: SessionInfo) => {
    // Request initial messages before navigating
    wsClient.requestSessionMessagesPage(workspaceDirName, session.sessionId);
    wsClient.watchSession(workspaceDirName, session.sessionId);
    onSelect(session);
  }, [workspaceDirName, onSelect]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHrs = diffMs / (1000 * 60 * 60);

    if (diffHrs < 1) return `${Math.floor(diffMs / 60000)}m ago`;
    if (diffHrs < 24) return `${Math.floor(diffHrs)}h ago`;
    if (diffHrs < 168) return `${Math.floor(diffHrs / 24)}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b border-gray-800 flex items-center gap-2">
        <button onClick={onBack} className="text-sm text-blue-400 hover:text-blue-300">
          &larr; Workspaces
        </button>
        <div className="flex-1" />
        <button onClick={handleRefresh} className="text-xs text-gray-400 hover:text-gray-200 px-2">
          Refresh
        </button>
        <button
          onClick={onNewConversation}
          className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1 rounded transition-colors"
        >
          + New
        </button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-center text-gray-500 text-sm">Loading sessions...</div>
        ) : sessions.length === 0 ? (
          <div className="p-4 text-center text-gray-500 text-sm">No sessions found</div>
        ) : (
          <div className="divide-y divide-gray-800/50">
            {sessions.map((session) => (
              <button
                key={session.sessionId}
                onClick={() => handleSelect(session)}
                className="w-full text-left px-4 py-3 hover:bg-gray-800/50 transition-colors"
              >
                <div className="text-sm text-gray-200 line-clamp-2">
                  {session.firstPrompt || session.summary || 'Empty session'}
                </div>
                <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
                  <span>{session.messageCount} msgs</span>
                  <span>{formatDate(session.modified)}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
