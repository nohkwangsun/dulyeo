// Creates the Android project (if needed) and wires in the native TTS plugin + media permissions.
// Safe to run repeatedly. Usage: npm run android:setup
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = (cmd) => execSync(cmd, { cwd: root, stdio: 'inherit' });
const pkgDir = path.join(root, 'android/app/src/main/java/com/dulyeo/app');

if (!fs.existsSync(path.join(root, 'dist'))) run('npx vite build');
if (!fs.existsSync(path.join(root, 'android'))) run('npx cap add android');

fs.mkdirSync(pkgDir, { recursive: true });
fs.copyFileSync(path.join(root, 'android-plugin/DulyeoTtsPlugin.java'), path.join(pkgDir, 'DulyeoTtsPlugin.java'));
fs.writeFileSync(path.join(pkgDir, 'MainActivity.java'), `package com.dulyeo.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DulyeoTtsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
`);

const manifestPath = path.join(root, 'android/app/src/main/AndroidManifest.xml');
let manifest = fs.readFileSync(manifestPath, 'utf8');
const add = [];
for (const perm of ['FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_MEDIA_PLAYBACK', 'POST_NOTIFICATIONS', 'WAKE_LOCK']) {
  if (!manifest.includes(`android.permission.${perm}"`)) add.push(`    <uses-permission android:name="android.permission.${perm}" />`);
}
// Android 11+: apps must declare that they talk to TTS engines.
if (!manifest.includes('android.intent.action.TTS_SERVICE')) {
  add.push('    <queries>\n        <intent><action android:name="android.intent.action.TTS_SERVICE" /></intent>\n    </queries>');
}
if (add.length) {
  manifest = manifest.replace('<application', `${add.join('\n')}\n\n    <application`);
  fs.writeFileSync(manifestPath, manifest);
}

// CI passes the release version; locally it stays 1 / "1.0".
const gradlePath = path.join(root, 'android/app/build.gradle');
let gradle = fs.readFileSync(gradlePath, 'utf8');
const { DULYEO_VERSION_CODE: code, DULYEO_VERSION_NAME: name } = process.env;
if (code) gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${Number(code)}`);
if (name) gradle = gradle.replace(/versionName\s+"[^"]*"/, `versionName "${name.replace(/"/g, '')}"`);
fs.writeFileSync(gradlePath, gradle);

run('npx cap sync android');
console.log(`
Android project ready.
  Debug APK:   cd android && ./gradlew assembleDebug
               -> android/app/build/outputs/apk/debug/app-debug.apk
  After editing web code:  npm run android:sync
`);
