/**
 * Turns a typed or spoken phrase into a draft entry. Deterministic and
 * entirely on-device: no network, no model.
 *
 *   "400 on food last night via UPI"
 *   "groceries 444 flipkart card"
 *   "चार सौ रुपये खाना कल रात"
 *   "mummy ko 10000 diye"
 *
 * The result never gets saved directly: it fills the quick-add sheet, with
 * `uncertain` naming the fields the user should check.
 */
import { addDays, type Day } from '../domain/dates';
import type { Minor } from '../domain/money';
import type { AccountType, CategoryKind, PaymentMethod, TransactionType } from '../domain/types';
import { CATEGORY_KEYWORDS, METHOD_WORDS, STOPWORDS, TYPE_WORDS } from './data/keywords';
import { CURRENCY_WORDS, PAISE_WORDS } from './data/numbers';
import { findDate } from './dateWords';
import { findNumbers, hundredthsToMinor } from './numbers';
import { isDevanagari, normalizeDevanagari, titleCase, tokenize, type Token } from './tokens';

export type ParsedField = 'amount' | 'category' | 'account' | 'date' | 'type' | 'method';

export interface ParseAccount {
  id: string;
  name: string;
  type: AccountType;
  last4: string | null;
}

export interface ParseCategory {
  id: string;
  name: string;
  kind: CategoryKind;
  systemKey: string | null;
}

/** A keyword the user added, or that the app learned from a correction. */
export interface UserKeyword {
  keyword: string;
  categoryId: string;
}

export interface ParseContext {
  today: Day;
  accounts: ParseAccount[];
  categories: ParseCategory[];
  userKeywords?: UserKeyword[];
  /** Minor-unit digits of the currency (2 for INR). */
  decimals?: number;
}

export interface ParsedEntry {
  type: TransactionType;
  amount: Minor | null;
  day: Day;
  categoryId: string | null;
  /** Null means "nothing said": keep the form's default account. */
  accountId: string | null;
  toAccountId: string | null;
  method: PaymentMethod | null;
  payee: string | null;
  /** Fields that were guessed or not found and need the user's eye. */
  uncertain: ParsedField[];
  /** Words that led to the category, so a correction can be learned. */
  categoryKeyword: string | null;
}

const STOP = new Set(STOPWORDS);
const MONEY_WORDS = new Set([...CURRENCY_WORDS, ...PAISE_WORDS]);
const GENERIC_ACCOUNT_WORDS = new Set([
  'bank',
  'account',
  'ac',
  'a/c',
  'card',
  'credit',
  'debit',
  'savings',
  'saving',
  'current',
  'salary',
  'wallet',
  'cash',
  'the',
  'my',
  'खाता',
  'कार्ड',
  'बैंक',
]);
const TO_WORDS = new Set(['to', 'into', 'in', 'ko', 'me', 'mein', 'को', 'में']);
const FROM_WORDS = new Set(['from', 'se', 'से']);
const LAST4_LEADS = new Set(['card', 'ending', 'xx', 'account', 'ac', 'a/c', 'no', 'खाता', 'कार्ड']);

function norm(text: string): string {
  return normalizeDevanagari(text.toLowerCase());
}

/** Equal, allowing a plain English plural: "pizzas" matches "pizza". */
function sameWord(token: string, word: string): boolean {
  if (token === word) return true;
  if (word.length < 3 || !/^[a-z]+$/.test(word)) return false;
  return token === `${word}s` || token === `${word}es`;
}

/** Finds a phrase (one or more words) among unused tokens; returns its start index or -1. */
function findPhrase(tokens: Token[], phrase: string): number {
  const words = norm(phrase).split(/\s+/);
  outer: for (let i = 0; i + words.length <= tokens.length; i += 1) {
    for (let k = 0; k < words.length; k += 1) {
      const token = tokens[i + k];
      if (!token || token.used || !sameWord(token.text, words[k] ?? '')) continue outer;
    }
    return i;
  }
  return -1;
}

function markUsed(tokens: Token[], start: number, length: number): void {
  for (let i = start; i < start + length; i += 1) {
    const token = tokens[i];
    if (token) token.used = true;
  }
}

function wordCount(phrase: string): number {
  return phrase.trim().split(/\s+/).length;
}

interface AccountHit {
  account: ParseAccount;
  index: number;
  length: number;
}

