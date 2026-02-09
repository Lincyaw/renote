import * as pty from 'node-pty';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { execSync, spawn } from 'child_process';
import { logger } from '../utils/logger';

export type TerminalType = 'shell' | 'claude';

export interface TerminalOptions {
  type: TerminalType;
  cwd?: string;
  cols?: number;
  rows?: number;
  claudeArgs?: string[];
}

interface ZellijSession {
  name: string;
  type: TerminalType;
  createdAt: number;
  ptyProcess: pty.IPty | null;
}

/**
 * Find the full path to a command
 */
function findCommand(cmd: string): string | null {
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
function getExtendedPath(): string {
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
function isZellijAvailable(): boolean {
  try {
    execSync('which zellij', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Strip ANSI escape codes from a string
 */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * List existing zellij sessions (names only, all sessions)
 */
function listZellijSessions(): string[] {
  try {
    const output = execSync('zellij list-sessions -s 2>/dev/null || true', {
      encoding: 'utf-8',
      env: { ...process.env, PATH: getExtendedPath() },
    });
    return output.trim().split('\n').map(stripAnsi).filter(s => s.length > 0);
  } catch {
    return [];
  }
}

/**
 * List alive (non-EXITED) zellij sessions
 * Parses full `zellij list-sessions` output to check status
 */
function listAliveZellijSessions(): string[] {
  try {
    const output = execSync('zellij list-sessions 2>/dev/null || true', {
      encoding: 'utf-8',
      env: { ...process.env, PATH: getExtendedPath() },
    });
    const lines = output.trim().split('\n').filter(s => s.length > 0);
    return lines
      .map(line => stripAnsi(line))
      .filter(line => !line.includes('(EXITED'))
      .map(line => line.split(' ')[0])
      .filter(name => name.length > 0);
  } catch {
    return [];
  }
}

/**
 * Kill a zellij session
 */
function killZellijSession(sessionName: string): boolean {
  try {
    execSync(`zellij kill-session ${sessionName} 2>/dev/null || true`, {
      env: { ...process.env, PATH: getExtendedPath() },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Manages zellij-backed terminal sessions for a client
 */
export class ZellijTerminalConnection {
  private sessions = new Map<string, ZellijSession>();
  private dataCallbacks = new Map<string, (data: string) => void>();
  private closeCallbacks = new Map<string, () => void>();
  private zellijAvailable: boolean;
  private clientId: string;

  constructor(clientId: string) {
    this.clientId = clientId;
    this.zellijAvailable = isZellijAvailable();
    if (this.zellijAvailable) {
      logger.info('Zellij is available, using zellij-backed sessions');
    } else {
      logger.warn('Zellij not found, falling back to plain PTY');
    }
  }

  /**
   * Generate a unique zellij session name
   */
  private generateSessionName(sessionId: string, type: TerminalType): string {
    // Use a prefix to identify our sessions
    return `renote-${type}-${sessionId.replace(/[^a-zA-Z0-9]/g, '-')}`;
  }

  /**
   * Check if a session exists
   */
  hasTerminal(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /**
   * Rebind callbacks for reconnection
   */
  rebindCallbacks(
    sessionId: string,
    onData: (data: string) => void,
    onClose: () => void
  ): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    this.dataCallbacks.set(sessionId, onData);
    this.closeCallbacks.set(sessionId, onClose);

    // If PTY process exists and is running, we're good
    if (session.ptyProcess) {
      logger.info(`Rebound callbacks for session ${sessionId}`);
      return true;
    }

    // PTY was closed but zellij session might still exist - reattach
    if (this.zellijAvailable) {
      const zellijName = this.generateSessionName(sessionId, session.type);
      const existingSessions = listZellijSessions();
      if (existingSessions.includes(zellijName)) {
        logger.info(`Reattaching to existing zellij session ${zellijName}`);
        return this.attachToZellijSession(sessionId, session.type, onData, onClose);
      }
    }

    return false;
  }

  /**
   * Attach to an existing or new zellij session
   */
  private attachToZellijSession(
    sessionId: string,
    type: TerminalType,
    onData: (data: string) => void,
    onClose: () => void,
    options?: TerminalOptions
  ): boolean {
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
        } as { [key: string]: string },
      });

      this.setupPtyHandlers(sessionId, ptyProcess, onData, onClose);

      const session = this.sessions.get(sessionId);
      if (session) {
        session.ptyProcess = ptyProcess;
      } else {
        this.sessions.set(sessionId, {
          name: zellijName,
          type,
          createdAt: Date.now(),
          ptyProcess,
        });
      }

      logger.info(`Attached to zellij session ${zellijName} (${cols}x${rows})`);
      return true;
    } catch (error) {
      logger.error(`Failed to attach to zellij session ${zellijName}:`, error);
      return false;
    }
  }

  /**
   * Setup PTY event handlers
   */
  private setupPtyHandlers(
    sessionId: string,
    ptyProcess: pty.IPty,
    onData: (data: string) => void,
    onClose: () => void
  ) {
    this.dataCallbacks.set(sessionId, onData);
    this.closeCallbacks.set(sessionId, onClose);

    ptyProcess.onData((data) => {
      const callback = this.dataCallbacks.get(sessionId);
      if (callback) {
        callback(data);
      }
    });

    ptyProcess.onExit(({ exitCode, signal }) => {
      logger.info(`PTY for session ${sessionId} exited with code ${exitCode}, signal ${signal}`);
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
  startTerminal(
    sessionId: string,
    onData: (data: string) => void,
    onClose: () => void,
    options: TerminalOptions = { type: 'shell' }
  ): boolean {
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
    } else {
      // Fallback to plain PTY
      return this.startPlainPty(sessionId, onData, onClose, options);
    }
  }

  /**
   * Fallback: start plain PTY without zellij
   */
  private startPlainPty(
    sessionId: string,
    onData: (data: string) => void,
    onClose: () => void,
    options: TerminalOptions
  ): boolean {
    const cols = options.cols || 80;
    const rows = options.rows || 24;
    const cwd = options.cwd || process.env.HOME || process.cwd();

    let command: string;
    let args: string[];

    if (options.type === 'claude') {
      const claudePath = findCommand('claude');
      command = claudePath || 'claude';
      args = options.claudeArgs || [];
    } else {
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
        } as { [key: string]: string },
      });

      this.sessions.set(sessionId, {
        name: sessionId,
        type: options.type,
        createdAt: Date.now(),
        ptyProcess,
      });

      this.setupPtyHandlers(sessionId, ptyProcess, onData, onClose);

      logger.info(`Started plain PTY ${options.type} session ${sessionId} (${cols}x${rows})`);
      return true;
    } catch (error) {
      logger.error(`Failed to start plain PTY ${sessionId}:`, error);
      return false;
    }
  }

  /**
   * Write to terminal
   */
  writeToTerminal(sessionId: string, data: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || !session.ptyProcess) {
      logger.warn(`Terminal ${sessionId} not found or not attached`);
      return false;
    }

    session.ptyProcess.write(data);
    return true;
  }

  /**
   * Resize terminal
   */
  resizeTerminal(sessionId: string, cols: number, rows: number): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || !session.ptyProcess) {
      logger.warn(`Terminal ${sessionId} not found for resize`);
      return false;
    }

    session.ptyProcess.resize(cols, rows);
    logger.debug(`Resized terminal ${sessionId} to ${cols}x${rows}`);
    return true;
  }

  /**
   * Close terminal (detach from zellij, but don't kill the session)
   */
  closeTerminal(sessionId: string, killSession: boolean = false): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      logger.warn(`Terminal ${sessionId} not found for close`);
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
      logger.info(`Killed zellij session ${session.name}`);
    }

    this.sessions.delete(sessionId);
    this.dataCallbacks.delete(sessionId);
    this.closeCallbacks.delete(sessionId);

    logger.info(`Closed terminal ${sessionId}${killSession ? ' (session killed)' : ' (session preserved)'}`);
    return true;
  }

  /**
   * Get list of active terminals
   */
  getActiveTerminals(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Get terminal info
   */
  getTerminalInfo(sessionId: string): { type: TerminalType; createdAt: number; zellijSession?: string } | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    return {
      type: session.type,
      createdAt: session.createdAt,
      zellijSession: this.zellijAvailable ? session.name : undefined,
    };
  }

  /**
   * Close all terminals
   */
  closeAll(killSessions: boolean = false): void {
    for (const [sessionId] of this.sessions) {
      this.closeTerminal(sessionId, killSessions);
    }
  }

  /**
   * List alive zellij sessions managed by this server
   */
  static listManagedSessions(): string[] {
    return listAliveZellijSessions().filter(s => s.startsWith('renote-'));
  }

  /**
   * Kill a zellij session by sessionId (without needing a connection)
   * Tries both shell and claude session names
   */
  static killSessionById(sessionId: string): boolean {
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

/**
 * Manager for all client connections
 */
class ZellijTerminalManager {
  private connections = new Map<string, ZellijTerminalConnection>();

  getConnection(clientId: string): ZellijTerminalConnection | undefined {
    return this.connections.get(clientId);
  }

  getOrCreateConnection(clientId: string): ZellijTerminalConnection {
    let connection = this.connections.get(clientId);
    if (!connection) {
      connection = new ZellijTerminalConnection(clientId);
      this.connections.set(clientId, connection);
      logger.info(`Created terminal connection for client ${clientId}`);
    }
    return connection;
  }

  removeConnection(clientId: string, killSessions: boolean = false): void {
    const connection = this.connections.get(clientId);
    if (connection) {
      connection.closeAll(killSessions);
      this.connections.delete(clientId);
      logger.info(`Removed terminal connection for client ${clientId}`);
    }
  }

  getConnectionCount(): number {
    return this.connections.size;
  }
}

// Export with the same interface for compatibility
export const localTerminalManager = new ZellijTerminalManager();
export { ZellijTerminalConnection as LocalTerminalConnection };
