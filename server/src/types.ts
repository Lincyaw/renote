// Client -> Server messages
export interface ClientMessage {
  type: string;
  [key: string]: any;
}

export interface AuthMessage extends ClientMessage {
  type: 'auth';
  token: string;
}

export interface FileReadMessage extends ClientMessage {
  type: 'file_read';
  path: string;
}

export interface SearchMessage extends ClientMessage {
  type: 'search';
  query: string;
  options?: {
    caseSensitive?: boolean;
    regex?: boolean;
  };
}

export interface FileTreeMessage extends ClientMessage {
  type: 'file_tree';
  path?: string;
}

// Server -> Client messages
export interface ServerMessage {
  type: string;
  data?: any;
  error?: string;
  timestamp?: number;
}

// Claude Code types
export interface HistoryEntry {
  display: string;
  pastedContents: Record<string, any>;
  timestamp: number;
  project: string;
  sessionId: string;
}

export interface SessionEntry {
  type: 'user' | 'assistant' | 'system' | 'progress' | 'file-history-snapshot';
  uuid: string;
  sessionId: string;
  timestamp: string;
  [key: string]: any;
}

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, any>;
}

// Terminal Types
export type TerminalType = 'shell' | 'claude';

// Client -> Server messages
export interface TerminalStartMessage extends ClientMessage {
  type: 'terminal_start';
  data: {
    sessionId: string;
    type?: TerminalType;  // 'shell' or 'claude', defaults to 'shell'
    cwd?: string;
    cols?: number;
    rows?: number;
    claudeArgs?: string[];  // Additional args for claude command
  };
}

export interface TerminalInputMessage extends ClientMessage {
  type: 'terminal_input';
  data: {
    sessionId: string;
    input: string;
  };
}

export interface TerminalResizeMessage extends ClientMessage {
  type: 'terminal_resize';
  data: {
    sessionId: string;
    cols: number;
    rows: number;
  };
}

export interface TerminalCloseMessage extends ClientMessage {
  type: 'terminal_close';
  data: {
    sessionId: string;
  };
}

export interface TerminalListMessage extends ClientMessage {
  type: 'terminal_list';
}

// Git Types
// Client -> Server messages
export interface GitCheckRepoMessage extends ClientMessage {
  type: 'git_check_repo';
  path?: string;
}

export interface GitStatusMessage extends ClientMessage {
  type: 'git_status';
  path?: string;
}

export interface GitFileDiffMessage extends ClientMessage {
  type: 'git_file_diff';
  path?: string;
  filePath: string;
  staged?: boolean;
}

// Server -> Client messages (Terminal)
export interface TerminalStartResponse extends ServerMessage {
  type: 'terminal_start_response';
  data: {
    success: boolean;
    sessionId: string;
    terminalType?: TerminalType;
    message?: string;
  };
}

export interface TerminalOutputMessage extends ServerMessage {
  type: 'terminal_output';
  data: {
    sessionId: string;
    output: string;
  };
}

export interface TerminalClosedMessage extends ServerMessage {
  type: 'terminal_closed';
  data: {
    sessionId: string;
  };
}

export interface TerminalCloseResponse extends ServerMessage {
  type: 'terminal_close_response';
  data: {
    success: boolean;
    sessionId: string;
  };
}

export interface TerminalListResponse extends ServerMessage {
  type: 'terminal_list_response';
  data: {
    terminals: Array<{
      sessionId: string;
      type: TerminalType;
      createdAt: number;
    }>;
  };
}

// Session Browser Types
export interface ListSubagentsMessage extends ClientMessage {
  type: 'list_subagents';
  workspace: string;
  sessionId: string;
}

export interface GetSubagentMessagesMessage extends ClientMessage {
  type: 'get_subagent_messages';
  workspace: string;
  sessionId: string;
  agentId: string;
}

export interface ListToolResultsMessage extends ClientMessage {
  type: 'list_tool_results';
  workspace: string;
  sessionId: string;
}

export interface GetToolResultContentMessage extends ClientMessage {
  type: 'get_tool_result_content';
  workspace: string;
  sessionId: string;
  toolUseId: string;
}

export interface GetSessionFolderInfoMessage extends ClientMessage {
  type: 'get_session_folder_info';
  workspace: string;
  sessionId: string;
}

// Chat Mode - Send message to Claude CLI
export interface SendClaudeMessageRequest extends ClientMessage {
  type: 'send_claude_message';
  data: {
    workspaceDirName: string;
    sessionId?: string;      // 恢复会话
    newSessionId?: string;   // 新建会话时的 ID
    message: string;
    allowedTools?: string[]; // 允许的工具列表
  };
}

export interface SendClaudeMessageResponse extends ServerMessage {
  type: 'send_claude_message_response';
  data: {
    success: boolean;
    error?: string;
    sessionId?: string;
  };
}
