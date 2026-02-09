import { useTerminalSessionStore } from '../../store/terminalSessionStore';

interface Props {
  onSelect: (sessionId: string) => void;
  onClose?: (sessionId: string, kill: boolean) => void;
}

export default function TerminalSessionList({ onSelect, onClose }: Props) {
  const { sessions, activeSessionId } = useTerminalSessionStore();

  if (sessions.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500 text-sm">
        No terminal sessions. Create one to get started.
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-800">
      {sessions.map((session) => {
        const isActive = session.id === activeSessionId;
        const statusColor = {
          active: 'bg-green-500',
          connecting: 'bg-yellow-500',
          closed: 'bg-gray-500',
          error: 'bg-red-500',
        }[session.status];

        return (
          <button
            key={session.id}
            onClick={() => onSelect(session.id)}
            className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors group ${
              isActive ? 'bg-gray-800' : 'hover:bg-gray-800/50'
            }`}
          >
            <div className={`w-2 h-2 rounded-full shrink-0 ${statusColor}`} />
            <div className="flex-1 min-w-0">
              <div className="text-sm text-gray-200 truncate">{session.name}</div>
              <div className="text-xs text-gray-500">
                {session.type === 'claude' ? 'Claude' : 'Shell'} · {session.status}
              </div>
            </div>
            {onClose && (
              <div className="hidden group-hover:flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                <span
                  onClick={() => onClose(session.id, false)}
                  className="text-xs text-gray-500 hover:text-gray-300 px-1"
                  title="Detach"
                >
                  ×
                </span>
                <span
                  onClick={() => onClose(session.id, true)}
                  className="text-xs text-red-500 hover:text-red-300 px-1"
                  title="Kill session"
                >
                  ⊗
                </span>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
