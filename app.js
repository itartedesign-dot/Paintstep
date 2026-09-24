/* Paintstep — scompone un dipinto in step e calcola le miscele di colore.
   Tutto gira nel browser: nessun server, nessuna dipendenza. */
'use strict';

/* =========================================================
   CORE (puro, senza DOM: testabile anche in Node)
   ========================================================= */
const PaintCore = (() => {
  const MAX_DIM = 720;

  /* ---------- colore ---------- */
  const LIN = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  const toSrgb = (v) => {
    v = Math.min(1, Math.max(0, v));
    const c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    return Math.round(c * 255);
  };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  function labFromLin(R, G, B) {
    let x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
    let y = R * 0.2126 + G * 0.7152 + B * 0.0722;
    let z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
    const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    x = f(x); y = f(y); z = f(z);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  }
  const lab = (r, g, b) => labFromLin(LIN[r], LIN[g], LIN[b]);
  const dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const hex = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
  const fromHex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const lumY = (r, g, b) => 0.2126 * LIN[r] + 0.7152 * LIN[g] + 0.0722 * LIN[b];

  /* Descrizione del colore indipendente dalla lingua: {b: base, t: tono, m: indice "grigio tendente a"} */
  function describeColor(r, g, b) {
    const [L, A, B] = lab(r, g, b);
    const C = Math.hypot(A, B);
    const hA = ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
    const t = L < 42 ? 'dark' : L > 70 ? 'light' : null;
    if (L < 12) return { b: 'nearBlack' };
    if (L > 94 && C < 6) return { b: 'white' };
    const fam = hA < 15 || hA >= 345 ? 0 : hA < 38 ? 1 : hA < 75 ? 2 : hA < 105 ? 3 : hA < 170 ? 4 : hA < 230 ? 5 : hA < 300 ? 6 : 7;
    if (C < 7) return { b: B > 3 ? 'grayWarm' : B < -4 ? 'grayCool' : 'gray', t };
    if (C < 20) {
      if ((fam === 1 || fam === 2 || fam === 3) && L < 58) return { b: 'brown', t: L < 30 ? 'dark' : null };
      return { b: 'muted', m: fam, t };
    }
    if (fam === 2 && L < 45 && C < 45) return { b: 'brown', t: L < 28 ? 'dark' : null };
    if (fam === 3 && L < 60) return { b: 'ochre', t: L < 40 ? 'dark' : null };
    const names = [L > 65 ? 'pink' : 'magenta', L > 72 ? 'pink' : 'red', 'orange', 'yellow', 'green', L > 65 ? 'sky' : 'turq', 'blue', 'violet'];
    const base = names[fam];
    return { b: base, t: base === 'pink' || base === 'sky' ? (t === 'dark' ? 'dark' : null) : t };
  }

  /* ---------- pigmenti ---------- */
  const P = (id, key, h, str = 1, extra = {}) => ({ id, key, hex: h, str, ...extra });
  const BASE = {
    acrilico: [
      P('white', 'white', '#F7F6F2', 1),
      P('yellow', 'yellowA', '#F9CF00', 0.9),
      P('magenta', 'magentaA', '#C3155E', 0.85),
      P('cyan', 'cyanA', '#0079B8', 1.1),
      P('black', 'blackA', '#1D1D20', 1.3),
    ],
    olio: [
      P('white', 'white', '#F6F4EE', 1),
      P('yellow', 'yellowO', '#FACB00', 0.9),
      P('magenta', 'magentaO', '#B8124F', 0.85),
      P('cyan', 'phthalo', '#0B5E9C', 1.2),
      P('black', 'blackO', '#1F1D1C', 1.2),
    ],
    acquerello: [
      P('water', 'water', '#FBFBF8', 1, { water: true }),
      P('yellow', 'yellowW', '#F8D10A', 0.9),
      P('magenta', 'magentaW', '#C21F66', 0.85),
      P('cyan', 'phthalo', '#0A6AAE', 1.15),
      P('black', 'payne', '#252C36', 1.1),
    ],
  };
  const EXTRA = [
    P('red', 'red', '#C8261F', 0.95),
    P('ultra', 'ultra', '#233699', 1),
    P('ochre', 'ochre', '#C4933F', 0.8),
    P('sienna', 'sienna', '#8A3B20', 0.9),
    P('umber', 'umber', '#4A3326', 1),
  ];

  function getPigments(medium, palette) {
    const list = BASE[medium].concat(palette === 'estesa' ? EXTRA : []);
    return list.map((p) => {
      const rgb = fromHex(p.hex);
      const dark = Math.max(...rgb.map((c) => LIN[c])) < 0.06;
      const ks = rgb.map((c) => {
        const R = clamp(LIN[c], dark ? 0.003 : 0.03, 0.97);
        return ((1 - R) * (1 - R)) / (2 * R);
      });
      return { ...p, rgb, ks };
    });
  }

  /* Modello Kubelka–Munk a costante singola, per canale RGB */
  function mixLin(pigs, idxs, parts) {
    let tot = 0;
    const k = [0, 0, 0];
    for (let j = 0; j < idxs.length; j++) {
      const p = pigs[idxs[j]], w = parts[j] * p.str;
      tot += w;
      k[0] += w * p.ks[0]; k[1] += w * p.ks[1]; k[2] += w * p.ks[2];
    }
    return k.map((v) => { v /= tot; return 1 + v - Math.sqrt(v * v + 2 * v); });
  }

  const gcd = (a, b) => (b ? gcd(b, a % b) : a);

  function findRecipe(rgb, pigs) {
    const tLab = lab(rgb[0], rgb[1], rgb[2]);
    const n = pigs.length;
    const errOf = (idxs, parts) => {
      const m = mixLin(pigs, idxs, parts);
      return dE(labFromLin(m[0], m[1], m[2]), tLab);
    };
    /* 1) ricerca a griglia: il miglior dosaggio per ogni combinazione di pigmenti */
    const cands = [];
    const test = (idxs, parts) => {
      const e = errOf(idxs, parts);
      const key = idxs.join(',');
      const c = cands[cands.length - 1];
      if (c && c.key === key) { if (e < c.err) { c.err = e; c.parts = parts.slice(); } }
      else cands.push({ key, idxs: idxs.slice(), parts: parts.slice(), err: e });
    };
    for (let a = 0; a < n; a++) test([a], [1]);
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++)
      for (let x = 1; x < 20; x++) test([a, b], [x, 20 - x]);
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++)
      for (let x = 1; x < 19; x++) for (let y = 1; x + y < 20; y++) test([a, b, c], [x, y, 20 - x - y]);
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++) for (let d = c + 1; d < n; d++)
      for (let x = 1; x < 10; x++) for (let y = 1; x + y < 11; y++) for (let z = 1; x + y + z < 12; z++)
        test([a, b, c, d], [x, y, z, 12 - x - y - z]);
    cands.sort((p, q) => p.err + 1.1 * p.idxs.length - (q.err + 1.1 * q.idxs.length));

    /* 2) affinamento continuo dei dosaggi e arrotondamento a parti intere */
    let best = null;
    for (const c of cands.slice(0, 40)) {
      let w = c.parts.slice(), e = c.err;
      for (let f = 1.6; f > 1.01; f = Math.sqrt(f)) {
        let improved = true, guard = 0;
        while (improved && guard++ < 40) {
          improved = false;
          for (let j = 0; j < w.length; j++) for (const m of [f, 1 / f]) {
            const w2 = w.slice(); w2[j] *= m;
            const e2 = errOf(c.idxs, w2);
            if (e2 < e - 1e-4) { w = w2; e = e2; improved = true; }
          }
        }
      }
      const mn = Math.min(...w);
      let parts = w.map((v) => Math.max(1, Math.round(v / mn)));
      const mx = Math.max(...parts);
      if (mx > 120) parts = parts.map((v) => Math.max(1, Math.round((v * 120) / mx)));
      parts = parts.map((v) => (v > 20 ? Math.round(v / 5) * 5 : v));
      const g = parts.reduce(gcd);
      parts = parts.map((v) => v / g);
      const er = errOf(c.idxs, parts);
      const score = er + 1.1 * (c.idxs.length - 1);
      if (!best || score < best.score) best = { score, err: er, idxs: c.idxs, parts };
    }

    const sum = best.parts.reduce((s, v) => s + v, 0);
    const items = best.idxs
      .map((ix, j) => ({ pig: pigs[ix], parts: best.parts[j], pct: (best.parts[j] / sum) * 100 }))
      .sort((a, b) => b.parts - a.parts);
    const mixed = mixLin(pigs, best.idxs, best.parts).map(toSrgb);
    return { items, mixed, err: best.err };
  }

  /* ---------- elaborazione immagine ---------- */
  function mulberry32(a) {
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function boxH(src, dst, w, h, r) {
    const d = 2 * r + 1;
    for (let y = 0; y < h; y++) {
      const row = y * w * 3;
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (let k = -r; k <= r; k++) sum += src[row + clamp(k, 0, w - 1) * 3 + c];
        for (let x = 0; x < w; x++) {
          dst[row + x * 3 + c] = sum / d;
          sum += src[row + Math.min(w - 1, x + r + 1) * 3 + c] - src[row + Math.max(0, x - r) * 3 + c];
        }
      }
    }
  }
  function boxV(src, dst, w, h, r) {
    const d = 2 * r + 1;
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (let k = -r; k <= r; k++) sum += src[clamp(k, 0, h - 1) * w * 3 + x * 3 + c];
        for (let y = 0; y < h; y++) {
          dst[y * w * 3 + x * 3 + c] = sum / d;
          sum += src[Math.min(h - 1, y + r + 1) * w * 3 + x * 3 + c] - src[Math.max(0, y - r) * w * 3 + x * 3 + c];
        }
      }
    }
  }
  function blur(px, w, h, radius) {
    if (radius < 1) return px;
    const rb = Math.max(1, Math.round(radius / 1.7));
    const a = Float32Array.from(px), b = new Float32Array(px.length);
    for (let i = 0; i < 3; i++) { boxH(a, b, w, h, rb); boxV(b, a, w, h, rb); }
    return a;
  }

  function kmeans(px, n, K, rnd) {
    const S = Math.min(n, 7000);
    const smp = new Float32Array(S * 3);
    for (let i = 0; i < S; i++) {
      const j = Math.floor(rnd() * n) * 3;
      smp[i * 3] = px[j]; smp[i * 3 + 1] = px[j + 1]; smp[i * 3 + 2] = px[j + 2];
    }
    const C = new Float32Array(K * 3);
    const D = new Float32Array(S).fill(Infinity);
    const f = Math.floor(rnd() * S);
    C.set(smp.subarray(f * 3, f * 3 + 3), 0);
    for (let k = 1; k < K; k++) {
      let tot = 0;
      for (let i = 0; i < S; i++) {
        const dr = smp[i * 3] - C[(k - 1) * 3], dg = smp[i * 3 + 1] - C[(k - 1) * 3 + 1], db = smp[i * 3 + 2] - C[(k - 1) * 3 + 2];
        const d = dr * dr + dg * dg + db * db;
        if (d < D[i]) D[i] = d;
        tot += D[i];
      }
      let r = rnd() * tot, pick = 0;
      for (let i = 0; i < S; i++) { r -= D[i]; if (r <= 0) { pick = i; break; } }
      C.set(smp.subarray(pick * 3, pick * 3 + 3), k * 3);
    }
    const asg = new Int16Array(S);
    for (let it = 0; it < 12; it++) {
      for (let i = 0; i < S; i++) {
        let bd = Infinity, bk = 0;
        for (let k = 0; k < K; k++) {
          const dr = smp[i * 3] - C[k * 3], dg = smp[i * 3 + 1] - C[k * 3 + 1], db = smp[i * 3 + 2] - C[k * 3 + 2];
          const d = dr * dr + dg * dg + db * db;
          if (d < bd) { bd = d; bk = k; }
        }
        asg[i] = bk;
      }
      const sum = new Float64Array(K * 3), cnt = new Uint32Array(K);
      for (let i = 0; i < S; i++) {
        const k = asg[i]; cnt[k]++;
        sum[k * 3] += smp[i * 3]; sum[k * 3 + 1] += smp[i * 3 + 1]; sum[k * 3 + 2] += smp[i * 3 + 2];
      }
      for (let k = 0; k < K; k++) if (cnt[k]) {
        C[k * 3] = sum[k * 3] / cnt[k]; C[k * 3 + 1] = sum[k * 3 + 1] / cnt[k]; C[k * 3 + 2] = sum[k * 3 + 2] / cnt[k];
      }
    }
    const pal = [];
    for (let k = 0; k < K; k++) pal.push([C[k * 3], C[k * 3 + 1], C[k * 3 + 2]].map((v) => clamp(Math.round(v), 0, 255)));
    return pal;
  }

  function quantize(px, n, pal) {
    const lut = new Int16Array(32768).fill(-1);
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const r = clamp(px[i * 3] | 0, 0, 255), g = clamp(px[i * 3 + 1] | 0, 0, 255), b = clamp(px[i * 3 + 2] | 0, 0, 255);
      const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      let k = lut[key];
      if (k < 0) {
        const cr = (r & 248) + 4, cg = (g & 248) + 4, cb = (b & 248) + 4;
        let bd = Infinity;
        for (let j = 0; j < pal.length; j++) {
          const dr = cr - pal[j][0], dg = cg - pal[j][1], db = cb - pal[j][2];
          const d = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
          if (d < bd) { bd = d; k = j; }
        }
        lut[key] = k;
      }
      out[i] = k;
    }
    return out;
  }

  function grayOf(px, n) {
    const g = new Float32Array(n);
    for (let i = 0; i < n; i++) g[i] = 0.299 * px[i * 3] + 0.587 * px[i * 3 + 1] + 0.114 * px[i * 3 + 2];
    return g;
  }
  function sobel(g, w, h) {
    const m = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = -g[i - w - 1] - 2 * g[i - 1] - g[i + w - 1] + g[i - w + 1] + 2 * g[i + 1] + g[i + w + 1];
      const gy = -g[i - w - 1] - 2 * g[i - w] - g[i - w + 1] + g[i + w - 1] + 2 * g[i + w] + g[i + w + 1];
      m[i] = Math.hypot(gx, gy) / 8;
    }
    return m;
  }
  function percentile(arr, p) {
    const hist = new Uint32Array(256);
    for (let i = 0; i < arr.length; i++) hist[Math.min(255, arr[i] | 0)]++;
    let acc = 0; const target = arr.length * p;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= target) return v; }
    return 255;
  }

  function analyzeComplexity(px, w, h) {
    const n = w * h;
    const mag = sobel(grayOf(blur(px, w, h, 1), n), w, h);
    let mean = 0; for (let i = 0; i < n; i++) mean += mag[i]; mean /= n;
    const hist = new Uint32Array(4096);
    for (let i = 0; i < n; i++) hist[((px[i * 3] >> 4) << 8) | ((px[i * 3 + 1] >> 4) << 4) | (px[i * 3 + 2] >> 4)]++;
    let bins = 0; for (let i = 0; i < 4096; i++) if (hist[i] > n * 0.0005) bins++;
    const e = clamp((mean - 3) / 18, 0, 1);
    const c = clamp((bins - 25) / 230, 0, 1);
    const score = 0.55 * e + 0.45 * c;
    return { score, steps: clamp(Math.round(6 + 14 * score), 6, 20), kmax: Math.round(12 + 16 * score) };
  }

  /* ---------- fasi, pennelli e umidità ---------- */
  function phaseKey(s, N) {
    if (s === 1) return 'sketch';
    if (s === 2) return 'block';
    if (s === N) return 'final';
    const t = (s - 2) / (N - 2);
    return t < 0.4 ? 'masses' : t < 0.7 ? 'mids' : 'define';
  }
  const PLAN = {
    acrilico: {
      sketch: { s: 'dryCanvas', b: 'damp', br: ['pencil', 'roundS'] },
      block: { s: 'dryCanvas', b: 'damp', br: ['flatL', 'filbertL'] },
      masses: { s: 'mistCanvas', b: 'damp', br: ['filbertM', 'flatM'] },
      mids: { s: 'dryCanvas', b: 'damp', br: ['filbertM', 'roundM'] },
      define: { s: 'dryCanvas', b: 'dry', br: ['roundS', 'flatS', 'fan'] },
      final: { s: 'dryCanvas', b: 'damp', br: ['liner', 'roundS'] },
    },
    olio: {
      sketch: { s: 'dryCanvas', b: 'solvent', br: ['roundS'] },
      block: { s: 'dryCanvas', b: 'solvent', br: ['flatL', 'filbertL'] },
      masses: { s: 'freshOil', b: 'dryOil', br: ['filbertM', 'flatM'] },
      mids: { s: 'freshOil', b: 'dryOil', br: ['filbertM', 'roundM'] },
      define: { s: 'freshOil', b: 'dryOil', br: ['roundS', 'fan'] },
      final: { s: 'freshOil', b: 'dryOil', br: ['liner', 'roundS'] },
    },
    acquerello: {
      sketch: { s: 'dryPaper', b: null, br: ['pencil'] },
      block: { s: 'wetPaper', b: 'loaded', br: ['flatWash', 'mop'] },
      masses: { s: 'dampPaper', b: 'loaded', br: ['mop', 'roundL'] },
      mids: { s: 'dryPaper', b: 'damp', br: ['roundM', 'roundL'] },
      define: { s: 'dryPaper', b: 'damp', br: ['roundS', 'flatS'] },
      final: { s: 'dryPaper', b: 'dry', br: ['liner', 'roundS'] },
    },
  };

  /* ---------- colori usati in uno step (eventualmente in una zona) ---------- */
  function stepSwatches(img, changed, w, h, region) {
    const R = region || { x: 0, y: 0, w, h };
    const counts = new Map();
    let total = 0;
    for (let y = R.y; y < R.y + R.h; y++) for (let x = R.x; x < R.x + R.w; x++) {
      const i = y * w + x;
      if (!changed[i]) continue;
      const key = (img[i * 4] << 16) | (img[i * 4 + 1] << 8) | img[i * 4 + 2];
      counts.set(key, (counts.get(key) || 0) + 1); total++;
    }
    const groups = [];
    [...counts.entries()].sort((a, b) => b[1] - a[1]).forEach(([key, c]) => {
      const rgb = [(key >> 16) & 255, (key >> 8) & 255, key & 255];
      const L = lab(rgb[0], rgb[1], rgb[2]);
      const g = groups.find((gr) => dE(gr.lab, L) < 8);
      if (g) { g.count += c; g.keys.add(key); }
      else groups.push({ rgb, lab: L, count: c, keys: new Set([key]) });
    });
    return groups
      .filter((g) => g.count >= Math.max(total * 0.004, 12))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
      .map((g) => ({ rgb: g.rgb, hex: hex(...g.rgb), desc: describeColor(...g.rgb), share: g.count / total, keys: g.keys }));
  }

  /* ---------- generazione degli step ---------- */
  async function buildSteps(src, medium, onProgress = () => {}) {
    const { w, h, rgba } = src;
    const n = w * h;
    const px = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { px[i * 3] = rgba[i * 4]; px[i * 3 + 1] = rgba[i * 4 + 1]; px[i * 3 + 2] = rgba[i * 4 + 2]; }
    const tick = () => new Promise((r) => setTimeout(r, 0));
    const rnd = mulberry32(1234567);
    const water = medium === 'acquerello';
    const paper = water ? [250, 249, 245] : [240, 238, 232];

    onProgress(0.03, 'wMeasure'); await tick();
    const cx = analyzeComplexity(px, w, h);
    const N = cx.steps;
    const steps = [];

    /* step 1: disegno */
    onProgress(0.08, 'wSketch'); await tick();
    const mag = sobel(grayOf(blur(px, w, h, 3), n), w, h);
    const th = Math.max(4, percentile(mag, 0.9));
    const line = water ? [118, 118, 124] : [122, 94, 76];
    let prev = new Uint8ClampedArray(n * 4);
    const changed1 = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const a = clamp((mag[i] - th) / (th * 1.5), 0, 1) * 0.85;
      prev[i * 4] = lerp(paper[0], line[0], a);
      prev[i * 4 + 1] = lerp(paper[1], line[1], a);
      prev[i * 4 + 2] = lerp(paper[2], line[2], a);
      prev[i * 4 + 3] = 255;
      if (a > 0.25) changed1[i] = 1;
    }
    const sketchSwatch = { rgb: line, hex: hex(...line), desc: { b: water ? 'sketchWat' : 'sketchOil' }, share: 1, all: true, sketch: true };
    steps.push({ img: prev, changed: changed1, phase: 'sketch', swatches: [sketchSwatch], sketch: true });

    /* step 2..N */
    const maxR = Math.max(w, h) / 26;
    const Yp = lumY(...paper);
    for (let s = 2; s <= N; s++) {
      const t = (s - 2) / (N - 2);
      onProgress(0.1 + (0.88 * (s - 1)) / (N - 1), 'wStep', { s, n: N }); await tick();
      const radius = Math.round(maxR * Math.pow(1 - t, 1.6));
      const K = Math.round(4 + (cx.kmax - 4) * Math.pow(t, 0.85));
      const bl = blur(px, w, h, radius);
      let pal = kmeans(bl, n, K, rnd);
      if (water) {
        /* acquerello: si procede dal chiaro allo scuro */
        const Lfloor = 82 * Math.pow(1 - t, 1.1);
        const Yf = Math.pow((Lfloor + 16) / 116, 3);
        pal = pal.map((c) => {
          const Y = lumY(...c);
          if (Lfloor <= 8 || Y >= Yf) return c;
          const f = (Yp - Yf) / (Yp - Y);
          return c.map((v, j) => toSrgb(LIN[paper[j]] + (LIN[v] - LIN[paper[j]]) * f));
        });
      }
      const idx = quantize(bl, n, pal);
      const img = new Uint8ClampedArray(prev);
      const changed = new Uint8Array(n);
      const thr = s === N ? 12 : 24, thr2 = thr * thr;
      for (let i = 0; i < n; i++) {
        const c = pal[idx[i]];
        const o = i * 4;
        if (s === 2) {
          const dp = (c[0] - paper[0]) ** 2 + (c[1] - paper[1]) ** 2 + (c[2] - paper[2]) ** 2;
          if (water && dp < 100) { img[o] = paper[0]; img[o + 1] = paper[1]; img[o + 2] = paper[2]; continue; }
        } else {
          const d = (c[0] - prev[o]) ** 2 + (c[1] - prev[o + 1]) ** 2 + (c[2] - prev[o + 2]) ** 2;
          if (d < thr2) continue;
        }
        img[o] = c[0]; img[o + 1] = c[1]; img[o + 2] = c[2];
        changed[i] = 1;
      }
      steps.push({ img, changed, phase: phaseKey(s, N), swatches: stepSwatches(img, changed, w, h) });
      prev = img;
    }
    onProgress(1, 'wDone');
    return { steps, w, h, complexity: cx };
  }

  return { MAX_DIM, PLAN, buildSteps, stepSwatches, getPigments, findRecipe, hex, lab, dE, describeColor, analyzeComplexity };
})();

