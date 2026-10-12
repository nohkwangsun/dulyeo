#!/usr/bin/env bash
# Aligns and signs the unsigned release APK so that phones accept it as an update of the same app.
# Usage: scripts/sign-apk.sh <unsigned.apk> <out.apk>
# Env:   KEYSTORE_PATH, KEYSTORE_PASSWORD, KEY_ALIAS, KEY_PASSWORD  (ANDROID_HOME must point to the SDK)
set -euo pipefail

in="$1"; out="$2"
: "${KEYSTORE_PATH:?}" "${KEYSTORE_PASSWORD:?}" "${KEY_ALIAS:?}" "${KEY_PASSWORD:?}"
sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
[ -n "$sdk" ] || { echo "ANDROID_HOME is not set" >&2; exit 1; }
tools="$(ls -d "$sdk"/build-tools/* | sort -V | tail -n1)"

aligned="$(mktemp --suffix=.apk)"
"$tools/zipalign" -p -f 4 "$in" "$aligned"
"$tools/apksigner" sign \
  --ks "$KEYSTORE_PATH" --ks-key-alias "$KEY_ALIAS" \
  --ks-pass env:KEYSTORE_PASSWORD --key-pass env:KEY_PASSWORD \
  --out "$out" "$aligned"
"$tools/apksigner" verify --print-certs "$out" | head -n 3
rm -f "$aligned"
