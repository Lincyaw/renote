import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';
import { watch, FSWatcher } from 'chokidar';
import { logger } from '../utils/logger';

export interface WorkspaceInfo {
  dirName: string;
  displayPath: string;
  fullPath: string;
  sessionCount: number;
  lastModified: number;
}

export interface SessionInfo {
  sessionId: string;
  firstPrompt: string;
  summary: string;
  messageCount: number;
  created: string;
  modified: string;
}

export interface SessionMessage {
  uuid: string;
  type: 'user' | 'assistant' | 'tool_use' | 'tool_result' | 'system';
  content: string;
  timestamp: string;
  toolName?: string;
  toolInput?: Record<string, any>;
}

export interface SubagentInfo {
  agentId: string;
  slug: string;
  filePath: string;
  messageCount: number;
  created: string;
  modified: string;
  firstPrompt: string;
  parentSessionId: string;
}

export interface ToolResultFile {
  toolUseId: string;
  filePath: string;
  size: number;
}

const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');

// Session watcher管理
interface SessionWatcher {
  watcher: FSWatcher;
  filePath: string;
  lastSize: number;
  onUpdate: (messages: SessionMessage[]) => void;
}

const sessionWatchers = new Map<string, SessionWatcher>();

export function getSessionFilePath(workspace: string, sessionId: string): string {
  return path.join(PROJECTS_DIR, workspace, `${sessionId}.jsonl`);
}

export async function watchSession(
  clientId: string,
  workspace: string,
  sessionId: string,
  onUpdate: (messages: SessionMessage[]) => void
): Promise<void> {
  // 先停止之前的监听
  unwatchSession(clientId);

  const filePath = getSessionFilePath(workspace, sessionId);

  try {
    const stat = await fs.promises.stat(filePath);
    const lastSize = stat.size;

    const watcher = watch(filePath, {
      persistent: true,
      usePolling: true,
      interval: 2000, // Reduced from 500ms to save mobile battery
    });

    // Debounce change handler to prevent rapid-fire updates
    let debounceTimer: NodeJS.Timeout | null = null;

    watcher.on('change', async () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        const watcherInfo = sessionWatchers.get(clientId);
        if (!watcherInfo) return;

        try {
          const newStat = await fs.promises.stat(filePath);

          // Handle file truncation (e.g. log rotation)
          if (newStat.size < watcherInfo.lastSize) {
            watcherInfo.lastSize = 0;
          }

          if (newStat.size <= watcherInfo.lastSize) return;

          // 读取新增的内容
          const newMessages = await readNewMessages(filePath, watcherInfo.lastSize);
          watcherInfo.lastSize = newStat.size;

          if (newMessages.length > 0) {
            onUpdate(newMessages);
          }
        } catch (error) {
          logger.error('Error reading session update:', error);
        }
      }, 200);
    });

    sessionWatchers.set(clientId, {
      watcher,
      filePath,
      lastSize,
      onUpdate,
    });

    logger.info(`Started watching session: ${sessionId} for client: ${clientId}`);
  } catch (error) {
    logger.error('Error starting session watcher:', error);
  }
}

export function unwatchSession(clientId: string): void {
  const watcherInfo = sessionWatchers.get(clientId);
  if (watcherInfo) {
    watcherInfo.watcher.close();
    sessionWatchers.delete(clientId);
    logger.info(`Stopped watching session for client: ${clientId}`);
  }
}

async function readNewMessages(filePath: string, fromPosition: number): Promise<SessionMessage[]> {
  return new Promise((resolve, reject) => {
    const messages: SessionMessage[] = [];
    const stream = fs.createReadStream(filePath, {
      encoding: 'utf-8',
      start: fromPosition,
    });

    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    rl.on('line', (line) => {
      if (!line.trim()) return;
      try {
        const entry = JSON.parse(line);
        const parsed = parseEntry(entry);
        if (parsed) messages.push(...parsed);
      } catch {
        // Skip malformed lines
      }
    });

    rl.on('close', () => resolve(messages));
    rl.on('error', reject);
  });
}

