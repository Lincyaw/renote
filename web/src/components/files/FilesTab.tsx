import { useState, useEffect, useCallback } from 'react';
import { useFilesStore } from '../../store/filesStore';
import { useConnectionStore } from '../../store/connectionStore';
import { wsClient } from '../../services/websocket';
import FileTree from './FileTree';
import FileViewer from './FileViewer';
import FileSearch from './FileSearch';
import GitFileList from './GitFileList';
import GitDiffViewer from './GitDiffViewer';
import BinaryViewer from './BinaryViewer';
import WorkspaceSelector from './WorkspaceSelector';
import EmptyState from '../shared/EmptyState';
import type { GitFileStatus } from '../../types';

const PDF_EXTENSIONS = new Set(['.pdf']);
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico']);

function getBinaryFileType(filePath: string): 'pdf' | 'image' | null {
  const ext = ('.' + (filePath.split('.').pop() || '')).toLowerCase();
  if (PDF_EXTENSIONS.has(ext)) return 'pdf';
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  return null;
}

type FileView =
  | { type: 'tree' }
  | { type: 'file'; path: string; content: string; scrollToLine?: number }
  | { type: 'binary'; path: string; fileType: 'pdf' | 'image' }
  | { type: 'diff' }
  | { type: 'search' };

export default function FilesTab() {
  const { viewMode, isGitRepo, diffFilePath, rootPath, workspacePath } = useFilesStore();
  const wsStatus = useConnectionStore(s => s.status.ws);
  const [fileView, setFileView] = useState<FileView>({ type: 'tree' });
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);

  // Resolve a relative file path to absolute using rootPath
  const resolveAbsolutePath = useCallback((relativePath: string): string => {
    const base = rootPath || '';
    if (relativePath.startsWith('/')) return relativePath;
    return base ? `${base}/${relativePath}` : relativePath;
  }, [rootPath]);

  // Load file tree on connect or workspace change
  useEffect(() => {
    if (wsStatus === 'connected') {
      wsClient.requestFileTree(workspacePath || undefined);
      wsClient.requestGitCheckRepo(workspacePath || undefined);
    }
  }, [wsStatus, workspacePath]);

  const handleFileSelect = useCallback((path: string, scrollToLine?: number) => {
    const absolutePath = resolveAbsolutePath(path);

    // Check for binary file types (PDF, images) - route directly to BinaryViewer
    const binaryType = getBinaryFileType(path);
    if (binaryType) {
      setFileView({ type: 'binary', path: absolutePath, fileType: binaryType });
      return;
    }

    setFileLoading(true);
    setFileContent(null);

    wsClient.send({ type: 'file_read', path: absolutePath });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ws = (wsClient as any).ws as WebSocket | null;
    if (ws) {
      const originalOnMessage = ws.onmessage;
      ws.onmessage = (event: MessageEvent) => {
        originalOnMessage?.call(ws, event);

        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'file_read_response') {
            setFileLoading(false);
            ws.onmessage = originalOnMessage;

            if (msg.error) {
              setFileContent('Error: ' + msg.error);
              setFileView({ type: 'file', path, content: 'Error: ' + msg.error });
            } else if (msg.data?.isBinary) {
              // Server detected binary - check if it's a previewable type
              const fallbackType = getBinaryFileType(path);
              if (fallbackType) {
                setFileView({ type: 'binary', path: absolutePath, fileType: fallbackType });
              } else {
                setFileContent('[Binary file]');
                setFileView({ type: 'file', path, content: '[Binary file]' });
              }
            } else if (msg.data?.content !== undefined) {
              setFileContent(msg.data.content);
              setFileView({ type: 'file', path, content: msg.data.content, scrollToLine });
            }
          }
        } catch { /* ignore */ }
      };

      setTimeout(() => {
        if (fileLoading) {
          setFileLoading(false);
          ws.onmessage = originalOnMessage;
        }
      }, 10000);
    }
  }, [fileLoading, resolveAbsolutePath]);

  const handleSearchResultSelect = useCallback((filePath: string, line?: number) => {
    handleFileSelect(filePath, line);
  }, [handleFileSelect]);

  const handleGitFileSelect = useCallback((file: GitFileStatus) => {
    wsClient.requestFileDiff(file.path, file.staged, workspacePath || undefined);
  }, [workspacePath]);

  const handleBackToTree = useCallback(() => {
    setFileView({ type: 'tree' });
    setFileContent(null);
  }, []);

  const handleBackFromDiff = useCallback(() => {
    useFilesStore.getState().clearDiff();
  }, []);

  const handleRefreshTree = useCallback(() => {
    wsClient.requestFileTree(workspacePath || undefined);
  }, [workspacePath]);

  const handleRefreshGit = useCallback(() => {
    wsClient.requestGitStatus(workspacePath || undefined);
  }, [workspacePath]);

  const handleToggleSearch = useCallback(() => {
    setFileView(prev => prev.type === 'search' ? { type: 'tree' } : { type: 'search' });
  }, []);

  const handleSwitchWorkspace = useCallback((path: string | null) => {
    useFilesStore.getState().switchWorkspace(path);
    setFileView({ type: 'tree' });
    setFileContent(null);
  }, []);

  if (wsStatus !== 'connected') {
    return (
      <EmptyState
        icon={
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
          </svg>
        }
        title="Files"
        description="Connect to a server to browse files."
      />
    );
  }

  // If viewing a binary file (PDF/image)
  if (fileView.type === 'binary') {
    return (
      <BinaryViewer
        filePath={fileView.path}
        fileType={fileView.fileType}
        onBack={handleBackToTree}
      />
    );
  }

  // If viewing a file
  if (fileView.type === 'file' && fileContent !== null) {
    return (
      <FileViewer
        filePath={fileView.path}
        content={fileView.content}
        onBack={handleBackToTree}
        scrollToLine={fileView.scrollToLine}
      />
    );
  }

  // If viewing a diff
  if (viewMode === 'git' && diffFilePath) {
    return <GitDiffViewer onBack={handleBackFromDiff} />;
  }

  // If searching
  if (fileView.type === 'search') {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800">
          <button
            onClick={handleToggleSearch}
            className="text-sm text-blue-400 hover:text-blue-300"
          >
            &larr; Back
          </button>
          <span className="text-sm text-gray-300">Search</span>
        </div>
        <FileSearch onResultSelect={handleSearchResultSelect} workspacePath={workspacePath} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800">
        <WorkspaceSelector
          currentPath={rootPath}
          onSwitch={handleSwitchWorkspace}
        />
        {isGitRepo && (
          <div className="flex bg-gray-800 rounded-lg overflow-hidden">
            <button
              onClick={() => useFilesStore.getState().setViewMode('normal')}
              className={`px-3 py-1 text-xs transition-colors ${
                viewMode === 'normal' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Files
            </button>
            <button
              onClick={() => {
                useFilesStore.getState().setViewMode('git');
                wsClient.requestGitStatus(workspacePath || undefined);
              }}
              className={`px-3 py-1 text-xs transition-colors ${
                viewMode === 'git' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Git
            </button>
          </div>
        )}
        <div className="flex-1" />
        <button
          onClick={handleToggleSearch}
          className="text-xs text-gray-400 hover:text-gray-200 px-2"
          title="Search files"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>
        <button
          onClick={viewMode === 'git' ? handleRefreshGit : handleRefreshTree}
          className="text-xs text-gray-400 hover:text-gray-200 px-2"
        >
          Refresh
        </button>
      </div>

      {/* Content */}
      {fileLoading ? (
        <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">Loading file...</div>
      ) : viewMode === 'git' ? (
        <GitFileList onFileSelect={handleGitFileSelect} workspacePath={workspacePath} />
      ) : (
        <FileTree onFileSelect={handleFileSelect} />
      )}
    </div>
  );
}
