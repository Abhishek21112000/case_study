// ui.js - DOM & visualization helpers
import { computeHabitability, setWeights, getWeights } from './scoring.js';
import { getAddresses, getAmenities, getPolygons } from './data.js';
import { POSITIVE_TYPES, NEGATIVE_TYPES } from './scoring.js';

let map, userMarker;
const aspectColors = {
  air_quality_index:'#ff6b6b', crime_rate:'#4ecdc4', median_rent:'#45b7d1', school_quality:'#96ceb4', transit_access:'#ffeaa7'
};
const aspectLayers = {};

export function initMap() {
  map = L.map('map').setView([40.75874,-73.978674], 12.5);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom:19, attribution:'&copy; OpenStreetMap contributors' }).addTo(map);
  map.on('click', e => {
    setLatLngInputs(e.latlng.lat, e.latlng.lng);
    evaluate();
  });
}

export function renderPolygons() {
  const polygons = getPolygons();
  const byAspect = {};
  polygons.forEach(p => { (byAspect[p.aspect] = byAspect[p.aspect] || []).push(p); });
  const overlays = {};
  Object.keys(byAspect).forEach(aspect => {
    const group = L.layerGroup();
    byAspect[aspect].forEach(p => {
      const coords = p.coordinates.map(c => [c[1], c[0]]);
      L.polygon(coords, { color: aspectColors[aspect] || '#666', weight:2, fillOpacity:0.5 })
        .bindPopup(`<strong>${aspect}</strong><br>${p.zone_type}<br>Value: ${p[aspect] || p.transit_distance}`)
        .addTo(group);
    });
    overlays[aspect] = group; aspectLayers[aspect] = group;
  });
  L.control.layers(null, overlays, { collapsed:true }).addTo(map);
  ['air_quality_index','crime_rate','median_rent'].forEach(a => aspectLayers[a] && map.addLayer(aspectLayers[a]));
}

export function renderAmenities() {
  const amenities = getAmenities();
  amenities.forEach(a => {
    const positive = POSITIVE_TYPES.includes(a.type);
    const negative = NEGATIVE_TYPES.includes(a.type);
    const color = positive ? '#2ecc71' : negative ? '#e74c3c' : '#888';
    const radius = negative ? 6 : 4;
    L.circleMarker([a.latitude,a.longitude], { radius, color, fillColor:color, fillOpacity:0.85, weight:1 })
      .bindPopup(`<strong>${a.name}</strong><br>Type: ${a.type}`)
      .addTo(map);
  });
}

export function populateAddressSelect() {
  const sel = document.getElementById('sampleSelect');
  const addresses = getAddresses();
  sel.innerHTML = '<option value="">-- choose --</option>';
  addresses.slice(0,40).forEach(a => {
    const opt = document.createElement('option');
    opt.value = `${a.latitude},${a.longitude}`; opt.textContent = a.address; sel.appendChild(opt);
  });
  sel.addEventListener('change', e => {
    if (!e.target.value) return; const [lat,lng] = e.target.value.split(',').map(Number); setLatLngInputs(lat,lng); evaluate();
  });
}

function setLatLngInputs(lat,lng) {
  document.getElementById('latInput').value = lat.toFixed(6);
  document.getElementById('lngInput').value = lng.toFixed(6);
}

function placeMarker(lat,lng) {
  if (userMarker) userMarker.remove();
  userMarker = L.marker([lat,lng]).addTo(map);
  map.flyTo([lat,lng], 14);
}

export function attachFormHandlers() {
  document.getElementById('coordForm').addEventListener('submit', e => { e.preventDefault(); evaluate(); });
  document.getElementById('clearPoint').addEventListener('click', () => {
    if (userMarker) { userMarker.remove(); userMarker=null; }
    document.getElementById('scorePanel').classList.add('hidden');
    document.getElementById('errorBox').textContent='';
  });
  // weight sliders
  ['amenity','polygons','penalty'].forEach(id => {
    const el = document.getElementById('w_'+id);
    el.addEventListener('input', () => updateWeightsFromSliders());
  });
}

function updateWeightsFromSliders() {
  const a = parseFloat(document.getElementById('w_amenity').value);
  const p = parseFloat(document.getElementById('w_polygons').value);
  const n = parseFloat(document.getElementById('w_penalty').value);
  const sum = a + p + n;
  if (sum === 0) return; // avoid divide by zero
  // Normalize so displayed sliders remain raw but internal weights sum logic keeps meaning
  setWeights({ amenity: a/sum, polygons: p/sum, penalty: n/sum });
  document.getElementById('weightsDisplay').textContent = `A:${(a/sum).toFixed(2)} P:${(p/sum).toFixed(2)} Pen:${(n/sum).toFixed(2)}`;
  // Recompute if a point is set
  const latVal = parseFloat(document.getElementById('latInput').value);
  const lngVal = parseFloat(document.getElementById('lngInput').value);
  if (!Number.isNaN(latVal) && !Number.isNaN(lngVal) && document.getElementById('scorePanel').classList.contains('hidden')===false) {
    evaluate();
  }
}

