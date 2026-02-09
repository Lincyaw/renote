import { create } from 'zustand';
import type { WorkspaceInfo, SessionInfo, SessionMessage, SubagentInfo, ToolResultFile, SessionFolderInfo } from '../types';

interface SessionBrowserState {
  workspaces: WorkspaceInfo[];
  sessions: SessionInfo[];
  messages: SessionMessage[];
  searchQuery: string;
  loading: boolean;
  hasMoreMessages: boolean;
  oldestMessageIndex: number;
  loadingMore: boolean;
  subagents: SubagentInfo[];
  subagentMessages: SessionMessage[];
  subagentLoading: boolean;
  toolResults: ToolResultFile[];
  toolResultContents: Record<string, string>;
  sessionFolderInfo: SessionFolderInfo | null;

  setWorkspaces: (workspaces: WorkspaceInfo[]) => void;
  setSessions: (sessions: SessionInfo[]) => void;
  setMessages: (messages: SessionMessage[]) => void;
  appendMessages: (messages: SessionMessage[]) => void;
  prependMessages: (messages: SessionMessage[]) => void;
  setSearchQuery: (query: string) => void;
  setLoading: (loading: boolean) => void;
  setHasMoreMessages: (hasMore: boolean) => void;
  setOldestMessageIndex: (index: number) => void;
  setLoadingMore: (loading: boolean) => void;
  setSubagents: (subagents: SubagentInfo[]) => void;
  setSubagentMessages: (messages: SessionMessage[]) => void;
  setSubagentLoading: (loading: boolean) => void;
  setToolResults: (results: ToolResultFile[]) => void;
  setToolResultContent: (toolUseId: string, content: string) => void;
  setSessionFolderInfo: (info: SessionFolderInfo) => void;
  clearSessionData: () => void;
}

export const useSessionBrowserStore = create<SessionBrowserState>((set) => ({
  workspaces: [],
  sessions: [],
  messages: [],
  searchQuery: '',
  loading: false,
  hasMoreMessages: true,
  oldestMessageIndex: 0,
  loadingMore: false,
  subagents: [],
  subagentMessages: [],
  subagentLoading: false,
  toolResults: [],
  toolResultContents: {},
  sessionFolderInfo: null,

  setWorkspaces: (workspaces) => set({ workspaces, loading: false }),
  setSessions: (sessions) => set({ sessions, loading: false }),
  setMessages: (messages) => set({ messages, loading: false }),
  appendMessages: (newMessages) =>
    set((state) => ({ messages: [...state.messages, ...newMessages] })),
  prependMessages: (olderMessages) =>
    set((state) => ({ messages: [...olderMessages, ...state.messages], loadingMore: false })),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setLoading: (loading) => set({ loading }),
  setHasMoreMessages: (hasMoreMessages) => set({ hasMoreMessages }),
  setOldestMessageIndex: (oldestMessageIndex) => set({ oldestMessageIndex }),
  setLoadingMore: (loadingMore) => set({ loadingMore }),
  setSubagents: (subagents) => set({ subagents }),
  setSubagentMessages: (messages) =>
    set({ subagentMessages: messages, subagentLoading: false }),
  setSubagentLoading: (loading) => set({ subagentLoading: loading }),
  setToolResults: (results) => set({ toolResults: results }),
  setToolResultContent: (toolUseId, content) =>
    set((state) => ({
      toolResultContents: { ...state.toolResultContents, [toolUseId]: content },
    })),
  setSessionFolderInfo: (info) => set({ sessionFolderInfo: info }),
  clearSessionData: () =>
    set({
      messages: [],
      hasMoreMessages: true,
      oldestMessageIndex: 0,
      loadingMore: false,
      subagents: [],
      subagentMessages: [],
      toolResults: [],
      sessionFolderInfo: null,
    }),
}));
