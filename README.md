# asurascans-dl

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

- Bun 1.3.11+

## Install

```bash
bun install
```

The lockfile is `bun.lock`, and the repo is intended to be installed and run with Bun.

## Usage

Run directly from source:

```bash
bun run ./src/cli.ts <command>
```

Or with the package scripts:

```bash
bun run dev <command>
```

Catalog commands:

```bash
bun run dev catalog export --output asura-catalog.json
bun run dev catalog download asura-catalog.json --series pending --chapters latest-public
```

### Search

```bash
bun run dev search "iron-blooded"
```

### Info

```bash
bun run dev info revenge-of-the-iron-blooded-sword-hound
```

You can also pass a full Asura URL:

```bash
bun run dev info https://asurascans.com/comics/revenge-of-the-iron-blooded-sword-hound-7f873ca6
```

### Download

Download the latest chapter:

```bash
bun run dev download revenge-of-the-iron-blooded-sword-hound
```

Download the latest public chapter explicitly:

```bash
bun run dev download revenge-of-the-iron-blooded-sword-hound --chapters latest-public
```

Download a range:

```bash
bun run dev download revenge-of-the-iron-blooded-sword-hound --chapters 150-154
```

Download specific chapters to a custom directory:

```bash
bun run dev download revenge-of-the-iron-blooded-sword-hound --chapters 152,154 --output downloads
```

Overwrite existing files:

```bash
bun run dev download revenge-of-the-iron-blooded-sword-hound --chapters 154 --overwrite
```

Control image download concurrency:

```bash
bun run dev download revenge-of-the-iron-blooded-sword-hound --chapters 154 --concurrency 8
```

Preview the chapter resolution without writing files:

```bash
bun run dev download revenge-of-the-iron-blooded-sword-hound --chapters 150-154 --dry-run
```

Create a CBZ alongside the chapter folder:

```bash
bun run dev download revenge-of-the-iron-blooded-sword-hound --chapters 154 --cbz
```

### Catalog Snapshot And Tracking

Export the full site catalog to JSON:

```bash
bun run dev catalog export --output asura-catalog.json
```

Download from a catalog snapshot:

```bash
bun run dev catalog download asura-catalog.json --series all --chapters latest-public
```

Download only series that are not yet marked complete in the tracking state:

```bash
bun run dev catalog download asura-catalog.json --series pending --chapters all
```

## Premium Chapters

Public chapters work without authentication.

For premium chapters, pass a browser-exported `Cookie` header containing `access_token`:

```bash
bun run dev download revenge-of-the-iron-blooded-sword-hound --chapters 155 --cookie "access_token=...; other_cookie=..."
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
bun run typecheck
```

Run tests:

```bash
bun test
```

Build:

```bash
bun run build
```

Release binary build:

```bash
bun run release:build
```

Notes:

- release binaries are built with Bun and target native GitHub release artifacts for Windows and Linux
- each GitHub runner builds its own native artifact because the packaged `sharp` runtime is platform-specific
- the release binary is still a single downloadable file, but on first image-processing use it extracts the embedded `sharp` runtime to a cache directory under the system temp folder
- normal development and source usage are expected to run under Bun

## Project Notes

- `tests/fixtures/` contains captured HTML snippets used to test Astro prop parsing without relying on live network responses
