import { useEffect } from 'react';
import { useSessionBrowserStore } from '../../store/sessionBrowserStore';
import { wsClient } from '../../services/websocket';
import type { SessionMessage } from '../../types';

interface Props {
  workspaceDirName: string;
  sessionId: string;
  agentId: string;
  onBack: () => void;
  onToolPress: (toolUse: SessionMessage, toolResult?: SessionMessage) => void;
}

export default function SubagentView({ workspaceDirName, sessionId, agentId, onBack, onToolPress }: Props) {
  const { subagentMessages, subagentLoading, subagents } = useSessionBrowserStore();

  const agent = subagents.find(a => a.agentId === agentId);

  useEffect(() => {
    useSessionBrowserStore.getState().setSubagentLoading(true);
    wsClient.requestSubagentMessages(workspaceDirName, sessionId, agentId);
  }, [workspaceDirName, sessionId, agentId]);

  const filteredMessages = subagentMessages.filter(
    m => m.type === 'user' || m.type === 'assistant' || m.type === 'tool_use'
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-800">
        <button onClick={onBack} className="text-sm text-blue-400 hover:text-blue-300 mb-1">
          &larr; Back to conversation
        </button>
        <div className="text-sm font-medium text-gray-200">
          {agent?.slug || agentId}
        </div>
        {agent && (
          <div className="text-xs text-gray-500 mt-0.5">
            {agent.messageCount} messages
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        {subagentLoading ? (
          <div className="text-center text-gray-500 text-sm mt-8">Loading...</div>
        ) : filteredMessages.length === 0 ? (
          <div className="text-center text-gray-500 text-sm mt-8">No messages</div>
        ) : (
          filteredMessages.map((msg, i) => {
            if (msg.type === 'user') {
              return (
                <div key={msg.uuid + '_' + i} className="flex justify-end mb-3">
                  <div className="bg-blue-600 rounded-2xl px-4 py-2.5 max-w-[85%]">
                    <div className="text-sm text-white whitespace-pre-wrap">{msg.content}</div>
                  </div>
                </div>
              );
            }
            if (msg.type === 'assistant') {
              return (
                <div key={msg.uuid + '_' + i} className="flex justify-start mb-3">
                  <div className="bg-gray-800 rounded-2xl px-4 py-2.5 max-w-[85%]">
                    <div className="text-sm text-gray-200 whitespace-pre-wrap">{msg.content}</div>
                  </div>
                </div>
              );
            }
            if (msg.type === 'tool_use') {
              const toolResult = subagentMessages.find(
                m => m.type === 'tool_result' && m.uuid.includes(msg.uuid.replace('_tool', ''))
              );
              return (
                <div key={msg.uuid + '_' + i} className="flex justify-start mb-2">
                  <button
                    onClick={() => onToolPress(msg, toolResult)}
                    className="bg-gray-800/60 border border-gray-700 rounded-lg px-3 py-2 max-w-[85%] hover:bg-gray-800 transition-colors text-left"
                  >
                    <span className="text-xs text-blue-400 font-mono">{msg.toolName || 'Tool'}</span>
                  </button>
                </div>
              );
            }
            return null;
          })
        )}
      </div>
    </div>
  );
}
