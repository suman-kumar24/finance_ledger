// @ts-check
const expoConfig = require('eslint-config-expo/flat');
const prettier = require('eslint-config-prettier');

/**
 * Two project-specific guarantees are enforced here (brief §10 and §11):
 *
 * 1. NETWORK: the only code allowed to talk to the network is the Google
 *    Drive backup client. Everything else is forbidden from using fetch,
 *    XMLHttpRequest, WebSocket or any networking package.
 * 2. PURITY: domain modules are plain TypeScript and may not import React,
 *    React Native or Expo.
 */
const NETWORK_PACKAGES = [
  'axios',
  'ky',
  'got',
  'superagent',
  'node-fetch',
  'cross-fetch',
  'whatwg-fetch',
  'socket.io-client',
  'ws',
  'apollo-client',
  '@apollo/client',
  'graphql-request',
  'react-native-fetch-blob',
  'rn-fetch-blob',
  'react-native-blob-util',
  'firebase',
  '@react-native-firebase/*',
  '@sentry/*',
  'expo-updates',
  'expo-web-browser',
  'expo-auth-session',
  'expo-insights',
  '@amplitude/*',
  '@segment/*',
  'posthog-react-native',
  'mixpanel-react-native',
  'react-native-webview',
  'expo-file-system/legacy',
  'http',
  'https',
  'net',
  'node:http',
  'node:https',
  'node:net',
];

const networkGlobals = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'Request'].map(
  (name) => ({
    name,
    message: 'Network access is only allowed in src/backup/drive (see docs/PRIVACY_POLICY.md).',
  }),
);

module.exports = [
  ...expoConfig,
  prettier,
  {
    ignores: [
      'node_modules/**',
      'android/**',
      'ios/**',
      '.expo/**',
      'coverage/**',
      'drizzle/**',
      'demo/**',
      'expo-env.d.ts',
    ],
  },
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: NETWORK_PACKAGES,
              message:
                'Networking packages are not allowed. Only src/backup/drive may reach the network.',
            },
          ],
        },
      ],
      'no-restricted-globals': ['error', ...networkGlobals],
      'no-restricted-properties': [
        'error',
        { object: 'globalThis', property: 'fetch', message: 'Network access is restricted.' },
        { object: 'global', property: 'fetch', message: 'Network access is restricted.' },
        { object: 'navigator', property: 'sendBeacon', message: 'Network access is restricted.' },
      ],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },
  {
    // The single place that may use fetch: Google Drive REST client.
    files: ['src/backup/drive/**/*.ts'],
    rules: { 'no-restricted-globals': 'off' },
  },
  {
    // Pure domain modules: no UI or platform imports.
    files: [
      'src/domain/**/*.ts',
      'src/parse/**/*.ts',
      'src/sms/**/*.ts',
      'src/csv/**/*.ts',
      'src/backup/format/**/*.ts',
    ],
    ignores: ['src/sms/native.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                ...NETWORK_PACKAGES,
                'react',
                'react-native',
                'react-native-*',
                'expo',
                'expo-*',
                '@expo/*',
                'zustand',
                '@/app/*',
                '@/ui/*',
                '@/db/*',
              ],
              message: 'Domain modules must stay pure TypeScript (no React, RN, Expo or DB).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['scripts/**', '*.config.js', '*.config.ts', 'plugins/**', 'test/**', '**/__tests__/**'],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['**/__tests__/**', 'test/**', 'scripts/**'],
    rules: { 'no-restricted-imports': 'off' },
  },
];
