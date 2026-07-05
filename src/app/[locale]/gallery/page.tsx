import fs from 'node:fs';
import path from 'node:path';
import { registerBuiltins } from '@/engine/plugins/builtins';
import {
  builtinPresetConfigToExploreHref,
  parseGalleryPresetsFile,
  type GalleryPresetConfig,
} from '@/lib/gallery-presets';
import GalleryPageClient from '@/components/gallery/GalleryPageClient';

function loadPresetConfigs(): GalleryPresetConfig[] {
  const filePath = path.join(process.cwd(), 'public/gallery-presets.json');
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  return parseGalleryPresetsFile(data).presets;
}

export default async function GalleryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  registerBuiltins({ quiet: true });
  const presets = loadPresetConfigs();

  return (
    <>
      <section className="sr-only" aria-label="Featured fractal presets">
        <h2>Featured fractal presets</h2>
        <ul>
          {presets.map((preset) => {
            const name = locale === 'zh' && preset.nameZh ? preset.nameZh : preset.name;
            return (
              <li key={preset.id}>
                <a href={builtinPresetConfigToExploreHref(preset, locale)}>
                  {name}
                </a>
              </li>
            );
          })}
        </ul>
      </section>
      <GalleryPageClient />
    </>
  );
}
