// Offline app shell for the browser/PWA build. Not needed in the Android app (assets are bundled).
export function registerSW() {
  if (!('serviceWorker' in navigator) || globalThis.Capacitor?.isNativePlatform?.()) return;
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
}
