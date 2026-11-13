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
