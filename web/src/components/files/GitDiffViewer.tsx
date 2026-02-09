import { useFilesStore } from '../../store/filesStore';

interface Props {
  onBack: () => void;
}

export default function GitDiffViewer({ onBack }: Props) {
  const { diffContent, diffFilePath, diffLoading } = useFilesStore();

  if (diffLoading) {
    return <div className="p-4 text-center text-gray-500 text-sm">Loading diff...</div>;
  }

  if (!diffContent || !diffFilePath) {
    return <div className="p-4 text-center text-gray-500 text-sm">No diff to show</div>;
  }

  const lines = diffContent.split('\n');

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-gray-800 flex items-center gap-2">
        <button onClick={onBack} className="text-sm text-blue-400 hover:text-blue-300">
          &larr; Back
        </button>
        <span className="text-sm text-gray-300 font-mono truncate">{diffFilePath}</span>
      </div>

      {/* Diff content */}
      <div className="flex-1 overflow-auto bg-gray-900 font-mono text-xs">
        {lines.map((line, i) => {
          let bgClass = '';
          let textClass = 'text-gray-300';

          if (line.startsWith('+') && !line.startsWith('+++')) {
            bgClass = 'bg-green-900/30';
            textClass = 'text-green-300';
          } else if (line.startsWith('-') && !line.startsWith('---')) {
            bgClass = 'bg-red-900/30';
            textClass = 'text-red-300';
          } else if (line.startsWith('@@')) {
            bgClass = 'bg-blue-900/20';
            textClass = 'text-blue-300';
          } else if (line.startsWith('diff') || line.startsWith('index') || line.startsWith('---') || line.startsWith('+++')) {
            textClass = 'text-gray-500';
          }

          return (
            <div key={i} className={`px-3 py-0 whitespace-pre ${bgClass} ${textClass}`}>
              {line || '\u00A0'}
            </div>
          );
        })}
      </div>
    </div>
  );
}
