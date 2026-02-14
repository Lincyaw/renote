import WebSocket from 'ws';
import { createServer, IncomingMessage } from 'http';
import { CONFIG } from '../config';
import { logger } from '../utils/logger';
import { AuthManager } from './auth';
import { ClientMessage, ServerMessage, FileTreeExpandMessage } from '../types';
import { fileBrowser } from '../files/browser';
import { fileReader } from '../files/reader';
import { searchService } from '../files/search';
import { listWorkspaces, listSessions, getSessionMessages, getSessionMessagesPage, watchSession, unwatchSession, listSubagents, getSubagentMessages, listToolResults, getToolResultContent, getSessionFolderInfo } from '../claude/sessionBrowser';
import { LocalTerminalHandler } from '../terminal';
import { GitHandler } from '../git';
import { terminalWebSocketHandler } from '../terminal/terminalWebSocket';
import { claudeChatService } from '../claude/chatService';

export class WebSocketServer {
  private wss: WebSocket.Server;
  private authManager: AuthManager;
  private clients = new Map<string, WebSocket>();
  private terminalHandler: LocalTerminalHandler;
  private gitHandler: GitHandler;

  constructor() {
    const server = createServer();

    // Use noServer mode for path-based routing
    this.wss = new WebSocket.Server({ noServer: true });
    this.authManager = new AuthManager();
    this.terminalHandler = new LocalTerminalHandler(this.send.bind(this));
    this.gitHandler = new GitHandler(this.send.bind(this));

    // Handle HTTP upgrade requests
    server.on('upgrade', (request: IncomingMessage, socket, head) => {
      const clientIp = request.socket.remoteAddress;
      const clientPort = request.socket.remotePort;
      logger.info(`[WS Upgrade] Request from ${clientIp}:${clientPort}, URL: ${request.url}`);

      // Route /terminal to terminal direct WebSocket handler
      if (terminalWebSocketHandler.shouldHandle(request)) {
        logger.info(`[WS Upgrade] Routing to terminal handler`);
        const terminalWss = new WebSocket.Server({ noServer: true });
        terminalWss.handleUpgrade(request, socket, head, (ws) => {
          logger.info(`[WS Upgrade] Terminal upgrade complete`);
          terminalWebSocketHandler.handleConnection(ws, request);
        });
      } else {
        // Default: main WebSocket for JSON-RPC style messages
        logger.info(`[WS Upgrade] Routing to main handler`);
        this.wss.handleUpgrade(request, socket, head, (ws) => {
          logger.info(`[WS Upgrade] Main upgrade complete`);
          this.wss.emit('connection', ws, request);
        });
      }
    });

    this.setupWebSocket();

    server.listen(CONFIG.port, CONFIG.host, () => {
      logger.info(`WebSocket server running on ${CONFIG.host}:${CONFIG.port}`);
      logger.info(`  - Main API: ws://${CONFIG.host}:${CONFIG.port}/`);
      logger.info(`  - Terminal direct: ws://${CONFIG.host}:${CONFIG.port}/terminal`);
    });
  }

  private setupWebSocket() {
    this.wss.on('connection', (ws: WebSocket, request: any) => {
      const clientIp = request?.socket?.remoteAddress || 'unknown';
      logger.info(`[WS Connection] New client from ${clientIp}`);

      ws.on('message', async (data) => {
        try {
          const message: ClientMessage = JSON.parse(data.toString());
          logger.info(`[WS Message] Type: ${message.type}, from ${clientIp}`);
          await this.handleMessage(ws, message);
        } catch (error) {
          logger.error(`[WS Message] Parse error from ${clientIp}:`, error);
          this.sendError(ws, 'Invalid message format');
        }
      });

      ws.on('close', (code, reason) => {
        const clientId = this.getClientId(ws);
        logger.info(`[WS Close] Client ${clientId || 'unknown'} closed with code ${code}, reason: ${reason?.toString() || 'none'}`);
        if (clientId) {
          this.terminalHandler.cleanup(clientId);
          unwatchSession(clientId);
          this.clients.delete(clientId);
        }
      });

      ws.on('error', (error) => {
        logger.error('[WS Error]:', error);
      });
    });
  }

