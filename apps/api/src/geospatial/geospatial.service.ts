import { Injectable } from '@nestjs/common';
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

const EARTH_RADIUS_METERS = 6_371_000;
const DEFAULT_MIN_CLUSTER_SIZE = 8;
const DEFAULT_ALPHA_KM = 12;
const MIN_ALPHA_KM = 0.1;
const MAX_ALPHA_KM = 500;
const MIN_CLUSTER_SIZE = 2;
const MAX_CLUSTER_SIZE = 10_000;

@Injectable()
export class GeospatialService {
  clusterAndBuildPolygons(
    points: GeoPoint[],
    options: ClusterPolygonsOptions = {}
  ): ClusterPolygonFeatureCollection {
    const normalizedPoints = this.normalizePoints(points);
    if (normalizedPoints.length < 3) {
      return this.emptyFeatureCollection();
    }

    const minClusterSize = this.normalizeMinClusterSize(options.minClusterSize);
    const alphaKm = this.normalizeAlpha(options.alpha);

    const data3d = normalizedPoints.map((item) =>
      this.latLonRadiansToUnitSphere(item.lat, item.lon)
    );

    const hdbscan = new HDBSCAN({
      minClusterSize,
      minSamples: minClusterSize,
    });
    const labels = hdbscan.fit(data3d);

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

    const features: ClusterPolygonFeature[] = [];
    for (const [clusterId, clusterPoints] of groups.entries()) {
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

  private emptyFeatureCollection(): ClusterPolygonFeatureCollection {
    return {
      type: 'FeatureCollection',
      features: [],
    };
  }
}
