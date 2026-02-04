import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSessionBrowserStore } from '../store/sessionBrowserStore';
import { wsClient } from '../services/websocket';
import { SessionInfo } from '../types';
import { SessionsScreenProps, ClaudeStackParamList } from '../navigation/types';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, typography, radius, animation } from '../theme';

export default function SessionList() {
  const navigation = useNavigation<NativeStackNavigationProp<ClaudeStackParamList, 'Sessions'>>();
  const route = useRoute<SessionsScreenProps['route']>();
  const { workspaceDirName, workspaceDisplayPath } = route.params;
  const [refreshing, setRefreshing] = useState(false);

  const {
    sessions,
    searchQuery,
    loading,
    setSearchQuery,
  } = useSessionBrowserStore();

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    wsClient.requestSessions(workspaceDirName);
    // 延迟结束刷新状态，让用户看到刷新动画
    setTimeout(() => {
      setRefreshing(false);
    }, 800);
  }, [workspaceDirName]);

  const filtered = useMemo(() => {
    if (!searchQuery) return sessions;
    const q = searchQuery.toLowerCase();
    return sessions.filter(
      (s) =>
        s.firstPrompt.toLowerCase().includes(q) ||
        s.summary.toLowerCase().includes(q)
    );
  }, [sessions, searchQuery]);

  const handleSelect = (item: SessionInfo) => {
    useSessionBrowserStore.getState().clearSessionData();
    useSessionBrowserStore.getState().setLoading(true);
    wsClient.requestSessionMessagesPage(workspaceDirName, item.sessionId);
    wsClient.watchSession(workspaceDirName, item.sessionId);
    navigation.navigate('Conversation', {
      workspaceDirName,
      sessionId: item.sessionId,
    });
  };

  const handleNewConversation = useCallback(() => {
    // 导航到新建对话界面（不传 sessionId）
    useSessionBrowserStore.getState().clearSessionData();
    navigation.navigate('Conversation', {
      workspaceDirName,
      sessionId: undefined,
    });
  }, [navigation, workspaceDirName]);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  const renderItem = ({ item }: { item: SessionInfo }) => (
    <TouchableOpacity
      style={styles.item}
      onPress={() => handleSelect(item)}
      activeOpacity={animation.activeOpacity}
    >
      <Text style={styles.prompt} numberOfLines={2}>
        {item.firstPrompt || 'No prompt'}
      </Text>
      {item.summary ? (
        <Text style={styles.summary} numberOfLines={1}>
          {item.summary}
        </Text>
      ) : null}
      <View style={styles.meta}>
        <Text style={styles.metaText}>{item.messageCount} msgs</Text>
        <Text style={styles.metaText}>{formatDate(item.modified)}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={animation.activeOpacity}
        >
          <Text style={styles.backText}>← {workspaceDisplayPath || 'Back'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.newConversationBtn}
          onPress={handleNewConversation}
          activeOpacity={animation.activeOpacity}
        >
          <Text style={styles.newConversationText}>+ 新建对话</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        style={styles.search}
        placeholder="Search sessions..."
        value={searchQuery}
        onChangeText={setSearchQuery}
        autoCapitalize="none"
        autoCorrect={false}
        placeholderTextColor={colors.text.disabled}
      />
      {loading ? (
        <ActivityIndicator style={styles.loader} size="large" color={colors.primary} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.sessionId}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.text.secondary}
              colors={[colors.primary]}
            />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>No sessions found</Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingRight: spacing.md,
  },
  backBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  backText: {
    fontSize: typography.size.body,
    color: colors.primary,
    fontWeight: typography.weight.medium,
  },
  newConversationBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  newConversationText: {
    color: colors.text.inverse,
    fontSize: typography.size.subheadline,
    fontWeight: typography.weight.semibold,
  },
  search: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.background.tertiary,
    fontSize: typography.size.body,
    color: colors.text.primary,
  },
  list: {
    paddingHorizontal: spacing.md,
  },
  item: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.secondary,
  },
  prompt: {
    fontSize: typography.size.subheadline,
    fontWeight: typography.weight.semibold,
    color: colors.text.primary,
  },
  summary: {
    fontSize: typography.size.footnote,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  metaText: {
    fontSize: typography.size.caption,
    color: colors.text.tertiary,
  },
  loader: {
    marginTop: spacing.xxl,
  },
  empty: {
    textAlign: 'center',
    color: colors.text.tertiary,
    marginTop: spacing.xxl,
    fontSize: typography.size.subheadline,
  },
});
