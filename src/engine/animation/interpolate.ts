/**
 * Keyframe animation interpolation engine
 * Pure functions, no UI dependencies, fully unit testable
 */

import type { ViewBounds, Keyframe } from '../types';

export interface TimelineSegment {
  from: ViewBounds;
  to: ViewBounds;
  duration: number;     // seconds
  startOffset: number;  // start offset in total timeline (seconds)
}

/**
 * Linear interpolation between two values
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Calculate segment duration based on zoom ratio
 * Formula: abs(log10(to.zoom / from.zoom)) * 24
 * Min: 9s; no upper cap — very large zoom ranges take proportionally longer
 * (e.g. 10× → 24s, 100× → 48s, 1e10× → 240s)
 */
export function segmentDuration(from: ViewBounds, to: ViewBounds): number {
  const zoomRatio = to.zoom / from.zoom;
  const logZoom = Math.abs(Math.log10(zoomRatio));
  const duration = logZoom * 24;

  // Keep a minimum duration so shallow moves still breathe,
  // but let very large zoom ranges take proportionally longer.
  return Math.max(9, duration);
}

// ─────────────────────────────────────────────────────────────
// Midpoint insertion (van Wijk & Nuij style)
// ─────────────────────────────────────────────────────────────

/**
 * Displacement threshold (in units of the target viewport width) above which
 * a synthetic midpoint is inserted between two keyframes.
 *
 * When ratio = displacement / (2 / to.zoom) > MIDPOINT_THRESHOLD,
 * a direct zoom-in causes rapid lateral drift at the end of the animation.
 * A midpoint decouples panning (at shallow zoom) from zooming (after alignment).
 *
 * Threshold of 20 means: only trigger when the start center is more than
 * 20 target-viewport-widths away from the target center.
 */
const MIDPOINT_THRESHOLD = 20;

/**
 * Duration per viewport-width crossed during a pure-pan segment (seconds).
 * 2.5s per viewport width gives lateral drift more breathing room at gallery/homepage scale.
 */
const PAN_SECONDS_PER_VIEWPORT = 2.5;

/**
 * Returns true when the center displacement between `from` and `to` is large
 * enough relative to the *deeper* viewport that direct zoom animation would
 * produce visible high-speed lateral drift.
 *
 * We measure displacement against the deeper (higher zoom) viewport because
 * that's where the drift is visually worst — both on zoom-in (arriving at deep
 * zoom while still off-center) and on zoom-out (departing from deep zoom while
 * the center jumps to the other location).
 *
 * @param threshold - Override the default MIDPOINT_THRESHOLD (useful for tests)
 */
export function needsMidpoint(
  from: ViewBounds,
  to: ViewBounds,
  threshold: number = MIDPOINT_THRESHOLD
): boolean {
  if (from.zoom <= 0 || to.zoom <= 0) return false;

  const dx = to.centerX - from.centerX;
  const dy = to.centerY - from.centerY;
  const displacement = Math.sqrt(dx * dx + dy * dy);

  // Use the deeper viewport (higher zoom = smaller viewport) as the reference.
  // This makes the check symmetric: needsMidpoint(A,B) === needsMidpoint(B,A).
  const deeperZoom = Math.max(from.zoom, to.zoom);
  const deeperViewportWidth = 2.0 / deeperZoom;
  const ratio = displacement / deeperViewportWidth;

  return ratio > threshold;
}

/**
 * Duration for a pure-pan segment (zoom unchanged at the shallow end).
 * Uses the shallower zoom's viewport width as the reference unit, because
 * the pan always happens at the shallow-zoom end of the journey.
 */
