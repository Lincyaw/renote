"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CONFIG = void 0;
const dotenv_1 = require("dotenv");
const os_1 = require("os");
(0, dotenv_1.config)();
exports.CONFIG = {
    host: process.env.HOST || '0.0.0.0',
    port: parseInt(process.env.PORT || '8080'),
    authToken: process.env.AUTH_TOKEN || '',
    claudeHome: process.env.CLAUDE_HOME || `${(0, os_1.homedir)()}/.claude`,
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'),
    searchTimeout: parseInt(process.env.SEARCH_TIMEOUT || '5000'),
    logLevel: process.env.LOG_LEVEL || 'info',
};
if (!exports.CONFIG.authToken) {
    console.warn('WARNING: AUTH_TOKEN not set. Generate: openssl rand -hex 32');
}
