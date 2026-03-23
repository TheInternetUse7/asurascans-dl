import path from "node:path";
import { writeFileAtomically } from "./atomic-write.js";
import type { TrackedChapterResult } from "./tracking.js";
import type {
  DownloadSessionSummary,
  SessionSeriesSummary,
  SessionSummaryTotals,
  SeriesRef,
} from "./types.js";

export interface SessionSeriesSnapshot {
  series: SeriesRef;
  selectedChapterNumbers: string[];
  chapterResults: TrackedChapterResult[];
  totals: SessionSummaryTotals;
  completed: boolean;
  note?: string;
}

export interface CreateSessionSummaryOptions {
  mode: "download" | "catalog-download";
  outputDir: string;
  concurrency: number;
  dryRun: boolean;
  overwrite: boolean;
  writeCbz: boolean;
  chaptersSelector?: string;
  requestedSeriesCount: number;
  catalogPath?: string;
  statePath?: string;
  startedAt?: string;
}

export function createEmptySessionTotals(): SessionSummaryTotals {
  return {
    downloadedChapters: 0,
    skippedChapters: 0,
    failedChapters: 0,
    plannedChapters: 0,
    downloadedPages: 0,
    skippedPages: 0,
    failedPages: 0,
    plannedPages: 0,
    cbzCreated: 0,
  };
}

function buildSessionId(startedAt: string): string {
  return startedAt.replace(/[-:.]/g, "").replace("T", "-").replace("Z", "Z");
}

export function getDefaultSessionSummaryPath(outputDir: string, startedAt: string): string {
  const sessionId = buildSessionId(startedAt);
  return path.join(path.resolve(outputDir), `download-session-${sessionId}.json`);
}

export function createSessionSummary(options: CreateSessionSummaryOptions): DownloadSessionSummary {
  const startedAt = options.startedAt ?? new Date().toISOString();
  return {
    version: 1,
    sessionId: buildSessionId(startedAt),
    mode: options.mode,
    startedAt,
    updatedAt: startedAt,
    outputDir: path.resolve(options.outputDir),
    catalogPath: options.catalogPath ? path.resolve(options.catalogPath) : undefined,
    statePath: options.statePath ? path.resolve(options.statePath) : undefined,
    dryRun: options.dryRun,
    overwrite: options.overwrite,
    writeCbz: options.writeCbz,
    concurrency: options.concurrency,
    chaptersSelector: options.chaptersSelector,
    requestedSeriesCount: options.requestedSeriesCount,
    startedSeriesCount: 0,
    completedSeriesCount: 0,
    totals: createEmptySessionTotals(),
    series: [],
  };
}

function deriveSeriesStatus(seriesSummary: SessionSeriesSummary, completed: boolean): SessionSeriesSummary["status"] {
  const totals = seriesSummary.totals;
  const requestedCount = seriesSummary.requestedChapters.length;

  if (!completed) {
    return "in_progress";
  }

  if (totals.plannedChapters > 0 && totals.downloadedChapters === 0 && totals.failedChapters === 0 && totals.skippedChapters === 0) {
    return "planned";
  }

  if (requestedCount > 0 && totals.downloadedChapters === requestedCount && totals.failedChapters === 0 && totals.skippedChapters === 0) {
    return "downloaded";
  }

  if (requestedCount > 0 && totals.skippedChapters === requestedCount && totals.downloadedChapters === 0 && totals.failedChapters === 0) {
    return "skipped";
  }

  if (requestedCount > 0 && totals.failedChapters === requestedCount && totals.downloadedChapters === 0 && totals.skippedChapters === 0) {
    return "failed";
  }

  return "partial";
}

