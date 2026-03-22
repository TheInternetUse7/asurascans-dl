# asurascans-dl

CLI downloader for [Asura Scans](https://asurascans.com/).

It mirrors the Mihon/Tachiyomi extension approach:

- series search and details come from `https://api.asurascans.com/api/series`
- chapter lists and page lists come from Astro props embedded in the website HTML
- premium chapters can be fetched with a user-supplied `access_token` cookie
- scrambled pages are reconstructed with the same tile-mapping direction used by the extension

## Install

### Latest release

Latest release page:

- [github.com/TheInternetUse7/asurascans-dl/releases/latest](https://github.com/TheInternetUse7/asurascans-dl/releases/latest)

Direct latest binaries:

- Windows x64:
  [asurascans-dl-windows-x64.exe](https://github.com/TheInternetUse7/asurascans-dl/releases/latest/download/asurascans-dl-windows-x64.exe)
- Linux x64:
  [asurascans-dl-linux-x64](https://github.com/TheInternetUse7/asurascans-dl/releases/latest/download/asurascans-dl-linux-x64)

### Windows

1. Download `asurascans-dl-windows-x64.exe`.
2. Rename it to `asurascans-dl.exe` if you want a shorter command.
3. Put it in a folder you keep for local tools, for example `C:\Tools\asurascans-dl\`.
4. Add that folder to your `PATH` if it is not already there.
5. Open a new terminal and run:

```powershell
asurascans-dl --version
asurascans-dl --help
```

### Linux

1. Download `asurascans-dl-linux-x64`.
2. Rename it to `asurascans-dl` if you want a shorter command.
3. Mark it executable:

```bash
chmod +x asurascans-dl
```

4. Move it into a directory on your `PATH`, for example:

```bash
mkdir -p ~/.local/bin
mv asurascans-dl ~/.local/bin/asurascans-dl
```

5. Make sure `~/.local/bin` is on your `PATH`, then run:

```bash
asurascans-dl --version
asurascans-dl --help
```

## CLI

Global commands:

```text
asurascans-dl --help
asurascans-dl --version
```

Main commands:

```text
asurascans-dl search <query>
asurascans-dl info <slug-or-url>
asurascans-dl download <slug-or-url> [options]
asurascans-dl catalog export [options]
asurascans-dl catalog download <catalog-file> [options]
```

## Functionality

### `search`

Find a series by title or slug-like query.

```bash
asurascans-dl search "iron-blooded"
asurascans-dl search "iron blooded"
```

Output includes:

- title
- API slug
- public slug
- status
- chapter count

### `info`

Inspect a series and resolve identifiers.

Accepted inputs:

- API slug
- public slug
- full Asura URL

Examples:

```bash
asurascans-dl info revenge-of-the-iron-blooded-sword-hound
asurascans-dl info https://asurascans.com/comics/revenge-of-the-iron-blooded-sword-hound-7f873ca6
```

Output includes:

- normalized API/public slugs
- canonical URL
- author / artist / status / type / genres
- total chapters
- public chapter count
- locked chapter count
- latest chapter

### `download`

Download one series directly from a slug or URL.

Examples:

```bash
asurascans-dl download revenge-of-the-iron-blooded-sword-hound
asurascans-dl download revenge-of-the-iron-blooded-sword-hound --chapters latest-public
asurascans-dl download revenge-of-the-iron-blooded-sword-hound --chapters 150-154
asurascans-dl download revenge-of-the-iron-blooded-sword-hound --chapters 152,154 --output downloads
asurascans-dl download revenge-of-the-iron-blooded-sword-hound --chapters 154 --overwrite
asurascans-dl download revenge-of-the-iron-blooded-sword-hound --chapters 154 --concurrency 4
asurascans-dl download revenge-of-the-iron-blooded-sword-hound --chapters 150-154 --dry-run
asurascans-dl download revenge-of-the-iron-blooded-sword-hound --chapters 154 --cbz
```

Options:

- `--chapters <selector>`
- `--output <dir>`
- `--concurrency <n>`
- `--cookie <header>`
- `--overwrite`
- `--dry-run`
- `--cbz`

### Chapter selectors

Supported selectors:

- `all`
- `latest`
- `latest-public`
- single chapter number like `154`
- comma-separated list like `152,154`
- inclusive range like `150-154`
- mixed selectors like `150-152,154`

Default behavior:

- without premium auth: defaults to `latest-public`
- with premium auth: defaults to `latest`

### Premium chapters

Public chapters work without authentication.

Premium chapters require a browser-exported `Cookie` header that contains `access_token`.

Example:

```bash
asurascans-dl download revenge-of-the-iron-blooded-sword-hound --chapters 155 --cookie "access_token=...; other_cookie=..."
```

Notes:

- the tool does not log in for you
- if a chapter is locked and no valid `access_token` is available, it is skipped
- premium fetching depends on current Asura site/API behavior

### `catalog export`

Export the full series catalog to JSON.

```bash
asurascans-dl catalog export --output asura-catalog.json
```

The catalog file is a snapshot of the site series list and does not store download progress.

### `catalog download`

Download from a previously exported catalog file.

Examples:

```bash
asurascans-dl catalog download asura-catalog.json --series all --chapters latest-public
asurascans-dl catalog download asura-catalog.json --series pending --chapters all
asurascans-dl catalog download asura-catalog.json --series revenge-of-the-iron-blooded-sword-hound
asurascans-dl catalog download asura-catalog.json --state asura-catalog.state.json --output downloads
```

Additional options:

- `--series <selector>`
- `--state <file>`

`--series` supports:

- `all`
- `pending`
- comma-separated API/public slugs

### Progress and retry behavior

During interactive downloads, each chapter shows a single in-place progress line:

```text
Downloading Chapter 154 [7/14]
```

Retry behavior:

- transient HTTP failures are retried automatically
- `429` responses honor `Retry-After` when present
- rate limiting triggers a shared cooldown so later requests stop hammering the site
- failed transient page downloads get additional low-concurrency recovery passes

## Output

Base output layout:

```text
<output>/<series title>/
```

Files written:

- `series.json`
- `download-session-<timestamp>.json`
- chapter folders or CBZ files depending on mode

### Normal image output

Without `--cbz`, each chapter is written as:

```text
<output>/<series title>/Chapter <n>/
```

That chapter directory contains:

- page images
- `chapter.json`

Direct image pages keep their original extension when possible. Reconstructed tiled pages are written as `.webp`.

### CBZ output

With `--cbz`, the chapter folder is temporary staging only.

Final output keeps:

- `Chapter <n>.cbz`
- `Chapter <n>.json`

The extracted image folder is removed after the archive is created.

Reruns skip chapters whose `.cbz` already exists unless `--overwrite` is set.

### Tracking and session files

Catalog-driven downloads keep progress in a separate `.state.json` file so the catalog snapshot stays immutable.

Non-dry-run download sessions also write a session summary file:

```text
download-session-<timestamp>.json
```

This file is updated throughout the run and includes:

- session settings
- aggregate totals
- per-series results
- per-chapter results
- output paths

It is especially useful for long catalog runs that get interrupted.

## Development

Development uses Bun.

Install dependencies:

```bash
bun install
```

Run from source:

```bash
bun run ./src/cli.ts --help
```

Common development commands:

```bash
bun run typecheck
bun test
bun run build
bun run release:build
```

## Notes

- release binaries are built with Bun on GitHub Actions for Windows and Linux
- the release binary is still a single downloadable file, but on first image-processing use it extracts the embedded `sharp` runtime into the system temp directory
- `tests/fixtures/` contains captured HTML snippets used to test Astro prop parsing without depending on live network responses
