import { useState, useEffect, useRef } from 'react';
import Sidebar from './Sidebar';
import BottomNav from './BottomNav';
import ConnectionStatus from './ConnectionStatus';
import Toast from './Toast';
import WelcomeScreen from './WelcomeScreen';
import DisconnectOverlay from './DisconnectOverlay';
import { useConnectionStore } from '../../store/connectionStore';

import ConfigTab from '../config/ConfigTab';
import TerminalTab from '../terminal/TerminalTab';
import ClaudeTab from '../sessions/ClaudeTab';
import FilesTab from '../files/FilesTab';

export type TabId = 'terminal' | 'sessions' | 'files' | 'config';

interface TabDef {
  id: TabId;
  label: string;
  icon: string;
}

export const TABS: TabDef[] = [
  { id: 'terminal', label: 'Terminal', icon: '>_' },
  { id: 'sessions', label: 'Sessions', icon: 'AI' },
  { id: 'files', label: 'Files', icon: 'F' },
  { id: 'config', label: 'Config', icon: '*' },
];

export default function AppShell() {
  const [activeTab, setActiveTab] = useState<TabId>('terminal');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [isTablet, setIsTablet] = useState(window.innerWidth >= 768 && window.innerWidth < 1024);

  const wsStatus = useConnectionStore(s => s.status.ws);
  const isAutoReconnecting = useConnectionStore(s => s.isAutoReconnecting);
  const wasConnected = useRef(false);

  // Track if user has ever connected (to distinguish first-use vs disconnect)
  useEffect(() => {
    if (wsStatus === 'connected') {
      wasConnected.current = true;
    }
  }, [wsStatus]);

  const showWelcome = wsStatus === 'disconnected' && !wasConnected.current && !isAutoReconnecting;
  const showDisconnectOverlay = wsStatus === 'disconnected' && wasConnected.current && isAutoReconnecting;

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
      setIsTablet(window.innerWidth >= 768 && window.innerWidth < 1024);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        const tabKeys: Record<string, TabId> = {
          '1': 'terminal',
          '2': 'sessions',
          '3': 'files',
          '4': 'config',
        };
        const tab = tabKeys[e.key];
        if (tab) {
          e.preventDefault();
          setActiveTab(tab);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const renderContent = () => {
    switch (activeTab) {
      case 'terminal':
        return <TerminalTab />;
      case 'sessions':
        return <ClaudeTab />;
      case 'files':
        return <FilesTab />;
      case 'config':
        return <ConfigTab />;
      default:
        return null;
    }
  };

  // Show welcome screen when not connected and never connected
  if (showWelcome) {
    return (
      <div className="h-full flex flex-col bg-gray-950 text-gray-100 overflow-hidden">
        <Toast />
        <WelcomeScreen />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-950 text-gray-100 overflow-hidden">
      <Toast />
      <div className="flex flex-1 overflow-hidden">
        {/* Desktop/Tablet sidebar */}
        {!isMobile && (
          <Sidebar
            tabs={TABS}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            collapsed={isTablet}
          />
        )}

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          <div className="flex items-center justify-between border-b border-gray-800 bg-gray-900/50">
            <div className="px-4 py-2 text-sm font-medium text-gray-300">
              {TABS.find(t => t.id === activeTab)?.label}
            </div>
            <ConnectionStatus />
          </div>

          <div className="flex-1 overflow-hidden animate-fade-slide-in" key={activeTab}>
            {renderContent()}
          </div>

          {/* Disconnect overlay */}
          {showDisconnectOverlay && <DisconnectOverlay reconnectDelay={5000} />}
        </div>
      </div>

      {/* Mobile bottom nav */}
      {isMobile && (
        <BottomNav
          tabs={TABS}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      )}
    </div>
  );
}
