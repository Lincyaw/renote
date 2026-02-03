const fs = require('fs');
const path = require('path');

let sharp;
try {
  sharp = require('sharp');
} catch (e) {
  console.log('需要安装 sharp: npm install sharp');
  console.log('然后重新运行: node scripts/generate-icon.js');
  process.exit(1);
}

const sizes = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192,
};

const resDir = path.join(__dirname, '../android/app/src/main/res');

// 生成 SVG 图标
function generateSvg(size) {
  const padding = size * 0.15;
  const innerSize = size - padding * 2;
  const cornerRadius = size * 0.2;

  return `
<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#6366f1"/>
      <stop offset="100%" style="stop-color:#8b5cf6"/>
    </linearGradient>
    <linearGradient id="terminal" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#22d3ee"/>
      <stop offset="100%" style="stop-color:#06b6d4"/>
    </linearGradient>
  </defs>

  <!-- 背景 -->
  <rect x="0" y="0" width="${size}" height="${size}" rx="${cornerRadius}" fill="url(#bg)"/>

  <!-- 终端窗口 -->
  <rect x="${padding}" y="${padding}" width="${innerSize}" height="${innerSize}"
        rx="${size * 0.08}" fill="#1e1b4b" opacity="0.9"/>

  <!-- 终端提示符 > -->
  <text x="${size * 0.25}" y="${size * 0.55}"
        font-family="Monaco, monospace" font-size="${size * 0.35}" font-weight="bold"
        fill="url(#terminal)">&gt;_</text>

  <!-- 连接点 -->
  <circle cx="${size * 0.75}" cy="${size * 0.35}" r="${size * 0.06}" fill="#4ade80"/>
</svg>`;
}

// 生成圆形图标的 SVG
function generateRoundSvg(size) {
  const center = size / 2;
  const radius = size / 2;

  return `
<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#6366f1"/>
      <stop offset="100%" style="stop-color:#8b5cf6"/>
    </linearGradient>
    <linearGradient id="terminal" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#22d3ee"/>
      <stop offset="100%" style="stop-color:#06b6d4"/>
    </linearGradient>
    <clipPath id="circle">
      <circle cx="${center}" cy="${center}" r="${radius}"/>
    </clipPath>
  </defs>

  <g clip-path="url(#circle)">
    <!-- 背景 -->
    <circle cx="${center}" cy="${center}" r="${radius}" fill="url(#bg)"/>

    <!-- 终端窗口 -->
    <rect x="${size * 0.15}" y="${size * 0.15}" width="${size * 0.7}" height="${size * 0.7}"
          rx="${size * 0.08}" fill="#1e1b4b" opacity="0.9"/>

    <!-- 终端提示符 > -->
    <text x="${size * 0.25}" y="${size * 0.55}"
          font-family="Monaco, monospace" font-size="${size * 0.35}" font-weight="bold"
          fill="url(#terminal)">&gt;_</text>

    <!-- 连接点 -->
    <circle cx="${size * 0.75}" cy="${size * 0.35}" r="${size * 0.06}" fill="#4ade80"/>
  </g>
</svg>`;
}

async function generateIcons() {
  console.log('🎨 生成 Renote 图标...\n');

  for (const [folder, size] of Object.entries(sizes)) {
    const folderPath = path.join(resDir, folder);

    // 确保目录存在
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    // 生成方形图标
    const squareSvg = generateSvg(size);
    await sharp(Buffer.from(squareSvg))
      .png()
      .toFile(path.join(folderPath, 'ic_launcher.png'));

    // 生成圆形图标
    const roundSvg = generateRoundSvg(size);
    await sharp(Buffer.from(roundSvg))
      .png()
      .toFile(path.join(folderPath, 'ic_launcher_round.png'));

    console.log(`✓ ${folder}: ${size}x${size}px`);
  }

  console.log('\n✅ 图标生成完成!');
}

generateIcons().catch(console.error);
