import { initNav, initReveal, initWheel } from './scroll.js';
import { initBooking } from './booking.js';
import { initSite } from './site.js';

initNav();
initReveal();
initWheel();

fetch('/api/config')
  .then((response) => response.json())
  .then((config) => {
    initSite(config);
    return initBooking(config);
  })
  .catch(() => {
    const days = document.getElementById('days');
    if (days) days.innerHTML = '<p class="muted">The booking service is offline. Please call the shop.</p>';
  });
