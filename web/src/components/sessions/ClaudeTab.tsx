import { useState, useCallback } from 'react';
import { useConnectionStore } from '../../store/connectionStore';
import { useSessionBrowserStore } from '../../store/sessionBrowserStore';
import { wsClient } from '../../services/websocket';
import WorkspaceList from './WorkspaceList';
import SessionList from './SessionList';
import ConversationView from './ConversationView';
import SubagentView from './SubagentView';
import ToolDetailView from './ToolDetailView';
import type { WorkspaceInfo, SessionInfo, SessionMessage } from '../../types';

type View =
  | { type: 'workspaces' }
  | { type: 'sessions'; workspace: WorkspaceInfo }
  | { type: 'conversation'; workspaceDirName: string; sessionId?: string }
  | { type: 'subagent'; workspaceDirName: string; sessionId: string; agentId: string }
  | { type: 'tool'; toolUse: SessionMessage; toolResult?: SessionMessage };

export default function ClaudeTab() {
  const [view, setView] = useState<View>({ type: 'workspaces' });
  const wsStatus = useConnectionStore(s => s.status.ws);

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
      // Find the workspace from dirName
      const workspaces = useSessionBrowserStore.getState().workspaces;
      const dirName = view.workspaceDirName;
      const workspace = workspaces.find(w => w.dirName === dirName);
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
    setView({ type: 'tool', toolUse, toolResult });
  }, []);

  const handleBackFromTool = useCallback(() => {
    // Go back to previous view - we'd need a history stack for proper back
    // For simplicity, go to workspaces
    setView({ type: 'workspaces' });
  }, []);

  if (wsStatus !== 'connected') {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
        Connect to a server to browse sessions.
      </div>
    );
  }

  switch (view.type) {
    case 'workspaces':
      return <WorkspaceList onSelect={handleWorkspaceSelect} />;

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
