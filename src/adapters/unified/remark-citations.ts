/**
 * STUB — remark stage "citations" (see pipeline.ts for its contract).
 * Identity transform until the owning workstream implements it.
 */
import type { Root } from 'mdast';
import type { VFile } from 'vfile';
import type { PipelineContext } from './context.ts';

export interface RemarkCitationsOptions {
  readonly context: PipelineContext;
}

export function remarkCitations(_options: RemarkCitationsOptions) {
  return (_tree: Root, _file: VFile): void => {};
}
