/**
 * Browser entry for `dynamics.wasm`. The `?url` import makes Vite emit the module as a hashed asset;
 * it is fetched only when {@link loadDynamicsKernel} is first called.
 */
import url from '../../wasm/dynamics.wasm?url';
import { createDynamicsKernel, type DynamicsExports, type DynamicsKernel } from './dynamics.ts';
import { instantiateFromUrl } from './runtime.ts';

let kernel: Promise<DynamicsKernel> | undefined;

/** Fetches, instantiates (cached per URL) and wraps `dynamics.wasm`. */
export function loadDynamicsKernel(): Promise<DynamicsKernel> {
  kernel ??= instantiateFromUrl<DynamicsExports>(url).then(createDynamicsKernel);
  return kernel;
}
