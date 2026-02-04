import { NativeStackScreenProps } from '@react-navigation/native-stack';

export type ClaudeStackParamList = {
  Workspaces: undefined;
  Sessions: { workspaceDirName: string; workspaceDisplayPath: string };
  Conversation: { workspaceDirName: string; sessionId?: string };
  Subagent: { workspaceDirName: string; sessionId: string; agentId: string };
  ToolDetail: {
    toolName: string;
    toolInput: Record<string, any>;
    toolResult?: string;
    timestamp: string;
  };
  ClaudeTerminal: {
    terminalSessionId?: string;
    claudeSessionId?: string;
    cwd?: string;
  };
};

export type WorkspacesScreenProps = NativeStackScreenProps<ClaudeStackParamList, 'Workspaces'>;
export type SessionsScreenProps = NativeStackScreenProps<ClaudeStackParamList, 'Sessions'>;
export type ConversationScreenProps = NativeStackScreenProps<ClaudeStackParamList, 'Conversation'>;
export type SubagentScreenProps = NativeStackScreenProps<ClaudeStackParamList, 'Subagent'>;
export type ToolDetailScreenProps = NativeStackScreenProps<ClaudeStackParamList, 'ToolDetail'>;
export type ClaudeTerminalScreenProps = NativeStackScreenProps<ClaudeStackParamList, 'ClaudeTerminal'>;