function decodeWorkspacePath(dirName: string): string {
  // -Users-lincyaw-workspace-DevSpace → ~/workspace/DevSpace
  const home = os.homedir(); // /Users/lincyaw
  const homeParts = home.split(path.sep).filter(Boolean); // ['Users', 'lincyaw']
  const parts = dirName.split('-').filter(Boolean);

  // Check if the parts start with the home directory components
  let matchLen = 0;
  for (let i = 0; i < homeParts.length && i < parts.length; i++) {
    if (parts[i] === homeParts[i]) {
      matchLen++;
    } else {
      break;
    }
  }

  if (matchLen === homeParts.length) {
    const rest = parts.slice(matchLen).join('/');
    return rest ? `~/${rest}` : '~';
  }

  return '/' + parts.join('/');
}

/**
 * Resolve a Claude projects dirName (e.g. "-home-nn-workspace-proj-rcabench-paper")
 * back to an actual filesystem path. The encoding replaces "/" (and "_") with "-",
 * making it ambiguous. We probe the filesystem trying "-", "_", and "/" as joiners
 * between segments to find the real path.
 */
async function resolveDirNameToPath(dirName: string): Promise<string> {
  const segments = dirName.split('-').filter(Boolean);
  if (segments.length === 0) return '/';

  async function isDir(p: string): Promise<boolean> {
    try {
      return (await fs.promises.stat(p)).isDirectory();
    } catch {
      return false;
    }
  }

  // Try joining adjacent segments with each joiner and probe the filesystem
  const JOINERS = ['-', '_'];

  async function probe(current: string, remaining: string[]): Promise<string | null> {
    if (remaining.length === 0) {
      return await isDir(current) ? current : null;
    }

    // Try consuming 1..N remaining segments as a single directory component
    for (let take = remaining.length; take >= 1; take--) {
      const parts = remaining.slice(0, take);
      // For multi-segment chunks, try all joiner characters
      const joinVariants = take === 1
        ? [parts[0]]
        : JOINERS.map(j => parts.join(j));

      for (const name of joinVariants) {
        const candidate = current + '/' + name;
        if (await isDir(candidate)) {
          const result = await probe(candidate, remaining.slice(take));
          if (result) return result;
        }
      }
    }

    return null;
  }

  const result = await probe('', segments);
  return result || ('/' + segments.join('/'));
}

export async function listWorkspaces(): Promise<WorkspaceInfo[]> {
  try {
    const entries = await fs.promises.readdir(PROJECTS_DIR, { withFileTypes: true });
    const workspaces: WorkspaceInfo[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const workspaceDir = path.join(PROJECTS_DIR, entry.name);
      const indexPath = path.join(workspaceDir, 'sessions-index.json');

      let indexCount = 0;
      let lastModified = 0;
      let originalPath = '';

      // Read sessions-index.json if available
      try {
        const raw = await fs.promises.readFile(indexPath, 'utf-8');
        const index = JSON.parse(raw);
        originalPath = index.originalPath || '';
        const sessions = index.entries || [];
        indexCount = sessions.length;

        for (const s of sessions) {
          const mtime = s.fileMtime || new Date(s.modified).getTime() || 0;
          if (mtime > lastModified) lastModified = mtime;
        }
      } catch {
        // No sessions-index.json or parse error, continue with file scan
      }

      // Also scan for .jsonl files to get accurate count
      let jsonlCount = 0;
      try {
        const files = await fs.promises.readdir(workspaceDir);
        jsonlCount = files.filter(f => f.endsWith('.jsonl')).length;

        // Update lastModified from .jsonl files if needed
        if (lastModified === 0 && jsonlCount > 0) {
          for (const file of files) {
            if (!file.endsWith('.jsonl')) continue;
            try {
              const stat = await fs.promises.stat(path.join(workspaceDir, file));
              const mtime = stat.mtimeMs;
              if (mtime > lastModified) lastModified = mtime;
            } catch {
              // Skip files we can't stat
            }
          }
        }
      } catch {
        // Can't read directory, use index count
      }

      // Use the larger of the two counts to ensure accuracy
      const sessionCount = Math.max(indexCount, jsonlCount);

      // Only add workspace if it has sessions
      if (sessionCount > 0) {
        // fullPath: prefer originalPath from index, fall back to probing filesystem
        const fullPath = originalPath || await resolveDirNameToPath(entry.name);
        const home = os.homedir();
        const displayPath = fullPath.startsWith(home + '/')
          ? '~' + fullPath.slice(home.length)
          : fullPath;
        workspaces.push({
          dirName: entry.name,
          displayPath,
          fullPath,
          sessionCount,
          lastModified,
        });
      }
    }

    workspaces.sort((a, b) => b.lastModified - a.lastModified);
    return workspaces;
  } catch (error) {
    logger.error('Error listing workspaces:', error);
    return [];
  }
}

