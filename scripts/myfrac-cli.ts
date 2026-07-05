import fs from 'node:fs';
import { stdin as input, stdout as output } from 'node:process';
import { CliCommandError, createFailure, docFromPreset, docFromSaved, docFromUrl, docToUrl } from '@/cli/doc-commands';
import { formulaGenerate } from '@/cli/formula-commands';
import {
  renderBatch,
  renderScreenshot,
  renderThumbnail,
  verifyGalleryOpen,
  verifyPreset,
  verifyRegression,
} from '@/cli/render-commands';
import { exploreBatch, exploreMutate, exploreShard } from '@/cli/explore-commands';
import { presetDraft, reportRun, scoreBatch, selectTop } from '@/cli/score-commands';

type Args = Record<string, string | boolean>;

function parseArgs(argv: string[]): { command: string[]; args: Args } {
  const command: string[] = [];
  const args: Args = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        args[key] = true;
      } else {
        args[key] = next;
        i += 1;
      }
      continue;
    }

    command.push(token);
  }

  return { command, args };
}

function printJson(value: unknown): void {
  output.write(`${JSON.stringify(value, null, 2)}\n`);
}

function readJsonFile(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function readStdinJson(): Promise<unknown> {
  let raw = '';
  for await (const chunk of input) {
    raw += chunk;
  }

  if (!raw.trim()) {
    throw new CliCommandError('INVALID_INPUT', 1, 'Expected JSON from stdin.');
  }

  return JSON.parse(raw);
}

async function readJsonInput(filePath?: string): Promise<unknown> {
  if (filePath) {
    return readJsonFile(filePath);
  }
  return readStdinJson();
}

function readTextInput(filePath?: string): string {
  if (filePath) {
    return fs.readFileSync(filePath, 'utf8');
  }
  throw new CliCommandError('INVALID_INPUT', 1, 'Expected --input for batch render.');
}

function usage(): string {
  return [
    'Usage:',
    '  npm run myfrac:cli -- doc from-url --url <full-explore-url>',
    '  npm run myfrac:cli -- doc from-url --query <query-string>',
    '  npm run myfrac:cli -- doc to-url --input <document.json> --locale <en|zh> [--base-url <url>]',
    '  npm run myfrac:cli -- doc from-preset --id <preset-id> [--presets <path>]',
    '  npm run myfrac:cli -- doc from-saved --input <saved-or-document.json>',
    '  npm run myfrac:cli -- formula generate [--seed <mf1-xxxxxxxxxxxxxxxx>]',
    '  npm run myfrac:cli -- render thumbnail --input <document.json> --output <file.jpg> [--locale en]',
    '  npm run myfrac:cli -- render screenshot --input <document.json> --output <file.png> [--locale en]',
    '  npm run myfrac:cli -- render batch --input <documents.jsonl> --output-dir <dir> --mode <thumbnail|screenshot>',
    '  npm run myfrac:cli -- verify preset --id <preset-id> [--locale en]',
    '  npm run myfrac:cli -- verify gallery-open --id <preset-id> [--locale en]',
    '  npm run myfrac:cli -- verify regression [--suite phase2-smoke|preset|gallery-open|animation-url|transform|custom-formula]',
    '  npm run myfrac:cli -- explore mutate --input <document.json> [--config <campaign.json>]',
    '  npm run myfrac:cli -- explore batch --config <campaign.json> --output-dir <dir>',
    '  npm run myfrac:cli -- explore shard --manifest <manifest.json> --shard-index <n>',
    '  npm run myfrac:cli -- score batch --input <candidates.jsonl> --render-manifest <manifest.json> --output-dir <dir>',
    '  npm run myfrac:cli -- select top --input <scored.jsonl> --output-dir <dir> [--limit 12]',
    '  npm run myfrac:cli -- preset draft --input <shortlist.json> [--output <drafts.json>] [--locale en]',
    '  npm run myfrac:cli -- report run --input <scored.jsonl> --output-dir <dir> [--selection <shortlist.json>]',
  ].join('\n');
}

async function main(): Promise<void> {
  const { command, args } = parseArgs(process.argv.slice(2));
  const commandLabel = command.length > 0 ? command.join(' ') : 'unknown';

  try {
    if (command[0] !== 'doc') {
      if (
        command[0] !== 'render' &&
        command[0] !== 'verify' &&
        command[0] !== 'explore' &&
        command[0] !== 'formula' &&
        command[0] !== 'score' &&
        command[0] !== 'select' &&
        command[0] !== 'preset' &&
        command[0] !== 'report'
      ) {
        throw new CliCommandError('INVALID_COMMAND', 1, usage());
      }
    }

    if (command[0] === 'doc' && command[1] === 'from-url') {
      printJson(docFromUrl({
        url: typeof args.url === 'string' ? args.url : undefined,
        query: typeof args.query === 'string' ? args.query : undefined,
      }));
      return;
    }

    if (command[0] === 'doc' && command[1] === 'to-url') {
      const document = await readJsonInput(typeof args.input === 'string' ? args.input : undefined);
      printJson(docToUrl({
        document,
        locale: typeof args.locale === 'string' ? args.locale : '',
        baseUrl: typeof args['base-url'] === 'string' ? args['base-url'] : undefined,
      }));
      return;
    }

    if (command[0] === 'doc' && command[1] === 'from-preset') {
      printJson(docFromPreset({
        id: typeof args.id === 'string' ? args.id : '',
        presetsPath: typeof args.presets === 'string' ? args.presets : undefined,
      }));
      return;
    }

    if (command[0] === 'doc' && command[1] === 'from-saved') {
      const payload = await readJsonInput(typeof args.input === 'string' ? args.input : undefined);
      printJson(docFromSaved({ payload }));
      return;
    }

    if (command[0] === 'formula' && command[1] === 'generate') {
      printJson(formulaGenerate({
        seed: typeof args.seed === 'string' ? args.seed : undefined,
      }));
      return;
    }

    if (command[0] === 'render' && command[1] === 'thumbnail') {
      const document = await readJsonInput(typeof args.input === 'string' ? args.input : undefined);
      printJson(await renderThumbnail({
        document,
        output: typeof args.output === 'string' ? args.output : '',
        locale: typeof args.locale === 'string' ? args.locale : 'en',
        baseUrl: typeof args['base-url'] === 'string' ? args['base-url'] : undefined,
      }));
      return;
    }

    if (command[0] === 'render' && command[1] === 'screenshot') {
      const document = await readJsonInput(typeof args.input === 'string' ? args.input : undefined);
      printJson(await renderScreenshot({
        document,
        output: typeof args.output === 'string' ? args.output : '',
        locale: typeof args.locale === 'string' ? args.locale : 'en',
        baseUrl: typeof args['base-url'] === 'string' ? args['base-url'] : undefined,
      }));
      return;
    }

    if (command[0] === 'render' && command[1] === 'batch') {
      printJson(await renderBatch({
        input: readTextInput(typeof args.input === 'string' ? args.input : undefined),
        outputDir: typeof args['output-dir'] === 'string' ? args['output-dir'] : '',
        mode: args.mode === 'screenshot' ? 'screenshot' : 'thumbnail',
        locale: typeof args.locale === 'string' ? args.locale : 'en',
        baseUrl: typeof args['base-url'] === 'string' ? args['base-url'] : undefined,
      }));
      return;
    }

    if (command[0] === 'verify' && command[1] === 'preset') {
      printJson(await verifyPreset({
        id: typeof args.id === 'string' ? args.id : '',
        locale: typeof args.locale === 'string' ? args.locale : 'en',
        baseUrl: typeof args['base-url'] === 'string' ? args['base-url'] : undefined,
      }));
      return;
    }

    if (command[0] === 'verify' && command[1] === 'gallery-open') {
      printJson(await verifyGalleryOpen({
        id: typeof args.id === 'string' ? args.id : '',
        locale: typeof args.locale === 'string' ? args.locale : 'en',
        baseUrl: typeof args['base-url'] === 'string' ? args['base-url'] : undefined,
      }));
      return;
    }

    if (command[0] === 'verify' && command[1] === 'regression') {
      printJson(await verifyRegression({
        suite: typeof args.suite === 'string' ? args.suite : undefined,
        spec: typeof args.spec === 'string' ? args.spec : undefined,
        baseUrl: typeof args['base-url'] === 'string' ? args['base-url'] : undefined,
      }));
      return;
    }

    if (command[0] === 'explore' && command[1] === 'mutate') {
      const document = await readJsonInput(typeof args.input === 'string' ? args.input : undefined);
      const config = typeof args.config === 'string' ? await readJsonInput(args.config) : undefined;
      printJson(exploreMutate({ document, config }));
      return;
    }

    if (command[0] === 'explore' && command[1] === 'batch') {
      const config = await readJsonInput(typeof args.config === 'string' ? args.config : undefined);
      printJson(exploreBatch({
        config,
        outputDir: typeof args['output-dir'] === 'string' ? args['output-dir'] : '',
      }));
      return;
    }

    if (command[0] === 'explore' && command[1] === 'shard') {
      printJson(exploreShard({
        manifestPath: typeof args.manifest === 'string' ? args.manifest : '',
        shardIndex: typeof args['shard-index'] === 'string' ? Number(args['shard-index']) : NaN,
      }));
      return;
    }

    if (command[0] === 'score' && command[1] === 'batch') {
      printJson(await scoreBatch({
        input: readTextInput(typeof args.input === 'string' ? args.input : undefined),
        renderManifest: typeof args['render-manifest'] === 'string' ? args['render-manifest'] : '',
        outputDir: typeof args['output-dir'] === 'string' ? args['output-dir'] : '',
        presetsPath: typeof args.presets === 'string' ? args.presets : undefined,
      }));
      return;
    }

    if (command[0] === 'select' && command[1] === 'top') {
      printJson(selectTop({
        input: readTextInput(typeof args.input === 'string' ? args.input : undefined),
        outputDir: typeof args['output-dir'] === 'string' ? args['output-dir'] : '',
        limit: typeof args.limit === 'string' ? Number(args.limit) : undefined,
      }));
      return;
    }

    if (command[0] === 'preset' && command[1] === 'draft') {
      const inputPayload = await readJsonInput(typeof args.input === 'string' ? args.input : undefined);
      printJson(presetDraft({
        input: inputPayload,
        output: typeof args.output === 'string' ? args.output : undefined,
        locale: typeof args.locale === 'string' ? args.locale : 'en',
      }));
      return;
    }

    if (command[0] === 'report' && command[1] === 'run') {
      const selection = typeof args.selection === 'string' ? await readJsonInput(args.selection) : undefined;
      printJson(reportRun({
        input: readTextInput(typeof args.input === 'string' ? args.input : undefined),
        outputDir: typeof args['output-dir'] === 'string' ? args['output-dir'] : '',
        selection,
      }));
      return;
    }

    throw new CliCommandError('INVALID_COMMAND', 1, usage());
  } catch (error) {
    printJson(createFailure(commandLabel, error));
    process.exitCode = error instanceof CliCommandError ? error.exitCode : 3;
  }
}

void main();
