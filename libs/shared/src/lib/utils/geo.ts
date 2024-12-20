export interface Coordinates {
  longitude: number;
  latitude: number;
}

export function getKmBetweenCoordinates(
  point1: Coordinates,
  point2: Coordinates,
) {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(point2.latitude - point1.latitude);
  const dLon = deg2rad(point2.longitude - point1.longitude); 
  const a =
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(point1.latitude)) *
    Math.cos(deg2rad(point2.latitude)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  const d = R * c; // Distance in km
  return d;
}

function deg2rad(deg: number) {
  return deg * (Math.PI/180)
}

export const getContourPoints = (data: Coordinates[]): Coordinates[] => {
  return data.filter((point, index) => {
    const isContourPoint = checkIsContourPoint(point, data);
    if (isContourPoint) data.splice(index, 1);
    return isContourPoint;
  });
}

const checkIsContourPoint = (
  { latitude, longitude }: Coordinates,
  data: Coordinates[],
): boolean => {
  let isMaxLatitude = true;
  let isMinLatitude = true;
  let isMaxLongitude = true;
  let isMinLongitude = true;

  for (const point of data) {
    if (point.latitude > latitude) isMaxLatitude = false;
    if (point.latitude < latitude) isMinLatitude = false;
    if (point.longitude > longitude) isMaxLongitude = false;
    if (point.longitude < longitude) isMinLongitude = false;
  }

  return isMaxLatitude || isMinLatitude || isMaxLongitude || isMinLongitude;
}

function orientation(p: Coordinates, q: Coordinates, r: Coordinates): number {
  const val = (q.latitude - p.latitude) * (r.longitude - q.longitude) - (q.longitude - p.longitude) * (r.latitude - q.latitude);
  if (val === 0) return 0;  // коллинеарны
  return val > 0 ? 1 : 2;  // по часовой стрелке или против
}

export function convexHull(points: Coordinates[]): Coordinates[] {
  const n = points.length;
  if (n < 3) return points;

  let l = 0;
  for (let i = 1; i < n; i++) {
    if (points[i].latitude < points[l].latitude || (points[i].latitude === points[l].latitude && points[i].longitude < points[l].longitude)) {
      l = i;
    }
  }

  const hull: Coordinates[] = [];
  let p = l, q: number;

  do {
    hull.push(points[p]);
    q = (p + 1) % n;
    for (let r = 0; r < n; r++) {
      if (orientation(points[p], points[q], points[r]) === 2) {
        q = r;
      }
    }
    p = q;
  } while (p !== l);

  return hull;
}