import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// Relative base so the same build works from GitHub Pages sub-paths and inside the Android app.
// CI sets DULYEO_VERSION_NAME (e.g. 0.2.0-build.7) so the settings screen shows which build is installed.
export default defineConfig({
  base: './',
  build: { target: 'es2022', outDir: 'dist' },
  define: { __APP_VERSION__: JSON.stringify(process.env.DULYEO_VERSION_NAME || pkg.version) },
});
