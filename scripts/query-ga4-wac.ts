import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const PROPERTY_TIME_ZONE = 'Asia/Shanghai';
const PRODUCTION_HOSTNAMES = ['fractalpark.com', 'www.fractalpark.com'];
const DAY_MS = 24 * 60 * 60 * 1000;

export interface DateRange {
  startDate: string;
  endDate: string;
}

interface CliOptions {
  propertyId: string;
  accessToken: string;
  quotaProject?: string;
  dateRange: DateRange;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDate(value: string, optionName: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${optionName} must use YYYY-MM-DD.`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || formatDate(date) !== value) {
    throw new Error(`${optionName} is not a valid date.`);
  }
  return date;
}

export function assertCompleteIsoWeek(dateRange: DateRange): void {
  const start = parseDate(dateRange.startDate, '--start');
  const end = parseDate(dateRange.endDate, '--end');
  if (start.getUTCDay() !== 1 || end.getUTCDay() !== 0) {
    throw new Error('WAC date range must run from Monday through Sunday.');
  }
  if (end.valueOf() - start.valueOf() !== 6 * DAY_MS) {
    throw new Error('WAC date range must contain exactly one complete week.');
  }
}

export function previousCompleteWeek(now = new Date()): DateRange {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PROPERTY_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const datePart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  const today = parseDate(
    `${datePart('year')}-${datePart('month')}-${datePart('day')}`,
    'current date',
  );
  const daysSinceMonday = (today.getUTCDay() + 6) % 7;
  const currentMonday = new Date(today.valueOf() - daysSinceMonday * DAY_MS);
  const start = new Date(currentMonday.valueOf() - 7 * DAY_MS);
  const end = new Date(start.valueOf() + 6 * DAY_MS);
  return { startDate: formatDate(start), endDate: formatDate(end) };
}

export function buildRunReportRequest(dateRange: DateRange) {
  assertCompleteIsoWeek(dateRange);
  return {
    dateRanges: [dateRange],
    dimensions: [{ name: 'isoYearIsoWeek' }],
    metrics: [{ name: 'totalUsers' }],
    dimensionFilter: {
      andGroup: {
        expressions: [
          {
            filter: {
              fieldName: 'eventName',
              stringFilter: { matchType: 'EXACT', value: 'creator_loop_complete' },
            },
          },
          {
            filter: {
              fieldName: 'hostName',
              inListFilter: { values: PRODUCTION_HOSTNAMES },
            },
          },
          {
            filter: {
              fieldName: 'customEvent:traffic_class',
              stringFilter: { matchType: 'EXACT', value: 'external' },
            },
          },
        ],
      },
    },
    keepEmptyRows: false,
  };
}

function readFlag(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((argument) => argument.startsWith(prefix))
    ?.slice(prefix.length);
}

function readOptions(): CliOptions {
  const propertyId = process.env.GA4_PROPERTY_ID ?? '';
  const accessToken = process.env.GA4_ACCESS_TOKEN ?? '';
  if (!/^\d+$/.test(propertyId)) {
    throw new Error('GA4_PROPERTY_ID must be the numeric GA4 property ID.');
  }
  if (!accessToken) {
    throw new Error('GA4_ACCESS_TOKEN is required and must be short-lived.');
  }

  const startDate = readFlag('start');
  const endDate = readFlag('end');
  if (Boolean(startDate) !== Boolean(endDate)) {
    throw new Error('--start and --end must be provided together.');
  }
  const dateRange = startDate && endDate
    ? { startDate, endDate }
    : previousCompleteWeek();
  assertCompleteIsoWeek(dateRange);

  return {
    propertyId,
    accessToken,
    quotaProject: process.env.GOOGLE_CLOUD_QUOTA_PROJECT,
    dateRange,
  };
}

async function requestJson(
  url: string,
  options: CliOptions,
  init?: RequestInit,
): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${options.accessToken}`,
      'content-type': 'application/json',
      ...(options.quotaProject
        ? { 'x-goog-user-project': options.quotaProject }
        : {}),
      ...init?.headers,
    },
  });
  const body = await response.json() as Record<string, unknown>;
  if (!response.ok) {
    const message = typeof body.error === 'object' && body.error
      ? JSON.stringify(body.error)
      : response.statusText;
    throw new Error(`GA4 request failed (${response.status}): ${message}`);
  }
  return body;
}

async function main(): Promise<void> {
  const options = readOptions();
  const property = await requestJson(
    `https://analyticsadmin.googleapis.com/v1beta/properties/${options.propertyId}`,
    options,
  );
  if (property.timeZone !== PROPERTY_TIME_ZONE) {
    throw new Error(
      `GA4 property time zone must be ${PROPERTY_TIME_ZONE}; received ${String(property.timeZone)}.`,
    );
  }

  const report = await requestJson(
    `https://analyticsdata.googleapis.com/v1beta/properties/${options.propertyId}:runReport`,
    options,
    {
      method: 'POST',
      body: JSON.stringify(buildRunReportRequest(options.dateRange)),
    },
  );
  process.stdout.write(`${JSON.stringify({
    definition: 'unique external users completing render -> user change -> successful render',
    timeZone: PROPERTY_TIME_ZONE,
    dateRange: options.dateRange,
    rows: report.rows ?? [],
  }, null, 2)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
