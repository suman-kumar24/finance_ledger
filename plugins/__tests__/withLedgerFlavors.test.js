const fs = require('fs');
const path = require('path');

const plugin = require('../withLedgerFlavors');

const GRADLE = `apply plugin: "com.android.application"

android {
    ndkVersion rootProject.ext.ndkVersion
    namespace 'com.example.ledger'
    defaultConfig {
        applicationId 'com.example.ledger'
    }
}
`;

describe('withLedgerFlavors', () => {
  it('adds the full and play flavours once', () => {
    const once = plugin.addFlavors(GRADLE);
    expect(once).toMatch(/flavorDimensions "distribution"/);
    expect(once).toMatch(/full \{[\s\S]*SMS_IMPORT", "true"/);
    expect(once).toMatch(/play \{[\s\S]*SMS_IMPORT", "false"/);
    expect(once.indexOf('productFlavors')).toBeGreaterThan(once.indexOf('android {'));
    expect(plugin.addFlavors(once)).toBe(once);
  });

  it('fails loudly if the build file has no android block', () => {
    expect(() => plugin.addFlavors('plugins {}')).toThrow(/android/);
  });

  it('declares SMS permissions only in the full flavour manifest', () => {
    for (const permission of plugin.SMS_PERMISSIONS)
      expect(plugin.FULL_MANIFEST).toContain(permission);
  });

  it('strips SMS permissions from the shared manifest', () => {
    const manifest = {
      manifest: {
        $: {},
        'uses-permission': [
          { $: { 'android:name': 'android.permission.READ_SMS' } },
          { $: { 'android:name': 'android.permission.RECORD_AUDIO' } },
          { $: { 'android:name': 'android.permission.RECEIVE_SMS' } },
        ],
      },
    };
    const out = plugin.stripSmsFromMain(manifest);
    expect(out.manifest['uses-permission'].map((p) => p.$['android:name'])).toEqual([
      'android.permission.RECORD_AUDIO',
    ]);
  });

  it('keeps SMS permissions out of the app config and the native module manifest', () => {
    const root = path.join(__dirname, '..', '..');
    expect(fs.readFileSync(path.join(root, 'app.config.ts'), 'utf8')).not.toMatch(
      /READ_SMS|RECEIVE_SMS/,
    );
    const moduleManifest = fs
      .readFileSync(
        path.join(root, 'modules/ledger-sms/android/src/main/AndroidManifest.xml'),
        'utf8',
      )
      .replace(/<!--[\s\S]*?-->/g, '');
    expect(moduleManifest).not.toMatch(/uses-permission/);
  });
});
