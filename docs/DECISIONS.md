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
