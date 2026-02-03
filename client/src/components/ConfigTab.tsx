import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { createNativeStackNavigator, NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useConnectionStore } from '../store/connectionStore';
import { usePortForwardStore } from '../store/portForwardStore';
import { offlineCache } from '../services/offlineCache';
import { ServerConfig } from '../types';
import MenuItem from './ui/MenuItem';
import MenuGroup from './ui/MenuGroup';
import ConnectionSettingsScreen from './config/ConnectionSettingsScreen';
import SavedServersScreen from './config/SavedServersScreen';
import PortForwardScreen from './config/PortForwardScreen';
import DiagnosticsScreen from './config/DiagnosticsScreen';
import { colors, spacing, typography, radius, animation } from '../theme';

type ConfigStackParamList = {
  Me: undefined;
  ConnectionSettings: undefined;
  SavedServers: undefined;
  PortForward: undefined;
  Diagnostics: undefined;
};

const Stack = createNativeStackNavigator<ConfigStackParamList>();

function ServerIcon() {
  return (
    <View style={styles.serverIconContainer}>
      <View style={styles.serverIconInner} />
    </View>
  );
}

function SavedServersIcon() {
  return (
    <View style={[styles.menuIcon, { backgroundColor: colors.info }]}>
      <View style={styles.listIconLine} />
      <View style={[styles.listIconLine, { width: 12 }]} />
      <View style={[styles.listIconLine, { width: 8 }]} />
    </View>
  );
}

function PortForwardIcon() {
  return (
    <View style={[styles.menuIcon, { backgroundColor: colors.success }]}>
      <Text style={styles.menuIconText}>⇄</Text>
    </View>
  );
}

function AboutIcon() {
  return (
    <View style={[styles.menuIcon, { backgroundColor: colors.text.tertiary }]}>
      <Text style={styles.menuIconText}>i</Text>
    </View>
  );
}

function DiagnosticsIcon() {
  return (
    <View style={[styles.menuIcon, { backgroundColor: colors.warning }]}>
      <Text style={styles.menuIconText}>⚙</Text>
    </View>
  );
}

type MeScreenProps = {
  navigation: NativeStackNavigationProp<ConfigStackParamList, 'Me'>;
};

function MeScreen({ navigation }: MeScreenProps) {
  const { status } = useConnectionStore();
  const { forwards } = usePortForwardStore();
  const [currentServer, setCurrentServer] = useState<ServerConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isConnected = status.ssh === 'connected' && status.ws === 'connected';
  const activeForwards = forwards.filter(f => f.status === 'active').length;

  useEffect(() => {
    loadCurrentServer();
  }, []);

  const loadCurrentServer = async () => {
    try {
      const lastServer = await offlineCache.getLastServer();
      setCurrentServer(lastServer);
    } catch (error) {
      // Ignore
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      {/* Profile Header */}
      <TouchableOpacity
        style={styles.profileCard}
        onPress={() => navigation.navigate('ConnectionSettings')}
        activeOpacity={animation.activeOpacity}
      >
        <View style={styles.profileIcon}>
          <ServerIcon />
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.profileName} numberOfLines={1}>
            {currentServer?.name || '未配置服务器'}
          </Text>
          <View style={styles.profileStatus}>
            {currentServer && (
              <Text style={styles.profileDetail}>
                {currentServer.host}:{currentServer.sshPort}
              </Text>
            )}
            <View style={styles.statusContainer}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: isConnected ? colors.success : colors.error },
                ]}
              />
              <Text style={styles.statusText}>
                {isConnected ? '已连接' : '未连接'}
              </Text>
            </View>
          </View>
        </View>
        <Text style={styles.chevron}>{'›'}</Text>
      </TouchableOpacity>

      {/* Server & Port Forward Group */}
      <MenuGroup>
        <MenuItem
          icon={<SavedServersIcon />}
          label="已保存服务器"
          onPress={() => navigation.navigate('SavedServers')}
        />
        <MenuItem
          icon={<PortForwardIcon />}
          label="端口转发"
          badge={activeForwards > 0 ? activeForwards : undefined}
          onPress={() => navigation.navigate('PortForward')}
        />
        <MenuItem
          icon={<DiagnosticsIcon />}
          label="网络诊断"
          onPress={() => navigation.navigate('Diagnostics')}
        />
      </MenuGroup>

      {/* About Group */}
      <MenuGroup>
        <MenuItem
          icon={<AboutIcon />}
          label="关于"
          value="v1.0.0"
          showChevron={false}
          onPress={() => {}}
        />
      </MenuGroup>
    </ScrollView>
  );
}

export default function ConfigTab() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: colors.background.secondary,
        },
        headerTintColor: colors.primary,
        headerTitleStyle: {
          fontWeight: typography.weight.semibold,
          color: colors.text.primary,
        },
        headerShadowVisible: false,
        contentStyle: {
          backgroundColor: colors.background.secondary,
        },
      }}
    >
      <Stack.Screen
        name="Me"
        component={MeScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ConnectionSettings"
        component={ConnectionSettingsScreen}
        options={{ title: '连接设置' }}
      />
      <Stack.Screen
        name="SavedServers"
        component={SavedServersScreen}
        options={{ title: '已保存服务器' }}
      />
      <Stack.Screen
        name="PortForward"
        component={PortForwardScreen}
        options={{ title: '端口转发' }}
      />
      <Stack.Screen
        name="Diagnostics"
        component={DiagnosticsScreen}
        options={{ title: '网络诊断' }}
      />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.secondary,
  },
  scrollContent: {
    paddingTop: spacing.base,
    paddingBottom: spacing.xxl,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background.secondary,
  },
  // Profile card
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.primary,
    marginHorizontal: spacing.base,
    marginBottom: spacing.base,
    borderRadius: radius.lg,
    padding: spacing.base,
  },
  profileIcon: {
    width: 60,
    height: 60,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.base,
  },
  serverIconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  serverIconInner: {
    width: 28,
    height: 20,
    borderWidth: 2.5,
    borderColor: colors.text.inverse,
    borderRadius: 3,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: typography.size.headline,
    fontWeight: typography.weight.semibold,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  profileStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  profileDetail: {
    fontSize: typography.size.footnote,
    color: colors.text.tertiary,
    marginRight: spacing.md,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.xs,
  },
  statusText: {
    fontSize: typography.size.footnote,
    color: colors.text.tertiary,
  },
  chevron: {
    fontSize: 24,
    color: colors.text.disabled,
  },
  // Menu icons
  menuIcon: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuIconText: {
    color: colors.text.inverse,
    fontSize: 14,
    fontWeight: typography.weight.bold,
  },
  listIconLine: {
    width: 14,
    height: 2,
    backgroundColor: colors.text.inverse,
    borderRadius: 1,
    marginVertical: 1.5,
  },
});
