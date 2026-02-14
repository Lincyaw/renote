import { useEffect, useState, useRef, useCallback } from 'react';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import json from 'highlight.js/lib/languages/json';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import xml from 'highlight.js/lib/languages/xml';
import markdown from 'highlight.js/lib/languages/markdown';
import yaml from 'highlight.js/lib/languages/yaml';
import sql from 'highlight.js/lib/languages/sql';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import java from 'highlight.js/lib/languages/java';
import latex from 'highlight.js/lib/languages/latex';
import { useToastStore } from '../../store/toastStore';
import { useSwipeBack } from '../../hooks/useSwipeBack';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('json', json);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('css', css);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('go', go);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('java', java);
hljs.registerLanguage('latex', latex);

interface Props {
  filePath: string;
  content: string;
  onBack: () => void;
  scrollToLine?: number;
}

function getLanguage(filePath: string): string | undefined {
  const ext = filePath.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    js: 'javascript', jsx: 'javascript', mjs: 'javascript',
    ts: 'typescript', tsx: 'typescript',
    py: 'python', json: 'json', sh: 'bash', bash: 'bash',
    css: 'css', scss: 'css', less: 'css',
    html: 'html', htm: 'html', xml: 'xml', svg: 'xml',
    md: 'markdown', mdx: 'markdown',
    yml: 'yaml', yaml: 'yaml',
    sql: 'sql', go: 'go', rs: 'rust', java: 'java',
    tex: 'latex', latex: 'latex', sty: 'latex', cls: 'latex', bib: 'latex',
  };
  return ext ? map[ext] : undefined;
}

export default function FileViewer({ filePath, content, onBack, scrollToLine }: Props) {
  const [highlighted, setHighlighted] = useState('');
  const [wordWrap, setWordWrap] = useState(() => localStorage.getItem('fileviewer-wordwrap') === 'true');
  const scrollRef = useRef<HTMLDivElement>(null);
  const language = getLanguage(filePath);

  useSwipeBack({ onSwipeBack: onBack });

  const toggleWordWrap = () => {
    setWordWrap(prev => {
      const next = !prev;
      localStorage.setItem('fileviewer-wordwrap', String(next));
      return next;
    });
  };

  useEffect(() => {
    if (language) {
      try {
        const result = hljs.highlight(content, { language });
        setHighlighted(result.value);
      } catch {
        setHighlighted('');
      }
    } else {
      setHighlighted('');
    }
  }, [content, language]);

  // Scroll to target line
  useEffect(() => {
    if (scrollToLine && scrollRef.current) {
      const row = scrollRef.current.querySelector(`[data-line="${scrollToLine}"]`);
      if (row) {
        setTimeout(() => row.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
      }
    }
  }, [scrollToLine, highlighted]);

  const handleCopyPath = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(filePath);
      useToastStore.getState().addToast({ type: 'success', message: 'Path copied' });
    } catch { /* no-op */ }
  }, [filePath]);

  const lines = content.split('\n');
  const codeCls = `text-xs font-mono px-3 py-0 text-gray-300 ${wordWrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'}`;

  // Breadcrumb segments
  const pathParts = filePath.split('/').filter(Boolean);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-gray-800 flex items-center gap-2">
        <button onClick={onBack} className="text-sm text-blue-400 hover:text-blue-300 shrink-0">
          &larr;
        </button>

        {/* Breadcrumb path */}
        <div className="flex items-center gap-0.5 min-w-0 overflow-x-auto scrollbar-none">
          {pathParts.map((part, i) => {
            const isLast = i === pathParts.length - 1;
            return (
              <span key={i} className="flex items-center gap-0.5 shrink-0">
                {i > 0 && <span className="text-gray-600 text-xs">/</span>}
                <button
                  onClick={handleCopyPath}
                  className={`text-xs font-mono hover:text-blue-400 transition-colors ${
                    isLast ? 'text-gray-200' : 'text-gray-500'
                  }`}
                  title="Click to copy path"
                >
                  {part}
                </button>
              </span>
            );
          })}
        </div>

        <span className="text-xs text-gray-600 ml-auto shrink-0">{lines.length} lines</span>
        <button
          onClick={toggleWordWrap}
          className={`text-xs px-2 py-0.5 rounded shrink-0 ${
            wordWrap
              ? 'bg-blue-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:text-gray-300'
          }`}
          title={wordWrap ? 'Disable word wrap' : 'Enable word wrap'}
        >
          Wrap
        </button>
      </div>

      {/* Code */}
      <div ref={scrollRef} className="flex-1 overflow-auto bg-gray-900">
        <table className={`w-full border-collapse${wordWrap ? ' table-fixed' : ''}`}>
          <tbody>
            {highlighted ? (
              content.split('\n').map((_, i) => {
                const lineHtml = highlighted.split('\n')[i] || '';
                const isTarget = scrollToLine === i + 1;
                return (
                  <tr
                    key={i}
                    data-line={i + 1}
                    className={`hover:bg-gray-800/30 ${isTarget ? 'bg-yellow-500/10' : ''}`}
                  >
                    <td className="text-right text-gray-600 text-xs font-mono px-3 py-0 select-none w-12 align-top border-r border-gray-800">
                      {i + 1}
                    </td>
                    <td
                      className={codeCls}
                      dangerouslySetInnerHTML={{ __html: lineHtml || '&nbsp;' }}
                    />
                  </tr>
                );
              })
            ) : (
              lines.map((line, i) => {
                const isTarget = scrollToLine === i + 1;
                return (
                  <tr
                    key={i}
                    data-line={i + 1}
                    className={`hover:bg-gray-800/30 ${isTarget ? 'bg-yellow-500/10' : ''}`}
                  >
                    <td className="text-right text-gray-600 text-xs font-mono px-3 py-0 select-none w-12 align-top border-r border-gray-800">
                      {i + 1}
                    </td>
                    <td className={codeCls}>
                      {line || '\u00A0'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
