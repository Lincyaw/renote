import { useMemo } from 'react';
import { wsClient } from '../../services/websocket';
import { useSwipeBack } from '../../hooks/useSwipeBack';

interface Props {
  filePath: string;
  fileType: 'pdf' | 'image';
  onBack: () => void;
}

function buildFileUrl(filePath: string): string | null {
  const params = wsClient.getConnectionParams();
  if (!params) return null;
  // Use current page origin when served from the same HTTP server (port = ws+1),
  // otherwise construct URL from connection params
  const isSameServer = window.location.port === String(params.port + 1);
  const base = isSameServer
    ? window.location.origin
    : `${window.location.protocol}//${params.host}:${params.port + 1}`;
  const url = new URL(`${base}/api/file`);
  url.searchParams.set('path', filePath);
  url.searchParams.set('token', params.token);
  return url.toString();
}

export default function BinaryViewer({ filePath, fileType, onBack }: Props) {
  useSwipeBack({ onSwipeBack: onBack });

  const url = useMemo(() => buildFileUrl(filePath), [filePath]);
  const fileName = filePath.split('/').pop() || filePath;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-gray-800 flex items-center gap-2">
        <button onClick={onBack} className="text-sm text-blue-400 hover:text-blue-300 shrink-0">
          &larr;
        </button>
        <span className="text-xs font-mono text-gray-200 truncate">{fileName}</span>
        <span className="text-xs text-gray-600 ml-auto shrink-0 uppercase">{fileType}</span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto bg-gray-900 flex items-center justify-center">
        {!url ? (
          <span className="text-sm text-gray-500">Not connected</span>
        ) : fileType === 'pdf' ? (
          <iframe
            src={url}
            className="w-full h-full border-0"
            title={fileName}
          />
        ) : (
          <img
            src={url}
            alt={fileName}
            className="max-w-full max-h-full object-contain"
          />
        )}
      </div>
    </div>
  );
}
