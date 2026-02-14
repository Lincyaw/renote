# Renote Web UX Improvements Plan

**Date**: 2026-02-09
**Target**: Web client (mobile-first, monitor + operate)
**Scope**: Experience polish, feature completion, mobile optimization, visual upgrade

---

## Part 1: First-Use & Connection Experience

### 1.1 Welcome / Connect Screen

When disconnected, replace the empty tab content with a centered connection card:

- Renote logo + tagline ("Remote Claude Code Monitor")
- Host / Port / Token inputs (reuse ConfigTab logic)
- Connect button
- Auto-switch to Terminal or Sessions tab on success

ConfigTab remains for changing settings or disconnecting when already connected.

**Files to modify**:
- `AppShell.tsx` — check connection status, render WelcomeScreen when disconnected
- New: `components/layout/WelcomeScreen.tsx` — connection form component
- `store/connectionStore.ts` — no changes, reuse existing state

### 1.2 Disconnection Overlay

When connection drops during use, show a semi-transparent overlay on the main content area:

- "Connection Lost" message
- Auto-reconnect countdown display
- "Reconnect Now" button
- Overlay is semi-transparent — existing content remains visible underneath

**Files to modify**:
- New: `components/layout/DisconnectOverlay.tsx`
- `AppShell.tsx` — conditionally render overlay

### 1.3 Connection Status Indicator Upgrade

Replace the plain text + dot indicator with a signal-strength icon (3 bars):

- 3 bars filled = connected + good
- 2 bars filled = connected + degraded (pulse animation)
- 1 bar filled = connected + poor (pulse animation)
- 0 bars + red = disconnected
- Animated spinner when connecting/reconnecting

**Files to modify**:
- `components/layout/ConnectionStatus.tsx` — replace with SVG signal icon

---

## Part 2: Sessions (Conversation Browser) Improvements

### 2.1 Recent Sessions Shortcut

Add a horizontal scrolling "Recent" section at the top of the Sessions tab:

- Show 5-8 most recently active sessions across all workspaces
- Card format: workspace name (shortened) + last message preview + relative time
- Click goes directly to conversation view (skip workspace + session selection)
- Below it: "All Workspaces" section with existing full list

**Implementation**:
- Server already returns `lastModified` per session — need a new message type or aggregate on client
- Simpler approach: after loading workspaces, auto-load sessions for top 3 workspaces, sort by modified, take top 8
- New: `components/sessions/RecentSessions.tsx`
- Modify: `ClaudeTab.tsx` — add RecentSessions above WorkspaceList

### 2.2 Single Workspace Auto-Skip

If only 1 workspace exists, automatically show its session list instead of workspace list.

**Files to modify**:
- `ClaudeTab.tsx` — check workspaces.length === 1 after load, auto-navigate

### 2.3 Code Block Enhancements

For markdown-rendered code blocks in conversation messages:

- **Copy button**: Top-right corner of each code block, shows "Copied!" feedback
- **Collapse**: Blocks > 15 lines default collapsed, show first 5 lines + "Show more (N lines)"
- **Language label**: Display detected language tag (e.g., `typescript`, `bash`)

**Implementation**:
- Custom `code` and `pre` components passed to ReactMarkdown's `components` prop
- New: `components/sessions/CodeBlock.tsx` — handles copy, collapse, language label
- Modify: `ConversationView.tsx` — pass custom components to ReactMarkdown

### 2.4 Tool Use Card Enrichment

Improve tool_use display with more context:

- Smart parameter summary:
  - Read: show file path → `Read: src/app.tsx`
  - Bash: show command → `Bash: npm test`
  - Edit: show file + line count → `Edit: 3 lines in config.ts`
  - Write: show file path → `Write: src/new-file.ts`
- Success/failure status: green/red left border based on tool_result content
- Copy button in detail view for tool input and result

**Files to modify**:
- `ConversationView.tsx` — update MessageBubble tool_use rendering
- `ToolDetailView.tsx` — add copy buttons

### 2.5 In-Conversation Search

Add a search icon in conversation header, expands to search bar on click:

- Client-side filter on loaded messages
- Highlight matching text in message bubbles
- Up/down arrows to navigate between matches
- Dismiss with Escape or X button

**Files to modify**:
- `ConversationView.tsx` — add search state, filter/highlight logic
- CSS: highlight styling for matches

---

## Part 3: Files & Terminal Improvements

### 3.1 File Search (Feature Completion)

Server already supports `search` message type (ripgrep) but web doesn't use it.

- Add search bar at top of Files tab with two modes: "Filename" / "Content"
- Content search: sends to server, results grouped by file with matching lines
- Filename search: client-side fuzzy match on loaded tree
- Click result → opens FileViewer at the matched line

**Implementation**:
- `websocket.ts` — add `requestSearch(query, path)` method and response handler
- `filesStore.ts` — add `searchResults`, `searchQuery`, `searchMode` state
- New: `components/files/FileSearch.tsx`
- Modify: `FilesTab.tsx` — integrate search above tree/git view
- Modify: `FileViewer.tsx` — accept optional `scrollToLine` prop

### 3.2 File Path Actions

- File viewer header: click path to copy (toast: "Path copied")
- Breadcrumb-style path segments: click any segment to navigate tree to that directory
- "Open in Terminal" button: `cd <dir>` in active terminal session, or create new one

**Files to modify**:
- `FileViewer.tsx` — add copy + breadcrumb + terminal button
- `terminalSessionStore.ts` — add `sendCommand(sessionId, command)` helper

### 3.3 Git Diff Enhancement

- Show change counts per file (`+12 -3`) in GitFileList
- "Copy diff" button in GitDiffViewer header
- Visual distinction: staged section green-tinted header bar, unstaged yellow-tinted

**Files to modify**:
- `GitFileList.tsx` — parse and display line change counts
- `GitDiffViewer.tsx` — add copy button, improve header styling

### 3.4 Terminal Tab Switching

- `Ctrl+Tab` / `Ctrl+Shift+Tab`: cycle between terminal sessions
- `Ctrl+1..9`: switch to session by index
- Replace desktop sidebar session list with a compact horizontal tab bar (like browser tabs)

**Files to modify**:
- `TerminalTab.tsx` — add keyboard listeners, refactor layout to tab bar
- New: `components/terminal/TerminalTabBar.tsx`

### 3.5 Terminal Session Naming

- Double-click session name to rename (inline edit)
- Auto-generate meaningful name from first command or cwd

**Files to modify**:
- `TerminalSessionList.tsx` / `TerminalTabBar.tsx` — inline rename on double-click
- `terminalSessionStore.ts` — add `renameSession` action

---

## Part 4: Mobile-Specific Optimizations

### 4.1 Bottom Navigation Upgrade

- Replace text icons (`>_`, `AI`, `F`, `*`) with SVG icons
- Active tab: filled icon + subtle background highlight
- Activity indicators: dot badge on Sessions (new messages), pulse on Terminal (active output)

**Files to modify**:
- `BottomNav.tsx` — replace text with SVG icons, add badge logic
- `Sidebar.tsx` — same SVG icons for consistency
- New: `components/icons/` — TabIcon SVG components (or inline SVGs)

### 4.2 Mobile Terminal Session Switcher

Replace `<select>` dropdown with swipeable pill tabs:

- Horizontal scrolling capsule tabs
- Current session highlighted
- Swipe left/right gesture on terminal area to switch sessions
- Long-press on tab → action menu (rename, close, kill)

**Files to modify**:
- `TerminalTab.tsx` — replace mobile `<select>` with pill tab component
- New: `components/terminal/MobileSessionTabs.tsx`
- Touch gesture handling via native touch events or lightweight library

### 4.3 Conversation Mobile Adaptation

- Message bubbles: `max-w-[95%]` on mobile (from 85%)
- Input textarea: single line by default, expand on focus
- Code blocks: horizontal scroll with momentum, or pinch-to-zoom
- Reduce vertical padding in message list for density

**Files to modify**:
- `ConversationView.tsx` — responsive max-width, input behavior
- `CodeBlock.tsx` — touch-friendly overflow handling

### 4.4 File Tree Mobile Optimization

