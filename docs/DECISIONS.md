# Decisions

Choices made while building Ledger that the brief left open. Newest phase last.

## Phase 1: scaffold

| Topic | Decision | Why |
| --- | --- | --- |
| Expo SDK | SDK 58 (React Native 0.88, React 19.3), development build only | Latest stable at the time of writing. Expo Go cannot load the SMS, speech or Google Sign-In native code. |
| Platforms | `platforms: ['android']` in `app.config.ts` | The brief is Android-only; iOS and web folders are not generated. |
| Source layout | Routes in `src/app`, everything else beside it in `src` | Expo Router convention; keeps screens thin. |
| Money | Integer minor units (`Minor = number`), parsed from the string digits and formatted from the integer digits; `mulDiv` uses BigInt | No float ever holds an amount. Safe up to about 90 lakh crore rupees. |
| Dates | Every transaction stores `occurredAt` (epoch ms) **and** `day` (local `YYYY-MM-DD`) | All month, budget and card-cycle maths runs on `day`, so results never shift with the device time zone, and the column is indexable. |
| Sign convention | Each account has one signed balance as an asset value. A credit card's outstanding is a negative balance (`outstanding = -balance`). Transaction amounts are positive, except `adjustment`, which is signed | One formula covers every account type; the UI flips the sign for cards. |
| Ids | Random UUIDs (text primary keys) | Rows keep their identity across backup and restore. |
| Database driver in tests | Repositories take a `Db` type that both expo-sqlite and better-sqlite3 satisfy; Jest runs the real migrations on in-memory SQLite | The SQL the app runs is the SQL that is tested. |
| Migrations | `drizzle-kit generate` (driver `expo`), bundled as `.sql` text through `babel-plugin-inline-import` and applied at start-up | Versioned, forward-only. |
| Extra tables | `card_statements` (minimum due per cycle), `reconciliations` (history), `category_keywords` (parser learning), `sms_inbox`, `sms_account_map`, `alert_log`, `budget_categories`, `goal_contributions` | Needed by brief sections 3.3, 3.6, 6, 7 and 8. |
| Budgets | One row per budget per period, linked across months by `seriesId` | Lets a month's limit change without rewriting history; "recurring" copies the row forward. |
| Network guard | ESLint bans `fetch`/`XMLHttpRequest`/`WebSocket` and networking packages everywhere except `src/backup/drive`; a Jest test repeats the check on the source tree and on `package.json` | A lint rule can be disabled in a file; the test cannot be skipped quietly. |
| Purity guard | ESLint bans React, React Native, Expo and DB imports inside `src/domain`, `src/parse`, `src/sms`, `src/csv`, `src/backup/format` | Keeps the accounting rules unit-testable. |
| Coverage gate | Jest threshold of 90% lines/statements/functions on the pure modules | Brief section 11. |

## Phase 2: accounting rules

| Topic | Decision | Why |
| --- | --- | --- |
| Entries before an account's opening date | They do not change that account's balance (the opening balance already includes them) but still count in that month's reports | Lets you backfill history without breaking today's balance. Each side of a transfer is checked against its own account. |
| Scheduled entries | Ignored by balances, spending and card cycles until cleared | A plan is not a fact. |
| Refund without a spending category | Counted as income (under its income category, or "uncategorised") | There is no category to reduce; hiding it would lose money from the reports. |
| Refund floor | Applied per category per period: `net = max(0, gross - credits)` | Brief rule 5. A large refund never produces negative spending. |
| Adjustments | Count only when filed under a category. In a spending category a negative adjustment adds spending and a positive one reduces it; in an income category it adds income | Brief rule 6. |
| Saved/Invested | Net of transfers into savings/investment accounts minus transfers back out; moves between two saving accounts count as zero | A withdrawal should undo the saving it reverses. |
| Subcategories | Spending is recorded on the category chosen. Reports roll children up to the parent; a budget that lists a parent covers its children | One level only, as in the brief. |
| Period naming with a custom start day | Start day 1-15: named after the month it starts in. Start day 16-31: named after the month it ends in | With pay day on the 30th, "November" is 30 Oct - 29 Nov, which is how people talk about it. |
| Start day a month lacks | Clamped to the month's last day (30 becomes 28 Feb) | Keeps periods contiguous; tested for gaps and overlaps. |
| Statement total | Outstanding at the end of the statement date, floored at zero, unless the user typed the printed total | The typed figure wins because it includes interest and fees the app cannot know. |
| Current bill vs unbilled | `currentBill = max(0, statementTotal - payments since statement)`; `unbilled = outstanding - currentBill` | The two always add up to the outstanding amount. An overpayment or a late refund reduces unbilled. |
| Card added after its last statement | Opening outstanding is treated as that statement's bill until the user enters the real total | Conservative: it prompts a payment rather than hiding one. |
| Unpaid bill after the next statement | Rolls into the next statement total | Mirrors how issuers bill. |
| Budget "warning" | `spent >= threshold%` of the limit; exactly at the limit is still a warning, over only when strictly above | Brief section 8. |
| Budget alerts | One alert per level (warning, over, a further 10% over) per budget series per period; if one entry crosses several levels only the highest fires | Avoids three notifications from one save. |
| Pace | Even spread of the limit over the period; within 5% of the limit either side is "on pace" | Simple and explainable. |
| Net worth | Non-archived accounts only | Archiving is how an account is closed. |

