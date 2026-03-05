import { Injectable, Logger } from '@nestjs/common';
import { Delaunay } from 'd3-delaunay';
import { HDBSCAN } from 'hdbscan-ts';
import {
  booleanValid,
  convex,
  featureCollection,
  point,
  polygon,
} from '@turf/turf';

import {
  ClusterPolygonFeature,
  ClusterPolygonFeatureCollection,
  ClusterPolygonsOptions,
  GeoPoint,
} from './geospatial.types';

interface ProjectedPoint {
  index: number;
  x: number;
  y: number;
}

interface SpatialBucket {
  pointIndexes: number[];
  sumLat: number;
  sumLon: number;
}

interface ReducedDatasetResult {
  pointsForClustering: GeoPoint[];
  effectiveMinClusterSize: number;
  reductionApplied: boolean;
  cellSizeKm: number;
  expandLabels: (labels: number[]) => number[];
}

const EARTH_RADIUS_METERS = 6_371_000;
const DEFAULT_MIN_CLUSTER_SIZE = 8;
const DEFAULT_ALPHA_KM = 12;
const MIN_ALPHA_KM = 0.1;
const MAX_ALPHA_KM = 500;
const MIN_CLUSTER_SIZE = 2;
const MAX_CLUSTER_SIZE = 10_000;
const LARGE_DATASET_THRESHOLD = 8_000;
const MIN_REDUCTION_RATIO_TO_APPLY = 0.92;
const MAX_ALPHA_SHAPE_POINTS = 5_000;
const PROGRESS_LOG_EVERY_CLUSTERS = 25;
const MAX_HDBSCAN_POINTS = 6_000;
const TARGET_REDUCED_POINTS = 4_500;

@Injectable()
export class GeospatialService {
  private readonly logger = new Logger(GeospatialService.name);

  clusterAndBuildPolygons(
    points: GeoPoint[],
    options: ClusterPolygonsOptions = {}
  ): ClusterPolygonFeatureCollection {
    const totalStartMs = performance.now();
    const normalizedPoints = this.normalizePoints(points);
    if (normalizedPoints.length < 3) {
      return this.emptyFeatureCollection();
    }

    const minClusterSize = this.normalizeMinClusterSize(options.minClusterSize);
    const alphaKm = this.normalizeAlpha(options.alpha);

    this.logger.log(
      `Cluster pipeline start: points=${normalizedPoints.length}, minClusterSize=${minClusterSize}, alphaKm=${alphaKm}`
    );

    const reductionStartMs = performance.now();
    const reducedDataset = this.reducePointsForLargeDatasets(
      normalizedPoints,
      alphaKm,
      minClusterSize
    );
    this.logger.log(
      `Dataset prepared: source=${normalizedPoints.length}, clustered=${reducedDataset.pointsForClustering.length}, reductionApplied=${reducedDataset.reductionApplied}, cellSizeKm=${reducedDataset.cellSizeKm.toFixed(2)}, effectiveMinClusterSize=${reducedDataset.effectiveMinClusterSize}, stageMs=${Math.round(performance.now() - reductionStartMs)}`
    );

    const hdbscanStartMs = performance.now();
    let reducedLabels: number[];

    if (reducedDataset.pointsForClustering.length <= MAX_HDBSCAN_POINTS) {
      this.logger.log(
        `Clustering algorithm: HDBSCAN, points=${reducedDataset.pointsForClustering.length}`
      );
      const data3d = reducedDataset.pointsForClustering.map((item) =>
        this.latLonRadiansToUnitSphere(item.lat, item.lon)
      );
      const hdbscan = new HDBSCAN({
        minClusterSize: reducedDataset.effectiveMinClusterSize,
        minSamples: reducedDataset.effectiveMinClusterSize,
      });
      reducedLabels = hdbscan.fit(data3d);
    } else {
      this.logger.warn(
        `Clustering fallback: GRID_FAST, points=${reducedDataset.pointsForClustering.length}, reason=too_many_points_for_hdbscan`
      );
      reducedLabels = this.fastGridCluster(
        reducedDataset.pointsForClustering,
        reducedDataset.effectiveMinClusterSize,
        reducedDataset.cellSizeKm
      );
    }

    const labels = reducedDataset.expandLabels(reducedLabels);
    this.logger.log(
      `Clustering finished: clusteredPoints=${reducedDataset.pointsForClustering.length}, labels=${reducedLabels.length}, stageMs=${Math.round(performance.now() - hdbscanStartMs)}`
    );

    const groups = new Map<number, GeoPoint[]>();
    labels.forEach((clusterId, index) => {
      if (clusterId < 0) {
        return;
      }
      const existing = groups.get(clusterId);
      if (existing) {
        existing.push(normalizedPoints[index]);
      } else {
        groups.set(clusterId, [normalizedPoints[index]]);
      }
    });
    this.logger.log(`Cluster groups created: groups=${groups.size}`);

    const features: ClusterPolygonFeature[] = [];
    const hullStartMs = performance.now();
    let clusterIndex = 0;
    for (const [clusterId, clusterPoints] of groups.entries()) {
      clusterIndex += 1;
      if (clusterIndex % PROGRESS_LOG_EVERY_CLUSTERS === 0) {
        this.logger.log(
          `Building polygons progress: processed=${clusterIndex}/${groups.size}, features=${features.length}`
        );
      }

      if (clusterPoints.length < minClusterSize) {
        continue;
      }

      const coordinates = this.buildClusterPolygon(clusterPoints, alphaKm);
      if (!coordinates) {
        continue;
      }

      features.push({
        type: 'Feature',
        properties: {
          clusterId,
          pointCount: clusterPoints.length,
        },
        geometry: {
          type: 'Polygon',
          coordinates: [coordinates],
        },
      });
    }
    this.logger.log(
      `Polygon stage finished: features=${features.length}, stageMs=${Math.round(performance.now() - hullStartMs)}`
    );
    this.logger.log(
      `Cluster pipeline finished: totalMs=${Math.round(performance.now() - totalStartMs)}`
    );

    return {
      type: 'FeatureCollection',
      features,
    };
  }

