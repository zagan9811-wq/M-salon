// Iraqi mobile numbers: 07XX XXX XXXX, sometimes written +964 7XX ...
export function normalizePhone(raw) {
  if (typeof raw !== 'string') return null;
  const digits = raw.replace(/[^\d+]/g, '').replace(/^\+?964/, '0');
  const local = digits.startsWith('0') ? digits : `0${digits}`;
  return /^07[3-9]\d{8}$/.test(local) ? local : null;
}

export function cleanName(raw) {
  if (typeof raw !== 'string') return null;
  const name = raw.trim().replace(/\s+/g, ' ');
  return name.length >= 2 && name.length <= 60 ? name : null;
}

export function cleanNote(raw) {
  if (typeof raw !== 'string') return '';
  return raw.trim().slice(0, 200);
}

const ALPHABET = 'ACDEFGHJKLMNPQRTUVWXY34679'; // no look-alikes, easier to read aloud

export function makeReference() {
  let out = '';
  for (let i = 0; i < 6; i += 1) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return `M-${out}`;
}
