#!/bin/bash

# Renote 客户端 APK 发布脚本
# 用法: ./scripts/release-apk.sh [版本号]
# 示例: ./scripts/release-apk.sh v1.0.0

set -e

cd "$(dirname "$0")/.."

VERSION=${1:-$(date +v%Y%m%d)}
APK_NAME="renote-${VERSION}.apk"

echo "=== Renote APK 发布流程 ==="
echo "版本: $VERSION"

# 检查 gh CLI
if ! command -v gh &> /dev/null; then
    echo "❌ 需要安装 GitHub CLI: brew install gh"
    exit 1
fi

# 检查是否登录 gh
if ! gh auth status &> /dev/null; then
    echo "❌ 未登录 GitHub CLI，请先执行: gh auth login"
    exit 1
fi

# 构建 APK
echo "🔨 构建 APK..."
cd android
./gradlew assembleRelease

APK_PATH="app/build/outputs/apk/release/app-release.apk"

if [[ ! -f "$APK_PATH" ]]; then
    echo "❌ APK 构建失败，文件不存在: $APK_PATH"
    exit 1
fi

APK_SIZE=$(du -h "$APK_PATH" | cut -f1)
echo "✓ APK 构建成功: $APK_SIZE"

# 回到 client 目录
cd ..

# 复制并重命名 APK
cp "android/$APK_PATH" "$APK_NAME"

# 创建 GitHub Release
echo "🚀 创建 GitHub Release..."
gh release create "$VERSION" \
    "$APK_NAME" \
    --title "Renote $VERSION" \
    --notes "## 下载

- **APK**: [renote-${VERSION}.apk](https://github.com/$(gh repo view --json nameWithOwner -q .nameWithOwner)/releases/download/${VERSION}/${APK_NAME})

## 安装
下载 APK 后直接安装即可。"

# 清理
rm "$APK_NAME"

echo ""
echo "✅ 发布成功!"
echo "   版本: $VERSION"
echo "   查看: gh release view $VERSION"
