/* -------------------------------------------------------------------------
   Scrolling.

   The brief: leaving a tab should shove the page hard and then let it settle,
   never travel at a constant speed. That is ease-out-expo — the first frames
   cover most of the distance, the last second is all deceleration.
   ------------------------------------------------------------------------- */

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

const easeOutExpo = (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));
const clamp = (min, value, max) => Math.max(min, Math.min(value, max));
const lerp = (a, b, t) => a + (b - a) * t;

let running = null;

function stop() {
  if (!running) return;
  cancelAnimationFrame(running.frame);
  running.release();
  running = null;
}

/* The stylesheet asks for smooth scrolling so that a hash still glides when
   this file never loads. Left on, it would fight us frame by frame, so the
   animation borrows the property and hands it back. */
function holdNativeScroll() {
  const root = document.documentElement;
  const previous = root.style.scrollBehavior;
  root.style.scrollBehavior = 'auto';
  return () => { root.style.scrollBehavior = previous; };
}

function barHeight() {
  const bar = document.querySelector('.topbar');
  return bar ? bar.getBoundingClientRect().height : 0;
}

export function scrollToTarget(el) {
  const top = window.scrollY + el.getBoundingClientRect().top - barHeight() + 1;
  scrollToY(top);
}

export function scrollToY(target) {
  stop();

  const start = window.scrollY;
  const limit = document.documentElement.scrollHeight - window.innerHeight;
  const distance = clamp(0, target, Math.max(0, limit)) - start;

  if (reduced.matches || Math.abs(distance) < 2) {
    const restore = holdNativeScroll();
    window.scrollTo(0, start + distance);
    restore();
    return;
  }

  // Long jumps get a little more time, but never enough to feel slow.
  const duration = clamp(620, 420 + Math.abs(distance) * 0.34, 1450);
  const began = performance.now();

  // Any deliberate input from the reader wins over the animation.
  const abort = () => stop();
  const events = ['wheel', 'touchstart', 'pointerdown', 'keydown'];
  events.forEach((type) => window.addEventListener(type, abort, { passive: true }));
  const restoreScroll = holdNativeScroll();
  const release = () => {
    events.forEach((type) => window.removeEventListener(type, abort));
    restoreScroll();
  };

  const step = (now) => {
    const t = clamp(0, (now - began) / duration, 1);
    window.scrollTo(0, start + distance * easeOutExpo(t));
    if (t < 1) {
      running.frame = requestAnimationFrame(step);
    } else {
      running.release();
      running = null;
    }
  };

  running = { frame: requestAnimationFrame(step), release };
}

/* ------------------------------------------------- tab bar: click + track */

export function initNav() {
  const tabs = Array.from(document.querySelectorAll('[data-tab]'));
  const slider = document.getElementById('tabs-slider');
  const sections = tabs
    .map((tab) => document.querySelector(tab.getAttribute('href')))
    .filter(Boolean);

  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href^="#"]');
    if (!link || link.getAttribute('href') === '#') return;
    const target = document.querySelector(link.getAttribute('href'));
    if (!target) return;

    event.preventDefault();
    scrollToTarget(target);
    history.replaceState(null, '', link.getAttribute('href'));
    // Keep keyboard users where they landed.
    target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  });

  if (!sections.length) return;

  let tops = [];
  const measure = () => {
    const offset = barHeight() + 2;
    tops = sections.map((section) => section.getBoundingClientRect().top + window.scrollY - offset);
  };

  const paint = () => {
    const y = window.scrollY;
    let index = 0;
    while (index < tops.length - 1 && y >= tops[index + 1]) index += 1;

    const next = Math.min(index + 1, tabs.length - 1);
    const span = Math.max(1, tops[next] - tops[index]);
    const frac = next === index ? 1 : clamp(0, (y - tops[index]) / span, 1);

    // The marker glides between two tabs instead of snapping to one.
    const from = tabs[index].getBoundingClientRect();
    const to = tabs[next].getBoundingClientRect();
    const parent = tabs[0].parentElement.getBoundingClientRect();
    const left = lerp(from.left - parent.left, to.left - parent.left, frac);
    const width = lerp(from.width, to.width, frac);

    if (slider) {
      slider.style.transform = `translateX(${left}px)`;
      slider.style.width = `${width}px`;
    }

    const active = frac > 0.5 ? next : index;
    tabs.forEach((tab, i) => {
      tab.classList.toggle('is-active', i === active);
      tab.setAttribute('aria-current', i === active ? 'true' : 'false');
    });
  };

  let queued = false;
  const onScroll = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      paint();
    });
  };

  const onResize = () => {
    measure();
    paint();
  };

  measure();
  paint();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize);
  window.addEventListener('load', onResize);
  // Sections change height as the calendar and products fill in.
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(onResize);
    sections.forEach((section) => observer.observe(section));
  }

  // A hash in the address bar should arrive with the same easing.
  if (location.hash) {
    const target = document.querySelector(location.hash);
    if (target) {
      requestAnimationFrame(() => {
        window.scrollTo(0, 0);
        scrollToTarget(target);
      });
    }
  }
}

/* ------------------------------------------------------------- reveal-in */

export function initReveal() {
  const items = document.querySelectorAll('[data-reveal]');
  if (reduced.matches || !('IntersectionObserver' in window)) {
    items.forEach((item) => item.classList.add('is-in'));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry, i) => {
        if (!entry.isIntersecting) return;
        entry.target.style.transitionDelay = `${Math.min(i, 4) * 70}ms`;
        entry.target.classList.add('is-in');
        observer.unobserve(entry.target);
      });
    },
    { rootMargin: '0px 0px -12% 0px', threshold: 0.08 }
  );

  items.forEach((item) => observer.observe(item));
}
