// Geodesic Polygon Area Calculation (Shoelace formula on Spherical Earth Projection)
export function calculatePolygonAreaAcres(coordinates: [number, number][]): number {
  if (!coordinates || coordinates.length < 3) return 0;

  const EARTH_RADIUS_METERS = 6378137;
  let totalArea = 0;

  if (coordinates.length > 2) {
    for (let i = 0; i < coordinates.length; i++) {
      const p1 = coordinates[i];
      const p2 = coordinates[(i + 1) % coordinates.length];

      const lat1 = (p1[0] * Math.PI) / 180;
      const lat2 = (p2[0] * Math.PI) / 180;
      const lon1 = (p1[1] * Math.PI) / 180;
      const lon2 = (p2[1] * Math.PI) / 180;

      totalArea += (lon2 - lon1) * (2 + Math.sin(lat1) + Math.sin(lat2));
    }

    totalArea = (Math.abs(totalArea) * EARTH_RADIUS_METERS * EARTH_RADIUS_METERS) / 2.0;
  }

  // 1 Square Meter = 0.000247105 Acres
  const areaAcres = totalArea * 0.000247105;
  return Math.round(areaAcres * 100) / 100;
}

// Centroid of Polygon
export function calculatePolygonCentroid(coordinates: [number, number][]): [number, number] {
  if (!coordinates || coordinates.length === 0) return [16.5062, 80.6480];

  let sumLat = 0;
  let sumLng = 0;
  coordinates.forEach(([lat, lng]) => {
    sumLat += lat;
    sumLng += lng;
  });

  return [sumLat / coordinates.length, sumLng / coordinates.length];
}

// Distance between two points in meters (Haversine formula)
export function calculateHaversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // metres
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

// Ray-casting point-in-polygon algorithm
export function isPointInsidePolygon(
  point: [number, number],
  polygon: [number, number][]
): boolean {
  if (!polygon || polygon.length < 3) return false;
  const [lat, lng] = point;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0],
      yi = polygon[i][1];
    const xj = polygon[j][0],
      yj = polygon[j][1];

    const intersect =
      yi > lng !== yj > lng && lat < ((xj - xi) * (lng - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }

  return inside;
}
