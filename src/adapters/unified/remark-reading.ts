/**
 * STUB — remark stage "reading" (see pipeline.ts for its contract).
 * Identity transform until the owning workstream implements it.
 */
import type { Root } from 'mdast';
import type { VFile } from 'vfile';
import type { PipelineContext } from './context.ts';

export interface RemarkReadingOptions {
  readonly context: PipelineContext;
}

export function remarkReading(_options: RemarkReadingOptions) {
  return (_tree: Root, _file: VFile): void => {};
}
