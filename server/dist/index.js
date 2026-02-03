#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const server_1 = require("./websocket/server");
const watcher_1 = require("./claude/watcher");
const server_2 = require("./http/server");
const logger_1 = require("./utils/logger");
class RemoteDevServer {
    constructor() {
        this.wsServer = new server_1.WebSocketServer();
        this.claudeWatcher = new watcher_1.ClaudeWatcher();
        (0, server_2.createHttpServer)();
        this.setupClaudeWatcher();
    }
    setupClaudeWatcher() {
        this.claudeWatcher.on('user_input', (data) => {
            this.wsServer.broadcast({
                type: 'claude_user_input',
                data
            });
        });
        this.claudeWatcher.on('assistant_message', (data) => {
            this.wsServer.broadcast({
                type: 'claude_assistant_message',
                data
            });
        });
        this.claudeWatcher.on('tool_call', (data) => {
            this.wsServer.broadcast({
                type: 'claude_tool_call',
                data
            });
        });
        this.claudeWatcher.on('tool_result', (data) => {
            this.wsServer.broadcast({
                type: 'claude_tool_result',
                data
            });
        });
        this.claudeWatcher.on('file_change', (data) => {
            this.wsServer.broadcast({
                type: 'claude_file_change',
                data
            });
        });
        this.claudeWatcher.on('progress', (data) => {
            this.wsServer.broadcast({
                type: 'claude_progress',
                data
            });
        });
    }
    async start() {
        logger_1.logger.info('Starting Remote Dev Server');
        await this.claudeWatcher.start();
        logger_1.logger.info('Server ready');
    }
    stop() {
        logger_1.logger.info('Stopping Remote Dev Server');
        this.claudeWatcher.stop();
    }
}
const server = new RemoteDevServer();
server.start().catch((error) => {
    logger_1.logger.error('Failed to start server:', error);
    process.exit(1);
});
process.on('SIGINT', () => {
    logger_1.logger.info('Received SIGINT, shutting down');
    server.stop();
    process.exit(0);
});
process.on('SIGTERM', () => {
    logger_1.logger.info('Received SIGTERM, shutting down');
    server.stop();
    process.exit(0);
});