  private async handleMessage(ws: WebSocket, message: ClientMessage) {
    switch (message.type) {
      case 'auth':
        await this.handleAuth(ws, message.token);
        break;
      case 'ping':
        // Heartbeat: respond immediately with pong
        this.send(ws, { type: 'pong', timestamp: (message as any).timestamp });
        break;
      case 'file_tree':
        await this.handleFileTree(ws, message);
        break;
      case 'file_tree_expand':
        await this.handleFileTreeExpand(ws, message as FileTreeExpandMessage);
        break;
      case 'file_read':
        await this.handleFileRead(ws, message);
        break;
      case 'search':
        await this.handleSearch(ws, message);
        break;
      case 'list_workspaces':
        await this.handleListWorkspaces(ws);
        break;
      case 'list_sessions':
        await this.handleListSessions(ws, message);
        break;
      case 'get_session_messages':
        await this.handleGetSessionMessages(ws, message);
        break;
      case 'get_session_messages_page':
        await this.handleGetSessionMessagesPage(ws, message);
        break;
      case 'watch_session':
        await this.handleWatchSession(ws, message);
        break;
      case 'unwatch_session':
        this.handleUnwatchSession(ws);
        break;
      case 'list_subagents':
        await this.handleListSubagents(ws, message);
        break;
      case 'get_subagent_messages':
        await this.handleGetSubagentMessages(ws, message);
        break;
      case 'list_tool_results':
        await this.handleListToolResults(ws, message);
        break;
      case 'get_tool_result_content':
        await this.handleGetToolResultContent(ws, message);
        break;
      case 'get_session_folder_info':
        await this.handleGetSessionFolderInfo(ws, message);
        break;
      case 'send_claude_message':
        await this.handleSendClaudeMessage(ws, message);
        break;
      default:
        const clientId = this.getClientId(ws);
        if (!clientId) {
          this.sendError(ws, 'Not authenticated');
          return;
        }

        // Route terminal messages to terminalHandler
        if (this.terminalHandler.canHandle(message.type)) {
          await this.terminalHandler.handle(ws, clientId, message);
          return;
        }

        // Route Git messages to gitHandler
        if (this.gitHandler.canHandle(message.type)) {
          await this.gitHandler.handle(ws, clientId, message);
          return;
        }

        logger.warn(`Unknown message type: ${message.type}`);
        this.sendError(ws, 'Unknown message type');
    }
  }

  private async handleFileTree(ws: WebSocket, message: ClientMessage) {
    const clientId = this.getClientId(ws);
    if (!clientId) {
      this.sendError(ws, 'Not authenticated');
      return;
    }

    try {
      const path = message.path || process.cwd();
      const maxDepth = message.maxDepth ?? CONFIG.fileTreeMaxDepth;
      const maxNodes = message.maxNodes ?? CONFIG.fileTreeMaxNodes;

      const result = await fileBrowser.generateTree(path, maxDepth, maxNodes);

      this.send(ws, {
        type: 'file_tree_response',
        data: {
          tree: result.tree,
          totalNodes: result.totalNodes,
          truncated: result.truncated,
          accessErrors: result.accessErrors,
          rootPath: path,
        },
      });
    } catch (error) {
      logger.error('Error generating file tree:', error);
      const errorPath = message.path || process.cwd();
      this.send(ws, {
        type: 'file_tree_response',
        data: {
          tree: { name: errorPath.split('/').pop() || '', path: '', type: 'directory', children: [] },
          totalNodes: 0,
          truncated: false,
          accessErrors: [String(error)],
          rootPath: errorPath,
        },
      });
    }
  }

  private async handleFileTreeExpand(ws: WebSocket, message: FileTreeExpandMessage) {
    const clientId = this.getClientId(ws);
    if (!clientId) {
      this.sendError(ws, 'Not authenticated');
      return;
    }

    try {
      const { path, rootPath } = message;
      if (!path) {
        this.sendError(ws, 'Directory path is required');
        return;
      }

      const actualRootPath = rootPath || process.cwd();
      const maxDepth = message.maxDepth ?? 1;
      const maxNodes = message.maxNodes ?? CONFIG.fileTreeExpandMaxNodes;

      const result = await fileBrowser.expandDirectory(
        actualRootPath,
        path,
        maxDepth,
        maxNodes
      );

      this.send(ws, {
        type: 'file_tree_expand_response',
        data: {
          path,
          children: result.tree.children || [],
          hasChildren: result.tree.hasChildren,
          totalNodes: result.totalNodes,
          truncated: result.truncated,
          accessErrors: result.accessErrors,
        },
      });
    } catch (error) {
      logger.error('Error expanding directory:', error);
      this.sendError(ws, `Failed to expand directory: ${error}`);
    }
  }

