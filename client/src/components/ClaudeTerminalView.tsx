import React, { useEffect, useState } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import { ClaudeTerminalScreenProps } from '../navigation/types';
import { useTerminalSessionStore } from '../store/terminalSessionStore';
import TerminalView from './terminal/TerminalView';

export default function ClaudeTerminalView() {
  const navigation = useNavigation<ClaudeTerminalScreenProps['navigation']>();
  const route = useRoute<ClaudeTerminalScreenProps['route']>();
  const { terminalSessionId, claudeSessionId, cwd } = route.params;

  const { createSession } = useTerminalSessionStore();
  const [sessionId, setSessionId] = useState<string | null>(terminalSessionId || null);

  useEffect(() => {
    if (!sessionId) {
      const claudeArgs: string[] = [];
      if (claudeSessionId) {
        claudeArgs.push('--resume', claudeSessionId);
      }
      const newSession = createSession('claude', {
        claudeArgs: claudeArgs.length > 0 ? claudeArgs : undefined,
        cwd,
      });
      setSessionId(newSession.id);
    }
  }, [sessionId, claudeSessionId, cwd, createSession]);

  const handleBack = () => {
    navigation.goBack();
  };

  if (!sessionId) {
    return null;
  }

  return <TerminalView sessionId={sessionId} onBack={handleBack} />;
}
