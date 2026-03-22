# asurascan-dl

CLI tool to search, inspect, and download manhwa chapters from [Asura Scans](https://asurascans.com/).

This implementation mirrors the Mihon/Tachiyomi extension approach:

- series search and metadata come from `https://api.asurascans.com/api/series`
- chapter lists and public page lists are extracted from Astro props in the website HTML
- premium chapters can be fetched with a user-supplied `access_token` cookie
- scrambled page images are reconstructed with the same tile-mapping direction used by the extension

## Features

- `search <query>` to find series
- `info <slug-or-url>` to inspect a series and count public vs locked chapters
- `download <slug-or-url>` to download selected chapters
- chapter selectors: `all`, `latest`, `latest-public`, single chapter, comma-separated list, or inclusive ranges like `150-154`
- resume behavior by skipping files that already exist unless `--overwrite` is set
- raw image output organized by manga title and chapter
- optional CBZ packaging for downloaded chapters
- optional dry-run mode to preview downloads without writing files

## Requirements

- Node.js 22+
- npm

## Install

```bash
npm install
```

## Usage

Run directly from source:

```bash
node --import tsx src/cli.ts <command>
```

Or with the npm aliases:

```bash
npm run dev -- <command>
```

Catalog commands:

```bash
npm run dev -- catalog export --output _internal/asura-catalog.json
npm run dev -- catalog download _internal/asura-catalog.json --series pending --chapters latest-public
```

### Search

```bash
npm run dev -- search "iron-blooded"
```

### Info

```bash
npm run dev -- info revenge-of-the-iron-blooded-sword-hound
```

You can also pass a full Asura URL:

```bash
npm run dev -- info https://asurascans.com/comics/revenge-of-the-iron-blooded-sword-hound-7f873ca6
```

### Download

Download the latest chapter:

```bash
npm run dev -- download revenge-of-the-iron-blooded-sword-hound
```

Download the latest public chapter explicitly:

```bash
npm run dev -- download revenge-of-the-iron-blooded-sword-hound --chapters latest-public
```

Download a range:

```bash
npm run dev -- download revenge-of-the-iron-blooded-sword-hound --chapters 150-154
```

Download specific chapters to a custom directory:

```bash
npm run dev -- download revenge-of-the-iron-blooded-sword-hound --chapters 152,154 --output downloads
```

Overwrite existing files:

```bash
npm run dev -- download revenge-of-the-iron-blooded-sword-hound --chapters 154 --overwrite
```

Control image download concurrency:

```bash
npm run dev -- download revenge-of-the-iron-blooded-sword-hound --chapters 154 --concurrency 8
```

Preview the chapter resolution without writing files:

```bash
npm run dev -- download revenge-of-the-iron-blooded-sword-hound --chapters 150-154 --dry-run
```

Create a CBZ alongside the chapter folder:

```bash
npm run dev -- download revenge-of-the-iron-blooded-sword-hound --chapters 154 --cbz
```

### Catalog Snapshot And Tracking

Export the full site catalog to JSON:

```bash
npm run dev -- catalog export --output _internal/asura-catalog.json
```

Download from a catalog snapshot:

```bash
npm run dev -- catalog download _internal/asura-catalog.json --series all --chapters latest-public
```

Download only series that are not yet marked complete in the tracking state:

```bash
npm run dev -- catalog download _internal/asura-catalog.json --series pending --chapters all
```

## Premium Chapters

Public chapters work without authentication.

For premium chapters, pass a browser-exported `Cookie` header containing `access_token`:

```bash
npm run dev -- download revenge-of-the-iron-blooded-sword-hound --chapters 155 --cookie "access_token=...; other_cookie=..."
```

Notes:

- the tool does not implement account login
- if a requested chapter is locked and no valid `access_token` is provided, it is skipped and reported in the summary
- premium download support depends on the current Asura site/API behavior

## Output Layout

Downloads are written to:

```text
<output>/<manga title>/Chapter <chapter-number>/
```

Example:

```text
downloads/Revenge of the Iron-Blooded Sword Hound/Chapter 154/001.webp
```

Direct image pages keep their original extension when possible. Reconstructed tiled pages are written as `.webp`.
Each downloaded chapter also gets a `chapter.json` file with source and result metadata.
Each series directory gets a `series.json` file with normalized series metadata and chapter counts.
If `--cbz` is enabled, each chapter folder also gets a sibling `.cbz` archive containing only page images.
Catalog exports are written as standalone snapshot JSON files.
Catalog-driven downloads keep progress in a separate `.state.json` file so the snapshot stays immutable.

## Development

Type-check:

```bash
npm run typecheck
```

Run tests:

```bash
npm test
```

Build:

```bash
npm run build
```

## Project Notes

- `tests/fixtures/` contains captured HTML snippets used to test Astro prop parsing without relying on live network responses
