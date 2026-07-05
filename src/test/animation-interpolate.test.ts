import { describe, it, expect } from 'vitest';
import {
  lerp,
  segmentDuration,
  buildTimeline,
  totalDuration,
  shortestRotationLerp,
  logZoomLerp,
  interpolateAtTime,
  needsMidpoint,
} from '@/engine/animation/interpolate';
import type { ViewBounds, Keyframe } from '@/engine/types';

describe('animation interpolate engine', () => {
  describe('lerp', () => {
    it('should interpolate between two values', () => {
      expect(lerp(0, 10, 0)).toBe(0);
      expect(lerp(0, 10, 1)).toBe(10);
      expect(lerp(0, 10, 0.5)).toBe(5);
      expect(lerp(5, 15, 0.3)).toBe(8);
    });
  });

  describe('segmentDuration', () => {
    it('should return 24s for 10x zoom difference', () => {
      const from: ViewBounds = { centerX: 0, centerY: 0, zoom: 1, rotation: 0 };
      const to: ViewBounds = { centerX: 0, centerY: 0, zoom: 10, rotation: 0 };
      expect(segmentDuration(from, to)).toBe(24);
    });

    it('should return 48s for 100x zoom difference', () => {
      const from: ViewBounds = { centerX: 0, centerY: 0, zoom: 1, rotation: 0 };
      const to: ViewBounds = { centerX: 0, centerY: 0, zoom: 100, rotation: 0 };
      expect(segmentDuration(from, to)).toBe(48);
    });

    it('should return minimum 9s when no zoom change', () => {
      const from: ViewBounds = { centerX: 0, centerY: 0, zoom: 5, rotation: 0 };
      const to: ViewBounds = { centerX: 1, centerY: 1, zoom: 5, rotation: 0 };
      expect(segmentDuration(from, to)).toBe(9);
    });

    it('should be symmetric (zoom from->to same as to->from)', () => {
      const a: ViewBounds = { centerX: 0, centerY: 0, zoom: 1, rotation: 0 };
      const b: ViewBounds = { centerX: 0, centerY: 0, zoom: 50, rotation: 0 };
      expect(segmentDuration(a, b)).toBe(segmentDuration(b, a));
    });

    it('should scale proportionally for very large zoom differences (no cap)', () => {
      // log10(1e10) = 10, duration = 10 * 24 = 240s (no upper cap)
      const from: ViewBounds = { centerX: 0, centerY: 0, zoom: 1, rotation: 0 };
      const to: ViewBounds = { centerX: 0, centerY: 0, zoom: 1e10, rotation: 0 };
      expect(segmentDuration(from, to)).toBe(240);
    });
  });

  describe('needsMidpoint', () => {
    it('should return false when displacement is small relative to target zoom', () => {
      const from: ViewBounds = { centerX: 0, centerY: 0, zoom: 1 };
      // displacement=0.1, toViewportWidth=2/100=0.02, ratio=5 < 20
      const to: ViewBounds = { centerX: 0.1, centerY: 0, zoom: 100 };
      expect(needsMidpoint(from, to)).toBe(false);
    });

    it('should return true when displacement is large relative to target zoom', () => {
      const from: ViewBounds = { centerX: 0, centerY: 0, zoom: 1 };
      // displacement=1, toViewportWidth=2/100=0.02, ratio=50 > 20
      const to: ViewBounds = { centerX: 1, centerY: 0, zoom: 100 };
      expect(needsMidpoint(from, to)).toBe(true);
    });

    it('should return false when centers are identical', () => {
      const from: ViewBounds = { centerX: 0.5, centerY: 0.5, zoom: 1 };
      const to: ViewBounds = { centerX: 0.5, centerY: 0.5, zoom: 100 };
      expect(needsMidpoint(from, to)).toBe(false);
    });

    it('should return false when zoom is the same and displacement is small', () => {
      const from: ViewBounds = { centerX: 0, centerY: 0, zoom: 5 };
      // toViewportWidth=2/5=0.4, displacement=0.5, ratio=1.25 < 20
      const to: ViewBounds = { centerX: 0.5, centerY: 0, zoom: 5 };
      expect(needsMidpoint(from, to)).toBe(false);
    });

    it('should respect custom threshold', () => {
      const from: ViewBounds = { centerX: 0, centerY: 0, zoom: 1 };
      // ratio = 0.1 / (2/100) = 5
      const to: ViewBounds = { centerX: 0.1, centerY: 0, zoom: 100 };
      expect(needsMidpoint(from, to, 3)).toBe(true);   // 5 > 3 → true
      expect(needsMidpoint(from, to, 10)).toBe(false); // 5 < 10 → false
    });

    it('should return false when to.zoom is zero or negative', () => {
      const from: ViewBounds = { centerX: 0, centerY: 0, zoom: 1 };
      const to: ViewBounds = { centerX: 1, centerY: 0, zoom: 0 };
      expect(needsMidpoint(from, to)).toBe(false);
    });
  });

  describe('buildTimeline', () => {
    it('should return empty array for single keyframe', () => {
      const keyframes: Keyframe[] = [
        { id: 'k1', bounds: { centerX: 0, centerY: 0, zoom: 1 } },
      ];
      expect(buildTimeline(keyframes)).toEqual([]);
    });

    it('should create correct segments for 3 keyframes with no midpoint insertion', () => {
      // Choose data where all pairs have ratio < 20 (no midpoint triggered):
      // k1→k2: displacement=0.05, toViewportWidth=2/10=0.2,  ratio=0.25 < 20 ✓
      // k2→k3: displacement=0.001, toViewportWidth=2/100=0.02, ratio=0.05 < 20 ✓
      // k3→k1: displacement=√(0.05²+0.001²)≈0.05, toViewportWidth=2/1=2, ratio≈0.025 < 20 ✓
      const keyframes: Keyframe[] = [
        { id: 'k1', bounds: { centerX: 0,    centerY: 0,     zoom: 1   } },
        { id: 'k2', bounds: { centerX: 0.05, centerY: 0,     zoom: 10  } },
        { id: 'k3', bounds: { centerX: 0.05, centerY: 0.001, zoom: 100 } },
      ];

      const segments = buildTimeline(keyframes);
      expect(segments).toHaveLength(3);

      // Check start offsets are cumulative
      expect(segments[0].startOffset).toBe(0);
      expect(segments[1].startOffset).toBe(segments[0].duration);
      expect(segments[2].startOffset).toBe(segments[0].duration + segments[1].duration);

      // Check return segment: from last back to first
      expect(segments[2].from).toEqual(keyframes[2].bounds);
      expect(segments[2].to).toEqual(keyframes[0].bounds);
    });

    it('should create 2 segments for 2 keyframes with no midpoint insertion (A->B, B->A)', () => {
      // k1→k2: displacement=√2≈1.41, toViewportWidth=2/10=0.2, ratio≈7 < 20 ✓
      // k2→k1: displacement=√2≈1.41, toViewportWidth=2/1=2,    ratio≈0.7 < 20 ✓
      const keyframes: Keyframe[] = [
        { id: 'k1', bounds: { centerX: 0, centerY: 0, zoom: 1 } },
        { id: 'k2', bounds: { centerX: 1, centerY: 1, zoom: 10 } },
      ];

      const segments = buildTimeline(keyframes);
      expect(segments).toHaveLength(2);
      expect(segments[0].from).toEqual(keyframes[0].bounds);
      expect(segments[0].to).toEqual(keyframes[1].bounds);
      expect(segments[1].from).toEqual(keyframes[1].bounds);
      expect(segments[1].to).toEqual(keyframes[0].bounds);
    });
  });

  describe('buildTimeline with midpoint insertion', () => {
    it('should insert midpoint when displacement is too large for target zoom', () => {
      // k1→k2: displacement=1, deeperZoom=100, deeperViewportWidth=0.02, ratio=50 > 20 → split (2 segs)
      // k2→k1: displacement=1, deeperZoom=100, deeperViewportWidth=0.02, ratio=50 > 20 → split (2 segs)
      // total: 2 + 2 = 4 segments
      const keyframes: Keyframe[] = [
        { id: 'k1', bounds: { centerX: 0, centerY: 0, zoom: 1   } },
        { id: 'k2', bounds: { centerX: 1, centerY: 0, zoom: 100 } },
      ];
      const segments = buildTimeline(keyframes);
      expect(segments).toHaveLength(4);
    });

    it('pan segment (seg[0]) should have from.zoom as its to.zoom (pure pan)', () => {
      const from: ViewBounds = { centerX: 0, centerY: 0, zoom: 1 };
      const to: ViewBounds = { centerX: 1, centerY: 0, zoom: 100 };
      const segments = buildTimeline([
        { id: 'k1', bounds: from },
        { id: 'k2', bounds: to },
      ]);
      // seg[0] is the pan segment: zoom stays at from.zoom
      expect(segments[0].from.zoom).toBe(from.zoom);
      expect(segments[0].to.zoom).toBe(from.zoom);
    });

    it('pan segment should move center to target', () => {
      const from: ViewBounds = { centerX: 0, centerY: 0, zoom: 1 };
      const to: ViewBounds = { centerX: 1, centerY: 0, zoom: 100 };
      const segments = buildTimeline([
        { id: 'k1', bounds: from },
        { id: 'k2', bounds: to },
      ]);
      expect(segments[0].to.centerX).toBeCloseTo(to.centerX);
      expect(segments[0].to.centerY).toBeCloseTo(to.centerY);
    });

    it('zoom segment (seg[1]) should have identical center on both ends (pure zoom)', () => {
      const from: ViewBounds = { centerX: 0, centerY: 0, zoom: 1 };
      const to: ViewBounds = { centerX: 1, centerY: 0, zoom: 100 };
      const segments = buildTimeline([
        { id: 'k1', bounds: from },
        { id: 'k2', bounds: to },
      ]);
      // seg[1] is the zoom segment: center doesn't move
      expect(segments[1].from.centerX).toBeCloseTo(to.centerX);
      expect(segments[1].from.centerY).toBeCloseTo(to.centerY);
      expect(segments[1].to.centerX).toBeCloseTo(to.centerX);
      expect(segments[1].to.centerY).toBeCloseTo(to.centerY);
    });

    it('should also insert midpoint on zoom-out (symmetric with zoom-in)', () => {
      // zoom-out: from.zoom=100 (deep), to.zoom=1 (shallow)
      // deeperZoom=100, ratio=50 > 20 → split
      // seg1: zoom-out, center unchanged (from.center)
      // seg2: pan at shallow zoom (to.zoom=1)
      const from: ViewBounds = { centerX: 1, centerY: 0, zoom: 100 };
      const to:   ViewBounds = { centerX: 0, centerY: 0, zoom: 1   };
      const segments = buildTimeline([
        { id: 'k1', bounds: from },
        { id: 'k2', bounds: to   },
      ]);
      // Both directions trigger → 4 segments total
      expect(segments).toHaveLength(4);

      // seg[0] is the zoom-out segment: center should NOT move
      expect(segments[0].from.centerX).toBeCloseTo(from.centerX);
      expect(segments[0].to.centerX).toBeCloseTo(from.centerX);
      // seg[0] zoom goes from deep to shallow
      expect(segments[0].from.zoom).toBeCloseTo(from.zoom);
      expect(segments[0].to.zoom).toBeCloseTo(to.zoom);

      // seg[1] is the pan segment at shallow zoom: zoom should stay at to.zoom
      expect(segments[1].from.zoom).toBeCloseTo(to.zoom);
      expect(segments[1].to.zoom).toBeCloseTo(to.zoom);
    });

    it('should not insert midpoint when only zoom differs (same center)', () => {
      const keyframes: Keyframe[] = [
        { id: 'k1', bounds: { centerX: -0.5, centerY: 0, zoom: 1    } },
        { id: 'k2', bounds: { centerX: -0.5, centerY: 0, zoom: 1000 } },
      ];
      const segments = buildTimeline(keyframes);
      // displacement=0 → no midpoint → 2 segments
      expect(segments).toHaveLength(2);
    });

    it('startOffset should remain cumulative after midpoint insertion', () => {
      const keyframes: Keyframe[] = [
        { id: 'k1', bounds: { centerX: 0, centerY: 0, zoom: 1   } },
        { id: 'k2', bounds: { centerX: 1, centerY: 0, zoom: 100 } },
      ];
      const segments = buildTimeline(keyframes);
      let expectedOffset = 0;
      for (const seg of segments) {
        expect(seg.startOffset).toBeCloseTo(expectedOffset, 10);
        expectedOffset += seg.duration;
      }
    });

    it('pan segment duration should scale with displacement', () => {
      // from.zoom=1 → fromViewportWidth=2; need displacement > 3.6 to exceed 9s clamp
      // displacement=10 → 5 viewports → 12.5s; displacement=20 → 10 viewports → 25s; ratio=2
      const from: ViewBounds = { centerX: 0, centerY: 0, zoom: 1 };
      const toA: ViewBounds = { centerX: 10, centerY: 0, zoom: 100 }; // ratio=500 > 20, dur=12.5s
      const toB: ViewBounds = { centerX: 20, centerY: 0, zoom: 100 }; // ratio=1000 > 20, dur=25s
      const segsA = buildTimeline([{ id: 'k1', bounds: from }, { id: 'k2', bounds: toA }]);
      const segsB = buildTimeline([{ id: 'k1', bounds: from }, { id: 'k2', bounds: toB }]);
      // seg[0] is pan segment for both; toB displacement is 2x → duration should be ~2x
      expect(segsB[0].duration).toBeGreaterThan(segsA[0].duration);
      expect(segsB[0].duration / segsA[0].duration).toBeCloseTo(2, 0);
    });
  });

  describe('totalDuration', () => {
    it('should sum all segment durations', () => {
      const segments = [
        { from: {} as ViewBounds, to: {} as ViewBounds, duration: 5, startOffset: 0 },
        { from: {} as ViewBounds, to: {} as ViewBounds, duration: 10, startOffset: 5 },
        { from: {} as ViewBounds, to: {} as ViewBounds, duration: 15, startOffset: 15 },
      ];
      expect(totalDuration(segments)).toBe(30);
    });

    it('should return 0 for empty segments', () => {
      expect(totalDuration([])).toBe(0);
    });
  });

  describe('shortestRotationLerp', () => {
    // All rotation values are in RADIANS throughout the system
    it('should interpolate rotation directly when no wrap-around', () => {
      // 0 to π/2 (0° to 90°), midpoint = π/4
      expect(shortestRotationLerp(0, Math.PI / 2, 0.5)).toBeCloseTo(Math.PI / 4);
      // 0 to π/4 (0° to 45°), midpoint = π/8
      expect(shortestRotationLerp(0, Math.PI / 4, 0.5)).toBeCloseTo(Math.PI / 8);
    });

    it('should take shortest path across π boundary', () => {
      // ~170° to ~-170° in radians: shortest path goes through π (180°)
      const from = (170 * Math.PI) / 180;
      const to = (-170 * Math.PI) / 180;
      const result = shortestRotationLerp(from, to, 0.5);
      expect(result).toBeCloseTo(Math.PI);
    });

    it('should handle negative to positive crossing', () => {
      // ~-170° to ~170°: shortest path goes through π (180°)
      const from = (-170 * Math.PI) / 180;
      const to = (170 * Math.PI) / 180;
      const result = shortestRotationLerp(from, to, 0.5);
      expect(result).toBeCloseTo(Math.PI);
    });

    it('should handle values > 2π', () => {
      // 4π (=720°) to π/2 (=90°): midpoint should be π/4 (=45°)
      const result = shortestRotationLerp(4 * Math.PI, Math.PI / 2, 0.5);
      expect(result).toBeCloseTo(Math.PI / 4);
    });
  });

  describe('logZoomLerp', () => {
    it('should return midpoint in log space', () => {
      // From zoom 1 to 100, midpoint should be 10
      const result = logZoomLerp(1, 100, 0.5);
      expect(result).toBeCloseTo(10, 5);
    });

    it('should handle t=0 and t=1', () => {
      expect(logZoomLerp(5, 50, 0)).toBe(5);
      expect(logZoomLerp(5, 50, 1)).toBeCloseTo(50, 10);
    });
  });

  describe('interpolateAtTime', () => {
    // Use keyframes that do NOT trigger midpoint insertion, so segment
    // indices are predictable for the assertions below.
    // k1→k2: displacement=√(0.01²+0.01²)≈0.014, toViewportWidth=2/100=0.02, ratio≈0.7 < 20 ✓
    // k2→k1: ratio≈0.007 < 20 ✓
    const keyframes: Keyframe[] = [
      { id: 'k1', bounds: { centerX: 0,    centerY: 0,    zoom: 1,   rotation: 0  } },
      { id: 'k2', bounds: { centerX: 0.01, centerY: 0.01, zoom: 100, rotation: Math.PI / 2 } },
    ];
    const segments = buildTimeline(keyframes);
    const totalDur = totalDuration(segments);

    it('should return first frame at t=0', () => {
      const result = interpolateAtTime(segments, totalDur, 0);
      expect(result.centerX).toBeCloseTo(0, 5);
      expect(result.centerY).toBeCloseTo(0, 5);
      expect(result.zoom).toBeCloseTo(1, 5);
    });

    it('should return interpolated zoom (logarithmic)', () => {
      // At midpoint of first segment, zoom should be log-midpoint between 1 and 100 = 10
      const midTime = segments[0].duration / 2;
      const result = interpolateAtTime(segments, totalDur, midTime);
      expect(result.zoom).toBeCloseTo(10, 5);
    });

    it('should loop correctly when time exceeds total duration', () => {
      const result1 = interpolateAtTime(segments, totalDur, 5);
      const result2 = interpolateAtTime(segments, totalDur, 5 + totalDur);
      expect(result1.centerX).toBeCloseTo(result2.centerX, 5);
      expect(result1.centerY).toBeCloseTo(result2.centerY, 5);
    });

    it('should handle negative time by wrapping', () => {
      const result = interpolateAtTime(segments, totalDur, -1);
      const expected = interpolateAtTime(segments, totalDur, totalDur - 1);
      expect(result.centerX).toBeCloseTo(expected.centerX, 5);
    });

    it('should return default bounds for empty segments', () => {
      const result = interpolateAtTime([], 0, 5);
      expect(result.centerX).toBe(0);
      expect(result.zoom).toBe(1);
    });
  });

  describe('interpolateAtTime with midpoint-inserted timeline', () => {
    it('should not jump at the pan/zoom segment boundary (center continuity)', () => {
      // This pair triggers midpoint: ratio=50 > 20
      const from: ViewBounds = { centerX: 0, centerY: 0, zoom: 1 };
      const to: ViewBounds = { centerX: 1, centerY: 0, zoom: 100 };
      const keyframes: Keyframe[] = [
        { id: 'k1', bounds: from },
        { id: 'k2', bounds: to },
      ];
      const segments = buildTimeline(keyframes);
      const totalDur = totalDuration(segments);

      // The boundary between pan and zoom segments
      const boundary = segments[0].startOffset + segments[0].duration;
      const epsilon = 0.001;

      const before = interpolateAtTime(segments, totalDur, boundary - epsilon);
      const after  = interpolateAtTime(segments, totalDur, boundary + epsilon);

      // Center should be continuous across the boundary
      expect(Math.abs(before.centerX - after.centerX)).toBeLessThan(0.01);
      expect(Math.abs(before.centerY - after.centerY)).toBeLessThan(0.01);
    });
  });
});
