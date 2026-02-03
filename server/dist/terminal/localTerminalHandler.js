"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalTerminalHandler = void 0;
const localTerminalManager_1 = require("./localTerminalManager");
const logger_1 = require("../utils/logger");
class LocalTerminalHandler {
    constructor(sendFn) {
        this.sendFn = sendFn;
    }
    canHandle(messageType) {
        return messageType.startsWith('terminal_');
    }
    async handle(ws, clientId, message) {
        switch (message.type) {
            case 'terminal_start':
                await this.handleStart(ws, clientId, message);
                break;
            case 'terminal_input':
                this.handleInput(clientId, message);
                break;
            case 'terminal_resize':
                this.handleResize(clientId, message);
                break;
            case 'terminal_close':
                this.handleClose(ws, clientId, message);
                break;
            case 'terminal_list':
                this.handleList(ws, clientId);
                break;
            default:
                logger_1.logger.warn(`Unknown terminal message type: ${message.type}`);
        }
    }
    async handleStart(ws, clientId, message) {
        const { sessionId, type, cwd, cols, rows, claudeArgs } = message.data || {};
        if (!sessionId) {
            this.sendFn(ws, {
                type: 'terminal_start_response',
                data: { success: false, message: 'sessionId is required' },
            });
            return;
        }
        const terminalType = type === 'claude' ? 'claude' : 'shell';
        const options = {
            type: terminalType,
            cwd,
            cols,
            rows,
            claudeArgs,
        };
        const connection = localTerminalManager_1.localTerminalManager.getOrCreateConnection(clientId);
        const success = connection.startTerminal(sessionId, (data) => {
            // Send terminal output to client
            this.sendFn(ws, {
                type: 'terminal_output',
                data: { sessionId, output: data },
            });
        }, () => {
            // Notify client when terminal closes
            this.sendFn(ws, {
                type: 'terminal_closed',
                data: { sessionId },
            });
        }, options);
        this.sendFn(ws, {
            type: 'terminal_start_response',
            data: {
                success,
                sessionId,
                terminalType,
                message: success ? 'Terminal started' : 'Failed to start terminal',
            },
        });
    }
    handleInput(clientId, message) {
        const { sessionId, input } = message.data || {};
        if (!sessionId || input === undefined) {
            logger_1.logger.warn('Invalid terminal_input message: missing sessionId or input');
            return;
        }
        const connection = localTerminalManager_1.localTerminalManager.getConnection(clientId);
        if (!connection) {
            logger_1.logger.warn(`No terminal connection for client ${clientId}`);
            return;
        }
        connection.writeToTerminal(sessionId, input);
    }
    handleResize(clientId, message) {
        const { sessionId, cols, rows } = message.data || {};
        if (!sessionId || !cols || !rows) {
            logger_1.logger.warn('Invalid terminal_resize message');
            return;
        }
        const connection = localTerminalManager_1.localTerminalManager.getConnection(clientId);
        if (!connection) {
            logger_1.logger.warn(`No terminal connection for client ${clientId}`);
            return;
        }
        connection.resizeTerminal(sessionId, cols, rows);
    }
    handleClose(ws, clientId, message) {
        const { sessionId, kill } = message.data || {};
        if (!sessionId) {
            logger_1.logger.warn('Invalid terminal_close message: missing sessionId');
            return;
        }
        let success = false;
        const connection = localTerminalManager_1.localTerminalManager.getConnection(clientId);
        if (connection) {
            // kill=true will also kill the zellij session; default is just detach
            success = connection.closeTerminal(sessionId, kill === true);
        }
        else if (kill) {
            // No connection found, but user wants to kill - try direct kill by sessionId
            // This handles the case where terminal was created via /terminal direct WebSocket
            success = localTerminalManager_1.ZellijTerminalConnection.killSessionById(sessionId);
            logger_1.logger.info(`Direct kill for session ${sessionId}: ${success}`);
        }
        this.sendFn(ws, {
            type: 'terminal_close_response',
            data: { success, sessionId },
        });
    }
    handleList(ws, clientId) {
        const connection = localTerminalManager_1.localTerminalManager.getConnection(clientId);
        const terminals = connection ? connection.getActiveTerminals() : [];
        const terminalInfos = terminals.map((id) => {
            const info = connection?.getTerminalInfo(id);
            return {
                sessionId: id,
                type: info?.type || 'shell',
                createdAt: info?.createdAt || 0,
            };
        });
        this.sendFn(ws, {
            type: 'terminal_list_response',
            data: { terminals: terminalInfos },
        });
    }
    cleanup(clientId) {
        localTerminalManager_1.localTerminalManager.removeConnection(clientId);
    }
}
exports.LocalTerminalHandler = LocalTerminalHandler;
