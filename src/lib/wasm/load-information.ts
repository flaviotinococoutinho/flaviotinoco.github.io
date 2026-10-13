/**
 * Browser entry for `information.wasm`. The `?url` import makes Vite emit the module as a hashed
 * asset; it is fetched only when {@link loadInformationKernel} is first called.
 */
import url from '../../wasm/information.wasm?url';
import { createInformationKernel, type InformationExports, type InformationKernel } from './information.ts';
import { instantiateFromUrl } from './runtime.ts';

let kernel: Promise<InformationKernel> | undefined;

/** Fetches, instantiates (cached per URL) and wraps `information.wasm`. */
export function loadInformationKernel(): Promise<InformationKernel> {
  kernel ??= instantiateFromUrl<InformationExports>(url).then(createInformationKernel);
  return kernel;
}
