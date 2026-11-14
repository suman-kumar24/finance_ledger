# Ledger privacy policy

_Last updated: replace with the release date. Replace "the developer" and the contact address below before publishing._

Ledger is a personal finance app that works fully offline. This policy describes exactly what the app does with your data. It is written to match the app's behaviour, and the app's source code can be checked against it.

## The short version

- Your data stays on your phone.
- There is no Ledger server, no Ledger account, no advertising and no analytics.
- The only time Ledger contacts the internet is if **you** switch on Google Drive backup. Then it talks only to Google, and only to a private folder in your own Drive.

## What Ledger stores, and where

Everything you enter (accounts, transactions, budgets, goals, plans, categories, settings) is stored in a database inside the app's private storage on your phone. Other apps cannot read it. Android's own app backup is turned off for Ledger.

Your app-lock PIN is stored only as a salted hash in the Android Keystore-backed secure store. It is never in the database, in backups or in exports.

## What Ledger can access, and why

| Access | Why | When |
| --- | --- | --- |
| Microphone and speech recognition | To turn a spoken entry ("400 on food") into text | Only when you tap the microphone. Where the phone has an offline speech model, Ledger requires it. If not, Ledger asks before using Android's speech service, which may send audio to its provider (usually Google) to convert it to text. Ledger never receives or keeps the audio. |
| Notifications | Budget, card-bill, recurring-item and reminder alerts | All notifications are created on the phone. No push service is used. |
| Fingerprint or face | To unlock the app | Only if you turn on app lock. Ledger never sees your biometric data; Android reports success or failure. |
| SMS (`full` build only) | To find bank and card transaction alerts and offer them as entries | Only if you turn on SMS import and grant the permission. See below. |
| Google account and Drive app-data folder | To back up and restore | Only if you turn on backup. |
| Files you choose | To import a CSV or restore a backup, or to share an export | Only through the system file picker and share sheet. |

Ledger does not request your location, contacts, camera or storage.

## SMS import (full build only)

This feature is off until you turn it on and grant the permission, after a screen that explains it. When on, Ledger reads the SMS inbox on your phone and parses transaction alerts from banks, cards, UPI apps and wallets on the device.

- One-time passwords, promotions, payment requests, failed-transaction notices and messages from ordinary phone numbers are discarded and never stored.
- For bank alerts, only the amount, date, merchant name, last 4 digits, available balance and a one-way hash are kept. **The message text is never stored.**
- Alerts wait in a review inbox. Nothing enters your ledger until you confirm it.
- Nothing read from SMS ever leaves your phone.
- Turning the feature off deletes the review inbox and saved account matches.

The Google Play version of Ledger does not contain this feature and does not declare any SMS permission.

## Google Drive backup (optional)

If you connect Google Drive, Ledger signs you in with Google Sign-In and requests only the `drive.appdata` permission. That is a hidden folder reserved for Ledger; Ledger cannot see or change any other file in your Drive.

Each backup is one JSON file. If you set a passphrase, the file is encrypted on your phone (scrypt key derivation, AES-256-GCM) before upload, and the developer and Google cannot read it. A forgotten passphrase cannot be recovered. Ledger keeps your 7 most recent backups and deletes older ones.

Google's handling of data in your Drive is governed by Google's own privacy policy. Disconnecting in Ledger signs out and revokes Ledger's access; backups already in your Drive remain until you delete them in Google Drive's "Manage apps" settings.

## Exports

CSV and JSON exports are created on your phone and offered through Android's share sheet. You choose where they go. They are not encrypted, so treat them like any financial document.

## What Ledger never does

- No analytics, crash reporting, advertising or tracking SDKs. A test in the project fails the build if a networking or analytics package is added.
- No sale or sharing of data. The developer receives none.
- No profiling, credit scoring or lending decisions.

## Screen privacy

By default Ledger blanks its screen in the recent-apps view and blocks screenshots (you can turn this off in Settings > App lock and privacy).

## Deleting your data

"Delete all data" in Settings erases everything on the phone. Uninstalling the app also removes it. Backups in your own Drive are yours to delete.

## Children

Ledger is not directed at children.

## Changes

If the app's behaviour changes, this policy will be updated and the date above changed.

## Contact

[developer contact address]
