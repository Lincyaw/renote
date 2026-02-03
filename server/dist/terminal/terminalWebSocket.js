"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.terminalWebSocketHandler = exports.TerminalWebSocketHandler = void 0;
const ws_1 = __importDefault(require("ws"));
const url_1 = require("url");
const localTerminalManager_1 = require("./localTerminalManager");
const auth_1 = require("../websocket/auth");
const logger_1 = require("../utils/logger");
class TerminalWebSocketHandler {
    constructor() {
        // Map from WebSocket to sessionId for cleanup
        this.wsToSession = new Map();
        this.authManager = new auth_1.AuthManager();
    }
    /**
     * Check if a request should be handled by this handler
     */
    shouldHandle(request) {
        try {
            const url = new url_1.URL(request.url || '', `http://${request.headers.host}`);
            return url.pathname === '/terminal';
        }
        catch {
            return false;
        }
    }
    /**
     * Handle a new terminal WebSocket connection
     */
    handleConnection(ws, request) {
        try {
            const url = new url_1.URL(request.url || '', `http://${request.headers.host}`);
            const token = url.searchParams.get('token') || '';
            const sessionId = url.searchParams.get('sessionId');
            const type = (url.searchParams.get('type') || 'shell');
            const cols = parseInt(url.searchParams.get('cols') || '80', 10);
            const rows = parseInt(url.searchParams.get('rows') || '24', 10);
            // Validate token
            if (!this.authManager.validateToken(token)) {
                logger_1.logger.warn('Terminal WebSocket: invalid token');
                ws.close(4001, 'Invalid token');
                return;
            }
            if (!sessionId) {
                logger_1.logger.warn('Terminal WebSocket: missing sessionId');
                ws.close(4002, 'Missing sessionId');
                return;
            }
            // Generate a unique client ID for this connection
            const clientId = this.authManager.generateClientId();
            this.wsToSession.set(ws, { clientId, sessionId });
            logger_1.logger.info(`Terminal WebSocket connected: clientId=${clientId}, sessionId=${sessionId}, type=${type}, ${cols}x${rows}`);
            const connection = localTerminalManager_1.localTerminalManager.getOrCreateConnection(clientId);
            const options = { type, cols, rows };
            const success = connection.startTerminal(sessionId, (data) => {
                // Send terminal output as text frame
                if (ws.readyState === ws_1.default.OPEN) {
                    ws.send(data);
                }
            }, () => {
                // Terminal closed
                if (ws.readyState === ws_1.default.OPEN) {
                    ws.close(1000, 'Terminal closed');
                }
            }, options);
            if (!success) {
                logger_1.logger.error(`Failed to start terminal: sessionId=${sessionId}`);
                ws.close(4003, 'Failed to start terminal');
                return;
            }
            // Handle incoming messages
            ws.on('message', (data, isBinary) => {
                if (isBinary) {
                    // Binary frame = control message
                    this.handleControlMessage(ws, clientId, sessionId, data);
                }
                else {
                    // Text frame = terminal input
                    connection.writeToTerminal(sessionId, data.toString());
                }
            });
            ws.on('close', () => {
                logger_1.logger.info(`Terminal WebSocket closed: clientId=${clientId}, sessionId=${sessionId}`);
                // Detach but don't kill the zellij session
                connection.closeTerminal(sessionId, false);
                localTerminalManager_1.localTerminalManager.removeConnection(clientId, false);
                this.wsToSession.delete(ws);
            });
            ws.on('error', (error) => {
                logger_1.logger.error(`Terminal WebSocket error: ${error.message}`);
            });
        }
        catch (error) {
            logger_1.logger.error('Terminal WebSocket connection error:', error);
            ws.close(4000, 'Connection error');
        }
    }
    handleControlMessage(ws, clientId, sessionId, data) {
        try {
            const message = JSON.parse(data.toString());
            switch (message.type) {
                case 'resize':
                    if (message.cols && message.rows) {
                        const connection = localTerminalManager_1.localTerminalManager.getConnection(clientId);
                        if (connection) {
                            connection.resizeTerminal(sessionId, message.cols, message.rows);
                            logger_1.logger.debug(`Terminal resized: ${sessionId} -> ${message.cols}x${message.rows}`);
                        }
                    }
                    break;
                case 'ping':
                    // Respond with pong as binary frame
                    ws.send(Buffer.from(JSON.stringify({ type: 'pong' })));
                    break;
                default:
                    logger_1.logger.warn(`Unknown control message type: ${message.type}`);
            }
        }
        catch (error) {
            logger_1.logger.error('Failed to parse control message:', error);
        }
    }
}
exports.TerminalWebSocketHandler = TerminalWebSocketHandler;
exports.terminalWebSocketHandler = new TerminalWebSocketHandler();