export async function listSessions(workspace: string): Promise<SessionInfo[]> {
  const workspaceDir = path.join(PROJECTS_DIR, workspace);
  const indexPath = path.join(workspaceDir, 'sessions-index.json');

  // Build a map from sessionId to SessionInfo from the index
  const sessionMap = new Map<string, SessionInfo>();

  try {
    const raw = await fs.promises.readFile(indexPath, 'utf-8');
    const index = JSON.parse(raw);
    const entries = index.entries || [];

    for (const e of entries) {
      sessionMap.set(e.sessionId, {
        sessionId: e.sessionId,
        firstPrompt: e.firstPrompt || '',
        summary: e.summary || '',
        messageCount: e.messageCount || 0,
        created: e.created || '',
        modified: e.modified || '',
      });
    }
  } catch {
    // Index file doesn't exist or parse error, continue with file scan
  }

  // Scan for .jsonl files not in the index
  try {
    const files = await fs.promises.readdir(workspaceDir);
    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue;
      const sessionId = file.replace('.jsonl', '');
      if (sessionMap.has(sessionId)) continue;

      // Extract basic info from file
      const filePath = path.join(workspaceDir, file);
      const stat = await fs.promises.stat(filePath);
      const info = await extractSessionInfo(filePath, sessionId, stat);
      if (info) sessionMap.set(sessionId, info);
    }
  } catch (error) {
    logger.error('Error scanning workspace directory:', error);
  }

  const sessions = Array.from(sessionMap.values());
  sessions.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());
  return sessions;
}

async function extractSessionInfo(
  filePath: string,
  sessionId: string,
  stat: fs.Stats
): Promise<SessionInfo | null> {
  try {
    const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    let firstPrompt = '';
    let messageCount = 0;

    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        if (entry.type === 'user' && entry.message) {
          messageCount++;
          if (!firstPrompt && typeof entry.message.content === 'string') {
            firstPrompt = entry.message.content.substring(0, 200);
          }
        } else if (entry.type === 'assistant') {
          messageCount++;
        }
        // Stop after reading enough to get firstPrompt and some count
        if (firstPrompt && messageCount >= 10) {
          rl.close();
          break;
        }
      } catch {
        // Skip malformed lines
      }
    }

    return {
      sessionId,
      firstPrompt: firstPrompt || 'No prompt',
      summary: '',
      messageCount,
      created: stat.birthtime.toISOString(),
      modified: stat.mtime.toISOString(),
    };
  } catch {
    return null;
  }
}

export async function getSessionMessages(
  workspace: string,
  sessionId: string
): Promise<SessionMessage[]> {
  const filePath = path.join(PROJECTS_DIR, workspace, `${sessionId}.jsonl`);
  const messages: SessionMessage[] = [];

  try {
    const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        const parsed = parseEntry(entry);
        if (parsed) messages.push(...parsed);
      } catch {
        // Skip malformed lines
      }
    }
  } catch (error) {
    logger.error('Error reading session messages:', error);
  }

  return messages;
}

export interface SessionMessagesPage {
  messages: SessionMessage[];
  hasMore: boolean;
  oldestIndex: number;
  totalCount: number;
}

/**
 * Get a page of session messages, reading from the end of the file (newest first).
 * This enables IM-style pagination where the latest messages are loaded first.
 *
 * @param workspace - The workspace directory name
 * @param sessionId - The session ID
 * @param limit - Maximum number of messages to return (default 50)
 * @param beforeIndex - Only return messages with index < beforeIndex (for pagination)
 * @returns A page of messages in chronological order (oldest first within the page)
 */
export async function getSessionMessagesPage(
  workspace: string,
  sessionId: string,
  limit: number = 50,
  beforeIndex?: number
): Promise<SessionMessagesPage> {
  const filePath = path.join(PROJECTS_DIR, workspace, `${sessionId}.jsonl`);

  try {
    // Read all messages from file
    const allMessages: SessionMessage[] = [];
    const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        const parsed = parseEntry(entry);
        if (parsed) allMessages.push(...parsed);
      } catch {
        // Skip malformed lines
      }
    }

    const totalCount = allMessages.length;

    // Determine the slice range
    // beforeIndex is the index in the full array (0-based)
    // If not provided, start from the end
    const endIndex = beforeIndex !== undefined ? beforeIndex : totalCount;
    const startIndex = Math.max(0, endIndex - limit);

    // Slice and return in chronological order
    const pageMessages = allMessages.slice(startIndex, endIndex);

    return {
      messages: pageMessages,
      hasMore: startIndex > 0,
      oldestIndex: startIndex,
      totalCount,
    };
  } catch (error) {
    logger.error('Error reading session messages page:', error);
    return {
      messages: [],
      hasMore: false,
      oldestIndex: 0,
      totalCount: 0,
    };
  }
}

