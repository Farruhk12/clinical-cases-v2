/**
 * QR Code (byte mode, ECC M, versions 1–6). Enough for join URLs.
 * Reed–Solomon and placement follow ISO/IEC 18004.
 */

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(function initGf() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsGenerator(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array<number>(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], GF_EXP[i]);
    }
    poly = next;
  }
  return poly;
}

function rsEncode(data: number[], degree: number): number[] {
  const gen = rsGenerator(degree);
  const ecc = new Array<number>(degree).fill(0);
  for (const b of data) {
    const factor = b ^ (ecc[0] ?? 0);
    ecc.shift();
    ecc.push(0);
    if (factor === 0) continue;
    for (let i = 0; i < gen.length - 1; i++) {
      ecc[i] ^= gfMul(gen[i + 1], factor);
    }
  }
  return ecc;
}

/** version → { size, dataCodewords, eccPerBlock, blocks } for ECC M */
const VERSIONS: Record<
  number,
  { size: number; data: number; ecc: number; blocks: number }
> = {
  1: { size: 21, data: 16, ecc: 10, blocks: 1 },
  2: { size: 25, data: 28, ecc: 16, blocks: 1 },
  3: { size: 29, data: 44, ecc: 26, blocks: 1 },
  4: { size: 33, data: 64, ecc: 18, blocks: 2 },
  5: { size: 37, data: 86, ecc: 24, blocks: 2 },
  6: { size: 41, data: 108, ecc: 16, blocks: 4 },
};

const ALIGN: Record<number, number[]> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
};

function chooseVersion(payloadLen: number): number {
  const bits = 4 + 8 + payloadLen * 8 + 4;
  const need = Math.ceil(bits / 8);
  for (const v of [1, 2, 3, 4, 5, 6]) {
    if ((VERSIONS[v]?.data ?? 0) >= need) return v;
  }
  throw new Error("QR_TOO_LONG");
}

function setFinder(mod: number[][], x: number, y: number) {
  for (let dy = -1; dy <= 7; dy++) {
    for (let dx = -1; dx <= 7; dx++) {
      const xx = x + dx;
      const yy = y + dy;
      if (yy < 0 || xx < 0 || yy >= mod.length || xx >= mod.length) continue;
      const on =
        dx === -1 ||
        dx === 7 ||
        dy === -1 ||
        dy === 7 ||
        (dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6 && (dx === 0 || dx === 6 || dy === 0 || dy === 6)) ||
        (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4);
      mod[yy][xx] = on ? 1 : 0;
    }
  }
}

function setAlignment(mod: number[][], cx: number, cy: number) {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const ring = Math.max(Math.abs(dx), Math.abs(dy));
      mod[cy + dy][cx + dx] = ring === 1 ? 0 : 1;
    }
  }
}

function reserved(size: number, version: number): boolean[][] {
  const r = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  const mark = (x: number, y: number) => {
    if (y >= 0 && x >= 0 && y < size && x < size) r[y][x] = true;
  };
  for (let y = 0; y < 9; y++) {
    for (let x = 0; x < 9; x++) mark(x, y);
  }
  for (let y = 0; y < 9; y++) {
    for (let x = size - 8; x < size; x++) mark(x, y);
  }
  for (let y = size - 8; y < size; y++) {
    for (let x = 0; x < 9; x++) mark(x, y);
  }
  for (let i = 0; i < size; i++) {
    mark(i, 6);
    mark(6, i);
  }
  for (const ay of ALIGN[version] ?? []) {
    for (const ax of ALIGN[version] ?? []) {
      if ((ax === 6 && ay === 6) || (ax === 6 && ay === size - 7) || (ax === size - 7 && ay === 6)) {
        continue;
      }
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) mark(ax + dx, ay + dy);
      }
    }
  }
  if (version >= 7) {
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 3; j++) {
        mark(i, size - 11 + j);
        mark(size - 11 + j, i);
      }
    }
  }
  return r;
}

