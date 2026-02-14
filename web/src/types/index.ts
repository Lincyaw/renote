// === Connection Types ===

export interface ConnectionParams {
  host: string;
  port: number;
  token: string;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected';
export type ConnectionQuality = 'good' | 'degraded' | 'poor';

export interface ConnectionStatus {
  ws: 'connected' | 'disconnected' | 'connecting';
}

// === Client -> Server Messages ===

export interface ClientMessage {
  type: string;
  [key: string]: unknown;
}

// === Server -> Client Messages ===

export interface ServerMessage {
  type: string;
  data?: unknown;
  error?: string;
  timestamp?: number;
}

// === Terminal Types ===

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

// === Claude Types ===

export interface ClaudeMessage {
  id: string;
  type: 'user' | 'assistant' | 'tool_call' | 'tool_result' | 'file_change';
  content: string;
  timestamp: number;
  metadata?: ClaudeMessageMetadata;
}

export interface ClaudeMessageMetadata {
  toolName?: string;
  toolId?: string;
  input?: Record<string, unknown>;
  filePath?: string;
  oldContent?: string;
  newContent?: string;
  operation?: 'edit' | 'write';
}

// === Session Browser Types ===

export interface WorkspaceInfo {
  dirName: string;
  displayPath: string;
  fullPath: string;
  sessionCount: number;
  lastModified: number;
}

export interface SessionInfo {
  sessionId: string;
  firstPrompt: string;
  summary: string;
  messageCount: number;
  created: string;
  modified: string;
}

export interface SessionMessage {
  uuid: string;
  type: 'user' | 'assistant' | 'tool_use' | 'tool_result' | 'system';
  content: string;
  timestamp: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
}

export interface SubagentInfo {
  agentId: string;
  slug: string;
  filePath: string;
  messageCount: number;
  created: string;
  modified: string;
  firstPrompt: string;
  parentSessionId: string;
}

export interface ToolResultFile {
  toolUseId: string;
  filePath: string;
  size: number;
}

export interface SessionFolderInfo {
  subagentCount: number;
  toolResultCount: number;
}

// === File Types ===

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  children?: FileNode[];
  hasChildren?: boolean;
  accessDenied?: boolean;
}

export interface GitFileStatus {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'untracked' | 'renamed';
  staged: boolean;
  oldPath?: string;
  additions?: number;
  deletions?: number;
}

// === Toast ===

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  duration?: number;
}
