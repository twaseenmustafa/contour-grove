# Development

Contour Grove is a browser-based React, TypeScript and Vite app. Drawing, tracing and project storage run in the browser; there is no separate account service or hosted backend.

## Run locally

Install [Node.js](https://nodejs.org/) and npm. The project has been tested with Node.js 24.

```bash
npm ci
npm run dev
```

Open the local address shown in the terminal. To create a production build, run `npm run build`; the files are written to `dist/`.

## Check your changes

```bash
npm run format:check
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

Browser tests use Playwright and an installed Chrome. Some write screenshots to `.internal_docs/verifications/`; create that folder if needed. More real-device, accessibility, security and large-document testing is still needed.

## Contribute

Ideas and contributions are welcome. For a larger change, [open an issue](https://github.com/twaseenmustafa/contour-grove/issues) first to discuss the approach. For a bug, share what you did, what you expected, what happened and which browser you used. Please leave out private artwork and information.

Contour Grove is available under the [MIT License](../LICENSE). Third-party dependencies have their own licenses; Paper.js attribution is in `public/licenses/`.

[← Back to Contour Grove](../README.md)
