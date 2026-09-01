import { describe, expect, it } from 'vitest';

import { parseAppliedMigrationVersions } from '../../scripts/cloud-migration-parity';

const sorted = (versions: Set<string>): string[] => [...versions].sort();

describe('Supabase migration-list output parsing', () => {
  it('reads only remote versions from the JSON wrapper output', () => {
    const output = JSON.stringify({
      migrations: [
        {
          local: '20260802000000',
          remote: '20260802000000',
          time: '2026-08-02 00:00:00',
        },
        {
          local: '20260802120000',
          remote: '',
          time: '2026-08-02 12:00:00',
        },
        {
          local: '',
          remote: '20260802130000',
          time: '2026-08-02 13:00:00',
        },
      ],
      message: 'Migrations listed',
    });

    expect(sorted(parseAppliedMigrationVersions(output))).toEqual([
      '20260802000000',
      '20260802130000',
    ]);
  });

  it('parses pretty-printed structured CLI output', () => {
    const output = JSON.stringify(
      {
        migrations: [
          { local: '20260816090000', remote: '20260816090000' },
          { local: '20260824120000', remote: '' },
        ],
        message: 'Migrations listed',
      },
      null,
      2,
    );

    expect(sorted(parseAppliedMigrationVersions(output))).toEqual([
      '20260816090000',
    ]);
  });

  it('retains compatibility with the legacy backtick table', () => {
    const output = [
      '`20260802000000` | `20260802000000` | 2026-08-02 00:00:00',
      '`20260802120000` | `` | 2026-08-02 12:00:00',
      '`` | `20260802130000` | 2026-08-02 13:00:00',
    ].join('\n');

    expect(sorted(parseAppliedMigrationVersions(output))).toEqual([
      '20260802000000',
      '20260802130000',
    ]);
  });

  it('does not treat malformed JSON or Local-only rows as applied', () => {
    const output = [
      '{not-json}',
      '`20260802000000` | `` | 2026-08-02 00:00:00',
    ].join('\n');

    expect(sorted(parseAppliedMigrationVersions(output))).toEqual([]);
  });
});
