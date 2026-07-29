# JSONmate

A JSON formatter, validator, and multi-format converter — runs entirely in your browser, no build step, no backend, no dependencies.

Live at: https://heningdian.github.io/JSONmate/

## Features

- Format (pretty-print) with 2-space, 4-space, or tab indentation
- Minify
- Validate with line/column error reporting
- Syntax-highlighted output and collapsible tree view
- Search output by plain text or JSONPath (e.g. `$.users[*].name`)
- JSON Schema validation (draft-07 style subset)
- Diff / compare two JSON values
- Copy output to clipboard, download as `.json`
- Convert other file types to JSON via Open File / drag-and-drop:
  JSON, CSV, TSV, XML, YAML, INI/CONF, TXT, LOG, Markdown, HTML,
  SRT, VTT, RTF, DOCX, PDF
- Export the current JSON back to CSV, TSV, XML, YAML, INI, plain
  text, HTML, or Markdown

## Privacy

Everything runs client-side, in your browser tab. This app makes **no
network requests** — no fetch/XHR/WebSocket calls, no analytics, no
telemetry, no form submissions. Files you open, paste, or convert are
never uploaded, transmitted, or persisted anywhere; they exist only in
page memory for as long as the tab is open. This is enforced by the
app's architecture (a static HTML/CSS/JS bundle with zero external
calls) rather than a policy promise — see the invariant comment at the
top of `app.js`.

The GitHub Actions workflow in `.github/workflows/pages.yml` only
deploys this repository's own source files (`index.html`, `style.css`,
`app.js`) to GitHub Pages; it has no connection to, and never sees,
anything a visitor opens in their browser.

## Usage

Open `index.html` in a browser, or serve the directory locally:

```
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.
