import React, { useCallback, useRef, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Keyboard,
  Platform,
  Modal,
  Switch,
  ScrollView,
} from 'react-native';
import { FlatList } from 'react-native-gesture-handler';
import { useNavigation, useRoute } from '@react-navigation/native';
import Markdown from 'react-native-markdown-display';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSessionBrowserStore } from '../store/sessionBrowserStore';
import { wsClient } from '../services/websocket';
import { SessionMessage, SubagentInfo } from '../types';
import { ConversationScreenProps, ClaudeStackParamList } from '../navigation/types';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, typography, radius, shadows, animation } from '../theme';
import { v4 as uuidv4 } from 'uuid';

// 自定义 Hook：监听键盘高度
function useKeyboardHeight() {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const onShow = (e: any) => {
      setKeyboardHeight(e.endCoordinates.height);
    };

    const onHide = () => {
      setKeyboardHeight(0);
    };

    // iOS 使用 keyboardWillShow/Hide（动画更流畅）
    // Android 使用 keyboardDidShow/Hide
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return keyboardHeight;
}

// 权限选项定义
interface PermissionOption {
  id: string;
  label: string;
  description: string;
  tool: string;  // 对应的 Claude CLI tool 名称
}

const PERMISSION_OPTIONS: PermissionOption[] = [
  { id: 'bash', label: 'Bash 命令', description: '允许执行终端命令', tool: 'Bash' },
  { id: 'edit', label: '编辑文件', description: '允许修改现有文件', tool: 'Edit' },
  { id: 'write', label: '写入文件', description: '允许创建新文件', tool: 'Write' },
  { id: 'read', label: '读取文件', description: '允许读取文件内容', tool: 'Read' },
  { id: 'web', label: '网络访问', description: '允许访问网络资源', tool: 'WebFetch' },
];

function decodeWorkspaceDirName(encoded: string): string {
  return '/' + encoded.replace(/-/g, '/');
}

// Check if content looks like JSON
function isJsonContent(content: string): boolean {
  const trimmed = content.trim();
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      JSON.parse(trimmed);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

function ToolCallItem({
  item,
  toolResult,
  onPress,
}: {
  item: SessionMessage;
  toolResult?: SessionMessage;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.toolCallBubble}
      onPress={onPress}
      activeOpacity={animation.activeOpacity}
    >
      <View style={styles.toolCallHeader}>
        <Text style={styles.toolCallIcon}>{'>'}_</Text>
        <Text style={styles.toolCallName}>{item.toolName || 'Tool'}</Text>
        <Text style={styles.toolCallArrow}>{'>'}</Text>
      </View>
      {toolResult && (
        <Text style={styles.toolCallResult} numberOfLines={1}>
          {toolResult.content.substring(0, 50)}...
        </Text>
      )}
    </TouchableOpacity>
  );
}

function MessageItem({
  item,
  allMessages,
  onToolPress,
}: {
  item: SessionMessage;
  allMessages: SessionMessage[];
  onToolPress: (toolUse: SessionMessage, toolResult?: SessionMessage) => void;
}) {
  if (item.type === 'user') {
    return (
      <View style={styles.userBubble}>
        <Text style={styles.userLabel}>User</Text>
        <Text style={styles.userText}>{item.content}</Text>
      </View>
    );
  }

  if (item.type === 'assistant') {
    const isJson = isJsonContent(item.content);
    return (
      <View style={styles.assistantBubble}>
        <Text style={styles.assistantLabel}>Assistant</Text>
        {isJson ? (
          <Text style={styles.jsonText}>{item.content}</Text>
        ) : (
          <Markdown style={markdownStyles}>{item.content}</Markdown>
        )}
      </View>
    );
  }

  if (item.type === 'tool_use') {
    // Find matching tool_result
    const toolResult = allMessages.find(
      m => m.type === 'tool_result' && m.uuid.includes(item.uuid.replace('_tool', ''))
    );
    return (
      <ToolCallItem
        item={item}
        toolResult={toolResult}
        onPress={() => onToolPress(item, toolResult)}
      />
    );
  }

  return null;
}

