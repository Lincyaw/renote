import { useClaudeStore } from '../store/claudeStore';
import { useConnectionStore } from '../store/connectionStore';
import { useSessionBrowserStore } from '../store/sessionBrowserStore';
import { useFilesStore } from '../store/filesStore';
import { useToastStore } from '../store/toastStore';
import { useTerminalSessionStore } from '../store/terminalSessionStore';
import { EventEmitter } from './eventEmitter';
import type { ConnectionParams } from '../types';

export type { ConnectionParams };

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private isManualDisconnect = false;
  private authResolvers: Array<() => void> = [];
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private missedPongs = 0;
  private emitter = new EventEmitter();
  private connectionParams: ConnectionParams | null = null;
  private hasConnectedThisSession = false;

  connect(host: string, port: number, token: string) {
    this.connectionParams = { host, port, token };
    this.isManualDisconnect = false;
    this.clearReconnectTimeout();
    const url = `ws://${host}:${port}`;

    useConnectionStore.getState().setWSStatus('connecting');

    try {
      this.ws = new WebSocket(url);
    } catch {
      return;
    }

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.send({ type: 'auth', token });
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string);
        this.handleMessage(message);
      } catch {
        // ignore parse errors
      }
    };

    this.ws.onerror = () => {
      // error handled in onclose
    };

    this.ws.onclose = () => {
      this.stopHeartbeat();
      useConnectionStore.getState().setWSStatus('disconnected');
      if (!this.isManualDisconnect) {
        this.attemptReconnect();
      }
      this.isManualDisconnect = false;
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handleMessage(message: any) {
    switch (message.type) {
      case 'auth_success':
        useConnectionStore.getState().setWSStatus('connected');
        useConnectionStore.getState().setAutoReconnecting(false);
        this.hasConnectedThisSession = true;
        this.authResolvers.forEach(resolve => resolve());
        this.authResolvers = [];
        this.startHeartbeat();
        // Auto-discover existing terminal sessions
        this.send({ type: 'list_managed_terminals' });
        break;

      case 'claude_user_input':
        useClaudeStore.getState().addMessage({
          id: `user_${Date.now()}`,
          type: 'user',
          content: message.data.message,
          timestamp: message.data.timestamp,
        });
        break;

      case 'claude_assistant_message':
        useClaudeStore.getState().addMessage({
          id: message.data.messageId,
          type: 'assistant',
          content: message.data.content,
          timestamp: new Date(message.data.timestamp).getTime(),
        });
        break;

      case 'claude_tool_call':
        useClaudeStore.getState().addMessage({
          id: message.data.toolId,
          type: 'tool_call',
          content: `Tool: ${message.data.toolName}`,
          timestamp: new Date(message.data.timestamp).getTime(),
          metadata: {
            toolName: message.data.toolName,
            toolId: message.data.toolId,
            input: message.data.input,
          },
        });
        break;

      case 'claude_file_change':
        useClaudeStore.getState().addMessage({
          id: `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'file_change',
          content: `${message.data.operation === 'write' ? 'Created' : 'Modified'}: ${message.data.filePath}`,
          timestamp: new Date(message.data.timestamp).getTime(),
          metadata: {
            filePath: message.data.filePath,
            operation: message.data.operation,
            oldContent: message.data.oldContent || '',
            newContent: message.data.newContent || '',
          },
        });
        break;

      case 'claude_tool_result':
        useClaudeStore.getState().addMessage({
          id: `result_${message.data.toolId}`,
          type: 'tool_result',
          content: typeof message.data.content === 'string'
            ? message.data.content.substring(0, 200)
            : 'Tool completed',
          timestamp: new Date(message.data.timestamp).getTime(),
          metadata: {
            toolId: message.data.toolId,
          },
        });
        break;

      case 'terminal_output':
        this.emitter.emit('terminal_output', message.data.sessionId, message.data.output);
        break;

      case 'terminal_start_response':
        this.emitter.emit('terminal_start', message.data.success, message.data.sessionId, message.data.terminalType, message.data.message);
        break;

      case 'terminal_closed':
        this.emitter.emit('terminal_closed', message.data.sessionId);
        break;

      case 'terminal_close_response':
        this.emitter.emit('terminal_close', message.data.success, message.data.sessionId);
        break;

      case 'terminal_list_response':
        this.emitter.emit('terminal_list', message.data.terminals);
        break;

      case 'error':
        useToastStore.getState().addToast({
          type: 'error',
          message: message.error || 'An error occurred',
        });
        break;

      case 'list_workspaces_response':
        useSessionBrowserStore.getState().setWorkspaces(message.data);
        break;

      case 'list_sessions_response':
        useSessionBrowserStore.getState().setSessions(message.data);
        break;

      case 'get_session_messages_response':
        useSessionBrowserStore.getState().setMessages(message.data);
        break;

      case 'get_session_messages_page_response': {
        const { messages, hasMore, oldestIndex, isInitial } = message.data;
        const store = useSessionBrowserStore.getState();
        store.setHasMoreMessages(hasMore);
        store.setOldestMessageIndex(oldestIndex);
        if (isInitial) {
          store.setMessages(messages);
        } else {
          store.prependMessages(messages);
        }
        break;
      }

      case 'session_update':
        useSessionBrowserStore.getState().appendMessages(message.data);
        break;

      case 'list_subagents_response':
        useSessionBrowserStore.getState().setSubagents(message.data);
        break;

      case 'get_subagent_messages_response':
        useSessionBrowserStore.getState().setSubagentMessages(message.data);
        break;

      case 'list_tool_results_response':
        useSessionBrowserStore.getState().setToolResults(message.data);
        break;

      case 'get_tool_result_content_response':
        useSessionBrowserStore.getState().setToolResultContent(
          message.data.toolUseId,
          message.data.content
        );
        break;

      case 'get_session_folder_info_response':
        useSessionBrowserStore.getState().setSessionFolderInfo(message.data);
        break;

      case 'send_claude_message_response':
        this.emitter.emit('send_claude_message_response', message.data);
        if (!message.data.success) {
          useToastStore.getState().addToast({
            type: 'error',
            message: message.data.error || 'Failed to send message',
          });
        }
        break;

      case 'git_check_repo_response':
        useFilesStore.getState().setIsGitRepo(message.data.isGitRepo);
        break;

      case 'git_status_response':
        useFilesStore.getState().setGitFiles(message.data.files);
        break;

      case 'git_file_diff_response':
        useFilesStore.getState().setDiffContent(
          message.data.diff,
          message.data.filePath
        );
        break;

      case 'file_tree_response': {
        const { tree, rootPath, truncated, accessErrors } = message.data;
        useFilesStore.getState().setFileTree(tree, rootPath, truncated, accessErrors);
        break;
      }

      case 'file_tree_expand_response': {
        const { path, children, truncated, accessErrors } = message.data;
        const filesStore = useFilesStore.getState();
        filesStore.setLoadingDir(path, false);
        filesStore.setDirectoryChildren(path, children);
        filesStore.setExpandedDir(path, true);
        if (truncated) {
          filesStore.setTruncated(true);
        }
        if (accessErrors && accessErrors.length > 0) {
          filesStore.addAccessErrors(accessErrors);
        }
        break;
      }

      case 'search_response':
        useFilesStore.getState().setSearchResults(message.data.results || []);
        break;

      case 'list_managed_terminals_response':
        useTerminalSessionStore.getState().syncManagedSessions(message.data.terminals);
        break;

      case 'pong':
        this.missedPongs = 0;
        useConnectionStore.getState().setConnectionQuality('good');
        break;
    }
  }

  private getReconnectDelay(): number {
    const baseDelay = 1000;
    const maxDelay = 60000;
    return Math.min(baseDelay * Math.pow(2, this.reconnectAttempts), maxDelay);
  }

  private clearReconnectTimeout() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  private attemptReconnect() {
    if (!this.connectionParams || !this.hasConnectedThisSession) return;

    const delay = this.getReconnectDelay();
    useConnectionStore.getState().setAutoReconnecting(true);

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectAttempts++;
      const { host, port, token } = this.connectionParams!;
      this.connect(host, port, token);
    }, delay);
  }

  reconnect(): boolean {
    if (!this.canReconnect()) return false;
    this.reconnectAttempts = 0;
    const { host, port, token } = this.connectionParams!;
    this.connect(host, port, token);
    return true;
  }

  canReconnect(): boolean {
    return this.connectionParams !== null && this.hasConnectedThisSession;
  }

  getConnectionState(): 'disconnected' | 'connecting' | 'connected' {
    if (!this.ws) return 'disconnected';
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING: return 'connecting';
      case WebSocket.OPEN: return 'connected';
      default: return 'disconnected';
    }
  }

  getConnectionParams(): ConnectionParams | null {
    return this.connectionParams;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  send(message: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  waitForConnection(timeoutMs: number = 10000): Promise<void> {
    return new Promise((resolve, reject) => {
      if (useConnectionStore.getState().status.ws === 'connected') {
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        const idx = this.authResolvers.indexOf(onAuth);
        if (idx !== -1) this.authResolvers.splice(idx, 1);
        reject(new Error('WebSocket connection timeout'));
      }, timeoutMs);

      const onAuth = () => {
        clearTimeout(timeout);
        resolve();
      };

      this.authResolvers.push(onAuth);
    });
  }

  // Terminal event subscriptions
  onTerminalOutput(callback: (sessionId: string, data: string) => void): () => void {
    return this.emitter.on('terminal_output', callback as (...args: unknown[]) => void);
  }

  onTerminalStarted(callback: (success: boolean, sessionId: string, terminalType?: string, message?: string) => void): () => void {
    return this.emitter.on('terminal_start', callback as (...args: unknown[]) => void);
  }

  onTerminalClosed(callback: (sessionId: string) => void): () => void {
    return this.emitter.on('terminal_closed', callback as (...args: unknown[]) => void);
  }

  onTerminalList(callback: (terminals: Array<{ sessionId: string; type: string; createdAt: number }>) => void): () => void {
    return this.emitter.on('terminal_list', callback as (...args: unknown[]) => void);
  }

  disconnect() {
    this.isManualDisconnect = true;
    this.reconnectAttempts = 0;
    this.hasConnectedThisSession = false;
    this.clearReconnectTimeout();
    this.stopHeartbeat();
    this.emitter.removeAllListeners();
    useConnectionStore.getState().setAutoReconnecting(false);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.missedPongs = 0;

    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send({ type: 'ping', timestamp: Date.now() });
        this.missedPongs++;

        if (this.missedPongs >= 3) {
          this.ws.close();
        } else if (this.missedPongs >= 2) {
          useConnectionStore.getState().setConnectionQuality('poor');
        } else if (this.missedPongs >= 1) {
          useConnectionStore.getState().setConnectionQuality('degraded');
        }
      }
    }, 30000);
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.missedPongs = 0;
  }

  // API methods
  requestWorkspaces() { this.send({ type: 'list_workspaces' }); }
  requestSessions(workspace: string) { this.send({ type: 'list_sessions', workspace }); }
  requestSessionMessages(workspace: string, sessionId: string) { this.send({ type: 'get_session_messages', workspace, sessionId }); }
  requestSessionMessagesPage(workspace: string, sessionId: string, limit?: number, beforeIndex?: number) {
    this.send({ type: 'get_session_messages_page', workspace, sessionId, limit, beforeIndex });
  }
  watchSession(workspace: string, sessionId: string) { this.send({ type: 'watch_session', workspace, sessionId }); }
  unwatchSession() { this.send({ type: 'unwatch_session' }); }
  requestGitCheckRepo(path?: string) { this.send({ type: 'git_check_repo', path }); }
  requestFileTree(path?: string, maxDepth?: number, maxNodes?: number) {
    useFilesStore.getState().setLoading(true);
    this.send({ type: 'file_tree', path, maxDepth, maxNodes });
  }
  requestExpandDirectory(path: string, rootPath?: string, maxDepth?: number, maxNodes?: number) {
    useFilesStore.getState().setLoadingDir(path, true);
    this.send({ type: 'file_tree_expand', path, rootPath, maxDepth, maxNodes });
  }
  requestGitStatus(path?: string) {
    useFilesStore.getState().setGitLoading(true);
    this.send({ type: 'git_status', path });
  }
  requestFileDiff(filePath: string, staged: boolean = false, path?: string) {
    useFilesStore.getState().setDiffLoading(true);
    this.send({ type: 'git_file_diff', filePath, staged, path });
  }
  requestSearch(query: string, path?: string, options?: { maxResults?: number }) {
    useFilesStore.getState().setSearchLoading(true);
    this.send({ type: 'search', query, path, options });
  }
  requestSubagents(workspace: string, sessionId: string) { this.send({ type: 'list_subagents', workspace, sessionId }); }
  requestSubagentMessages(workspace: string, sessionId: string, agentId: string) {
    this.send({ type: 'get_subagent_messages', workspace, sessionId, agentId });
  }
  requestToolResults(workspace: string, sessionId: string) { this.send({ type: 'list_tool_results', workspace, sessionId }); }
  requestToolResultContent(workspace: string, sessionId: string, toolUseId: string) {
    this.send({ type: 'get_tool_result_content', workspace, sessionId, toolUseId });
  }
  requestSessionFolderInfo(workspace: string, sessionId: string) {
    this.send({ type: 'get_session_folder_info', workspace, sessionId });
  }
  sendClaudeMessage(
    workspaceDirName: string,
    sessionId: string | undefined,
    newSessionId: string | undefined,
    message: string,
    allowedTools?: string[]
  ): void {
    this.send({
      type: 'send_claude_message',
      data: { workspaceDirName, sessionId, newSessionId, message, allowedTools },
    });
  }
  onSendClaudeMessageResponse(
    callback: (data: { success: boolean; error?: string; sessionId?: string }) => void
  ): () => void {
    return this.emitter.on('send_claude_message_response', callback as (...args: unknown[]) => void);
  }
}

export const wsClient = new WebSocketClient();
