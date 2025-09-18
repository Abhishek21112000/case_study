// main.js - entry point
import { loadDatasets } from './data.js';
import { initMap, renderPolygons, renderAmenities, populateAddressSelect, attachFormHandlers, postRenderEnhancements } from './ui.js';

async function boot() {
  initMap();
  attachFormHandlers();
  try {
    await loadDatasets();
  renderPolygons();
  renderAmenities();
    populateAddressSelect();
  postRenderEnhancements();
  } catch (e) {
    const errBox = document.getElementById('errorBox');
    errBox.textContent = 'Data load failed: ' + e.message;
    console.error(e);
  }
}

document.addEventListener('DOMContentLoaded', boot);
