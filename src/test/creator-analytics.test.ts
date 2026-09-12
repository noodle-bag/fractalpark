import { describe, expect, it, vi } from 'vitest';
import {
  CreatorAnalyticsSession,
  analyticsValuesEqual,
  resolveAnalyticsTrafficClass,
  resolveCreatorWeekKey,
} from '@/lib/creator-analytics';

type RecordedEvent = {
  name: string;
  params: Record<string, string | number | boolean>;
};

function createSession(
  trafficClass: 'external' | 'internal' = 'external',
  weekKey?: () => string,
) {
  const events: RecordedEvent[] = [];
  const tracker = vi.fn((
    name: string,
    params: Record<string, string | number | boolean>,
  ) => {
    events.push({ name, params });
  });
  return {
    events,
    session: new CreatorAnalyticsSession(tracker, trafficClass, weekKey),
    tracker,
  };
}

describe('CreatorAnalyticsSession', () => {
  it('uses the first successfully drawn frame as the render baseline', () => {
    const { events, session } = createSession();

    session.renderComplete(null);

    expect(events).toEqual([
      {
        name: 'first_render_complete',
        params: {
          page: 'explore',
          traffic_class: 'external',
          traffic_type: 'external',
        },
      },
      {
        name: 'creator_render_complete',
        params: {
          render_phase: 'initial',
          surface: 'explore',
          traffic_class: 'external',
          traffic_type: 'external',
        },
      },
    ]);
  });

  it('closes one creator loop after a later user change successfully renders', () => {
    const { events, session } = createSession();
    session.renderComplete(null);
    const change = session.noteChange('viewport');

    session.renderComplete(change);
    session.renderComplete(change);

    expect(events.map(({ name }) => name)).toEqual([
      'first_render_complete',
      'creator_render_complete',
      'creator_change',
      'creator_render_complete',
      'creator_loop_complete',
    ]);
    expect(events.at(-1)?.params).toEqual({
      change_id: 1,
      change_type: 'viewport',
      surface: 'explore',
      traffic_class: 'external',
      traffic_type: 'external',
    });
  });

  it('does not count a change made before the first successful render', () => {
    const { events, session } = createSession();
    const earlyChange = session.noteChange('formula');

    session.renderComplete(earlyChange);

    expect(events.some(({ name }) => name === 'creator_loop_complete')).toBe(false);

    const laterChange = session.noteChange('formula_parameter');
    session.renderComplete(laterChange);

    expect(events.filter(({ name }) => name === 'creator_loop_complete')).toHaveLength(1);
  });

  it('requires all three steps to occur in the same Shanghai week', () => {
    let currentWeek = '2026-08-31';
    const { events, session } = createSession('external', () => currentWeek);
    session.renderComplete(null);
    const priorWeekChange = session.noteChange('viewport');

    currentWeek = '2026-09-07';
    session.renderComplete(priorWeekChange);
    expect(events.some(({ name }) => name === 'creator_loop_complete')).toBe(false);

    const currentWeekChange = session.noteChange('coloring');
    session.renderComplete(currentWeekChange);
    expect(events.filter(({ name }) => name === 'creator_loop_complete')).toHaveLength(1);

    currentWeek = '2026-09-14';
    session.renderComplete(null);
    const followingWeekChange = session.noteChange('formula');
    session.renderComplete(followingWeekChange);
    expect(events.filter(({ name }) => name === 'creator_loop_complete')).toHaveLength(2);
  });

  it('ignores superseded, resize, failed, and restored render attribution', () => {
    const { events, session } = createSession();
    session.renderComplete(null);
    const superseded = session.noteChange('coloring');
    const latest = session.noteChange('transform');

    session.renderComplete(superseded);
    session.renderComplete(null);
    expect(events.some(({ name }) => name === 'creator_loop_complete')).toBe(false);

    session.clearPendingChange();
    session.renderComplete(latest);
    expect(events.some(({ name }) => name === 'creator_loop_complete')).toBe(false);
  });

  it('marks non-external traffic for GA4 internal exclusion', () => {
    const { events, session } = createSession('internal');
    session.renderComplete(null);
    const change = session.noteChange('keyframe');
    session.renderComplete(change);

    expect(events.every(({ params }) => (
      params.traffic_type === 'internal' && params.traffic_class === 'internal'
    ))).toBe(true);
  });

  it('records a rendered Remix completion once without private state', () => {
    const { events, session } = createSession();

    session.completeRenderedRemix({ type: 'preset', id: 'preset-example' });
    session.completeRenderedRemix({ type: 'preset', id: 'preset-example' });

    expect(events).toEqual([{
      name: 'remix_complete',
      params: {
        completion_surface: 'explore_render',
        source_id: 'preset-example',
        source_type: 'preset',
        traffic_class: 'external',
        traffic_type: 'external',
      },
    }]);
    expect(Object.keys(events[0].params)).not.toContain('document');
    expect(Object.keys(events[0].params)).not.toContain('source_code');
  });
});

describe('creator change equality', () => {
  it('recognizes structurally equal control values as no-ops', () => {
    expect(analyticsValuesEqual([1, 2], [1, 2])).toBe(true);
    expect(analyticsValuesEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(analyticsValuesEqual({ enabled: true }, { enabled: false })).toBe(false);
  });
});

describe('resolveAnalyticsTrafficClass', () => {
  it('classifies non-production hosts as development traffic', () => {
    expect(resolveAnalyticsTrafficClass()).toBe('development');
  });
});

describe('resolveCreatorWeekKey', () => {
  it('rolls over at Shanghai Monday midnight', () => {
    expect(resolveCreatorWeekKey(new Date('2026-09-06T15:59:59Z'))).toBe('2026-08-31');
    expect(resolveCreatorWeekKey(new Date('2026-09-06T16:00:00Z'))).toBe('2026-09-07');
  });
});
