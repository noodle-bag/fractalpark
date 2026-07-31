<!-- BEGIN GENERATED public-project -->

# FractalPark

FractalPark is an open-source, formula-first fractal knowledge and creation platform with growing Fractint-compatible FRM support, working to bring Fractint’s formula heritage into the modern browser.

![The Mandelbrot set rendered in real time by the FractalPark WebGL engine](public/images/formulas/guides/mandelbrot.jpg)

**[Open Explore](https://www.fractalpark.com/en/explore) · [Browse the Formula Atlas](https://www.fractalpark.com/en/formulas) · [Read the FRM Guide](https://www.fractalpark.com/en/formulas/frm) · [Visit the Gallery](https://www.fractalpark.com/en/gallery)**

## Available today

- **Discover formulas** — Browse the Formula Atlas: 94 built-in formulas across 7 families, with 21 in-depth Formula Guides covering the math, history, and visual character of the classics.
- **Create in the browser** — Explore and render in real time with WebGL: Mandelbrot and Julia modes for every formula, 7 transforms, 9 coloring modes, gradients, lighting, and keyframe animation.
- **Author FRM** — Write custom formulas in the Fractint-compatible FRM language with the Guide and standalone Editor: AST validation, live GLSL preview, and clear diagnostics.
- **Save and export** — Save artworks on this device, restore exact views from shareable URLs, and export high-resolution PNG images up to 4× with SSAA anti-aliasing.

## Current boundaries

- Growing Fractint-compatible FRM support: a practical, tested subset of the Fractint formula language runs today — not a complete Fractint reimplementation.
- Artworks and custom formulas are stored locally on your device. There are no accounts, no cloud sync, and no server-side sharing.
- The interface is bilingual in English and Simplified Chinese.

On the roadmap (not released):

- Working to bring Fractint’s historical formula archive into the modern browser over time.
- Deeper coloring, animation, and zoom capabilities are on the roadmap but not released.

FractalPark is released under the [MIT License](https://opensource.org/license/mit).

<!-- END GENERATED public-project -->

## Getting Started

```bash
git clone https://github.com/noodle-bag/fractalpark.git
cd fractalpark
npm install
npm run dev
```

Open `http://localhost:3000` in your browser.

## Scripts

```bash
npm run dev       # Start the development server
npm run build     # Create a production build
npm run start     # Start the production server
npm run lint      # Run ESLint
npm run test:run  # Run Vitest once
```

## Project Layout

```text
docs/              Architecture specifications, ADRs, and release test plans
messages/          UI translations
public/            Static assets and gallery preset data
src/app/           Next.js routes
src/components/    React UI components
src/engine/        WebGL rendering engine and shader assembly
src/hooks/         React hooks for renderer, gallery, animation, and UI state
src/lib/           Shared utilities
src/test/          Vitest tests
tests/e2e/         Playwright smoke tests
```

## Architecture and Specifications

See the [documentation index](docs/README.md) for the durable Document format,
cross-surface content model, architecture decisions, and active release
regression plans.

## License

FractalPark is released under the MIT License. See [LICENSE](LICENSE).
