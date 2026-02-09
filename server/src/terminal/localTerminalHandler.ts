import WebSocket from 'ws';
import { ClientMessage, ServerMessage } from '../types';
import { localTerminalManager, TerminalOptions, TerminalType, ZellijTerminalConnection } from './localTerminalManager';
import { logger } from '../utils/logger';

export class LocalTerminalHandler {
  private sendFn: (ws: WebSocket, message: ServerMessage) => void;

  constructor(sendFn: (ws: WebSocket, message: ServerMessage) => void) {
    this.sendFn = sendFn;
  }

  canHandle(messageType: string): boolean {
    return messageType.startsWith('terminal_') || messageType === 'list_managed_terminals';
  }

  async handle(ws: WebSocket, clientId: string, message: ClientMessage): Promise<void> {
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
      case 'list_managed_terminals':
        this.handleListManaged(ws);
        break;
      default:
        logger.warn(`Unknown terminal message type: ${message.type}`);
    }
  }

  private async handleStart(ws: WebSocket, clientId: string, message: ClientMessage): Promise<void> {
    const { sessionId, type, cwd, cols, rows, claudeArgs } = message.data || {};

    if (!sessionId) {
      this.sendFn(ws, {
        type: 'terminal_start_response',
        data: { success: false, message: 'sessionId is required' },
      });
      return;
    }

    const terminalType: TerminalType = type === 'claude' ? 'claude' : 'shell';
    const options: TerminalOptions = {
      type: terminalType,
      cwd,
      cols,
      rows,
      claudeArgs,
    };

    const connection = localTerminalManager.getOrCreateConnection(clientId);

    const success = connection.startTerminal(
      sessionId,
      (data) => {
        // Send terminal output to client
        this.sendFn(ws, {
          type: 'terminal_output',
          data: { sessionId, output: data },
        });
      },
      () => {
        // Notify client when terminal closes
        this.sendFn(ws, {
          type: 'terminal_closed',
          data: { sessionId },
        });
      },
      options
    );

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

  private handleInput(clientId: string, message: ClientMessage): void {
    const { sessionId, input } = message.data || {};

    if (!sessionId || input === undefined) {
      logger.warn('Invalid terminal_input message: missing sessionId or input');
      return;
    }

    const connection = localTerminalManager.getConnection(clientId);
    if (!connection) {
      logger.warn(`No terminal connection for client ${clientId}`);
      return;
    }

    connection.writeToTerminal(sessionId, input);
  }

  private handleResize(clientId: string, message: ClientMessage): void {
    const { sessionId, cols, rows } = message.data || {};

    if (!sessionId || !cols || !rows) {
      logger.warn('Invalid terminal_resize message');
      return;
    }

    const connection = localTerminalManager.getConnection(clientId);
    if (!connection) {
      logger.warn(`No terminal connection for client ${clientId}`);
      return;
    }

    connection.resizeTerminal(sessionId, cols, rows);
  }

  private handleClose(ws: WebSocket, clientId: string, message: ClientMessage): void {
    const { sessionId, kill } = message.data || {};

    if (!sessionId) {
      logger.warn('Invalid terminal_close message: missing sessionId');
      return;
    }

    let success = false;
    const connection = localTerminalManager.getConnection(clientId);

    if (connection) {
      // kill=true will also kill the zellij session; default is just detach
      success = connection.closeTerminal(sessionId, kill === true);
    } else if (kill) {
      // No connection found, but user wants to kill - try direct kill by sessionId
      // This handles the case where terminal was created via /terminal direct WebSocket
      success = ZellijTerminalConnection.killSessionById(sessionId);
      logger.info(`Direct kill for session ${sessionId}: ${success}`);
    }

    this.sendFn(ws, {
      type: 'terminal_close_response',
      data: { success, sessionId },
    });
  }

  private handleList(ws: WebSocket, clientId: string): void {
    const connection = localTerminalManager.getConnection(clientId);
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

  /**
   * List all managed zellij sessions (survives reconnects)
   * Parses session names like "renote-shell-xxx" / "renote-claude-xxx"
   */
  private handleListManaged(ws: WebSocket): void {
    const managedSessions = ZellijTerminalConnection.listManagedSessions();

    const terminals = managedSessions.map((name) => {
      // Parse "renote-{type}-{sanitizedId}" pattern
      let type: TerminalType = 'shell';
      let sessionId = name;

      if (name.startsWith('renote-shell-')) {
        type = 'shell';
        sessionId = name.substring('renote-shell-'.length);
      } else if (name.startsWith('renote-claude-')) {
        type = 'claude';
        sessionId = name.substring('renote-claude-'.length);
      }

      return {
        sessionId,
        type,
        zellijName: name,
      };
    });

    this.sendFn(ws, {
      type: 'list_managed_terminals_response',
      data: { terminals },
    });
  }

  cleanup(clientId: string): void {
    localTerminalManager.removeConnection(clientId);
  }
}