  private normalizePoints(points: GeoPoint[]): GeoPoint[] {
    return points.filter(
      (item) =>
        Number.isFinite(item.lat) &&
        Number.isFinite(item.lon) &&
        item.lat >= -90 &&
        item.lat <= 90 &&
        item.lon >= -180 &&
        item.lon <= 180
    );
  }

  private normalizeMinClusterSize(value: number | undefined): number {
    if (!value || !Number.isFinite(value)) {
      return DEFAULT_MIN_CLUSTER_SIZE;
    }
    return Math.max(MIN_CLUSTER_SIZE, Math.min(MAX_CLUSTER_SIZE, Math.floor(value)));
  }

  private normalizeAlpha(value: number | undefined): number {
    if (!value || !Number.isFinite(value)) {
      return DEFAULT_ALPHA_KM;
    }
    return Math.max(MIN_ALPHA_KM, Math.min(MAX_ALPHA_KM, value));
  }

  private latLonRadiansToUnitSphere(lat: number, lon: number): number[] {
    const latRad = this.toRadians(lat);
    const lonRad = this.toRadians(lon);
    const cosLat = Math.cos(latRad);
    return [
      cosLat * Math.cos(lonRad),
      cosLat * Math.sin(lonRad),
      Math.sin(latRad),
    ];
  }

  private buildClusterPolygon(
    clusterPoints: GeoPoint[],
    alphaKm: number
  ): number[][] | null {
    if (clusterPoints.length < 3) {
      return this.buildDegeneratePolygon(clusterPoints);
    }

    if (clusterPoints.length > MAX_ALPHA_SHAPE_POINTS) {
      return this.buildConvexFallback(clusterPoints);
    }

    const projected = this.projectClusterPoints(clusterPoints);
    const delaunay = Delaunay.from(
      projected,
      (item: ProjectedPoint) => item.x,
      (item: ProjectedPoint) => item.y
    );

    const boundaryEdges = this.getAlphaBoundaryEdges(
      projected,
      delaunay.triangles,
      alphaKm * 1000
    );

    const ringIndices = this.traceLargestRing(boundaryEdges);
    if (!ringIndices.length) {
      return this.buildConvexFallback(clusterPoints);
    }

    const ring = ringIndices.map((index) => [
      clusterPoints[index].lon,
      clusterPoints[index].lat,
    ]);
    this.ensureRingClosed(ring);

    if (ring.length < 4) {
      return this.buildConvexFallback(clusterPoints);
    }

    const feature = polygon([ring]);
    if (!booleanValid(feature)) {
      return this.buildConvexFallback(clusterPoints);
    }

    return ring;
  }

