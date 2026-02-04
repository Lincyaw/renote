import { useClaudeStore } from '../store/claudeStore';
import { useConnectionStore } from '../store/connectionStore';
import { useSessionBrowserStore } from '../store/sessionBrowserStore';
import { useFilesStore } from '../store/filesStore';
import { useToastStore } from '../store/toastStore';
import { EventEmitter } from './eventEmitter';

export interface ConnectionParams {
  host: string;
  port: number;
  token: string;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected';

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private isManualDisconnect = false;
  private authResolvers: Array<() => void> = [];
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private missedPongs = 0;
  private emitter = new EventEmitter();

  // 存储连接参数，支持自动重连
  private connectionParams: ConnectionParams | null = null;
  // 标记当前会话是否成功连接过（用于判断是否允许自动重连）
  private hasConnectedThisSession = false;

  connect(host: string, port: number, token: string) {
    // 存储连接参数
    this.connectionParams = { host, port, token };

    this.isManualDisconnect = false;
    this.clearReconnectTimeout();
    const url = `ws://${host}:${port}`;

    console.log(`[WS] Connecting to ${url}...`);
    console.log(`[WS] Token: ${token ? '***' : '(empty)'}`);

    useConnectionStore.getState().setWSStatus('connecting');

    try {
      this.ws = new WebSocket(url);
      console.log('[WS] WebSocket object created');
    } catch (error) {
      console.error('[WS] Failed to create WebSocket:', error);
      return;
    }

    this.ws.onopen = () => {
      console.log('[WS] Connection opened, sending auth message');
      this.reconnectAttempts = 0;

      // Send auth message
      this.send({ type: 'auth', token });
      console.log('[WS] Auth message sent');
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log(`[WS] Received message: ${message.type}`);
        this.handleMessage(message);
      } catch (error) {
        console.error('[WS] Error parsing message:', error);
      }
    };

    this.ws.onerror = (error) => {
      console.error('[WS] WebSocket error:', error);
      console.error('[WS] Error details:', JSON.stringify(error));
    };

