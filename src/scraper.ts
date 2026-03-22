import * as cheerio from "cheerio";
import { ASURA_API_BASE_URL, ASURA_BASE_URL, requestJson, requestText } from "./http.js";
import type {
  ChapterDto,
  ChapterListDto,
  PageDto,
  PageListDto,
  PremiumAuth,
  PremiumPageListDto,
  SChapter,
  SPage,
  SeriesRef,
} from "./types.js";

const PAGE_TOKEN_REGEX = /pageToken\*=\*"([^"]+)"/;
const FALLBACK_PAGE_TOKEN = "asura-reader-2026";

export class PremiumChapterError extends Error {
  constructor(chapterNumber: string) {
    super(`Chapter ${chapterNumber} requires premium access.`);
    this.name = "PremiumChapterError";
  }
}

function formatChapterNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value);
}

function toSChapter(chapter: ChapterDto): SChapter {
  const numberText = formatChapterNumber(chapter.number);

  return {
    number: chapter.number,
    numberText,
    title: chapter.title?.trim() ?? "",
    createdAt: chapter.published_at ?? chapter.created_at ?? "",
    isLocked: chapter.is_locked ?? chapter.is_premium ?? false,
    seriesSlug: chapter.series_slug ?? "",
    url: `/series/${chapter.series_slug ?? ""}/chapter/${numberText}`,
  };
}

function toSPage(page: PageDto, index: number): SPage {
  return {
    url: page.url,
    index,
    width: page.width,
    height: page.height,
    tiles: page.tiles ?? undefined,
    tileCols: page.tile_cols ?? undefined,
    tileRows: page.tile_rows ?? undefined,
  };
}

function parseAstroValue(raw: string): unknown {
  try {
    return unwrapAstroValue(JSON.parse(raw));
  } catch {
    // Astro props may arrive HTML-escaped in attributes, so retry after URI decoding.
    return unwrapAstroValue(JSON.parse(decodeURIComponent(raw)));
  }
}

export function unwrapAstroValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    if (value.length === 2 && isAstroWrapperHead(value[0])) {
      // Mihon recursively unwraps Astro's `[tag, value]` encoding until plain JSON remains.
      return unwrapAstroValue(value[1]);
    }

    return value.map((entry) => unwrapAstroValue(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, unwrapAstroValue(entry)]),
    );
  }

  return value;
}

function isAstroWrapperHead(value: unknown): boolean {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

export function extractAstroPropFromHtml<T>(html: string, key: string): T {
  const $ = cheerio.load(html);
  const prop = $(`[props*="${key}"]`).first().attr("props");

  if (!prop) {
    throw new Error(`Unable to find Astro prop "${key}".`);
  }

  return parseAstroValue(prop) as T;
}

export function extractPageToken(html: string): string | undefined {
  return PAGE_TOKEN_REGEX.exec(html)?.[1];
}

export async function fetchChapterList(series: SeriesRef): Promise<SChapter[]> {
  const html = await requestText(`${ASURA_BASE_URL}/comics/${series.publicSlug}`, {}, { throttled: true });
  const chapterList = extractAstroPropFromHtml<ChapterListDto>(html, "chapters");

  return chapterList.chapters.map((chapter) => toSChapter(chapter));
}

async function fetchPremiumPages(
  series: SeriesRef,
  chapter: SChapter,
  auth: PremiumAuth,
  pageToken: string,
): Promise<SPage[]> {
  const json = await requestJson<PremiumPageListDto>(
    `${ASURA_API_BASE_URL}/series/${series.publicSlug}/chapters/${chapter.numberText}`,
    {
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
        Cookie: auth.cookieHeader ?? "",
        "X-Page-Token": pageToken,
      },
    },
    { throttled: true },
  );

  return json.data.chapter.pages.map((page, index) => toSPage(page, index));
}

export async function fetchChapterPages(
  series: SeriesRef,
  chapter: SChapter,
  auth: PremiumAuth,
): Promise<{ pages: SPage[]; usedPremium: boolean }> {
  const html = await requestText(
    `${ASURA_BASE_URL}/comics/${series.publicSlug}/chapter/${chapter.numberText}`,
    {
      headers: auth.cookieHeader ? { Cookie: auth.cookieHeader } : undefined,
    },
    { throttled: true },
  );

  const pageList = extractAstroPropFromHtml<PageListDto>(html, "pages");
  if (pageList.pages.length > 0) {
    return {
      pages: pageList.pages.map((page, index) => toSPage(page, index)),
      usedPremium: false,
    };
  }

  if (!auth.enabled || !auth.accessToken) {
    throw new PremiumChapterError(chapter.numberText);
  }

  // Public chapters expose page data directly in HTML; premium chapters require the follow-up API call.
  const pageToken = extractPageToken(html) ?? FALLBACK_PAGE_TOKEN;
  const pages = await fetchPremiumPages(series, chapter, auth, pageToken);

  return {
    pages,
    usedPremium: true,
  };
}