- Reduce indent per level: 12px (from ~20px)
- Long filenames: middle-truncate (`src/comp...View.tsx`)
- Larger touch targets for expand/collapse (min 44px height)
- Swipe-right on file item to reveal quick actions (copy path, open in terminal)

**Files to modify**:
- `FileTree.tsx` — adjust indent, truncation, touch targets

### 4.5 Global Gestures

- Left-edge swipe right: navigate back (conversation → session list, file viewer → tree)
- Replaces the need to reach for the "← Back" button in top-left

**Implementation**:
- New: `hooks/useSwipeBack.ts` — touch event listener on left edge (0-20px)
- Apply to: `ConversationView`, `FileViewer`, `SubagentView`, `ToolDetailView`

---

## Part 5: Visual Design Upgrade

### 5.1 Color System Unification

Define CSS custom properties in `index.css`:

```css
:root {
  --color-accent: theme(colors.blue.500);
  --color-accent-secondary: theme(colors.purple.500);
  --color-surface-1: theme(colors.gray.950);
  --color-surface-2: theme(colors.gray.900);
  --color-surface-3: theme(colors.gray.800);
  --color-text-primary: theme(colors.gray.100);
  --color-text-secondary: theme(colors.gray.400);
  --color-text-tertiary: theme(colors.gray.500);
  --color-border: theme(colors.gray.800);
  --color-success: theme(colors.green.500);
  --color-warning: theme(colors.yellow.500);
  --color-error: theme(colors.red.500);
}
```

Migrate hardcoded Tailwind colors to these variables across all components.

### 5.2 Spacing & Typography Standardization

- Body text: 14px (`text-sm`)
- Secondary text: 12px (`text-xs`)
- Headings: 16px (`text-base`) semibold
- List item height: minimum 48px (44px touch target + 4px padding)
- Card padding: `p-3` (12px) consistently
- Section gaps: `gap-2` (8px) within groups, `gap-4` (16px) between sections

### 5.3 Micro-Interactions

- Tab switch: content fade-in with slight upward slide (150ms ease-out)
- List items: press feedback (scale 0.98 on active)
- Connection status: pulse animation on degraded/poor
- Toast: slide in from right + fade, slide out on dismiss
- Button hover: subtle brightness shift rather than background color swap

**Implementation**:
- Add Tailwind animation utilities in `tailwind.config.js` or `index.css`
- Apply `transition-*` classes to interactive elements
- Use `@keyframes` for pulse and slide animations

### 5.4 Empty State Design

Replace plain gray text empty states with structured layouts:

- Each empty state: icon (48px) + title (16px semibold) + description (14px gray) + action button
- Terminal empty: terminal icon + "No active sessions" + "Create a Shell" button
- Sessions empty: chat icon + "No conversations yet" + "Browse Workspaces"
- Files empty: folder icon + "Connect to browse files" + "Refresh"
- Use consistent vertical centering and spacing

**Files to modify**:
- New: `components/shared/EmptyState.tsx` — reusable empty state component
- Update: `TerminalTab.tsx`, `WorkspaceList.tsx`, `SessionList.tsx`, `FilesTab.tsx`

---

## Implementation Priority

Recommended order (each phase independently shippable):

### Phase 1: Quick Wins (1-2 days)
- 1.1 Welcome screen
- 1.2 Disconnect overlay
- 2.3 Code block copy button
- 4.1 SVG icons for navigation
- 5.4 Empty states

### Phase 2: Core UX (2-3 days)
- 2.1 Recent sessions
- 2.2 Single workspace auto-skip
- 2.4 Tool use card enrichment
- 3.4 Terminal tab switching
- 4.2 Mobile session switcher

### Phase 3: Feature Completion (2-3 days)
- 3.1 File search
- 3.2 File path actions
- 2.5 In-conversation search
- 3.5 Terminal session naming

### Phase 4: Polish (1-2 days)
- 5.1 Color system
- 5.2 Spacing standardization
- 5.3 Micro-interactions
- 1.3 Connection status icon
- 3.3 Git diff enhancement
- 4.3 Conversation mobile adaptation
- 4.4 File tree mobile optimization
- 4.5 Global gestures
