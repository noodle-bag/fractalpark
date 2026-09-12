import { trackEvent } from '@/components/analytics/PageViewTracker';
import {
  resolveAnalyticsTrafficClass,
  type AnalyticsTrafficClass,
} from '@/lib/analytics-traffic';
export {
  ANALYTICS_TRAFFIC_CLASS_STORAGE_KEY,
  resolveAnalyticsTrafficClass,
  type AnalyticsTrafficClass,
} from '@/lib/analytics-traffic';

export type CreatorChangeType =
  | 'formula'
  | 'formula_parameter'
  | 'viewport'
  | 'coloring'
  | 'julia'
  | 'transform'
  | 'keyframe'
  | 'render_quality'
  | 'reset';

export interface CreatorChangeAttribution {
  changeId: number;
  changeType: CreatorChangeType;
  weekKey: string;
}

export interface CreatorRemixSource {
  type: 'formula' | 'preset' | 'publication';
  id: string;
}

const PUBLIC_SOURCE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;

export function resolveCreatorRemixSource(
  source: { type: string; id: string } | null,
): CreatorRemixSource | null {
  if (
    !source ||
    !['formula', 'preset', 'publication'].includes(source.type) ||
    !PUBLIC_SOURCE_ID.test(source.id)
  ) {
    return null;
  }
  return source as CreatorRemixSource;
}

type CreatorAnalyticsEventName =
  | 'first_render_complete'
  | 'creator_change'
  | 'creator_render_complete'
  | 'creator_loop_complete'
  | 'remix_complete';

type CreatorAnalyticsTracker = (
  eventName: CreatorAnalyticsEventName,
  params: Record<string, string | number | boolean>,
) => void;

const SHANGHAI_TIME_ZONE = 'Asia/Shanghai';

export function analyticsValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => analyticsValuesEqual(value, right[index]));
  }
  if (
    left === null ||
    right === null ||
    typeof left !== 'object' ||
    typeof right !== 'object'
  ) return false;

  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);
  return leftKeys.length === rightKeys.length && leftKeys.every((key) => (
    Object.hasOwn(rightRecord, key) &&
    analyticsValuesEqual(leftRecord[key], rightRecord[key])
  ));
}

export function resolveCreatorWeekKey(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SHANGHAI_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  const today = new Date(`${value('year')}-${value('month')}-${value('day')}T00:00:00Z`);
  const daysSinceMonday = (today.getUTCDay() + 6) % 7;
  return new Date(today.valueOf() - daysSinceMonday * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function trafficParams(trafficClass: AnalyticsTrafficClass) {
  return {
    traffic_type: trafficClass === 'external' ? 'external' : 'internal',
    traffic_class: trafficClass,
  } as const;
}

export class CreatorAnalyticsSession {
  private hasSuccessfulRender = false;
  private baselineWeekKey: string | null = null;
  private loopCompleteWeekKey: string | null = null;
  private remixComplete = false;
  private nextChangeId = 0;
  private latestChange: CreatorChangeAttribution | null = null;

  constructor(
    private readonly tracker: CreatorAnalyticsTracker = trackEvent,
    private readonly trafficClass = resolveAnalyticsTrafficClass(),
    private readonly weekKey = resolveCreatorWeekKey,
  ) {}

  noteChange(changeType: CreatorChangeType): CreatorChangeAttribution {
    const change = {
      changeId: ++this.nextChangeId,
      changeType,
      weekKey: this.weekKey(),
    } satisfies CreatorChangeAttribution;
    this.latestChange = change;
    this.tracker('creator_change', {
      surface: 'explore',
      change_id: change.changeId,
      change_type: change.changeType,
      ...trafficParams(this.trafficClass),
    });
    return change;
  }

  clearPendingChange(): void {
    this.latestChange = null;
  }

  completeRenderedRemix(source: CreatorRemixSource): void {
    if (this.remixComplete) return;
    this.remixComplete = true;
    this.tracker('remix_complete', {
      source_type: source.type,
      source_id: source.id,
      completion_surface: 'explore_render',
      ...trafficParams(this.trafficClass),
    });
  }

  renderComplete(attribution: CreatorChangeAttribution | null): void {
    const renderWeekKey = this.weekKey();
    if (!this.hasSuccessfulRender || this.baselineWeekKey !== renderWeekKey) {
      const firstSuccessfulRender = !this.hasSuccessfulRender;
      this.hasSuccessfulRender = true;
      this.baselineWeekKey = renderWeekKey;
      if (
        attribution &&
        attribution.changeId === this.latestChange?.changeId
      ) {
        this.latestChange = null;
      }
      if (firstSuccessfulRender) {
        this.tracker('first_render_complete', {
          page: 'explore',
          ...trafficParams(this.trafficClass),
        });
      }
      this.tracker('creator_render_complete', {
        surface: 'explore',
        render_phase: 'initial',
        ...trafficParams(this.trafficClass),
      });
      return;
    }

    if (
      !attribution ||
      !this.latestChange ||
      attribution.weekKey !== renderWeekKey ||
      attribution.changeId !== this.latestChange.changeId
    ) {
      return;
    }

    this.latestChange = null;
    const params = {
      surface: 'explore',
      change_id: attribution.changeId,
      change_type: attribution.changeType,
      ...trafficParams(this.trafficClass),
    } as const;
    this.tracker('creator_render_complete', {
      ...params,
      render_phase: 'post_change',
    });
    if (this.loopCompleteWeekKey !== renderWeekKey) {
      this.loopCompleteWeekKey = renderWeekKey;
      this.tracker('creator_loop_complete', params);
    }
  }
}
