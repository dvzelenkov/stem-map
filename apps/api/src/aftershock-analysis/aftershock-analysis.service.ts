import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

import {
  AftershockAnalysisParams,
  AftershockAnalysisResult,
  EarthquakeRecord,
  EdgeCsvRow,
} from './aftershock-analysis.types';

const EARTH_RADIUS_KM = 6371;
const MS_PER_DAY = 86_400_000;
const DAYS_PER_MONTH = 30.44;
const CSV_HEADER = 'edge_id,attribute_name,source_stem_id,target_stem_id,directed,weight\n';

@Injectable()
export class AftershockAnalysisService {
  private readonly logger = new Logger(AftershockAnalysisService.name);

  /**
   * Main entry point: reads earthquake CSV, identifies main events,
   * builds timeline edges and aftershock edges, writes output CSVs.
   */
  async analyze(params: AftershockAnalysisParams): Promise<AftershockAnalysisResult> {
    const start = performance.now();

    this.logger.log(`Starting analysis: threshold=${params.forceThreshold}, csv=${params.csvPath}`);

    const allEvents = AftershockAnalysisService.parseCsv(params.csvPath);
    this.logger.log(`Parsed ${allEvents.length} events`);

    allEvents.sort((a, b) => a.date.getTime() - b.date.getTime());

    const mainEvents = allEvents.filter(e => e.force > params.forceThreshold);
    mainEvents.sort((a, b) => a.date.getTime() - b.date.getTime());
    this.logger.log(`Main events (force > ${params.forceThreshold}): ${mainEvents.length}`);

    const mainEdges = AftershockAnalysisService.buildMainTimeline(mainEvents);
    this.logger.log(`Main timeline edges: ${mainEdges.length}`);

    const { edges: aftershockEdges, count: aftershocksCount } =
      AftershockAnalysisService.findAftershocks(allEvents, mainEvents);
    this.logger.log(`Aftershocks found: ${aftershocksCount}, edges: ${aftershockEdges.length}`);

    AftershockAnalysisService.writeCsv(params.mainEdgesOutputPath, mainEdges);
    AftershockAnalysisService.writeCsv(params.aftershockEdgesOutputPath, aftershockEdges);

    const durationMs = performance.now() - start;
    this.logger.log(`Analysis complete in ${durationMs.toFixed(1)}ms`);

    return {
      mainEventsCount: mainEvents.length,
      aftershocksCount,
      mainEdgesCount: mainEdges.length,
      aftershockEdgesCount: aftershockEdges.length,
      mainEdgesPath: params.mainEdgesOutputPath,
      aftershockEdgesPath: params.aftershockEdgesOutputPath,
      durationMs,
    };
  }

  // ---------------------------------------------------------------------------
  // CSV parsing
  // ---------------------------------------------------------------------------

  static parseCsv(csvPath: string): EarthquakeRecord[] {
    const raw = fs.readFileSync(csvPath, 'utf-8');
    const lines = raw.split(/\r?\n/).filter(l => l.trim().length > 0);
    const records: EarthquakeRecord[] = [];

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',');
      if (parts.length < 6) continue;

      const [stemId, label, lat, lon, dateStr, force] = parts;
      const dateParts = dateStr.trim().split('.');
      if (dateParts.length !== 3) continue;

