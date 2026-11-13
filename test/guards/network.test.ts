/**
 * Privacy guard (brief §10): the build fails if anything other than the
 * Google Drive backup client can reach the network, or if a networking,
 * analytics or advertising package is added to the app.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..', '..');
const SRC = path.join(ROOT, 'src');
/** The only folder allowed to make network calls. */
const ALLOWED_DIR = path.join(SRC, 'backup', 'drive');

const FORBIDDEN_CODE: [RegExp, string][] = [
  [/\bfetch\s*\(/, 'fetch()'],
  [/\bXMLHttpRequest\b/, 'XMLHttpRequest'],
  [/\bnew\s+WebSocket\b/, 'WebSocket'],
  [/\bEventSource\b/, 'EventSource'],
  [/\bsendBeacon\b/, 'sendBeacon'],
  [
    /\bdownloadAsync\b|\buploadAsync\b|createDownloadResumable|createUploadTask/,
    'file-system network transfer',
  ],
  [
    /https?:\/\/(?!www\.googleapis\.com|schemas\.android\.com|www\.w3\.org)/,
    'URL to a host other than the Drive API',
  ],
];

/** Dependencies allowed to exist; anything new must be reviewed and added here. */
const ALLOWED_DEPENDENCIES = new Set([
  '@expo/vector-icons',
  '@noble/ciphers',
  '@noble/hashes',
  '@react-native-google-signin/google-signin', // Google Sign-In, only for Drive backup
  '@shopify/flash-list',
  'drizzle-orm',
  'expo',
  'expo-asset',
  'expo-background-task',
  'expo-build-properties',
  'expo-constants',
  'expo-crypto',
  'expo-dev-client', // development builds only; not in release builds
  'expo-document-picker',
  'expo-file-system',
  'expo-font',
  'expo-haptics',
  'expo-linking',
  'expo-local-authentication',
  'expo-localization',
  'expo-network', // reads connection type (Wi-Fi) only; makes no requests
  'expo-notifications', // local notifications only; no push token is requested
  'expo-router',
  'expo-screen-capture',
  'expo-secure-store',
  'expo-sharing',
  'expo-speech-recognition',
  'expo-splash-screen',
  'expo-sqlite',
  'expo-status-bar',
  'expo-system-ui',
  'expo-task-manager',
  'react',
  'react-native',
  'react-native-gesture-handler',
  'react-native-reanimated',
  'react-native-safe-area-context',
  'react-native-screens',
  'react-native-svg',
  'react-native-worklets',
  'zustand',
]);

const FORBIDDEN_IMPORT =
  /from\s+['"](axios|ky|got|superagent|node-fetch|cross-fetch|socket\.io-client|ws|expo-updates|expo-web-browser|expo-auth-session|react-native-webview|@sentry\/[^'"]+|@react-native-firebase\/[^'"]+|firebase[^'"]*|@amplitude\/[^'"]+|posthog-react-native|mixpanel-react-native|expo-file-system\/legacy)['"]/;

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(full);
    return /\.(ts|tsx|js|jsx)$/.test(entry.name) ? [full] : [];
  });
}

/** Removes comments so documentation may mention URLs and APIs. */
function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

describe('network guard', () => {
  const files = sourceFiles(SRC);

  it('finds source files to check', () => {
    expect(files.length).toBeGreaterThan(40);
  });

  it('allows network code only in src/backup/drive', () => {
    const offences: string[] = [];
    for (const file of files) {
      if (file.startsWith(ALLOWED_DIR + path.sep)) continue;
      const code = stripComments(fs.readFileSync(file, 'utf8'));
      for (const [pattern, label] of FORBIDDEN_CODE) {
        if (pattern.test(code)) offences.push(`${path.relative(ROOT, file)}: ${label}`);
      }
    }
    expect(offences).toEqual([]);
  });

  it('imports no networking, analytics or advertising module anywhere', () => {
    const offences = files
      .filter((file) => FORBIDDEN_IMPORT.test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(ROOT, file));
    expect(offences).toEqual([]);
  });

  it('has no dependency that has not been reviewed', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    const unknown = Object.keys(pkg.dependencies).filter((name) => !ALLOWED_DEPENDENCIES.has(name));
    expect(unknown).toEqual([]);
  });

  it('keeps the Drive client pointed at Google only', () => {
    if (!fs.existsSync(ALLOWED_DIR)) return;
    for (const file of sourceFiles(ALLOWED_DIR)) {
      const code = stripComments(fs.readFileSync(file, 'utf8'));
      const hosts = [...code.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1]);
      for (const host of hosts) expect(host).toBe('www.googleapis.com');
    }
  });

  it('declares no INTERNET-dependent services beyond Google Sign-In in app config', () => {
    const config = fs.readFileSync(path.join(ROOT, 'app.config.ts'), 'utf8');
    expect(config).not.toMatch(/expo-updates|sentry|firebase|admob|analytics/i);
  });
});
