import { useState, useCallback, useEffect } from 'react';
import { useConnectionStore } from '../../store/connectionStore';
import { useSessionBrowserStore } from '../../store/sessionBrowserStore';
import { wsClient } from '../../services/websocket';
import WorkspaceList from './WorkspaceList';
import SessionList from './SessionList';
import ConversationView from './ConversationView';
import SubagentView from './SubagentView';
import ToolDetailView from './ToolDetailView';
import RecentSessions from './RecentSessions';
import EmptyState from '../shared/EmptyState';
import type { WorkspaceInfo, SessionInfo, SessionMessage } from '../../types';

type View =
  | { type: 'workspaces' }
  | { type: 'sessions'; workspace: WorkspaceInfo }
  | { type: 'conversation'; workspaceDirName: string; sessionId?: string }
  | { type: 'subagent'; workspaceDirName: string; sessionId: string; agentId: string }
  | { type: 'tool'; toolUse: SessionMessage; toolResult?: SessionMessage; prevView: View };

export default function ClaudeTab() {
  const [view, setView] = useState<View>({ type: 'workspaces' });
  const wsStatus = useConnectionStore(s => s.status.ws);
  const workspaces = useSessionBrowserStore(s => s.workspaces);

  // Single workspace auto-skip
  useEffect(() => {
    if (view.type === 'workspaces' && workspaces.length === 1 && workspaces[0]) {
      setView({ type: 'sessions', workspace: workspaces[0] });
    }
  }, [workspaces, view.type]);

  const handleWorkspaceSelect = useCallback((workspace: WorkspaceInfo) => {
    setView({ type: 'sessions', workspace });
  }, []);

  const handleSessionSelect = useCallback((session: SessionInfo) => {
    if (view.type !== 'sessions') return;
    setView({
      type: 'conversation',
      workspaceDirName: view.workspace.dirName,
      sessionId: session.sessionId,
    });
  }, [view]);

  // Direct session select from RecentSessions
  const handleRecentSelect = useCallback((workspaceDirName: string, session: SessionInfo) => {
    setView({
      type: 'conversation',
      workspaceDirName,
      sessionId: session.sessionId,
    });
  }, []);

  const handleNewConversation = useCallback(() => {
    if (view.type !== 'sessions') return;
    useSessionBrowserStore.getState().clearSessionData();
    setView({
      type: 'conversation',
      workspaceDirName: view.workspace.dirName,
      sessionId: undefined,
    });
  }, [view]);

  const handleBackToWorkspaces = useCallback(() => {
    setView({ type: 'workspaces' });
  }, []);

  const handleBackToSessions = useCallback(() => {
    if (view.type === 'conversation' || view.type === 'subagent') {
      wsClient.unwatchSession();
      const workspacesState = useSessionBrowserStore.getState().workspaces;
      const dirName = view.workspaceDirName;
      const workspace = workspacesState.find(w => w.dirName === dirName);
      if (workspace) {
        setView({ type: 'sessions', workspace });
      } else {
        setView({ type: 'workspaces' });
      }
    }
  }, [view]);

  const handleSubagentSelect = useCallback((agentId: string) => {
    if (view.type !== 'conversation' || !view.sessionId) return;
    wsClient.requestSubagentMessages(view.workspaceDirName, view.sessionId, agentId);
    setView({
      type: 'subagent',
      workspaceDirName: view.workspaceDirName,
      sessionId: view.sessionId,
      agentId,
    });
  }, [view]);

  const handleBackFromSubagent = useCallback(() => {
    if (view.type !== 'subagent') return;
    setView({
      type: 'conversation',
      workspaceDirName: view.workspaceDirName,
      sessionId: view.sessionId,
    });
  }, [view]);

  const handleToolPress = useCallback((toolUse: SessionMessage, toolResult?: SessionMessage) => {
    setView({ type: 'tool', toolUse, toolResult, prevView: view });
  }, [view]);

  const handleBackFromTool = useCallback(() => {
    if (view.type === 'tool' && view.prevView) {
      setView(view.prevView);
    } else {
      setView({ type: 'workspaces' });
    }
  }, [view]);

  if (wsStatus !== 'connected') {
    return (
      <EmptyState
        icon={
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
          </svg>
        }
        title="Sessions"
        description="Connect to a server to browse sessions."
      />
    );
  }

  switch (view.type) {
    case 'workspaces':
      return (
        <div className="flex flex-col h-full">
          <RecentSessions onSelect={handleRecentSelect} />
          <div className="flex-1 overflow-hidden">
            <WorkspaceList onSelect={handleWorkspaceSelect} />
          </div>
        </div>
      );

    case 'sessions':
      return (
        <SessionList
          workspaceDirName={view.workspace.dirName}
          onSelect={handleSessionSelect}
          onBack={handleBackToWorkspaces}
          onNewConversation={handleNewConversation}
        />
      );

    case 'conversation':
      return (
        <ConversationView
          workspaceDirName={view.workspaceDirName}
          sessionId={view.sessionId}
          onBack={handleBackToSessions}
          onSubagentSelect={handleSubagentSelect}
          onToolPress={handleToolPress}
        />
      );

    case 'subagent':
      return (
        <SubagentView
          workspaceDirName={view.workspaceDirName}
          sessionId={view.sessionId}
          agentId={view.agentId}
          onBack={handleBackFromSubagent}
          onToolPress={handleToolPress}
        />
      );

    case 'tool':
      return (
        <ToolDetailView
          toolUse={view.toolUse}
          toolResult={view.toolResult}
          onBack={handleBackFromTool}
        />
      );
  }
}
