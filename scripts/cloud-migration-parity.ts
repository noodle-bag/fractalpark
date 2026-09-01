const VERSION_PATTERN = /^\d{14}$/;

interface MigrationListRow {
  remote?: unknown;
}

interface MigrationListPayload {
  migrations?: unknown;
}

const collectJsonPayload = (
  payload: MigrationListPayload,
  applied: Set<string>,
): boolean => {
  if (!Array.isArray(payload.migrations)) return false;
  for (const candidate of payload.migrations as MigrationListRow[]) {
    if (
      candidate &&
      typeof candidate === 'object' &&
      typeof candidate.remote === 'string' &&
      VERSION_PATTERN.test(candidate.remote.trim())
    ) {
      applied.add(candidate.remote.trim());
    }
  }
  return true;
};

export function parseAppliedMigrationVersions(output: string): Set<string> {
  const applied = new Set<string>();

  try {
    const payload = JSON.parse(output.trim()) as MigrationListPayload;
    if (collectJsonPayload(payload, applied)) return applied;
  } catch {
    // Continue with mixed-output and legacy formats.
  }

  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    try {
      const payload = JSON.parse(trimmed) as MigrationListPayload;
      if (collectJsonPayload(payload, applied)) return applied;
    } catch {
      // Continue with the legacy table parser.
    }
  }

  for (const line of output.split('\n')) {
    const row = line.match(/`([^`]*)`\s*\|\s*`([^`]*)`/);
    if (!row) continue;
    const remote = row[2].trim();
    if (VERSION_PATTERN.test(remote)) applied.add(remote);
  }
  return applied;
}
