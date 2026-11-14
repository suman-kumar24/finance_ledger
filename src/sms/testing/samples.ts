/**
 * Realistic alert formats with made-up numbers, names and references.
 * No real account, card or phone number appears here.
 */
import type { RawSms, SmsDirection } from '../types';

/** 12 November 2025, 14:22 local time. */
export const RECEIVED = new Date(2025, 10, 12, 14, 22, 10).getTime();

export interface Sample {
  name: string;
  sms: RawSms;
  expect: {
    direction: SmsDirection;
    amount: number;
    last4?: string | null;
    merchant?: string | null;
    day?: string;
    balance?: number | null;
    instrument?: string;
    method?: string | null;
    billPayment?: boolean;
  };
}

const at = (address: string, body: string): RawSms => ({ address, body, date: RECEIVED });

export const TRANSACTIONS: Sample[] = [
  {
    name: 'HDFC UPI sent',
    sms: at(
      'VM-HDFCBK',
      'Sent Rs.250.00 From HDFC Bank A/C *1234 To CORNER STORE On 12/11/25 Ref 531200000001 Not You? Call 18000000000/SMS BLOCK UPI to 7300000000',
    ),
    expect: {
      direction: 'debit',
      amount: 250_00,
      last4: '1234',
      merchant: 'CORNER STORE',
      day: '2025-11-12',
      instrument: 'account',
      method: 'upi',
    },
  },
  {
    name: 'HDFC card spent (old)',
    sms: at(
      'AD-HDFCBK',
      'Rs 1499.00 spent on HDFC Bank Card x4321 at AMAZON PAY on 2025-11-12:14:22:10. Avl Lmt: Rs 85000.00. Not you? Call 18000000000',
    ),
    expect: {
      direction: 'debit',
      amount: 1_499_00,
      last4: '4321',
      merchant: 'AMAZON PAY',
      day: '2025-11-12',
      balance: 85_000_00,
      instrument: 'card',
      method: 'card',
    },
  },
  {
    name: 'HDFC card spent (new)',
    sms: at(
      'VM-HDFCBK-S',
      'Spent Rs.1,499 On HDFC Bank Card 4321 At BLUE CAFE On 2025-11-12:14:22:10.Not You? To Block+Reissue Call 18000000000',
    ),
    expect: {
      direction: 'debit',
      amount: 1_499_00,
      last4: '4321',
      merchant: 'BLUE CAFE',
      instrument: 'card',
    },
  },
  {
    name: 'HDFC salary deposit',
    sms: at(
      'VM-HDFCBK',
      'Update! INR 85,000.00 deposited in HDFC Bank A/c XX1234 on 12-NOV-25 for Salary NOV. Avl bal INR 1,23,456.78. Cheque deposits in A/C are subject to clearing',
    ),
    expect: {
      direction: 'credit',
      amount: 85_000_00,
      last4: '1234',
      merchant: 'Salary NOV',
      balance: 1_23_456_78,
      day: '2025-11-12',
    },
  },
  {
    name: 'HDFC money transfer',
    sms: at(
      'VM-HDFCBK',
      'Money Transfer:Rs 5000.00 from HDFC Bank A/c **1234 on 12-11-25 to ASHA VERMA UPI: 531200000002 Not you? Call 18000000000',
    ),
    expect: {
      direction: 'debit',
      amount: 5_000_00,
      last4: '1234',
      merchant: 'ASHA VERMA',
      method: 'upi',
    },
  },
  {
    name: 'SBI UPI debit',
    sms: at(
      'AD-SBIUPI',
      'Dear UPI user A/C X1234 debited by 250.0 on date 12Nov25 trf to CORNER STORE Refno 531200000003. If not u? call 1800000000. -SBI',
    ),
    expect: {
      direction: 'debit',
      amount: 250_00,
      last4: '1234',
      merchant: 'CORNER STORE',
      day: '2025-11-12',
      method: 'upi',
    },
  },
  {
    name: 'SBI credit',
    sms: at(
      'AD-SBIINB',
      'Dear SBI User, your A/c X1234-credited by Rs.5000 on 12Nov25 transfer from ASHA VERMA Ref No 531200000004 -SBI',
    ),
    expect: {
      direction: 'credit',
      amount: 5_000_00,
      last4: '1234',
      merchant: 'ASHA VERMA',
      day: '2025-11-12',
    },
  },
  {
    name: 'SBI Card spent',
    sms: at(
      'JD-SBICRD',
      'Rs.1,499.00 spent on your SBI Credit Card ending 4321 at BOOK HOUSE on 12/11/25. Trxn. not done by you? Report at https://example.invalid/Dispute',
    ),
    expect: {
      direction: 'debit',
      amount: 1_499_00,
      last4: '4321',
      merchant: 'BOOK HOUSE',
      day: '2025-11-12',
      instrument: 'card',
      method: 'card',
    },
  },
  {
    name: 'ICICI UPI debit',
    sms: at(
      'VK-ICICIB',
      'ICICI Bank Acct XX234 debited for Rs 250.00 on 12-Nov-25; CORNER STORE credited. UPI:531200000005. Call 18000000 for dispute. SMS BLOCK 234 to 9200000000.',
    ),
    expect: {
      direction: 'debit',
      amount: 250_00,
      last4: '234',
      merchant: 'CORNER STORE',
      day: '2025-11-12',
      method: 'upi',
    },
  },
  {
    name: 'ICICI credit',
    sms: at(
      'VK-ICICIB',
      'Dear Customer, Acct XX234 is credited with Rs 5000.00 on 12-Nov-25 from ASHA VERMA. UPI:531200000006-ICICI Bank.',
    ),
    expect: { direction: 'credit', amount: 5_000_00, last4: '234', merchant: 'ASHA VERMA' },
  },
  {
    name: 'ICICI card spent',
    sms: at(
      'VK-ICICIB',
      'INR 1,499.00 spent using ICICI Bank Card XX4321 on 12-Nov-25 on AMAZON. Avl Limit: INR 85,000.00. If not you, call 1800 0000/SMS BLOCK 4321 to 9200000000.',
    ),
    expect: {
      direction: 'debit',
      amount: 1_499_00,
      last4: '4321',
      merchant: 'AMAZON',
      balance: 85_000_00,
      instrument: 'card',
    },
  },
  {
    name: 'Axis account debit',
    sms: at(
      'AX-AXISBK',
      'INR 250.00 debited from A/c no. XX1234 on 12-11-25 14:22:10 IST at UPI/P2M/531200000007/CORNER STORE. Avl Bal- INR 12345.67 - Axis Bank',
    ),
    expect: {
      direction: 'debit',
      amount: 250_00,
      last4: '1234',
      merchant: 'CORNER STORE',
      balance: 12_345_67,
      day: '2025-11-12',
      method: 'upi',
    },
  },
  {
    name: 'Axis card spent',
    sms: at(
      'AX-AXISBK',
      'Spent INR 1499 Axis Bank Card no. XX4321 12-11-25 14:22:10 IST BOOK HOUSE Avl Limit: INR 85000.00 Not you? SMS BLOCK 4321 to 9190000000',
    ),
    expect: {
      direction: 'debit',
      amount: 1_499_00,
      last4: '4321',
      merchant: 'BOOK HOUSE',
      balance: 85_000_00,
      instrument: 'card',
    },
  },
  {
    name: 'Kotak UPI sent',
    sms: at(
      'BP-KOTAKB',
      'Sent Rs.250.00 from Kotak Bank AC X1234 to cornerstore@okaxis on 12-11-25.UPI Ref 531200000008. Not you, https://example.invalid/fraud',
    ),
    expect: {
      direction: 'debit',
      amount: 250_00,
      last4: '1234',
      merchant: 'cornerstore@okaxis',
      day: '2025-11-12',
      method: 'upi',
    },
  },
  {
    name: 'Kotak UPI received',
    sms: at(
      'BP-KOTAKB',
      'Received Rs.5000.00 in your Kotak Bank AC X1234 from asha@oksbi on 12-11-25.UPI Ref:531200000009.',
    ),
    expect: { direction: 'credit', amount: 5_000_00, last4: '1234', merchant: 'asha@oksbi' },
  },
  {
    name: 'Amex spent',
    sms: at(
      'AX-AMEXIN',
      "Alert: You've spent INR 1,499.00 on your AMEX card ** 41001 at BOOK HOUSE on 12 November 2025 at 02:22 PM IST. Call 18000000000 if this was not made by you.",
    ),
    expect: {
      direction: 'debit',
      amount: 1_499_00,
      last4: '1001',
      merchant: 'BOOK HOUSE',
      day: '2025-11-12',
      instrument: 'card',
    },
  },
  {
    name: 'Wallet payment',
    sms: at(
      'VM-PAYTMB',
      'Paid Rs.250 to CORNER STORE from Paytm Wallet. Updated Balance: Paytm Wallet- Rs 750.00. More Details: https://example.invalid/p',
    ),
    expect: {
      direction: 'debit',
      amount: 250_00,
      last4: null,
      merchant: 'CORNER STORE',
      instrument: 'wallet',
      method: 'wallet',
    },
  },
  {
    name: 'ATM withdrawal',
    sms: at(
      'VM-PNBSMS',
      'Rs.2000.00 withdrawn at ATM from A/c XX1234 on 12-11-25. Avl Bal Rs.10,345.67. Not you? Call 18000000000',
    ),
    expect: {
      direction: 'debit',
      amount: 2_000_00,
      last4: '1234',
      method: 'cash',
      balance: 10_345_67,
    },
  },
  // Formats that only the generic rules catch.
  {
    name: 'generic: PSU bank debit',
    sms: at(
      'VD-CANBNK',
      'An amount of INR 250.00 has been DEBITED to your account XXXX1234 on 12/11/2025. Total Avail.bal INR 12,345.67.',
    ),
    expect: {
      direction: 'debit',
      amount: 250_00,
      last4: '1234',
      day: '2025-11-12',
      balance: 12_345_67,
      instrument: 'account',
    },
  },
  {
    name: 'generic: PSU bank credit',
    sms: at(
      'VD-UNIONB',
      'Your a/c no. XXXXXXXX1234 is credited by Rs.5000.00 on 12-11-25 by a/c linked to mobile 9XXXXXX000 (IMPS Ref no 531200000010).',
    ),
    expect: { direction: 'credit', amount: 5_000_00, last4: '1234', day: '2025-11-12' },
  },
  {
    name: 'generic: IDFC debit',
    sms: at(
      'VM-IDFCFB',
      'Your A/C XXXXXXX1234 is debited by INR 250.00 on 12/11/25 14:22. New Bal :INR 12,345.67. Call 18000000000 if not done by you.',
    ),
    expect: { direction: 'debit', amount: 250_00, last4: '1234', balance: 12_345_67 },
  },
  {
    name: 'Debit card purchase',
    sms: at(
      'VM-BOBSMS',
      'Rs.899.00 spent on Debit Card XX4321 at MEDICAL STORE on 12-11-2025. Avl Bal: Rs.11,446.67',
    ),
    expect: {
      direction: 'debit',
      amount: 899_00,
      last4: '4321',
      merchant: 'MEDICAL STORE',
      instrument: 'card',
    },
  },
  {
    name: 'generic: debited and credited to payee is one debit',
    sms: at(
      'VM-YESBNK',
      'INR 300.00 debited from A/c XX1234 and credited to GREEN GROCER on 12-11-25. Ref 531200000011',
    ),
    expect: { direction: 'debit', amount: 300_00, last4: '1234' },
  },
  {
    name: 'generic: refund to card',
    sms: at(
      'VM-RBLBNK',
      'Refund of Rs 499.00 from BOOK HOUSE has been credited to your Credit Card ending 4321 on 12-11-25.',
    ),
    expect: { direction: 'credit', amount: 499_00, last4: '4321', instrument: 'card' },
  },
  {
    name: 'generic: card bill payment received',
    sms: at(
      'VM-HDFCBK',
      'Payment of Rs 12,000.00 received on your Credit Card ending 4321 on 12-11-25. Thank you.',
    ),
    expect: {
      direction: 'credit',
      amount: 12_000_00,
      last4: '4321',
      billPayment: true,
      instrument: 'card',
    },
  },
  {
    name: 'generic: rupee symbol and NEFT',
    sms: at(
      'VM-INDUSB',
      '₹45,000 credited to A/c XX1234 via NEFT from ACME PRIVATE LTD on 12-Nov-25. Bal: ₹1,68,456.78',
    ),
    expect: {
      direction: 'credit',
      amount: 45_000_00,
      last4: '1234',
      merchant: 'ACME PRIVATE LTD',
      balance: 1_68_456_78,
    },
  },
  {
    name: 'generic: card bill paid from bank',
    sms: at(
      'VM-HDFCBK',
      'Rs 12000.00 debited from A/c XX1234 towards Credit Card bill payment on 12-11-25. Ref 531200000012',
    ),
    expect: { direction: 'debit', amount: 12_000_00, last4: '1234', billPayment: true },
  },
];

