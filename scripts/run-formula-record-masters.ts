import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { once } from 'node:events';

import { build } from 'esbuild';

const root = process.cwd();
const bundlePath = resolve(
  '/tmp',
  `fractalpark-record-masters-${String(process.pid)}.cjs`,
);

async function main(): Promise<void> {
  await build({
    absWorkingDir: root,
    entryPoints: ['scripts/generate-formula-record-masters.ts'],
    outfile: bundlePath,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    packages: 'external',
    loader: { '.glsl': 'text' },
    logLevel: 'silent',
  });
  const child = spawn(process.execPath, [bundlePath, ...process.argv.slice(2)], {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_PATH: resolve(root, 'node_modules'),
    },
  });
  const forward = (signal: NodeJS.Signals): void => {
    if (child.exitCode === null) child.kill(signal);
  };
  const onSigint = (): void => forward('SIGINT');
  const onSigterm = (): void => forward('SIGTERM');
  process.once('SIGINT', onSigint);
  process.once('SIGTERM', onSigterm);
  const [code, signal] = (await once(child, 'exit')) as [
    number | null,
    NodeJS.Signals | null,
  ];
  process.off('SIGINT', onSigint);
  process.off('SIGTERM', onSigterm);
  if (signal) throw new Error(`record-preview-runner-signal:${signal}`);
  if (code !== 0) process.exitCode = code ?? 1;
}

void main()
  .catch((error: unknown) => {
    process.stderr.write(
      `[record-preview-runner] ${error instanceof Error ? error.message : 'failed'}\n`,
    );
    process.exitCode = 1;
  })
  .finally(() => {
    rmSync(bundlePath, { force: true });
  });