  private async handleFileRead(ws: WebSocket, message: ClientMessage) {
    const clientId = this.getClientId(ws);
    if (!clientId) {
      this.sendError(ws, 'Not authenticated');
      return;
    }

    try {
      const { path } = message;
      if (!path) {
        this.sendError(ws, 'File path is required');
        return;
      }

      const fileContent = await fileReader.readFile(path);

      this.send(ws, {
        type: 'file_read_response',
        data: fileContent,
      });
    } catch (error) {
      logger.error('Error reading file:', error);
      this.sendError(ws, `Failed to read file: ${error}`);
    }
  }

  private async handleSearch(ws: WebSocket, message: ClientMessage) {
    const clientId = this.getClientId(ws);
    if (!clientId) {
      this.sendError(ws, 'Not authenticated');
      return;
    }

    try {
      const { query, path, options } = message;
      if (!query) {
        this.sendError(ws, 'Search query is required');
        return;
      }

      const searchPath = path || process.cwd();
      const results = await searchService.search(query, searchPath, options);

      this.send(ws, {
        type: 'search_response',
        data: {
          query,
          results,
          count: results.length,
        },
      });
    } catch (error) {
      logger.error('Error searching:', error);
      this.sendError(ws, `Search failed: ${error}`);
    }
  }

  private async handleListWorkspaces(ws: WebSocket) {
    const clientId = this.getClientId(ws);
    if (!clientId) {
      this.sendError(ws, 'Not authenticated');
      return;
    }

    try {
      const workspaces = await listWorkspaces();
      this.send(ws, {
        type: 'list_workspaces_response',
        data: workspaces,
      });
    } catch (error) {
      logger.error('Error listing workspaces:', error);
      this.sendError(ws, `Failed to list workspaces: ${error}`);
    }
  }

  private async handleListSessions(ws: WebSocket, message: ClientMessage) {
    const clientId = this.getClientId(ws);
    if (!clientId) {
      this.sendError(ws, 'Not authenticated');
      return;
    }

    try {
      const { workspace } = message;
      if (!workspace) {
        this.sendError(ws, 'Workspace is required');
        return;
      }

      const sessions = await listSessions(workspace);
      this.send(ws, {
        type: 'list_sessions_response',
        data: sessions,
      });
    } catch (error) {
      logger.error('Error listing sessions:', error);
      this.sendError(ws, `Failed to list sessions: ${error}`);
    }
  }

  private async handleGetSessionMessages(ws: WebSocket, message: ClientMessage) {
    const clientId = this.getClientId(ws);
    if (!clientId) {
      this.sendError(ws, 'Not authenticated');
      return;
    }

    try {
      const { workspace, sessionId } = message;
      if (!workspace || !sessionId) {
        this.sendError(ws, 'Workspace and sessionId are required');
        return;
      }

      const messages = await getSessionMessages(workspace, sessionId);
      this.send(ws, {
        type: 'get_session_messages_response',
        data: messages,
      });
    } catch (error) {
      logger.error('Error getting session messages:', error);
      this.sendError(ws, `Failed to get session messages: ${error}`);
    }
  }

  private async handleGetSessionMessagesPage(ws: WebSocket, message: ClientMessage) {
    const clientId = this.getClientId(ws);
    if (!clientId) {
      this.sendError(ws, 'Not authenticated');
      return;
    }

    try {
      const { workspace, sessionId, limit, beforeIndex } = message as any;
      if (!workspace || !sessionId) {
        this.sendError(ws, 'Workspace and sessionId are required');
        return;
      }

      const page = await getSessionMessagesPage(
        workspace,
        sessionId,
        limit || 50,
        beforeIndex
      );

      const isInitial = beforeIndex === undefined || beforeIndex === null;

      this.send(ws, {
        type: 'get_session_messages_page_response',
        data: {
          messages: page.messages,
          hasMore: page.hasMore,
          oldestIndex: page.oldestIndex,
          totalCount: page.totalCount,
          isInitial,
        },
      });
    } catch (error) {
      logger.error('Error getting session messages page:', error);
      this.sendError(ws, `Failed to get session messages page: ${error}`);
    }
  }

