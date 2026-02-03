import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useConnectionStore } from '../../store/connectionStore';
import { wsClient } from '../../services/websocket';
import { offlineCache } from '../../services/offlineCache';
import { ServerConfig } from '../../types';
import { colors, spacing, typography, radius, animation } from '../../theme';

type Props = {
  navigation: NativeStackNavigationProp<any>;
};

export default function ConnectionSettingsScreen({ navigation }: Props) {
  const [host, setHost] = useState('10.10.10.146');
  const [wsPort, setWsPort] = useState('9080');
  const [token, setToken] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const { setServer, setConnectionParams, status, disconnect } = useConnectionStore();
  const isConnected = status.ws === 'connected';

  useEffect(() => {
    loadLastServer();
  }, []);

  const loadLastServer = async () => {
    try {
      const lastServer = await offlineCache.getLastServer();
      if (lastServer) {
        setHost(lastServer.host);
        setWsPort(lastServer.wsPort.toString());
        setToken(lastServer.wsToken);
      }
    } catch (error) {
      // Ignore
    } finally {
      setIsLoading(false);
    }
  };

  const buildServerConfig = (): ServerConfig => {
    const id = `${host}:${wsPort}`;
    return {
      id,
      name: host,
      host,
      sshPort: 22, // Keep for compatibility
      sshUsername: '',
      wsPort: parseInt(wsPort),
      wsToken: token,
    };
  };

  const handleSave = async () => {
    if (!host) {
      Alert.alert('错误', '请填写主机地址');
      return;
    }

    const serverConfig = buildServerConfig();
    await offlineCache.saveServer(serverConfig);
    Alert.alert('已保存', '配置保存成功');
  };

  const handleConnect = async () => {
    if (!host) {
      Alert.alert('错误', '请填写主机地址');
      return;
    }

    console.log(`[Connect] Attempting to connect to ${host}:${wsPort}`);
    setIsConnecting(true);

    try {
      console.log('[Connect] Calling wsClient.connect...');
      wsClient.connect(host, parseInt(wsPort), token);

      console.log('[Connect] Waiting for connection...');
      await wsClient.waitForConnection(10000);

      console.log('[Connect] Connection successful, saving config...');
      const serverConfig = buildServerConfig();
      await offlineCache.saveServer(serverConfig);
      await offlineCache.setLastServer(serverConfig.id);

      console.log('[Connect] Setting connectionParams in store...');
      setConnectionParams({
        host,
        port: parseInt(wsPort),
        token,
      });

      console.log('[Connect] Setting server in store...');
      setServer(serverConfig);
      console.log('[Connect] Done, navigating back...');
      navigation.goBack();
    } catch (error: any) {
      console.error('[Connect] Connection failed:', error);
      Alert.alert('连接失败', error.message || '未知错误');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    wsClient.disconnect();
    disconnect();
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
      <View style={styles.card}>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>服务器地址</Text>
          <TextInput
            style={styles.input}
            placeholder="10.10.10.146"
            value={host}
            onChangeText={setHost}
            autoCapitalize="none"
            editable={!isConnected}
            placeholderTextColor={colors.text.disabled}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>WebSocket 端口</Text>
          <TextInput
            style={styles.input}
            placeholder="9080"
            value={wsPort}
            onChangeText={setWsPort}
            keyboardType="numeric"
            editable={!isConnected}
            placeholderTextColor={colors.text.disabled}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>认证令牌 (可选)</Text>
          <TextInput
            style={styles.input}
            placeholder="WebSocket 认证令牌"
            value={token}
            onChangeText={setToken}
            secureTextEntry
            editable={!isConnected}
            placeholderTextColor={colors.text.disabled}
          />
        </View>
      </View>

      <View style={styles.buttonContainer}>
        {!isConnected ? (
          <>
            <TouchableOpacity
              style={[styles.button, styles.saveButton]}
              onPress={handleSave}
              activeOpacity={animation.activeOpacity}
            >
              <Text style={styles.saveButtonText}>保存配置</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.connectButton, isConnecting && styles.buttonDisabled]}
              onPress={handleConnect}
              disabled={isConnecting}
              activeOpacity={animation.activeOpacity}
            >
              {isConnecting ? (
                <ActivityIndicator size="small" color={colors.text.inverse} />
              ) : (
                <Text style={styles.connectButtonText}>连接</Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            style={[styles.button, styles.disconnectButton]}
            onPress={handleDisconnect}
            activeOpacity={animation.activeOpacity}
          >
            <Text style={styles.disconnectButtonText}>断开连接</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.secondary,
  },
  scrollContent: {
    padding: spacing.base,
    paddingBottom: spacing.xxl,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background.secondary,
  },
  card: {
    backgroundColor: colors.background.primary,
    borderRadius: radius.lg,
    padding: spacing.base,
    marginBottom: spacing.base,
  },
  inputGroup: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: typography.size.footnote,
    fontWeight: typography.weight.semibold,
    color: colors.text.secondary,
    marginBottom: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border.secondary,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: typography.size.body,
    backgroundColor: colors.background.secondary,
    color: colors.text.primary,
  },
  buttonContainer: {
    gap: spacing.md,
  },
  button: {
    padding: spacing.md,
    borderRadius: radius.lg,
    alignItems: 'center',
  },
  saveButton: {
    backgroundColor: colors.background.primary,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  saveButtonText: {
    color: colors.primary,
    fontSize: typography.size.body,
    fontWeight: typography.weight.semibold,
  },
  connectButton: {
    backgroundColor: colors.primary,
  },
  connectButtonText: {
    color: colors.text.inverse,
    fontSize: typography.size.body,
    fontWeight: typography.weight.semibold,
  },
  disconnectButton: {
    backgroundColor: colors.error,
  },
  disconnectButtonText: {
    color: colors.text.inverse,
    fontSize: typography.size.body,
    fontWeight: typography.weight.semibold,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