## Phase 3: core UI

| Topic | Decision | Why |
| --- | --- | --- |
| Live queries | Repositories bump a change counter after every write; `useLive` re-runs its (synchronous, indexed) query when it changes | Deterministic, works the same in the app and in Jest, and avoids threading async state through every screen. |
| Navigation | Five tabs (Overview, Transactions, Accounts, Plans, Reports); Settings opens from the Overview header; quick add is a transparent modal route styled as a bottom sheet | Keeps the tab bar to five and gives quick add its own back-stack entry. |
| Quick add | Custom amount keypad shown first; most-used categories as chips; account, method and date default from the last entry of that type | The common case is amount, category, Save. |
| Future-dated entries | Saved as `scheduled`; cleared automatically when their day arrives (on open or foreground) | The user explicitly scheduled them. |
| Transfer to a card | Stored as `card_payment` however it was entered | Guarantees it is never counted as spending. |
| Category on transfers | Dropped: money moving between your own accounts has no spending category | Prevents accidental double counting through a category. |
| Deleting an account | Blocked when any transaction or recurring rule refers to it; the dialog offers "Archive instead" | Brief section 11. |
| Deleting a category | A used category (or one with subcategories) is archived; an unused one is deleted | Past months keep their labels. |
| Delete all data | Two confirmations; also clears the PIN from the secure store | It cannot be undone. |
| App lock | PIN stored only as a salted PBKDF2-SHA256 hash in the Keystore-backed secure store, outside the database; biometric unlock is optional; relock after 30 seconds in the background; rising delay after 5 wrong PINs | The PIN never appears in a backup or export. |
| Recent-apps privacy | `FLAG_SECURE` through expo-screen-capture, on by default, with a toggle | Brief section 10. |
| Icons | MaterialCommunityIcons only, imported as a single set | One font in the bundle; a test checks every icon name exists. |
| Strings | Flat key tables `en.ts` and `hi.ts`; the Hindi table's type requires every English key; a test checks placeholders match and every key used by a screen exists | Missing translations fail the build. |
| Accessibility | Every control has a role and label, touch targets are at least 48dp, status pills always carry an icon and a word, amounts use `adjustsFontSizeToFit` with a capped font multiplier | Brief section 5. |
| Screen tests | Screens are rendered in Jest with React Native Testing Library against real in-memory SQLite; only native modules are mocked | Catches wiring mistakes that unit tests of pure functions cannot. |

## Phase 4: budgets, recurring rules, notifications