  private async handleWatchSession(ws: WebSocket, message: ClientMessage) {
    const clientId = this.getClientId(ws);
    if (!clientId) {
      this.sendError(ws, 'Not authenticated');
      return;
    }

    try {
      const { workspace, sessionId } = message;
      if (!workspace || !sessionId) {
        this.sendError(ws, 'Workspace and sessionId are required');
        return;
      }

      await watchSession(clientId, workspace, sessionId, (newMessages) => {
        this.send(ws, {
          type: 'session_update',
          data: newMessages,
        });
      });

      this.send(ws, {
        type: 'watch_session_response',
        data: { success: true },
      });
    } catch (error) {
      logger.error('Error watching session:', error);
      this.sendError(ws, `Failed to watch session: ${error}`);
    }
  }

  private handleUnwatchSession(ws: WebSocket) {
    const clientId = this.getClientId(ws);
    if (!clientId) {
      this.sendError(ws, 'Not authenticated');
      return;
    }

    unwatchSession(clientId);
    this.send(ws, {
      type: 'unwatch_session_response',
      data: { success: true },
    });
  }

  private async handleListSubagents(ws: WebSocket, message: ClientMessage) {
    const clientId = this.getClientId(ws);
    if (!clientId) {
      this.sendError(ws, 'Not authenticated');
      return;
    }

    try {
      const { workspace, sessionId } = message;
      if (!workspace || !sessionId) {
        this.sendError(ws, 'Workspace and sessionId are required');
        return;
      }

      const subagents = await listSubagents(workspace, sessionId);
      this.send(ws, {
        type: 'list_subagents_response',
        data: subagents,
      });
    } catch (error) {
      logger.error('Error listing subagents:', error);
      this.sendError(ws, `Failed to list subagents: ${error}`);
    }
  }

  private async handleGetSubagentMessages(ws: WebSocket, message: ClientMessage) {
    const clientId = this.getClientId(ws);
    if (!clientId) {
      this.sendError(ws, 'Not authenticated');
      return;
    }

    try {
      const { workspace, sessionId, agentId } = message;
      if (!workspace || !sessionId || !agentId) {
        this.sendError(ws, 'Workspace, sessionId, and agentId are required');
        return;
      }

      const messages = await getSubagentMessages(workspace, sessionId, agentId);
      this.send(ws, {
        type: 'get_subagent_messages_response',
        data: messages,
      });
    } catch (error) {
      logger.error('Error getting subagent messages:', error);
      this.sendError(ws, `Failed to get subagent messages: ${error}`);
    }
  }

  private async handleListToolResults(ws: WebSocket, message: ClientMessage) {
    const clientId = this.getClientId(ws);
    if (!clientId) {
      this.sendError(ws, 'Not authenticated');
      return;
    }

    try {
      const { workspace, sessionId } = message;
      if (!workspace || !sessionId) {
        this.sendError(ws, 'Workspace and sessionId are required');
        return;
      }

      const results = await listToolResults(workspace, sessionId);
      this.send(ws, {
        type: 'list_tool_results_response',
        data: results,
      });
    } catch (error) {
      logger.error('Error listing tool results:', error);
      this.sendError(ws, `Failed to list tool results: ${error}`);
    }
  }

  private async handleGetToolResultContent(ws: WebSocket, message: ClientMessage) {
    const clientId = this.getClientId(ws);
    if (!clientId) {
      this.sendError(ws, 'Not authenticated');
      return;
    }

    try {
      const { workspace, sessionId, toolUseId } = message;
      if (!workspace || !sessionId || !toolUseId) {
        this.sendError(ws, 'Workspace, sessionId, and toolUseId are required');
        return;
      }

      const content = await getToolResultContent(workspace, sessionId, toolUseId);
      this.send(ws, {
        type: 'get_tool_result_content_response',
        data: { toolUseId, content },
      });
    } catch (error) {
      logger.error('Error getting tool result content:', error);
      this.sendError(ws, `Failed to get tool result content: ${error}`);
    }
  }

