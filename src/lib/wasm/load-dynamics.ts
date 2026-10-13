/**
 * Browser entry for `dynamics.wasm`. The `?url` import makes Vite emit the module as a hashed asset; it is
 * fetched only when {@link loadDynamicsKernel} is first called, so pages that never call it pay nothing.
 * Only this file names the asset: Node tests import `dynamics.ts` and instantiate the built bytes directly.
 */
import url from '../../wasm/dynamics.wasm?url';
import { createDynamicsKernel, type DynamicsExports, type DynamicsKernel } from './dynamics.ts';
import { instantiateFromUrl } from './runtime.ts';

let kernel: Promise<DynamicsKernel> | undefined;

/** Fetches, instantiates and wraps `dynamics.wasm` once per page; a failed load is retried on the next call. */
export function loadDynamicsKernel(): Promise<DynamicsKernel> {
  kernel ??= instantiateFromUrl<DynamicsExports>(url).then(createDynamicsKernel, (error: unknown) => {
    kernel = undefined;
    throw error;
  });
  return kernel;
}
