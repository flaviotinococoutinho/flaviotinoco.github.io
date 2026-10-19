/**
 * Browser entry for `signal.wasm`. The `?url` import makes Vite emit the module as a hashed asset; it is
 * fetched only when {@link loadSignalKernel} is first called, so pages that never call it pay nothing.
 * Only this file names the asset: Node tests import `signal.ts` and instantiate the built bytes directly.
 */
import url from '../../wasm/signal.wasm?url';
import { instantiateFromUrl } from './runtime.ts';
import { createSignalKernel, type SignalExports, type SignalKernel } from './signal.ts';

let kernel: Promise<SignalKernel> | undefined;

/** Fetches, instantiates and wraps `signal.wasm` once per page; a failed load is retried on the next call. */
export function loadSignalKernel(): Promise<SignalKernel> {
  kernel ??= instantiateFromUrl<SignalExports>(url).then(createSignalKernel, (error: unknown) => {
    kernel = undefined;
    throw error;
  });
  return kernel;
}
