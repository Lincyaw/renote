import { useState, useCallback, useEffect, useRef } from 'react';
import { useFilesStore, type SearchResult } from '../../store/filesStore';
import { wsClient } from '../../services/websocket';

interface Props {
  onResultSelect: (filePath: string, line?: number) => void;
  workspacePath?: string | null;
}

export default function FileSearch({ onResultSelect, workspacePath }: Props) {
  const { searchQuery, searchMode, searchResults, searchLoading } = useFilesStore();
  const [localQuery, setLocalQuery] = useState(searchQuery);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setSearchMode = useFilesStore.getState().setSearchMode;
  const setSearchQuery = useFilesStore.getState().setSearchQuery;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const executeSearch = useCallback((query: string) => {
    if (!query.trim()) {
      useFilesStore.getState().clearSearch();
      return;
    }

    setSearchQuery(query);

    if (searchMode === 'content') {
      wsClient.requestSearch(query, workspacePath || undefined, { maxResults: 50 });
    } else {
      // Filename search: client-side against file tree
      const tree = useFilesStore.getState().fileTree;
      if (!tree) return;

      const results: SearchResult[] = [];
      const lowerQuery = query.toLowerCase();

      const walkTree = (node: { name: string; path: string; type: string; children?: Array<{ name: string; path: string; type: string; children?: unknown[] }> }) => {
        if (node.name.toLowerCase().includes(lowerQuery)) {
          results.push({
            file: node.path,
            line: 0,
            column: 0,
            content: node.name,
            match: query,
          });
        }
        if (node.children) {
          for (const child of node.children) {
            walkTree(child as typeof node);
            if (results.length >= 50) break;
          }
        }
      };

      walkTree(tree as unknown as { name: string; path: string; type: string; children?: Array<{ name: string; path: string; type: string; children?: unknown[] }> });
      useFilesStore.getState().setSearchResults(results);
    }
  }, [searchMode, setSearchQuery]);

  const handleChange = useCallback((value: string) => {
    setLocalQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => executeSearch(value), 300);
  }, [executeSearch]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      useFilesStore.getState().clearSearch();
      setLocalQuery('');
    } else if (e.key === 'Enter') {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      executeSearch(localQuery);
    }
  }, [localQuery, executeSearch]);

  const handleClear = useCallback(() => {
    useFilesStore.getState().clearSearch();
    setLocalQuery('');
    inputRef.current?.focus();
  }, []);

  // Group results by file
  const grouped = searchResults.reduce<Record<string, SearchResult[]>>((acc, r) => {
    const key = r.file;
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});

  return (
    <div className="flex flex-col h-full">
      {/* Search bar */}
      <div className="px-3 py-2 border-b border-gray-800 space-y-2">
        <div className="flex gap-1.5">
          <input
            ref={inputRef}
            type="text"
            value={localQuery}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={searchMode === 'content' ? 'Search file contents...' : 'Search filenames...'}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
          />
          {localQuery && (
            <button onClick={handleClear} className="text-xs text-gray-500 hover:text-gray-300 px-1.5">
              x
            </button>
          )}
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => { setSearchMode('content'); if (localQuery) executeSearch(localQuery); }}
            className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
              searchMode === 'content' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400'
            }`}
          >
            Content
          </button>
          <button
            onClick={() => { setSearchMode('filename'); if (localQuery) executeSearch(localQuery); }}
            className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
              searchMode === 'filename' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400'
            }`}
          >
            Filename
          </button>
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {searchLoading ? (
          <div className="p-4 text-center text-gray-500 text-sm">Searching...</div>
        ) : localQuery && searchResults.length === 0 ? (
          <div className="p-4 text-center text-gray-500 text-sm">No results found</div>
        ) : !localQuery ? (
          <div className="p-4 text-center text-gray-500 text-sm">Type to search</div>
        ) : (
          <div className="divide-y divide-gray-800/50">
            {Object.entries(grouped).map(([file, results]) => (
              <div key={file} className="py-1">
                <div className="px-3 py-1 text-[10px] text-gray-500 font-mono truncate">{file}</div>
                {results.map((result, i) => (
                  <button
                    key={`${file}_${result.line}_${i}`}
                    onClick={() => onResultSelect(result.file, result.line)}
                    className="w-full text-left px-3 py-1.5 hover:bg-gray-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {searchMode === 'content' && (
                        <span className="text-[10px] text-gray-600 font-mono shrink-0 w-8 text-right">
                          {result.line}
                        </span>
                      )}
                      <span className="text-xs text-gray-300 truncate font-mono">
                        {result.content}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
