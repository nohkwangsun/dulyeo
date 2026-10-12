import { defineConfig } from 'vite';

// Relative base so the same build works from GitHub Pages sub-paths and inside the Android app.
export default defineConfig({ base: './', build: { target: 'es2022', outDir: 'dist' } });