function parseEntry(entry: any): SessionMessage[] | null {
  const timestamp = entry.timestamp || '';
  const uuid = entry.uuid || '';

  if (entry.type === 'user' && entry.message) {
    const content = entry.message.content;

    // content is string → real user message
    if (typeof content === 'string') {
      return [{ uuid, type: 'user', content, timestamp }];
    }

    // content is array → may contain tool_result blocks or text blocks
    if (Array.isArray(content)) {
      const results: SessionMessage[] = [];
      for (const block of content) {
        if (block.type === 'tool_result') {
          const text =
            typeof block.content === 'string'
              ? block.content
              : Array.isArray(block.content)
              ? block.content
                  .filter((c: any) => c.type === 'text')
                  .map((c: any) => c.text)
                  .join('\n')
              : 'Tool completed';
          results.push({
            uuid: block.tool_use_id || uuid + '_result',
            type: 'tool_result',
            content: text.substring(0, 500),
            timestamp,
          });
        } else if (block.type === 'text' && block.text) {
          results.push({ uuid: uuid + '_text', type: 'user', content: block.text, timestamp });
        }
      }
      return results.length > 0 ? results : null;
    }

    return null;
  }

  if (entry.type === 'assistant' && entry.message) {
    const contentBlocks = entry.message.content;
    if (!Array.isArray(contentBlocks)) return null;

    const results: SessionMessage[] = [];
    for (const block of contentBlocks) {
      if (block.type === 'text' && block.text) {
        results.push({ uuid: uuid + '_text', type: 'assistant', content: block.text, timestamp });
      } else if (block.type === 'tool_use') {
        results.push({
          uuid: block.id || uuid + '_tool',
          type: 'tool_use',
          content: `Tool: ${block.name}`,
          timestamp,
          toolName: block.name,
          toolInput: block.input,
        });
      } else if (block.type === 'tool_result') {
        const text =
          typeof block.content === 'string'
            ? block.content
            : Array.isArray(block.content)
            ? block.content
                .filter((c: any) => c.type === 'text')
                .map((c: any) => c.text)
                .join('\n')
            : 'Tool completed';
        results.push({
          uuid: block.tool_use_id || uuid + '_result',
          type: 'tool_result',
          content: text.substring(0, 500),
          timestamp,
        });
      }
    }
    return results.length > 0 ? results : null;
  }

  if (entry.type === 'result' && entry.result) {
    // Tool result entries at top level
    const content =
      typeof entry.result === 'string'
        ? entry.result.substring(0, 500)
        : JSON.stringify(entry.result).substring(0, 500);
    return [{ uuid, type: 'tool_result', content, timestamp }];
  }

  return null;
}

/**
 * List all subagents for a session
 */
export async function listSubagents(
  workspace: string,
  sessionId: string
): Promise<SubagentInfo[]> {
  const subagentsDir = path.join(PROJECTS_DIR, workspace, sessionId, 'subagents');
  const subagents: SubagentInfo[] = [];

  try {
    const files = await fs.promises.readdir(subagentsDir);

    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue;

      const filePath = path.join(subagentsDir, file);
      const stat = await fs.promises.stat(filePath);

      // Extract info from first line
      const info = await extractSubagentInfo(filePath, sessionId, stat);
      if (info) {
        subagents.push(info);
      }
    }

    // Sort by modified time (newest first)
    subagents.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());
    return subagents;
  } catch (error) {
    // Directory doesn't exist or other error
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.error('Error listing subagents:', error);
    }
    return [];
  }
}

