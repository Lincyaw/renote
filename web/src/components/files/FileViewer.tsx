import { useEffect, useState } from 'react';
import hljs from 'highlight.js/lib/core';
// Register common languages
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

interface Props {
  filePath: string;
  content: string;
  onBack: () => void;
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
  };
  return ext ? map[ext] : undefined;
}

export default function FileViewer({ filePath, content, onBack }: Props) {
  const [highlighted, setHighlighted] = useState('');
  const fileName = filePath.split('/').pop() || filePath;
  const language = getLanguage(filePath);

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

  const lines = content.split('\n');

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-gray-800 flex items-center gap-2">
        <button onClick={onBack} className="text-sm text-blue-400 hover:text-blue-300">
          &larr; Back
        </button>
        <span className="text-sm text-gray-300 font-mono truncate">{fileName}</span>
        <span className="text-xs text-gray-600 ml-auto shrink-0">{lines.length} lines</span>
      </div>

      {/* Code */}
      <div className="flex-1 overflow-auto bg-gray-900">
        <table className="w-full border-collapse">
          <tbody>
            {highlighted ? (
              // Highlighted mode: split by lines
              content.split('\n').map((_, i) => {
                // Extract each line from the highlighted HTML
                const lineHtml = highlighted.split('\n')[i] || '';
                return (
                  <tr key={i} className="hover:bg-gray-800/30">
                    <td className="text-right text-gray-600 text-xs font-mono px-3 py-0 select-none w-12 align-top border-r border-gray-800">
                      {i + 1}
                    </td>
                    <td
                      className="text-xs font-mono px-3 py-0 text-gray-300 whitespace-pre"
                      dangerouslySetInnerHTML={{ __html: lineHtml || '&nbsp;' }}
                    />
                  </tr>
                );
              })
            ) : (
              // Plain text mode
              lines.map((line, i) => (
                <tr key={i} className="hover:bg-gray-800/30">
                  <td className="text-right text-gray-600 text-xs font-mono px-3 py-0 select-none w-12 align-top border-r border-gray-800">
                    {i + 1}
                  </td>
                  <td className="text-xs font-mono px-3 py-0 text-gray-300 whitespace-pre">
                    {line || '\u00A0'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
