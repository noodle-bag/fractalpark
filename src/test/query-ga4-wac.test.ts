import { describe, expect, it } from 'vitest';
import {
  assertCompleteIsoWeek,
  buildRunReportRequest,
  previousCompleteWeek,
} from '../../scripts/query-ga4-wac';

describe('GA4 WAC report query', () => {
  it('defaults to the previous complete Asia/Shanghai week', () => {
    expect(previousCompleteWeek(new Date('2026-09-10T04:00:00Z'))).toEqual({
      startDate: '2026-08-31',
      endDate: '2026-09-06',
    });
  });

  it('rejects partial and multi-week date ranges', () => {
    expect(() => assertCompleteIsoWeek({
      startDate: '2026-09-01',
      endDate: '2026-09-06',
    })).toThrow('Monday through Sunday');
    expect(() => assertCompleteIsoWeek({
      startDate: '2026-08-31',
      endDate: '2026-09-13',
    })).toThrow('exactly one complete week');
  });

  it('queries unique external creators on production hosts only', () => {
    expect(buildRunReportRequest({
      startDate: '2026-08-31',
      endDate: '2026-09-06',
    })).toMatchObject({
      dimensions: [{ name: 'isoYearIsoWeek' }],
      metrics: [{ name: 'totalUsers' }],
      dimensionFilter: {
        andGroup: {
          expressions: [
            { filter: { fieldName: 'eventName' } },
            { filter: { fieldName: 'hostName' } },
            { filter: { fieldName: 'customEvent:traffic_class' } },
          ],
        },
      },
    });
  });
});
