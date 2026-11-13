/**
 * A tiny change bus. Every repository write bumps the version; screens that
 * read through `useLive` re-run their query, so the UI updates as soon as
 * data changes.
 */
type Listener = () => void;

let version = 0;
const listeners = new Set<Listener>();
let batchDepth = 0;
let pending = false;

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getVersion(): number {
  return version;
}

export function emitChange(): void {
  if (batchDepth > 0) {
    pending = true;
    return;
  }
  version += 1;
  for (const listener of [...listeners]) listener();
}

/** Runs several writes and notifies listeners once at the end. */
export function batch<T>(fn: () => T): T {
  batchDepth += 1;
  try {
    return fn();
  } finally {
    batchDepth -= 1;
    if (batchDepth === 0 && pending) {
      pending = false;
      emitChange();
    }
  }
}
