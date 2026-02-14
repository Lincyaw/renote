import { useState, useRef, useCallback } from 'react';
import { useTerminalSessionStore } from '../../store/terminalSessionStore';

interface Props {
  onSelect: (sessionId: string) => void;
  onClose: (sessionId: string, kill: boolean) => void;
  onNew: (type: 'shell' | 'claude') => void;
}

export default function TerminalTabBar({ onSelect, onClose, onNew }: Props) {
  const { sessions, activeSessionId } = useTerminalSessionStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  const handleDoubleClick = useCallback((sessionId: string, currentName: string) => {
    setEditingId(sessionId);
    setEditValue(currentName);
    setTimeout(() => editInputRef.current?.select(), 0);
  }, []);

  const handleRenameSubmit = useCallback((sessionId: string) => {
    const trimmed = editValue.trim();
    if (trimmed) {
      useTerminalSessionStore.getState().renameSession(sessionId, trimmed);
    }
    setEditingId(null);
  }, [editValue]);

  return (
    <div className="flex items-center gap-1 px-2 py-1.5 border-b border-gray-800 bg-gray-900/50 overflow-x-auto scrollbar-none">
      {sessions.map((session) => {
        const isActive = session.id === activeSessionId;
        const isEditing = editingId === session.id;
        const statusColor = {
          active: 'bg-green-500',
          connecting: 'bg-yellow-500',
          closed: 'bg-gray-500',
          error: 'bg-red-500',
        }[session.status];

        return (
          <div
            key={session.id}
            className={`group flex items-center gap-1.5 px-2.5 py-1 rounded text-xs shrink-0 cursor-pointer transition-colors ${
              isActive
                ? 'bg-gray-800 text-blue-400'
                : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'
            }`}
            onClick={() => onSelect(session.id)}
            onDoubleClick={() => handleDoubleClick(session.id, session.name)}
          >
            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusColor}`} />
            {isEditing ? (
              <input
                ref={editInputRef}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => handleRenameSubmit(session.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRenameSubmit(session.id);
                  if (e.key === 'Escape') setEditingId(null);
                  e.stopPropagation();
                }}
                onClick={(e) => e.stopPropagation()}
                className="bg-gray-700 text-gray-200 text-xs px-1 py-0 rounded w-20 outline-none border border-blue-500"
                autoFocus
              />
            ) : (
              <span className="truncate max-w-[100px]">{session.name}</span>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose(session.id, false);
              }}
              className="hidden group-hover:inline text-gray-500 hover:text-gray-300 ml-0.5"
              title="Close"
            >
              x
            </button>
          </div>
        );
      })}

      {/* New session buttons */}
      <div className="flex items-center gap-0.5 ml-1 shrink-0">
        <button
          onClick={() => onNew('shell')}
          className="text-[10px] text-gray-500 hover:text-blue-400 px-1.5 py-0.5 rounded hover:bg-gray-800/50 transition-colors"
          title="New Shell"
        >
          +S
        </button>
        <button
          onClick={() => onNew('claude')}
          className="text-[10px] text-gray-500 hover:text-purple-400 px-1.5 py-0.5 rounded hover:bg-gray-800/50 transition-colors"
          title="New Claude"
        >
          +C
        </button>
      </div>
    </div>
  );
}
