import { requireOptionalNativeModule, type EventSubscription } from 'expo';

/** A message exactly as the phone holds it. Kept in memory only. */
export interface NativeSms {
  address: string;
  body: string;
  /** Epoch milliseconds. */
  date: number;
}

interface LedgerSmsNative {
  /** True when this build declares READ_SMS in its manifest (the `full` flavour). */
  isSupported(): boolean;
  /** True when this build declares RECEIVE_SMS in its manifest. */
  canListen(): boolean;
  /** Reads inbox messages newer than `sinceMs`, newest first, at most `limit`. */
  readInbox(sinceMs: number, limit: number): Promise<NativeSms[]>;
  /** Starts delivering `onSmsReceived` while the app is running. */
  startListening(): void;
  stopListening(): void;
  addListener(event: 'onSmsReceived', listener: (sms: NativeSms) => void): EventSubscription;
}

/** Null on builds or platforms without the native module. */
export const LedgerSms = requireOptionalNativeModule<LedgerSmsNative>('LedgerSms');
