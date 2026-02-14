import { useEffect, useState, useCallback } from 'react';
import { useSessionBrowserStore } from '../../store/sessionBrowserStore';
import { wsClient } from '../../services/websocket';
import type { SessionInfo, WorkspaceInfo } from '../../types';

interface RecentSession {
  workspace: WorkspaceInfo;
  session: SessionInfo;
}

interface Props {
  onSelect: (workspaceDirName: string, session: SessionInfo) => void;
}

export default function RecentSessions({ onSelect }: Props) {
  const workspaces = useSessionBrowserStore(s => s.workspaces);
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (workspaces.length === 0) return;

    setLoading(true);
    const sessionsMap = new Map<string, { workspace: WorkspaceInfo; sessions: SessionInfo[] }>();
    let pending = Math.min(workspaces.length, 3);

    // Sort workspaces by lastModified desc, take top 3
    const topWorkspaces = [...workspaces]
      .sort((a, b) => b.lastModified - a.lastModified)
      .slice(0, 3);

    const ws = (wsClient as unknown as { ws: WebSocket | null }).ws;
    if (!ws) { setLoading(false); return; }

    const handler = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'list_sessions_response' && Array.isArray(msg.data)) {
          // Find which workspace this response belongs to
          const matchedWorkspace = topWorkspaces.find(w => {
            const existing = sessionsMap.get(w.dirName);
            return !existing;
          });
          if (matchedWorkspace) {
            sessionsMap.set(matchedWorkspace.dirName, {
              workspace: matchedWorkspace,
              sessions: msg.data,
            });
          }

          pending--;
          if (pending <= 0) {
            ws.removeEventListener('message', handler);

            // Aggregate and sort
            const all: RecentSession[] = [];
            sessionsMap.forEach(({ workspace, sessions }) => {
              for (const session of sessions) {
                all.push({ workspace, session });
              }
            });

            all.sort((a, b) =>
              new Date(b.session.modified).getTime() - new Date(a.session.modified).getTime()
            );

            setRecentSessions(all.slice(0, 8));
            setLoading(false);
          }
        }
      } catch { /* ignore */ }
    };

    ws.addEventListener('message', handler);

    for (const w of topWorkspaces) {
      wsClient.requestSessions(w.dirName);
    }

    return () => {
      ws.removeEventListener('message', handler);
    };
  }, [workspaces]);

  const handleSelect = useCallback((item: RecentSession) => {
    wsClient.requestSessionMessagesPage(item.workspace.dirName, item.session.sessionId);
    wsClient.watchSession(item.workspace.dirName, item.session.sessionId);
    onSelect(item.workspace.dirName, item.session);
  }, [onSelect]);

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHrs = diffMs / (1000 * 60 * 60);

    if (diffHrs < 1) return `${Math.max(1, Math.floor(diffMs / 60000))}m`;
    if (diffHrs < 24) return `${Math.floor(diffHrs)}h`;
    if (diffHrs < 168) return `${Math.floor(diffHrs / 24)}d`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const shortenWorkspace = (dirName: string) => {
    const decoded = '/' + dirName.replace(/-/g, '/');
    const parts = decoded.split('/').filter(Boolean);
    if (parts.length <= 2) return decoded;
    return '.../' + parts.slice(-2).join('/');
  };

  if (loading) {
    return (
      <div className="px-3 py-2 border-b border-gray-800">
        <div className="text-xs text-gray-500 mb-2">Recent</div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[1, 2, 3].map(i => (
            <div key={i} className="shrink-0 w-48 h-16 bg-gray-800/50 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (recentSessions.length === 0) return null;

  return (
    <div className="px-3 py-2 border-b border-gray-800">
      <div className="text-xs text-gray-500 mb-2">Recent</div>
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {recentSessions.map((item) => (
          <button
            key={`${item.workspace.dirName}_${item.session.sessionId}`}
            onClick={() => handleSelect(item)}
            className="shrink-0 w-48 bg-gray-800/50 hover:bg-gray-800 border border-gray-700/50 rounded-lg px-3 py-2 text-left transition-colors"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-gray-500 truncate font-mono">
                {shortenWorkspace(item.workspace.dirName)}
              </span>
              <span className="text-[10px] text-gray-600 shrink-0 ml-1">
                {formatTime(item.session.modified)}
              </span>
            </div>
            <div className="text-xs text-gray-300 line-clamp-2">
              {item.session.firstPrompt || item.session.summary || 'Empty session'}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
