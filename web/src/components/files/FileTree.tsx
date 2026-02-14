import { useCallback } from 'react';
import { useFilesStore } from '../../store/filesStore';
import { wsClient } from '../../services/websocket';
import type { FileNode } from '../../types';

interface Props {
  onFileSelect: (path: string) => void;
}

function TreeNode({ node, depth, onFileSelect }: {
  node: FileNode;
  depth: number;
  onFileSelect: (path: string) => void;
}) {
  const { expandedDirs, loadingDirs, rootPath } = useFilesStore();
  const isExpanded = expandedDirs.has(node.path);
  const isLoading = loadingDirs.has(node.path);
  const isDir = node.type === 'directory';

  const handleClick = useCallback(() => {
    if (isDir) {
      if (isExpanded) {
        useFilesStore.getState().setExpandedDir(node.path, false);
      } else if (node.children) {
        useFilesStore.getState().setExpandedDir(node.path, true);
      } else {
        wsClient.requestExpandDirectory(node.path, rootPath ?? undefined);
      }
    } else {
      onFileSelect(node.path);
    }
  }, [isDir, isExpanded, node.path, node.children, rootPath, onFileSelect]);

  const indent = depth * 12;

  return (
    <>
      <button
        onClick={handleClick}
        className="w-full text-left flex items-center gap-1.5 py-1.5 px-2 hover:bg-gray-800/50 active:bg-gray-800 transition-colors group min-h-[36px] md:min-h-0 md:py-1 press-feedback"
        style={{ paddingLeft: indent + 8 }}
      >
        {isDir ? (
          <span className="text-xs text-gray-500 w-4 text-center shrink-0">
            {isLoading ? '...' : isExpanded ? 'v' : '>'}
          </span>
        ) : (
          <span className="w-4 shrink-0" />
        )}

        <span className={`text-xs truncate ${
          isDir ? 'text-blue-400' : 'text-gray-300'
        } ${node.accessDenied ? 'text-red-400' : ''}`}>
          {isDir ? '/' : ''}{node.name}
        </span>

        {node.size !== undefined && node.size > 0 && !isDir && (
          <span className="text-[10px] text-gray-600 ml-auto shrink-0">
            {formatSize(node.size)}
          </span>
        )}
      </button>

      {isDir && isExpanded && node.children && (
        node.children.map((child) => (
          <TreeNode
            key={child.path}
            node={child}
            depth={depth + 1}
            onFileSelect={onFileSelect}
          />
        ))
      )}
    </>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}

export default function FileTree({ onFileSelect }: Props) {
  const { fileTree, loading, truncated, accessErrors } = useFilesStore();

  if (loading) {
    return <div className="p-4 text-center text-gray-500 text-sm">Loading file tree...</div>;
  }

  if (!fileTree) {
    return <div className="p-4 text-center text-gray-500 text-sm">No file tree loaded</div>;
  }

  return (
    <div className="flex flex-col h-full">
      {truncated && (
        <div className="px-3 py-1.5 bg-yellow-900/30 text-yellow-400 text-xs border-b border-gray-800">
          Tree truncated (too many files)
        </div>
      )}
      {accessErrors.length > 0 && (
        <div className="px-3 py-1.5 bg-red-900/30 text-red-400 text-xs border-b border-gray-800">
          {accessErrors.length} access errors
        </div>
      )}

      <div className="flex-1 overflow-y-auto font-mono">
        {fileTree.children?.map((child) => (
          <TreeNode
            key={child.path}
            node={child}
            depth={0}
            onFileSelect={onFileSelect}
          />
        ))}
      </div>
    </div>
  );
}