function findAccounts(tokens: Token[], accounts: ParseAccount[]): AccountHit[] {
  const hits: AccountHit[] = [];
  const nameTokens = accounts.map((a) =>
    norm(a.name)
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length >= 2),
  );
  const counts = new Map<string, number>();
  for (const words of nameTokens) {
    for (const word of new Set(words)) counts.set(word, (counts.get(word) ?? 0) + 1);
  }

  accounts.forEach((account, a) => {
    const words = nameTokens[a] ?? [];
    // Whole name first ("hdfc salary account"), then any word unique to this account.
    const full = findPhrase(tokens, words.join(' '));
    if (words.length > 0 && full >= 0) {
      hits.push({ account, index: full, length: words.length });
      return;
    }
    for (const word of words) {
      if (GENERIC_ACCOUNT_WORDS.has(word) || word.length < 3 || counts.get(word) !== 1) continue;
      const at = findPhrase(tokens, word);
      if (at >= 0) {
        // Swallow a following generic word: "flipkart card".
        const next = tokens[at + 1];
        const extra = next && !next.used && GENERIC_ACCOUNT_WORDS.has(next.text) ? 1 : 0;
        hits.push({ account, index: at, length: 1 + extra });
        return;
      }
    }
    if (account.last4) {
      const at = tokens.findIndex((t, i) => {
        const lead = tokens[i - 1];
        return (
          !t.used && t.text === account.last4 && lead !== undefined && LAST4_LEADS.has(lead.text)
        );
      });
      if (at >= 0) hits.push({ account, index: at - 1, length: 2 });
    }
  });
  return hits.sort((x, y) => x.index - y.index);
}

function findWordGroup(
  tokens: Token[],
  groups: Record<string, string[]>,
): { key: string; index: number; length: number } | null {
  let best: { key: string; index: number; length: number } | null = null;
  for (const [key, words] of Object.entries(groups)) {
    for (const word of words) {
      const at = findPhrase(tokens, word);
      if (at < 0) continue;
      const length = wordCount(word);
      if (!best || length > best.length || (length === best.length && at < best.index)) {
        best = { key, index: at, length };
      }
    }
  }
  return best;
}

interface CategoryHit {
  categoryId: string;
  index: number;
  length: number;
  keyword: string;
  learned: boolean;
}

function findCategory(
  tokens: Token[],
  ctx: ParseContext,
  kind: CategoryKind | null,
): CategoryHit | null {
  const candidates: (CategoryHit & { priority: number })[] = [];
  const byId = new Map(ctx.categories.map((c) => [c.id, c]));
  const allowed = (id: string) => {
    const category = byId.get(id);
    return category !== undefined && (kind === null || category.kind === kind);
  };
  const consider = (keyword: string, categoryId: string, priority: number, learned: boolean) => {
    if (!allowed(categoryId)) return;
    const at = findPhrase(tokens, keyword);
    if (at >= 0) {
      candidates.push({
        categoryId,
        index: at,
        length: wordCount(keyword),
        keyword: norm(keyword),
        learned,
        priority,
      });
    }
  };

  // 1. The user's own and learned keywords.
  for (const item of ctx.userKeywords ?? []) consider(item.keyword, item.categoryId, 0, true);
  // 2. The category's own name, as the user named it.
  for (const category of ctx.categories) {
    consider(category.name, category.id, 1, false);
    const first = norm(category.name).split(/[^\p{L}\p{N}]+/u)[0];
    if (first && first.length >= 4) consider(first, category.id, 1, false);
  }
  // 3. The built-in dictionary, through the default categories' keys.
  const byKey = new Map(ctx.categories.filter((c) => c.systemKey).map((c) => [c.systemKey, c.id]));
  for (const [key, words] of Object.entries(CATEGORY_KEYWORDS)) {
    const id = byKey.get(key);
    if (!id) continue;
    for (const word of words) consider(word, id, 2, false);
  }
  if (candidates.length === 0) return null;
  // Best: the user's own keywords first; then the longest phrase ("school fees"
  // beats "fees"); then category names over the dictionary; then the earliest.
  candidates.sort(
    (a, b) =>
      Number(a.priority > 0) - Number(b.priority > 0) ||
      b.length - a.length ||
      a.priority - b.priority ||
      a.index - b.index,
  );
  return candidates[0] ?? null;
}

function hasWord(tokens: Token[], words: string[]): boolean {
  return words.some((word) => findPhrase(tokens, word) >= 0);
}

