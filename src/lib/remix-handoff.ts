/**
 * One-shot transient remix handoff (v0.4.16, ADR 0006): an anonymous
 * community remix carries the frozen publication envelope into Explore
 * without creating any persistent entry. sessionStorage is tab-scoped and
 * the value is deleted on first read — this is a transient handoff, not
 * business persistence (the localStorage ban targets durable state).
 */

const HANDOFF_KEY = 'fractalpark.remix-handoff.v1';

export interface RemixHandoff {
  envelope: unknown;
  publicationId: string;
  title: string;
}

export function stashRemixHandoff(handoff: RemixHandoff): void {
  try {
    sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(handoff));
  } catch {
    // Storage unavailable (private mode quota): the remix degrades to a
    // plain Explore visit rather than failing the navigation.
  }
}

export function consumeRemixHandoff(): RemixHandoff | null {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(HANDOFF_KEY);
    if (raw) sessionStorage.removeItem(HANDOFF_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as RemixHandoff;
    if (!parsed || typeof parsed !== 'object' || !('envelope' in parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}
