// Lightweight ULID generator — monotonic, sortable, URL-safe
// Format: timestamp (10 chars) + random (16 chars), base32 encoded

const ENCODING = '0123456789abcdefghjkmnpqrstvwxyz'; // Crockford's Base32
const ENCODING_LEN = ENCODING.length;

let lastTime = 0;
let lastRandom: number[] = [];

function encodeTime(time: number, len: number): string {
  let str = '';
  for (let i = len - 1; i >= 0; i--) {
    const mod = time % ENCODING_LEN;
    str = ENCODING[mod] + str;
    time = Math.floor(time / ENCODING_LEN);
  }
  return str;
}

function encodeRandom(len: number): number[] {
  const arr: number[] = [];
  for (let i = 0; i < len; i++) {
    arr.push(Math.floor(Math.random() * ENCODING_LEN));
  }
  return arr;
}

function incrementRandom(random: number[]): number[] {
  const next = [...random];
  for (let i = next.length - 1; i >= 0; i--) {
    if (next[i] < ENCODING_LEN - 1) {
      next[i]++;
      return next;
    }
    next[i] = 0;
  }
  return next;
}

export function ulid(): string {
  const now = Date.now();
  if (now <= lastTime) {
    lastRandom = incrementRandom(lastRandom);
  } else {
    lastTime = now;
    lastRandom = encodeRandom(16);
  }
  const timeStr = encodeTime(now, 10);
  const randStr = lastRandom.map(i => ENCODING[i]).join('');
  return timeStr + randStr;
}

export function makeId(type: string): string {
  return `${type}:${ulid()}`;
}
