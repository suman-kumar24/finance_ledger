# Ledger

An offline-first personal ledger for Android (React Native, Expo SDK 58). Accounts, cards, budgets that warn early, goals and reports, with voice entry in English and Hindi, optional bank-SMS import, and optional backup to your own Google Drive. No server, no ads, no analytics.

Currency, number format and language are your choice (default: ₹, lakh/crore grouping, English and Hindi). Nothing is hard-coded to a bank, card or category.

## Requirements

- Node 22 and npm
- JDK 17 and the Android SDK (Android Studio is the easy way), with `ANDROID_HOME` set
- An Android phone with USB debugging, or an emulator

## Run it on your phone

Expo Go cannot run this app (SMS, speech and Google Sign-In need native code), so you use a development build.

```bash
npm install
npm run prebuild        # generates the android/ folder (including the full and play flavours)
npm run android         # builds and installs the fullDebug variant on the connected phone
```

For the Google Play flavour (no SMS permission):

```bash
npm run android:play
```

Then, for live reloading, `npm start` and open the app on the phone.

Demo data for screenshots (fictional, 3 months, 2 banks, 2 cards):

```bash
npm run seed:demo
```

This writes `demo/ledger-demo-backup.json`. Copy it to the phone and use Settings > Export and import > Restore from a JSON file.

## Checks

```bash
npm run check           # lint + type-check + tests
npm run test:coverage   # coverage on the pure domain modules
```

## Name and package id

Set before the first build (see `app.config.ts`):

```bash
LEDGER_APP_NAME="Ledger" LEDGER_PACKAGE_ID="com.yourname.ledger" npm run prebuild
```

The default package id is the placeholder `com.example.ledger`. Change it before publishing, and before creating the Google OAuth client (the two must match).

## Google Drive backup setup (what you must create)

Backup needs an OAuth client from your own Google Cloud project. The app works without it; only backup is disabled.

1. Create a project at <https://console.cloud.google.com/>.
2. APIs & Services > Library: enable **Google Drive API**.
3. APIs & Services > OAuth consent screen: choose External, fill in the app name and your email, and add the scope `.../auth/drive.appdata`. While in "Testing", add your Google account as a test user.
4. APIs & Services > Credentials > Create credentials > **OAuth client ID**:
   - Type **Android**, your package id, and the **SHA-1** of your signing key. Debug key: `cd android && ./gradlew signingReport`. Create one client per key (debug and release; if Play App Signing is on, also add the Play upload/app-signing SHA-1 from Play Console).
   - Type **Web application** (no redirect needed). Copy its client ID.
5. Build with the web client ID:

```bash
GOOGLE_WEB_CLIENT_ID="1234567890-abc.apps.googleusercontent.com" npm run prebuild
```

If sign-in fails with `DEVELOPER_ERROR`, the package id or SHA-1 of the Android client does not match the key that signed the build.

## Release build (APK / AAB)

1. Create a signing key (keep it and its password safe; losing it means you cannot update the app):

```bash
keytool -genkeypair -v -storetype PKCS12 -keystore ledger-release.keystore -alias ledger -keyalg RSA -keysize 2048 -validity 10000
```

2. Put the signing details in `android/keystore.properties` (git-ignored) and reference them from `android/app/build.gradle`'s `signingConfigs.release` block (the standard Android setup, since `android/` is generated).
3. Build:

```bash
cd android
./gradlew assembleFullRelease     # APK, with SMS import (direct distribution)
./gradlew bundlePlayRelease       # AAB for Google Play, no SMS permission
```

Outputs: `android/app/build/outputs/apk/full/release/` and `android/app/build/outputs/bundle/playRelease/`.

See `docs/PLAY_STORE.md` for the SMS declaration and Data safety answers, and `docs/PRIVACY_POLICY.md`.

## Project layout

| Path | What |
| --- | --- |
| `src/domain` | Pure TypeScript: money, dates, balances, card cycles, budgets, reports, goals |
| `src/parse` | On-device phrase parser (English, Hindi, Hinglish) |
| `src/sms` | SMS alert parser; patterns live in `src/sms/data/patterns.json` |
| `src/backup`, `src/csv` | Backup format and encryption, Drive client, CSV |
| `src/data` | Repositories over SQLite (Drizzle) with live queries |
| `src/app`, `src/features`, `src/ui` | Screens and components |
| `modules/ledger-sms` | Kotlin module that reads the SMS inbox on demand |
| `plugins/withLedgerFlavors.js` | Adds the `full` and `play` Android flavours |
| `docs/DECISIONS.md` | Every design decision and why |

To change strings, edit `src/i18n/strings.tsv` (English and Hindi side by side) and run `npm run i18n`.