  private projectClusterPoints(clusterPoints: GeoPoint[]): ProjectedPoint[] {
    const centroidLat = clusterPoints.reduce((sum, item) => sum + item.lat, 0) / clusterPoints.length;
    const centroidLon = clusterPoints.reduce((sum, item) => sum + item.lon, 0) / clusterPoints.length;

    const lat0 = this.toRadians(centroidLat);
    const lon0 = this.toRadians(centroidLon);
    const cosLat0 = Math.cos(lat0);

    return clusterPoints.map((item, index) => {
      const lat = this.toRadians(item.lat);
      const lon = this.toRadians(item.lon);

      return {
        index,
        x: (lon - lon0) * cosLat0 * EARTH_RADIUS_METERS,
        y: (lat - lat0) * EARTH_RADIUS_METERS,
      };
    });
  }

  private getAlphaBoundaryEdges(
    projected: ProjectedPoint[],
    triangles: Uint32Array | Int32Array,
    alphaMeters: number
  ): Array<[number, number]> {
    const edgeUseCounter = new Map<string, number>();
    const edgePairs = new Map<string, [number, number]>();

    for (let i = 0; i < triangles.length; i += 3) {
      const a = projected[triangles[i]];
      const b = projected[triangles[i + 1]];
      const c = projected[triangles[i + 2]];

      const radius = this.circumradius(a, b, c);
      if (!Number.isFinite(radius) || radius > alphaMeters) {
        continue;
      }

      this.markEdge(a.index, b.index, edgeUseCounter, edgePairs);
      this.markEdge(b.index, c.index, edgeUseCounter, edgePairs);
      this.markEdge(c.index, a.index, edgeUseCounter, edgePairs);
    }

    return [...edgeUseCounter.entries()]
      .filter(([, count]) => count === 1)
      .map(([key]) => edgePairs.get(key))
      .filter((edge): edge is [number, number] => Boolean(edge));
  }

  private markEdge(
    a: number,
    b: number,
    edgeUseCounter: Map<string, number>,
    edgePairs: Map<string, [number, number]>
  ): void {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    edgeUseCounter.set(key, (edgeUseCounter.get(key) ?? 0) + 1);
    if (!edgePairs.has(key)) {
      edgePairs.set(key, [a, b]);
    }
  }

  private circumradius(a: ProjectedPoint, b: ProjectedPoint, c: ProjectedPoint): number {
    const ab = Math.hypot(a.x - b.x, a.y - b.y);
    const bc = Math.hypot(b.x - c.x, b.y - c.y);
    const ca = Math.hypot(c.x - a.x, c.y - a.y);
    const area2 = Math.abs(
      a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y)
    );

    if (area2 < 1e-9) {
      return Number.POSITIVE_INFINITY;
    }