if (typeof module !== 'undefined') module.exports = PaintCore;

/* =========================================================
   INTERFACCIA
   ========================================================= */
if (typeof document !== 'undefined') (() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];

  /* ---------- lingua ---------- */
  const LANGS = ['it', 'en', 'fr', 'es', 'de'];
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignora */ } },
  };
  let lang = store.get('paintstep-lang');
  if (!LANGS.includes(lang)) {
    const nav = (navigator.language || 'it').slice(0, 2).toLowerCase();
    lang = LANGS.includes(nav) ? nav : 'it';
  }
  const D = () => I18N[lang];
  const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? '')) : s);
  const t = (key, vars) => fill(D().ui[key] ?? I18N.it.ui[key] ?? key, vars);
  const pigName = (p) => D().pig[p.key] || I18N.it.pig[p.key];

  function colorName(desc) {
    const C = D().col;
    let base = desc.b === 'muted' ? C.muted[desc.m] : C[desc.b];
    if (!desc.t) return base;
    const tone = C[desc.t];
    if (C.order === 'post') return `${base} ${tone}`;
    if (C.lower) base = base.charAt(0).toLowerCase() + base.slice(1);
    return `${tone} ${base}`;
  }

  function applyStatic() {
    document.documentElement.lang = lang;
    $('#langSel').value = lang;
    $$('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    $$('[data-i18n-aria]').forEach((el) => el.setAttribute('aria-label', t(el.dataset.i18nAria)));
    if (state.dropError) $('#dropHint').textContent = t(state.dropError);
    if (!views.crop.hidden) updateCropDims();
    if (!views.step.hidden && state.data) render(false);
    if (!$('#sheetBackdrop').hidden && state.sheetK != null) openSheet(state.sheetK, true);
  }

  const state = {
    img: null, medium: 'acrilico', palette: 'primari', dims: null, src: null, orig: null,
    data: null, i: 0, zones: false, quad: null, split: false, splitColor: '#FFD600',
    pigs: null, recipes: new Map(), lastSwatchBtn: null, showingOrig: false, sheetK: null, dropError: null,
    workKey: null, workVars: null,
  };

  const views = { upload: $('#uploadView'), size: $('#sizeView'), crop: $('#cropView'), work: $('#workView'), step: $('#stepView') };
  const show = (name) => {
    Object.entries(views).forEach(([k, v]) => (v.hidden = k !== name));
    $('#newBtn').hidden = name === 'upload';
    window.scrollTo({ top: 0 });
  };

  $('#langSel').addEventListener('change', (e) => {
    lang = e.target.value; store.set('paintstep-lang', lang);
    applyStatic();
    if (!views.work.hidden && state.workKey) $('#workMsg').textContent = t(state.workKey, state.workVars);
  });

  /* ---------- 1. caricamento ---------- */
  const drop = $('#drop'), input = $('#fileInput');
  const setError = (key) => {
    state.dropError = key;
    $('#preview').hidden = true;
    $('#dropEmpty').hidden = false;
    $('#dropHint').textContent = t(key);
    $('#toSizeBtn').disabled = true;
  };
  function loadImage(file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => res({ img, url });
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('bad')); };
      img.src = url;
    });
  }
  async function pickFile(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) return setError('errNotImage');
    try {
      const { img, url } = await loadImage(file);
      state.img = img;
      state.dropError = null;
      $('#dropHint').textContent = t('uploadHint');
      $('#preview').src = url;
      $('#preview').hidden = false;
      $('#dropEmpty').hidden = true;
      $('#toSizeBtn').disabled = false;
    } catch {
      setError('errFormat');
    }
  }
  input.addEventListener('change', () => pickFile(input.files[0]));
  drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => pickFile(e.dataTransfer.files[0]));

  $('#toSizeBtn').addEventListener('click', () => {
    if (!state.img) return;
    state.medium = document.querySelector('input[name="medium"]:checked').value;
    state.palette = $('#paletteSel').value;
    $('#sizeErr').hidden = true;
    updatePlaceholders();
    show('size');
  });

  /* ---------- 2. misure ---------- */
  const wIn = $('#wIn'), hIn = $('#hIn');
  const num = (v) => { const x = parseFloat(String(v).replace(',', '.')); return Number.isFinite(x) && x > 0 && x <= 5000 ? x : null; };
  const fmt = (x) => String(Math.round(x * 10) / 10).replace('.', lang === 'en' ? '.' : ',');
  const imgAR = () => state.img.naturalWidth / state.img.naturalHeight;
  function updatePlaceholders() {
    const w = num(wIn.value), h = num(hIn.value);
    wIn.placeholder = h && !wIn.value ? fmt(h * imgAR()) : '';
    hIn.placeholder = w && !hIn.value ? fmt(w / imgAR()) : '';
  }
  wIn.addEventListener('input', updatePlaceholders);
  hIn.addEventListener('input', updatePlaceholders);
  [wIn, hIn].forEach((el) => el.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#sizeNextBtn').click(); }));

  $('#sizeNextBtn').addEventListener('click', () => {
    const rawW = wIn.value.trim(), rawH = hIn.value.trim();
    const w = num(rawW), h = num(rawH);
    if ((rawW && !w) || (rawH && !h)) { $('#sizeErr').textContent = t('errSize'); $('#sizeErr').hidden = false; return; }
    $('#sizeErr').hidden = true;
    const u = $('#unitSel').value;
    if (!w && !h) { state.dims = null; return analyze(fullRect()); }
    if (!w || !h) {
      state.dims = { w: w || h * imgAR(), h: h || w / imgAR(), u };
      return analyze(fullRect());
    }
    state.dims = { w, h, u };
    if (Math.abs(w / h / imgAR() - 1) < 0.01) return analyze(fullRect());
    openCrop();
  });
  $('#skipBtn').addEventListener('click', () => { state.dims = null; analyze(fullRect()); });
  const fullRect = () => ({ x: 0, y: 0, w: state.img.naturalWidth, h: state.img.naturalHeight });

  /* ---------- 3. posizionamento (sposta / zoom) ---------- */
  const cc = $('#cropCanvas'), cctx = cc.getContext('2d');
  const crop = { fw: 0, fh: 0, s: 1, sMin: 1, sMax: 5, ox: 0, oy: 0 };
  const ZOOM_MAX = 5;

  function layoutCrop(keep) {
    const box = $('#cropBox');
    const Iw = state.img.naturalWidth, Ih = state.img.naturalHeight;
    const ar = state.dims.w / state.dims.h;
    const maxW = Math.min(box.clientWidth, 640), maxH = Math.min(window.innerHeight * 0.55, 640);
    let fw = maxW, fh = fw / ar;
    if (fh > maxH) { fh = maxH; fw = fh * ar; }
    let rel = 1, cx = Iw / 2, cy = Ih / 2;
    if (keep && crop.fw) { rel = crop.s / crop.sMin; cx = crop.ox + crop.fw / crop.s / 2; cy = crop.oy + crop.fh / crop.s / 2; }
    crop.fw = fw; crop.fh = fh;
    crop.sMin = Math.max(fw / Iw, fh / Ih);
    crop.sMax = crop.sMin * ZOOM_MAX;
    crop.s = crop.sMin * rel;
    crop.ox = cx - fw / crop.s / 2; crop.oy = cy - fh / crop.s / 2;
    const dpr = window.devicePixelRatio || 1;
    cc.style.width = fw + 'px'; cc.style.height = fh + 'px';
    cc.width = Math.round(fw * dpr); cc.height = Math.round(fh * dpr);
    clampCrop(); drawCrop();
  }
  function clampCrop() {
    const Iw = state.img.naturalWidth, Ih = state.img.naturalHeight;
    crop.s = Math.min(crop.sMax, Math.max(crop.sMin, crop.s));
    crop.ox = Math.min(Iw - crop.fw / crop.s, Math.max(0, crop.ox));
    crop.oy = Math.min(Ih - crop.fh / crop.s, Math.max(0, crop.oy));
  }
  function drawCrop() {
    cctx.imageSmoothingEnabled = true; cctx.imageSmoothingQuality = 'high';
    cctx.clearRect(0, 0, cc.width, cc.height);
    cctx.drawImage(state.img, crop.ox, crop.oy, crop.fw / crop.s, crop.fh / crop.s, 0, 0, cc.width, cc.height);
    $('#zoomRange').value = Math.round((1000 * Math.log(crop.s / crop.sMin)) / Math.log(ZOOM_MAX));
  }
  function zoomAt(ns, px, py) {
    const sx = crop.ox + px / crop.s, sy = crop.oy + py / crop.s;
    crop.s = Math.min(crop.sMax, Math.max(crop.sMin, ns));
    crop.ox = sx - px / crop.s; crop.oy = sy - py / crop.s;
    clampCrop(); drawCrop();
  }
  function updateCropDims() {
    if (!state.dims) return;
    $('#cropDims').textContent = t('canvasSize', { w: fmt(state.dims.w), h: fmt(state.dims.h), u: state.dims.u });
  }
  function openCrop() {
    show('crop');
    crop.fw = 0;
    updateCropDims();
    requestAnimationFrame(() => layoutCrop(false));
  }
  window.addEventListener('resize', () => { if (!views.crop.hidden) layoutCrop(true); });

  const pts = new Map();
  cc.addEventListener('pointerdown', (e) => { cc.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); });
  cc.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    if (pts.size === 1) {
      crop.ox -= (e.clientX - p.x) / crop.s; crop.oy -= (e.clientY - p.y) / crop.s;
      p.x = e.clientX; p.y = e.clientY;
      clampCrop(); drawCrop();
    } else if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      const d0 = Math.hypot(a.x - b.x, a.y - b.y), m0 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      p.x = e.clientX; p.y = e.clientY;
      const d1 = Math.hypot(a.x - b.x, a.y - b.y), m1 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      crop.ox -= (m1.x - m0.x) / crop.s; crop.oy -= (m1.y - m0.y) / crop.s;
      const r = cc.getBoundingClientRect();
      if (d0 > 0) zoomAt(crop.s * (d1 / d0), m1.x - r.left, m1.y - r.top); else { clampCrop(); drawCrop(); }
    }
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => cc.addEventListener(ev, (e) => pts.delete(e.pointerId)));
  cc.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(crop.s * Math.exp(-e.deltaY * 0.0015), e.offsetX, e.offsetY); }, { passive: false });
  $('#zoomRange').addEventListener('input', (e) => zoomAt(crop.sMin * Math.pow(ZOOM_MAX, e.target.value / 1000), crop.fw / 2, crop.fh / 2));
  $('#zoomInBtn').addEventListener('click', () => zoomAt(crop.s * 1.2, crop.fw / 2, crop.fh / 2));
  $('#zoomOutBtn').addEventListener('click', () => zoomAt(crop.s / 1.2, crop.fw / 2, crop.fh / 2));
  $('#recenterBtn').addEventListener('click', () => layoutCrop(false));
  $('#cropBackBtn').addEventListener('click', () => show('size'));
  $('#cropNextBtn').addEventListener('click', () => analyze({ x: crop.ox, y: crop.oy, w: crop.fw / crop.s, h: crop.fh / crop.s }));

  /* ---------- 4. analisi ---------- */
  async function analyze(rect) {
    const ar = rect.w / rect.h;
    let W, H;
    if (ar >= 1) { W = Math.min(PaintCore.MAX_DIM, Math.round(rect.w)); H = Math.max(1, Math.round(W / ar)); }
    else { H = Math.min(PaintCore.MAX_DIM, Math.round(rect.h)); W = Math.max(1, Math.round(H * ar)); }
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
    x.imageSmoothingQuality = 'high';
    x.drawImage(state.img, rect.x, rect.y, rect.w, rect.h, 0, 0, W, H);
    state.src = { w: W, h: H, rgba: x.getImageData(0, 0, W, H).data };
    state.orig = new ImageData(new Uint8ClampedArray(state.src.rgba), W, H);

    state.pigs = PaintCore.getPigments(state.medium, state.palette);
    state.recipes.clear();
    show('work');
    const bar = $('#workFill'), msg = $('#workMsg');
    state.data = await PaintCore.buildSteps(state.src, state.medium, (p, key, vars) => {
      state.workKey = key; state.workVars = vars;
      bar.style.width = (p * 100).toFixed(0) + '%';
      msg.textContent = t(key, vars);
    });
    state.i = 0; state.zones = false; state.quad = null; state.split = false;
    $('#ribbon').innerHTML = state.data.steps.map(() => '<i></i>').join('');
    show('step');
    render(false);
  }

  $('#newBtn').addEventListener('click', () => { state.data = null; state.quad = null; show('upload'); });

  /* ---------- 5. step ---------- */
  const cv = $('#stepCanvas'), ctx = cv.getContext('2d');
  const off = document.createElement('canvas'), offctx = off.getContext('2d');

  function region(q) {
    const { w, h } = state.data;
    const hw = Math.floor(w / 2), hh = Math.floor(h / 2);
    return { x: q % 2 ? hw : 0, y: q > 1 ? hh : 0, w: q % 2 ? w - hw : hw, h: q > 1 ? h - hh : hh };
  }

  function dimmed(step, test) {
    const { w, h } = state.data;
    const out = new ImageData(w, h);
    const src = step.img, d = out.data;
    for (let i = 0; i < w * h; i++) {
      const o = i * 4;
      if (step.changed[i] && test(o)) { d[o] = src[o]; d[o + 1] = src[o + 1]; d[o + 2] = src[o + 2]; }
      else {
        const g = (src[o] * 0.3 + src[o + 1] * 0.59 + src[o + 2] * 0.11) * 0.22 + 60;
        d[o] = g * 0.85; d[o + 1] = g * 0.9; d[o + 2] = g * 1.1;
      }
      d[o + 3] = 255;
    }
    return out;
  }

  function drawRegion(target, tctx, data, q, scale) {
    const { w, h } = state.data;
    off.width = w; off.height = h;
    offctx.putImageData(data, 0, 0);
    const r = q == null ? { x: 0, y: 0, w, h } : region(q);
    target.width = Math.round(r.w * scale); target.height = Math.round(r.h * scale);
    tctx.imageSmoothingEnabled = true; tctx.imageSmoothingQuality = 'high';
    tctx.drawImage(off, r.x, r.y, r.w, r.h, 0, 0, target.width, target.height);
  }

  function paint() {
    const step = state.data.steps[state.i];
    let data;
    if (state.showingOrig) data = state.orig;
    else if (state.zones) data = dimmed(step, () => true);
    else data = new ImageData(new Uint8ClampedArray(step.img), state.data.w, state.data.h);
    drawRegion(cv, ctx, data, state.quad, state.quad == null ? 1 : 2);
  }

  function swatchesFor(step) {
    if (state.quad == null || step.sketch) return step.swatches;
    step.quadSw = step.quadSw || [];
    if (!step.quadSw[state.quad]) {
      step.quadSw[state.quad] = PaintCore.stepSwatches(step.img, step.changed, state.data.w, state.data.h, region(state.quad));
    }
    return step.quadSw[state.quad];
  }

  const DROP = {
    full: '<svg viewBox="0 0 16 16" aria-hidden="true"><path class="f" d="M8 1.5S3 7 3 10.2a5 5 0 0010 0C13 7 8 1.5 8 1.5z"/></svg>',
    half: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5S3 7 3 10.2a5 5 0 0010 0C13 7 8 1.5 8 1.5z"/><path class="f" d="M3.4 11.5h9.2a5 5 0 01-9.2 0z"/></svg>',
    none: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5S3 7 3 10.2a5 5 0 0010 0C13 7 8 1.5 8 1.5z"/><path d="M2 14L14 2"/></svg>',
  };
  const WETNESS = { wetPaper: 'full', loaded: 'full', mistCanvas: 'half', dampPaper: 'half', damp: 'half', solvent: 'half', freshOil: 'half' };

  function brushSVG(id) {
    const heads = {
      flatL: '<rect x="8" y="8" width="24" height="34" rx="1.5"/>',
      flatM: '<rect x="11" y="14" width="18" height="28" rx="1.5"/>',
      flatS: '<rect x="14" y="20" width="12" height="22" rx="1"/>',
      flatWash: '<rect x="3" y="18" width="34" height="24" rx="1.5"/>',
      filbertL: '<path d="M9 42V22Q9 7 20 7Q31 7 31 22V42Z"/>',
      filbertM: '<path d="M12 42V24Q12 12 20 12Q28 12 28 24V42Z"/>',
      roundL: '<path d="M10 42C10 28 15 14 20 5C25 14 30 28 30 42Z"/>',
      roundM: '<path d="M13 42C13 30 16 18 20 9C24 18 27 30 27 42Z"/>',
      roundS: '<path d="M15.5 42C15.5 32 17.5 23 20 15C22.5 23 24.5 32 24.5 42Z"/>',
      liner: '<path d="M17.5 42C17.5 28 19 12 20 2C21 12 22.5 28 22.5 42Z"/>',
      fan: '<path d="M20 42L4 17Q20 3 36 17Z"/><path d="M20 40L9 16M20 40L15 11M20 40V9M20 40L25 11M20 40L31 16" stroke="var(--bg)" stroke-width=".8" fill="none"/>',
      mop: '<path d="M9 42C5 28 11 11 20 6C29 11 35 28 31 42Z"/>',
    };
    const ferr = { flatL: [9, 31], flatM: [12, 28], flatS: [15, 25], flatWash: [5, 35], filbertL: [10, 30], filbertM: [13, 27], roundL: [12, 28], roundM: [14, 26], roundS: [16, 24], liner: [17.5, 22.5], fan: [16, 24], mop: [11, 29] };
    let body;
    if (id === 'pencil') {
      body = '<path d="M15 34H25V92H15Z"/><path d="M15 33L20 14L25 33Z" opacity=".55"/><path d="M18.3 20.5L20 14L21.7 20.5Z"/>';
    } else {
      const [a, b] = ferr[id];
      body = heads[id] +
        `<path d="M${a} 43.5H${b}L23.5 58H16.5Z" opacity=".55"/>` +
        '<path d="M16.5 59.5H23.5L22 93Q20 96 18 93Z"/>';
    }
    return `<svg viewBox="0 0 40 96" fill="currentColor" aria-hidden="true">${body}</svg>`;
  }

  function render(animate = true) {
    const { steps } = state.data;
    const step = steps[state.i];
    const N = steps.length;
    const draw = () => { paint(); cv.classList.remove('fading'); };
    if (animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) { cv.classList.add('fading'); setTimeout(draw, 140); }
    else draw();

    [...$('#ribbon').children].forEach((el, j) => { el.className = j < state.i ? 'done' : j === state.i ? 'now' : ''; });

    /* testi della fase */
    const group = state.medium === 'acquerello' ? 'wat' : 'paint';
    const ph = D().phase;
    const title = (group === 'wat' ? ph.wat.title : ph.paint.title)[step.phase];
    let desc = group === 'wat' ? ph.wat.desc[step.phase] : ph.paint.desc[step.phase];
    if (state.medium === 'olio' && ph.oil.desc[step.phase]) desc = ph.oil.desc[step.phase];
    $('#stepNum').textContent = t('stepOf', { i: state.i + 1, n: N });
    $('#stepTitle').textContent = title;
    $('#stepDesc').textContent = desc;
    $('#zonesBtn').setAttribute('aria-pressed', String(state.zones));

    /* modalità parte (figlio) */
    const inQuad = state.quad != null;
    $('#quadLabel').hidden = !inQuad;
    if (inQuad) $('#quadLabel').textContent = t('quadTitle', { q: t('q' + state.quad) });
    $('#backWholeBtn').hidden = !inQuad;
    $('#rail').hidden = inQuad;
    $('#splitGrid').hidden = !state.split || inQuad;
    $('#splitColors').hidden = !state.split;
    $('#splitBtn').setAttribute('aria-pressed', String(state.split));
    $('#frame').style.setProperty('--split', state.splitColor);
    $$('#splitColors button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.c === state.splitColor)));
    $$('#splitGrid button').forEach((b) => b.setAttribute('aria-label', t('openQuad', { q: t('q' + b.dataset.q) })));

    /* misure */
    const si = $('#sizeInfo');
    if (state.dims) {
      const d = state.dims;
      si.hidden = false;
      si.textContent = inQuad
        ? t('quadSize', { w: fmt(d.w / 2), h: fmt(d.h / 2), u: d.u })
        : t('canvasSize', { w: fmt(d.w), h: fmt(d.h), u: d.u }) + (state.split ? ' · ' + t('quadSize', { w: fmt(d.w / 2), h: fmt(d.h / 2), u: d.u }) : '');
    } else si.hidden = true;

    /* colori */
    const sw = $('#swatches');
    sw.innerHTML = '';
    const list = swatchesFor(step);
    if (!list.length) sw.innerHTML = `<p class="no-swatch">${t('noSwatch')}</p>`;
    list.forEach((s, k) => {
      const b = document.createElement('button');
      b.className = 'swatch';
      const name = colorName(s.desc);
      b.setAttribute('aria-label', t('openColor', { n: name, h: s.hex }));
      b.innerHTML = `<span class="swatch-color" style="background:${s.hex}"></span><small><b>${name}</b>${s.sketch ? t('lines') : t('share', { p: Math.max(1, Math.round(s.share * 100)) })}</small>`;
      b.addEventListener('click', () => { state.lastSwatchBtn = b; openSheet(k); });
      sw.appendChild(b);
    });

    /* pennelli e umidità */
    const plan = PaintCore.PLAN[state.medium][step.phase];
    $('#brushes').innerHTML = plan.br.map((id) => `<figure class="brush">${brushSVG(id)}<figcaption>${D().brush[id]}</figcaption></figure>`).join('');
    const badge = (k) => `<span class="badge">${DROP[WETNESS[k] || 'none']}${D().surf[k]}</span>`;
    $('#badges').innerHTML = badge(plan.s) + (plan.b ? badge(plan.b) : '');

    $('#prevBtn').disabled = state.i === 0;
    $('#nextBtn').disabled = state.i === N - 1;
  }

  const go = (d) => {
    if (!state.data) return;
    const j = state.i + d;
    if (j < 0 || j >= state.data.steps.length) return;
    state.i = j; render();
  };
  $('#prevBtn').addEventListener('click', () => go(-1));
  $('#nextBtn').addEventListener('click', () => go(1));
  $('#zonesBtn').addEventListener('click', () => { state.zones = !state.zones; $('#zonesBtn').setAttribute('aria-pressed', String(state.zones)); paint(); });

  /* dividi opera */
  $('#splitBtn').addEventListener('click', () => { state.split = !state.split; render(false); });
  $$('#splitColors button').forEach((b) => b.addEventListener('click', () => { state.splitColor = b.dataset.c; render(false); }));
  $$('#splitGrid button').forEach((b) => b.addEventListener('click', () => {
    state.quad = Number(b.dataset.q);
    render();
    $('#frame').scrollIntoView({ block: 'nearest' });
  }));
  $('#backWholeBtn').addEventListener('click', () => { state.quad = null; render(); });

  const ob = $('#origBtn');
  const setOrig = (v) => { if (!state.data) return; state.showingOrig = v; paint(); };
  ob.addEventListener('pointerdown', (e) => { e.preventDefault(); setOrig(true); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => ob.addEventListener(ev, () => state.showingOrig && setOrig(false)));
  ob.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setOrig(true); } });
  ob.addEventListener('keyup', () => setOrig(false));
  ob.addEventListener('contextmenu', (e) => e.preventDefault());

  $('#dlBtn').addEventListener('click', () => {
    cv.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `paintstep-step-${String(state.i + 1).padStart(2, '0')}${state.quad != null ? '-part' + (state.quad + 1) : ''}.png`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, 'image/png');
  });

  let tx = null, ty = null;
  const frame = $('#frame');
  frame.addEventListener('touchstart', (e) => { tx = e.touches[0].clientX; ty = e.touches[0].clientY; }, { passive: true });
  frame.addEventListener('touchend', (e) => {
    if (tx === null) return;
    const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
    tx = ty = null;
  });

  document.addEventListener('keydown', (e) => {
    if (!$('#contactBackdrop').hidden) { if (e.key === 'Escape') closeContact(); return; }
    if (!$('#sheetBackdrop').hidden) { if (e.key === 'Escape') closeSheet(); return; }
    if (views.step.hidden) return;
    if (e.target.matches('input, select, textarea')) return;
    if (e.key === 'ArrowRight') go(1);
    if (e.key === 'ArrowLeft') go(-1);
    if (e.key === 'Escape' && state.quad != null) { state.quad = null; render(); }
  });

  /* ---------- scheda colore ---------- */
  function openSheet(k, refresh) {
    const step = state.data.steps[state.i];
    const s = swatchesFor(step)[k];
    if (!s) return;
    state.sheetK = k;
    let rec = state.recipes.get(s.hex);
    if (!rec) { rec = PaintCore.findRecipe(s.rgb, state.pigs); state.recipes.set(s.hex, rec); }

    $('#sheetSwatch').style.background = s.hex;
    $('#sheetHex').textContent = `${colorName(s.desc)} ${s.hex}`;
    $('#recipe').innerHTML = rec.items.map((it) => `
      <div class="rc-row">
        <span class="rc-dot" style="background:${it.pig.hex}"></span>
        <div><div class="rc-name">${pigName(it.pig)}</div><div class="rc-bar"><i style="width:${Math.max(2, it.pct)}%"></i></div></div>
        <div class="rc-parts"><b>${it.parts}</b> ${it.parts === 1 ? t('part') : t('parts')}<small>${it.pct < 2 ? t('pinch') : Math.round(it.pct) + '%'}</small></div>
      </div>`).join('');
    $('#cmpTarget').style.background = s.hex;
    $('#cmpMix').style.background = PaintCore.hex(...rec.mixed);
    const q = t(rec.err < 3 ? 'm0' : rec.err < 6 ? 'm1' : rec.err < 12 ? 'm2' : 'm3');
    $('#cmpNote').textContent = t('matchLbl', { q });

    const src = step.img;
    const im = s.all ? dimmed(step, () => true) : dimmed(step, (o) => s.keys.has((src[o] << 16) | (src[o + 1] << 8) | src[o + 2]));
    drawRegion($('#whereCanvas'), $('#whereCanvas').getContext('2d'), im, state.quad, 1);
    $('#sheetTip').textContent = D().tips[state.medium];

    if (refresh) return;
    $('#sheetBackdrop').hidden = false;
    document.body.style.overflow = 'hidden';
    $('#sheetBackdrop').querySelector('.sheet').scrollTop = 0;
    $('#sheetClose').focus();
  }
  function closeSheet() {
    $('#sheetBackdrop').hidden = true;
    state.sheetK = null;
    document.body.style.overflow = '';
    if (state.lastSwatchBtn && document.body.contains(state.lastSwatchBtn)) state.lastSwatchBtn.focus();
  }
  $('#sheetClose').addEventListener('click', closeSheet);
  $('#sheetBackdrop').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeSheet(); });

  /* ---------- supporto (PayPal) e contatti ---------- */
  const CONTACT_EMAIL = 'itartedesign@gmail.com';
  const PAYPAL_EMAIL = 'buono.p@alice.it';
  /* Se crei un link paypal.me (es. https://paypal.me/tuonome), mettilo qui:
     sul telefono apre direttamente l'app PayPal. */
  const PAYPAL_ME = '';
  $('#ppBtn').href = PAYPAL_ME || 'https://www.paypal.com/donate/?business=' + encodeURIComponent(PAYPAL_EMAIL) +
    '&no_recurring=0&item_name=' + encodeURIComponent('Paintstep ☕') + '&currency_code=EUR';

  let contactOpener = null;
  function openContact() {
    contactOpener = document.activeElement;
    $('#contactForm').hidden = false;
    $('#contactOk').hidden = true;
    $('#contactErr').hidden = true;
    $('#contactBackdrop').hidden = false;
    document.body.style.overflow = 'hidden';
    $('#cName').focus();
  }
  function closeContact() {
    $('#contactBackdrop').hidden = true;
    document.body.style.overflow = '';
    if (contactOpener) contactOpener.focus();
  }
  $('#contactBtn').addEventListener('click', openContact);
  $('#contactClose').addEventListener('click', closeContact);
  $('#contactBackdrop').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeContact(); });

  $('#contactForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const name = f.name.value.trim(), email = f.email.value.trim(), message = f.message.value.trim();
    const err = $('#contactErr'), btn = $('#contactSend');
    if (!name || !message) { err.textContent = t('cErrFields'); err.hidden = false; return; }
    if (f._honey.value) return;
    err.hidden = true;
    btn.disabled = true; btn.textContent = t('cSending');
    try {
      const res = await fetch('https://formsubmit.co/ajax/' + CONTACT_EMAIL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          name, email: email || '-', message,
          _subject: 'Paintstep: messaggio da ' + name,
          _template: 'table', _captcha: 'false',
          ...(email ? { _replyto: email } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || String(data.success) === 'false') throw new Error('send');
      $('#contactOk').textContent = t('cSent', { n: name });
      $('#contactOk').hidden = false;
      f.hidden = true;
      f.reset();
    } catch {
      err.textContent = t('cErr');
      err.hidden = false;
    } finally {
      btn.disabled = false; btn.textContent = t('cSend');
    }
  });

  applyStatic();
})();
