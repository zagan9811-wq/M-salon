// Enough to keep a bored visitor from filling the week's calendar. Memory-only
// on purpose: one small server, one shop.
const hits = new Map();

export function rateLimit({ windowMs, max }) {
  return (req, res, next) => {
    const key = req.ip || 'unknown';
    const now = Date.now();
    const recent = (hits.get(key) || []).filter((stamp) => now - stamp < windowMs);

    if (recent.length >= max) {
      res.set('Retry-After', String(Math.ceil(windowMs / 1000)));
      return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
    }

    recent.push(now);
    hits.set(key, recent);

    if (hits.size > 5000) {
      for (const [ip, stamps] of hits) {
        if (stamps.every((stamp) => now - stamp > windowMs)) hits.delete(ip);
      }
    }
    return next();
  };
}