function recomputeSessionTotals(seriesSummaries: SessionSeriesSummary[]): SessionSummaryTotals {
  const totals = createEmptySessionTotals();

  for (const seriesSummary of seriesSummaries) {
    totals.downloadedChapters += seriesSummary.totals.downloadedChapters;
    totals.skippedChapters += seriesSummary.totals.skippedChapters;
    totals.failedChapters += seriesSummary.totals.failedChapters;
    totals.plannedChapters += seriesSummary.totals.plannedChapters;
    totals.downloadedPages += seriesSummary.totals.downloadedPages;
    totals.skippedPages += seriesSummary.totals.skippedPages;
    totals.failedPages += seriesSummary.totals.failedPages;
    totals.plannedPages += seriesSummary.totals.plannedPages;
    totals.cbzCreated += seriesSummary.totals.cbzCreated;
  }

  return totals;
}

export function updateSessionSummary(
  session: DownloadSessionSummary,
  snapshot: SessionSeriesSnapshot,
  now = new Date().toISOString(),
): DownloadSessionSummary {
  const existingIndex = session.series.findIndex((entry) => entry.apiSlug === snapshot.series.apiSlug);
  const previousStartedAt = existingIndex >= 0 ? session.series[existingIndex]?.startedAt : now;

  const seriesSummary: SessionSeriesSummary = {
    title: snapshot.series.title,
    apiSlug: snapshot.series.apiSlug,
    publicSlug: snapshot.series.publicSlug,
    requestedChapters: snapshot.selectedChapterNumbers,
    status: "in_progress",
    startedAt: previousStartedAt ?? now,
    updatedAt: now,
    completedAt: snapshot.completed ? now : undefined,
    note: snapshot.note,
    totals: { ...snapshot.totals },
    chapters: snapshot.chapterResults.map((result) => ({
      number: result.chapter.numberText,
      title: result.chapter.title,
      status: result.status,
      downloadedPages: result.downloadedPages,
      skippedPages: result.skippedPages,
      failedPages: result.failedPages,
      usedPremium: result.usedPremium,
      outputDir: result.outputDir,
      cbzPath: result.cbzPath,
      note: result.note,
    })),
  };

  seriesSummary.status = deriveSeriesStatus(seriesSummary, snapshot.completed);

  if (existingIndex >= 0) {
    session.series[existingIndex] = seriesSummary;
  } else {
    session.series.push(seriesSummary);
  }

  session.updatedAt = now;
  session.startedSeriesCount = session.series.length;
  session.completedSeriesCount = session.series.filter((entry) => entry.completedAt).length;
  session.totals = recomputeSessionTotals(session.series);
  return session;
}

export function completeSessionSummary(session: DownloadSessionSummary, now = new Date().toISOString()): DownloadSessionSummary {
  session.updatedAt = now;
  session.completedAt = now;
  return session;
}

export function recordFailedSessionSeries(
  session: DownloadSessionSummary,
  series: SeriesRef,
  note: string,
  now = new Date().toISOString(),
): DownloadSessionSummary {
  const existingIndex = session.series.findIndex((entry) => entry.apiSlug === series.apiSlug);
  const previousStartedAt = existingIndex >= 0 ? session.series[existingIndex]?.startedAt : now;

  const seriesSummary: SessionSeriesSummary = {
    title: series.title,
    apiSlug: series.apiSlug,
    publicSlug: series.publicSlug,
    requestedChapters: [],
    status: "failed",
    startedAt: previousStartedAt ?? now,
    updatedAt: now,
    completedAt: now,
    note,
    totals: createEmptySessionTotals(),
    chapters: [],
  };

  if (existingIndex >= 0) {
    session.series[existingIndex] = seriesSummary;
  } else {
    session.series.push(seriesSummary);
  }

  session.updatedAt = now;
  session.startedSeriesCount = session.series.length;
  session.completedSeriesCount = session.series.filter((entry) => entry.completedAt).length;
  session.totals = recomputeSessionTotals(session.series);
  return session;
}

export async function writeSessionSummary(summaryPath: string, session: DownloadSessionSummary): Promise<string> {
  const resolvedPath = path.resolve(summaryPath);
  await writeFileAtomically(resolvedPath, `${JSON.stringify(session, null, 2)}\n`);
  return resolvedPath;
}
