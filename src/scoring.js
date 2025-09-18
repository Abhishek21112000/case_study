// scoring.js - habitability scoring logic
// Exports: computeHabitability, setWeights, getWeights, constants
// Uses dataset accessors from data.js and spatial utilities from geo.js

import { getAmenities, getPolygons, getGridIndex } from './data.js';
import { haversineKm, pointInPolygon, centroidLonLat, nearbyFromIndex } from './geo.js';

// Configurable positive & negative categories
export const POSITIVE_TYPES = [
  'park','grocery','school','hospital','clinic','pharmacy','community_center','library','museum',
  'place_of_worship','shopping','recreation','gym','bike_station','ferry_terminal','university','bank','cafe','garden'
];
export const NEGATIVE_TYPES = [
  'industrial_complex','power_plant','rail_yard','sanitation_facility','jail','prison','waste_facility','hazardous_waste','chemical_plant','incinerator','morgue','adult_entertainment','pawn_shop','check_cashing','payday_loans','homeless_shelter','rehab_center','methadone_clinic','needle_exchange','psychiatric_facility','landfill','dump_site','noise_pollution','pollution_monitor','sewage_overflow','contaminated_site','abandoned_building','crime_hotspot','funeral_home','crematorium'
];

let WEIGHTS = { amenity:0.4, polygons:0.4, penalty:0.2 };
export function setWeights(w) {
  WEIGHTS = { ...WEIGHTS, ...w };
}
export function getWeights() { return { ...WEIGHTS }; }

// Amenity emphasis
const AMENITY_TYPE_WEIGHTS = {
  park:1, grocery:1, school:1.1, hospital:1.1, clinic:0.7, pharmacy:0.6, community_center:0.7,
  library:0.6, museum:0.5, place_of_worship:0.3, shopping:0.4, recreation:0.6, gym:0.5,
  bike_station:0.8, ferry_terminal:0.8, university:0.5, bank:0.2, cafe:0.2, garden:0.9
};
const NEGATIVE_TYPE_WEIGHTS = {
  crime_hotspot:1.2, jail:1, prison:1.1, homeless_shelter:0.8, rehab_center:0.7, methadone_clinic:0.7,
  needle_exchange:0.6, psychiatric_facility:0.5, industrial_complex:0.9, power_plant:0.9, rail_yard:0.8,
  sanitation_facility:0.8, waste_facility:1, hazardous_waste:1.2, chemical_plant:1.2, incinerator:1.1,
  morgue:0.4, adult_entertainment:0.4, pawn_shop:0.5, check_cashing:0.5, payday_loans:0.5,
  landfill:1.1, dump_site:1, noise_pollution:0.6, pollution_monitor:0.3, sewage_overflow:1,
  contaminated_site:1.1, abandoned_building:0.8, funeral_home:0.4, crematorium:0.6
};

// Distance thresholds
const POSITIVE_MAX_DIST_KM = 2.0;
const NEGATIVE_RADIUS_KM = 1.5;

// Polygon normalization ranges
const POLY_NORMAL_RANGES = {
  air_quality_index: {min:11, max:22, invert:false},
  crime_rate: {min:2.8, max:6.7, invert:true},
  median_rent: {min:3400, max:5800, invert:true},
  school_quality: {min:6.4, max:9.1, invert:false},
  transit_distance: {min:0.05, max:0.45, invert:true}
};

function decay(distKm, maxDist) {
  if (distKm >= maxDist) return 0; const r = 1 - (distKm / maxDist); return r * r; }
function normalize(value, {min, max, invert}) {
  const clamped = Math.min(Math.max(value, min), max); let n = (clamped - min)/(max - min || 1); if (invert) n = 1 - n; return n; }

function amenityScore(lat,lng) {
  const amenities = getAmenities();
  const grid = getGridIndex();
  // Use grid to pre-filter
  const candidates = grid ? nearbyFromIndex(grid, lat, lng, POSITIVE_MAX_DIST_KM) : amenities.map(a=>({point:a, distKm:haversineKm(lat,lng,a.latitude,a.longitude)}));
  let total=0, weightSum=0;
  for (const {point:a, distKm:d} of candidates) {
    if (!POSITIVE_TYPES.includes(a.type)) continue;
    const w = AMENITY_TYPE_WEIGHTS[a.type] || 0.3;
    const contrib = decay(d, POSITIVE_MAX_DIST_KM) * w;
    total += contrib; weightSum += w;
  }
  return weightSum ? (total/weightSum)*100 : 0;
}

function penaltyScore(lat,lng) {
  const amenities = getAmenities();
  const grid = getGridIndex();
  const candidates = grid ? nearbyFromIndex(grid, lat, lng, NEGATIVE_RADIUS_KM) : amenities.map(a=>({point:a, distKm:haversineKm(lat,lng,a.latitude,a.longitude)}));
  let total=0, weightSum=0;
  for (const {point:a, distKm:d} of candidates) {
    if (!NEGATIVE_TYPES.includes(a.type)) continue;
    const w = NEGATIVE_TYPE_WEIGHTS[a.type] || 0.5;
    const contrib = decay(d, NEGATIVE_RADIUS_KM) * w;
    total += contrib; weightSum += w;
  }
  return weightSum ? (total/weightSum)*100 : 0;
}

function polygonAttributes(lat,lng) {
  const polygons = getPolygons();
  const byAspect = {};
  for (const p of polygons) { (byAspect[p.aspect] = byAspect[p.aspect] || []).push(p); }
  const result = {};
  for (const aspect of Object.keys(byAspect)) {
    let chosen = null;
    for (const poly of byAspect[aspect]) {
      if (pointInPolygon([lng, lat], poly.coordinates)) { chosen = poly; break; }
    }
    if (!chosen) {
      // fallback nearest centroid
      let best=null,bestD=Infinity;
      for (const poly of byAspect[aspect]) {
        const c = centroidLonLat(poly.coordinates);
        const d = haversineKm(lat,lng,c[1],c[0]);
        if (d < bestD) { bestD = d; best = poly; }
      }
      chosen = best;
    }
    result[aspect] = chosen;
  }
  return result;
}

function polygonScore(lat,lng) {
  const attrs = polygonAttributes(lat,lng);
  let total=0,count=0; const details={};
  for (const aspect of Object.keys(POLY_NORMAL_RANGES)) {
    const poly = attrs[aspect]; if (!poly) continue;
    const range = POLY_NORMAL_RANGES[aspect];
    const raw = poly[aspect] ?? poly.transit_distance;
    const norm = normalize(raw, range);
    details[aspect] = { raw, norm };
    total += norm; count++;
  }
  return { score: count? (total/count)*100 : 0, details };
}

export function computeHabitability(lat,lng) {
  const amenity = amenityScore(lat,lng);
  const penaltyRaw = penaltyScore(lat,lng);
  const { score: polyScore, details } = polygonScore(lat,lng);
  const amenityComponent = amenity * WEIGHTS.amenity;
  const polygonComponent = polyScore * WEIGHTS.polygons;
  const penaltyComponent = penaltyRaw * WEIGHTS.penalty;
  const final = Math.max(0, Math.min(100, amenityComponent + polygonComponent - penaltyComponent));
  return {
    lat, lng,
    finalScore: final,
    components: { amenity, polygons: polyScore, penalty: penaltyRaw },
    weighted: { amenity: amenityComponent, polygons: polygonComponent, penalty: penaltyComponent },
    polyDetails: details,
    weights: getWeights()
  };
}