function panSegmentDuration(from: ViewBounds, to: ViewBounds): number {
  const dx = to.centerX - from.centerX;
  const dy = to.centerY - from.centerY;
  const displacement = Math.sqrt(dx * dx + dy * dy);

  if (displacement < 1e-10) return 9;

  // Pan happens at the shallower (wider) viewport end
  const shallowerZoom = Math.min(
    from.zoom > 0 ? from.zoom : Infinity,
    to.zoom   > 0 ? to.zoom   : Infinity,
  );
  const shallowerViewportWidth = shallowerZoom > 0 ? 2.0 / shallowerZoom : 2.0;
  const viewportsCrossed = displacement / shallowerViewportWidth;

  return Math.max(9, viewportsCrossed * PAN_SECONDS_PER_VIEWPORT);
}

/**
 * Build the TimelineSegment(s) for one keyframe pair, with recursive midpoint
 * insertion up to `maxDepth` levels.
 *
 * Single midpoint (depth 1) handles the common case where one end is shallow
 * and the other is deep. For two-deep-zoom pairs, the first split produces a
 * sub-segment that still triggers the check, so depth 2 resolves it fully:
 *
 *   Both deep (e.g. zoom-out then zoom-in via apex):
 *     KF1 → mid1(center=KF1.center, zoom=apex) → apex → mid2(center=KF2.center, zoom=apex) → KF2
 *     [zoom out]  [pan at apex]                  [pan at apex]  [zoom in]
 *
 * maxDepth = 3 is sufficient for all practical cases; it prevents unbounded
 * recursion in degenerate inputs.
 */
function buildSegmentsForPair(
  from: ViewBounds,
  to: ViewBounds,
  startOffset: number,
  depth: number = 0
): TimelineSegment[] {
  if (!needsMidpoint(from, to) || depth >= 3) {
    // Use pan duration formula when zoom is essentially unchanged (pure pan segment)
    const zoomRatio = from.zoom > 0 && to.zoom > 0 ? to.zoom / from.zoom : 1;
    const isPurePan = Math.abs(Math.log10(zoomRatio)) < 0.01; // zoom differs < 2.3%
    const duration = isPurePan
      ? panSegmentDuration(from, to)
      : segmentDuration(from, to);
    return [{ from, to, duration, startOffset }];
  }

  const zoomingIn = to.zoom >= from.zoom;

  // mid sits at the shallow-zoom end:
  //   zoom-in:  mid.zoom = from.zoom (shallow), mid.center = to.center (destination)
  //   zoom-out: mid.zoom = to.zoom   (shallow), mid.center = from.center (stay put)
  const mid: ViewBounds = zoomingIn
    ? { centerX: to.centerX,   centerY: to.centerY,   zoom: from.zoom, rotation: from.rotation ?? 0 }
    : { centerX: from.centerX, centerY: from.centerY, zoom: to.zoom,   rotation: to.rotation ?? 0 };

  // Recursively build each half — sub-segments may themselves need splitting
  const segs1 = buildSegmentsForPair(from, mid, startOffset, depth + 1);
  const offset2 = startOffset + segs1.reduce((s, sg) => s + sg.duration, 0);
  const segs2 = buildSegmentsForPair(mid, to, offset2, depth + 1);

  return [...segs1, ...segs2];
}

/**
 * Build complete loop timeline including last -> first return segment.
 *
 * When two adjacent keyframes have a large center displacement relative to
 * the target zoom depth, a synthetic midpoint is automatically inserted to
 * decouple panning (at shallow zoom, wide view) from zooming (after alignment).
 * This is transparent to callers — the function signature is unchanged.
 */
export function buildTimeline(keyframes: Keyframe[]): TimelineSegment[] {
  const n = keyframes.length;

  // Single frame: no segments
  if (n < 2) {
    return [];
  }

  const segments: TimelineSegment[] = [];
  let currentOffset = 0;

  // Create segments: 0->1, 1->2, ..., (n-1)->0 (closed loop)
  for (let i = 0; i < n; i++) {
    const from = keyframes[i].bounds;
    const to = keyframes[(i + 1) % n].bounds;

    const pairSegments = buildSegmentsForPair(from, to, currentOffset);
    for (const seg of pairSegments) {
      segments.push(seg);
      currentOffset += seg.duration;
    }
  }

  return segments;
}