| Topic | Decision | Why |
| --- | --- | --- |
| Recurring budgets | When a new period has no budgets, recurring ones are copied from the latest earlier period. Deleting a budget stops its series recurring | Lets each month's limit be edited without changing history, and a deleted budget stays deleted. |
| "Copy last month's budgets" | Copies every budget (recurring or not) from the latest earlier period that has any, skipping series already present | Safe to press twice. |
| Overlapping budgets | Allowed, with a note in the editor: the category's spending counts towards both | Some people want "Food" and "Eating out" as separate views. |
| Auto-create rules | Entries are created when the app is next opened (or returns to the foreground), one per missed occurrence, dated on the due date | There is no server and no always-running background process; the dates stay correct. |
| Remind-only rules | Stay due under "Coming up" until the user records or skips them | Nothing is saved without the user. |
| Rule that cannot be saved | Paused rather than crashing start-up (for example, its account was deleted) | Fail safe. |
| Month-end rules | The day of month is remembered (`anchorDay`), so a rule on the 31st goes 31 Jan, 28 Feb, 31 Mar | Avoids drifting to the 28th forever. |
| Time-based notifications | Planned by a pure function and rescheduled from scratch whenever data changes or the app opens: bill due in 3 days and on the due day (09:00) while unpaid, each rule's next date, the daily reminder, and the monthly export reminder | Local-only; paying a bill removes its reminders automatically. |
| Budget alerts | Fired immediately when a saved entry crosses a level in the current period; recorded in `alert_log` so each fires once per budget per month | Brief section 8. Backdated entries in past months stay quiet. |
| Notification permission | Asked only when the user turns a notification switch on (or finishes onboarding with alerts wanted), never at first launch | Fewer surprise prompts. |
| "Coming up" | Card bills with an unpaid balance, recurring occurrences and scheduled entries in the next 14 days; overdue items stay until dealt with | Brief section 5.2. |

## Phase 5: plans and reports

| Topic | Decision | Why |
| --- | --- | --- |
| Goal progress | Sum of the goal's contributions (which can be negative for withdrawals), not the linked account's balance | One savings account can hold several goals. |
| Linked savings account | A contribution can also record the transfer between a chosen account and the goal's savings account | Keeps balances right and counts it as Saved/Invested, never as spending. |
| Monthly amount needed | `ceil(remaining / monthsLeft)`, where months left counts the current month and is at least 1 | Rounding up means the plan never falls short. |
| Planned purchase bought | Creates an `expense` with the purchase name as payee and links it; deleting the plan later keeps the expense | Brief section 4. |
| Reports | Trend over the last 6 or 12 periods, breakdown by top-level category, and change against the previous period sorted by biggest mover | Brief section 5.7. |
| Charts | Hand-built with react-native-svg. Each chart is one accessible element with a spoken summary, and the same numbers are listed as text underneath | No chart library; nothing relies on colour. |

## Phase 6: voice and text entry

| Topic | Decision | Why |
| --- | --- | --- |
| Parser | Deterministic token pipeline in `src/parse`: date, accounts, amount, method, type, category, payee, in that order, each claiming the words it used | Order matters: "card 4321" must be read as an account before the amount finder sees the digits. |
| Number arithmetic | Integers in hundredths throughout ("1.2k" is exactly 1,200.00) | Same no-float rule as the rest of the app. |
| Romanised Hindi spelling | Words are compared after a spelling key (`aa` to `a`, `w` to `v`, `z` to `j`, doubled letters collapsed), and a test proves no key maps to two numbers | "chaar"/"char", "hazaar"/"hajar", "ikyawan"/"ikyavan" all work without listing every spelling. |
| Ambiguous words | "do", "so", "bara", "tera", "sat" count as numbers only before a multiplier ("do sau"), never alone | They are ordinary English or Hindi words too. |
| Several numbers | A number next to a currency mark wins; otherwise the largest wins and the amount is flagged for checking | "2 pizzas 600" should be 600, but the user should look. |
| "kal" | Past (yesterday) unless the sentence has future words ("dena hai", "karna hai"); flagged as uncertain when nothing disambiguates it. "kal raat" is last night | Brief section 6: default to the past for expenses. |
| Day and month without a year | The most recent such date, unless that is more than a month ahead, when last year is meant | Entries are nearly always about the past. |
| Category match | User and learned keywords first, then the longest phrase, then the category's own name, then the built-in dictionary; restricted to the kind of entry (income or expense) | "school fees" must beat "fees". |
| Learning | On save, the payee is remembered against the category chosen; if the user corrected the parser's guess, that keyword is re-pointed too. A keyword the user typed in Settings is never overwritten by learning | Brief section 6. |
| Never saves silently | A parse only fills the quick-add sheet; guessed or missing fields get a dashed warning outline, a "?" icon and are named in `uncertain` | Brief section 6. |
| Speech | `expo-speech-recognition` with `en-IN` / `hi-IN` (toggle on the sheet). On-device recognition is required when the phone supports it. If it does not, the user is told that Android's speech service may send audio to its servers and must agree once before the microphone is used | Honest about the one place audio could leave the phone; typing is always fully offline. |

## Phase 7: SMS import