function SubagentItem({
  item,
  onPress,
}: {
  item: SubagentInfo;
  onPress: (agentId: string) => void;
}) {
  const truncatedPrompt = item.firstPrompt.length > 100
    ? item.firstPrompt.substring(0, 100) + '...'
    : item.firstPrompt;

  return (
    <TouchableOpacity
      style={styles.subagentItem}
      onPress={() => onPress(item.agentId)}
      activeOpacity={animation.activeOpacity}
    >
      <View style={styles.subagentHeader}>
        <Text style={styles.subagentSlug}>{item.slug || item.agentId}</Text>
        <Text style={styles.subagentMeta}>{item.messageCount} msgs</Text>
      </View>
      <Text style={styles.subagentPrompt} numberOfLines={2}>
        {truncatedPrompt}
      </Text>
    </TouchableOpacity>
  );
}

const PAGE_SIZE = 50;

export default function ConversationView() {
  const navigation = useNavigation<NativeStackNavigationProp<ClaudeStackParamList, 'Conversation'>>();
  const route = useRoute<ConversationScreenProps['route']>();
  const { workspaceDirName, sessionId: initialSessionId } = route.params;
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();

  // 如果是新对话，生成一个新的 sessionId
  const [currentSessionId, setCurrentSessionId] = useState<string | undefined>(initialSessionId);
  const newSessionIdRef = useRef<string | undefined>(undefined);

  // 输入框状态
  const [inputMessage, setInputMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  // 权限设置状态
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [allowedTools, setAllowedTools] = useState<string[]>([]);  // 空数组表示使用默认权限

  const {
    messages,
    loading,
    subagents,
    sessionFolderInfo,
    hasMoreMessages,
    oldestMessageIndex,
    loadingMore,
  } = useSessionBrowserStore();
  const flatListRef = useRef<FlatList<SessionMessage>>(null);
  const [activeTab, setActiveTab] = useState<'messages' | 'subagents'>('messages');

  // 判断是否为新对话模式
  const isNewConversation = !currentSessionId;

  // Request subagents and session folder info when session is selected
  // Note: Initial messages are already requested by SessionList before navigation
  useEffect(() => {
    if (currentSessionId) {
      wsClient.requestSubagents(workspaceDirName, currentSessionId);
      wsClient.requestSessionFolderInfo(workspaceDirName, currentSessionId);
    }
  }, [workspaceDirName, currentSessionId]);

  // 监听消息发送响应
  useEffect(() => {
    const unsubscribe = wsClient.onSendClaudeMessageResponse((data) => {
      setIsSending(false);
      if (data.success && data.sessionId) {
        // 如果是新对话，更新 currentSessionId 并开始监听
        if (!currentSessionId && data.sessionId) {
          setCurrentSessionId(data.sessionId);
          // 开始监听新会话
          wsClient.watchSession(workspaceDirName, data.sessionId);
          // 请求消息
          wsClient.requestSessionMessagesPage(workspaceDirName, data.sessionId);
        }
      }
    });

    return () => unsubscribe();
  }, [workspaceDirName, currentSessionId]);

  // Filter to show user, assistant, and tool_use messages (but not tool_result)
  const filteredMessages = useMemo(
    () => messages.filter(m => m.type === 'user' || m.type === 'assistant' || m.type === 'tool_use'),
    [messages]
  );

  // Inverted FlatList needs data in reverse order (newest first)
  const invertedData = useMemo(
    () => [...filteredMessages].reverse(),
    [filteredMessages]
  );

  const handleLoadMore = useCallback(() => {
    if (!hasMoreMessages || loadingMore || loading || !currentSessionId) return;
    useSessionBrowserStore.getState().setLoadingMore(true);
    wsClient.requestSessionMessagesPage(workspaceDirName, currentSessionId, PAGE_SIZE, oldestMessageIndex);
  }, [hasMoreMessages, loadingMore, loading, workspaceDirName, currentSessionId, oldestMessageIndex]);

  const handleGoBack = useCallback(() => {
    wsClient.unwatchSession();
    navigation.goBack();
  }, [navigation]);

  const handleSubagentPress = useCallback(
    (agentId: string) => {
      if (!currentSessionId) return;
      wsClient.requestSubagentMessages(workspaceDirName, currentSessionId, agentId);
      navigation.navigate('Subagent', { workspaceDirName, sessionId: currentSessionId, agentId });
    },
    [workspaceDirName, currentSessionId, navigation]
  );

  const handleToolPress = useCallback(
    (toolUse: SessionMessage, toolResult?: SessionMessage) => {
      navigation.navigate('ToolDetail', {
        toolName: toolUse.toolName || 'Unknown Tool',
        toolInput: toolUse.toolInput || {},
        toolResult: toolResult?.content,
        timestamp: toolUse.timestamp,
      });
    },
    [navigation]
  );

  // 打开终端模式（备选入口）
  const handleOpenTerminal = useCallback(() => {
    const cwd = decodeWorkspaceDirName(workspaceDirName);
    navigation.navigate('ClaudeTerminal', {
      claudeSessionId: currentSessionId,
      cwd,
    });
  }, [navigation, workspaceDirName, currentSessionId]);

  // 切换权限
  const togglePermission = useCallback((toolName: string) => {
    setAllowedTools(prev => {
      if (prev.includes(toolName)) {
        return prev.filter(t => t !== toolName);
      } else {
        return [...prev, toolName];
      }
    });
  }, []);

  // 打开权限设置
  const handleOpenPermissions = useCallback(() => {
    setShowPermissionModal(true);
  }, []);

  // 发送消息
  const handleSendMessage = useCallback(() => {
    if (!inputMessage.trim() || isSending) return;

    Keyboard.dismiss();
    setIsSending(true);

    // 如果是新对话，生成新的 sessionId
    let sessionIdToUse = currentSessionId;
    let newSessionId: string | undefined;

    if (!sessionIdToUse) {
      newSessionId = uuidv4();
      newSessionIdRef.current = newSessionId;
    }

    wsClient.sendClaudeMessage(
      workspaceDirName,
      sessionIdToUse,
      newSessionId,
      inputMessage.trim(),
      allowedTools.length > 0 ? allowedTools : undefined  // 传递权限设置
    );

    setInputMessage('');
  }, [inputMessage, isSending, workspaceDirName, currentSessionId, allowedTools]);

  const renderItem = useCallback(
    ({ item }: { item: SessionMessage }) => (
      <MessageItem item={item} allMessages={messages} onToolPress={handleToolPress} />
    ),
    [messages, handleToolPress]
  );

  const renderSubagentItem = useCallback(
    ({ item }: { item: SubagentInfo }) => (
      <SubagentItem item={item} onPress={handleSubagentPress} />
    ),
    [handleSubagentPress]
  );

  // Loading indicator shown at visual top (ListFooterComponent in inverted mode)
  const renderLoadMoreIndicator = useCallback(() => {
    if (loadingMore) {
      return (
        <View style={styles.loadMoreContainer}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.loadMoreText}>Loading earlier messages...</Text>
        </View>
      );
    }
    if (!hasMoreMessages && filteredMessages.length > 0) {
      return (
        <View style={styles.loadMoreContainer}>
          <Text style={styles.loadMoreText}>All messages loaded</Text>
        </View>
      );
    }
    return null;
  }, [loadingMore, hasMoreMessages, filteredMessages.length]);

  const subagentCount = sessionFolderInfo?.subagentCount || subagents.length;

  // 计算键盘弹出时的 paddingBottom
  // Android 上需要减去状态栏高度，因为键盘高度是相对于整个屏幕计算的
  const keyboardPadding = keyboardHeight > 0
    ? Math.max(0, keyboardHeight - (Platform.OS === 'android' ? insets.top : 0))
    : 0;

  return (
    <View style={[styles.container, { paddingBottom: keyboardPadding }]}>
      <TouchableOpacity
        style={styles.backBtn}
        onPress={handleGoBack}
        activeOpacity={animation.activeOpacity}
      >
        <Text style={styles.backText}>← Sessions</Text>
      </TouchableOpacity>

      {/* Tab bar - 只在有 sessionId 时显示 */}
      {!isNewConversation && (
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'messages' && styles.tabActive]}
            onPress={() => setActiveTab('messages')}
            activeOpacity={animation.activeOpacity}
          >
            <Text style={[styles.tabText, activeTab === 'messages' && styles.tabTextActive]}>
              Messages
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'subagents' && styles.tabActive]}
            onPress={() => setActiveTab('subagents')}
            activeOpacity={animation.activeOpacity}
          >
            <Text style={[styles.tabText, activeTab === 'subagents' && styles.tabTextActive]}>
              Subagents {subagentCount > 0 ? `(${subagentCount})` : ''}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {loading && !isNewConversation ? (
        <ActivityIndicator style={styles.loader} size="large" color={colors.primary} />
      ) : isNewConversation && filteredMessages.length === 0 ? (
        <View style={styles.newConversationHint}>
          <Text style={styles.newConversationTitle}>新建对话</Text>
          <Text style={styles.newConversationSubtitle}>
            在下方输入消息开始与 Claude 对话
          </Text>
        </View>
      ) : activeTab === 'messages' ? (
        <FlatList
          ref={flatListRef}
          data={invertedData}
          inverted
          keyExtractor={(item, index) => item.uuid + '_' + index}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={renderLoadMoreIndicator}
          ListEmptyComponent={
            <Text style={styles.empty}>No messages</Text>
          }
          keyboardShouldPersistTaps="handled"
        />
      ) : (
        <FlatList
          data={subagents}
          keyExtractor={(item) => item.agentId}
          renderItem={renderSubagentItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>No subagents</Text>
          }
        />
      )}

      {/* 底部输入栏 */}
      <View style={styles.inputBar}>
        {/* 权限指示器 */}
        {allowedTools.length > 0 && (
          <TouchableOpacity
            style={styles.permissionIndicator}
            onPress={handleOpenPermissions}
            activeOpacity={animation.activeOpacity}
          >
            <Text style={styles.permissionIndicatorText}>
              🔒 {allowedTools.length} 项权限
            </Text>
          </TouchableOpacity>
        )}
        <View style={styles.inputRow}>
          <TextInput
            style={styles.messageInput}
            placeholder="输入消息..."
            placeholderTextColor={colors.text.disabled}
            value={inputMessage}
            onChangeText={setInputMessage}
            multiline
            maxLength={10000}
            editable={!isSending}
          />
          <TouchableOpacity
            style={styles.permissionButton}
            onPress={handleOpenPermissions}
            activeOpacity={animation.activeOpacity}
          >
            <Text style={styles.permissionButtonText}>⚙</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.terminalButton}
            onPress={handleOpenTerminal}
            activeOpacity={animation.activeOpacity}
          >
            <Text style={styles.terminalButtonText}>⌨</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.sendButton,
              (!inputMessage.trim() || isSending) && styles.sendButtonDisabled,
            ]}
            onPress={handleSendMessage}
            disabled={!inputMessage.trim() || isSending}
            activeOpacity={animation.activeOpacity}
          >
            {isSending ? (
              <ActivityIndicator size="small" color={colors.text.inverse} />
            ) : (
              <Text style={styles.sendButtonText}>发送</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* 权限设置弹窗 */}
      <Modal
        visible={showPermissionModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowPermissionModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>权限设置</Text>
              <TouchableOpacity
                onPress={() => setShowPermissionModal(false)}
                activeOpacity={animation.activeOpacity}
              >
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>
              选择允许 Claude 使用的工具（不选则使用默认权限）
            </Text>
            <ScrollView style={styles.permissionList}>
              {PERMISSION_OPTIONS.map((option) => (
                <View key={option.id} style={styles.permissionItem}>
                  <View style={styles.permissionInfo}>
                    <Text style={styles.permissionLabel}>{option.label}</Text>
                    <Text style={styles.permissionDesc}>{option.description}</Text>
                  </View>
                  <Switch
                    value={allowedTools.includes(option.tool)}
                    onValueChange={() => togglePermission(option.tool)}
                    trackColor={{ false: colors.border.secondary, true: colors.primary }}
                    thumbColor={colors.text.inverse}
                  />
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={styles.clearPermissionBtn}
              onPress={() => setAllowedTools([])}
              activeOpacity={animation.activeOpacity}
            >
              <Text style={styles.clearPermissionText}>清除所有限制（使用默认权限）</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
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
  list: {
    padding: spacing.md,
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

  // Load more indicator
  loadMoreContainer: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  loadMoreText: {
    fontSize: typography.size.caption,
    color: colors.text.tertiary,
    marginTop: spacing.xs,
  },

  // Tab bar styles
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border.secondary,
    backgroundColor: colors.background.primary,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
  },
  tabText: {
    fontSize: typography.size.subheadline,
    color: colors.text.tertiary,
    fontWeight: typography.weight.medium,
  },
  tabTextActive: {
    color: colors.primary,
    fontWeight: typography.weight.semibold,
  },

  // User bubble
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: colors.userBubble,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    maxWidth: '85%',
    ...shadows.sm,
  },
  userLabel: {
    fontSize: typography.size.caption,
    fontWeight: typography.weight.semibold,
    color: 'rgba(255,255,255,0.85)',
  },
  userText: {
    color: colors.text.inverse,
    fontSize: typography.size.subheadline,
    marginTop: spacing.xs,
  },

  // Assistant bubble
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: colors.assistantBubble,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    maxWidth: '85%',
  },
  assistantLabel: {
    fontSize: typography.size.caption,
    fontWeight: typography.weight.semibold,
    color: colors.text.secondary,
  },
  jsonText: {
    color: colors.text.primary,
    fontSize: typography.size.footnote,
    marginTop: spacing.xs,
    fontFamily: 'monospace',
  },

  // Tool call styles
  toolCallBubble: {
    alignSelf: 'flex-start',
    backgroundColor: colors.toolCallBubble,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    maxWidth: '85%',
    borderWidth: 1,
    borderColor: colors.border.secondary,
  },
  toolCallHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  toolCallIcon: {
    fontSize: typography.size.caption,
    color: colors.primary,
    fontFamily: 'monospace',
    fontWeight: typography.weight.bold,
    marginRight: spacing.sm,
  },
  toolCallName: {
    fontSize: typography.size.footnote,
    fontWeight: typography.weight.semibold,
    color: colors.primary,
    flex: 1,
  },
  toolCallArrow: {
    fontSize: typography.size.subheadline,
    color: colors.text.tertiary,
    marginLeft: spacing.xs,
  },
  toolCallResult: {
    fontSize: typography.size.caption,
    color: colors.text.secondary,
    marginTop: spacing.xs,
    fontFamily: 'monospace',
  },

  // Subagent list styles
  subagentItem: {
    backgroundColor: colors.background.secondary,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border.secondary,
  },
  subagentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  subagentSlug: {
    fontSize: typography.size.subheadline,
    fontWeight: typography.weight.semibold,
    color: colors.text.primary,
  },
  subagentMeta: {
    fontSize: typography.size.caption,
    color: colors.text.secondary,
  },
  subagentPrompt: {
    fontSize: typography.size.footnote,
    color: colors.text.secondary,
    lineHeight: 18,
  },

  // 新对话提示
  newConversationHint: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  newConversationTitle: {
    fontSize: typography.size.title3,
    fontWeight: typography.weight.semibold,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  newConversationSubtitle: {
    fontSize: typography.size.subheadline,
    color: colors.text.secondary,
    textAlign: 'center',
  },

  // 底部输入栏
  inputBar: {
    backgroundColor: colors.background.primary,
    borderTopWidth: 1,
    borderTopColor: colors.border.secondary,
    padding: spacing.sm,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  messageInput: {
    flex: 1,
    backgroundColor: colors.background.tertiary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.size.body,
    color: colors.text.primary,
    maxHeight: 100,
    minHeight: 40,
  },
  permissionButton: {
    width: 36,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: spacing.xs,
  },
  permissionButtonText: {
    fontSize: 18,
    color: colors.text.secondary,
  },
  terminalButton: {
    width: 36,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: spacing.xs,
  },
  terminalButtonText: {
    fontSize: 20,
    color: colors.text.secondary,
  },
  sendButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    marginLeft: spacing.xs,
    minWidth: 60,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: colors.text.disabled,
  },
  sendButtonText: {
    color: colors.text.inverse,
    fontSize: typography.size.body,
    fontWeight: typography.weight.semibold,
  },

  // 权限指示器
  permissionIndicator: {
    backgroundColor: colors.background.secondary,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    marginBottom: spacing.xs,
    alignSelf: 'flex-start',
  },
  permissionIndicatorText: {
    fontSize: typography.size.caption,
    color: colors.text.secondary,
  },

  // 权限弹窗样式
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.background.primary,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  modalTitle: {
    fontSize: typography.size.headline,
    fontWeight: typography.weight.semibold,
    color: colors.text.primary,
  },
  modalClose: {
    fontSize: typography.size.title3,
    color: colors.text.tertiary,
    padding: spacing.xs,
  },
  modalSubtitle: {
    fontSize: typography.size.footnote,
    color: colors.text.secondary,
    marginBottom: spacing.md,
  },
  permissionList: {
    maxHeight: 300,
  },
  permissionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.secondary,
  },
  permissionInfo: {
    flex: 1,
    marginRight: spacing.md,
  },
  permissionLabel: {
    fontSize: typography.size.body,
    fontWeight: typography.weight.medium,
    color: colors.text.primary,
  },
  permissionDesc: {
    fontSize: typography.size.caption,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
  clearPermissionBtn: {
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  clearPermissionText: {
    fontSize: typography.size.subheadline,
    color: colors.primary,
  },
});

// Markdown styles
const markdownStyles = StyleSheet.create({
  body: {
    color: colors.text.primary,
    fontSize: typography.size.subheadline,
  },
  heading1: {
    fontSize: typography.size.title3,
    fontWeight: typography.weight.bold,
    marginVertical: spacing.sm,
    color: colors.text.primary,
  },
  heading2: {
    fontSize: typography.size.headline,
    fontWeight: typography.weight.semibold,
    marginVertical: spacing.sm,
    color: colors.text.primary,
  },
  heading3: {
    fontSize: typography.size.body,
    fontWeight: typography.weight.semibold,
    marginVertical: spacing.xs,
    color: colors.text.primary,
  },
  paragraph: {
    marginVertical: spacing.xs,
  },
  strong: {
    fontWeight: typography.weight.bold,
  },
  em: {
    fontStyle: 'italic',
  },
  code_inline: {
    backgroundColor: colors.background.tertiary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs,
    fontFamily: 'monospace',
    fontSize: typography.size.footnote,
  },
  code_block: {
    backgroundColor: colors.codeBg,
    color: colors.codeFg,
    borderRadius: radius.sm,
    padding: spacing.md,
    fontFamily: 'monospace',
    fontSize: typography.size.caption,
    marginVertical: spacing.sm,
  },
  fence: {
    backgroundColor: colors.codeBg,
    color: colors.codeFg,
    borderRadius: radius.sm,
    padding: spacing.md,
    fontFamily: 'monospace',
    fontSize: typography.size.caption,
    marginVertical: spacing.sm,
  },
  blockquote: {
    backgroundColor: colors.background.secondary,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    paddingLeft: spacing.md,
    marginVertical: spacing.sm,
  },
  bullet_list: {
    marginVertical: spacing.xs,
  },
  ordered_list: {
    marginVertical: spacing.xs,
  },
  list_item: {
    marginVertical: spacing.xs,
  },
  link: {
    color: colors.primary,
    textDecorationLine: 'underline',
  },
});