/**
 * Calculate total duration of all segments
 */
export function totalDuration(segments: TimelineSegment[]): number {
  return segments.reduce((sum, seg) => sum + seg.duration, 0);
}

/**
 * Shortest path interpolation for rotation
 * Handles wrap-around at 2π (radians)
 * Algorithm: delta = ((to - from + 3π) % 2π) - π
 *
 * Note: rotation values are always in radians throughout the system
 * (e.g. Math.PI/4, not 45). Using % 360 would be wrong.
 */
export function shortestRotationLerp(from: number, to: number, t: number): number {
  const TWO_PI = Math.PI * 2;
  const normalizedFrom = ((from % TWO_PI) + TWO_PI) % TWO_PI;
  const normalizedTo = ((to % TWO_PI) + TWO_PI) % TWO_PI;

  // Shortest arc: delta is in [-π, π]
  const delta = ((normalizedTo - normalizedFrom + 3 * Math.PI) % TWO_PI) - Math.PI;

  return normalizedFrom + delta * t;
}

/**
 * Logarithmic interpolation for zoom
 * Creates smooth zoom transitions that feel natural.
 * Clamps zoom to a minimum positive value to guard against
 * zero or negative values (e.g. from URL truncation of very small zooms).
 */
export function logZoomLerp(fromZoom: number, toZoom: number, t: number): number {
  const MIN_ZOOM = 1e-6;
  const logFrom = Math.log(Math.max(fromZoom, MIN_ZOOM));
  const logTo = Math.log(Math.max(toZoom, MIN_ZOOM));
  const logResult = lerp(logFrom, logTo, t);
  return Math.exp(logResult);
}

/**
 * Interpolate bounds at a specific time point
 * Time wraps around for looping
 */
export function interpolateAtTime(
  segments: TimelineSegment[],
  totalDur: number,
  time: number
): ViewBounds {
  // Handle empty timeline
  if (segments.length === 0 || totalDur <= 0) {
    return {
      centerX: 0,
      centerY: 0,
      zoom: 1,
      rotation: 0,
    };
  }

  // Normalize time to loop
  const normalizedTime = ((time % totalDur) + totalDur) % totalDur;

  // Find which segment we're in
  let segment: TimelineSegment | null = null;
  for (const seg of segments) {
    if (normalizedTime >= seg.startOffset &&
        normalizedTime < seg.startOffset + seg.duration) {
      segment = seg;
      break;
    }
  }

  // Fallback: should not happen, but use last segment
  if (!segment) {
    segment = segments[segments.length - 1];
  }

  // Calculate local t within segment (0-1)
  const localTime = normalizedTime - segment.startOffset;
  const t = Math.max(0, Math.min(1, localTime / segment.duration));

  // Zoom uses logarithmic interpolation
  const zoom = logZoomLerp(segment.from.zoom, segment.to.zoom, t);

  // Center point interpolation: use log-space t so the center tracks
  // proportionally to zoom depth. This prevents the "drifting off target"
  // artifact when zoom spans many orders of magnitude.
  // logT = 0 when zoom == from.zoom, logT = 1 when zoom == to.zoom
  const logFrom = Math.log(Math.max(segment.from.zoom, 1e-6));
  const logTo = Math.log(Math.max(segment.to.zoom, 1e-6));
  const logT = Math.abs(logTo - logFrom) > 1e-10
    ? (Math.log(zoom) - logFrom) / (logTo - logFrom)
    : t;
  const centerX = lerp(segment.from.centerX, segment.to.centerX, logT);
  const centerY = lerp(segment.from.centerY, segment.to.centerY, logT);

  // Handle rotation (optional field)
  const fromRotation = segment.from.rotation ?? 0;
  const toRotation = segment.to.rotation ?? 0;
  const rotation = shortestRotationLerp(fromRotation, toRotation, t);

  return {
    centerX,
    centerY,
    zoom,
    rotation,
  };
}
