import WebSocket from 'ws';
import { IncomingMessage } from 'http';
import { URL } from 'url';
import { localTerminalManager, TerminalType, TerminalOptions } from './localTerminalManager';
import { AuthManager } from '../websocket/auth';
import { logger } from '../utils/logger';

/**
 * Protocol for terminal direct WebSocket connection:
 *
 * Connection URL: ws://host:port/terminal?token=xxx&sessionId=xxx&type=shell|claude
 *
 * Messages:
 * - Text frames: terminal I/O data (bidirectional)
 * - Binary frames: control messages (JSON encoded)
 *   - { type: 'resize', cols: number, rows: number }
 *   - { type: 'ping' } -> responds with { type: 'pong' }
 */

interface ControlMessage {
  type: 'resize' | 'ping';
  cols?: number;
  rows?: number;
}

export class TerminalWebSocketHandler {
  private authManager: AuthManager;
  // Map from WebSocket to sessionId for cleanup
  private wsToSession = new Map<WebSocket, { clientId: string; sessionId: string }>();

  constructor() {
    this.authManager = new AuthManager();
  }

  /**
   * Check if a request should be handled by this handler
   */
  shouldHandle(request: IncomingMessage): boolean {
    try {
      const url = new URL(request.url || '', `http://${request.headers.host}`);
      return url.pathname === '/terminal';
    } catch {
      return false;
    }
  }

  /**
   * Handle a new terminal WebSocket connection
   */
  handleConnection(ws: WebSocket, request: IncomingMessage): void {
    try {
      const url = new URL(request.url || '', `http://${request.headers.host}`);
      const token = url.searchParams.get('token') || '';
      const sessionId = url.searchParams.get('sessionId');
      const type = (url.searchParams.get('type') || 'shell') as TerminalType;
      const cols = parseInt(url.searchParams.get('cols') || '80', 10);
      const rows = parseInt(url.searchParams.get('rows') || '24', 10);
      const claudeArgsParam = url.searchParams.get('claudeArgs');
      const cwd = url.searchParams.get('cwd') || undefined;

      // Validate token
      if (!this.authManager.validateToken(token)) {
        logger.warn('Terminal WebSocket: invalid token');
        ws.close(4001, 'Invalid token');
        return;
      }

      if (!sessionId) {
        logger.warn('Terminal WebSocket: missing sessionId');
        ws.close(4002, 'Missing sessionId');
        return;
      }

      // Generate a unique client ID for this connection
      const clientId = this.authManager.generateClientId();
      this.wsToSession.set(ws, { clientId, sessionId });

      logger.info(`Terminal WebSocket connected: clientId=${clientId}, sessionId=${sessionId}, type=${type}, ${cols}x${rows}`);

      const connection = localTerminalManager.getOrCreateConnection(clientId);
      const options: TerminalOptions = {
        type,
        cols,
        rows,
        cwd,
        claudeArgs: claudeArgsParam ? JSON.parse(decodeURIComponent(claudeArgsParam)) : undefined,
      };

      const success = connection.startTerminal(
        sessionId,
        (data) => {
          // Send terminal output as text frame
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(data);
          }
        },
        () => {
          // Terminal closed
          if (ws.readyState === WebSocket.OPEN) {
            ws.close(1000, 'Terminal closed');
          }
        },
        options
      );

      if (!success) {
        logger.error(`Failed to start terminal: sessionId=${sessionId}`);
        ws.close(4003, 'Failed to start terminal');
        return;
      }

      // Handle incoming messages
      ws.on('message', (data, isBinary) => {
        if (isBinary) {
          // Binary frame = control message
          this.handleControlMessage(ws, clientId, sessionId, data as Buffer);
        } else {
          // Text frame = terminal input
          connection.writeToTerminal(sessionId, data.toString());
        }
      });

      ws.on('close', () => {
        logger.info(`Terminal WebSocket closed: clientId=${clientId}, sessionId=${sessionId}`);
        // Detach but don't kill the zellij session
        connection.closeTerminal(sessionId, false);
        localTerminalManager.removeConnection(clientId, false);
        this.wsToSession.delete(ws);
      });

      ws.on('error', (error) => {
        logger.error(`Terminal WebSocket error: ${error.message}`);
      });

    } catch (error) {
      logger.error('Terminal WebSocket connection error:', error);
      ws.close(4000, 'Connection error');
    }
  }

  private handleControlMessage(ws: WebSocket, clientId: string, sessionId: string, data: Buffer): void {
    try {
      const message: ControlMessage = JSON.parse(data.toString());

      switch (message.type) {
        case 'resize':
          if (message.cols && message.rows) {
            const connection = localTerminalManager.getConnection(clientId);
            if (connection) {
              connection.resizeTerminal(sessionId, message.cols, message.rows);
              logger.debug(`Terminal resized: ${sessionId} -> ${message.cols}x${message.rows}`);
            }
          }
          break;

        case 'ping':
          // Respond with pong as binary frame
          ws.send(Buffer.from(JSON.stringify({ type: 'pong' })));
          break;

        default:
          logger.warn(`Unknown control message type: ${(message as any).type}`);
      }
    } catch (error) {
      logger.error('Failed to parse control message:', error);
    }
  }
}

export const terminalWebSocketHandler = new TerminalWebSocketHandler();
