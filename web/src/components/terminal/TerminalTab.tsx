import { useCallback } from 'react';
import { useTerminalSessionStore } from '../../store/terminalSessionStore';
import { useConnectionStore } from '../../store/connectionStore';
import { wsClient } from '../../services/websocket';
import TerminalView from './TerminalView';
import TerminalSessionList from './TerminalSessionList';

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

  const activeSession = sessions.find(s => s.id === activeSessionId);

  if (wsStatus !== 'connected') {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
        Connect to a server to use the terminal.
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Session sidebar */}
      <div className="w-56 shrink-0 border-r border-gray-800 flex flex-col bg-gray-900/50 max-md:hidden">
        <div className="p-3 border-b border-gray-800 flex flex-col gap-2">
          <span className="text-sm font-medium text-gray-300">Sessions</span>
          <div className="flex gap-1.5">
            <button
              onClick={() => handleNewSession('shell')}
              className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1 rounded transition-colors flex-1"
            >
              + Shell
            </button>
            <button
              onClick={() => handleNewSession('claude')}
              className="text-xs bg-purple-600 hover:bg-purple-700 text-white px-2.5 py-1 rounded transition-colors flex-1"
            >
              + Claude
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <TerminalSessionList onSelect={handleSelectSession} onClose={handleCloseSession} />
        </div>
      </div>

      {/* Terminal content */}
      <div className="flex-1 flex flex-col">
        {/* Mobile session bar */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800 md:hidden">
          <button
            onClick={() => handleNewSession('shell')}
            className="text-xs bg-blue-600 text-white px-2 py-1 rounded"
          >
            + Shell
          </button>
          <button
            onClick={() => handleNewSession('claude')}
            className="text-xs bg-purple-600 text-white px-2 py-1 rounded"
          >
            + Claude
          </button>
          {sessions.length > 0 && (
            <select
              value={activeSessionId || ''}
              onChange={(e) => setActiveSession(e.target.value || null)}
              className="flex-1 bg-gray-800 text-gray-200 text-xs rounded px-2 py-1 border border-gray-700"
            >
              <option value="">Select session</option>
              {sessions.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
          {activeSessionId && (
            <button
              onClick={() => handleCloseSession(activeSessionId)}
              className="text-xs text-red-400 hover:text-red-300 px-2 py-1"
            >
              Close
            </button>
          )}
        </div>

        {activeSession ? (
          <TerminalView key={activeSession.id} sessionId={activeSession.id} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500 gap-3">
            <div className="text-4xl font-mono opacity-20">{'>_'}</div>
            <p className="text-sm">Create a terminal session to get started</p>
            <div className="flex gap-2">
              <button
                onClick={() => handleNewSession('shell')}
                className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
              >
                New Shell
              </button>
              <button
                onClick={() => handleNewSession('claude')}
                className="text-sm bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg transition-colors"
              >
                New Claude
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
