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
exports.getSessionFilePath = getSessionFilePath;
exports.watchSession = watchSession;
exports.unwatchSession = unwatchSession;
exports.listWorkspaces = listWorkspaces;
exports.listSessions = listSessions;
exports.getSessionMessages = getSessionMessages;
exports.getSessionMessagesPage = getSessionMessagesPage;
exports.listSubagents = listSubagents;
exports.getSubagentMessages = getSubagentMessages;
exports.listToolResults = listToolResults;
exports.getToolResultContent = getToolResultContent;
exports.getSessionFolderInfo = getSessionFolderInfo;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const readline = __importStar(require("readline"));
const chokidar_1 = require("chokidar");
const logger_1 = require("../utils/logger");
const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');
const sessionWatchers = new Map();
function getSessionFilePath(workspace, sessionId) {
    return path.join(PROJECTS_DIR, workspace, `${sessionId}.jsonl`);
}
async function watchSession(clientId, workspace, sessionId, onUpdate) {
    // 先停止之前的监听
    unwatchSession(clientId);
    const filePath = getSessionFilePath(workspace, sessionId);
    try {
        const stat = await fs.promises.stat(filePath);
        const lastSize = stat.size;
        const watcher = (0, chokidar_1.watch)(filePath, {
            persistent: true,
            usePolling: true,
            interval: 2000, // Reduced from 500ms to save mobile battery
        });
        // Debounce change handler to prevent rapid-fire updates
        let debounceTimer = null;
        watcher.on('change', async () => {
            if (debounceTimer)
                clearTimeout(debounceTimer);
            debounceTimer = setTimeout(async () => {
                const watcherInfo = sessionWatchers.get(clientId);
                if (!watcherInfo)
                    return;
                try {
                    const newStat = await fs.promises.stat(filePath);
                    // Handle file truncation (e.g. log rotation)
                    if (newStat.size < watcherInfo.lastSize) {
                        watcherInfo.lastSize = 0;
                    }
                    if (newStat.size <= watcherInfo.lastSize)
                        return;
                    // 读取新增的内容
                    const newMessages = await readNewMessages(filePath, watcherInfo.lastSize);
                    watcherInfo.lastSize = newStat.size;
                    if (newMessages.length > 0) {
                        onUpdate(newMessages);
                    }
                }
                catch (error) {
                    logger_1.logger.error('Error reading session update:', error);
                }
            }, 200);
        });
        sessionWatchers.set(clientId, {
            watcher,
            filePath,
            lastSize,
            onUpdate,
        });
        logger_1.logger.info(`Started watching session: ${sessionId} for client: ${clientId}`);
    }
    catch (error) {
        logger_1.logger.error('Error starting session watcher:', error);
    }
}
function unwatchSession(clientId) {
    const watcherInfo = sessionWatchers.get(clientId);
    if (watcherInfo) {
        watcherInfo.watcher.close();
        sessionWatchers.delete(clientId);
        logger_1.logger.info(`Stopped watching session for client: ${clientId}`);
    }
}
async function readNewMessages(filePath, fromPosition) {
    return new Promise((resolve, reject) => {
        const messages = [];
        const stream = fs.createReadStream(filePath, {
            encoding: 'utf-8',
            start: fromPosition,
        });
        const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
        rl.on('line', (line) => {
            if (!line.trim())
                return;
            try {
                const entry = JSON.parse(line);
                const parsed = parseEntry(entry);
                if (parsed)
                    messages.push(...parsed);
            }
            catch {
                // Skip malformed lines
            }
        });
        rl.on('close', () => resolve(messages));
        rl.on('error', reject);
    });
}
function decodeWorkspacePath(dirName) {
    // -Users-lincyaw-workspace-DevSpace → ~/workspace/DevSpace
    const home = os.homedir(); // /Users/lincyaw
    const homeParts = home.split(path.sep).filter(Boolean); // ['Users', 'lincyaw']
    const parts = dirName.split('-').filter(Boolean);
    // Check if the parts start with the home directory components
    let matchLen = 0;
    for (let i = 0; i < homeParts.length && i < parts.length; i++) {
        if (parts[i] === homeParts[i]) {
            matchLen++;
        }
        else {
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
async function resolveDirNameToPath(dirName) {
    const segments = dirName.split('-').filter(Boolean);
    if (segments.length === 0)
        return '/';
    async function isDir(p) {
        try {
            return (await fs.promises.stat(p)).isDirectory();
        }
        catch {
            return false;
        }
    }
    // Try joining adjacent segments with each joiner and probe the filesystem
    const JOINERS = ['-', '_'];
    async function probe(current, remaining) {
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
                    if (result)
                        return result;
                }
            }
        }
        return null;
    }
    const result = await probe('', segments);
    return result || ('/' + segments.join('/'));
}
async function listWorkspaces() {
    try {
        const entries = await fs.promises.readdir(PROJECTS_DIR, { withFileTypes: true });
        const workspaces = [];
        for (const entry of entries) {
            if (!entry.isDirectory())
                continue;
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
                    if (mtime > lastModified)
                        lastModified = mtime;
                }
            }
            catch {
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
                        if (!file.endsWith('.jsonl'))
                            continue;
                        try {
                            const stat = await fs.promises.stat(path.join(workspaceDir, file));
                            const mtime = stat.mtimeMs;
                            if (mtime > lastModified)
                                lastModified = mtime;
                        }
                        catch {
                            // Skip files we can't stat
                        }
                    }
                }
            }
            catch {
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
    }
    catch (error) {
        logger_1.logger.error('Error listing workspaces:', error);
        return [];
    }
}
async function listSessions(workspace) {
    const workspaceDir = path.join(PROJECTS_DIR, workspace);
    const indexPath = path.join(workspaceDir, 'sessions-index.json');
    // Build a map from sessionId to SessionInfo from the index
    const sessionMap = new Map();
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
    }
    catch {
        // Index file doesn't exist or parse error, continue with file scan
    }
    // Scan for .jsonl files not in the index
    try {
        const files = await fs.promises.readdir(workspaceDir);
        for (const file of files) {
            if (!file.endsWith('.jsonl'))
                continue;
            const sessionId = file.replace('.jsonl', '');
            if (sessionMap.has(sessionId))
                continue;
            // Extract basic info from file
            const filePath = path.join(workspaceDir, file);
            const stat = await fs.promises.stat(filePath);
            const info = await extractSessionInfo(filePath, sessionId, stat);
            if (info)
                sessionMap.set(sessionId, info);
        }
    }
    catch (error) {
        logger_1.logger.error('Error scanning workspace directory:', error);
    }
    const sessions = Array.from(sessionMap.values());
    sessions.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());
    return sessions;
}
async function extractSessionInfo(filePath, sessionId, stat) {
    try {
        const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
        const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
        let firstPrompt = '';
        let messageCount = 0;
        for await (const line of rl) {
            if (!line.trim())
                continue;
            try {
                const entry = JSON.parse(line);
                if (entry.type === 'user' && entry.message) {
                    messageCount++;
                    if (!firstPrompt && typeof entry.message.content === 'string') {
                        firstPrompt = entry.message.content.substring(0, 200);
                    }
                }
                else if (entry.type === 'assistant') {
                    messageCount++;
                }
                // Stop after reading enough to get firstPrompt and some count
                if (firstPrompt && messageCount >= 10) {
                    rl.close();
                    break;
                }
            }
            catch {
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
    }
    catch {
        return null;
    }
}
async function getSessionMessages(workspace, sessionId) {
    const filePath = path.join(PROJECTS_DIR, workspace, `${sessionId}.jsonl`);
    const messages = [];
    try {
        const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
        const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
        for await (const line of rl) {
            if (!line.trim())
                continue;
            try {
                const entry = JSON.parse(line);
                const parsed = parseEntry(entry);
                if (parsed)
                    messages.push(...parsed);
            }
            catch {
                // Skip malformed lines
            }
        }
    }
    catch (error) {
        logger_1.logger.error('Error reading session messages:', error);
    }
    return messages;
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
async function getSessionMessagesPage(workspace, sessionId, limit = 50, beforeIndex) {
    const filePath = path.join(PROJECTS_DIR, workspace, `${sessionId}.jsonl`);
    try {
        // Read all messages from file
        const allMessages = [];
        const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
        const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
        for await (const line of rl) {
            if (!line.trim())
                continue;
            try {
                const entry = JSON.parse(line);
                const parsed = parseEntry(entry);
                if (parsed)
                    allMessages.push(...parsed);
            }
            catch {
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
    }
    catch (error) {
        logger_1.logger.error('Error reading session messages page:', error);
        return {
            messages: [],
            hasMore: false,
            oldestIndex: 0,
            totalCount: 0,
        };
    }
}
function parseEntry(entry) {
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
            const results = [];
            for (const block of content) {
                if (block.type === 'tool_result') {
                    const text = typeof block.content === 'string'
                        ? block.content
                        : Array.isArray(block.content)
                            ? block.content
                                .filter((c) => c.type === 'text')
                                .map((c) => c.text)
                                .join('\n')
                            : 'Tool completed';
                    results.push({
                        uuid: block.tool_use_id || uuid + '_result',
                        type: 'tool_result',
                        content: text.substring(0, 500),
                        timestamp,
                    });
                }
                else if (block.type === 'text' && block.text) {
                    results.push({ uuid: uuid + '_text', type: 'user', content: block.text, timestamp });
                }
            }
            return results.length > 0 ? results : null;
        }
        return null;
    }
    if (entry.type === 'assistant' && entry.message) {
        const contentBlocks = entry.message.content;
        if (!Array.isArray(contentBlocks))
            return null;
        const results = [];
        for (const block of contentBlocks) {
            if (block.type === 'text' && block.text) {
                results.push({ uuid: uuid + '_text', type: 'assistant', content: block.text, timestamp });
            }
            else if (block.type === 'tool_use') {
                results.push({
                    uuid: block.id || uuid + '_tool',
                    type: 'tool_use',
                    content: `Tool: ${block.name}`,
                    timestamp,
                    toolName: block.name,
                    toolInput: block.input,
                });
            }
            else if (block.type === 'tool_result') {
                const text = typeof block.content === 'string'
                    ? block.content
                    : Array.isArray(block.content)
                        ? block.content
                            .filter((c) => c.type === 'text')
                            .map((c) => c.text)
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
        const content = typeof entry.result === 'string'
            ? entry.result.substring(0, 500)
            : JSON.stringify(entry.result).substring(0, 500);
        return [{ uuid, type: 'tool_result', content, timestamp }];
    }
    return null;
}
/**
 * List all subagents for a session
 */
async function listSubagents(workspace, sessionId) {
    const subagentsDir = path.join(PROJECTS_DIR, workspace, sessionId, 'subagents');
    const subagents = [];
    try {
        const files = await fs.promises.readdir(subagentsDir);
        for (const file of files) {
            if (!file.endsWith('.jsonl'))
                continue;
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
    }
    catch (error) {
        // Directory doesn't exist or other error
        if (error.code !== 'ENOENT') {
            logger_1.logger.error('Error listing subagents:', error);
        }
        return [];
    }
}
async function extractSubagentInfo(filePath, parentSessionId, stat) {
    try {
        const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
        const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
        let agentId = '';
        let slug = '';
        let firstPrompt = '';
        let messageCount = 0;
        let created = '';
        for await (const line of rl) {
            if (!line.trim())
                continue;
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
            }
            catch {
                // Skip malformed lines
            }
        }
        if (!agentId)
            return null;
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
    }
    catch {
        return null;
    }
}
/**
 * Get messages from a subagent
 */
async function getSubagentMessages(workspace, sessionId, agentId) {
    const subagentsDir = path.join(PROJECTS_DIR, workspace, sessionId, 'subagents');
    const messages = [];
    try {
        const files = await fs.promises.readdir(subagentsDir);
        // Find the file that matches this agentId
        const agentFile = files.find(f => f.includes(agentId) && f.endsWith('.jsonl'));
        if (!agentFile) {
            logger_1.logger.warn(`Subagent file not found for agentId: ${agentId}`);
            return [];
        }
        const filePath = path.join(subagentsDir, agentFile);
        const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
        const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
        for await (const line of rl) {
            if (!line.trim())
                continue;
            try {
                const entry = JSON.parse(line);
                const parsed = parseEntry(entry);
                if (parsed)
                    messages.push(...parsed);
            }
            catch {
                // Skip malformed lines
            }
        }
    }
    catch (error) {
        logger_1.logger.error('Error reading subagent messages:', error);
    }
    return messages;
}
/**
 * List tool result files for a session
 */
async function listToolResults(workspace, sessionId) {
    const toolResultsDir = path.join(PROJECTS_DIR, workspace, sessionId, 'tool-results');
    const results = [];
    try {
        const files = await fs.promises.readdir(toolResultsDir);
        for (const file of files) {
            if (!file.endsWith('.txt'))
                continue;
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
    }
    catch (error) {
        if (error.code !== 'ENOENT') {
            logger_1.logger.error('Error listing tool results:', error);
        }
        return [];
    }
}
/**
 * Read content of a tool result file
 */
async function getToolResultContent(workspace, sessionId, toolUseId, maxSize = 50000) {
    const filePath = path.join(PROJECTS_DIR, workspace, sessionId, 'tool-results', `${toolUseId}.txt`);
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
    }
    catch (error) {
        logger_1.logger.error('Error reading tool result:', error);
        return '';
    }
}
/**
 * Get session folder info (subagents count, tool-results count)
 */
async function getSessionFolderInfo(workspace, sessionId) {
    const sessionDir = path.join(PROJECTS_DIR, workspace, sessionId);
    let subagentCount = 0;
    let toolResultCount = 0;
    try {
        const subagentsDir = path.join(sessionDir, 'subagents');
        const files = await fs.promises.readdir(subagentsDir);
        subagentCount = files.filter(f => f.endsWith('.jsonl')).length;
    }
    catch {
        // Directory doesn't exist
    }
    try {
        const toolResultsDir = path.join(sessionDir, 'tool-results');
        const files = await fs.promises.readdir(toolResultsDir);
        toolResultCount = files.filter(f => f.endsWith('.txt')).length;
    }
    catch {
        // Directory doesn't exist
    }
    return { subagentCount, toolResultCount };
}
