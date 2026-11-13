/**
 * Finds a date in tokenised text: today, yesterday, last night, kal,
 * parso, weekday names, "3 days ago", and explicit dates.
 */
import { addDays, clampedDay, daysInMonth, parseDay, weekday, type Day } from '../domain/dates';
import type { Token } from './tokens';

export interface DateMatch {
  day: Day;
  /** False when the phrase could mean past or future ("kal") and was guessed. */
  certain: boolean;
}

const TODAY = ['today', 'aaj', 'aj', 'आज', 'now', 'abhi', 'अभी'];
const YESTERDAY = ['yesterday', 'yday'];
const TOMORROW = ['tomorrow', 'tmrw', 'tmr'];
const KAL = ['kal', 'kl', 'कल'];
const PARSO = ['parso', 'parson', 'परसों', 'परसो'];
const NIGHT = ['night', 'raat', 'rat', 'रात'];
const MORNING = [
  'morning',
  'subah',
  'सुबह',
  'evening',
  'shaam',
  'sham',
  'शाम',
  'afternoon',
  'dopahar',
  'दोपहर',
];
const LAST = ['last', 'pichle', 'pichhle', 'pichla', 'पिछले', 'पिछला', 'previous', 'past'];
const NEXT = ['next', 'agle', 'agla', 'अगले', 'अगला', 'coming'];
const AGO = ['ago', 'pehle', 'pahle', 'पहले', 'back', 'before'];
const DAYS = ['day', 'days', 'din', 'दिन'];
const TARIKH = ['tarikh', 'tareekh', 'taarikh', 'तारीख'];

/** Words that show the sentence is about the past, or about a plan. */
const PAST_HINTS = [
  'diye',
  'diya',
  'kiya',
  'kiye',
  'tha',
  'the',
  'thi',
  'hua',
  'hue',
  'gaya',
  'gaye',
  'liya',
  'khaya',
  'kharida',
  'spent',
  'paid',
  'bought',
  'was',
  'had',
  'ate',
  'got',
  'received',
  'mila',
  'mili',
  'aaya',
  'aayi',
  'दिए',
  'दिया',
  'किया',
  'था',
  'थे',
  'थी',
  'हुआ',
  'हुए',
  'गया',
  'खाया',
  'खरीदा',
  'लिया',
  'मिला',
  'आया',
];
const FUTURE_HINTS = [
  'dena',
  'dene',
  'denge',
  'dunga',
  'dungi',
  'karna',
  'karunga',
  'karenge',
  'hoga',
  'hogi',
  'will',
  'due',
  'hai dena',
  'bharna',
  'देना',
  'दूंगा',
  'दूंगी',
  'करना',
  'करेंगे',
  'होगा',
  'भरना',
  'देंगे',
];

const WEEKDAYS: string[][] = [
  ['sunday', 'sun', 'ravivar', 'raviwar', 'itvaar', 'itwar', 'रविवार', 'इतवार'],
  ['monday', 'mon', 'somvar', 'somwar', 'सोमवार'],
  ['tuesday', 'tue', 'tues', 'mangalvar', 'mangalwar', 'मंगलवार'],
  ['wednesday', 'wed', 'budhvar', 'budhwar', 'बुधवार'],
  ['thursday', 'thu', 'thur', 'thurs', 'guruvar', 'guruwar', 'veervar', 'गुरुवार', 'वीरवार'],
  ['friday', 'fri', 'shukravar', 'shukrawar', 'शुक्रवार'],
  ['saturday', 'sat', 'shanivar', 'shaniwar', 'शनिवार'],
];

const MONTHS: string[][] = [
  ['january', 'jan', 'जनवरी'],
  ['february', 'feb', 'फरवरी'],
  ['march', 'mar', 'मार्च'],
  ['april', 'apr', 'अप्रैल'],
  ['may', 'मई'],
  ['june', 'jun', 'जून'],
  ['july', 'jul', 'जुलाई'],
  ['august', 'aug', 'अगस्त'],
  ['september', 'sep', 'sept', 'सितंबर', 'सितम्बर'],
  ['october', 'oct', 'अक्टूबर'],
  ['november', 'nov', 'नवंबर', 'नवम्बर'],
  ['december', 'dec', 'दिसंबर', 'दिसम्बर'],
];

function indexIn(table: string[][], word: string): number {
  return table.findIndex((names) => names.includes(word));
}

function has(tokens: Token[], words: string[]): boolean {
  return tokens.some((t) => words.includes(t.text));
}

function claim(tokens: Token[], ...indexes: number[]): void {
  for (const i of indexes) {
    const token = tokens[i];
    if (token) token.used = true;
  }
}

const ORDINAL_RE = /^(\d{1,2})(st|nd|rd|th)?$/;
const NUMERIC_DATE_RE = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/;
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * A day and month without a year is taken as the most recent one, unless
 * that would be more than a month in the future, when last year is meant.
 */
function resolveYear(today: Day, month: number, day: number, year?: number): Day | null {
  if (month < 1 || month > 12 || day < 1) return null;
  const t = parseDay(today);
  const y = year ?? t.year;
  if (day > daysInMonth(y, month)) return null;
  let candidate = clampedDay(y, month, day);
  if (year === undefined && candidate > addDays(today, 31)) {
    candidate = clampedDay(t.year - 1, month, Math.min(day, daysInMonth(t.year - 1, month)));
  }
  return candidate;
}