  private async handleGetSessionFolderInfo(ws: WebSocket, message: ClientMessage) {
    const clientId = this.getClientId(ws);
    if (!clientId) {
      this.sendError(ws, 'Not authenticated');
      return;
    }

    try {
      const { workspace, sessionId } = message;
      if (!workspace || !sessionId) {
        this.sendError(ws, 'Workspace and sessionId are required');
        return;
      }

      const info = await getSessionFolderInfo(workspace, sessionId);
      this.send(ws, {
        type: 'get_session_folder_info_response',
        data: info,
      });
    } catch (error) {
      logger.error('Error getting session folder info:', error);
      this.sendError(ws, `Failed to get session folder info: ${error}`);
    }
  }

  private async handleSendClaudeMessage(ws: WebSocket, message: ClientMessage) {
    const clientId = this.getClientId(ws);
    if (!clientId) {
      this.sendError(ws, 'Not authenticated');
      return;
    }

    try {
      const { data } = message as any;
      if (!data || !data.workspaceDirName || !data.message) {
        this.sendError(ws, 'workspaceDirName and message are required');
        return;
      }

      const { workspaceDirName, sessionId, newSessionId, message: userMessage, allowedTools } = data;

      // 解码 workspaceDirName 为实际路径
      const cwd = '/' + workspaceDirName.replace(/-/g, '/');

      logger.info(`[SendClaudeMessage] Sending message to Claude CLI`);
      logger.info(`[SendClaudeMessage] CWD: ${cwd}`);
      logger.info(`[SendClaudeMessage] SessionId: ${sessionId || 'none'}`);
      logger.info(`[SendClaudeMessage] NewSessionId: ${newSessionId || 'none'}`);
      if (allowedTools && allowedTools.length > 0) {
        logger.info(`[SendClaudeMessage] AllowedTools: ${allowedTools.join(', ')}`);
      }

      // 调用 chatService 发送消息
      const result = await claudeChatService.sendMessage({
        workspaceDirName,
        sessionId,
        newSessionId,
        message: userMessage,
        cwd,
        allowedTools,
      });

      // 响应客户端
      this.send(ws, {
        type: 'send_claude_message_response',
        data: {
          success: result.success,
          error: result.error,
          sessionId: result.sessionId,
        },
      });

      // 如果成功，响应会通过现有的 watchSession 机制推送
      if (result.success) {
        logger.info(`[SendClaudeMessage] Message sent successfully, responses will be pushed via watchSession`);
      }
    } catch (error) {
      logger.error('Error sending Claude message:', error);
      this.sendError(ws, `Failed to send message: ${error}`);
    }
  }

  private async handleAuth(ws: WebSocket, token: string) {
    logger.info(`[Auth] Validating token: "${token ? '***' : '(empty)'}"`);
    if (this.authManager.validateToken(token)) {
      const clientId = this.authManager.generateClientId();
      this.clients.set(clientId, ws);
      (ws as any).clientId = clientId;

      this.send(ws, {
        type: 'auth_success',
        data: { clientId }
      });

      logger.info(`[Auth] Client ${clientId} authenticated successfully`);
    } else {
      logger.warn(`[Auth] Invalid token rejected`);
      this.sendError(ws, 'Invalid token');
      ws.close();
    }
  }

  private getClientId(ws: WebSocket): string | null {
    return (ws as any).clientId || null;
  }

  public broadcast(message: ServerMessage) {
    const data = JSON.stringify(message);
    let count = 0;
    this.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
        count++;
      }
    });
    if (count > 0) {
      logger.debug(`Broadcast to ${count} clients: ${message.type}`);
    }
  }

  public send(ws: WebSocket, message: ServerMessage) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  public sendError(ws: WebSocket, error: string) {
    this.send(ws, { type: 'error', error });
  }

  public getClientCount(): number {
    return this.clients.size;
  }
}
