import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, LayoutAnimation, Platform, UIManager, BackHandler } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { navigationRef } from '../navigation/AppNavigator';
import TerminalTab from '../components/TerminalTab';
import ClaudeTab from '../components/ClaudeTab';
import FilesTab from '../components/FilesTab';
import ConfigTab from '../components/ConfigTab';
import ConnectionStatusBar from '../components/ConnectionStatusBar';
import ConnectionPromptModal from '../components/ConnectionPromptModal';
import ErrorBoundary from '../components/ErrorBoundary';
import { TerminalIcon, SessionsIcon, FilesIcon, MeIcon } from '../components/ui/TabIcon';
import { useConnectionStore } from '../store/connectionStore';
import { useFilesStore } from '../store/filesStore';
import { wsClient } from '../services/websocket';
import { offlineCache } from '../services/offlineCache';
import { ServerConfig } from '../types';
import { colors, spacing, typography, animation } from '../theme';

// Enable LayoutAnimation for Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type TabType = 'terminal' | 'claude' | 'files' | 'config';

interface TabConfig {
  key: TabType;
  label: string;
  icon: (props: { color: string; size: number }) => React.ReactNode;
}

const TABS: TabConfig[] = [
  { key: 'terminal', label: 'Terminal', icon: ({ color, size }) => <TerminalIcon color={color} size={size} /> },
  { key: 'claude', label: 'Sessions', icon: ({ color, size }) => <SessionsIcon color={color} size={size} /> },
  { key: 'files', label: 'Files', icon: ({ color, size }) => <FilesIcon color={color} size={size} /> },
  { key: 'config', label: 'Me', icon: ({ color, size }) => <MeIcon color={color} size={size} /> },
];

export default function MainScreen() {
  const [activeTab, setActiveTab] = useState<TabType>('config');
  const [showConnectionModal, setShowConnectionModal] = useState(false);
  const [lastServer, setLastServer] = useState<ServerConfig | null>(null);
  const { disconnect, status } = useConnectionStore();
  const filesStore = useFilesStore();

  const isConnected = status.ws === 'connected';

  // 递归检查导航状态树，判断是否有嵌套的子导航器可以返回
  const canNestedNavigatorGoBack = useCallback((state: any): boolean => {
    if (!state || !state.routes) return false;

    const currentRoute = state.routes[state.index];
    // 如果当前路由有嵌套状态，递归检查
    if (currentRoute?.state) {
      // 嵌套导航器有多个路由，说明可以返回
      if (currentRoute.state.routes && currentRoute.state.routes.length > 1) {
        return true;
      }
      // 继续递归检查更深层的嵌套
      return canNestedNavigatorGoBack(currentRoute.state);
    }

    return false;
  }, []);

  // 处理 Android 返回键/手势
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      // Files Tab 使用自己的 store 管理导航状态
      if (activeTab === 'files' && filesStore.canGoBack()) {
        filesStore.goBack();
        return true;
      }

      // Claude Tab 和 Config Tab 使用 React Navigation 嵌套导航器
      // 由于我们手动渲染 Tab 内容，navigationRef.canGoBack() 只检查根导航器
      // 需要检查嵌套导航器的状态
      if (navigationRef.isReady()) {
        const rootState = navigationRef.getRootState();
        if (canNestedNavigatorGoBack(rootState)) {
          navigationRef.goBack();
          return true;
        }
      }

      // 如果所有导航器都在根页面，允许默认行为（退出应用）
      return false;
    });

    return () => backHandler.remove();
  }, [activeTab, filesStore, canNestedNavigatorGoBack]);

  // 检测未连接状态并弹窗提示
  useEffect(() => {
    const checkConnection = async () => {
      if (!isConnected) {
        try {
          const server = await offlineCache.getLastServer();
          if (server) {
            setLastServer(server);
            setShowConnectionModal(true);
          }
        } catch (error) {
          // 忽略错误
        }
      }
    };
    checkConnection();
  }, []);

  const handleDisconnect = useCallback(() => {
    wsClient.disconnect();
    disconnect();
  }, [disconnect]);

  const handleTabChange = useCallback((tab: TabType) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setActiveTab(tab);
  }, []);

  const renderTab = () => {
    switch (activeTab) {
      case 'terminal': return <TerminalTab />;
      case 'claude': return <ClaudeTab />;
      case 'files': return <FilesTab />;
      case 'config': return <ConfigTab />;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ConnectionStatusBar onPress={isConnected ? handleDisconnect : undefined} />

      <ErrorBoundary>
        <View style={styles.content} testID={`${activeTab}-tab`}>
          {renderTab()}
        </View>
      </ErrorBoundary>

      <View style={styles.tabBar}>
        {TABS.map((tab) => (
          <TabButton
            key={tab.key}
            label={tab.label}
            isActive={activeTab === tab.key}
            onPress={() => handleTabChange(tab.key)}
            icon={tab.icon}
          />
        ))}
      </View>

      <ConnectionPromptModal
        visible={showConnectionModal}
        onClose={() => setShowConnectionModal(false)}
        serverConfig={lastServer}
      />
    </SafeAreaView>
  );
}

interface TabButtonProps {
  label: string;
  isActive: boolean;
  onPress: () => void;
  icon: (props: { color: string; size: number }) => React.ReactNode;
}

const TabButton = React.memo(function TabButton({
  label,
  isActive,
  onPress,
  icon,
}: TabButtonProps) {
  const iconColor = isActive ? colors.primary : colors.text.tertiary;
  return (
    <TouchableOpacity
      style={styles.tab}
      onPress={onPress}
      activeOpacity={animation.activeOpacity}
    >
      <View style={styles.tabIconContainer}>
        {icon({ color: iconColor, size: 24 })}
      </View>
      <Text style={[styles.tabText, isActive && styles.activeTabText]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  content: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border.secondary,
    backgroundColor: colors.background.primary,
    paddingBottom: spacing.xs,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  tabIconContainer: {
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  tabText: {
    fontSize: 10,
    fontWeight: typography.weight.medium,
    color: colors.text.tertiary,
  },
  activeTabText: {
    color: colors.primary,
  },
});
