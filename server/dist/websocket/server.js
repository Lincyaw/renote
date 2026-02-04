"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketServer = void 0;
const ws_1 = __importDefault(require("ws"));
const http_1 = require("http");
const config_1 = require("../config");
const logger_1 = require("../utils/logger");
const auth_1 = require("./auth");
const browser_1 = require("../files/browser");
const reader_1 = require("../files/reader");
const search_1 = require("../files/search");
const sessionBrowser_1 = require("../claude/sessionBrowser");
const terminal_1 = require("../terminal");
const git_1 = require("../git");
const terminalWebSocket_1 = require("../terminal/terminalWebSocket");
const chatService_1 = require("../claude/chatService");
class WebSocketServer {
    constructor() {
        this.clients = new Map();
        const server = (0, http_1.createServer)();
        // Use noServer mode for path-based routing
        this.wss = new ws_1.default.Server({ noServer: true });
        this.authManager = new auth_1.AuthManager();
        this.terminalHandler = new terminal_1.LocalTerminalHandler(this.send.bind(this));
        this.gitHandler = new git_1.GitHandler(this.send.bind(this));
        // Handle HTTP upgrade requests
        server.on('upgrade', (request, socket, head) => {
            const clientIp = request.socket.remoteAddress;
            const clientPort = request.socket.remotePort;
            logger_1.logger.info(`[WS Upgrade] Request from ${clientIp}:${clientPort}, URL: ${request.url}`);
            // Route /terminal to terminal direct WebSocket handler
            if (terminalWebSocket_1.terminalWebSocketHandler.shouldHandle(request)) {
                logger_1.logger.info(`[WS Upgrade] Routing to terminal handler`);
                const terminalWss = new ws_1.default.Server({ noServer: true });
                terminalWss.handleUpgrade(request, socket, head, (ws) => {
                    logger_1.logger.info(`[WS Upgrade] Terminal upgrade complete`);
                    terminalWebSocket_1.terminalWebSocketHandler.handleConnection(ws, request);
                });
            }
            else {
                // Default: main WebSocket for JSON-RPC style messages
                logger_1.logger.info(`[WS Upgrade] Routing to main handler`);
                this.wss.handleUpgrade(request, socket, head, (ws) => {
                    logger_1.logger.info(`[WS Upgrade] Main upgrade complete`);
                    this.wss.emit('connection', ws, request);
                });
            }
        });
        this.setupWebSocket();
        server.listen(config_1.CONFIG.port, config_1.CONFIG.host, () => {
            logger_1.logger.info(`WebSocket server running on ${config_1.CONFIG.host}:${config_1.CONFIG.port}`);
            logger_1.logger.info(`  - Main API: ws://${config_1.CONFIG.host}:${config_1.CONFIG.port}/`);
            logger_1.logger.info(`  - Terminal direct: ws://${config_1.CONFIG.host}:${config_1.CONFIG.port}/terminal`);
        });
    }
    setupWebSocket() {
        this.wss.on('connection', (ws, request) => {
            const clientIp = request?.socket?.remoteAddress || 'unknown';
            logger_1.logger.info(`[WS Connection] New client from ${clientIp}`);
            ws.on('message', async (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    logger_1.logger.info(`[WS Message] Type: ${message.type}, from ${clientIp}`);
                    await this.handleMessage(ws, message);
                }
                catch (error) {
                    logger_1.logger.error(`[WS Message] Parse error from ${clientIp}:`, error);
                    this.sendError(ws, 'Invalid message format');
                }
            });
            ws.on('close', (code, reason) => {
                const clientId = this.getClientId(ws);
                logger_1.logger.info(`[WS Close] Client ${clientId || 'unknown'} closed with code ${code}, reason: ${reason?.toString() || 'none'}`);
                if (clientId) {
                    this.terminalHandler.cleanup(clientId);
                    (0, sessionBrowser_1.unwatchSession)(clientId);
                    this.clients.delete(clientId);
                }
            });
            ws.on('error', (error) => {
                logger_1.logger.error('[WS Error]:', error);
            });
        });
    }
    async handleMessage(ws, message) {
        switch (message.type) {
            case 'auth':
                await this.handleAuth(ws, message.token);
                break;
            case 'ping':
                // Heartbeat: respond immediately with pong
                this.send(ws, { type: 'pong', timestamp: message.timestamp });
                break;
            case 'file_tree':
                await this.handleFileTree(ws, message);
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
                logger_1.logger.warn(`Unknown message type: ${message.type}`);
                this.sendError(ws, 'Unknown message type');
        }
    }
    async handleFileTree(ws, message) {
        const clientId = this.getClientId(ws);
        if (!clientId) {
            this.sendError(ws, 'Not authenticated');
            return;
        }
        try {
            const path = message.path || process.cwd();
            const tree = await browser_1.fileBrowser.generateTree(path);
            this.send(ws, {
                type: 'file_tree_response',
                data: tree,
            });
        }
        catch (error) {
            logger_1.logger.error('Error generating file tree:', error);
            this.sendError(ws, `Failed to generate file tree: ${error}`);
        }
    }
    async handleFileRead(ws, message) {
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
            const fileContent = await reader_1.fileReader.readFile(path);
            this.send(ws, {
                type: 'file_read_response',
                data: fileContent,
            });
        }
        catch (error) {
            logger_1.logger.error('Error reading file:', error);
            this.sendError(ws, `Failed to read file: ${error}`);
        }
    }
    async handleSearch(ws, message) {
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
            const results = await search_1.searchService.search(query, searchPath, options);
            this.send(ws, {
                type: 'search_response',
                data: {
                    query,
                    results,
                    count: results.length,
                },
            });
        }
        catch (error) {
            logger_1.logger.error('Error searching:', error);
            this.sendError(ws, `Search failed: ${error}`);
        }
    }
    async handleListWorkspaces(ws) {
        const clientId = this.getClientId(ws);
        if (!clientId) {
            this.sendError(ws, 'Not authenticated');
            return;
        }
        try {
            const workspaces = await (0, sessionBrowser_1.listWorkspaces)();
            this.send(ws, {
                type: 'list_workspaces_response',
                data: workspaces,
            });
        }
        catch (error) {
            logger_1.logger.error('Error listing workspaces:', error);
            this.sendError(ws, `Failed to list workspaces: ${error}`);
        }
    }
    async handleListSessions(ws, message) {
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
            const sessions = await (0, sessionBrowser_1.listSessions)(workspace);
            this.send(ws, {
                type: 'list_sessions_response',
                data: sessions,
            });
        }
        catch (error) {
            logger_1.logger.error('Error listing sessions:', error);
            this.sendError(ws, `Failed to list sessions: ${error}`);
        }
    }
    async handleGetSessionMessages(ws, message) {
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
            const messages = await (0, sessionBrowser_1.getSessionMessages)(workspace, sessionId);
            this.send(ws, {
                type: 'get_session_messages_response',
                data: messages,
            });
        }
        catch (error) {
            logger_1.logger.error('Error getting session messages:', error);
            this.sendError(ws, `Failed to get session messages: ${error}`);
        }
    }
    async handleGetSessionMessagesPage(ws, message) {
        const clientId = this.getClientId(ws);
        if (!clientId) {
            this.sendError(ws, 'Not authenticated');
            return;
        }
        try {
            const { workspace, sessionId, limit, beforeIndex } = message;
            if (!workspace || !sessionId) {
                this.sendError(ws, 'Workspace and sessionId are required');
                return;
            }
            const page = await (0, sessionBrowser_1.getSessionMessagesPage)(workspace, sessionId, limit || 50, beforeIndex);
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
        }
        catch (error) {
            logger_1.logger.error('Error getting session messages page:', error);
            this.sendError(ws, `Failed to get session messages page: ${error}`);
        }
    }
    async handleWatchSession(ws, message) {
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
            await (0, sessionBrowser_1.watchSession)(clientId, workspace, sessionId, (newMessages) => {
                this.send(ws, {
                    type: 'session_update',
                    data: newMessages,
                });
            });
            this.send(ws, {
                type: 'watch_session_response',
                data: { success: true },
            });
        }
        catch (error) {
            logger_1.logger.error('Error watching session:', error);
            this.sendError(ws, `Failed to watch session: ${error}`);
        }
    }
    handleUnwatchSession(ws) {
        const clientId = this.getClientId(ws);
        if (!clientId) {
            this.sendError(ws, 'Not authenticated');
            return;
        }
        (0, sessionBrowser_1.unwatchSession)(clientId);
        this.send(ws, {
            type: 'unwatch_session_response',
            data: { success: true },
        });
    }
    async handleListSubagents(ws, message) {
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
            const subagents = await (0, sessionBrowser_1.listSubagents)(workspace, sessionId);
            this.send(ws, {
                type: 'list_subagents_response',
                data: subagents,
            });
        }
        catch (error) {
            logger_1.logger.error('Error listing subagents:', error);
            this.sendError(ws, `Failed to list subagents: ${error}`);
        }
    }
    async handleGetSubagentMessages(ws, message) {
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
            const messages = await (0, sessionBrowser_1.getSubagentMessages)(workspace, sessionId, agentId);
            this.send(ws, {
                type: 'get_subagent_messages_response',
                data: messages,
            });
        }
        catch (error) {
            logger_1.logger.error('Error getting subagent messages:', error);
            this.sendError(ws, `Failed to get subagent messages: ${error}`);
        }
    }
    async handleListToolResults(ws, message) {
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
            const results = await (0, sessionBrowser_1.listToolResults)(workspace, sessionId);
            this.send(ws, {
                type: 'list_tool_results_response',
                data: results,
            });
        }
        catch (error) {
            logger_1.logger.error('Error listing tool results:', error);
            this.sendError(ws, `Failed to list tool results: ${error}`);
        }
    }
    async handleGetToolResultContent(ws, message) {
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
            const content = await (0, sessionBrowser_1.getToolResultContent)(workspace, sessionId, toolUseId);
            this.send(ws, {
                type: 'get_tool_result_content_response',
                data: { toolUseId, content },
            });
        }
        catch (error) {
            logger_1.logger.error('Error getting tool result content:', error);
            this.sendError(ws, `Failed to get tool result content: ${error}`);
        }
    }
    async handleGetSessionFolderInfo(ws, message) {
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
            const info = await (0, sessionBrowser_1.getSessionFolderInfo)(workspace, sessionId);
            this.send(ws, {
                type: 'get_session_folder_info_response',
                data: info,
            });
        }
        catch (error) {
            logger_1.logger.error('Error getting session folder info:', error);
            this.sendError(ws, `Failed to get session folder info: ${error}`);
        }
    }
    async handleSendClaudeMessage(ws, message) {
        const clientId = this.getClientId(ws);
        if (!clientId) {
            this.sendError(ws, 'Not authenticated');
            return;
        }
        try {
            const { data } = message;
            if (!data || !data.workspaceDirName || !data.message) {
                this.sendError(ws, 'workspaceDirName and message are required');
                return;
            }
            const { workspaceDirName, sessionId, newSessionId, message: userMessage, allowedTools } = data;
            // 解码 workspaceDirName 为实际路径
            const cwd = '/' + workspaceDirName.replace(/-/g, '/');
            logger_1.logger.info(`[SendClaudeMessage] Sending message to Claude CLI`);
            logger_1.logger.info(`[SendClaudeMessage] CWD: ${cwd}`);
            logger_1.logger.info(`[SendClaudeMessage] SessionId: ${sessionId || 'none'}`);
            logger_1.logger.info(`[SendClaudeMessage] NewSessionId: ${newSessionId || 'none'}`);
            if (allowedTools && allowedTools.length > 0) {
                logger_1.logger.info(`[SendClaudeMessage] AllowedTools: ${allowedTools.join(', ')}`);
            }
            // 调用 chatService 发送消息
            const result = await chatService_1.claudeChatService.sendMessage({
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
                logger_1.logger.info(`[SendClaudeMessage] Message sent successfully, responses will be pushed via watchSession`);
            }
        }
        catch (error) {
            logger_1.logger.error('Error sending Claude message:', error);
            this.sendError(ws, `Failed to send message: ${error}`);
        }
    }
    async handleAuth(ws, token) {
        logger_1.logger.info(`[Auth] Validating token: "${token ? '***' : '(empty)'}"`);
        if (this.authManager.validateToken(token)) {
            const clientId = this.authManager.generateClientId();
            this.clients.set(clientId, ws);
            ws.clientId = clientId;
            this.send(ws, {
                type: 'auth_success',
                data: { clientId }
            });
            logger_1.logger.info(`[Auth] Client ${clientId} authenticated successfully`);
        }
        else {
            logger_1.logger.warn(`[Auth] Invalid token rejected`);
            this.sendError(ws, 'Invalid token');
            ws.close();
        }
    }
    getClientId(ws) {
        return ws.clientId || null;
    }
    broadcast(message) {
        const data = JSON.stringify(message);
        let count = 0;
        this.clients.forEach((ws) => {
            if (ws.readyState === ws_1.default.OPEN) {
                ws.send(data);
                count++;
            }
        });
        if (count > 0) {
            logger_1.logger.debug(`Broadcast to ${count} clients: ${message.type}`);
        }
    }
    send(ws, message) {
        if (ws.readyState === ws_1.default.OPEN) {
            ws.send(JSON.stringify(message));
        }
    }
    sendError(ws, error) {
        this.send(ws, { type: 'error', error });
    }
    getClientCount() {
        return this.clients.size;
    }
}
exports.WebSocketServer = WebSocketServer;
