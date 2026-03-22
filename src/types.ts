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
