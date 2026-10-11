/**
 * STUB — remark stage "embeds" (see pipeline.ts for its contract).
 * Identity transform until the owning workstream implements it.
 */
import type { Root } from 'mdast';
import type { VFile } from 'vfile';
import type { PipelineContext } from './context.ts';

export interface RemarkEmbedsOptions {
  readonly context: PipelineContext;
}

export function remarkEmbeds(_options: RemarkEmbedsOptions) {
  return (_tree: Root, _file: VFile): void => {};
}