| Topic | Decision | Why |
| --- | --- | --- |
| Pattern storage | `src/sms/data/patterns.json`: ignore rules, issuer patterns (regular expressions with named groups `amount`, `last4`, `merchant`, `date`, `balance`) and the generic fallback rules | New formats are added as data. A test requires every pattern to be exercised by a sample. |
| Generic fallback | Needs an amount and a debit or credit word; when both appear ("debited ... and credited to X") the first one wins | Catches banks without a specific pattern. |
| What is ignored | OTPs, promotions, payment requests, failed or declined transactions, upcoming debits and mandates, due reminders, balance and service notices, and anything from a plain phone number | None of these are transactions that happened. They are dropped in memory and never stored. |
| What is stored | Parsed fields and a SHA-256 hash of sender, time and text. Never the message text | Brief section 7. A test dumps the table and checks no message fragments are present. |
| Date in an alert | Read day-first; used only if within 7 days of when the message arrived, otherwise the arrival day is used | Guards against misreading a reference number or a US-style date. |
| Account matching | By last 4 digits. An account whose own "last 4" matches is used automatically; otherwise the user picks once and it is remembered for every later alert | "Mapped once". |
| Duplicates | (1) same hash: skipped. (2) same amount, same account when known, same direction, within one day of an existing entry or pending alert: imported but flagged, with a one-tap "dismiss likely duplicates" | A hand-typed entry is not silently doubled, and nothing is silently dropped either. |
| Card bill payments | Alerts that mention a card bill are suggested as `card_payment`, not as an expense or income | Protects the no-double-count rule on the import path too. |
| Review first | Alerts go to "Inbox to review"; the ledger changes only when the user taps Add | Brief section 7. |
| Native module | A local Expo module in `modules/ledger-sms` (Kotlin) with `readInbox(since, limit)` and an in-app receiver for new messages. It declares no permissions itself | Keeps the `play` flavour clean. |
| New-message listening | A receiver registered only while the app is running; anything missed is found by the next inbox scan | No background service and no manifest receiver. |
| Flavours | Real Gradle product flavours `full` and `play`, added by a config plugin. The feature's availability is decided at run time from the installed manifest, not from a JavaScript flag | The same JavaScript bundle is correct in both builds. |
| Turning it off | Deletes the review inbox and the account matches | Leaves nothing behind. |

## Phase 8: backup, restore, export

| Topic | Decision | Why |
| --- | --- | --- |
| Backup file | One JSON document: app id, schema version, time, counts and every table. Restore recomputes counts, checks every money column is an integer, and refuses newer versions | An older app never guesses at a newer file. |
| Encryption | Optional passphrase: scrypt (N=2^15, r=8, p=1) then AES-256-GCM, random salt and nonce, header authenticated; pure JS (@noble) | Works identically on the phone and in tests; no native code. |
| Passphrase storage | Android Keystore-backed secure store, never the database or a backup | Automatic daily backups need it; it must not leave the phone. |
| Drive | `drive.appdata` scope only; all requests in `src/backup/drive`, host `www.googleapis.com` only (guard test); last 7 backups kept | Brief sections 9 and 10. |
| Auto backup | Once a day, Wi-Fi only; runs on app open and as a background task when Android allows | Android does not guarantee background timing; app open catches up. |
| Restore | Shows date and counts, then replaces all data in one SQLite transaction; this phone's lock, backup and SMS settings are kept | All or nothing. |
| Excluded from backups | Device-only settings, the SMS review inbox, PIN, passphrase | They belong to the phone. |
| CSV export | Exact decimals, signed column, formula-neutralised cells; opens the share sheet | The app sends nothing itself. |
| CSV import | Header-based column guess, user can remap, date order detected, preview with skipped rows and unknown categories before saving | Brief section 9. |
| Without Drive | Monthly export reminder (Phase 4) is scheduled from the last export or backup | Brief section 9. |

## Phase 9 (first pass): working model

| Topic | Decision | Why |
| --- | --- | --- |
| Demo data | `npm run seed:demo` builds a fictional dataset in memory and writes it as a restorable backup file; the app never contains it | Same restore path a real user would use. |
| Icons | Original artwork drawn by `scripts/make-icons.py` (open ledger with a rising line) | Placeholder-quality; to be refined in the polish pass. |
| Performance | A Jest test loads 20,000 rows and times the screens' queries; the transaction list is FlashList with paging | Indexed queries keep every query in the tens of milliseconds. |
| Deferred to polish | TalkBack walkthrough on a device, empty-state review, icon refinement, Play listing assets | Needs a device and design time. |
