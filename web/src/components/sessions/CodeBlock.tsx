import { useState, useCallback } from 'react';

interface CodeBlockProps {
  className?: string;
  children?: React.ReactNode;
}

function getLanguageFromClass(className?: string): string | null {
  if (!className) return null;
  const match = className.match(/language-(\w+)/);
  return match?.[1] ?? null;
}

const COLLAPSE_THRESHOLD = 15;
const PREVIEW_LINES = 5;

export function CodeBlock({ className, children, ...props }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const language = getLanguageFromClass(className);
  const codeText = String(children).replace(/\n$/, '');
  const lines = codeText.split('\n');
  const isLong = lines.length > COLLAPSE_THRESHOLD;
  const shouldCollapse = isLong && !expanded;

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(codeText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: no-op
    }
  }, [codeText]);

  return (
    <div className="relative group my-2">
      {/* Header bar */}
      <div className="flex items-center justify-between bg-gray-800/80 rounded-t-lg px-3 py-1 border-b border-gray-700/50">
        <span className="text-[10px] text-gray-500 font-mono">
          {language || 'code'}
        </span>
        <button
          onClick={handleCopy}
          className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors px-1.5 py-0.5 rounded"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      {/* Code content */}
      <code
        className={`${className || ''} block !rounded-t-none`}
        {...props}
      >
        {shouldCollapse
          ? lines.slice(0, PREVIEW_LINES).join('\n')
          : children
        }
      </code>

      {/* Expand/collapse */}
      {isLong && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full text-center text-[11px] text-blue-400 hover:text-blue-300 bg-gray-900/80 border-t border-gray-700/50 rounded-b-lg py-1.5 transition-colors"
        >
          {expanded ? 'Show less' : `Show more (${lines.length - PREVIEW_LINES} more lines)`}
        </button>
      )}
    </div>
  );
}

/** Wrapper for <pre> to remove default padding when CodeBlock handles it */
export function PreBlock({ children, ...props }: React.HTMLProps<HTMLPreElement>) {
  return (
    <pre {...props} className="!p-0 !m-0 !bg-transparent overflow-hidden rounded-lg">
      {children}
    </pre>
  );
}
