/**
 * Convert SVG to PNG for VS Code extension icon
 * Requires: sharp (npm install sharp --save-dev)
 * Or use online tool: https://cloudconvert.com/svg-to-png
 */

const fs = require('fs');
const path = require('path');

const svgPath = path.join(__dirname, '..', 'resources', 'mindfulcode-icon.svg');
const pngPath = path.join(__dirname, '..', 'resources', 'mindfulcode-icon.png');

// Check if sharp is available
let sharp;
try {
  sharp = require('sharp');
} catch (e) {
  console.log('⚠️  sharp not installed. Install it with: npm install sharp --save-dev');
  console.log('📝 Or convert manually:');
  console.log('   1. Open: https://cloudconvert.com/svg-to-png');
  console.log('   2. Upload: resources/mindfulcode-icon.svg');
  console.log('   3. Set size: 128x128');
  console.log('   4. Download as: resources/mindfulcode-icon.png');
  process.exit(1);
}

async function convertSvgToPng() {
  try {
    if (!fs.existsSync(svgPath)) {
      console.error(`❌ SVG file not found: ${svgPath}`);
      process.exit(1);
    }

    console.log('🔄 Converting SVG to PNG...');
    
    await sharp(svgPath)
      .resize(128, 128)
      .png()
      .toFile(pngPath);

    console.log(`✅ Created PNG icon: ${pngPath}`);
    console.log('📦 Ready for publishing!');
  } catch (error) {
    console.error('❌ Error converting:', error.message);
    console.log('\n📝 Manual conversion required:');
    console.log('   1. Open: https://cloudconvert.com/svg-to-png');
    console.log('   2. Upload: resources/mindfulcode-icon.svg');
    console.log('   3. Set size: 128x128');
    console.log('   4. Download as: resources/mindfulcode-icon.png');
    process.exit(1);
  }
}

convertSvgToPng();

