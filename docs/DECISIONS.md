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
