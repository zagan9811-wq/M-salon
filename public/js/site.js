/* Everything on the page that is really just the shop's own details. */

const setText = (selector, value) => {
  document.querySelectorAll(selector).forEach((node) => { node.textContent = value; });
};

/* products.json is edited by hand, so treat its contents as text, not markup. */
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function prettyPhone(raw) {
  const digits = raw.replace(/\D/g, '');
  return digits.length === 11 ? `${digits.slice(0, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}` : raw;
}

export function initSite(config) {
  const { shop, price } = config;

  document.getElementById('fact-price').textContent = price.amount;
  document.getElementById('fact-currency').textContent = price.currency;
  document.getElementById('fact-slot').textContent = config.slotMinutes;
  document.getElementById('fact-horizon').textContent = config.horizonDays;
  setText('[data-price-label]', `${price.amount} ${price.currency}`);
  setText('[data-horizon]', config.horizonDays);
  document.getElementById('year').textContent = String(new Date().getFullYear());

  document.querySelectorAll('[data-phone-link]').forEach((link) => {
    link.href = `tel:${shop.phone}`;
    if (link.classList.contains('visit__phone')) link.textContent = prettyPhone(shop.phone);
  });

  document.querySelectorAll('[data-instagram-link]').forEach((link) => {
    link.href = `https://instagram.com/${shop.instagram}`;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = `@${shop.instagram}`;
  });

  document.querySelectorAll('[data-maps-link]').forEach((link) => {
    link.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shop.mapsQuery)}`;
  });

  renderHours(config);
  wireCopyPhone(shop.phone);
  loadProducts(price);
}

function renderHours(config) {
  const table = document.getElementById('hours').querySelector('tbody');
  const todayName = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    timeZone: config.timezone
  }).format(new Date());

  table.innerHTML = '';
  config.hours.forEach((entry) => {
    const row = document.createElement('tr');
    if (entry.day === todayName) row.className = 'is-today';
    row.innerHTML =
      `<td>${entry.day}${entry.day === todayName ? ' · today' : ''}</td>` +
      `<td>${entry.closed ? 'Closed' : `${entry.open} – ${entry.close}`}</td>`;
    table.appendChild(row);
  });
}

function wireCopyPhone(phone) {
  const button = document.getElementById('copy-phone');
  if (!button) return;

  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(phone);
      button.textContent = 'Copied';
    } catch {
      button.textContent = phone;
    }
    setTimeout(() => { button.textContent = 'Copy number'; }, 2000);
  });
}

async function loadProducts(price) {
  const grid = document.getElementById('products-grid');
  const empty = document.getElementById('products-empty');

  let products = [];
  try {
    ({ products } = await (await fetch('/api/products')).json());
  } catch {
    products = [];
  }

  if (!products.length) {
    grid.remove();
    empty.hidden = false;
    return;
  }

  grid.innerHTML = '';
  products.forEach((product) => {
    const card = document.createElement('article');
    card.className = 'product';

    const image = product.image
      ? `<img class="product__img" src="${esc(product.image)}" alt="" loading="lazy">`
      : '';
    const foot = product.price
      ? `<p class="product__price">${esc(product.price)} ` +
        `<span>${esc(product.currency || price.currency)}</span></p>`
      : '';

    card.innerHTML =
      image +
      (product.brand ? `<p class="product__brand">${esc(product.brand)}</p>` : '') +
      `<h3 class="product__name">${esc(product.name)}</h3>` +
      (product.description ? `<p class="product__desc">${esc(product.description)}</p>` : '') +
      `<div class="product__foot">` +
        (product.size ? `<span class="product__size">${esc(product.size)}</span>` : '<span></span>') +
        foot +
      `</div>`;
    grid.appendChild(card);
  });
}
