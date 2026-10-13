/**
 * Browser entry for `information.wasm`. The `?url` import makes Vite emit the module as a hashed asset;
 * it is fetched only when {@link loadInformationKernel} is first called, so pages that never call it pay
 * nothing. Only this file names the asset: Node tests import `information.ts` and instantiate the built
 * bytes directly.
 */
import url from '../../wasm/information.wasm?url';
import { createInformationKernel, type InformationExports, type InformationKernel } from './information.ts';
import { instantiateFromUrl } from './runtime.ts';

let kernel: Promise<InformationKernel> | undefined;

/** Fetches, instantiates and wraps `information.wasm` once per page; a failed load is retried on the next call. */
export function loadInformationKernel(): Promise<InformationKernel> {
  kernel ??= instantiateFromUrl<InformationExports>(url).then(createInformationKernel, (error: unknown) => {
    kernel = undefined;
    throw error;
  });
  return kernel;
}
