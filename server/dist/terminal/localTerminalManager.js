"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalTerminalConnection = exports.localTerminalManager = exports.ZellijTerminalConnection = void 0;
const pty = __importStar(require("node-pty"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const child_process_1 = require("child_process");
const logger_1 = require("../utils/logger");
/**
 * Find the full path to a command
 */
function findCommand(cmd) {
    const home = process.env.HOME || '';
    const additionalPaths = [
        path.join(home, '.local', 'bin'),
        path.join(home, '.npm-global', 'bin'),
        path.join(home, 'bin'),
        '/usr/local/bin',
        '/opt/homebrew/bin',
    ];
    for (const dir of additionalPaths) {
        const fullPath = path.join(dir, cmd);
        if (fs.existsSync(fullPath)) {
            return fullPath;
        }
    }
    return null;
}
/**
 * Get extended PATH
 */
function getExtendedPath() {
    const home = process.env.HOME || '';
    const currentPath = process.env.PATH || '';
    const additionalPaths = [
        path.join(home, '.local', 'bin'),
        path.join(home, '.npm-global', 'bin'),
        path.join(home, 'bin'),
        '/opt/homebrew/bin',
        '/usr/local/bin',
    ];
    return [...additionalPaths, currentPath].join(':');
}
/**
 * Check if zellij is available
 */
function isZellijAvailable() {
    try {
        (0, child_process_1.execSync)('which zellij', { stdio: 'ignore' });
        return true;
    }
    catch {
        return false;
    }
}
/**
 * List existing zellij sessions
 */
function listZellijSessions() {
    try {
        const output = (0, child_process_1.execSync)('zellij list-sessions -s 2>/dev/null || true', {
            encoding: 'utf-8',
            env: { ...process.env, PATH: getExtendedPath() },
        });
        return output.trim().split('\n').filter(s => s.length > 0);
    }
    catch {
        return [];
    }
}
/**
 * Kill a zellij session
 */
function killZellijSession(sessionName) {
    try {
        (0, child_process_1.execSync)(`zellij kill-session ${sessionName} 2>/dev/null || true`, {
            env: { ...process.env, PATH: getExtendedPath() },
        });
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Manages zellij-backed terminal sessions for a client
 */
class ZellijTerminalConnection {
    constructor(clientId) {
        this.sessions = new Map();
        this.dataCallbacks = new Map();
        this.closeCallbacks = new Map();
        this.clientId = clientId;
        this.zellijAvailable = isZellijAvailable();
        if (this.zellijAvailable) {
            logger_1.logger.info('Zellij is available, using zellij-backed sessions');
        }
        else {
            logger_1.logger.warn('Zellij not found, falling back to plain PTY');
        }
    }
    /**
     * Generate a unique zellij session name
     */
    generateSessionName(sessionId, type) {
        // Use a prefix to identify our sessions
        return `renote-${type}-${sessionId.replace(/[^a-zA-Z0-9]/g, '-')}`;
    }
    /**
     * Check if a session exists
     */
    hasTerminal(sessionId) {
        return this.sessions.has(sessionId);
    }
    /**
     * Rebind callbacks for reconnection
     */
    rebindCallbacks(sessionId, onData, onClose) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return false;
        }
        this.dataCallbacks.set(sessionId, onData);
        this.closeCallbacks.set(sessionId, onClose);
        // If PTY process exists and is running, we're good
        if (session.ptyProcess) {
            logger_1.logger.info(`Rebound callbacks for session ${sessionId}`);
            return true;
        }
        // PTY was closed but zellij session might still exist - reattach
        if (this.zellijAvailable) {
            const zellijName = this.generateSessionName(sessionId, session.type);
            const existingSessions = listZellijSessions();
            if (existingSessions.includes(zellijName)) {
                logger_1.logger.info(`Reattaching to existing zellij session ${zellijName}`);
                return this.attachToZellijSession(sessionId, session.type, onData, onClose);
            }
        }
        return false;
    }
    /**
     * Attach to an existing or new zellij session
     */
    attachToZellijSession(sessionId, type, onData, onClose, options) {
        const zellijName = this.generateSessionName(sessionId, type);
        const cols = options?.cols || 80;
        const rows = options?.rows || 24;
        const cwd = options?.cwd || process.env.HOME || process.cwd();
        try {
            // zellij attach -c will create if not exists
            const ptyProcess = pty.spawn('zellij', ['attach', '-c', zellijName], {
                name: 'xterm-256color',
                cols,
                rows,
                cwd,
                env: {
                    ...process.env,
                    PATH: getExtendedPath(),
                    TERM: 'xterm-256color',
                    COLORTERM: 'truecolor',
                },
            });
            this.setupPtyHandlers(sessionId, ptyProcess, onData, onClose);
            const session = this.sessions.get(sessionId);
            if (session) {
                session.ptyProcess = ptyProcess;
            }
            else {
                this.sessions.set(sessionId, {
                    name: zellijName,
                    type,
                    createdAt: Date.now(),
                    ptyProcess,
                });
            }
            logger_1.logger.info(`Attached to zellij session ${zellijName} (${cols}x${rows})`);
            return true;
        }
        catch (error) {
            logger_1.logger.error(`Failed to attach to zellij session ${zellijName}:`, error);
            return false;
        }
    }
    /**
     * Setup PTY event handlers
     */
    setupPtyHandlers(sessionId, ptyProcess, onData, onClose) {
        this.dataCallbacks.set(sessionId, onData);
        this.closeCallbacks.set(sessionId, onClose);
        ptyProcess.onData((data) => {
            const callback = this.dataCallbacks.get(sessionId);
            if (callback) {
                callback(data);
            }
        });
        ptyProcess.onExit(({ exitCode, signal }) => {
            logger_1.logger.info(`PTY for session ${sessionId} exited with code ${exitCode}, signal ${signal}`);
            const session = this.sessions.get(sessionId);
            if (session) {
                session.ptyProcess = null;
            }
            // Note: Don't remove the session - zellij session is still running
            // Only call close callback if client needs to know
            const callback = this.closeCallbacks.get(sessionId);
            if (callback) {
                callback();
            }
        });
    }
    /**
     * Start a new terminal session
     */
    startTerminal(sessionId, onData, onClose, options = { type: 'shell' }) {
        // Check if session already exists
        if (this.sessions.has(sessionId)) {
            return this.rebindCallbacks(sessionId, onData, onClose);
        }
        const type = options.type;
        if (this.zellijAvailable) {
            // Create zellij session
            const zellijName = this.generateSessionName(sessionId, type);
            this.sessions.set(sessionId, {
                name: zellijName,
                type,
                createdAt: Date.now(),
                ptyProcess: null,
            });
            // Attach to zellij session
            const attached = this.attachToZellijSession(sessionId, type, onData, onClose, options);
            if (!attached) {
                this.sessions.delete(sessionId);
                return false;
            }
            // If claude type, run claude command inside zellij
            if (type === 'claude') {
                setTimeout(() => {
                    const claudePath = findCommand('claude') || 'claude';
                    const args = options.claudeArgs?.join(' ') || '';
                    this.writeToTerminal(sessionId, `${claudePath} ${args}\n`);
                }, 500);
            }
            return true;
        }
        else {
            // Fallback to plain PTY
            return this.startPlainPty(sessionId, onData, onClose, options);
        }
    }
    /**
     * Fallback: start plain PTY without zellij
     */
    startPlainPty(sessionId, onData, onClose, options) {
        const cols = options.cols || 80;
        const rows = options.rows || 24;
        const cwd = options.cwd || process.env.HOME || process.cwd();
        let command;
        let args;
        if (options.type === 'claude') {
            const claudePath = findCommand('claude');
            command = claudePath || 'claude';
            args = options.claudeArgs || [];
        }
        else {
            command = process.env.SHELL || (os.platform() === 'win32' ? 'powershell.exe' : 'bash');
            args = [];
        }
        try {
            const ptyProcess = pty.spawn(command, args, {
                name: 'xterm-256color',
                cols,
                rows,
                cwd,
                env: {
                    ...process.env,
                    PATH: getExtendedPath(),
                    TERM: 'xterm-256color',
                    COLORTERM: 'truecolor',
                },
            });
            this.sessions.set(sessionId, {
                name: sessionId,
                type: options.type,
                createdAt: Date.now(),
                ptyProcess,
            });
            this.setupPtyHandlers(sessionId, ptyProcess, onData, onClose);
            logger_1.logger.info(`Started plain PTY ${options.type} session ${sessionId} (${cols}x${rows})`);
            return true;
        }
        catch (error) {
            logger_1.logger.error(`Failed to start plain PTY ${sessionId}:`, error);
            return false;
        }
    }
    /**
     * Write to terminal
     */
    writeToTerminal(sessionId, data) {
        const session = this.sessions.get(sessionId);
        if (!session || !session.ptyProcess) {
            logger_1.logger.warn(`Terminal ${sessionId} not found or not attached`);
            return false;
        }
        session.ptyProcess.write(data);
        return true;
    }
    /**
     * Resize terminal
     */
    resizeTerminal(sessionId, cols, rows) {
        const session = this.sessions.get(sessionId);
        if (!session || !session.ptyProcess) {
            logger_1.logger.warn(`Terminal ${sessionId} not found for resize`);
            return false;
        }
        session.ptyProcess.resize(cols, rows);
        logger_1.logger.debug(`Resized terminal ${sessionId} to ${cols}x${rows}`);
        return true;
    }
    /**
     * Close terminal (detach from zellij, but don't kill the session)
     */
    closeTerminal(sessionId, killSession = false) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            logger_1.logger.warn(`Terminal ${sessionId} not found for close`);
            return false;
        }
        // Kill the PTY (detach from zellij)
        if (session.ptyProcess) {
            session.ptyProcess.kill();
            session.ptyProcess = null;
        }
        // Optionally kill the zellij session too
        if (killSession && this.zellijAvailable) {
            killZellijSession(session.name);
            logger_1.logger.info(`Killed zellij session ${session.name}`);
        }
        this.sessions.delete(sessionId);
        this.dataCallbacks.delete(sessionId);
        this.closeCallbacks.delete(sessionId);
        logger_1.logger.info(`Closed terminal ${sessionId}${killSession ? ' (session killed)' : ' (session preserved)'}`);
        return true;
    }
    /**
     * Get list of active terminals
     */
    getActiveTerminals() {
        return Array.from(this.sessions.keys());
    }
    /**
     * Get terminal info
     */
    getTerminalInfo(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session)
            return null;
        return {
            type: session.type,
            createdAt: session.createdAt,
            zellijSession: this.zellijAvailable ? session.name : undefined,
        };
    }
    /**
     * Close all terminals
     */
    closeAll(killSessions = false) {
        for (const [sessionId] of this.sessions) {
            this.closeTerminal(sessionId, killSessions);
        }
    }
    /**
     * List all zellij sessions managed by this server
     */
    static listManagedSessions() {
        return listZellijSessions().filter(s => s.startsWith('renote-'));
    }
    /**
     * Kill a zellij session by sessionId (without needing a connection)
     * Tries both shell and claude session names
     */
    static killSessionById(sessionId) {
        const sanitized = sessionId.replace(/[^a-zA-Z0-9]/g, '-');
        const shellName = `renote-shell-${sanitized}`;
        const claudeName = `renote-claude-${sanitized}`;
        let killed = false;
        const existingSessions = listZellijSessions();
        if (existingSessions.includes(shellName)) {
            killed = killZellijSession(shellName) || killed;
        }
        if (existingSessions.includes(claudeName)) {
            killed = killZellijSession(claudeName) || killed;
        }
        return killed;
    }
}
exports.ZellijTerminalConnection = ZellijTerminalConnection;
exports.LocalTerminalConnection = ZellijTerminalConnection;
/**
 * Manager for all client connections
 */
class ZellijTerminalManager {
    constructor() {
        this.connections = new Map();
    }
    getConnection(clientId) {
        return this.connections.get(clientId);
    }
    getOrCreateConnection(clientId) {
        let connection = this.connections.get(clientId);
        if (!connection) {
            connection = new ZellijTerminalConnection(clientId);
            this.connections.set(clientId, connection);
            logger_1.logger.info(`Created terminal connection for client ${clientId}`);
        }
        return connection;
    }
    removeConnection(clientId, killSessions = false) {
        const connection = this.connections.get(clientId);
        if (connection) {
            connection.closeAll(killSessions);
            this.connections.delete(clientId);
            logger_1.logger.info(`Removed terminal connection for client ${clientId}`);
        }
    }
    getConnectionCount() {
        return this.connections.size;
    }
}
// Export with the same interface for compatibility
exports.localTerminalManager = new ZellijTerminalManager();
