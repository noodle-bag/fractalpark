# FractalPark

FractalPark is a browser-based fractal art explorer for creating, tuning, saving, and exporting mathematical fractal images. It renders in real time with WebGL and includes built-in formula presets, custom formula editing, transform controls, coloring modes, gallery presets, and shareable URLs.

[Try FractalPark online](https://www.fractalpark.com)

## Features

- Real-time WebGL rendering for Mandelbrot, Julia, Newton, Phoenix, Magnet, McMullen, rational, and transcendental fractal families.
- Custom formula editor with Fractint-style `.frm` entry support and FractalPark native directives.
- Transform controls, coloring modes, gradients, supersampling, distance estimation, and lighting options.
- Built-in gallery presets plus a local browser gallery for user-saved fractals.
- URL-serializable state for sharing and restoring exact views.
- High-resolution PNG export.
- Internationalized UI with English and Chinese locales.

## Tech Stack

- Next.js 16 App Router
- React 19
- TypeScript 5
- WebGL 1 and GLSL fragment shaders
- Tailwind CSS 4
- next-intl
- Vitest and Playwright

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

## License

FractalPark is released under the MIT License. See [LICENSE](LICENSE).