export const IGNORED: { name: string; sms: RawSms; reason: string }[] = [
  {
    name: 'OTP for a payment',
    sms: at(
      'VM-HDFCBK',
      '482913 is your OTP for txn of INR 1,499.00 at AMAZON on HDFC Bank card ending 4321. Valid for 5 mins. Do not share OTP.',
    ),
    reason: 'otp',
  },
  {
    name: 'login OTP',
    sms: at('AD-SBIINB', 'OTP for login is 123456. Do not share it with anyone. -SBI'),
    reason: 'otp',
  },
  {
    name: 'verification code',
    sms: at('VM-PAYTMB', 'Your verification code is 4821. It is valid for 10 minutes.'),
    reason: 'otp',
  },
  {
    name: 'loan promotion',
    sms: at(
      'VM-HDFCBK',
      'Dear Customer, you are eligible for a pre-approved personal loan of Rs 5,00,000. Apply now: https://example.invalid/loan T&C',
    ),
    reason: 'promo',
  },
  {
    name: 'cashback offer',
    sms: at(
      'AD-ICICIB',
      'Get 10% cashback up to Rs 500 on your ICICI Bank Credit Card this weekend. Offer valid till Sunday. Shop now!',
    ),
    reason: 'promo',
  },
  {
    name: 'personal message',
    sms: at('+91 90000 00000', 'Hey, I sent Rs 500 to your account, did you get it?'),
    reason: 'personal',
  },
  {
    name: 'personal message, bank-like words',
    sms: at('9000000000', 'Your a/c XX1234 debited by Rs 250 lol jk'),
    reason: 'personal',
  },
  {
    name: 'payment request',
    sms: at(
      'VM-KOTAKB',
      'ASHA VERMA has requested money of Rs 750.00 on your UPI app. Approve the request before it expires.',
    ),
    reason: 'request',
  },
  {
    name: 'declined transaction',
    sms: at(
      'VM-HDFCBK',
      'Txn of Rs 1,499.00 on HDFC Bank Card 4321 at AMAZON was declined due to incorrect PIN.',
    ),
    reason: 'failed',
  },
  {
    name: 'failed UPI',
    sms: at(
      'VM-AXISBK',
      'Your UPI transaction of INR 250.00 to CORNER STORE failed. Any amount debited will be refunded.',
    ),
    reason: 'failed',
  },
  {
    name: 'upcoming autopay',
    sms: at(
      'VM-ICICIB',
      'Rs 499.00 will be debited from your Acct XX234 on 15-Nov-25 for MUSIC APP AutoPay.',
    ),
    reason: 'future',
  },
  {
    name: 'statement due reminder',
    sms: at(
      'VM-SBICRD',
      'Your SBI Card statement is ready. Total Amt Due Rs 12,000.00, Min Amt Due Rs 600.00, payable by 25-11-25.',
    ),
    reason: 'due',
  },
  {
    name: 'balance information',
    sms: at(
      'VM-PNBSMS',
      'Your A/c balance enquiry: Available balance in A/c XX1234 is Rs 12,345.67 as on 12-11-25.',
    ),
    reason: 'info',
  },
  {
    name: 'delivery update',
    sms: at('VM-SHOPKT', 'Your order has been shipped and will arrive by Friday.'),
    reason: 'no-transaction-word',
  },
  {
    name: 'transaction word but no amount',
    sms: at('VM-HDFCBK', 'Your account has been credited. Thank you for banking with us.'),
    reason: 'no-amount',
  },
];
