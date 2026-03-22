import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ASURA_API_BASE_URL, requestJson } from "./http.js";
import type { CatalogFile, DataDto, MangaDto, SeriesRef } from "./types.js";

const SERIES_API_URL = `${ASURA_API_BASE_URL}/series`;
const DEFAULT_PAGE_SIZE = 100;

function extractPublicSlug(publicUrl: string): string {
  const segments = publicUrl.split("/").filter(Boolean);
  if (segments.length === 0) {
    throw new Error(`Invalid public URL: ${publicUrl}`);
  }

  return segments[segments.length - 1];
}

function toSeriesRef(dto: MangaDto): SeriesRef {
  const publicSlug = extractPublicSlug(dto.public_url);

  return {
    input: dto.slug,
    apiSlug: dto.slug,
    publicSlug,
    url: `https://asurascans.com/comics/${publicSlug}`,
    title: dto.title,
    author: dto.author ?? "",
    artist: dto.artist ?? "",
    description: dto.description ?? "",
    cover: dto.cover ?? dto.cover_url ?? "",
    status: dto.status ?? "unknown",
    genres: dto.genres?.map((genre) => genre.name) ?? [],
    chapterCount: dto.chapter_count ?? 0,
    type: dto.type ?? "",
  };
}

export function getNextCatalogOffset(
  currentOffset: number,
  batchSize: number,
  meta?: DataDto<MangaDto[]>["meta"],
): number {
  const serverPageSize = meta?.per_page;
  if (typeof serverPageSize === "number" && serverPageSize > 0) {
    return currentOffset + serverPageSize;
  }

  if (batchSize > 0) {
    return currentOffset + batchSize;
  }

  return currentOffset;
}

export async function fetchAllSeriesCatalog(): Promise<CatalogFile> {
  const seen = new Set<string>();
  const results: SeriesRef[] = [];
  let offset = 0;
  let hasMore = true;
  let expectedTotal: number | undefined;

  while (hasMore) {
    const url = new URL(SERIES_API_URL);
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("limit", String(DEFAULT_PAGE_SIZE));
    url.searchParams.set("sort", "title");
    url.searchParams.set("order", "asc");

    const json = await requestJson<DataDto<MangaDto[]>>(url, {}, { throttled: true });
    const batch = json.data ?? [];
    expectedTotal = typeof json.meta?.total === "number" ? json.meta.total : expectedTotal;

    for (const dto of batch) {
      if (seen.has(dto.slug)) {
        continue;
      }

      seen.add(dto.slug);
      results.push(toSeriesRef(dto));
    }

    const nextOffset = getNextCatalogOffset(offset, batch.length, json.meta);
    const reachedExpectedTotal = typeof expectedTotal === "number" && results.length >= expectedTotal;
    const exhaustedPage = batch.length === 0 || nextOffset === offset;

    hasMore = (json.meta?.has_more ?? false) && !reachedExpectedTotal && !exhaustedPage;
    offset = nextOffset;
  }

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: {
      site: "Asura Scans",
      apiBaseUrl: ASURA_API_BASE_URL,
      totalSeries: results.length,
    },
    series: results,
  };
}

export async function writeCatalogFile(outputPath: string, catalog: CatalogFile): Promise<string> {
  const resolvedPath = path.resolve(outputPath);
  await mkdir(path.dirname(resolvedPath), { recursive: true });
  await writeFile(resolvedPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  return resolvedPath;
}

export async function readCatalogFile(catalogPath: string): Promise<CatalogFile> {
  const contents = await readFile(path.resolve(catalogPath), "utf8");
  return JSON.parse(contents) as CatalogFile;
}

export function selectCatalogSeries(
  catalog: CatalogFile,
  selector: string | undefined,
  completedSeries = new Set<string>(),
): SeriesRef[] {
  const normalized = selector?.trim().toLowerCase() ?? "all";

  if (normalized === "all") {
    return catalog.series;
  }

  if (normalized === "pending") {
    return catalog.series.filter((series) => !completedSeries.has(series.apiSlug));
  }

  const wanted = new Set(
    normalized
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  );

  return catalog.series.filter((series) => {
    return wanted.has(series.apiSlug.toLowerCase()) || wanted.has(series.publicSlug.toLowerCase());
  });
}