export function findDate(tokens: Token[], today: Day): DateMatch | null {
  const text = (i: number) => {
    const token = tokens[i];
    return token && !token.used ? token.text : '';
  };

  for (let i = 0; i < tokens.length; i += 1) {
    const word = text(i);
    if (word === '') continue;

    // 2025-03-12, 12/3, 12-03-2025
    const iso = ISO_DATE_RE.exec(word);
    if (iso) {
      const day = resolveYear(today, Number(iso[2]), Number(iso[3]), Number(iso[1]));
      if (day) {
        claim(tokens, i);
        return { day, certain: true };
      }
    }
    const numeric = NUMERIC_DATE_RE.exec(word);
    if (numeric && (word.includes('/') || word.includes('-') || numeric[3])) {
      const yearText = numeric[3];
      const year = yearText
        ? yearText.length === 2
          ? 2000 + Number(yearText)
          : Number(yearText)
        : undefined;
      const day = resolveYear(today, Number(numeric[2]), Number(numeric[1]), year);
      if (day) {
        claim(tokens, i);
        return { day, certain: true };
      }
    }

    // "12 march [2025]", "march 12", "12th march"
    const month = indexIn(MONTHS, word);
    if (month >= 0) {
      const before = ORDINAL_RE.exec(text(i - 1));
      const after = ORDINAL_RE.exec(text(i + 1));
      const dayNumber = before ? Number(before[1]) : after ? Number(after[1]) : null;
      // "may" is also an ordinary word; only accept it with a day number.
      if (dayNumber !== null) {
        const dayIndex = before ? i - 1 : i + 1;
        const yearIndex = before ? i + 1 : i + 2;
        const yearText = /^(19|20)\d{2}$/.test(text(yearIndex)) ? text(yearIndex) : null;
        const day = resolveYear(
          today,
          month + 1,
          dayNumber,
          yearText ? Number(yearText) : undefined,
        );
        if (day) {
          claim(tokens, i, dayIndex, ...(yearText ? [yearIndex] : []));
          return { day, certain: true };
        }
      }
    }

    // "5 tarikh", "5th ko": that day of this month, or last month if it has not come yet
    const ordinal = ORDINAL_RE.exec(word);
    if (
      ordinal &&
      (TARIKH.includes(text(i + 1)) || (ordinal[2] && !MONTHS.flat().includes(text(i + 1))))
    ) {
      const t = parseDay(today);
      const n = Number(ordinal[1]);
      if (n >= 1 && n <= 31) {
        let day = clampedDay(t.year, t.month, n);
        if (day > today) {
          const prev =
            t.month === 1 ? { year: t.year - 1, month: 12 } : { year: t.year, month: t.month - 1 };
          day = clampedDay(prev.year, prev.month, n);
        }
        claim(tokens, i, ...(TARIKH.includes(text(i + 1)) ? [i + 1] : []));
        return { day, certain: true };
      }
    }

    // "3 days ago", "3 din pehle"
    if (/^\d{1,3}$/.test(word) && DAYS.includes(text(i + 1)) && AGO.includes(text(i + 2))) {
      claim(tokens, i, i + 1, i + 2);
      return { day: addDays(today, -Number(word)), certain: true };
    }

    if (word === 'day' && text(i + 1) === 'before' && YESTERDAY.includes(text(i + 2))) {
      claim(tokens, i, i + 1, i + 2);
      return { day: addDays(today, -2), certain: true };
    }

    if (TODAY.includes(word)) {
      claim(tokens, i);
      if (MORNING.includes(text(i + 1)) || NIGHT.includes(text(i + 1))) claim(tokens, i + 1);
      return { day: today, certain: true };
    }
    if (word === 'this' && (MORNING.includes(text(i + 1)) || NIGHT.includes(text(i + 1)))) {
      claim(tokens, i, i + 1);
      return { day: today, certain: true };
    }
    if (word === 'tonight') {
      claim(tokens, i);
      return { day: today, certain: true };
    }
    if (YESTERDAY.includes(word)) {
      claim(tokens, i);
      if (MORNING.includes(text(i + 1)) || NIGHT.includes(text(i + 1))) claim(tokens, i + 1);
      return { day: addDays(today, -1), certain: true };
    }
    if (TOMORROW.includes(word)) {
      claim(tokens, i);
      return { day: addDays(today, 1), certain: true };
    }
    if (LAST.includes(word) && NIGHT.includes(text(i + 1))) {
      claim(tokens, i, i + 1);
      return { day: addDays(today, -1), certain: true };
    }

    if (PARSO.includes(word)) {
      claim(tokens, i);
      const future = has(tokens, FUTURE_HINTS) && !has(tokens, PAST_HINTS);
      return { day: addDays(today, future ? 2 : -2), certain: future || has(tokens, PAST_HINTS) };
    }

    if (KAL.includes(word)) {
      claim(tokens, i);
      const night = NIGHT.includes(text(i + 1));
      if (night || MORNING.includes(text(i + 1))) claim(tokens, i + 1);
      const past = has(tokens, PAST_HINTS);
      const future = has(tokens, FUTURE_HINTS) && !past;
      if (future) return { day: addDays(today, 1), certain: true };
      // "kal raat" with nothing else is read as last night.
      return { day: addDays(today, -1), certain: past || night };
    }

    const wd = indexIn(WEEKDAYS, word);
    if (wd >= 0) {
      const previous = text(i - 1);
      const forward = NEXT.includes(previous);
      const explicitLast = LAST.includes(previous);
      // "sat"/"sun"/"mon" alone are too ambiguous; require "last"/"next"/"on" or a full name.
      if (word.length <= 3 && !forward && !explicitLast && previous !== 'on') continue;
      const todayIndex = weekday(today);
      let delta: number;
      if (forward) {
        delta = (wd - todayIndex + 7) % 7 || 7;
      } else {
        delta = -((todayIndex - wd + 7) % 7);
        if (delta === 0 && explicitLast) delta = -7;
      }
      claim(tokens, i, ...(forward || explicitLast ? [i - 1] : []));
      return { day: addDays(today, delta), certain: true };
    }
  }
  return null;
}
