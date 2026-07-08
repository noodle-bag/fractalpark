import { routing } from '@/i18n/routing';
import { SITE } from '@/lib/site';

type Args = {
  baseUrl?: string;
  endpoint?: string;
  dryRun?: boolean;
  urls: string[];
};

const DEFAULT_ENDPOINT = 'https://www.bing.com/indexnow';

function parseArgs(argv: string[]): Args {
  const args: Args = { urls: [] };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === '--dry-run') {
      args.dryRun = true;
      continue;
    }

    if (token === '--base-url') {
      args.baseUrl = argv[i + 1];
      i += 1;
      continue;
    }

    if (token === '--endpoint') {
      args.endpoint = argv[i + 1];
      i += 1;
      continue;
    }

    if (token === '--url') {
      args.urls.push(argv[i + 1]);
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  return args;
}

function buildSitemapUrls(baseUrl: string): string[] {
  const pages = ['', '/explore', '/gallery', '/about'];

  return routing.locales.flatMap((locale) =>
    pages.map((page) => `${baseUrl}/${locale}${page}`)
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const key = process.env.INDEXNOW_KEY;
  const baseUrl = (args.baseUrl ?? SITE.url).replace(/\/$/, '');
  const endpoint = args.endpoint ?? DEFAULT_ENDPOINT;
  const urlList = args.urls.length > 0 ? args.urls : buildSitemapUrls(baseUrl);

  if (!key) {
    throw new Error('INDEXNOW_KEY is required.');
  }

  const { host, origin } = new URL(baseUrl);
  const payload = {
    host,
    key,
    keyLocation: `${origin}/${key}.txt`,
    urlList,
  };

  if (args.dryRun) {
    console.log(JSON.stringify({ endpoint, payload }, null, 2));
    return;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`IndexNow submission failed: ${response.status} ${response.statusText}\n${body}`);
  }

  console.log(`Submitted ${urlList.length} URL(s) to ${endpoint}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
