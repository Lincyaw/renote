import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import 'highlight.js/styles/github-dark.css';
import { useSessionBrowserStore } from '../../store/sessionBrowserStore';
import { wsClient } from '../../services/websocket';
import { CodeBlock, PreBlock } from './CodeBlock';
import { useSwipeBack } from '../../hooks/useSwipeBack';
import type { SessionMessage, SubagentInfo } from '../../types';

interface Props {
  workspaceDirName: string;
  sessionId?: string;
  onBack: () => void;
  onSubagentSelect: (agentId: string) => void;
  onToolPress: (toolUse: SessionMessage, toolResult?: SessionMessage) => void;
}

const PAGE_SIZE = 50;

const PERMISSION_OPTIONS = [
  { id: 'bash', label: 'Bash', tool: 'Bash' },
  { id: 'edit', label: 'Edit', tool: 'Edit' },
  { id: 'write', label: 'Write', tool: 'Write' },
  { id: 'read', label: 'Read', tool: 'Read' },
  { id: 'web', label: 'Web', tool: 'WebFetch' },
];

function isJsonContent(content: string): boolean {
  const trimmed = content.trim();
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try { JSON.parse(trimmed); return true; } catch { return false; }
  }
  return false;
}

function getToolSummary(toolName?: string, toolInput?: Record<string, unknown>): string | null {
  if (!toolName || !toolInput) return null;

  switch (toolName) {
    case 'Read':
      return typeof toolInput.file_path === 'string' ? toolInput.file_path.split('/').slice(-2).join('/') : null;
    case 'Bash':
      return typeof toolInput.command === 'string' ? toolInput.command.substring(0, 50) : null;
    case 'Edit': {
      const filePath = typeof toolInput.file_path === 'string' ? toolInput.file_path.split('/').pop() : null;
      const oldStr = typeof toolInput.old_string === 'string' ? toolInput.old_string : '';
      const newStr = typeof toolInput.new_string === 'string' ? toolInput.new_string : '';
      const lines = Math.max(oldStr.split('\n').length, newStr.split('\n').length);
      return filePath ? `${lines} lines in ${filePath}` : null;
    }
    case 'Write':
      return typeof toolInput.file_path === 'string' ? toolInput.file_path.split('/').slice(-2).join('/') : null;
    case 'Glob':
      return typeof toolInput.pattern === 'string' ? toolInput.pattern : null;
    case 'Grep':
      return typeof toolInput.pattern === 'string' ? toolInput.pattern : null;
    case 'WebFetch':
      return typeof toolInput.url === 'string' ? toolInput.url.substring(0, 50) : null;
    case 'Task':
      return typeof toolInput.description === 'string' ? toolInput.description : null;
    default:
      return null;
  }
}

