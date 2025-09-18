// geo.js - spatial utilities (ES module)
// Provides: haversineKm, pointInPolygon, buildGridIndex, nearbyFromIndex

export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Ray casting point in polygon. point = [lng, lat]; polygon = [[lng,lat],...]
export function pointInPolygon(point, polygon) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    const intersect = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi) / (yj - yi) + xi));
    if (intersect) inside = !inside;
  }
  return inside;
}

// Build a simple grid index to reduce distance checks.
// cellSizeDeg ~ 0.01 (~1.1km N-S) is a balance for NYC scale.
export function buildGridIndex(points, cellSizeDeg = 0.01) {
  const index = new Map();
  for (const p of points) {
    const gx = Math.floor(p.longitude / cellSizeDeg);
    const gy = Math.floor(p.latitude / cellSizeDeg);
    const key = gx + ':' + gy;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(p);
  }
  return { index, cellSizeDeg };
}

export function nearbyFromIndex(grid, lat, lng, radiusKm = 2.5) {
  const { index, cellSizeDeg } = grid;
  const gx = Math.floor(lng / cellSizeDeg);
  const gy = Math.floor(lat / cellSizeDeg);
  const results = [];
  // search neighboring cells (3x3) - extend if larger radius needed
  for (let dx = -2; dx <= 2; dx++) {
    for (let dy = -2; dy <= 2; dy++) {
      const key = (gx + dx) + ':' + (gy + dy);
      if (!index.has(key)) continue;
      for (const p of index.get(key)) {
        const d = haversineKm(lat, lng, p.latitude, p.longitude);
        if (d <= radiusKm) results.push({ point: p, distKm: d });
      }
    }
  }
  return results;
}

export function centroidLonLat(coords) {
  let sx = 0, sy = 0; for (const c of coords) { sx += c[0]; sy += c[1]; }
  return [sx / coords.length, sy / coords.length];
}
