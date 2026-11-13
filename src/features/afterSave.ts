import type { Transaction } from '@/domain/types';

/** Hook point after an entry is saved (budget alerts, parser learning). */
export function afterEntrySaved(_tx: Transaction, _typedPayee: string): void {
  // Filled in by later phases.
}
