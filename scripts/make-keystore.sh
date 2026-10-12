#!/usr/bin/env bash
# One-time: creates the signing key used for every release APK.
# KEEP THE KEYSTORE FILE SAFE. If you lose it, phones will refuse updates (you would have to uninstall first).
set -euo pipefail

ks="${1:-dulyeo.keystore}"
alias="${KEY_ALIAS:-dulyeo}"
[ -e "$ks" ] && { echo "$ks already exists; refusing to overwrite" >&2; exit 1; }
read -r -s -p "Choose a keystore password (6+ chars): " pass; echo
keytool -genkeypair -v -keystore "$ks" -alias "$alias" -keyalg RSA -keysize 2048 -validity 36500 \
  -storepass "$pass" -keypass "$pass" -dname "CN=Dulyeo, O=Personal"

echo
echo "Add these four repository secrets (GitHub > Settings > Secrets and variables > Actions):"
echo "  ANDROID_KEYSTORE_PASSWORD = (the password you just typed)"
echo "  ANDROID_KEY_PASSWORD      = (same password)"
echo "  ANDROID_KEY_ALIAS         = $alias"
echo "  ANDROID_KEYSTORE_BASE64   = (contents of the line below)"
echo
base64 -w0 "$ks" 2>/dev/null || base64 "$ks" | tr -d '\n'
echo
