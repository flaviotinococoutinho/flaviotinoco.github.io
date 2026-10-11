/**
 * STUB — remark stage "meta" (see pipeline.ts for its contract).
 * Identity transform until the owning workstream implements it.
 */
import type { Root } from 'mdast';
import type { VFile } from 'vfile';
import type { PipelineContext } from './context.ts';

export interface RemarkMetaOptions {
  readonly context: PipelineContext;
}

export function remarkMeta(_options: RemarkMetaOptions) {
  return (_tree: Root, _file: VFile): void => {};
}
