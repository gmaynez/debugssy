// SPDX-License-Identifier: Apache-2.0
/**
 * Script to prepare extension for marketplace publishing.
 * Temporarily swaps README.md (comprehensive) with MARKETPLACE.md (user-focused)
 * for publishing to VS Code Marketplace.
 *
 * Usage:
 *   node scripts/prepare-marketplace.js swap    # Swap for publishing
 *   node scripts/prepare-marketplace.js restore # Restore after publishing
 */

const fs = require('fs');
const path = require('path');

const README_PATH = 'README.md';
const MARKETPLACE_PATH = 'MARKETPLACE.md';
const README_BACKUP = 'README.md.backup';
const MARKETPLACE_BACKUP = 'MARKETPLACE.md.backup';

function swap() {
    console.log('🔄 Preparing for marketplace publishing...');

    // Check files exist
    if (!fs.existsSync(README_PATH)) {
        console.error(`❌ ${README_PATH} not found`);
        process.exit(1);
    }
    if (!fs.existsSync(MARKETPLACE_PATH)) {
        console.error(`❌ ${MARKETPLACE_PATH} not found`);
        process.exit(1);
    }

    // Check for existing backups
    if (fs.existsSync(README_BACKUP) || fs.existsSync(MARKETPLACE_BACKUP)) {
        console.error('❌ Backup files already exist. Run "restore" first.');
        process.exit(1);
    }

    // Backup original README.md
    fs.copyFileSync(README_PATH, README_BACKUP);
    console.log(`  ✓ Backed up ${README_PATH} → ${README_BACKUP}`);

    // Copy MARKETPLACE.md to README.md
    fs.copyFileSync(MARKETPLACE_PATH, README_PATH);
    console.log(`  ✓ Copied ${MARKETPLACE_PATH} → ${README_PATH}`);

    // Backup original MARKETPLACE.md (for safety)
    fs.copyFileSync(MARKETPLACE_PATH, MARKETPLACE_BACKUP);
    console.log(`  ✓ Backed up ${MARKETPLACE_PATH} → ${MARKETPLACE_BACKUP}`);

    console.log('✅ Ready for marketplace publishing!');
    console.log('   Run: npm run package');
    console.log('   Then: node scripts/prepare-marketplace.js restore');
}

function restore() {
    console.log('🔄 Restoring original files...');

    // Check backups exist
    if (!fs.existsSync(README_BACKUP)) {
        console.error(`❌ ${README_BACKUP} not found. Nothing to restore.`);
        process.exit(1);
    }

    // Restore README.md from backup
    fs.copyFileSync(README_BACKUP, README_PATH);
    console.log(`  ✓ Restored ${README_BACKUP} → ${README_PATH}`);

    // Restore MARKETPLACE.md from backup if it exists
    if (fs.existsSync(MARKETPLACE_BACKUP)) {
        fs.copyFileSync(MARKETPLACE_BACKUP, MARKETPLACE_PATH);
        console.log(`  ✓ Restored ${MARKETPLACE_BACKUP} → ${MARKETPLACE_PATH}`);
    }

    // Remove backups
    fs.unlinkSync(README_BACKUP);
    console.log(`  ✓ Removed ${README_BACKUP}`);

    if (fs.existsSync(MARKETPLACE_BACKUP)) {
        fs.unlinkSync(MARKETPLACE_BACKUP);
        console.log(`  ✓ Removed ${MARKETPLACE_BACKUP}`);
    }

    console.log('✅ Files restored!');
}

function status() {
    console.log('📊 Current status:');
    console.log(`  ${README_PATH}: ${fs.existsSync(README_PATH) ? '✓ exists' : '✗ missing'}`);
    console.log(`  ${MARKETPLACE_PATH}: ${fs.existsSync(MARKETPLACE_PATH) ? '✓ exists' : '✗ missing'}`);
    console.log(`  ${README_BACKUP}: ${fs.existsSync(README_BACKUP) ? '⚠️ exists (needs restore)' : '✓ not found'}`);
    console.log(`  ${MARKETPLACE_BACKUP}: ${fs.existsSync(MARKETPLACE_BACKUP) ? '⚠️ exists (needs restore)' : '✓ not found'}`);

    if (fs.existsSync(README_BACKUP)) {
        console.log('\n⚠️ Backups exist - run "restore" to restore original files');
    } else {
        console.log('\n✅ No active swaps - ready to swap for publishing');
    }
}

// Main
const command = process.argv[2];

switch (command) {
    case 'swap':
        swap();
        break;
    case 'restore':
        restore();
        break;
    case 'status':
        status();
        break;
    default:
        console.log(`
Usage:
  node scripts/prepare-marketplace.js swap    # Prepare for publishing
  node scripts/prepare-marketplace.js restore # Restore after publishing
  node scripts/prepare-marketplace.js status  # Check current state

Publishing workflow:
  1. npm version patch/minor/major  # Bump version
  2. npm run prepare-publish        # Swap to marketplace version
  3. npm run package                # Create .vsix package
  4. npm run restore-publish        # Restore original README
  5. vsce publish / ovsx publish    # Publish to marketplaces
        `);
        process.exit(1);
}

