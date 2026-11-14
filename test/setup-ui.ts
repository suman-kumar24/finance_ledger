/* Mocks for rendering screens. Native modules are replaced; the database is real SQLite. */
import 'react-native-gesture-handler/jestSetup';

jest.mock('@/db/client', () => ({
  getDb: () => jest.requireActual('./screens').testDb(),
  initDatabase: async () => jest.requireActual('./screens').testDb(),
  isDatabaseReady: () => true,
  DATABASE_NAME: 'test',
}));

jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);

jest.mock('expo-router', () => {
  const router = {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    navigate: jest.fn(),
    dismissTo: jest.fn(),
    dismissAll: jest.fn(),
    canGoBack: () => true,
  };
  return {
    router,
    useRouter: () => router,
    useLocalSearchParams: jest.fn(() => ({})),
    Redirect: () => null,
    Stack: Object.assign(() => null, { Screen: () => null }),
  };
});

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: async (key: string) => store.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => void store.set(key, value),
    deleteItemAsync: async (key: string) => void store.delete(key),
  };
});

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: async () => false,
  isEnrolledAsync: async () => false,
  authenticateAsync: async () => ({ success: false }),
}));

jest.mock('expo-screen-capture', () => ({
  preventScreenCaptureAsync: async () => undefined,
  allowScreenCaptureAsync: async () => undefined,
}));

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => {
  const glyphMap = jest.requireActual(
    '@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/MaterialCommunityIcons.json',
  );
  const Icon = () => null;
  Icon.glyphMap = glyphMap;
  return { __esModule: true, default: Icon };
});

// The swipe row needs the native animation runtime; tests render its child directly.
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => ({
  __esModule: true,
  default: ({ children }: { children: unknown }) => children,
}));

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => null),
  getPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  cancelAllScheduledNotificationsAsync: jest.fn(async () => undefined),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  AndroidImportance: { DEFAULT: 3 },
  SchedulableTriggerInputTypes: { DAILY: 'daily', DATE: 'date' },
}));

jest.mock('expo-speech-recognition', () => ({
  ExpoSpeechRecognitionModule: {
    start: jest.fn(),
    stop: jest.fn(),
    isRecognitionAvailable: jest.fn(() => true),
    supportsOnDeviceRecognition: jest.fn(() => true),
    requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  },
  useSpeechRecognitionEvent: jest.fn(),
}));

// Tests run as the `full` flavour unless a test says otherwise.
jest.mock('@/sms/native', () => ({
  smsSupported: jest.fn(() => true),
  smsListenSupported: jest.fn(() => true),
  hasSmsPermission: jest.fn(async () => true),
  requestSmsPermission: jest.fn(async () => true),
  readInbox: jest.fn(async () => []),
  listenForSms: jest.fn(() => () => undefined),
}));

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(async () => true),
    signIn: jest.fn(async () => ({
      type: 'success',
      data: { user: { email: 'me@example.invalid' } },
    })),
    signInSilently: jest.fn(async () => ({ type: 'success' })),
    getCurrentUser: jest.fn(() => ({})),
    hasPreviousSignIn: jest.fn(() => true),
    getTokens: jest.fn(async () => ({ accessToken: 'token', idToken: 'id' })),
    signOut: jest.fn(async () => null),
    revokeAccess: jest.fn(async () => null),
  },
}));
jest.mock('expo-network', () => ({
  getNetworkStateAsync: jest.fn(async () => ({ isConnected: true, type: 'WIFI' })),
  NetworkStateType: { WIFI: 'WIFI' },
}));
jest.mock('expo-background-task', () => ({
  BackgroundTaskResult: { Success: 1, Failed: 2 },
  registerTaskAsync: jest.fn(async () => undefined),
  unregisterTaskAsync: jest.fn(async () => undefined),
}));
jest.mock('expo-task-manager', () => ({ defineTask: jest.fn() }));
jest.mock('expo-constants', () => ({ expoConfig: { version: '1.0.0', extra: {} } }));
jest.mock('expo-file-system', () => ({ File: class {}, Paths: { cache: '' } }));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(),
}));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
