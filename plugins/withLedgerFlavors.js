/**
 * Expo config plugin: two Android product flavours.
 *
 *   full  - includes bank SMS import. Declares READ_SMS and RECEIVE_SMS.
 *           For direct distribution (APK), or Play if the Permissions
 *           Declaration is approved.
 *   play  - no SMS permission anywhere in the manifest. The SMS screens are
 *           hidden at run time because the native module reports the
 *           permission as undeclared. Ships on Google Play even if the
 *           declaration is refused.
 *
 * The permissions live ONLY in android/app/src/full/AndroidManifest.xml.
 * The plugin also strips them from the main manifest in case any library
 * tries to add them, so the `play` flavour can never pick them up by merge.
 *
 * Build:  npx expo run:android --variant fullDebug | playDebug
 *         cd android && ./gradlew bundlePlayRelease assembleFullRelease
 */
const {
  withAppBuildGradle,
  withAndroidManifest,
  withDangerousMod,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const SMS_PERMISSIONS = ['android.permission.READ_SMS', 'android.permission.RECEIVE_SMS'];
const MARKER = '// @generated ledger-flavors';

const FLAVOR_BLOCK = `
    ${MARKER}
    flavorDimensions "distribution"
    productFlavors {
        full {
            dimension "distribution"
            buildConfigField "boolean", "SMS_IMPORT", "true"
        }
        play {
            dimension "distribution"
            buildConfigField "boolean", "SMS_IMPORT", "false"
        }
    }
`;

/** Inserts the flavour block at the top of the `android { ... }` block. */
function addFlavors(contents) {
  if (contents.includes(MARKER)) return contents;
  const match = /^android\s*\{/m.exec(contents);
  if (!match) {
    throw new Error('withLedgerFlavors: could not find the android { } block in app/build.gradle');
  }
  const at = match.index + match[0].length;
  return contents.slice(0, at) + FLAVOR_BLOCK + contents.slice(at);
}

const FULL_MANIFEST = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <!-- Only the "full" flavour can read bank SMS alerts. See docs/PLAY_STORE.md. -->
    <uses-permission android:name="android.permission.READ_SMS" />
    <uses-permission android:name="android.permission.RECEIVE_SMS" />
</manifest>
`;

/** Removes SMS permissions from the shared manifest and blocks them from merging in. */
function stripSmsFromMain(manifest) {
  const root = manifest.manifest;
  root.$ = root.$ || {};
  root.$['xmlns:tools'] = 'http://schemas.android.com/tools';
  const kept = (root['uses-permission'] || []).filter(
    (p) => !SMS_PERMISSIONS.includes(p.$ && p.$['android:name']),
  );
  root['uses-permission'] = kept;
  return manifest;
}

const withLedgerFlavors = (config) => {
  config = withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy') {
      throw new Error('withLedgerFlavors: expected a Groovy app/build.gradle');
    }
    mod.modResults.contents = addFlavors(mod.modResults.contents);
    return mod;
  });

  config = withAndroidManifest(config, (mod) => {
    mod.modResults = stripSmsFromMain(mod.modResults);
    return mod;
  });

  config = withDangerousMod(config, [
    'android',
    async (mod) => {
      const dir = path.join(mod.modRequest.platformProjectRoot, 'app', 'src', 'full');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'AndroidManifest.xml'), FULL_MANIFEST);
      return mod;
    },
  ]);

  return config;
};

module.exports = withLedgerFlavors;
module.exports.addFlavors = addFlavors;
module.exports.stripSmsFromMain = stripSmsFromMain;
module.exports.FULL_MANIFEST = FULL_MANIFEST;
module.exports.SMS_PERMISSIONS = SMS_PERMISSIONS;