async function extractSubagentInfo(
  filePath: string,
  parentSessionId: string,
  stat: fs.Stats
): Promise<SubagentInfo | null> {
  try {
    const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    let agentId = '';
    let slug = '';
    let firstPrompt = '';
    let messageCount = 0;
    let created = '';

    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        messageCount++;

        // Get agent info from first entry
        if (!agentId && entry.agentId) {
          agentId = entry.agentId;
          slug = entry.slug || '';
          created = entry.timestamp || '';
        }

        // Get first user prompt
        if (!firstPrompt && entry.type === 'user' && entry.message) {
          const content = entry.message.content;
          if (typeof content === 'string') {
            firstPrompt = content.substring(0, 200);
          }
        }

        // Stop after reading enough
        if (agentId && firstPrompt && messageCount >= 20) {
          rl.close();
          break;
        }
      } catch {
        // Skip malformed lines
      }
    }

    if (!agentId) return null;

    return {
      agentId,
      slug,
      filePath,
      messageCount,
      created: created || stat.birthtime.toISOString(),
      modified: stat.mtime.toISOString(),
      firstPrompt: firstPrompt || 'No prompt',
      parentSessionId,
    };
  } catch {
    return null;
  }
}

/**
 * Get messages from a subagent
 */
export async function getSubagentMessages(
  workspace: string,
  sessionId: string,
  agentId: string
): Promise<SessionMessage[]> {
  const subagentsDir = path.join(PROJECTS_DIR, workspace, sessionId, 'subagents');
  const messages: SessionMessage[] = [];

  try {
    const files = await fs.promises.readdir(subagentsDir);
    // Find the file that matches this agentId
    const agentFile = files.find(f => f.includes(agentId) && f.endsWith('.jsonl'));

    if (!agentFile) {
      logger.warn(`Subagent file not found for agentId: ${agentId}`);
      return [];
    }

    const filePath = path.join(subagentsDir, agentFile);
    const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        const parsed = parseEntry(entry);
        if (parsed) messages.push(...parsed);
      } catch {
        // Skip malformed lines
      }
    }
  } catch (error) {
    logger.error('Error reading subagent messages:', error);
  }

  return messages;
}

/**
 * List tool result files for a session
 */
export async function listToolResults(
  workspace: string,
  sessionId: string
): Promise<ToolResultFile[]> {
  const toolResultsDir = path.join(PROJECTS_DIR, workspace, sessionId, 'tool-results');
  const results: ToolResultFile[] = [];

  try {
    const files = await fs.promises.readdir(toolResultsDir);

    for (const file of files) {
      if (!file.endsWith('.txt')) continue;

      const filePath = path.join(toolResultsDir, file);
      const stat = await fs.promises.stat(filePath);

      // Extract tool_use_id from filename (e.g., toolu_018uDQVKJXngdcuQvtx35fRV.txt)
      const toolUseId = file.replace('.txt', '');

      results.push({
        toolUseId,
        filePath,
        size: stat.size,
      });
    }

    return results;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.error('Error listing tool results:', error);
    }
    return [];
  }
}

/**
 * Read content of a tool result file
 */
export async function getToolResultContent(
  workspace: string,
  sessionId: string,
  toolUseId: string,
  maxSize: number = 50000
): Promise<string> {
  const filePath = path.join(
    PROJECTS_DIR,
    workspace,
    sessionId,
    'tool-results',
    `${toolUseId}.txt`
  );

  try {
    const stat = await fs.promises.stat(filePath);

    if (stat.size <= maxSize) {
      return await fs.promises.readFile(filePath, 'utf-8');
    }

    // If file is too large, read only the beginning
    const buffer = Buffer.alloc(maxSize);
    const fd = await fs.promises.open(filePath, 'r');
    await fd.read(buffer, 0, maxSize, 0);
    await fd.close();

    return buffer.toString('utf-8') + `\n\n... [truncated, total size: ${stat.size} bytes]`;
  } catch (error) {
    logger.error('Error reading tool result:', error);
    return '';
  }
}

/**
 * Get session folder info (subagents count, tool-results count)
 */
export async function getSessionFolderInfo(
  workspace: string,
  sessionId: string
): Promise<{ subagentCount: number; toolResultCount: number }> {
  const sessionDir = path.join(PROJECTS_DIR, workspace, sessionId);

  let subagentCount = 0;
  let toolResultCount = 0;

  try {
    const subagentsDir = path.join(sessionDir, 'subagents');
    const files = await fs.promises.readdir(subagentsDir);
    subagentCount = files.filter(f => f.endsWith('.jsonl')).length;
  } catch {
    // Directory doesn't exist
  }

  try {
    const toolResultsDir = path.join(sessionDir, 'tool-results');
    const files = await fs.promises.readdir(toolResultsDir);
    toolResultCount = files.filter(f => f.endsWith('.txt')).length;
  } catch {
    // Directory doesn't exist
  }

  return { subagentCount, toolResultCount };
}
