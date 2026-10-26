import { toast } from "sonner";

// A write GitHub refuses rolls itself back in the UI; without this, the row would
// just snap back with no reason given.

export function showWriteError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  // Keyed by the message, so a bulk action that fails the same way for ten repos
  // shows one toast, not ten.
  toast.error(message, { id: message });
}

/** Runs one write, showing why if it fails, and still fails so the change rolls back. */
export async function reportingFailure<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    showWriteError(error);
    throw error;
  }
}
