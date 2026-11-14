# Google Play notes

Everything a reviewer or a future maintainer needs for the Play listing:
the two build flavours, the SMS Permissions Declaration, and the Data
safety answers. The Data safety section is completed in the final phase,
once backup and export exist.

## Two build flavours

| Flavour | SMS permissions in the manifest | Bank SMS import | Intended for |
| --- | --- | --- | --- |
| `play` | none | hidden | Google Play. Ships whether or not the declaration below is approved. |
| `full` | `READ_SMS`, `RECEIVE_SMS` | available, off until the user opts in | Direct APK distribution, or Google Play **only after** the declaration is approved. |

How this is enforced:

- `plugins/withLedgerFlavors.js` adds the `full` and `play` product flavours and writes the two
  permissions to `android/app/src/full/AndroidManifest.xml` only. It also strips them from the
  shared manifest, so a library can never merge them into `play`.
- The native module (`modules/ledger-sms`) declares no permission of its own. At run time it
  checks whether the installed build's manifest declares `READ_SMS`; if not, it reports itself
  unsupported and the app hides every SMS screen.
- `plugins/__tests__/withLedgerFlavors.test.js` fails the build if an SMS permission appears in
  `app.config.ts` or in the module's manifest.

Before uploading, confirm the `play` bundle really has no SMS permission:

```bash
cd android && ./gradlew bundlePlayRelease
```

```bash
bundletool dump manifest --bundle app/build/outputs/bundle/playRelease/app-play-release.aab | grep -i sms
```

The second command must print nothing.

## SMS Permissions Declaration (only if you submit the `full` flavour)

Google Play restricts `READ_SMS` and `RECEIVE_SMS`. An app may use them only for an approved
core purpose and must submit the Permissions Declaration form in Play Console
(App content > Sensitive app permissions). Approval is not guaranteed. If it is refused,
publish the `play` flavour instead; nothing else in the app depends on SMS.

Suggested answers. Read them against the current policy text before submitting, and change
anything that no longer matches what the app does.

**Core functionality of the app**

> Ledger is a personal finance tracker. Its core purpose is to record the user's income and
> spending across bank accounts, cash, wallets and credit cards, and to compare spending with
> budgets the user sets.

**Permitted use category**

> SMS-based money management (personal finance and budget tracking: reading financial
> transaction alerts sent by banks and card issuers).

**Why the app needs READ_SMS**

> With the user's explicit opt-in, Ledger reads the SMS inbox to find transaction alerts sent
> by the user's bank, card issuer, UPI app or wallet, so the user does not have to type each
> transaction by hand. Each alert is parsed on the device into amount, date, merchant, the last
> 4 digits of the account or card, and available balance. The parsed alert is shown in an
> "Inbox to review" screen; nothing is added to the user's ledger until the user confirms it.

**Why the app needs RECEIVE_SMS**

> Optional, and separately switched on by the user. While the app is open it lets a new
> transaction alert appear in the review inbox as it arrives, instead of at the next manual
> check. The app registers no background receiver.

**How the data is handled**

> - The feature is off by default. Before the system permission prompt, a screen explains what
>   is read and why.
> - All processing happens on the device. No SMS content, and no data derived from it, is ever
>   transmitted off the device by the app. The app has no server.
> - One-time passwords, promotional messages, payment requests, failed-transaction notices and
>   messages from personal phone numbers are discarded immediately and never stored.
> - The text of a message is never stored. Only the parsed fields and a one-way hash (used to
>   avoid importing the same message twice) are kept, in the app's private database.
> - Turning the feature off deletes the review inbox and the saved account matches.
> - SMS data is never used for advertising, credit scoring, lending decisions or sharing with
>   third parties.

**Video demonstration**

Play asks for a short screen recording. Show, in this order: Settings > Bank SMS import, the
explanation screen, tapping "Allow and turn on", the system permission prompt, the review
inbox with a parsed alert, and adding it to the ledger.

**Prominent disclosure text shown in the app** (kept in step with `sms.what*` and `sms.point*`
in `src/i18n/strings.tsv`)

> Ledger can read the transaction alerts your bank and card send by SMS, and offer them to you
> as entries to review. It reads the SMS inbox on this phone to find bank, card, UPI and wallet
> transaction alerts. OTPs, offers and personal messages are skipped and never stored. Only the
> amount, date, merchant, last 4 digits and balance are kept. The message text is not saved.
> Nothing is added to your ledger until you review it and tap Add. Everything happens on this
> phone. No message ever leaves it.