export function evaluate() {
  const errBox = document.getElementById('errorBox');
  errBox.textContent='';
  const lat = parseFloat(document.getElementById('latInput').value);
  const lng = parseFloat(document.getElementById('lngInput').value);
  if (Number.isNaN(lat) || Number.isNaN(lng) || lat < 40 || lat > 41 || lng < -75 || lng > -72) {
    errBox.textContent = 'Please enter valid coordinates (rough NYC bounding box).';
    return;
  }
  placeMarker(lat,lng);
  const res = computeHabitability(lat,lng);
  renderScore(res);
}

function renderScore(res) {
  const panel = document.getElementById('scorePanel');
  panel.classList.remove('hidden');
  document.getElementById('scoreValue').textContent = res.finalScore.toFixed(1);
  const breakdown = document.getElementById('scoreBreakdown');
  const weights = res.weights;
  const polyRows = Object.entries(res.polyDetails).map(([k,v]) => `<tr><td>${k}</td><td>${v.raw}</td><td>${(v.norm*100).toFixed(1)}%</td></tr>`).join('');
  breakdown.innerHTML = `
    <table aria-label="Score components"><thead><tr><th>Component</th><th>Raw</th><th>Weighted</th></tr></thead>
    <tbody>
      <tr><td>Amenities (${(weights.amenity*100).toFixed(0)}%)</td><td>${res.components.amenity.toFixed(1)}</td><td>${res.weighted.amenity.toFixed(2)}</td></tr>
      <tr><td>Polygons (${(weights.polygons*100).toFixed(0)}%)</td><td>${res.components.polygons.toFixed(1)}</td><td>${res.weighted.polygons.toFixed(2)}</td></tr>
      <tr><td>Penalty (${(weights.penalty*100).toFixed(0)}%)</td><td>${res.components.penalty.toFixed(1)}</td><td>-${res.weighted.penalty.toFixed(2)}</td></tr>
    </tbody></table>
    <p style="margin:6px 0 2px;font-weight:600;">Polygon Attributes</p>
    <table aria-label="Polygon attributes"><thead><tr><th>Aspect</th><th>Value</th><th>Norm</th></tr></thead><tbody>${polyRows}</tbody></table>
    <p class="small" style="margin-top:4px;">Lat/Lng: ${res.lat.toFixed(5)}, ${res.lng.toFixed(5)}</p>
  `;
  // Bind popup to marker with concise summary
  if (userMarker) {
    const popupHtml = `
      <div style="font-size:0.7rem; line-height:1.15;">
        <strong>Habitability: ${res.finalScore.toFixed(1)}</strong><br>
        A:${res.weighted.amenity.toFixed(2)} P:${res.weighted.polygons.toFixed(2)} Pen:${res.weighted.penalty.toFixed(2)}<br>
        <span style="opacity:0.8;">Lat ${res.lat.toFixed(4)}, Lng ${res.lng.toFixed(4)}</span>
      </div>`;
    userMarker.bindPopup(popupHtml, { closeButton:true, autoClose:true }).openPopup();
  }
  document.getElementById('scoreValue').focus();
}

// === Theme & Polygon Opacity Controls ===
let currentOpacity = 0.5;
function applyPolygonOpacity() {
  Object.values(aspectLayers).forEach(group => {
    group.eachLayer(l => {
      if (l.setStyle) l.setStyle({ fillOpacity: currentOpacity });
    });
  });
}

function setBlendMode(enabled) {
  const mapEl = document.getElementById('map');
  if (!mapEl) return;
  // Leaflet vector panes: easiest is to toggle a class on map container
  if (enabled) mapEl.classList.add('polygon-layer-multiply'); else mapEl.classList.remove('polygon-layer-multiply');
}

export function initThemeControls() {
  const btn = document.getElementById('themeToggle');
  const showOpacityBtn = document.getElementById('showOpacity');
  const opacityBox = document.getElementById('opacityControl');
  const range = document.getElementById('polygonOpacity');
  const valEl = document.getElementById('opacityValue');
  const blendToggle = document.getElementById('blendToggle');
  const closeBtn = document.getElementById('opacityClose');
  if (!btn) return;

  // Restore persisted theme
  const persisted = localStorage.getItem('themeMode');
  if (persisted === 'dark') {
    document.documentElement.classList.add('dark');
    btn.textContent = '☀️';
  }

  btn.addEventListener('click', () => {
    const dark = document.documentElement.classList.toggle('dark');
    btn.textContent = dark ? 'Light' : 'Dark';
    localStorage.setItem('themeMode', dark ? 'dark' : 'light');
  });

  if (showOpacityBtn) {
    showOpacityBtn.addEventListener('click', () => {
      opacityBox.classList.toggle('hidden');
    });
  }

  range.addEventListener('input', () => {
    currentOpacity = parseInt(range.value,10)/100;
    valEl.textContent = `${range.value}%`;
    applyPolygonOpacity();
  });

  blendToggle.addEventListener('change', () => {
    setBlendMode(blendToggle.checked);
  });

  closeBtn.addEventListener('click', () => {
    opacityBox.classList.add('hidden');
  });
}

// Re-export needed for main bootstrap to call after map + layers
export function postRenderEnhancements() {
  // ensure opacity initial
  applyPolygonOpacity();
  // initial blend on
  setBlendMode(true);
  initThemeControls();
}
