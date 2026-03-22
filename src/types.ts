export interface DataDto<T> {
  data?: T;
  meta?: MetaDto;
}

export interface MetaDto {
  total?: number;
  per_page?: number;
  has_more?: boolean;
}

export interface GenreDto {
  id?: number;
  name: string;
  slug?: string;
}

export interface MangaDto {
  id?: number;
  public_url: string;
  slug: string;
  title: string;
  cover?: string;
  cover_url?: string;
  banner?: string;
  description?: string | null;
  author?: string | null;
  artist?: string | null;
  status?: string | null;
  type?: string | null;
  chapter_count?: number;
  rating?: number;
  genres?: GenreDto[];
}

export interface MangaDetailsDto {
  series: MangaDto;
  recommended_series?: MangaDto[];
}

export interface ChapterDto {
  id?: number;
  number: number;
  slug?: string;
  title?: string | null;
  created_at?: string;
  published_at?: string;
  is_locked?: boolean;
  is_premium?: boolean;
  series_slug?: string | null;
  page_count?: number;
}

export interface ChapterListDto {
  chapters: ChapterDto[];
}

export interface PageDto {
  url: string;
  width?: number;
  height?: number;
  tiles?: number[] | null;
  tile_cols?: number | null;
  tile_rows?: number | null;
}

export interface PageListDto {
  pages: PageDto[];
}

export interface PremiumPageListDto {
  data: {
    chapter: PageListDto;
  };
}

export interface SeriesRef {
  input: string;
  apiSlug: string;
  publicSlug: string;
  url: string;
  title: string;
  author: string;
  artist: string;
  description: string;
  cover: string;
  status: string;
  genres: string[];
  chapterCount: number;
  type: string;
}

export interface CatalogFile {
  version: 1;
  generatedAt: string;
  source: {
    site: string;
    apiBaseUrl: string;
    totalSeries: number;
  };
  series: SeriesRef[];
}

export interface DownloadStateFile {
  version: 1;
  updatedAt: string;
  catalogPath?: string;
  series: Record<string, SeriesDownloadState>;
}

export interface SeriesDownloadState {
  title: string;
  apiSlug: string;
  publicSlug: string;
  status: "pending" | "partial" | "complete" | "failed";
  knownChapterCount: number;
  downloadedChapterCount: number;
  lastAttemptAt?: string;
  lastSuccessAt?: string;
  chapters: Record<string, ChapterDownloadState>;
}

export interface ChapterDownloadState {
  status: "downloaded" | "skipped" | "failed" | "planned";
  outputDir?: string;
  cbzPath?: string;
  downloadedPages: number;
  skippedPages: number;
  failedPages: number;
  usedPremium?: boolean;
  updatedAt: string;
  note?: string;
}

export interface PremiumAuth {
  cookieHeader?: string;
  accessToken?: string;
  enabled: boolean;
}

export interface SearchResult {
  results: SeriesRef[];
  hasMore: boolean;
}

export interface SChapter {
  number: number;
  numberText: string;
  title: string;
  createdAt: string;
  isLocked: boolean;
  seriesSlug: string;
  url: string;
}

export interface SPage {
  url: string;
  index: number;
  width?: number;
  height?: number;
  tiles?: number[];
  tileCols?: number;
  tileRows?: number;
}

export interface ChapterMetadata {
  series: {
    title: string;
    apiSlug: string;
    publicSlug: string;
    url: string;
  };
  chapter: {
    number: string;
    title: string;
    url: string;
    createdAt: string;
    isLocked: boolean;
    usedPremium: boolean;
  };
  pages: {
    total: number;
    downloaded: number;
    skipped: number;
    failed: number;
  };
  generatedAt: string;
}

export interface SeriesMetadata {
  series: {
    title: string;
    apiSlug: string;
    publicSlug: string;
    url: string;
    author: string;
    artist: string;
    description: string;
    cover: string;
    status: string;
    type: string;
    genres: string[];
    chapterCount: number;
  };
  chapters: {
    total: number;
    public: number;
    locked: number;
    latest?: string;
  };
  generatedAt: string;
}

export interface SessionSummaryTotals {
  downloadedChapters: number;
  skippedChapters: number;
  failedChapters: number;
  plannedChapters: number;
  downloadedPages: number;
  skippedPages: number;
  failedPages: number;
  plannedPages: number;
  cbzCreated: number;
}

export interface SessionChapterSummary {
  number: string;
  title: string;
  status: "downloaded" | "skipped" | "failed" | "planned";
  downloadedPages: number;
  skippedPages: number;
  failedPages: number;
  usedPremium?: boolean;
  outputDir?: string;
  cbzPath?: string;
  note?: string;
}

export interface SessionSeriesSummary {
  title: string;
  apiSlug: string;
  publicSlug: string;
  requestedChapters: string[];
  status: "in_progress" | "downloaded" | "skipped" | "failed" | "planned" | "partial";
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  totals: SessionSummaryTotals;
  chapters: SessionChapterSummary[];
}

export interface DownloadSessionSummary {
  version: 1;
  sessionId: string;
  mode: "download" | "catalog-download";
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  outputDir: string;
  catalogPath?: string;
  statePath?: string;
  dryRun: boolean;
  overwrite: boolean;
  writeCbz: boolean;
  concurrency: number;
  chaptersSelector?: string;
  requestedSeriesCount: number;
  startedSeriesCount: number;
  completedSeriesCount: number;
  totals: SessionSummaryTotals;
  series: SessionSeriesSummary[];
}