export function parseEntry(text: string, ctx: ParseContext): ParsedEntry {
  const tokens = tokenize(text);
  const decimals = ctx.decimals ?? 2;
  const uncertain = new Set<ParsedField>();

  // Type words are read before anything is consumed, because one word can do
  // two jobs ("salary" is both a type hint and a category).
  const isRefund = hasWord(tokens, TYPE_WORDS.refund);
  const isTransferWord = hasWord(tokens, TYPE_WORDS.transfer);
  const isIncomeWord = hasWord(tokens, TYPE_WORDS.income);
  const isExpenseWord = hasWord(tokens, TYPE_WORDS.expense);

  // 1. Date.
  const date = findDate(tokens, ctx.today);
  if (date && !date.certain) uncertain.add('date');

  // 2. Accounts (before amounts, so "card 4321" is not read as money).
  const accountHits = findAccounts(tokens, ctx.accounts);
  for (const hit of accountHits) markUsed(tokens, hit.index, hit.length);

  // 3. Amount.
  const numbers = findNumbers(tokens).filter((n) => n.hundredths > 0);
  let amount: Minor | null = null;
  if (numbers.length === 0) {
    uncertain.add('amount');
  } else {
    const withCurrency = numbers.filter((n) => n.hasCurrency);
    const pool = withCurrency.length > 0 ? withCurrency : numbers;
    const chosen = pool.reduce((best, n) => (n.hundredths > best.hundredths ? n : best));
    if (pool.length > 1) uncertain.add('amount');
    amount = hundredthsToMinor(chosen.hundredths, decimals);
    markUsed(tokens, chosen.start, chosen.end - chosen.start);
    const before = tokens[chosen.start - 1];
    if (before && MONEY_WORDS.has(before.text)) before.used = true;
  }

  // 4. Payment method.
  const methodHit = findWordGroup(tokens, METHOD_WORDS);
  const method = (methodHit?.key as PaymentMethod | undefined) ?? null;
  if (methodHit) markUsed(tokens, methodHit.index, methodHit.length);

  // 5. Type.
  let type: TransactionType = 'expense';
  const twoAccounts = accountHits.length >= 2;
  const savingTarget = accountHits.some(
    (h) => h.account.type === 'investment' || h.account.type === 'savings',
  );
  if (isRefund) type = 'refund';
  else if (isTransferWord || twoAccounts || (savingTarget && !isIncomeWord && !isExpenseWord))
    type = 'transfer';
  else if (isIncomeWord && !isExpenseWord) type = 'income';

  // 6. Accounts into roles.
  let accountId: string | null = null;
  let toAccountId: string | null = null;
  if (type === 'transfer') {
    const roleOf = (hit: AccountHit): 'to' | 'from' | null => {
      const before = tokens[hit.index - 1]?.text ?? '';
      const after = tokens[hit.index + hit.length]?.text ?? '';
      if (TO_WORDS.has(before) || ['me', 'mein', 'ko', 'में', 'को'].includes(after)) return 'to';
      if (FROM_WORDS.has(before) || FROM_WORDS.has(after)) return 'from';
      return null;
    };
    const to = accountHits.find((h) => roleOf(h) === 'to');
    const from = accountHits.find((h) => roleOf(h) === 'from' && h !== to);
    const rest = accountHits.filter((h) => h !== to && h !== from);
    if (to || from) {
      accountId = (from ?? rest.shift())?.account.id ?? null;
      toAccountId = (to ?? rest.shift())?.account.id ?? null;
    } else if (twoAccounts) {
      accountId = accountHits[0]?.account.id ?? null;
      toAccountId = accountHits[1]?.account.id ?? null;
    } else if (accountHits[0]) {
      // One account named: money into savings is the destination, otherwise the source.
      const only = accountHits[0].account;
      if (only.type === 'investment' || only.type === 'savings') toAccountId = only.id;
      else accountId = only.id;
    }
    if (toAccountId !== null) {
      const target = ctx.accounts.find((a) => a.id === toAccountId);
      if (target?.type === 'credit_card') type = 'card_payment';
    }
    if (toAccountId === null) uncertain.add('type');
  } else if (accountHits[0]) {
    accountId = accountHits[0].account.id;
  } else if (method === 'cash') {
    const cash = ctx.accounts.filter((a) => a.type === 'cash');
    if (cash.length === 1 && cash[0]) accountId = cash[0].id;
  } else if (method === 'card') {
    const cards = ctx.accounts.filter((a) => a.type === 'credit_card');
    if (cards.length === 1 && cards[0]) {
      accountId = cards[0].id;
    } else if (cards.length > 1) {
      uncertain.add('account');
    }
  } else if (method === 'wallet') {
    const wallets = ctx.accounts.filter((a) => a.type === 'wallet');
    if (wallets.length === 1 && wallets[0]) accountId = wallets[0].id;
  }

  // An account named outright tells us how it was paid ("... cash", "... paytm wallet").
  let paidBy = method;
  if (paidBy === null && accountHits[0] && type !== 'transfer' && type !== 'card_payment') {
    const kind = accountHits[0].account.type;
    if (kind === 'cash') paidBy = 'cash';
    else if (kind === 'credit_card') paidBy = 'card';
    else if (kind === 'wallet') paidBy = 'wallet';
  }

  // 7. Category (not for money moving between your own accounts).
  let categoryId: string | null = null;
  let categoryKeyword: string | null = null;
  let categoryIndex = -1;
  if (type !== 'transfer' && type !== 'card_payment') {
    const wantKind: CategoryKind | null =
      type === 'income' ? 'income' : type === 'expense' ? 'expense' : null;
    let hit = findCategory(tokens, ctx, wantKind);
    // No explicit type word, but the only category found is an income one: treat as income.
    if (!hit && type === 'expense' && !isExpenseWord) {
      const incomeHit = findCategory(tokens, ctx, 'income');
      if (incomeHit) {
        hit = incomeHit;
        type = 'income';
      }
    }
    if (hit) {
      categoryId = hit.categoryId;
      categoryKeyword = hit.keyword;
      categoryIndex = hit.index;
    } else {
      uncertain.add('category');
    }
  }

  // 8. Payee: "X ko", "to X", "at X", "from X", "X se"; else whatever words are left.
  let payee: string | null = null;
  const free = (i: number) => {
    const token = tokens[i];
    return (
      token !== undefined && !token.used && !STOP.has(token.text) && !MONEY_WORDS.has(token.text)
    );
  };
  const isTypeWord = (word: string) =>
    Object.values(TYPE_WORDS).some((list) => list.includes(word));
  const nameAt = (i: number): string | null => {
    const token = tokens[i];
    if (!token || STOP.has(token.text) || MONEY_WORDS.has(token.text) || isTypeWord(token.text))
      return null;
    // A category keyword such as "mummy" may still be the payee.
    if (token.used && i !== categoryIndex) return null;
    return token.raw;
  };
  for (let i = 0; i < tokens.length && payee === null; i += 1) {
    const word = tokens[i]?.text ?? '';
    if (['ko', 'को', 'se', 'से'].includes(word)) payee = nameAt(i - 1);
    else if (['to', 'at', 'from'].includes(word)) {
      const first = nameAt(i + 1);
      if (first) {
        const second =
          free(i + 2) && !isTypeWord(tokens[i + 2]?.text ?? '') ? tokens[i + 2]?.raw : null;
        payee = second ? `${first} ${second}` : first;
      }
    }
  }
  if (payee === null) {
    const leftovers = tokens
      .filter((t, i) => free(i) && !isTypeWord(t.text) && !/^\d/.test(t.text))
      .map((t) => t.raw);
    if (leftovers.length > 0 && leftovers.length <= 3) payee = leftovers.join(' ');
  }
  if (payee !== null) payee = isDevanagari(payee) ? payee : titleCase(payee.toLowerCase());

  return {
    type,
    amount,
    day: date?.day ?? ctx.today,
    categoryId,
    accountId,
    toAccountId,
    method: type === 'transfer' || type === 'card_payment' ? null : paidBy,
    payee,
    uncertain: [...uncertain],
    categoryKeyword,
  };
}

/** The day "kal" would mean if read the other way; used for a one-tap fix in the UI. */
export function flipKal(day: Day, today: Day): Day {
  return day < today ? addDays(today, 1) : addDays(today, -1);
}

/**
 * What to remember when the user saves an entry: the payee (and the phrase
 * that was typed, if the parser found no category) mapped to the category
 * they chose.
 */
export function keywordsToLearn(input: {
  payee: string | null;
  parsedKeyword: string | null;
  parsedCategoryId: string | null;
  chosenCategoryId: string | null;
}): string[] {
  if (input.chosenCategoryId === null) return [];
  const out = new Set<string>();
  const payee = norm(input.payee ?? '').trim();
  if (payee.length >= 3 && !/^\d+$/.test(payee)) out.add(payee);
  // The user corrected the parser's guess: remember that this word means the new category.
  if (input.parsedKeyword && input.parsedCategoryId !== input.chosenCategoryId) {
    out.add(input.parsedKeyword);
  }
  return [...out];
}