    return (ab * bc * ca) / area2;
  }

  private traceLargestRing(edges: Array<[number, number]>): number[] {
    if (edges.length < 3) {
      return [];
    }

    const adjacency = new Map<number, Set<number>>();
    const unused = new Set<string>();

    for (const [a, b] of edges) {
      this.linkNeighbors(a, b, adjacency);
      this.linkNeighbors(b, a, adjacency);
      unused.add(this.edgeKey(a, b));
    }

    const rings: number[][] = [];
    for (const [startA, startB] of edges) {
      const startKey = this.edgeKey(startA, startB);
      if (!unused.has(startKey)) {
        continue;
      }

      const ring: number[] = [startA];
      let prev = startA;
      let current = startB;
      unused.delete(startKey);

      let guard = 0;
      while (guard < edges.length + 2) {
        ring.push(current);
        const neighbors = adjacency.get(current);
        if (!neighbors || neighbors.size === 0) {
          break;
        }

        const next = [...neighbors].find(
          (candidate) => candidate !== prev && unused.has(this.edgeKey(current, candidate))
        );

        if (next === undefined) {
          if (current === startA) {
            break;
          }
          const fallback = [...neighbors].find((candidate) => candidate !== prev);
          if (fallback === undefined) {
            break;
          }
          prev = current;
          current = fallback;
          guard += 1;
          continue;
        }

        unused.delete(this.edgeKey(current, next));
        prev = current;
        current = next;
        if (current === startA) {
          ring.push(current);
          break;
        }
        guard += 1;
      }

      if (ring.length >= 4 && ring[0] === ring[ring.length - 1]) {
        rings.push(ring.slice(0, -1));
      }
    }

    if (!rings.length) {
      return [];
    }

    return rings.sort((left, right) => right.length - left.length)[0];
  }

  private linkNeighbors(from: number, to: number, adjacency: Map<number, Set<number>>): void {
    const set = adjacency.get(from);
    if (set) {
      set.add(to);
      return;
    }
    adjacency.set(from, new Set([to]));
  }

  private edgeKey(a: number, b: number): string {
    return a < b ? `${a}:${b}` : `${b}:${a}`;
  }

  private buildConvexFallback(clusterPoints: GeoPoint[]): number[][] | null {
    const fc = featureCollection(
      clusterPoints.map((item) => point([item.lon, item.lat]))
    );
    const hull = convex(fc);
    if (hull?.geometry?.type === 'Polygon') {
      const ring = hull.geometry.coordinates[0].map((position) => [position[0], position[1]]);
      this.ensureRingClosed(ring);
      return ring.length >= 4 ? ring : null;
    }
    return this.buildDegeneratePolygon(clusterPoints);
  }

  private buildDegeneratePolygon(clusterPoints: GeoPoint[]): number[][] | null {
    if (!clusterPoints.length) {
      return null;
    }

    if (clusterPoints.length === 1) {
      const { lat, lon } = clusterPoints[0];
      const dLat = 0.0012;
      const dLon = 0.0012 / Math.max(0.2, Math.cos(this.toRadians(lat)));
      return [
        [lon - dLon, lat - dLat],
        [lon + dLon, lat - dLat],
        [lon + dLon, lat + dLat],
        [lon - dLon, lat + dLat],
        [lon - dLon, lat - dLat],
      ];
    }

    const minLat = Math.min(...clusterPoints.map((item) => item.lat));
    const maxLat = Math.max(...clusterPoints.map((item) => item.lat));
    const minLon = Math.min(...clusterPoints.map((item) => item.lon));
    const maxLon = Math.max(...clusterPoints.map((item) => item.lon));
    const padLat = Math.max((maxLat - minLat) * 0.1, 0.0006);
    const padLon = Math.max((maxLon - minLon) * 0.1, 0.0006);

    return [
      [minLon - padLon, minLat - padLat],
      [maxLon + padLon, minLat - padLat],
      [maxLon + padLon, maxLat + padLat],
      [minLon - padLon, maxLat + padLat],
      [minLon - padLon, minLat - padLat],
    ];
  }

  private ensureRingClosed(ring: number[][]): void {
    if (ring.length === 0) {
      return;
    }

    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      ring.push([first[0], first[1]]);
    }
  }

  private toRadians(degrees: number): number {
    return (degrees * Math.PI) / 180;
  }

  private reducePointsForLargeDatasets(
    points: GeoPoint[],
    alphaKm: number,
    minClusterSize: number
  ): ReducedDatasetResult {
    if (points.length < LARGE_DATASET_THRESHOLD) {
      return {
        pointsForClustering: points,
        effectiveMinClusterSize: minClusterSize,
        reductionApplied: false,
        cellSizeKm: 0,
        expandLabels: (labels: number[]) => labels,
      };
    }

    const baseCellSizeKm = Math.max(0.25, Math.min(4, alphaKm * 0.2));
    const adaptiveScale = Math.sqrt(points.length / TARGET_REDUCED_POINTS);
    const cellSizeKm = Math.max(0.25, Math.min(25, baseCellSizeKm * adaptiveScale));
    const cellSizeMeters = cellSizeKm * 1000;

    const bucketsByKey = new Map<string, SpatialBucket>();
    points.forEach((pointItem, index) => {
      const { x, y } = this.toWebMercator(pointItem);
      const xBucket = Math.floor(x / cellSizeMeters);
      const yBucket = Math.floor(y / cellSizeMeters);
      const key = `${xBucket}:${yBucket}`;

      const existing = bucketsByKey.get(key);
      if (existing) {
        existing.pointIndexes.push(index);
        existing.sumLat += pointItem.lat;
        existing.sumLon += pointItem.lon;
        return;
      }

      bucketsByKey.set(key, {
        pointIndexes: [index],
        sumLat: pointItem.lat,
        sumLon: pointItem.lon,
      });
    });

    const buckets = [...bucketsByKey.values()];
    const reducedPoints = buckets.map((bucket) => ({
      lat: bucket.sumLat / bucket.pointIndexes.length,
      lon: bucket.sumLon / bucket.pointIndexes.length,
    }));

    const reductionRatio = reducedPoints.length / points.length;
    if (reductionRatio >= MIN_REDUCTION_RATIO_TO_APPLY) {
      return {
        pointsForClustering: points,
        effectiveMinClusterSize: minClusterSize,
        reductionApplied: false,
        cellSizeKm,
        expandLabels: (labels: number[]) => labels,
      };
    }

    const effectiveMinClusterSize = Math.max(
      MIN_CLUSTER_SIZE,
      Math.floor(minClusterSize * 0.65)
    );

    return {
      pointsForClustering: reducedPoints,
      effectiveMinClusterSize,
      reductionApplied: true,
      cellSizeKm,
      expandLabels: (labels: number[]) => {
        const expanded = new Array<number>(points.length).fill(-1);
        buckets.forEach((bucket, bucketIndex) => {
          const bucketLabel = labels[bucketIndex] ?? -1;
          bucket.pointIndexes.forEach((originalIndex) => {
            expanded[originalIndex] = bucketLabel;
          });
        });
        return expanded;
      },
    };
  }

  private fastGridCluster(
    points: GeoPoint[],
    minClusterSize: number,
    baseCellSizeKm: number
  ): number[] {
    const minSize = Math.max(2, minClusterSize);
    const cellSizeMeters = Math.max(500, baseCellSizeKm * 1000);
    const pointsByCell = new Map<string, number[]>();
    const cellByIndex: Array<{ x: number; y: number }> = new Array(points.length);

    points.forEach((pointItem, index) => {
      const { x, y } = this.toWebMercator(pointItem);
      const cellX = Math.floor(x / cellSizeMeters);
      const cellY = Math.floor(y / cellSizeMeters);
      cellByIndex[index] = { x: cellX, y: cellY };
      const key = `${cellX}:${cellY}`;
      const existing = pointsByCell.get(key);
      if (existing) {
        existing.push(index);
      } else {
        pointsByCell.set(key, [index]);
      }
    });

    const visitedCells = new Set<string>();
    const labels = new Array<number>(points.length).fill(-1);
    let nextClusterId = 0;

    for (const cellKey of pointsByCell.keys()) {
      if (visitedCells.has(cellKey)) {
        continue;
      }

      const queue: string[] = [cellKey];
      visitedCells.add(cellKey);
      const componentPointIndexes: number[] = [];

      while (queue.length) {
        const currentKey = queue.shift();
        if (!currentKey) {
          continue;
        }

        const currentIndexes = pointsByCell.get(currentKey);
        if (currentIndexes?.length) {
          componentPointIndexes.push(...currentIndexes);
        }

        const [xRaw, yRaw] = currentKey.split(':');
        const x = Number(xRaw);
        const y = Number(yRaw);

        for (let dx = -1; dx <= 1; dx += 1) {
          for (let dy = -1; dy <= 1; dy += 1) {
            const neighborKey = `${x + dx}:${y + dy}`;
            if (!pointsByCell.has(neighborKey) || visitedCells.has(neighborKey)) {
              continue;
            }
            visitedCells.add(neighborKey);
            queue.push(neighborKey);
          }
        }
      }

      if (componentPointIndexes.length < minSize) {
        continue;
      }

      componentPointIndexes.forEach((pointIndex) => {
        labels[pointIndex] = nextClusterId;
      });
      nextClusterId += 1;
    }

    return labels;
  }

  private toWebMercator(pointItem: GeoPoint): { x: number; y: number } {
    const clampedLat = Math.max(-85, Math.min(85, pointItem.lat));
    const lonRad = this.toRadians(pointItem.lon);
    const latRad = this.toRadians(clampedLat);
    return {
      x: EARTH_RADIUS_METERS * lonRad,
      y: EARTH_RADIUS_METERS * Math.log(Math.tan(Math.PI / 4 + latRad / 2)),
    };
  }

  private emptyFeatureCollection(): ClusterPolygonFeatureCollection {
    return {
      type: 'FeatureCollection',
      features: [],
    };
  }
}
