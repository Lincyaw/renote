import { useState, useCallback } from 'react';
import type { SessionMessage } from '../../types';

interface Props {
  toolUse: SessionMessage;
  toolResult?: SessionMessage;
  onBack: () => void;
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* no-op */ }
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors px-2 py-0.5 rounded bg-gray-700/50"
    >
      {copied ? 'Copied!' : (label || 'Copy')}
    </button>
  );
}

export default function ToolDetailView({ toolUse, toolResult, onBack }: Props) {
  const inputText = toolUse.toolInput
    ? JSON.stringify(toolUse.toolInput, null, 2)
    : 'No input data';

  const isError = toolResult?.content?.toLowerCase().includes('error') ||
                  toolResult?.content?.toLowerCase().includes('failed') ||
                  toolResult?.content?.startsWith('Error:');

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-800">
        <button onClick={onBack} className="text-sm text-blue-400 hover:text-blue-300 mb-1">
          &larr; Back
        </button>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-200">
            {toolUse.toolName || 'Unknown Tool'}
          </span>
          {toolResult && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
              isError ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'
            }`}>
              {isError ? 'Error' : 'Success'}
            </span>
          )}
        </div>
        <div className="text-xs text-gray-500 mt-0.5">
          {new Date(toolUse.timestamp).toLocaleString()}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Input */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider">Input</h3>
            <CopyButton text={inputText} />
          </div>
          <pre className="bg-gray-800 rounded-lg p-3 text-xs text-gray-300 font-mono whitespace-pre-wrap overflow-x-auto max-h-80">
            {inputText}
          </pre>
        </div>

        {/* Result */}
        {toolResult && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider">Result</h3>
              <CopyButton text={toolResult.content} />
            </div>
            <pre className={`bg-gray-800 rounded-lg p-3 text-xs text-gray-300 font-mono whitespace-pre-wrap overflow-x-auto max-h-96 border-l-2 ${
              isError ? 'border-l-red-500' : 'border-l-green-500'
            }`}>
              {toolResult.content}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
