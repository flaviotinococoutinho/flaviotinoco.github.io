/**
 * Browser entry for `signal.wasm`. The `?url` import makes Vite emit the module as a hashed asset;
 * it is fetched only when {@link loadSignalKernel} is first called (no cost on pages that never call it).
 */
import url from '../../wasm/signal.wasm?url';
import { instantiateFromUrl } from './runtime.ts';
import { createSignalKernel, type SignalExports, type SignalKernel } from './signal.ts';

let kernel: Promise<SignalKernel> | undefined;

/** Fetches, instantiates (cached per URL) and wraps `signal.wasm`. */
export function loadSignalKernel(): Promise<SignalKernel> {
  kernel ??= instantiateFromUrl<SignalExports>(url).then(createSignalKernel);
  return kernel;
}
