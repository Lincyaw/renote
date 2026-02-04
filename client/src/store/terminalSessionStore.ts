import { create } from 'zustand';

export type TerminalType = 'shell' | 'claude';

export interface TerminalSession {
  id: string;
  name: string;
  type: TerminalType;
  createdAt: number;
  lastActiveAt: number;
  status: 'active' | 'connecting' | 'closed' | 'error';
  claudeArgs?: string[];
  cwd?: string;
}

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
  renameSession: (id: string, name: string) => void;
  getSession: (id: string) => TerminalSession | undefined;
  clearAllSessions: () => void;
}

let sessionCounter = 0;

const generateSessionId = (type: TerminalType): string => {
  sessionCounter++;
  return `${type}_${Date.now()}_${sessionCounter}`;
};

const generateSessionName = (type: TerminalType, index: number): string => {
  if (type === 'claude') {
    return `Claude ${index}`;
  }
  return `Shell ${index}`;
};

export const useTerminalSessionStore = create<TerminalSessionState>((set, get) => ({
  sessions: [],
  activeSessionId: null,

  createSession: (type: TerminalType = 'shell', options?: CreateSessionOptions) => {
    const id = generateSessionId(type);
    const now = Date.now();
    const existingSessions = get().sessions;
    const typeCount = existingSessions.filter(s => s.type === type).length;
    const name = generateSessionName(type, typeCount + 1);

    const newSession: TerminalSession = {
      id,
      name,
      type,
      createdAt: now,
      lastActiveAt: now,
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

  removeSession: (id: string) => {
    set((state) => {
      const newSessions = state.sessions.filter((s) => s.id !== id);
      const newActiveId = state.activeSessionId === id
        ? null
        : state.activeSessionId;

      return {
        sessions: newSessions,
        activeSessionId: newActiveId,
      };
    });
  },

  setActiveSession: (id: string | null) => {
    if (id !== null) {
      // Update lastActiveAt when switching to a session
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

  updateSessionStatus: (id: string, status: TerminalSession['status']) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, status } : s
      ),
    }));
  },

  updateSessionActivity: (id: string) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, lastActiveAt: Date.now() } : s
      ),
    }));
  },

  renameSession: (id: string, name: string) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, name } : s
      ),
    }));
  },

  getSession: (id: string) => {
    return get().sessions.find((s) => s.id === id);
  },

  clearAllSessions: () => {
    set({
      sessions: [],
      activeSessionId: null,
    });
  },
}));
