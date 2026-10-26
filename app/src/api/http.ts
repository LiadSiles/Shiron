import { AiError, ProviderId } from '../core/ai';

/**
 * fetch with a deadline: a request that hangs (bad mobile network) must not stall the processing
 * queue forever. A timeout or a failed connection becomes a retryable `network` error; the
 * caller's own abort (the teacher typed on) is passed through untouched.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  provider: ProviderId | null,
  signal?: AbortSignal,
): Promise<Response> {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort);
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new AiError('network', ctrl.signal.aborted ? `timeout after ${timeoutMs / 1000} s` : String(e), null, provider);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * Tries each model in order. A used-up quota or a retired model moves on to the next one (each
 * model has its own free quota); anything else is thrown as is.
 */
export async function eachModel<T>(models: readonly string[], call: (model: string) => Promise<T>): Promise<T> {
  let last: unknown = null;
  for (const model of models) {
    try {
      return await call(model);
    } catch (e) {
      if (!(e instanceof AiError) || (e.kind !== 'rate-limited' && e.kind !== 'unavailable')) throw e;
      last = e;
    }
  }
  throw last;
}
