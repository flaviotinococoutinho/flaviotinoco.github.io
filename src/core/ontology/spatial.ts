/**
 * Spatial navigation between map nodes with the arrow keys.
 *
 * Heuristic after the CSS Spatial Navigation draft (W3C, 2019, "find the best
 * candidate"): among nodes lying in the half-plane of the pressed direction
 * (within ±60° of it), choose the one minimising
 *
 *     distance along the direction + 2 × orthogonal deviation
 *
 * so a node straight ahead beats a closer one far off-axis. Ties break by id,
 * keeping the choice deterministic. Pure; the island only maps keys to calls.
 */
import type { Point } from './layout.ts';

export type Direction = 'up' | 'down' | 'left' | 'right';

const VECTORS: Readonly<Record<Direction, Point>> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/** cos(60°): candidates must lie within ±60° of the direction. */
const CONE = 0.5;

export const nearestInDirection = <Id extends string>(
  positions: ReadonlyMap<Id, Point>,
  from: Id,
  direction: Direction,
  eligible: (id: Id) => boolean = () => true,
): Id | null => {
  const origin = positions.get(from);
  if (origin === undefined) return null;
  const v = VECTORS[direction];
  let best: Id | null = null;
  let bestScore = Infinity;
  for (const [id, p] of positions) {
    if (id === from || !eligible(id)) continue;
    const dx = p.x - origin.x;
    const dy = p.y - origin.y;
    const distance = Math.hypot(dx, dy);
    if (distance === 0) continue;
    const along = dx * v.x + dy * v.y;
    if (along / distance < CONE) continue;
    const across = Math.abs(dx * v.y - dy * v.x);
    const score = along + 2 * across;
    if (score < bestScore || (score === bestScore && best !== null && id < best)) {
      best = id;
      bestScore = score;
    }
  }
  return best;
};
