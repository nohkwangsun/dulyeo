// Metadata for the Android media notification (@jofr/capacitor-media-session).
//
// The native plugin dereferences `artwork` and opens every http(s) artwork URL with HttpURLConnection.
// An unreachable URL (e.g. https://localhost/icon.svg inside the app) or a missing `artwork` throws on the
// plugin's handler thread, and Capacitor rethrows that as a RuntimeException that kills the whole app.
// So: always send an array, and never put a URL in it (SVG cannot be decoded as a Bitmap anyway).
export function mediaMetadata(track) {
  return { title: track.title, artist: 'Dulyeo', album: 'English listening', artwork: [] };
}