function MessageBubble({ item, allMessages, onToolPress }: {
  item: SessionMessage;
  allMessages: SessionMessage[];
  onToolPress: (toolUse: SessionMessage, toolResult?: SessionMessage) => void;
}) {
  if (item.type === 'user') {
    return (
      <div className="flex justify-end mb-3">
        <div className="bg-blue-600 rounded-2xl px-4 py-2.5 max-w-[95%] md:max-w-[85%]">
          <div className="text-[10px] text-blue-200 mb-0.5">User</div>
          <div className="text-sm text-white whitespace-pre-wrap">{item.content}</div>
        </div>
      </div>
    );
  }

  if (item.type === 'assistant') {
    const isJson = isJsonContent(item.content);
    return (
      <div className="flex justify-start mb-3">
        <div className="bg-gray-800 rounded-2xl px-4 py-2.5 max-w-[95%] md:max-w-[85%] overflow-hidden">
          <div className="text-[10px] text-gray-400 mb-0.5">Assistant</div>
          {isJson ? (
            <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap overflow-x-auto">{item.content}</pre>
          ) : (
            <div className="prose prose-invert prose-sm max-w-none [&_pre]:bg-gray-900 [&_pre]:rounded-lg [&_pre]:p-3 [&_code]:text-xs [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
                components={{
                  pre: PreBlock,
                  code: ({ className, children, ...props }) => {
                    // Inline code vs block code
                    const isBlock = className?.includes('language-') || className?.includes('hljs');
                    if (isBlock) {
                      return <CodeBlock className={className} {...props}>{children}</CodeBlock>;
                    }
                    return <code className={className} {...props}>{children}</code>;
                  },
                }}
              >
                {item.content}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (item.type === 'tool_use') {
    const toolResult = allMessages.find(
      m => m.type === 'tool_result' && m.uuid.includes(item.uuid.replace('_tool', ''))
    );

    // Determine success/failure from result
    const isError = toolResult?.content?.toLowerCase().includes('error') ||
                    toolResult?.content?.toLowerCase().includes('failed') ||
                    toolResult?.content?.startsWith('Error:');
    const borderColor = toolResult
      ? (isError ? 'border-l-red-500' : 'border-l-green-500')
      : 'border-l-gray-600';

    // Smart parameter summary
    const toolSummary = getToolSummary(item.toolName, item.toolInput);

    return (
      <div className="flex justify-start mb-2">
        <button
          onClick={() => onToolPress(item, toolResult)}
          className={`bg-gray-800/60 border border-gray-700 border-l-2 ${borderColor} rounded-lg px-3 py-2 max-w-[95%] md:max-w-[85%] hover:bg-gray-800 transition-colors text-left press-feedback`}
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-blue-400">{item.toolName || 'Tool'}</span>
            {toolSummary && (
              <>
                <span className="text-gray-600">:</span>
                <span className="text-xs text-gray-400 truncate font-mono">{toolSummary}</span>
              </>
            )}
          </div>
          {toolResult && !toolSummary && (
            <div className="text-[10px] text-gray-500 mt-1 truncate font-mono">
              {toolResult.content.substring(0, 60)}...
            </div>
          )}
        </button>
      </div>
    );
  }

  return null;
}

function SubagentItem({ item, onPress }: { item: SubagentInfo; onPress: (id: string) => void }) {
  return (
    <button
      onClick={() => onPress(item.agentId)}
      className="w-full text-left bg-gray-800 border border-gray-700 rounded-lg p-3 mb-2 hover:bg-gray-750 transition-colors"
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-gray-200">{item.slug || item.agentId}</span>
        <span className="text-xs text-gray-500">{item.messageCount} msgs</span>
      </div>
      <div className="text-xs text-gray-400 line-clamp-2">
        {item.firstPrompt.length > 100 ? item.firstPrompt.substring(0, 100) + '...' : item.firstPrompt}
      </div>
    </button>
  );
}

export default function ConversationView({ workspaceDirName, sessionId: initialSessionId, onBack, onSubagentSelect, onToolPress }: Props) {
  const [currentSessionId, setCurrentSessionId] = useState(initialSessionId);
  const [inputMessage, setInputMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [activeTab, setActiveTab] = useState<'messages' | 'subagents'>('messages');
  const [allowedTools, setAllowedTools] = useState<string[]>([]);
  const [showPermissions, setShowPermissions] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMatchIndex, setSearchMatchIndex] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const {
    messages, loading, subagents, sessionFolderInfo,
    hasMoreMessages, oldestMessageIndex, loadingMore,
  } = useSessionBrowserStore();

  const isNewConversation = !currentSessionId;

  useEffect(() => {
    if (currentSessionId) {
      wsClient.requestSubagents(workspaceDirName, currentSessionId);
      wsClient.requestSessionFolderInfo(workspaceDirName, currentSessionId);
    }
  }, [workspaceDirName, currentSessionId]);

  useEffect(() => {
    const unsubscribe = wsClient.onSendClaudeMessageResponse((data) => {
      setIsSending(false);
      if (data.success && data.sessionId && !currentSessionId) {
        setCurrentSessionId(data.sessionId);
        wsClient.watchSession(workspaceDirName, data.sessionId);
        wsClient.requestSessionMessagesPage(workspaceDirName, data.sessionId);
      }
    });
    return () => unsubscribe();
  }, [workspaceDirName, currentSessionId]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const filteredMessages = useMemo(
    () => messages.filter(m => m.type === 'user' || m.type === 'assistant' || m.type === 'tool_use'),
    [messages]
  );

  // Search matches
  const searchMatches = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const lowerQuery = searchQuery.toLowerCase();
    return filteredMessages
      .map((msg, idx) => ({ idx, matches: msg.content.toLowerCase().includes(lowerQuery) }))
      .filter(m => m.matches)
      .map(m => m.idx);
  }, [filteredMessages, searchQuery]);

  // Scroll to current search match
  useEffect(() => {
    if (searchMatches.length > 0 && scrollContainerRef.current) {
      const targetIdx = searchMatches[searchMatchIndex];
      if (targetIdx !== undefined) {
        const el = scrollContainerRef.current.querySelector(`[data-msg-idx="${targetIdx}"]`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [searchMatchIndex, searchMatches]);

  const handleLoadMore = useCallback(() => {
    if (!hasMoreMessages || loadingMore || loading || !currentSessionId) return;
    useSessionBrowserStore.getState().setLoadingMore(true);
    wsClient.requestSessionMessagesPage(workspaceDirName, currentSessionId, PAGE_SIZE, oldestMessageIndex);
  }, [hasMoreMessages, loadingMore, loading, workspaceDirName, currentSessionId, oldestMessageIndex]);

  const handleBack = useCallback(() => {
    wsClient.unwatchSession();
    useSessionBrowserStore.getState().clearSessionData();
    onBack();
  }, [onBack]);

  const handleSendMessage = useCallback(() => {
    if (!inputMessage.trim() || isSending) return;
    setIsSending(true);

    let sessionIdToUse = currentSessionId;
    let newSessionId: string | undefined;
    if (!sessionIdToUse) {
      newSessionId = crypto.randomUUID();
    }

    wsClient.sendClaudeMessage(
      workspaceDirName,
      sessionIdToUse,
      newSessionId,
      inputMessage.trim(),
      allowedTools.length > 0 ? allowedTools : undefined
    );
    setInputMessage('');
  }, [inputMessage, isSending, workspaceDirName, currentSessionId, allowedTools]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  }, [handleSendMessage]);

  const togglePermission = (tool: string) => {
    setAllowedTools(prev =>
      prev.includes(tool) ? prev.filter(t => t !== tool) : [...prev, tool]
    );
  };

  const subagentCount = sessionFolderInfo?.subagentCount || subagents.length;

  useSwipeBack({ onSwipeBack: handleBack });

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-800 flex items-center gap-2">
        <button onClick={handleBack} className="text-sm text-blue-400 hover:text-blue-300">
          &larr; Sessions
        </button>
        <div className="flex-1" />
        {!isNewConversation && (
          <button
            onClick={() => {
              setSearchOpen(!searchOpen);
              if (!searchOpen) setTimeout(() => searchInputRef.current?.focus(), 50);
              if (searchOpen) { setSearchQuery(''); setSearchMatchIndex(0); }
            }}
            className="text-gray-400 hover:text-gray-200 p-1"
            title="Search messages"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>
        )}
      </div>

      {/* Search bar */}
      {searchOpen && (
        <div className="px-3 py-1.5 border-b border-gray-800 flex items-center gap-2 bg-gray-900/80">
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setSearchMatchIndex(0); }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { setSearchOpen(false); setSearchQuery(''); }
              else if (e.key === 'Enter' && searchMatches.length > 0) {
                setSearchMatchIndex(prev => (prev + (e.shiftKey ? -1 : 1) + searchMatches.length) % searchMatches.length);
              }
            }}
            placeholder="Search messages..."
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
          />
          {searchQuery && (
            <span className="text-[10px] text-gray-500 shrink-0">
              {searchMatches.length > 0 ? `${searchMatchIndex + 1}/${searchMatches.length}` : '0/0'}
            </span>
          )}
          {searchMatches.length > 1 && (
            <div className="flex gap-0.5 shrink-0">
              <button
                onClick={() => setSearchMatchIndex(prev => (prev - 1 + searchMatches.length) % searchMatches.length)}
                className="text-xs text-gray-400 hover:text-gray-200 px-1"
              >
                ↑
              </button>
              <button
                onClick={() => setSearchMatchIndex(prev => (prev + 1) % searchMatches.length)}
                className="text-xs text-gray-400 hover:text-gray-200 px-1"
              >
                ↓
              </button>
            </div>
          )}
          <button
            onClick={() => { setSearchOpen(false); setSearchQuery(''); setSearchMatchIndex(0); }}
            className="text-xs text-gray-500 hover:text-gray-300 px-1"
          >
            x
          </button>
        </div>
      )}

      {/* Tab bar */}
      {!isNewConversation && (
        <div className="flex border-b border-gray-800">
          <button
            onClick={() => setActiveTab('messages')}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              activeTab === 'messages' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-500'
            }`}
          >
            Messages
          </button>
          <button
            onClick={() => setActiveTab('subagents')}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              activeTab === 'subagents' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-500'
            }`}
          >
            Subagents {subagentCount > 0 ? `(${subagentCount})` : ''}
          </button>
        </div>
      )}

      {/* Content */}
      {loading && !isNewConversation ? (
        <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">Loading...</div>
      ) : isNewConversation && filteredMessages.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-500 gap-2">
          <div className="text-lg font-medium text-gray-300">New Conversation</div>
          <div className="text-sm">Type a message below to start chatting with Claude</div>
        </div>
      ) : activeTab === 'messages' ? (
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4">
          {/* Load more */}
          {hasMoreMessages && (
            <div className="text-center mb-4">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="text-xs text-blue-400 hover:text-blue-300 disabled:text-gray-600"
              >
                {loadingMore ? 'Loading...' : 'Load earlier messages'}
              </button>
            </div>
          )}

          {filteredMessages.map((msg, i) => (
            <div
              key={msg.uuid + '_' + i}
              data-msg-idx={i}
              className={searchMatches.includes(i) ? 'ring-1 ring-yellow-500/50 rounded-lg' : ''}
            >
              <MessageBubble
                item={msg}
                allMessages={messages}
                onToolPress={onToolPress}
              />
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4">
          {subagents.length === 0 ? (
            <div className="text-center text-gray-500 text-sm mt-8">No subagents</div>
          ) : (
            subagents.map((sa) => (
              <SubagentItem key={sa.agentId} item={sa} onPress={onSubagentSelect} />
            ))
          )}
        </div>
      )}

      {/* Input bar */}
      <div className="border-t border-gray-800 bg-gray-900/50 p-3">
        {/* Permission indicator */}
        {allowedTools.length > 0 && (
          <button
            onClick={() => setShowPermissions(!showPermissions)}
            className="text-xs text-gray-400 bg-gray-800 px-2 py-1 rounded mb-2"
          >
            Permissions: {allowedTools.length} tools
          </button>
        )}

        {/* Permission selector */}
        {showPermissions && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {PERMISSION_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                onClick={() => togglePermission(opt.tool)}
                className={`text-xs px-2 py-1 rounded transition-colors ${
                  allowedTools.includes(opt.tool)
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
            <button
              onClick={() => setAllowedTools([])}
              className="text-xs px-2 py-1 text-gray-500 hover:text-gray-300"
            >
              Clear
            </button>
          </div>
        )}

        <div className="flex gap-2 items-end">
          <button
            onClick={() => setShowPermissions(!showPermissions)}
            className="text-gray-500 hover:text-gray-300 p-1.5 shrink-0"
            title="Permissions"
          >
            *
          </button>
          <textarea
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message... (Enter to send, Shift+Enter for newline)"
            disabled={isSending}
            rows={1}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 resize-none focus:outline-none focus:border-blue-500 disabled:opacity-50 max-h-32"
          />
          <button
            onClick={handleSendMessage}
            disabled={!inputMessage.trim() || isSending}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white text-sm px-4 py-2 rounded-lg transition-colors shrink-0"
          >
            {isSending ? '...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
