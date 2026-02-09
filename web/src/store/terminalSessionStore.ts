import { create } from 'zustand';
import type { TerminalType, TerminalSession } from '../types';

interface CreateSessionOptions {
  claudeArgs?: string[];
  cwd?: string;
}

interface TerminalSessionState {
  sessions: TerminalSession[];
  activeSessionId: string | null;
  createSession: (type?: TerminalType, options?: CreateSessionOptions) => TerminalSession;
  removeSession: (id: string) => void;
  setActiveSession: (id: string | null) => void;
  updateSessionStatus: (id: string, status: TerminalSession['status']) => void;
  updateSessionActivity: (id: string) => void;
  getSession: (id: string) => TerminalSession | undefined;
  clearAllSessions: () => void;
  syncManagedSessions: (managed: Array<{ sessionId: string; type: string; zellijName: string }>) => void;
}

let sessionCounter = 0;

const generateSessionId = (type: TerminalType): string => {
  sessionCounter++;
  return `${type}_${Date.now()}_${sessionCounter}`;
};

const generateSessionName = (type: TerminalType, index: number): string => {
  return type === 'claude' ? `Claude ${index}` : `Shell ${index}`;
};

export const useTerminalSessionStore = create<TerminalSessionState>((set, get) => ({
  sessions: [],
  activeSessionId: null,

  createSession: (type: TerminalType = 'shell', options?: CreateSessionOptions) => {
    const id = generateSessionId(type);
    const now = Date.now();
    const typeCount = get().sessions.filter(s => s.type === type).length;
    const name = generateSessionName(type, typeCount + 1);

    const newSession: TerminalSession = {
      id, name, type,
      createdAt: now, lastActiveAt: now,
      status: 'connecting',
      claudeArgs: options?.claudeArgs,
      cwd: options?.cwd,
    };

    set((state) => ({
      sessions: [...state.sessions, newSession],
      activeSessionId: id,
    }));

    return newSession;
  },

  removeSession: (id) => set((state) => ({
    sessions: state.sessions.filter((s) => s.id !== id),
    activeSessionId: state.activeSessionId === id ? null : state.activeSessionId,
  })),

  setActiveSession: (id) => {
    if (id !== null) {
      set((state) => ({
        activeSessionId: id,
        sessions: state.sessions.map((s) =>
          s.id === id ? { ...s, lastActiveAt: Date.now() } : s
        ),
      }));
    } else {
      set({ activeSessionId: id });
    }
  },

  updateSessionStatus: (id, status) => set((state) => ({
    sessions: state.sessions.map((s) =>
      s.id === id ? { ...s, status } : s
    ),
  })),

  updateSessionActivity: (id) => set((state) => ({
    sessions: state.sessions.map((s) =>
      s.id === id ? { ...s, lastActiveAt: Date.now() } : s
    ),
  })),

  getSession: (id) => get().sessions.find((s) => s.id === id),
  clearAllSessions: () => set({ sessions: [], activeSessionId: null }),

  syncManagedSessions: (managed) => set((state) => {
    const existingIds = new Set(state.sessions.map(s => s.id));
    const newSessions: TerminalSession[] = [];

    for (const m of managed) {
      if (!existingIds.has(m.sessionId)) {
        const type = (m.type === 'claude' ? 'claude' : 'shell') as TerminalType;
        const typeCount = [...state.sessions, ...newSessions].filter(s => s.type === type).length;
        newSessions.push({
          id: m.sessionId,
          name: generateSessionName(type, typeCount + 1),
          type,
          createdAt: Date.now(),
          lastActiveAt: Date.now(),
          status: 'active',
        });
      }
    }

    if (newSessions.length === 0) return state;
    return { sessions: [...state.sessions, ...newSessions] };
  }),
}));
