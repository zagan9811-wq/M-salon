/* -------------------------------------------------------------------------
   Scrolling.

   The brief: leaving a tab should shove the page hard and then let it settle,
   never travel at a constant speed. That is ease-out-expo — the first frames
   cover most of the distance, the last second is all deceleration.
   ------------------------------------------------------------------------- */

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

/* How much of the remaining distance the page eats per frame while the wheel
   is driving it, measured at 60fps. Lower = longer, softer glide.
   0.15 is roughly what a browser does on its own and reads as steppy;
   0.05 keeps the same fast-then-fading shape as the tab jumps, only gentler.
   Anything under 0.03 starts to feel like the page is lagging behind you. */
const WHEEL_EASE = 0.05;

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

/* ------------------------------------------------------ wheel: soft glide */
/*
 * A mouse wheel moves the page in hard steps. This replaces each step with a
 * pull towards a target: every frame the page covers WHEEL_EASE of whatever
 * distance is left, which is fast at the moment of the flick and keeps fading
 * as it arrives — the same curve as a section jump, just lighter.
 *
 * Deliberately left alone: touch screens, trackpads (they carry their own
 * inertia and smoothing one on top of the other only feels late), pinch-zoom,
 * and anything scrolling inside its own box, such as the day rail.
 */
export function initWheel() {
  if (reduced.matches) return;
  if (window.matchMedia('(hover: none), (pointer: coarse)').matches) return;

  let target = window.scrollY;
  // The page is driven from a float of our own: the browser rounds scrollY to
  // whole pixels, and reading it back each frame would strand the last few.
  let current = window.scrollY;
  let animating = false;
  let previous = 0;
  let restore = null;

  const maxScroll = () =>
    Math.max(0, document.documentElement.scrollHeight - window.innerHeight);

  // The scrollbar, the keyboard and our own jumps all move the page without
  // asking us, so the target follows along whenever we are not driving.
  window.addEventListener('scroll', () => {
    if (animating) return;
    target = window.scrollY;
    current = window.scrollY;
  }, { passive: true });

  // Only a box that scrolls *vertically* gets to keep the wheel. The day rail
  // scrolls sideways, so a downward flick over it should still move the page.
  function insideOwnScroller(node) {
    for (let el = node; el && el !== document.body; el = el.parentElement) {
      const style = getComputedStyle(el);
      // A horizontal scrollbar eats a dozen pixels of clientHeight, which reads
      // as vertical overflow; only real room to move counts.
      if (/(auto|scroll)/.test(style.overflowY) && el.scrollHeight - el.clientHeight > 24) return true;
    }
    return false;
  }

  function distance(event) {
    if (event.deltaMode === 1) return event.deltaY * 18;                 // lines
    if (event.deltaMode === 2) return event.deltaY * window.innerHeight; // pages
    return event.deltaY;
  }

  function isWheel(event) {
    if (event.deltaMode !== 0) return true;
    const step = Math.abs(event.deltaY);
    return step >= 40 || (Number.isInteger(event.deltaY) && step >= 12);
  }

  window.addEventListener('wheel', (event) => {
    if (event.ctrlKey || event.defaultPrevented) return;          // pinch zoom
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;  // sideways, leave it
    if (!isWheel(event)) return;                                  // trackpad
    if (insideOwnScroller(event.target)) return;

    event.preventDefault();
    stop();                                                // the reader outranks a tab jump

    if (!animating) {
      target = window.scrollY;
      current = window.scrollY;
      previous = performance.now();
      restore = holdNativeScroll();
      animating = true;
      requestAnimationFrame(tick);
    }
    target = clamp(0, target + distance(event), maxScroll());
  }, { passive: false });

  function tick(now) {
    // Frames are not all 16.7ms — a 120Hz screen would otherwise arrive twice
    // as fast — so the per-frame pull is rescaled to however long this one took.
    const frames = clamp(0.2, (now - previous) / (1000 / 60), 4);
    previous = now;

    target = clamp(0, target, maxScroll());
    const left = target - current;

    if (Math.abs(left) < 1) {
      current = target;
      window.scrollTo(0, target);
      animating = false;
      if (restore) restore();
      restore = null;
      return;
    }

    current += left * (1 - Math.pow(1 - WHEEL_EASE, frames));
    window.scrollTo(0, current);
    requestAnimationFrame(tick);
  }
}
