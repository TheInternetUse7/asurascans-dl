import {
  ASURA_API_BASE_URL,
  ASURA_BASE_URL,
  requestJson,
} from "./http.js";
import type {
  DataDto,
  MangaDetailsDto,
  MangaDto,
  SearchResult,
  SeriesRef,
} from "./types.js";

const SERIES_API_URL = `${ASURA_API_BASE_URL}/series`;
const OLD_FORMAT_MANGA_REGEX = /^\/manga\/(\d+-)?([^/]+)\/?$/;

export function extractSeriesCandidate(input: string): string {
  const trimmed = input.trim();

  if (!trimmed) {
    throw new Error("A manga slug or URL is required.");
  }

  try {
    const url = new URL(trimmed);
    const oldFormatMatch = OLD_FORMAT_MANGA_REGEX.exec(url.pathname);
    if (oldFormatMatch) {
      // Mihon kept legacy `/manga/...` bookmarks alive; accept them here too.
      return oldFormatMatch[2];
    }

    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length === 0) {
      throw new Error("URL does not contain a series slug.");
    }

    if ((segments[0] === "comics" || segments[0] === "series") && segments[1]) {
      return segments[1];
    }

    return segments[segments.length - 1];
  } catch {
    const oldFormatMatch = OLD_FORMAT_MANGA_REGEX.exec(trimmed);
    if (oldFormatMatch) {
      return oldFormatMatch[2];
    }

    return trimmed.replace(/^\/+|\/+$/g, "");
  }
}

export function extractPublicSlug(publicUrl: string): string {
  const segments = publicUrl.split("/").filter(Boolean);
  if (segments.length === 0) {
    throw new Error(`Invalid public URL: ${publicUrl}`);
  }
  return segments[segments.length - 1];
}

function toSeriesRef(dto: MangaDto, input: string): SeriesRef {
  const publicSlug = extractPublicSlug(dto.public_url);

  return {
    input,
    apiSlug: dto.slug,
    publicSlug,
    url: `${ASURA_BASE_URL}/comics/${publicSlug}`,
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

function unwrapSeriesDetailsResponse(json: DataDto<MangaDetailsDto> | MangaDetailsDto): MangaDto {
  if ("data" in json && json.data?.series) {
    // The API alternates between wrapped and direct payloads depending on endpoint/version.
    return json.data.series;
  }

  if ("series" in json) {
    return json.series;
  }

  throw new Error("Series details response did not contain a series payload.");
}

export async function searchSeries(
  query: string,
  offset = 0,
  limit = 10,
): Promise<SearchResult> {
  const url = new URL(SERIES_API_URL);
  url.searchParams.set("search", query);
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("limit", String(limit));

  const json = await requestJson<DataDto<MangaDto[]>>(url, {}, { throttled: true });
  const results = (json.data ?? []).map((dto) => toSeriesRef(dto, dto.slug));

  return {
    results,
    hasMore: json.meta?.has_more ?? false,
  };
}

export async function getSeriesDetails(identifier: string): Promise<SeriesRef> {
  const json = await requestJson<DataDto<MangaDetailsDto> | MangaDetailsDto>(
    `${SERIES_API_URL}/${identifier}`,
    {},
    { throttled: true },
  );

  const dto = unwrapSeriesDetailsResponse(json);
  return toSeriesRef(dto, identifier);
}

export async function resolveSeries(input: string): Promise<SeriesRef> {
  const candidate = extractSeriesCandidate(input);

  try {
    return await getSeriesDetails(candidate);
  } catch (error) {
    throw new Error(
      `Unable to resolve "${input}" to an Asura series. ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