function maskBit(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0:
      return (x + y) % 2 === 0;
    case 1:
      return y % 2 === 0;
    case 2:
      return x % 3 === 0;
    case 3:
      return (x + y) % 3 === 0;
    case 4:
      return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

function penalty(mod: number[][]): number {
  const n = mod.length;
  let score = 0;
  for (let y = 0; y < n; y++) {
    let run = 1;
    for (let x = 1; x <= n; x++) {
      if (x < n && mod[y][x] === mod[y][x - 1]) run++;
      else {
        if (run >= 5) score += 3 + (run - 5);
        run = 1;
      }
    }
  }
  for (let x = 0; x < n; x++) {
    let run = 1;
    for (let y = 1; y <= n; y++) {
      if (y < n && mod[y][x] === mod[y - 1][x]) run++;
      else {
        if (run >= 5) score += 3 + (run - 5);
        run = 1;
      }
    }
  }
  for (let y = 0; y < n - 1; y++) {
    for (let x = 0; x < n - 1; x++) {
      const v = mod[y][x];
      if (mod[y][x + 1] === v && mod[y + 1][x] === v && mod[y + 1][x + 1] === v) {
        score += 3;
      }
    }
  }
  let dark = 0;
  for (const row of mod) for (const c of row) if (c) dark++;
  const percent = (dark * 100) / (n * n);
  score += 10 * Math.floor(Math.abs(percent - 50) / 5);
  return score;
}

function placeFormat(mod: number[][], mask: number) {
  // ECC M = 00, mask 3 bits. Format bits BCH(15,5).
  const data = (0b00 << 3) | mask;
  let bits = data << 10;
  const gen = 0b10100110111;
  for (let i = 14; i >= 10; i--) {
    if ((bits >>> i) & 1) bits ^= gen << (i - 10);
  }
  const format = ((data << 10) | bits) ^ 0b101010000010010;
  const n = mod.length;
  const bit = (i: number) => (format >> i) & 1;
  for (let i = 0; i <= 5; i++) mod[8][i] = bit(i);
  mod[8][7] = bit(6);
  mod[8][8] = bit(7);
  mod[7][8] = bit(8);
  for (let i = 9; i < 15; i++) mod[14 - i][8] = bit(i);
  for (let i = 0; i < 8; i++) mod[n - 1 - i][8] = bit(i);
  for (let i = 8; i < 15; i++) mod[8][n - 15 + i] = bit(i);
}

function buildMatrix(text: string): number[][] {
  const bytes = Array.from(new TextEncoder().encode(text));
  const version = chooseVersion(bytes.length);
  const spec = VERSIONS[version];
  const size = spec.size;

  const bits: number[] = [];
  const pushBits = (value: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((value >> i) & 1);
  };
  pushBits(0b0100, 4);
  pushBits(bytes.length, 8);
  for (const b of bytes) pushBits(b, 8);
  pushBits(0, Math.min(4, spec.data * 8 - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | (bits[i + j] ?? 0);
    data.push(v);
  }
  const pad = [0xec, 0x11];
  let p = 0;
  while (data.length < spec.data) {
    data.push(pad[p % 2]);
    p++;
  }

  const perBlock = spec.data / spec.blocks;
  const blocks: number[][] = [];
  for (let i = 0; i < spec.blocks; i++) {
    const slice = data.slice(i * perBlock, (i + 1) * perBlock);
    blocks.push([...slice, ...rsEncode(slice, spec.ecc)]);
  }

  const interleaved: number[] = [];
  const maxLen = Math.max(...blocks.map((b) => b.length));
  for (let i = 0; i < maxLen; i++) {
    for (const b of blocks) {
      if (i < b.length) interleaved.push(b[i]);
    }
  }

  const res = reserved(size, version);
  const base = Array.from({ length: size }, () => Array<number>(size).fill(0));

  setFinder(base, 0, 0);
  setFinder(base, size - 7, 0);
  setFinder(base, 0, size - 7);
  for (let i = 8; i < size - 8; i++) {
    base[6][i] = i % 2 === 0 ? 1 : 0;
    base[i][6] = i % 2 === 0 ? 1 : 0;
  }
  for (const ay of ALIGN[version] ?? []) {
    for (const ax of ALIGN[version] ?? []) {
      if ((ax === 6 && ay === 6) || (ax === 6 && ay === size - 7) || (ax === size - 7 && ay === 6)) {
        continue;
      }
      setAlignment(base, ax, ay);
    }
  }
  base[size - 8][8] = 1;

  let bitI = 0;
  const totalBits = interleaved.length * 8;
  const getBit = () => {
    if (bitI >= totalBits) return 0;
    const b = interleaved[Math.floor(bitI / 8)];
    const v = (b >> (7 - (bitI % 8))) & 1;
    bitI++;
    return v;
  };

  let up = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col = 5;
    for (let i = 0; i < size; i++) {
      const y = up ? size - 1 - i : i;
      for (const dx of [0, -1]) {
        const x = col + dx;
        if (res[y][x]) continue;
        base[y][x] = getBit();
      }
    }
    up = !up;
  }

  let best: number[][] | null = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const cand = base.map((row) => row.slice());
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!res[y][x] && maskBit(mask, x, y)) cand[y][x] ^= 1;
      }
    }
    placeFormat(cand, mask);
    const s = penalty(cand);
    if (s < bestScore) {
      bestScore = s;
      best = cand;
    }
  }
  return best ?? base;
}

export function qrSvg(text: string, modulePx = 6): string {
  const mod = buildMatrix(text);
  const quiet = 4;
  const n = mod.length;
  const dim = (n + quiet * 2) * modulePx;
  let rects = "";
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!mod[y][x]) continue;
      rects += `<rect x="${(x + quiet) * modulePx}" y="${(y + quiet) * modulePx}" width="${modulePx}" height="${modulePx}"/>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" width="${dim}" height="${dim}" shape-rendering="crispEdges"><rect width="${dim}" height="${dim}" fill="#fff"/>${rects}</svg>`;
}
