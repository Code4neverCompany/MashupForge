/**
 * Error-handling helpers. Use these to narrow `catch (e: unknown)` blocks
 * instead of typing the parameter as `any` — `unknown` forces the caller
 * to type-guard, which is the whole point of TypeScript in error paths.
 */

/** Extract a human-readable message from an unknown thrown value. */
export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = (err as { message: unknown }).message;
    if (typeof msg === 'string') return msg;
  }
  try {
    return JSON.stringify(err);
  } catch {
    return 'Unknown error';
  }
}

/** Type guard for Error instances — narrows unknown to Error. */
export function isError(err: unknown): err is Error {
  return err instanceof Error;
}
