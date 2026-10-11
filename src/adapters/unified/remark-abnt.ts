/**
 * STUB — remark stage "abnt" (see pipeline.ts for its contract).
 * Identity transform until the owning workstream implements it.
 */
import type { Root } from 'mdast';
import type { VFile } from 'vfile';
import type { PipelineContext } from './context.ts';

export interface RemarkAbntOptions {
  readonly context: PipelineContext;
}

export function remarkAbnt(_options: RemarkAbntOptions) {
  return (_tree: Root, _file: VFile): void => {};
}
