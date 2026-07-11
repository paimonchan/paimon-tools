# paimon-tools

A suite of **100% client-side** data conversion tools (JSON / CSV / Excel).
Every conversion runs in your browser — **your data is never sent anywhere**.
There is no backend, no server, no analytics.

Built with Vite + React + Tailwind CSS.

## Included tools

**Convert**
- JSON → CSV (and back)
- JSON → Excel (and back)
- CSV → Excel (and back)

**Format**
- JSON Formatter (2 / 4 / tab indentation)
- JSON Minifier

## Develop

```bash
npm install
npm run dev      # start dev server at http://localhost:5173
```

## Build

```bash
npm run build    # outputs static files to ./dist
npm run preview  # preview the production build locally
```

## Deploy to GitHub Pages

This repo is configured for one-command deployment via GitHub Actions.

### 1. Push to GitHub

Create a repository (e.g. `paimon-tools`) and push the code:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<YOUR_USER>/paimon-tools.git
git push -u origin main
```

### 2. Enable Pages (one-time)

In your repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**

That's it. The workflow in `.github/workflows/deploy.yml` will run on every
push to `main`, build the app, and publish it. Your site will be live at:

```
https://<YOUR_USER>.github.io/paimon-tools/
```

### How the base path works

`vite.config.js` sets `base: './'` so all asset URLs are relative. This means
the same build works on a project page (`user.github.io/repo/`), a custom
domain, or local preview — no path hardcoding, no rebuild needed.

## Architecture

The conversion engine (`src/lib/converters.js`) is made of **pure functions**
that take data in and return data out, touching no DOM, no network, and no
global state. This is what guarantees the privacy promise — user data has
nowhere to go from inside that module.

Each tool is a config entry in `src/lib/tools.js` wired to a generic
`ConversionTool` UI component. Adding a new tool = one config object + one
pure function.

## Dependencies

- [React](https://react.dev/) + [Vite](https://vite.dev/)
- [Tailwind CSS](https://tailwindcss.com/)
- [PapaParse](https://www.papaparse.com/) — CSV parsing
- [SheetJS](https://docs.sheetjs.com/) — Excel read/write (installed from the
  SheetJS CDN to get the patched version; the `xlsx` package on npm is frozen
  at 0.18.5 which carries a known high-severity vulnerability)

## License

MIT