    this.ws.onclose = (event) => {
      console.log(`[WS] Connection closed: code=${event.code}, reason=${event.reason}, wasClean=${event.wasClean}`);
      this.stopHeartbeat();
      useConnectionStore.getState().setWSStatus('disconnected');
      if (!this.isManualDisconnect) {
        this.attemptReconnect();
      }
      this.isManualDisconnect = false;
    };
  }

  private handleMessage(message: any) {
    switch (message.type) {
      case 'auth_success':
        console.log('Authenticated:', message.data.clientId);
        useConnectionStore.getState().setWSStatus('connected');
        useConnectionStore.getState().setAutoReconnecting(false);
        // Mark that we've successfully connected this session
        this.hasConnectedThisSession = true;
        // Resolve any pending waitForConnection promises
        this.authResolvers.forEach(resolve => resolve());
        this.authResolvers = [];
        this.startHeartbeat();
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
        console.error('Server error:', message.error);
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

      case 'get_session_messages_page_response':
        {
          const { messages, hasMore, oldestIndex, isInitial } = message.data;
          const store = useSessionBrowserStore.getState();
          store.setHasMoreMessages(hasMore);
          store.setOldestMessageIndex(oldestIndex);
          if (isInitial) {
            // Initial load: replace messages
            store.setMessages(messages);
          } else {
            // Loading more: prepend older messages
            store.prependMessages(messages);
          }
        }
        break;

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
        // 发送消息的响应
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

      case 'file_tree_response':
        useFilesStore.getState().setFileTree(message.data);
        break;

      case 'pong':
        this.missedPongs = 0;
        useConnectionStore.getState().setConnectionQuality('good');
        break;

      default:
        console.log('Unknown message type:', message.type);
    }
  }

  /**
   * 计算重连延迟，使用指数退避策略
   * 最小 1 秒，最大 60 秒
   */
  private getReconnectDelay(): number {
    const baseDelay = 1000;
    const maxDelay = 60000;
    const delay = Math.min(baseDelay * Math.pow(2, this.reconnectAttempts), maxDelay);
    return delay;
  }

  private clearReconnectTimeout() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  private attemptReconnect() {
    if (!this.connectionParams || !this.hasConnectedThisSession) {
      console.log('No connection params or not connected this session, skipping reconnect');
      return;
    }

    const delay = this.getReconnectDelay();
    console.log(`Reconnecting in ${delay}ms... (attempt ${this.reconnectAttempts + 1})`);

    // 更新 store 中的重连状态
    useConnectionStore.getState().setAutoReconnecting(true);

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectAttempts++;
      const { host, port, token } = this.connectionParams!;
      this.connect(host, port, token);
    }, delay);
  }

  /**
   * 外部触发重连
   * 用于 AppState 恢复前台时检查并重连
   */
  reconnect(): boolean {
    if (!this.canReconnect()) {
      return false;
    }

    console.log('Manual reconnect triggered');
    this.resetReconnectAttempts();
    const { host, port, token } = this.connectionParams!;
    this.connect(host, port, token);
    return true;
  }

  /**
   * 检查是否可以重连
   * 只有当前会话成功连接过才允许自动重连
   */
  canReconnect(): boolean {
    return this.connectionParams !== null && this.hasConnectedThisSession;
  }

  /**
   * 获取当前连接状态
   */
  getConnectionState(): ConnectionState {
    if (!this.ws) return 'disconnected';
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING:
        return 'connecting';
      case WebSocket.OPEN:
        return 'connected';
      default:
        return 'disconnected';
    }
  }

  /**
   * 获取存储的连接参数
   */
  getConnectionParams(): ConnectionParams | null {
    return this.connectionParams;
  }

  /**
   * 设置连接参数（用于从持久化存储恢复）
   */
  setConnectionParams(params: ConnectionParams | null) {
    this.connectionParams = params;
  }

  /**
   * 重置重连计数
   */
  resetReconnectAttempts() {
    this.reconnectAttempts = 0;
  }

  send(message: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  waitForConnection(timeoutMs: number = 10000): Promise<void> {
    return new Promise((resolve, reject) => {
      // Already authenticated
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
    return this.emitter.on('terminal_output', callback);
  }

  onTerminalStarted(callback: (success: boolean, sessionId: string, terminalType?: string, message?: string) => void): () => void {
    return this.emitter.on('terminal_start', callback);
  }

  onTerminalClosed(callback: (sessionId: string) => void): () => void {
    return this.emitter.on('terminal_closed', callback);
  }

  onTerminalList(callback: (terminals: Array<{ sessionId: string; type: string; createdAt: number }>) => void): () => void {
    return this.emitter.on('terminal_list', callback);
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
          // Connection is dead, close and trigger reconnect
          console.warn('Heartbeat: 3 missed pongs, closing connection');
          this.ws.close();
        } else if (this.missedPongs >= 2) {
          useConnectionStore.getState().setConnectionQuality('poor');
        } else if (this.missedPongs >= 1) {
          useConnectionStore.getState().setConnectionQuality('degraded');
        }
      }
    }, 30000); // 30 second interval
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.missedPongs = 0;
  }

  requestWorkspaces() {
    this.send({ type: 'list_workspaces' });
  }

  requestSessions(workspace: string) {
    this.send({ type: 'list_sessions', workspace });
  }

  requestSessionMessages(workspace: string, sessionId: string) {
    this.send({ type: 'get_session_messages', workspace, sessionId });
  }

  requestSessionMessagesPage(workspace: string, sessionId: string, limit?: number, beforeIndex?: number) {
    this.send({ type: 'get_session_messages_page', workspace, sessionId, limit, beforeIndex });
  }

  watchSession(workspace: string, sessionId: string) {
    this.send({ type: 'watch_session', workspace, sessionId });
  }

  unwatchSession() {
    this.send({ type: 'unwatch_session' });
  }

  requestGitCheckRepo(path?: string) {
    this.send({ type: 'git_check_repo', path });
  }

  requestFileTree(path?: string) {
    useFilesStore.getState().setLoading(true);
    this.send({ type: 'file_tree', path });
  }

  requestGitStatus(path?: string) {
    useFilesStore.getState().setGitLoading(true);
    this.send({ type: 'git_status', path });
  }

  requestFileDiff(filePath: string, staged: boolean = false, path?: string) {
    useFilesStore.getState().setDiffLoading(true);
    this.send({ type: 'git_file_diff', filePath, staged, path });
  }

  requestSubagents(workspace: string, sessionId: string) {
    this.send({ type: 'list_subagents', workspace, sessionId });
  }

  requestSubagentMessages(workspace: string, sessionId: string, agentId: string) {
    this.send({ type: 'get_subagent_messages', workspace, sessionId, agentId });
  }

  requestToolResults(workspace: string, sessionId: string) {
    this.send({ type: 'list_tool_results', workspace, sessionId });
  }

  requestToolResultContent(workspace: string, sessionId: string, toolUseId: string) {
    this.send({ type: 'get_tool_result_content', workspace, sessionId, toolUseId });
  }

  requestSessionFolderInfo(workspace: string, sessionId: string) {
    this.send({ type: 'get_session_folder_info', workspace, sessionId });
  }

  /**
   * 发送消息给 Claude CLI（聊天模式）
   * @param workspaceDirName 工作区目录名称（编码后的路径）
   * @param sessionId 可选，恢复已有会话
   * @param newSessionId 可选，新建会话时指定的 ID
   * @param message 要发送的消息
   * @param allowedTools 可选，允许的工具列表
   */
  sendClaudeMessage(
    workspaceDirName: string,
    sessionId: string | undefined,
    newSessionId: string | undefined,
    message: string,
    allowedTools?: string[]
  ): void {
    this.send({
      type: 'send_claude_message',
      data: {
        workspaceDirName,
        sessionId,
        newSessionId,
        message,
        allowedTools,
      },
    });
  }

  /**
   * 监听 Claude 消息发送响应
   */
  onSendClaudeMessageResponse(
    callback: (data: { success: boolean; error?: string; sessionId?: string }) => void
  ): () => void {
    return this.emitter.on('send_claude_message_response', callback);
  }
}

export const wsClient = new WebSocketClient();
