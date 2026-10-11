/**
 * STUB — remark stage "concepts" (see pipeline.ts for its contract).
 * Identity transform until the owning workstream implements it.
 */
import type { Root } from 'mdast';
import type { VFile } from 'vfile';
import type { PipelineContext } from './context.ts';

export interface RemarkConceptsOptions {
  readonly context: PipelineContext;
}

export function remarkConcepts(_options: RemarkConceptsOptions) {
  return (_tree: Root, _file: VFile): void => {};
}
