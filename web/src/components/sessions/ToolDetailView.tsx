import type { SessionMessage } from '../../types';

interface Props {
  toolUse: SessionMessage;
  toolResult?: SessionMessage;
  onBack: () => void;
}

export default function ToolDetailView({ toolUse, toolResult, onBack }: Props) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-800">
        <button onClick={onBack} className="text-sm text-blue-400 hover:text-blue-300 mb-1">
          &larr; Back
        </button>
        <div className="text-sm font-medium text-gray-200">
          {toolUse.toolName || 'Unknown Tool'}
        </div>
        <div className="text-xs text-gray-500 mt-0.5">
          {new Date(toolUse.timestamp).toLocaleString()}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Input */}
        <div>
          <h3 className="text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">Input</h3>
          <pre className="bg-gray-800 rounded-lg p-3 text-xs text-gray-300 font-mono whitespace-pre-wrap overflow-x-auto max-h-80">
            {toolUse.toolInput
              ? JSON.stringify(toolUse.toolInput, null, 2)
              : 'No input data'}
          </pre>
        </div>

        {/* Result */}
        {toolResult && (
          <div>
            <h3 className="text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">Result</h3>
            <pre className="bg-gray-800 rounded-lg p-3 text-xs text-gray-300 font-mono whitespace-pre-wrap overflow-x-auto max-h-96">
              {toolResult.content}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
