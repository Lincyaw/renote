import { useState, useEffect, useCallback } from 'react';
import { useFilesStore } from '../../store/filesStore';
import { useConnectionStore } from '../../store/connectionStore';
import { wsClient } from '../../services/websocket';
import FileTree from './FileTree';
import FileViewer from './FileViewer';
import GitFileList from './GitFileList';
import GitDiffViewer from './GitDiffViewer';
import type { GitFileStatus } from '../../types';

type FileView =
  | { type: 'tree' }
  | { type: 'file'; path: string; content: string }
  | { type: 'diff' };

export default function FilesTab() {
  const { viewMode, isGitRepo, diffFilePath } = useFilesStore();
  const wsStatus = useConnectionStore(s => s.status.ws);
  const [fileView, setFileView] = useState<FileView>({ type: 'tree' });
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);

  // Load file tree on connect
  useEffect(() => {
    if (wsStatus === 'connected') {
      wsClient.requestFileTree();
      wsClient.requestGitCheckRepo();
    }
  }, [wsStatus]);

  const handleFileSelect = useCallback((path: string) => {
    setFileLoading(true);
    setFileContent(null);

    // Send file read request and intercept the response
    wsClient.send({ type: 'file_read', path });

    // Access the raw WebSocket to intercept the response
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
            } else if (msg.data?.content !== undefined) {
              setFileContent(msg.data.content);
              setFileView({ type: 'file', path, content: msg.data.content });
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
  }, [fileLoading]);

  const handleGitFileSelect = useCallback((file: GitFileStatus) => {
    wsClient.requestFileDiff(file.path, file.staged);
  }, []);

  const handleBackToTree = useCallback(() => {
    setFileView({ type: 'tree' });
    setFileContent(null);
  }, []);

  const handleBackFromDiff = useCallback(() => {
    useFilesStore.getState().clearDiff();
  }, []);

  const handleRefreshTree = useCallback(() => {
    wsClient.requestFileTree();
  }, []);

  const handleRefreshGit = useCallback(() => {
    wsClient.requestGitStatus();
  }, []);

  if (wsStatus !== 'connected') {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
        Connect to a server to browse files.
      </div>
    );
  }

  // If viewing a file
  if (fileView.type === 'file' && fileContent !== null) {
    return <FileViewer filePath={fileView.path} content={fileView.content} onBack={handleBackToTree} />;
  }

  // If viewing a diff
  if (viewMode === 'git' && diffFilePath) {
    return <GitDiffViewer onBack={handleBackFromDiff} />;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800">
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
                wsClient.requestGitStatus();
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
        <GitFileList onFileSelect={handleGitFileSelect} />
      ) : (
        <FileTree onFileSelect={handleFileSelect} />
      )}
    </div>
  );
}
