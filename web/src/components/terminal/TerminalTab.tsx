import { useCallback, useEffect } from 'react';
import { useTerminalSessionStore } from '../../store/terminalSessionStore';
import { useConnectionStore } from '../../store/connectionStore';
import { wsClient } from '../../services/websocket';
import TerminalView from './TerminalView';
import TerminalTabBar from './TerminalTabBar';
import MobileSessionTabs from './MobileSessionTabs';
import EmptyState from '../shared/EmptyState';

export default function TerminalTab() {
  const { sessions, activeSessionId, createSession, removeSession, setActiveSession } = useTerminalSessionStore();
  const wsStatus = useConnectionStore(s => s.status.ws);

  const handleNewSession = useCallback((type: 'shell' | 'claude' = 'shell') => {
    if (wsStatus !== 'connected') return;
    createSession(type);
  }, [wsStatus, createSession]);

  const handleCloseSession = useCallback((id: string, kill: boolean = false) => {
    wsClient.send({ type: 'terminal_close', data: { sessionId: id, kill } });
    removeSession(id);
  }, [removeSession]);

  const handleSelectSession = useCallback((id: string) => {
    setActiveSession(id);
  }, [setActiveSession]);

  // Keyboard shortcuts for terminal tab switching
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey || sessions.length === 0) return;

      // Ctrl+Tab / Ctrl+Shift+Tab: cycle sessions
      if (e.key === 'Tab') {
        e.preventDefault();
        const currentIdx = sessions.findIndex(s => s.id === activeSessionId);
        if (e.shiftKey) {
          const prevIdx = currentIdx <= 0 ? sessions.length - 1 : currentIdx - 1;
          const prevSession = sessions[prevIdx];
          if (prevSession) setActiveSession(prevSession.id);
        } else {
          const nextIdx = currentIdx >= sessions.length - 1 ? 0 : currentIdx + 1;
          const nextSession = sessions[nextIdx];
          if (nextSession) setActiveSession(nextSession.id);
        }
        return;
      }

      // Ctrl+1..9: switch by index
      const num = parseInt(e.key);
      if (num >= 1 && num <= 9 && num <= sessions.length) {
        e.preventDefault();
        const session = sessions[num - 1];
        if (session) setActiveSession(session.id);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sessions, activeSessionId, setActiveSession]);

  const activeSession = sessions.find(s => s.id === activeSessionId);

  if (wsStatus !== 'connected') {
    return (
      <EmptyState
        icon={
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
          </svg>
        }
        title="Terminal"
        description="Connect to a server to use the terminal."
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Desktop: compact tab bar */}
      <div className="max-md:hidden">
        <TerminalTabBar
          onSelect={handleSelectSession}
          onClose={handleCloseSession}
          onNew={handleNewSession}
        />
      </div>

      {/* Mobile: pill tabs */}
      <div className="md:hidden">
        <MobileSessionTabs
          onSelect={handleSelectSession}
          onClose={handleCloseSession}
          onNew={handleNewSession}
        />
      </div>

      {/* Terminal content */}
      {activeSession ? (
        <TerminalView key={activeSession.id} sessionId={activeSession.id} />
      ) : (
        <EmptyState
          icon={
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4 17 10 11 4 5" />
              <line x1="12" y1="19" x2="20" y2="19" />
            </svg>
          }
          title="No active sessions"
          description="Create a terminal session to get started"
          action={{ label: 'New Shell', onClick: () => handleNewSession('shell') }}
          secondaryAction={{ label: 'New Claude', onClick: () => handleNewSession('claude') }}
        />
      )}
    </div>
  );
}
