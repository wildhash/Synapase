#!/usr/bin/env node
/**
 * Build script for packaging the Logi Actions Plugin for Logitech Options+.
 * Copies the compiled plugin and manifest into dist/logi-plugin-package/.
 */
import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const root = join(__dirname, '..');
const pluginSrc = join(root, 'apps', 'logi-actions-plugin');
const outDir = join(root, 'dist', 'logi-plugin-package');

mkdirSync(outDir, { recursive: true });

const files = [
  ['manifest.json', 'manifest.json'],
  ['dist/plugin.js', 'plugin.js'],
];

for (const [src, dest] of files) {
  const srcPath = join(pluginSrc, src);
  const destPath = join(outDir, dest);
  if (existsSync(srcPath)) {
    copyFileSync(srcPath, destPath);
    console.log(`Copied ${src} -> dist/logi-plugin-package/${dest}`);
  } else {
    console.warn(`Warning: ${srcPath} not found — run pnpm build first`);
  }
}

console.log('\n✅ Plugin package ready at dist/logi-plugin-package/');
console.log('   Load in Logitech Options+ via Developer Mode → Load Unpacked Plugin');
