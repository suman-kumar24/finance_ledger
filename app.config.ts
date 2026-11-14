import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * App identity is configurable without touching code:
 *   LEDGER_APP_NAME      display name            (default "Ledger")
 *   LEDGER_PACKAGE_ID    Android application id  (default "com.example.ledger")
 *   LEDGER_VERSION_CODE  Android versionCode     (default 1)
 *   GOOGLE_WEB_CLIENT_ID optional OAuth web client id (see README)
 */
const APP_NAME = process.env.LEDGER_APP_NAME ?? 'Ledger';
const PACKAGE_ID = process.env.LEDGER_PACKAGE_ID ?? 'com.example.ledger';
const VERSION_CODE = Number(process.env.LEDGER_VERSION_CODE ?? '1');

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: APP_NAME,
  slug: 'ledger',
  version: '1.0.0',
  orientation: 'portrait',
  scheme: 'ledger',
  userInterfaceStyle: 'automatic',
  icon: './assets/images/icon.png',
  platforms: ['android'],
  android: {
    package: PACKAGE_ID,
    versionCode: VERSION_CODE,
    adaptiveIcon: {
      backgroundColor: '#0F5C4D',
      foregroundImage: './assets/images/adaptive-foreground.png',
      monochromeImage: './assets/images/adaptive-monochrome.png',
    },
    // Only what the app needs. SMS permissions are NOT listed here: they are
    // added to the `full` product flavour only by plugins/withLedgerFlavors.
    permissions: ['RECORD_AUDIO', 'POST_NOTIFICATIONS', 'USE_BIOMETRIC', 'USE_FINGERPRINT'],
    blockedPermissions: [
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.SYSTEM_ALERT_WINDOW',
    ],
    allowBackup: false,
  },
  plugins: [
    'expo-router',
    'expo-sqlite',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#0F5C4D',
        image: './assets/images/splash-icon.png',
        imageWidth: 120,
      },
    ],
    'expo-font',
    'expo-secure-store',
    'expo-localization',
    'expo-background-task',
    ['expo-notifications', { icon: './assets/images/notification-icon.png', color: '#0F5C4D' }],
    [
      'expo-local-authentication',
      { faceIDPermission: 'Allow $(PRODUCT_NAME) to unlock with Face ID.' },
    ],
    [
      'expo-speech-recognition',
      {
        microphonePermission: 'Allow $(PRODUCT_NAME) to hear you so it can fill in an entry.',
        speechRecognitionPermission: 'Allow $(PRODUCT_NAME) to turn speech into text.',
        androidSpeechServicePackages: [
          'com.google.android.googlequicksearchbox',
          'com.google.android.as',
        ],
      },
    ],
    '@react-native-google-signin/google-signin',
    [
      'expo-build-properties',
      {
        android: {
          // Release builds are shrunk with R8. WorkManager (used by expo-background-task
          // for the daily backup) creates its Room database by reflection, so R8 must not
          // remove the generated constructors. Without this the app crashes at launch with
          // NoSuchMethodException: androidx.work.impl.WorkDatabase_Impl.<init>.
          extraProguardRules: [
            '-keep class * extends androidx.room.RoomDatabase { <init>(...); }',
            '-keep class androidx.work.impl.WorkDatabase_Impl { *; }',
            '-keep class androidx.work.impl.** { <init>(...); }',
          ].join('\n'),
        },
      },
    ],
    './plugins/withLedgerFlavors',
  ],
  experiments: { typedRoutes: true },
  extra: {
    googleWebClientId: process.env.GOOGLE_WEB_CLIENT_ID ?? null,
    // Links this app to its Expo (EAS Build) project. Not a secret.
    eas: { projectId: '6db7d8ab-f457-44d3-98ee-6a1388e9f4d4' },
  },
});
