/**
 * STUB — remark stage "latex" (see pipeline.ts for its contract).
 * Identity transform until the owning workstream implements it.
 */
import type { Root } from 'mdast';
import type { VFile } from 'vfile';
import type { PipelineContext } from './context.ts';

export interface RemarkLatexOptions {
  readonly context: PipelineContext;
}

export function remarkLatex(_options: RemarkLatexOptions) {
  return (_tree: Root, _file: VFile): void => {};
}
