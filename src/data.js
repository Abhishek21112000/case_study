
import { buildGridIndex } from './geo.js';

let amenities = [];
let polygons = [];
let addresses = [];
let gridIndex = null;

export async function loadDatasets() {
  const [aRes, pRes, gRes] = await Promise.all([
    fetch('features.json'),
    fetch('features_poly.json'),
    fetch('geocoding.json')
  ]);
  if (!aRes.ok || !pRes.ok || !gRes.ok) throw new Error('Failed to load one or more datasets');
  amenities = await aRes.json();
  polygons = await pRes.json();
  addresses = await gRes.json();
  gridIndex = buildGridIndex(amenities);
}

export function getAmenities() { return amenities; }
export function getPolygons() { return polygons; }
export function getAddresses() { return addresses; }
export function getGridIndex() { return gridIndex; }
