import { create } from 'zustand';
import type { FileNode, GitFileStatus } from '../types';

export type { FileNode, GitFileStatus };

type ViewMode = 'normal' | 'git';

interface FilesState {
  fileTree: FileNode | null;
  rootPath: string | null;
  selectedFile: string | null;
  loading: boolean;
  error: string | null;
  expandedDirs: Set<string>;
  loadingDirs: Set<string>;
  truncated: boolean;
  accessErrors: string[];
  viewMode: ViewMode;
  isGitRepo: boolean;
  gitFiles: GitFileStatus[];
  gitLoading: boolean;
  diffContent: string | null;
  diffFilePath: string | null;
  diffLoading: boolean;

  setFileTree: (tree: FileNode | null, rootPath?: string, truncated?: boolean, accessErrors?: string[]) => void;
  setSelectedFile: (path: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setExpandedDir: (path: string, expanded: boolean) => void;
  setLoadingDir: (path: string, loading: boolean) => void;
  setDirectoryChildren: (path: string, children: FileNode[]) => void;
  setTruncated: (truncated: boolean) => void;
  addAccessErrors: (errors: string[]) => void;
  setViewMode: (mode: ViewMode) => void;
  toggleViewMode: () => void;
  setIsGitRepo: (isGit: boolean) => void;
  setGitFiles: (files: GitFileStatus[]) => void;
  setGitLoading: (loading: boolean) => void;
  setDiffContent: (content: string | null, filePath: string | null) => void;
  setDiffLoading: (loading: boolean) => void;
  clearDiff: () => void;
}

export const useFilesStore = create<FilesState>((set) => ({
  fileTree: null,
  rootPath: null,
  selectedFile: null,
  loading: true,
  error: null,
  expandedDirs: new Set<string>(),
  loadingDirs: new Set<string>(),
  truncated: false,
  accessErrors: [],
  viewMode: 'normal',
  isGitRepo: false,
  gitFiles: [],
  gitLoading: false,
  diffContent: null,
  diffFilePath: null,
  diffLoading: false,

  setFileTree: (tree, rootPath, truncated = false, accessErrors = []) => set({
    fileTree: tree,
    rootPath: rootPath ?? null,
    truncated,
    accessErrors,
    loading: false,
    error: null,
    expandedDirs: new Set<string>(),
    loadingDirs: new Set<string>(),
  }),
  setSelectedFile: (path) => set({ selectedFile: path }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error, loading: false }),
  setExpandedDir: (path, expanded) => set((state) => {
    const newSet = new Set(state.expandedDirs);
    if (expanded) newSet.add(path); else newSet.delete(path);
    return { expandedDirs: newSet };
  }),
  setLoadingDir: (path, loading) => set((state) => {
    const newSet = new Set(state.loadingDirs);
    if (loading) newSet.add(path); else newSet.delete(path);
    return { loadingDirs: newSet };
  }),
  setDirectoryChildren: (path, children) => set((state) => {
    if (!state.fileTree) return state;
    const updateNode = (node: FileNode): FileNode => {
      if (node.path === path) return { ...node, children, hasChildren: children.length > 0 };
      if (node.children) return { ...node, children: node.children.map(updateNode) };
      return node;
    };
    return { fileTree: updateNode(state.fileTree) };
  }),
  setTruncated: (truncated) => set({ truncated }),
  addAccessErrors: (errors) => set((state) => ({
    accessErrors: [...new Set([...state.accessErrors, ...errors])],
  })),
  setViewMode: (mode) => set({ viewMode: mode }),
  toggleViewMode: () => set((state) => ({
    viewMode: state.viewMode === 'normal' ? 'git' : 'normal',
    diffContent: null,
    diffFilePath: null,
  })),
  setIsGitRepo: (isGit) => set({ isGitRepo: isGit }),
  setGitFiles: (files) => set({ gitFiles: files, gitLoading: false }),
  setGitLoading: (loading) => set({ gitLoading: loading }),
  setDiffContent: (content, filePath) => set({ diffContent: content, diffFilePath: filePath, diffLoading: false }),
  setDiffLoading: (loading) => set({ diffLoading: loading }),
  clearDiff: () => set({ diffContent: null, diffFilePath: null }),
}));
