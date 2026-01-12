/**
 * MindfulCode - Icon Conversion Script
 * Converts SVG icons to PNG at multiple resolutions
 *
 * Usage:
 *   npm install --save-dev sharp
 *   node scripts/convert-icons.js
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Configuration
const ASSETS_DIR = path.join(__dirname, '..', 'assets');
const OUTPUT_DIR = path.join(ASSETS_DIR, 'png');

// Icon configurations
const ICON_CONFIGS = [
  {
    source: 'icon-vscode-marketplace.svg',
    sizes: [128, 256, 512], // Standard + 2x + high-res
    prefix: 'icon-marketplace'
  },
  {
    source: 'icon-square-zen-bracket.svg',
    sizes: [16, 32, 64, 128, 256, 512],
    prefix: 'icon-zen-bracket'
  },
  {
    source: 'icon-status-bar.svg',
    sizes: [16, 32],
    prefix: 'icon-status-bar'
  },
  {
    source: 'icon-activity-bar-light.svg',
    sizes: [24, 48],
    prefix: 'icon-activity-light'
  },
  {
    source: 'icon-activity-bar-dark.svg',
    sizes: [24, 48],
    prefix: 'icon-activity-dark'
  }
];

// Create output directory if it doesn't exist
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  console.log(`📁 Created directory: ${OUTPUT_DIR}`);
}

// Convert function
async function convertIcon(config) {
  const sourcePath = path.join(ASSETS_DIR, config.source);

  if (!fs.existsSync(sourcePath)) {
    console.error(`❌ Source file not found: ${config.source}`);
    return;
  }

  console.log(`\n🎨 Converting: ${config.source}`);

  for (const size of config.sizes) {
    const outputFileName = `${config.prefix}-${size}.png`;
    const outputPath = path.join(OUTPUT_DIR, outputFileName);

    try {
      await sharp(sourcePath)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .png({
          compressionLevel: 9,
          quality: 100
        })
        .toFile(outputPath);

      const stats = fs.statSync(outputPath);
      const sizeKB = (stats.size / 1024).toFixed(2);
      console.log(`  ✅ ${size}x${size} → ${outputFileName} (${sizeKB} KB)`);
    } catch (error) {
      console.error(`  ❌ Failed to convert ${size}x${size}:`, error.message);
    }
  }
}

// Main execution
async function main() {
  console.log('🚀 MindfulCode Icon Conversion');
  console.log('================================\n');

  try {
    // Convert all icons
    for (const config of ICON_CONFIGS) {
      await convertIcon(config);
    }

    console.log('\n✨ Conversion complete!');
    console.log(`📦 PNG files saved to: ${OUTPUT_DIR}`);

    // Copy marketplace icon to root assets folder
    const marketplaceSource = path.join(OUTPUT_DIR, 'icon-marketplace-128.png');
    const marketplaceDest = path.join(ASSETS_DIR, 'icon.png');

    if (fs.existsSync(marketplaceSource)) {
      fs.copyFileSync(marketplaceSource, marketplaceDest);
      console.log(`\n📌 Copied marketplace icon to: assets/icon.png`);
      console.log('   (This is what package.json should reference)');
    }

    // Summary
    console.log('\n📊 Summary:');
    const pngFiles = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.png'));
    console.log(`   Total PNG files generated: ${pngFiles.length}`);

    const totalSize = pngFiles.reduce((sum, file) => {
      const stats = fs.statSync(path.join(OUTPUT_DIR, file));
      return sum + stats.size;
    }, 0);
    console.log(`   Total size: ${(totalSize / 1024).toFixed(2)} KB`);

    console.log('\n✅ Next steps:');
    console.log('   1. Update package.json: "icon": "assets/icon.png"');
    console.log('   2. Test in VSCode: Press F5 to launch Extension Development Host');
    console.log('   3. Verify icon in sidebar and marketplace preview\n');

  } catch (error) {
    console.error('\n❌ Conversion failed:', error);
    process.exit(1);
  }
}

// Check if sharp is installed
try {
  require.resolve('sharp');
  main();
} catch (e) {
  console.error('❌ Error: "sharp" package not found.');
  console.error('\nPlease install it first:');
  console.error('  npm install --save-dev sharp\n');
  console.error('Then run this script again:');
  console.error('  node scripts/convert-icons.js\n');
  process.exit(1);
}