      const date = new Date(+dateParts[2], +dateParts[1] - 1, +dateParts[0]);
      records.push({
        stemId: parseInt(stemId, 10),
        label: label.trim(),
        lat: parseFloat(lat),
        lon: parseFloat(lon),
        date,
        force: parseFloat(force),
      });
    }

    return records;
  }

  // ---------------------------------------------------------------------------
  // Main events timeline (sequential directed edges)
  // ---------------------------------------------------------------------------

  static buildMainTimeline(mainEvents: EarthquakeRecord[]): EdgeCsvRow[] {
    const edges: EdgeCsvRow[] = [];

    for (let i = 0; i < mainEvents.length - 1; i++) {
      const src = mainEvents[i];
      const tgt = mainEvents[i + 1];
      edges.push({
        edge_id: `edge-main-timeline-${i}`,
        attribute_name: 'time',
        source_stem_id: String(src.stemId),
        target_stem_id: String(tgt.stemId),
        directed: 'true',
        weight: '1',
      });
    }

    return edges;
  }

  // ---------------------------------------------------------------------------
  // Aftershock detection — optimized Gardner–Knopoff windows
  // with Molchan-Dmitrieva parameters for K-class
  //
  // Spatial window:  rMax(K) = min(1000, 3.5 × 10^((K−11)/3))  [km]
  // Temporal window: tMax(K) = 10^(0.033K + 0.19)               [months, K < 14.5]
  //                  tMax(K) = 10^(0.17K − 1.8)                 [months, K ≥ 14.5]
  //
  // Optimization:
  //   1) All events pre-sorted by time → binary search for window bounds O(log N)
  //   2) Distance computed only for candidates inside the time window
  //   3) Assigned aftershocks tracked in a Set — O(1) lookup, no array splice
  //   4) Main events processed chronologically; each non-main event assigned
  //      to the first qualifying main event (earliest in time)
  //
  // Overall complexity: O(N log N + M × W_avg) where M = main count,
  //   W_avg = average time-window population
  // ---------------------------------------------------------------------------

  static findAftershocks(
    sortedEvents: EarthquakeRecord[],
    sortedMains: EarthquakeRecord[],
  ): { edges: EdgeCsvRow[]; count: number } {
    const mainStemIds = new Set(sortedMains.map(m => m.stemId));
    const assigned = new Set<number>();
    const edges: EdgeCsvRow[] = [];
    let edgeCounter = 0;

    for (const main of sortedMains) {
      const { rMaxKm, tMaxMs } = AftershockAnalysisService.computeWindows(main.force);
      const windowStart = main.date.getTime();
      const windowEnd = windowStart + tMaxMs;

      const lo = AftershockAnalysisService.lowerBound(sortedEvents, windowStart);
      const hi = AftershockAnalysisService.upperBound(sortedEvents, windowEnd);

      for (let i = lo; i < hi; i++) {
        const candidate = sortedEvents[i];

        if (candidate.stemId === main.stemId) continue;
        if (mainStemIds.has(candidate.stemId)) continue;
        if (assigned.has(candidate.stemId)) continue;

        const dist = AftershockAnalysisService.haversineKm(
          main.lat, main.lon, candidate.lat, candidate.lon,
        );
        if (dist > rMaxKm) continue;

        assigned.add(candidate.stemId);
        edges.push({
          edge_id: `edge-aftershock-${edgeCounter++}`,
          attribute_name: 'force',
          source_stem_id: String(main.stemId),
          target_stem_id: String(candidate.stemId),
          directed: 'true',
          weight: String(candidate.force),
        });
      }
    }

    return { edges, count: assigned.size };
  }

  /**
   * Compute spatial and temporal aftershock windows
   * using Molchan-Dmitrieva formulas for K-class (energy class).
   */
  static computeWindows(force: number): { rMaxKm: number; tMaxMs: number } {
    let rMaxKm = 3.5 * Math.pow(10, (force - 11) / 3);
    rMaxKm = Math.min(1000, Math.ceil(rMaxKm));

    const tMaxMonths = force < 14.5
      ? Math.pow(10, 0.033 * force + 0.19)
      : Math.pow(10, 0.17 * force - 1.8);

    const tMaxMs = Math.ceil(tMaxMonths) * DAYS_PER_MONTH * MS_PER_DAY;

    return { rMaxKm, tMaxMs };
  }

  // ---------------------------------------------------------------------------
  // Binary search helpers (events must be sorted by date ascending)
  // ---------------------------------------------------------------------------

  static lowerBound(events: EarthquakeRecord[], timeMs: number): number {
    let lo = 0;
    let hi = events.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (events[mid].date.getTime() < timeMs) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  static upperBound(events: EarthquakeRecord[], timeMs: number): number {
    let lo = 0;
    let hi = events.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (events[mid].date.getTime() <= timeMs) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  // ---------------------------------------------------------------------------
  // Haversine distance
  // ---------------------------------------------------------------------------

  static haversineKm(
    lat1: number, lon1: number,
    lat2: number, lon2: number,
  ): number {
    const dLat = AftershockAnalysisService.deg2rad(lat2 - lat1);
    const dLon = AftershockAnalysisService.deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(AftershockAnalysisService.deg2rad(lat1)) *
      Math.cos(AftershockAnalysisService.deg2rad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private static deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  // ---------------------------------------------------------------------------
  // CSV output
  // ---------------------------------------------------------------------------

  static writeCsv(outputPath: string, edges: EdgeCsvRow[]): void {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let content = CSV_HEADER;
    for (const e of edges) {
      content += `${e.edge_id},${e.attribute_name},${e.source_stem_id},${e.target_stem_id},${e.directed},${e.weight}\n`;
    }

    fs.writeFileSync(outputPath, content, 'utf-8');
  }
}
