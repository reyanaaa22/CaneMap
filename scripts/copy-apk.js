#!/usr/bin/env node

/**
 * Script to copy the built Android APK to the public downloads folder
 * This ensures the downloadable APK is always the latest version
 */

const fs = require('fs');
const path = require('path');

const APK_SOURCE = path.join(__dirname, '../android/app/build/outputs/apk/debug/app-debug.apk');
const APK_DEST = path.join(__dirname, '../public/downloads/CaneMap.apk');
const DOWNLOADS_DIR = path.join(__dirname, '../public/downloads');

// Create downloads directory if it doesn't exist
if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
  console.log('✅ Created downloads directory');
}

// Check if source APK exists
if (!fs.existsSync(APK_SOURCE)) {
  console.warn('⚠️  APK not found at:', APK_SOURCE);
  console.warn('   Run: cd android && ./gradlew assembleDebug');
  process.exit(0);
}

// Copy APK to downloads folder
try {
  fs.copyFileSync(APK_SOURCE, APK_DEST);
  const stats = fs.statSync(APK_DEST);
  const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  console.log(`✅ APK copied successfully: ${fileSizeMB} MB`);
  console.log(`   From: ${APK_SOURCE}`);
  console.log(`   To:   ${APK_DEST}`);
} catch (error) {
  console.error('❌ Error copying APK:', error.message);
  process.exit(1);
}

