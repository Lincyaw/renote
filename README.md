# Renote - Mobile Remote Development Client

A mobile client for remote server development with Claude Code integration, similar to VSCode Remote but optimized for mobile devices.

## Features

- **Remote Terminal** - Full xterm.js terminal via SSH
- **Claude Code Monitoring** - Real-time Claude Code activity display
- **Code Browsing** - File tree navigation with syntax highlighting
- **Diff Viewer** - View Claude Code file changes
- **Port Forwarding** - SSH local port forwarding
- **Code Search** - Ripgrep-powered search

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Mobile Client (React Native)            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  Terminal   │  │   Claude    │  │       Files         │  │
│  │  (xterm.js) │  │    Tab      │  │  (Syntax Highlight) │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         │                │                     │             │
│         │    SSH         │    WebSocket        │             │
└─────────┼────────────────┼─────────────────────┼─────────────┘
          │                │                     │
          ▼                ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│                     Server (Node.js)                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  SSH Daemon │  │  WebSocket  │  │   Claude Watcher    │  │
│  │  (port 22)  │  │ (port 8080) │  │  (~/.claude/*)      │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- [ripgrep](https://github.com/BurntSushi/ripgrep) (`rg`) - required for code search
- [zellij](https://zellij.dev) - required for terminal session management (sessions persist across reconnects)
- Java 17+ (for Android builds)
- Android SDK (for Android builds)
- React Native development environment (Xcode for iOS, Android Studio for Android)

### 1. Start the Server

```bash
# Navigate to server directory
cd server

# Install dependencies
npm install

# Create environment file
cp .env.example .env

# Generate auth token
echo "AUTH_TOKEN=$(openssl rand -hex 32)" >> .env

# Start development server
npm run dev
```

The server will start:
- WebSocket server on port 9080 (configurable in .env)

### 2. Start the Web App

```bash
# Navigate to web directory
cd web

# Install dependencies
npm install

# Start development server
npm run dev
```

Open your browser at `http://localhost:5173` and connect to the server using your server's IP/hostname and port 9080.

**Build for production (served by the Node.js server):**

```bash
# Build and copy dist into server/web-dist
npm run build:deploy
```

After deploying, the server will serve the web app on the same port (9080) at `/`.

### 3. Start the Mobile Client

```bash
# Navigate to client directory
cd client

# Install dependencies
npm install

# Install iOS pods (macOS only)
cd ios && pod install && cd ..

# Start Metro bundler
npm start
```

Then in another terminal:

```bash
# Run on iOS simulator
npm run ios

# Or run on Android emulator
npm run android
```

### 4. Build Android APK

```bash
cd client

# Set environment variables (add to ~/.bashrc for persistence)
export JAVA_HOME=/nix/store/ca5zjmdcha9wa4gfvw7vhmz5wkr1ra66-openjdk-17.0.4+8
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH

# Build debug APK
cd android
./gradlew assembleDebug --no-daemon

# APK location
# android/app/build/outputs/apk/debug/app-debug.apk

# Build release APK (requires signing config)
./gradlew assembleRelease --no-daemon
```

Install APK to device:

```bash
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

## Running Tests

### Server Tests

```bash
cd server

# Run all tests
npm test

# Run tests in watch mode
npm run test:watch
```

### Client Tests

```bash
cd client

# Run unit tests
npm test

# Run E2E tests (requires running app)
npm run e2e:ios
# or
npm run e2e:android
```

## Project Structure

```
renote/
├── web/                       # React web app (Vite + Tailwind)
│   ├── src/
│   │   ├── App.tsx            # Root component
│   │   ├── components/        # UI components (layout, sessions, files, terminal)
│   │   ├── store/             # Zustand stores
│   │   ├── services/          # Event emitter, WebSocket services
│   │   └── types/             # TypeScript types
│   ├── public/                # Static assets (PWA manifest, icons, service worker)
│   ├── index.html
│   └── package.json
│
├── server/                    # Node.js WebSocket server
│   ├── src/
│   │   ├── index.ts          # Entry point
│   │   ├── config.ts         # Configuration
│   │   ├── types.ts          # TypeScript types
│   │   ├── websocket/        # WebSocket server
│   │   │   ├── server.ts     # WebSocket handling
│   │   │   └── auth.ts       # Authentication
│   │   ├── claude/           # Claude Code integration
│   │   │   └── watcher.ts    # File watcher
│   │   ├── files/            # File operations
│   │   │   ├── browser.ts    # File tree
│   │   │   ├── reader.ts     # File reading
│   │   │   └── search.ts     # Code search
│   │   ├── http/             # HTTP server
│   │   │   └── server.ts     # Health check
│   │   └── utils/
│   │       └── logger.ts     # Logging
│   └── package.json
│
├── client/                    # React Native mobile app
│   ├── src/
│   │   ├── components/       # UI components
│   │   │   ├── TerminalTab.tsx
│   │   │   ├── ClaudeTab.tsx
│   │   │   ├── FilesTab.tsx
│   │   │   ├── FileViewer.tsx
│   │   │   ├── FileTree.tsx
│   │   │   ├── DiffViewer.tsx
│   │   │   ├── MessageBubble.tsx
│   │   │   ├── PortForwardPanel.tsx
│   │   │   ├── QuickActionsPanel.tsx
│   │   │   ├── CommandHistorySidebar.tsx
│   │   │   └── SwipeableTabView.tsx
│   │   ├── screens/          # Screen components
│   │   │   ├── ConnectionScreen.tsx
│   │   │   └── MainScreen.tsx
│   │   ├── navigation/       # Navigation
│   │   │   └── AppNavigator.tsx
│   │   ├── store/            # Zustand stores
│   │   │   ├── connectionStore.ts
│   │   │   ├── claudeStore.ts
│   │   │   ├── portForwardStore.ts
│   │   │   └── terminalStore.ts
│   │   ├── services/         # Services
│   │   │   ├── websocket.ts
│   │   │   ├── ssh.ts
│   │   │   ├── offlineCache.ts
│   │   │   └── keychain.ts
│   │   └── types.ts          # TypeScript types
│   ├── e2e/                  # E2E tests (Detox)
│   └── package.json
│
└── docs/
    └── plans/                # Implementation plans
```

## Configuration

### Server Environment Variables

Create `server/.env`:

```env
PORT=9080                              # WebSocket port
AUTH_TOKEN=your-secure-token           # Authentication token (留空允许任意连接)
CLAUDE_HOME=/home/user/.claude         # Claude Code home directory
MAX_FILE_SIZE=10485760                 # Max file size (10MB)
SEARCH_TIMEOUT=5000                    # Search timeout (5s)
LOG_LEVEL=info                         # Log level
```

### Client Connection

When connecting from the mobile app:

1. **Host**: Your server's IP or hostname (或 `localhost` 如果用了 adb reverse)
2. **SSH Port**: 22 (default)
3. **Username**: Your SSH username
4. **WebSocket Port**: 9080 (default)
5. **Auth Token**: The token from server's .env file (留空则任意值均可)

## Features Guide

### Terminal Tab

- Full xterm.js terminal emulator
- SSH connection to remote server
- Command history sidebar (tap "History" button)
- Supports all terminal features (colors, cursor, etc.)

### Claude Tab

- Real-time Claude Code activity monitoring
- Shows user inputs, assistant messages, tool calls
- Diff viewer for file changes
- Quick actions panel for common commands

### Files Tab

- Browse remote file system
- Syntax highlighting (40+ languages)
- Zoom controls (A-/A+)
- Search in files

### Ports Tab

- Create SSH port forwards
- Open forwarded ports in browser
- Manage active forwards

## Gestures

- **Swipe left/right**: Switch between tabs
- **Tap History**: Open command history sidebar
- **Tap A-/A+**: Adjust font size in file viewer

## Troubleshooting

### Server won't start

1. Check if port 9080 is available: `lsof -i :9080`
2. Verify Node.js version: `node --version` (need 18+)
3. Check logs for errors

### Client can't connect

1. Verify server is running: `lsof -i :9080`
2. Check adb reverse is set: `adb reverse --list`
3. Verify auth token matches (or server AUTH_TOKEN is empty)
4. Check network connectivity
5. 查看日志: `adb logcat ReactNativeJS:V '*:S'`

### "Invalid token" error

1. 确保 App 中的 Auth Token 与 server/.env 中的 AUTH_TOKEN 完全一致
2. 或者清空 server/.env 中的 AUTH_TOKEN 允许任意连接
3. 修改 .env 后需要重启服务端

### Android 编译失败 "SDK location not found"

创建 `client/android/local.properties`:
```
sdk.dir=/Users/你的用户名/Library/Android/sdk
```

### Android 编译失败 "buildToolsVersion not found"

检查已安装的 build-tools 版本并修改 `client/android/build.gradle`:
```bash
ls ~/Library/Android/sdk/build-tools/
# 然后修改 buildToolsVersion 为已安装的版本
```

### SSH connection fails

1. Verify SSH key is imported correctly
2. Check SSH server is running on remote
3. Verify username and host are correct

## Development

### macOS 开发环境设置 (Android 热更新调试)

#### 1. 环境变量配置

```bash
# 添加到 ~/.zshrc 或 ~/.bashrc
export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
export ANDROID_HOME=~/Library/Android/sdk
export PATH=$JAVA_HOME/bin:$PATH:$ANDROID_HOME/platform-tools
```

#### 2. 启动服务端

```bash
cd server

# 首次运行需要安装依赖
npm install

# 配置环境变量 (可选：清空 AUTH_TOKEN 允许无密码连接)
cat > .env << EOF
PORT=9080
AUTH_TOKEN=
CLAUDE_HOME=$HOME/.claude
MAX_FILE_SIZE=10485760
SEARCH_TIMEOUT=5000
LOG_LEVEL=info
EOF

# 启动服务端
npm start
# 或开发模式 (带热重载)
npm run dev
```

#### 3. 连接 Android 设备并设置端口转发

```bash
# 检查设备连接
adb devices

# 设置端口转发 (让设备可以通过 localhost 访问 Mac)
adb reverse tcp:8081 tcp:8081   # Metro bundler
adb reverse tcp:9080 tcp:9080   # WebSocket server
```

#### 4. 启动 Metro bundler

```bash
cd client
npm install  # 首次运行
npx react-native start
```

#### 5. 安装调试版 APK

```bash
cd client/android

# 编译并安装调试版
./gradlew installDebug

# 或只编译 APK (位置: app/build/outputs/apk/debug/app-debug.apk)
./gradlew assembleDebug
```

#### 6. App 连接配置

由于设置了 `adb reverse`，在 App 中填写：

| 字段 | 值 |
|------|-----|
| Host | `localhost` |
| WS Port | `9080` |
| Username | 任意 |
| Auth Token | 任意 (如果 AUTH_TOKEN 为空) |

#### 7. 查看调试日志

```bash
# 清除旧日志并实时查看
adb logcat -c && adb logcat ReactNative:V ReactNativeJS:V '*:S'
```

### 编译 Release APK

```bash
cd client/android

# 确保 local.properties 存在且包含正确的 SDK 路径
echo "sdk.dir=$HOME/Library/Android/sdk" > local.properties

# 编译 Release 版本
./gradlew assembleRelease

# APK 位置: app/build/outputs/apk/release/app-release.apk
```

### Adding a new feature

1. Create plan in `docs/plans/`
2. Implement server changes in `server/src/`
3. Implement client changes in `client/src/`
4. Add tests
5. Update this README if needed

### Running in development

```bash
# Terminal 1: Server
cd server && npm run dev

# Terminal 2: Metro bundler
cd client && npm start

# Terminal 3: iOS/Android
cd client && npm run ios
```

## License

MIT
