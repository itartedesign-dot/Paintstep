/* Paintstep — scompone un dipinto in step e calcola le miscele di colore.
   Tutto gira nel browser: nessun server, nessuna dipendenza. */
'use strict';

/* =========================================================
   CORE (puro, senza DOM: testabile anche in Node)
   ========================================================= */
const PaintCore = (() => {
  const MAX_DIM = 1080;

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

  function downsample(px, w, h, maxDim) {
    const s = Math.max(w, h) / maxDim;
    if (s <= 1) return { px, w, h };
    const W = Math.max(1, Math.round(w / s)), H = Math.max(1, Math.round(h / s));
    const out = new Float32Array(W * H * 3);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const sx = Math.min(w - 1, Math.floor(x * s)), sy = Math.min(h - 1, Math.floor(y * s));
      const i = (sy * w + sx) * 3, o = (y * W + x) * 3;
      out[o] = px[i]; out[o + 1] = px[i + 1]; out[o + 2] = px[i + 2];
    }
    return { px: out, w: W, h: H };
  }
  function analyzeComplexity(px0, w0, h0) {
    const { px, w, h } = downsample(px0, w0, h0, 720);
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

  /* =========================================================
     PROFONDITÀ
     depth: Uint8Array, 0 = lontano, 255 = vicino
     ========================================================= */
  function boxBlur1(src, w, h, r) {
    if (r < 1) return Float32Array.from(src);
    let a = Float32Array.from(src), b = new Float32Array(src.length);
    const d = 2 * r + 1;
    for (let pass = 0; pass < 3; pass++) {
      for (let y = 0; y < h; y++) {
        const row = y * w;
        let sum = 0;
        for (let k = -r; k <= r; k++) sum += a[row + clamp(k, 0, w - 1)];
        for (let x = 0; x < w; x++) {
          b[row + x] = sum / d;
          sum += a[row + Math.min(w - 1, x + r + 1)] - a[row + Math.max(0, x - r)];
        }
      }
      for (let x = 0; x < w; x++) {
        let sum = 0;
        for (let k = -r; k <= r; k++) sum += b[clamp(k, 0, h - 1) * w + x];
        for (let y = 0; y < h; y++) {
          a[y * w + x] = sum / d;
          sum += b[Math.min(h - 1, y + r + 1) * w + x] - b[Math.max(0, y - r) * w + x];
        }
      }
    }
    return a;
  }

  function normalize8(arr) {
    const n = arr.length;
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < n; i++) { if (arr[i] < mn) mn = arr[i]; if (arr[i] > mx) mx = arr[i]; }
    /* percentili 2–98 per robustezza */
    const hist = new Uint32Array(1024);
    const span = mx - mn || 1;
    for (let i = 0; i < n; i++) hist[Math.min(1023, (((arr[i] - mn) / span) * 1023) | 0)]++;
    let acc = 0, lo = 0, hi = 1023;
    for (let v = 0; v < 1024; v++) { acc += hist[v]; if (acc >= n * 0.02) { lo = v; break; } }
    acc = 0;
    for (let v = 1023; v >= 0; v--) { acc += hist[v]; if (acc >= n * 0.02) { hi = v; break; } }
    const a = mn + (lo / 1023) * span, b = mn + (hi / 1023) * span;
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = clamp(Math.round(((arr[i] - a) / (b - a || 1)) * 255), 0, 255);
    return out;
  }

  /* Metodo semplificato: in basso, dettagliato e saturo = vicino */
  function heuristicDepth(px, w, h) {
    const n = w * h;
    const mag = sobel(grayOf(blur(px, w, h, 2), n), w, h);
    const det = boxBlur1(mag, w, h, Math.round(Math.max(w, h) / 40));
    const sat = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const r = px[i * 3], g = px[i * 3 + 1], b = px[i * 3 + 2];
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      sat[i] = mx ? (mx - mn) / mx : 0;
    }
    const satB = boxBlur1(sat, w, h, Math.round(Math.max(w, h) / 40));
    let dMax = 0; for (let i = 0; i < n; i++) if (det[i] > dMax) dMax = det[i];
    /* salienza: distanza dai colori dei bordi (lo sfondo di solito tocca i bordi, il soggetto no) */
    const bw = Math.max(2, Math.round(Math.min(w, h) * 0.03));
    const border = [];
    for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
      if (x < bw || y < bw || x >= w - bw || y >= h - bw) { const i = y * w + x; border.push(px[i * 3], px[i * 3 + 1], px[i * 3 + 2]); }
    }
    const bpal = kmeans(Float32Array.from(border), border.length / 3, 6, mulberry32(99));
    const sal = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let bd = Infinity;
      for (const c of bpal) { const d = (px[i * 3] - c[0]) ** 2 + (px[i * 3 + 1] - c[1]) ** 2 + (px[i * 3 + 2] - c[2]) ** 2; if (d < bd) bd = d; }
      sal[i] = Math.sqrt(bd);
    }
    const salB = boxBlur1(sal, w, h, Math.round(Math.max(w, h) / 50));
    const sv = Array.from(salB).sort((a, b) => a - b);
    const sHi = sv[Math.floor(sv.length * 0.95)] || 1;
    const raw = new Float32Array(n);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const center = 1 - Math.min(1, Math.hypot((x / w - 0.5) * 1.4, (y / h - 0.5) * 1.2));
      raw[i] = 0.25 * (y / (h - 1 || 1)) + 0.3 * Math.min(1, salB[i] / sHi) + 0.2 * (det[i] / (dMax || 1)) + 0.15 * center + 0.1 * satB[i];
    }
    return normalize8(boxBlur1(raw, w, h, Math.round(Math.max(w, h) / 60)));
  }

  function prepareDepth(raw, w, h) {
    return normalize8(boxBlur1(raw, w, h, 2));
  }

  /* Divide la profondità in L strati (k-means 1D, con ripiego a quantili) */
  function depthBands(depth, n, L, reserved) {
    const hist = new Float64Array(256);
    let tot = 0;
    for (let i = 0; i < n; i++) if (!reserved[i]) { hist[depth[i]]++; tot++; }
    const quantile = (q) => { let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= tot * q) return v; } return 255; };
    let C = Array.from({ length: L }, (_, k) => quantile((k + 0.5) / L));
    for (let it = 0; it < 30; it++) {
      const s = new Float64Array(L), c = new Float64Array(L);
      for (let v = 0; v < 256; v++) {
        if (!hist[v]) continue;
        let bk = 0, bd = Infinity;
        for (let k = 0; k < L; k++) { const d = Math.abs(v - C[k]); if (d < bd) { bd = d; bk = k; } }
        s[bk] += v * hist[v]; c[bk] += hist[v];
      }
      C = C.map((old, k) => (c[k] ? s[k] / c[k] : old));
    }
    C.sort((a, b) => a - b);
    const lut = new Uint8Array(256);
    for (let v = 0; v < 256; v++) {
      let bk = 0, bd = Infinity;
      for (let k = 0; k < L; k++) { const d = Math.abs(v - C[k]); if (d < bd) { bd = d; bk = k; } }
      lut[v] = bk;
    }
    const area = new Float64Array(L);
    for (let v = 0; v < 256; v++) area[lut[v]] += hist[v];
    if ([...area].some((a) => a < tot * 0.04)) {
      /* strati troppo piccoli: uso quantili ad area uguale */
      const cuts = Array.from({ length: L - 1 }, (_, k) => quantile((k + 1) / L));
      for (let v = 0; v < 256; v++) { let k = 0; while (k < cuts.length && v > cuts[k]) k++; lut[v] = k; }
    }
    const band = new Uint8Array(n);
    for (let i = 0; i < n; i++) band[i] = lut[depth[i]];
    return band;
  }

  /* =========================================================
     IMMAGINI OBIETTIVO
     ========================================================= */
  /* Sfocatura che usa solo i pixel della maschera (lo sfondo non si "sporca" col colore del soggetto) */
  function maskedBlur(px, w, h, radius, mask) {
    const n = w * h;
    const m3 = new Float32Array(n * 3), m1 = new Float32Array(n);
    for (let i = 0; i < n; i++) if (mask[i]) { m3[i * 3] = px[i * 3]; m3[i * 3 + 1] = px[i * 3 + 1]; m3[i * 3 + 2] = px[i * 3 + 2]; m1[i] = 1; }
    const num = blur(m3, w, h, radius), den = boxBlur1(m1, w, h, Math.max(1, Math.round(radius / 1.7)));
    const out = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const d = den[i];
      if (d > 0.02) { out[i * 3] = num[i * 3] / d; out[i * 3 + 1] = num[i * 3 + 1] / d; out[i * 3 + 2] = num[i * 3 + 2] / d; }
      else { out[i * 3] = px[i * 3]; out[i * 3 + 1] = px[i * 3 + 1]; out[i * 3 + 2] = px[i * 3 + 2]; }
    }
    return out;
  }
  /* Colore DOMINANTE di ogni zona (come la base che stende il pittore), non la media:
     blu con riflessi arancioni resta blu, non diventa marrone */
  function dominantTarget(px, w, h, mask, K, radius, rnd, lighten, paper) {
    const n = w * h;
    const soft = blur(px, w, h, 2);
    const sub = [];
    const stride = Math.max(1, Math.floor(n / 60000));
    for (let i = 0; i < n; i += stride) if (mask[i]) sub.push(soft[i * 3], soft[i * 3 + 1], soft[i * 3 + 2]);
    if (sub.length < 30) return null;
    let pal = kmeans(Float32Array.from(sub), sub.length / 3, K, rnd);
    const idx = quantize(soft, n, pal);
    const best = new Float32Array(n).fill(-1), win = new Uint8Array(n);
    const r = Math.max(1, Math.round(radius / 1.7));
    for (let k = 0; k < pal.length; k++) {
      const ind = new Float32Array(n);
      let any = false;
      for (let i = 0; i < n; i++) if (mask[i] && idx[i] === k) { ind[i] = 1; any = true; }
      if (!any) continue;
      const b = boxBlur1(ind, w, h, r);
      for (let i = 0; i < n; i++) if (b[i] > best[i]) { best[i] = b[i]; win[i] = k; }
    }
    if (lighten != null) {
      const Yp = lumY(...paper), Yf = Math.pow((lighten + 16) / 116, 3);
      pal = pal.map((c) => {
        const Y = lumY(...c);
        if (Y >= Yf) return c;
        const f = (Yp - Yf) / (Yp - Y);
        return c.map((v, j) => toSrgb(LIN[paper[j]] + (LIN[v] - LIN[paper[j]]) * f));
      });
    }
    const T = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) {
      const c = pal[best[i] > 0 ? win[i] : idx[i]];
      T[i * 4] = c[0]; T[i * 4 + 1] = c[1]; T[i * 4 + 2] = c[2]; T[i * 4 + 3] = 255;
    }
    return T;
  }

  /* Completa il soggetto riconosciuto dall'IA: aggiunge le zone vicine con gli stessi colori
     e la stessa profondità (piume sfrangiate, parti in ombra che il modello non ha preso) */
  function growSubject(fg, T, depth, w, h, reserved, maxDist, cat = null, strongDepth = false) {
    const n = w * h;
    const inS = new Uint32Array(32768), all = new Uint32Array(32768);
    let fgA = 0;
    const dS = [];
    for (let i = 0; i < n; i++) {
      const k = key15(T, i * 4);
      all[k]++;
      if (fg[i]) { inS[k]++; fgA++; dS.push(depth[i]); }
    }
    if (!fgA) return fg;
    dS.sort((a, b) => a - b);
    const dThr = (dS[Math.floor(dS.length * 0.25)] ?? 0) - 8;
    /* con il modello di profondità (IA): ciò che è attaccato al soggetto e alla sua stessa distanza è soggetto */
    const dNear = dS[Math.floor(dS.length * 0.4)] ?? 255;
    /* colori tipici del soggetto: quelli che coprono l'85% del soggetto riconosciuto */
    const keys = []; for (let k = 0; k < 32768; k++) if (inS[k]) keys.push(k);
    keys.sort((a, b) => inS[b] - inS[a]);
    const labOf = (k) => lab(((k >> 10) & 31) * 8 + 4, ((k >> 5) & 31) * 8 + 4, (k & 31) * 8 + 4);
    const pal = [];
    let acc = 0;
    for (const k of keys) { pal.push(labOf(k)); acc += inS[k]; if (acc >= fgA * 0.8 || pal.length >= 50) break; }
    const ok = new Uint8Array(32768);
    for (let k = 0; k < 32768; k++) {
      if (!all[k]) continue;
      if (inS[k] >= Math.max(10, fgA * 0.0005) && inS[k] / all[k] >= 0.25) { ok[k] = 1; continue; }
      const L = labOf(k);
      for (const P of pal) if (dE(L, P) < 10) { ok[k] = 1; break; }
    }
    const out = fg.slice();
    let front = [];
    for (let i = 0; i < n; i++) if (fg[i]) front.push(i);
    for (let d = 0; d < maxDist && front.length; d++) {
      const next = [];
      for (const i of front) {
        const x = i % w;
        const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w];
        for (const j of nb) {
          if (j < 0 || j >= n || out[j] || reserved[j]) continue;
          const colorOk = ok[key15(T, j * 4)] && depth[j] >= dThr;
          const depthOk = strongDepth && depth[j] >= dNear && !(cat && cat[j] === 3);
          if (!colorOk && !depthOk) continue;
          out[j] = 1; next.push(j);
        }
      }
      front = next;
    }
    return out;
  }

  function quantTarget(px, w, h, radius, K, rnd, lighten, paper, accents = false, preBlurred = null) {
    const n = w * h;
    const bl = preBlurred || blur(px, w, h, radius);
    let pal = kmeans(bl, n, K, rnd);
    if (accents) pal = pal.concat(accentColors(bl, n, pal, rnd));
    if (lighten != null) {
      const Yp = lumY(...paper), Yf = Math.pow((lighten + 16) / 116, 3);
      pal = pal.map((c) => {
        const Y = lumY(...c);
        if (Y >= Yf) return c;
        const f = (Yp - Yf) / (Yp - Y);
        return c.map((v, j) => toSrgb(LIN[paper[j]] + (LIN[v] - LIN[paper[j]]) * f));
      });
    }
    const idx = quantize(bl, n, pal);
    const T = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) { const c = pal[idx[i]]; T[i * 4] = c[0]; T[i * 4 + 1] = c[1]; T[i * 4 + 2] = c[2]; T[i * 4 + 3] = 255; }
    return T;
  }
  /* Colori piccoli ma distinti (becchi, fiori, luci…) che la media per area cancellerebbe */
  function accentColors(px, n, pal, rnd) {
    const stride = Math.max(1, Math.floor(n / 80000));
    const res = [];
    for (let i = 0; i < n; i += stride) {
      const r = px[i * 3], g = px[i * 3 + 1], b = px[i * 3 + 2];
      let bd = Infinity;
      for (const c of pal) { const d = (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2; if (d < bd) bd = d; }
      if (bd > 48 * 48) res.push(r, g, b);
    }
    const count = res.length / 3;
    if (count * stride < n * 0.0006) return [];
    const K = Math.min(6, Math.max(1, Math.round(count / 150)));
    return kmeans(Float32Array.from(res), count, K, rnd);
  }
  function rgbaFrom(px, n) {
    const T = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) { T[i * 4] = px[i * 3]; T[i * 4 + 1] = px[i * 3 + 1]; T[i * 4 + 2] = px[i * 3 + 2]; T[i * 4 + 3] = 255; }
    return T;
  }

  /* =========================================================
     PENNELLATE SIMULATE
     ========================================================= */
  function orientationField(px, w, h) {
    const n = w * h;
    const g = grayOf(blur(px, w, h, 4), n);
    const ang = new Float32Array(n);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let gx = 0, gy = 0;
      if (x > 0 && x < w - 1 && y > 0 && y < h - 1) {
        gx = -g[i - w - 1] - 2 * g[i - 1] - g[i + w - 1] + g[i - w + 1] + 2 * g[i + 1] + g[i + w + 1];
        gy = -g[i - w - 1] - 2 * g[i - w] - g[i - w + 1] + g[i + w - 1] + 2 * g[i + w] + g[i + w + 1];
      }
      ang[i] = Math.hypot(gx, gy) > 12
        ? Math.atan2(gy, gx) + Math.PI / 2
        : -0.35 + 0.3 * Math.sin(x * 0.05 + y * 0.031);
    }
    return ang;
  }

  function dilate(mask, w, h, r) {
    if (r < 1) return mask;
    const f = boxBlur1(mask, w, h, Math.ceil(r / 1.7));
    const out = new Uint8Array(w * h);
    for (let i = 0; i < out.length; i++) out[i] = f[i] > 0.02 ? 1 : 0;
    return out;
  }

  const cdiff = (A, o, B, q) => Math.abs(A[o] - B[q]) + Math.abs(A[o + 1] - B[q + 1]) + Math.abs(A[o + 2] - B[q + 2]);

  function paintStrokes(env, T, mask, R, thr, opt = {}) {
    const { w, h, ctx, layer, lctx, maskCv, mctx, orient, rnd } = env;
    const cur = ctx.getImageData(0, 0, w, h).data;
    const pts = [];
    const stepG = Math.max(1, R * 0.9);
    for (let gy = stepG / 2; gy < h; gy += stepG) for (let gx = stepG / 2; gx < w; gx += stepG) {
      const x = clamp(Math.round(gx + (rnd() - 0.5) * stepG * 0.7), 0, w - 1);
      const y = clamp(Math.round(gy + (rnd() - 0.5) * stepG * 0.7), 0, h - 1);
      const i = y * w + x;
      if (!mask[i]) continue;
      if (cdiff(T, i * 4, cur, i * 4) < thr) continue;
      pts.push(i);
    }
    if (!pts.length) return 0;
    for (let i = pts.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pts[i], pts[j]] = [pts[j], pts[i]]; }

    lctx.clearRect(0, 0, w, h);
    lctx.globalCompositeOperation = 'source-over';
    lctx.lineCap = 'round'; lctx.lineJoin = 'round';
    lctx.lineWidth = Math.max(1, 2 * R);
    const maxSeg = opt.maxSeg ?? 5;
    const jit = opt.jitter ?? 0;
    for (const i of pts) {
      const o = i * 4;
      const r = T[o], g = T[o + 1], b = T[o + 2];
      const j = jit ? (rnd() - 0.5) * jit : 0;
      lctx.strokeStyle = `rgb(${clamp(r + j, 0, 255) | 0},${clamp(g + j, 0, 255) | 0},${clamp(b + j, 0, 255) | 0})`;
      const x0 = i % w, y0 = (i / w) | 0;
      const path = [[x0 + 0.5, y0 + 0.5]];
      for (const sign of [1, -1]) {
        let x = x0 + 0.5, y = y0 + 0.5;
        let dx = Math.cos(orient[i]) * sign, dy = Math.sin(orient[i]) * sign;
        const segs = sign === 1 ? maxSeg : Math.ceil(maxSeg / 3);
        for (let k = 0; k < segs; k++) {
          const nx = x + dx * R, ny = y + dy * R;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) break;
          const q = ((ny | 0) * w + (nx | 0));
          if (Math.abs(T[q * 4] - r) + Math.abs(T[q * 4 + 1] - g) + Math.abs(T[q * 4 + 2] - b) > thr * 1.3 + 12) break;
          let ndx = Math.cos(orient[q]), ndy = Math.sin(orient[q]);
          if (ndx * dx + ndy * dy < 0) { ndx = -ndx; ndy = -ndy; }
          dx = dx * 0.4 + ndx * 0.6; dy = dy * 0.4 + ndy * 0.6;
          const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
          x = nx; y = ny;
          if (sign === 1) path.push([x, y]); else path.unshift([x, y]);
        }
      }
      lctx.beginPath();
      lctx.moveTo(path[0][0], path[0][1]);
      if (path.length === 1) lctx.lineTo(path[0][0] + 0.01, path[0][1]);
      for (let k = 1; k < path.length; k++) lctx.lineTo(path[k][0], path[k][1]);
      lctx.stroke();
    }
    if (opt.clip !== false) {
      const dm = dilate(mask, w, h, opt.spill ?? R * 0.5);
      const md = mctx.createImageData(w, h);
      for (let i = 0; i < w * h; i++) md.data[i * 4 + 3] = dm[i] ? 255 : 0;
      mctx.putImageData(md, 0, 0);
      lctx.globalCompositeOperation = 'destination-in';
      lctx.drawImage(maskCv, 0, 0);
      lctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = opt.alpha ?? 1;
    ctx.drawImage(layer, 0, 0);
    ctx.globalAlpha = 1;
    return pts.length;
  }

  /* =========================================================
     COLORI USATI (raggruppati) + mappa per "dove stenderla"
     ========================================================= */
  const key15 = (T, o) => ((T[o] >> 3) << 10) | ((T[o + 1] >> 3) << 5) | (T[o + 2] >> 3);
  function computeSwatches(T, changed, w, h, region) {
    const R = region || { x: 0, y: 0, w, h };
    const cnt = new Uint32Array(32768), sr = new Float64Array(32768), sg = new Float64Array(32768), sb = new Float64Array(32768);
    let total = 0;
    for (let y = R.y; y < R.y + R.h; y++) for (let x = R.x; x < R.x + R.w; x++) {
      const i = y * w + x;
      if (!changed[i]) continue;
      const o = i * 4, k = key15(T, o);
      cnt[k]++; sr[k] += T[o]; sg[k] += T[o + 1]; sb[k] += T[o + 2]; total++;
    }
    const bins = [];
    for (let k = 0; k < 32768; k++) if (cnt[k]) bins.push(k);
    bins.sort((a, b) => cnt[b] - cnt[a]);
    const groups = [];
    const binGroup = new Int16Array(32768).fill(-1);
    for (const k of bins) {
      const rgb = [Math.round(sr[k] / cnt[k]), Math.round(sg[k] / cnt[k]), Math.round(sb[k] / cnt[k])];
      const L = lab(rgb[0], rgb[1], rgb[2]);
      let best = -1, bd = Infinity;
      for (let g = 0; g < groups.length; g++) { const d = dE(groups[g].lab, L); if (d < bd) { bd = d; best = g; } }
      if (best >= 0 && (bd < 9 || (groups.length >= 150 && bd < 20))) { groups[best].count += cnt[k]; binGroup[k] = best; }
      else { groups.push({ rgb, lab: L, count: cnt[k] }); binGroup[k] = groups.length - 1; }
    }
    const all = groups.map((g, gi) => ({ ...g, gi, C: Math.hypot(g.lab[1], g.lab[2]) }));
    const keep = all
      .filter((g) => g.count >= Math.max(total * 0.004, 12))
      .sort((a, b) => b.count - a.count)
      .slice(0, 7);
    /* accenti: colori saturi e diversi da quelli già scelti, anche se occupano poco spazio */
    const accents = all
      .filter((g) => !keep.includes(g) && g.C > 28 && g.count >= Math.max(15, total * 0.0003))
      .sort((a, b) => b.C * Math.log(1 + b.count) - a.C * Math.log(1 + a.count));
    for (const g of accents) {
      if (keep.length >= 11) break;
      if (keep.every((k) => dE(k.lab, g.lab) > 16)) keep.push(g);
    }
    const gToS = new Int16Array(groups.length).fill(-1);
    keep.forEach((g, s) => { gToS[g.gi] = s; });
    const map = new Int16Array(32768).fill(-1);
    for (const k of bins) map[k] = gToS[binGroup[k]];
    return {
      swatches: keep.map((g) => ({ rgb: g.rgb, hex: hex(...g.rgb), desc: describeColor(...g.rgb), share: g.count / total })),
      map,
    };
  }

  /* =========================================================
     FASI, PENNELLI, UMIDITÀ
     ========================================================= */
  const PLAN = {
    acrilico: {
      colorsBg: { s: 'dryCanvas', b: 'damp', br: ['filbertL', 'flatM'] },
      colorsSubject: { s: 'dryCanvas', b: 'damp', br: ['filbertM', 'roundM'] },
      background: { s: 'dryCanvas', b: 'damp', br: ['flatWash', 'flatL'] },
      darksBig: { s: 'dryCanvas', b: 'damp', br: ['flatM', 'filbertL'] },
      darksSmall: { s: 'dryCanvas', b: 'damp', br: ['roundM', 'roundS'] },
      colors: { s: 'dryCanvas', b: 'damp', br: ['filbertM', 'flatM'] },
      colorsBig: { s: 'dryCanvas', b: 'damp', br: ['filbertL', 'flatM'] },
      colorsFar: { s: 'dryCanvas', b: 'damp', br: ['filbertL', 'flatM'] },
      colorsNear: { s: 'dryCanvas', b: 'damp', br: ['filbertM', 'flatM'] },
      colorsSmall: { s: 'dryCanvas', b: 'damp', br: ['roundM', 'filbertM'] },
      lightsSmall: { s: 'dryCanvas', b: 'damp', br: ['roundS', 'roundM'] },
      refine: { s: 'dryCanvas', b: 'dry', br: ['fan', 'roundS', 'flatS'] },
      whites: { s: 'dryCanvas', b: 'dry', br: ['roundS', 'liner'] },
      blockSky: { s: 'dryCanvas', b: 'damp', br: ['flatWash', 'flatL'] },
      blockDistance: { s: 'dryCanvas', b: 'damp', br: ['flatL', 'filbertL'] },
      blockWater: { s: 'dryCanvas', b: 'damp', br: ['flatL', 'flatM'] },
      blockSubject: { s: 'dryCanvas', b: 'damp', br: ['filbertM', 'roundM'] },
      detailsSubject: { s: 'dryCanvas', b: 'damp', br: ['roundS', 'liner'] },
      sketch: { s: 'dryCanvas', b: 'damp', br: ['pencil', 'roundS'] },
      ground: { s: 'dryCanvas', b: 'loaded', br: ['flatWash', 'flatL'] },
      blockFar: { s: 'dryCanvas', b: 'damp', br: ['flatL', 'filbertL'] },
      blockMid: { s: 'dryCanvas', b: 'damp', br: ['flatL', 'filbertL'] },
      blockNear: { s: 'dryCanvas', b: 'damp', br: ['filbertL', 'flatM'] },
      shadows: { s: 'mistCanvas', b: 'damp', br: ['filbertM', 'flatM'] },
      lights: { s: 'dryCanvas', b: 'damp', br: ['filbertM', 'roundM'] },
      details: { s: 'dryCanvas', b: 'dry', br: ['roundS', 'flatS', 'fan'] },
      final: { s: 'dryCanvas', b: 'damp', br: ['liner', 'roundS'] },
    },
    olio: {
      colorsBg: { s: 'freshOil', b: 'dryOil', br: ['filbertL', 'flatM'] },
      colorsSubject: { s: 'freshOil', b: 'dryOil', br: ['filbertM', 'roundM'] },
      background: { s: 'dryCanvas', b: 'solvent', br: ['flatWash', 'flatL'] },
      darksBig: { s: 'dryCanvas', b: 'solvent', br: ['flatM', 'filbertL'] },
      darksSmall: { s: 'dryCanvas', b: 'solvent', br: ['roundM', 'roundS'] },
      colors: { s: 'freshOil', b: 'dryOil', br: ['filbertM', 'flatM'] },
      colorsBig: { s: 'freshOil', b: 'dryOil', br: ['filbertL', 'flatM'] },
      colorsFar: { s: 'freshOil', b: 'dryOil', br: ['filbertL', 'flatM'] },
      colorsNear: { s: 'freshOil', b: 'dryOil', br: ['filbertM', 'flatM'] },
      colorsSmall: { s: 'freshOil', b: 'dryOil', br: ['roundM', 'filbertM'] },
      lightsSmall: { s: 'freshOil', b: 'dryOil', br: ['roundS', 'roundM'] },
      refine: { s: 'freshOil', b: 'dryOil', br: ['fan', 'roundS'] },
      whites: { s: 'freshOil', b: 'dryOil', br: ['roundS', 'liner'] },
      blockSky: { s: 'dryCanvas', b: 'solvent', br: ['flatWash', 'flatL'] },
      blockDistance: { s: 'dryCanvas', b: 'solvent', br: ['flatL', 'filbertL'] },
      blockWater: { s: 'dryCanvas', b: 'solvent', br: ['flatL', 'flatM'] },
      blockSubject: { s: 'dryCanvas', b: 'solvent', br: ['filbertM', 'roundM'] },
      detailsSubject: { s: 'freshOil', b: 'dryOil', br: ['roundS', 'liner'] },
      sketch: { s: 'dryCanvas', b: 'solvent', br: ['roundS'] },
      ground: { s: 'dryCanvas', b: 'solvent', br: ['flatWash', 'flatL'] },
      blockFar: { s: 'dryCanvas', b: 'solvent', br: ['flatL', 'filbertL'] },
      blockMid: { s: 'dryCanvas', b: 'solvent', br: ['flatL', 'filbertL'] },
      blockNear: { s: 'dryCanvas', b: 'solvent', br: ['filbertL', 'flatM'] },
      shadows: { s: 'freshOil', b: 'dryOil', br: ['filbertM', 'flatM'] },
      lights: { s: 'freshOil', b: 'dryOil', br: ['filbertM', 'roundM'] },
      details: { s: 'freshOil', b: 'dryOil', br: ['roundS', 'fan'] },
      final: { s: 'freshOil', b: 'dryOil', br: ['liner', 'roundS'] },
    },
    acquerello: {
      colorsBg: { s: 'dryPaper', b: 'damp', br: ['roundL', 'roundM'] },
      colorsSubject: { s: 'dryPaper', b: 'damp', br: ['roundM', 'roundS'] },
      background: { s: 'wetPaper', b: 'loaded', br: ['flatWash', 'mop'] },
      wLight: { s: 'dryPaper', b: 'loaded', br: ['mop', 'roundL'] },
      wColors: { s: 'dryPaper', b: 'damp', br: ['roundL', 'roundM'] },
      darksBig: { s: 'dryPaper', b: 'damp', br: ['roundM', 'roundL'] },
      darksSmall: { s: 'dryPaper', b: 'damp', br: ['roundS', 'liner'] },
      refine: { s: 'dryPaper', b: 'damp', br: ['roundS', 'flatS'] },
      blockSky: { s: 'wetPaper', b: 'loaded', br: ['flatWash', 'mop'] },
      blockDistance: { s: 'dryPaper', b: 'loaded', br: ['mop', 'roundL'] },
      blockWater: { s: 'dryPaper', b: 'loaded', br: ['flatWash', 'roundL'] },
      blockSubject: { s: 'dryPaper', b: 'loaded', br: ['roundL', 'roundM'] },
      detailsSubject: { s: 'dryPaper', b: 'damp', br: ['roundS', 'liner'] },
      sketch: { s: 'dryPaper', b: null, br: ['pencil'] },
      blockFar: { s: 'wetPaper', b: 'loaded', br: ['flatWash', 'mop'] },
      blockMid: { s: 'dampPaper', b: 'loaded', br: ['mop', 'roundL'] },
      blockNear: { s: 'dampPaper', b: 'loaded', br: ['roundL', 'mop'] },
      wMid: { s: 'dryPaper', b: 'damp', br: ['roundM', 'roundL'] },
      wDark: { s: 'dryPaper', b: 'damp', br: ['roundM', 'roundS'] },
      details: { s: 'dryPaper', b: 'damp', br: ['roundS', 'flatS'] },
      final: { s: 'dryPaper', b: 'dry', br: ['liner', 'roundS'] },
    },
  };

  /* Categorie degli elementi riconosciuti (SegFormer / ADE20K) */
  const CAT = { scene: 0, sky: 1, dist: 2, water: 3, subject: 4 };
  const CAT_RULES = [
    [CAT.sky, ['sky']],
    [CAT.dist, ['mountain', 'hill']],
    [CAT.water, ['water', 'sea', 'river', 'lake', 'waterfall', 'swimming pool', 'fountain']],
    [CAT.subject, ['person', 'animal', 'boat', 'ship', 'car', 'bicycle', 'bus', 'truck', 'van', 'airplane', 'minibike',
      'sculpture', 'vase', 'bottle', 'food', 'plate', 'basket', 'pot', 'glass', 'book', 'bird', 'horse', 'dog', 'cat',
      'flower', 'armchair', 'chair', 'sofa', 'table', 'bed', 'lamp', 'cushion', 'painting', 'windowpane', 'door',
      'bench', 'swivel chair', 'coffee table', 'desk', 'stool', 'bag', 'ball', 'plaything', 'fan', 'clock', 'bicycle', 'tent']],
  ];
  function categoryOf(label) {
    const l = String(label || '').toLowerCase().trim();
    for (const [c, words] of CAT_RULES) if (words.some((w) => l === w || l.startsWith(w + ',') || l.startsWith(w + ' '))) return c;
    return CAT.scene;
  }

  /* Componenti connesse di una maschera (4-vicini) */
  function components(mask, w, h) {
    const n = w * h;
    const lab = new Int32Array(n).fill(-1);
    const sizes = [];
    const q = new Int32Array(n);
    for (let s = 0; s < n; s++) {
      if (!mask[s] || lab[s] >= 0) continue;
      const id = sizes.length;
      let head = 0, tail = 0;
      q[tail++] = s; lab[s] = id;
      while (head < tail) {
        const i = q[head++], x = i % w;
        if (x > 0 && mask[i - 1] && lab[i - 1] < 0) { lab[i - 1] = id; q[tail++] = i - 1; }
        if (x < w - 1 && mask[i + 1] && lab[i + 1] < 0) { lab[i + 1] = id; q[tail++] = i + 1; }
        if (i >= w && mask[i - w] && lab[i - w] < 0) { lab[i - w] = id; q[tail++] = i - w; }
        if (i < n - w && mask[i + w] && lab[i + w] < 0) { lab[i + w] = id; q[tail++] = i + w; }
      }
      sizes.push(tail);
    }
    return { lab, sizes };
  }
  /* Divide una maschera in masse grandi e piccole */
  function splitBySize(mask, w, h, bigMin) {
    const n = w * h;
    const { lab, sizes } = components(mask, w, h);
    let bigThr = bigMin;
    if (!sizes.some((s) => s >= bigThr) && sizes.length) {
      const sorted = [...sizes].sort((a, b) => b - a);
      const total = sorted.reduce((a, b) => a + b, 0);
      let acc = 0; bigThr = sorted[0];
      for (const s of sorted) { acc += s; bigThr = s; if (acc >= total * 0.5) break; }
    }
    const big = new Uint8Array(n), small = new Uint8Array(n);
    let bigA = 0, smallA = 0;
    const tiny = Math.max(40, n * 0.00015);
    for (let i = 0; i < n; i++) {
      if (lab[i] < 0) continue;
      const sz = sizes[lab[i]];
      if (sz >= bigThr || sz < tiny) { big[i] = 1; bigA++; } else { small[i] = 1; smallA++; }
    }
    return { big, small, bigA, smallA };
  }

  /* =========================================================
     GENERAZIONE DEGLI STEP — metodo del pittore:
     disegno → (fondo tonale) → sfondo → masse scure grandi → masse scure piccole
     → colori (mezzi toni) → chiari → rifinitura → bianchi e luci massime.
     Acquerello: sfondo → velature chiare → colori → scuri grandi → scuri piccoli → rifinitura → finale.
     ========================================================= */
  async function buildSteps(src, medium, getDepth, onProgress = () => {}, getSeg = null, user = null) {
    const { w, h, rgba } = src;
    const n = w * h;
    const M = Math.max(w, h);
    const px = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { px[i * 3] = rgba[i * 4]; px[i * 3 + 1] = rgba[i * 4 + 1]; px[i * 3 + 2] = rgba[i * 4 + 2]; }
    const tick = () => new Promise((r) => setTimeout(r, 0));
    const rnd = mulberry32(1234567);
    const water = medium === 'acquerello';
    const paper = water ? [250, 249, 245] : [240, 238, 232];

    onProgress(0.02, 'wMeasure'); await tick();
    const cx = analyzeComplexity(px, w, h);
    const N0 = cx.steps;

    /* 1) profondità */
    let depth = null, ai = false;
    if (getDepth) {
      try {
        const raw = await getDepth((p, key, vars) => onProgress(0.04 + 0.26 * p, key, vars));
        if (raw && raw.length === n) {
          let mn = 255, mx = 0; for (let i = 0; i < n; i++) { if (raw[i] < mn) mn = raw[i]; if (raw[i] > mx) mx = raw[i]; }
          if (mx - mn > 8) { depth = prepareDepth(raw, w, h); ai = true; }
        }
      } catch { /* ripiego */ }
    }
    if (!depth) { onProgress(0.3, 'wFallback'); await tick(); depth = heuristicDepth(px, w, h); }

    /* 2) elementi riconosciuti */
    let cat = null;
    if (getSeg) {
      try {
        const raw = await getSeg((p, key, vars) => onProgress(0.3 + 0.1 * p, key, vars));
        if (raw && raw.length === n) cat = raw;
      } catch { /* ripiego */ }
    }

    onProgress(0.42, 'wPlan'); await tick();

    /* bianchi riservati (acquerello) */
    const reserved = new Uint8Array(n);
    if (water) for (let i = 0; i < n; i++) {
      const L = lab(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
      if (L[0] > 92 && Math.hypot(L[1], L[2]) < 10) reserved[i] = 1;
    }
    let tot = 0; for (let i = 0; i < n; i++) if (!reserved[i]) tot++;
    const found = [];

    /* 3) immagini obiettivo */
    const allArea = new Uint8Array(n); for (let i = 0; i < n; i++) allArea[i] = reserved[i] ? 0 : 1;
    const Tb = dominantTarget(px, w, h, allArea, Math.max(6, Math.round(cx.kmax * 0.4)), M / 50, rnd, water ? 75 : null, paper)
      || quantTarget(px, w, h, M / 40, Math.max(6, Math.round(cx.kmax * 0.4)), rnd, water ? 75 : null, paper);
    const Tm = dominantTarget(px, w, h, allArea, Math.max(8, Math.round(cx.kmax * 0.8)), M / 100, rnd, null, paper)
      || quantTarget(px, w, h, M / 150, Math.round(cx.kmax * 0.8), rnd, null, paper, true);
    const TmW = water ? (dominantTarget(px, w, h, allArea, Math.max(8, Math.round(cx.kmax * 0.75)), M / 100, rnd, 45, paper) || Tm) : Tm;
    const Tf = quantTarget(px, w, h, 0, cx.kmax + 4, rnd, null, paper, true);
    const F = rgbaFrom(px, n);

    /* 4) sfondo = tutto ciò che non è soggetto (come ragiona un pittore) */
    const fg = new Uint8Array(n);
    let fgA = 0;
    let userSubject = null;
    if (user && (user.subject || user.object)) {
      userSubject = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        if (reserved[i]) continue;
        const s1 = user.subject && user.subject[i], o1 = user.object && user.object[i];
        if (s1 || o1) { fg[i] = 1; fgA++; }
        if (s1) userSubject[i] = 1;
        if (cat && (s1 || o1)) cat[i] = CAT.subject;
      }
      found.length = 0; found.push('user');
    } else if (cat) for (let i = 0; i < n; i++) if (cat[i] === CAT.subject && !reserved[i]) { fg[i] = 1; fgA++; }
    if (!userSubject && fgA >= tot * 0.02) {
      const grown = growSubject(fg, Tm, depth, w, h, reserved, Math.round(M / 6), cat, ai);
      fgA = 0; for (let i = 0; i < n; i++) { fg[i] = grown[i]; fgA += grown[i]; }
      if (cat) for (let i = 0; i < n; i++) if (fg[i] && cat[i] !== CAT.subject) cat[i] = CAT.subject;
    }
    if (!userSubject && fgA < tot * 0.02) {
      /* nessun soggetto riconosciuto: separo vicino/lontano con la soglia di Otsu sulla profondità */
      fg.fill(0); fgA = 0;
      const hist = new Float64Array(256); let cnt = 0;
      for (let i = 0; i < n; i++) if (!reserved[i]) { hist[depth[i]]++; cnt++; }
      let sum = 0; for (let v = 0; v < 256; v++) sum += v * hist[v];
      let sB = 0, wB = 0, best = -1, thr = 128;
      for (let v = 0; v < 256; v++) {
        wB += hist[v]; if (!wB) continue;
        const wF = cnt - wB; if (!wF) break;
        sB += v * hist[v];
        const mB = sB / wB, mF = (sum - sB) / wF, between = wB * wF * (mB - mF) ** 2;
        if (between > best) { best = between; thr = v; }
      }
      let nearA = 0; for (let i = 0; i < n; i++) if (!reserved[i] && depth[i] > thr) nearA++;
      if (nearA > tot * 0.6 || nearA < tot * 0.05) {
        const dv = []; for (let i = 0; i < n; i++) if (!reserved[i]) dv.push(depth[i]);
        dv.sort((a, b) => a - b); thr = dv[Math.floor(dv.length * 0.65)] ?? 128;
      }
      for (let i = 0; i < n; i++) if (!reserved[i] && depth[i] > thr) { fg[i] = 1; fgA++; }
    }
    const bg = new Uint8Array(n), sky = new Uint8Array(n), wat = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      if (reserved[i] || fg[i]) continue;
      bg[i] = 1;
      if (cat && cat[i] === CAT.sky) sky[i] = 1;
      if (cat && cat[i] === CAT.water) wat[i] = 1;
    }
    let watA = 0; for (let i = 0; i < n; i++) watA += wat[i];
    /* Acrilico: lo sfondo passa anche DIETRO il soggetto. Olio: entra bene sotto i bordi. Acquerello: soggetto riservato. */
    const behind = new Uint8Array(n);
    if (!water && fgA > 0) {
      if (medium === 'acrilico') { for (let i = 0; i < n; i++) if (fg[i]) behind[i] = 1; }
      else {
        const nb = new Uint8Array(n); for (let i = 0; i < n; i++) nb[i] = !fg[i] && !reserved[i] ? 1 : 0;
        const band = dilate(nb, w, h, Math.round(M / 90));
        for (let i = 0; i < n; i++) if (fg[i] && band[i]) behind[i] = 1;
      }
      for (let i = 0; i < n; i++) if (behind[i]) bg[i] = 1;
    }
    const notFg = new Uint8Array(n); for (let i = 0; i < n; i++) notFg[i] = !fg[i] && !reserved[i] ? 1 : 0;
    const Tbg = dominantTarget(px, w, h, notFg, Math.max(7, Math.round(cx.kmax * 0.45)), M / 40, rnd, water ? 75 : null, paper)
      || quantTarget(px, w, h, M / 40, Math.max(6, Math.round(cx.kmax * 0.45)), rnd, water ? 75 : null, paper, false, maskedBlur(px, w, h, M / 40, notFg));
    if (!water && fgA > 0) {
      /* sotto il soggetto: continuazione morbida dei colori dello sfondo, dalla scala più fine a quella più ampia */
      const src3 = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { src3[i * 3] = Tbg[i * 4]; src3[i * 3 + 1] = Tbg[i * 4 + 1]; src3[i * 3 + 2] = Tbg[i * 4 + 2]; }
      const done = new Uint8Array(n);
      for (const rad of [M / 30, M / 12, M / 5, M / 2]) {
        const r1 = Math.max(1, Math.round(rad / 1.7));
        const m3 = new Float32Array(n * 3), m1 = new Float32Array(n);
        for (let i = 0; i < n; i++) if (notFg[i]) { m3[i * 3] = src3[i * 3]; m3[i * 3 + 1] = src3[i * 3 + 1]; m3[i * 3 + 2] = src3[i * 3 + 2]; m1[i] = 1; }
        const num = blur(m3, w, h, rad), den = boxBlur1(m1, w, h, r1);
        for (let i = 0; i < n; i++) {
          if (!fg[i] || done[i] || den[i] < 0.04) continue;
          Tbg[i * 4] = num[i * 3] / den[i]; Tbg[i * 4 + 1] = num[i * 3 + 1] / den[i]; Tbg[i * 4 + 2] = num[i * 3 + 2] / den[i];
          done[i] = 1;
        }
      }
    }
    const waterSplit = watA > tot * 0.05;
    if (waterSplit) for (let i = 0; i < n; i++) if (wat[i]) { bg[i] = 0; sky[i] = 0; }
    let bgA = 0, skyA = 0; for (let i = 0; i < n; i++) { bgA += bg[i]; skyA += sky[i]; }
    if (cat && !userSubject) {
      const cnt = [0, 0, 0, 0, 0]; for (let i = 0; i < n; i++) if (!reserved[i]) cnt[cat[i]]++;
      if (cnt[CAT.sky] > tot * 0.02) found.push('zSky');
      if (cnt[CAT.dist] > tot * 0.02) found.push('zDist');
      if (cnt[CAT.water] > tot * 0.02) found.push('zWater');
      if (cnt[CAT.subject] > tot * 0.004) found.push('zSubject');
    }

    /* 5) valori (chiaro/scuro) dall'immagine a dettaglio medio */
    const Lm = new Float32Array(n), Lf = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      Lm[i] = lab(Tm[i * 4], Tm[i * 4 + 1], Tm[i * 4 + 2])[0];
      Lf[i] = lab(F[i * 4], F[i * 4 + 1], F[i * 4 + 2])[0];
    }
    const quant = (arr, q) => { const v = []; for (let i = 0; i < n; i += 3) if (!reserved[i]) v.push(arr[i]); v.sort((a, b) => a - b); return v[Math.min(v.length - 1, Math.floor(q * v.length))] ?? 50; };
    const qDark = quant(Lm, 0.28), qLight = quant(Lm, 0.72), qWhite = Math.max(quant(Lf, 0.95), 72);
    const dark = new Uint8Array(n), mid = new Uint8Array(n), light = new Uint8Array(n), white = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      if (reserved[i]) continue;
      if (Lm[i] <= qDark) dark[i] = 1; else if (Lm[i] >= qLight) light[i] = 1; else mid[i] = 1;
      if (!water && Lf[i] >= qWhite) white[i] = 1;
    }
    const bigMin = Math.max(400, n * 0.004);
    const darks = splitBySize(dark, w, h, bigMin);
    const mids = splitBySize(mid, w, h, bigMin);
    const lights = splitBySize(light, w, h, bigMin);
    let whiteA = 0; for (let i = 0; i < n; i++) whiteA += white[i];

    /* 6) piano degli step */
    const hasGround = !water && N0 >= 8;
    const plan = [];
    const add = (phase, mask, opts) => plan.push({ phase, mask, ...opts });
    const minA = n * 0.0025;
    const skySplit = skyA > tot * 0.08 && bgA - skyA > tot * 0.05 && N0 >= 9;

    if (bgA > tot * 0.03) {
      if (skySplit) {
        const rest = new Uint8Array(n); for (let i = 0; i < n; i++) rest[i] = bg[i] && !sky[i] ? 1 : 0;
        add('blockSky', sky, { kind: 'bg' });
        add('background', rest, { kind: 'bg' });
      } else add('background', bg, { kind: 'bg' });
    }
    if (waterSplit) add('blockWater', wat, { kind: 'bg', horizontal: true });
    if (water) {
      const fgAll = new Uint8Array(n); for (let i = 0; i < n; i++) fgAll[i] = !reserved[i] && !bg[i] ? 1 : 0;
      add('wLight', fgAll, { kind: 'wLight' });
      const col = new Uint8Array(n); for (let i = 0; i < n; i++) col[i] = mid[i] || dark[i] ? 1 : 0;
      if (userSubject) {
        const a = new Uint8Array(n), b = new Uint8Array(n);
        for (let i = 0; i < n; i++) if (col[i]) { if (userSubject[i]) b[i] = 1; else a[i] = 1; }
        add('colorsBg', a, { kind: 'colors' }); add('colorsSubject', b, { kind: 'colors' });
      } else add('wColors', col, { kind: 'colors' });
      if (darks.bigA > minA) add('darksBig', darks.big, { kind: 'darkBig' });
      if (darks.smallA > minA && N0 >= 8) add('darksSmall', darks.small, { kind: 'darkSmall' });
      else if (darks.smallA > 0 && darks.bigA <= minA) add('darksBig', dark, { kind: 'darkBig' });
      if (userSubject) { add('details', null, { kind: 'details', skipSubject: true }); add('detailsSubject', userSubject, { kind: 'detailsSubject' }); }
      else add('details', null, { kind: 'details' });
      add('refine', null, { kind: 'refine' });
      add('final', null, { kind: 'finalWater' });
    } else {
      if (darks.bigA > minA) add('darksBig', darks.big, { kind: 'darkBig' });
      if (darks.smallA > minA && N0 >= 8) add('darksSmall', darks.small, { kind: 'darkSmall' });
      else if (darks.bigA <= minA && darks.smallA > 0) add('darksBig', dark, { kind: 'darkBig' });
      const afterColors = 1 + (N0 >= 14 && lights.smallA > minA ? 1 : 0) + 2 + (whiteA > n * 0.0008 ? 1 : 0);
      const slots = clamp(N0 - 1 - (hasGround ? 1 : 0) - plan.length - afterColors, 1, 3);
      if (userSubject) {
        const a = new Uint8Array(n), b = new Uint8Array(n);
        for (let i = 0; i < n; i++) if (mid[i]) { if (userSubject[i]) b[i] = 1; else a[i] = 1; }
        add('colorsBg', a, { kind: 'colors' }); add('colorsSubject', b, { kind: 'colors' });
      } else if (slots === 1 || mids.smallA < minA) add('colors', mid, { kind: 'colors' });
      else if (slots === 2) { add('colorsBig', mids.big, { kind: 'colors' }); add('colorsSmall', mids.small, { kind: 'colorsSmall' }); }
      else {
        const dv = []; for (let i = 0; i < n; i++) if (mids.big[i]) dv.push(depth[i]);
        dv.sort((a, b) => a - b); const dMed = dv[Math.floor(dv.length / 2)] ?? 128;
        const far = new Uint8Array(n), near = new Uint8Array(n);
        for (let i = 0; i < n; i++) if (mids.big[i]) { if (depth[i] <= dMed) far[i] = 1; else near[i] = 1; }
        add('colorsFar', far, { kind: 'colors' }); add('colorsNear', near, { kind: 'colors' });
        add('colorsSmall', mids.small, { kind: 'colorsSmall' });
      }
      if (N0 >= 14 && lights.smallA > minA) { add('lights', lights.big, { kind: 'lights' }); add('lightsSmall', lights.small, { kind: 'lightsSmall' }); }
      else add('lights', light, { kind: 'lights' });
      if (userSubject) { add('details', null, { kind: 'details', skipSubject: true }); add('detailsSubject', userSubject, { kind: 'detailsSubject' }); }
      else add('details', null, { kind: 'details' });
      add('refine', null, { kind: 'refine' });
      if (whiteA > n * 0.0008) add('whites', white, { kind: 'whites' });
    }
    const N = 1 + (hasGround ? 1 : 0) + plan.length;

    /* 7) tela, livello pennellate, maschera */
    const mk = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const canvas = mk(), layer = mk(), maskCv = mk();
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const orient = orientationField(px, w, h);
    const env = { w, h, ctx, layer, lctx: layer.getContext('2d'), maskCv, mctx: maskCv.getContext('2d'), orient, rnd };
    if (cat) for (let i = 0; i < n; i++) if (cat[i] === CAT.water) orient[i] = 0.06 * Math.sin(i * 0.37);

    const steps = [];
    let prev = null;
    const snapshot = (phase, T, extra = {}) => {
      const img = ctx.getImageData(0, 0, w, h).data;
      const changed = new Uint8Array(n);
      if (extra.changed) changed.set(extra.changed);
      else for (let i = 0; i < n; i++) if (cdiff(img, i * 4, prev, i * 4) > 24) changed[i] = 1;
      const sw = extra.swatches ? { swatches: extra.swatches, map: null } : computeSwatches(T, changed, w, h);
      steps.push({ img, changed, phase, target: T, swatches: sw.swatches, map: sw.map, all: !!extra.swatches });
      prev = img;
    };
    const progress = (k) => onProgress(0.45 + 0.54 * (k / N), 'wStep', { s: k, n: N });
    /* nessun buco: ogni pixel della zona riceve il suo colore */
    /* trama leggera della tela/pennello */
    const grain = (() => {
      const g = new Float32Array(n); const r2 = mulberry32(777);
      for (let i = 0; i < n; i++) g[i] = r2() - 0.5;
      const b = boxBlur1(g, w, h, 1);
      for (let i = 0; i < n; i++) b[i] *= 14;
      return b;
    })();
    /* stesura a MASSE: ogni zona prende il suo colore pieno, con bordo morbido */
    const paintFlat = (T, mask, alpha = 1, soft = 2) => {
      const f = new Float32Array(n); for (let i = 0; i < n; i++) f[i] = mask[i];
      const a = soft > 0 ? boxBlur1(f, w, h, soft) : f;
      const d = ctx.getImageData(0, 0, w, h);
      const D = d.data;
      for (let i = 0; i < n; i++) {
        const k = a[i] * alpha;
        if (k < 0.02 || reserved[i]) continue;
        const o = i * 4, g = grain[i];
        D[o] += (T[o] + g - D[o]) * k; D[o + 1] += (T[o + 1] + g - D[o + 1]) * k; D[o + 2] += (T[o + 2] + g - D[o + 2]) * k;
      }
      ctx.putImageData(d, 0, 0);
    };
    const coverAll = (T, mask) => {
      const d = ctx.getImageData(0, 0, w, h);
      for (let i = 0; i < n; i++) if (mask[i]) {
        const o = i * 4;
        if (cdiff(T, o, d.data, o) > 45) { d.data[o] = T[o]; d.data[o + 1] = T[o + 1]; d.data[o + 2] = T[o + 2]; }
      }
      ctx.putImageData(d, 0, 0);
    };
    const exactFill = (skip) => {
      const d = ctx.getImageData(0, 0, w, h);
      for (let i = 0; i < n; i++) if (!reserved[i] && !(skip && skip[i])) {
        const o = i * 4; d.data[o] = F[o]; d.data[o + 1] = F[o + 1]; d.data[o + 2] = F[o + 2];
      }
      ctx.putImageData(d, 0, 0);
    };

    /* STEP: disegno */
    progress(1); await tick();
    ctx.fillStyle = `rgb(${paper})`; ctx.fillRect(0, 0, w, h);
    const mag = sobel(grayOf(blur(px, w, h, 3), n), w, h);
    const th = Math.max(4, percentile(mag, 0.9));
    const line = water ? [118, 118, 124] : [122, 94, 76];
    const linesCv = mk(), lcx = linesCv.getContext('2d');
    const ld = lcx.createImageData(w, h);
    const changed1 = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const a = clamp((mag[i] - th) / (th * 1.5), 0, 1) * 0.85;
      ld.data[i * 4] = line[0]; ld.data[i * 4 + 1] = line[1]; ld.data[i * 4 + 2] = line[2]; ld.data[i * 4 + 3] = a * 255;
      if (a > 0.25) changed1[i] = 1;
    }
    lcx.putImageData(ld, 0, 0);
    ctx.drawImage(linesCv, 0, 0);
    prev = new Uint8ClampedArray(n * 4);
    snapshot('sketch', null, { changed: changed1, swatches: [{ rgb: line, hex: hex(...line), desc: { b: water ? 'sketchWat' : 'sketchOil' }, share: 1, sketch: true }] });

    /* STEP: fondo tonale */
    if (hasGround) {
      progress(2); await tick();
      const ground = medium === 'olio' ? [196, 158, 124] : [204, 176, 146];
      ctx.globalAlpha = 0.85; ctx.fillStyle = `rgb(${ground})`; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1;
      ctx.globalAlpha = 0.55; ctx.drawImage(linesCv, 0, 0); ctx.globalAlpha = 1;
      snapshot('ground', null, { changed: new Uint8Array(n).fill(1), swatches: [{ rgb: ground, hex: hex(...ground), desc: describeColor(...ground), share: 1 }] });
    }

    const alpha = water ? 0.82 : 1;
    for (let k = 0; k < plan.length; k++) {
      progress(steps.length + 1); await tick();
      const st = plan[k];
      const isLast = k === plan.length - 1;
      switch (st.kind) {
        case 'bg': {
          paintFlat(Tbg, st.mask, alpha, 3);
          if (fgA > 0 && !st.horizontal) {
            /* il disegno dei soggetti coperto dallo sfondo si ritraccia con un colore chiaro (gessetto / colore diluito) */
            const ld2 = lcx.getImageData(0, 0, w, h);
            const near = dilate(behind, w, h, 3);
            for (let i = 0; i < n; i++) {
              const o = i * 4;
              if (!near[i]) { ld2.data[o + 3] = 0; continue; }
              ld2.data[o] = 232; ld2.data[o + 1] = 222; ld2.data[o + 2] = 200;
              ld2.data[o + 3] = Math.min(255, ld2.data[o + 3] * 1.1);
            }
            const tmp = mk(); tmp.getContext('2d').putImageData(ld2, 0, 0);
            ctx.drawImage(tmp, 0, 0);
          }
          snapshot(st.phase, Tbg); break;
        }
        case 'wLight': {
          paintFlat(Tb, st.mask, 0.8, 3);
          snapshot(st.phase, Tb); break;
        }
        case 'darkBig': case 'darkSmall': {
          paintFlat(Tm, st.mask, water ? 0.9 : 1, 2);
          snapshot(st.phase, Tm); break;
        }
        case 'colors': case 'colorsSmall': {
          const T = water ? TmW : Tm;
          paintFlat(T, st.mask, alpha, 2);
          snapshot(st.phase, T); break;
        }
        case 'lights': case 'lightsSmall': {
          paintFlat(Tm, st.mask, 1, 2);
          snapshot(st.phase, Tm); break;
        }
        case 'details': {
          const all = new Uint8Array(n); for (let i = 0; i < n; i++) all[i] = reserved[i] || (st.skipSubject && userSubject && userSubject[i]) ? 0 : 1;
          const R = Math.max(2, M / 120);
          paintStrokes(env, Tf, all, R, 64, { alpha: water ? 0.9 : 1, jitter: 4, spill: R * 0.5, maxSeg: 6, clip: water || !!st.skipSubject });
          snapshot(st.phase, Tf); break;
        }
        case 'detailsSubject': {
          const R = Math.max(1.6, M / 180);
          paintStrokes(env, Tf, st.mask, R, 42, { alpha: water ? 0.9 : 1, jitter: 4, spill: R * 0.5, maxSeg: 4 });
          snapshot(st.phase, Tf); break;
        }
        case 'refine': {
          const all = new Uint8Array(n); for (let i = 0; i < n; i++) all[i] = reserved[i] ? 0 : 1;
          const R = Math.max(1.5, M / 200);
          paintStrokes(env, Tf, all, R, 36, { alpha: water ? 0.9 : 1, jitter: 4, spill: R, maxSeg: 4, clip: water });
          /* la rifinitura porta il quadro al definito, tranne i bianchi che arrivano per ultimi */
          if (!water) exactFill(isLast ? null : white);
          snapshot(st.phase, Tf); break;
        }
        case 'whites': {
          const R = Math.max(1.2, M / 300);
          paintStrokes(env, F, st.mask, R, 20, { alpha: 1, jitter: 0, spill: R * 0.5, maxSeg: 3 });
          exactFill(null);
          snapshot(st.phase, F); break;
        }
        case 'finalWater': {
          exactFill(null);
          snapshot(st.phase, F); break;
        }
      }
    }

    onProgress(1, 'wDone');
    return { steps, w, h, complexity: cx, ai, seg: !!(cat && found.length) && !userSubject, user: !!userSubject, found };
  }

  return { MAX_DIM, PLAN, CAT, categoryOf, boxBlur1, components, buildSteps, computeSwatches, getPigments, findRecipe, hex, lab, dE, describeColor, analyzeComplexity, key15 };
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
    if (views.select && !views.select.hidden) selTexts();
    if (!views.step.hidden && state.data) render(false);
    if (!$('#sheetBackdrop').hidden && state.sheetK != null) openSheet(state.sheetK, true);
  }

  const state = {
    img: null, medium: 'acrilico', palette: 'primari', dims: null, src: null, orig: null,
    data: null, i: 0, zones: false, path: [], zoomOrig: false, slide: null, split: false, splitColor: '#FFD600',
    pigs: null, recipes: new Map(), lastSwatchBtn: null, showingOrig: false, sheetK: null, dropError: null,
    workKey: null, workVars: null,
  };

  const views = { upload: $('#uploadView'), size: $('#sizeView'), crop: $('#cropView'), select: $('#selectView'), work: $('#workView'), step: $('#stepView') };
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

  /* ---------- 4. profondità con IA (Depth Anything V2, scaricato da Hugging Face) ---------- */
  const TJS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6';
  const DEPTH_MODEL = 'onnx-community/depth-anything-v2-small';
  const SEG_MODEL = 'Xenova/segformer-b0-finetuned-ade-512-512';
  const pipes = {};
  async function loadPipe(task, model, onFile) {
    if (pipes[model]) return pipes[model];
    const tf = await import(TJS_URL);
    tf.env.allowLocalModels = false;
    let lastErr;
    for (const dtype of ['q8', 'fp32']) {
      try {
        pipes[model] = await tf.pipeline(task, model, { dtype, progress_callback: (e) => onFile(e) });
        return pipes[model];
      } catch (e) { lastErr = e; }
    }
    throw lastErr;
  }
  const loadDepthPipe = (onFile) => loadPipe('depth-estimation', DEPTH_MODEL, onFile);
  function withWatchdog(fn, stallMs, totalMs) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      let last = start, done = false;
      const id = setInterval(() => {
        if (Date.now() - last > stallMs || Date.now() - start > totalMs) { done = true; clearInterval(id); reject(new Error('timeout')); }
      }, 1000);
      fn(() => { last = Date.now(); }).then(
        (v) => { if (!done) { done = true; clearInterval(id); resolve(v); } },
        (e) => { if (!done) { done = true; clearInterval(id); reject(e); } },
      );
    });
  }
  async function aiDepth(canvas, w, h, prog) {
    try {
      const out = await withWatchdog(async (ping) => {
        prog(0, 'wModel', { p: 0 });
        const pipe = await loadDepthPipe((e) => {
          ping();
          if (e && e.status === 'progress' && /\.onnx$/.test(e.file || '')) {
            const p = Math.round(e.progress || 0);
            prog(0.8 * (p / 100), 'wModel', { p });
          }
        });
        prog(0.85, 'wDepth'); ping();
        const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
        const url = URL.createObjectURL(blob);
        try { return await pipe(url); } finally { URL.revokeObjectURL(url); }
      }, 45000, 240000);
      const res = Array.isArray(out) ? out[0] : out;
      const d = res && res.depth;
      if (!d || !d.data) return null;
      const ch = d.channels || 1;
      const outArr = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) {
        const sy = Math.min(d.height - 1, Math.floor((y * d.height) / h));
        for (let x = 0; x < w; x++) {
          const sx = Math.min(d.width - 1, Math.floor((x * d.width) / w));
          outArr[y * w + x] = d.data[(sy * d.width + sx) * ch];
        }
      }
      return outArr;
    } catch (err) {
      console.warn('Paintstep: modello di profondità non disponibile, uso il metodo semplificato.', err);
      return null;
    }
  }

  /* Riconoscimento degli elementi (SegFormer B0, ADE20K) → categoria per pixel */
  async function aiSeg(canvas, w, h, prog) {
    try {
      const out = await withWatchdog(async (ping) => {
        prog(0, 'wSegModel', { p: 0 });
        const pipe = await loadPipe('image-segmentation', SEG_MODEL, (e) => {
          ping();
          if (e && e.status === 'progress' && /\.onnx$/.test(e.file || '')) {
            const p = Math.round(e.progress || 0);
            prog(0.8 * (p / 100), 'wSegModel', { p });
          }
        });
        prog(0.85, 'wSeg'); ping();
        const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
        const url = URL.createObjectURL(blob);
        try { return await pipe(url); } finally { URL.revokeObjectURL(url); }
      }, 45000, 180000);
      if (!Array.isArray(out) || !out.length) return null;
      const cat = new Uint8Array(w * h);
      for (const seg of out) {
        const c = PaintCore.categoryOf(seg.label);
        if (!c || !seg.mask) continue;
        const m = seg.mask, ch = m.channels || 1;
        for (let y = 0; y < h; y++) {
          const sy = Math.min(m.height - 1, Math.floor((y * m.height) / h));
          for (let x = 0; x < w; x++) {
            const sx = Math.min(m.width - 1, Math.floor((x * m.width) / w));
            if (m.data[(sy * m.width + sx) * ch] > 127) cat[y * w + x] = c;
          }
        }
      }
      return cat;
    } catch (err) {
      console.warn('Paintstep: riconoscimento degli elementi non disponibile.', err);
      return null;
    }
  }


  /* ---------- 4b. selezione di soggetti e oggetti ---------- */
  const sel = { pass: 1, tool: 'tap', subject: null, object: null, undo: [], lab: null, W: 0, H: 0 };
  const sc = $('#selCanvas'), sctx = sc.getContext('2d');
  let selBase = null, selQueued = false;

  function openSelect() {
    const { w, h, rgba } = state.src;
    sel.W = w; sel.H = h; sel.pass = 1; sel.tool = 'tap'; sel.undo = [];
    sel.subject = new Uint8Array(w * h); sel.object = new Uint8Array(w * h);
    /* colori leggermente ammorbiditi, in Lab, per il tocco intelligente */
    const n = w * h, f = new Float32Array(n);
    const lab = new Float32Array(n * 3);
    const ch = [0, 1, 2].map((c) => { for (let i = 0; i < n; i++) f[i] = rgba[i * 4 + c]; return PaintCore.boxBlur1(f, w, h, 1); });
    for (let i = 0; i < n; i++) {
      const L = PaintCore.lab(Math.round(ch[0][i]), Math.round(ch[1][i]), Math.round(ch[2][i]));
      lab[i * 3] = L[0]; lab[i * 3 + 1] = L[1]; lab[i * 3 + 2] = L[2];
    }
    sel.lab = lab;
    sc.width = w; sc.height = h;
    selBase = new ImageData(new Uint8ClampedArray(rgba), w, h);
    $('#selErr').hidden = true;
    show('select');
    selTexts(); selDraw();
  }
  function selTexts() {
    const p = sel.pass;
    $('#selTitle').textContent = t(p === 1 ? 'selTitle1' : 'selTitle2');
    $('#selHint').textContent = t(p === 1 ? 'selHint1' : 'selHint2');
    $('#selNext').textContent = t(p === 1 ? 'selNext1' : 'selNext2');
    $('#selSkip').hidden = p !== 1;
    $('#selSkip').textContent = t('selSkip1');
    $$('#selTools [data-tool]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === sel.tool)));
    $('#selBox').classList.toggle('pass2', p === 2);
  }
  function selDraw() {
    if (selQueued) return;
    selQueued = true;
    requestAnimationFrame(() => {
      selQueued = false;
      const { W, H } = sel, n = W * H;
      const out = new ImageData(W, H), d = out.data, b = selBase.data;
      for (let i = 0; i < n; i++) {
        const o = i * 4;
        let r = b[o], g = b[o + 1], bl = b[o + 2];
        if (sel.subject[i]) { r = r * 0.45 + 255 * 0.55; g = g * 0.45 + 138 * 0.55; bl = bl * 0.45 + 31 * 0.55; }
        else if (sel.object[i]) { r = r * 0.45 + 60 * 0.55; g = g * 0.45 + 200 * 0.55; bl = bl * 0.45 + 255 * 0.55; }
        else if (sel.pass === 2) { r *= 0.8; g *= 0.8; bl *= 0.8; }
        d[o] = r; d[o + 1] = g; d[o + 2] = bl; d[o + 3] = 255;
      }
      sctx.putImageData(out, 0, 0);
    });
  }
  const selMask = () => (sel.pass === 1 ? sel.subject : sel.object);
  function selPushUndo() {
    sel.undo.push([sel.subject.slice(), sel.object.slice()]);
    if (sel.undo.length > 15) sel.undo.shift();
  }
  /* tocco intelligente: seleziona la zona di colore simile collegata al punto toccato */
  function smartSelect(x, y) {
    const { W, H, lab } = sel, n = W * H;
    const seed = [0, 0, 0]; let cnt = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const xx = Math.min(W - 1, Math.max(0, x + dx)), yy = Math.min(H - 1, Math.max(0, y + dy)), i = yy * W + xx;
      seed[0] += lab[i * 3]; seed[1] += lab[i * 3 + 1]; seed[2] += lab[i * 3 + 2]; cnt++;
    }
    seed[0] /= cnt; seed[1] /= cnt; seed[2] /= cnt;
    const grow = (tol, local) => {
      const reg = new Uint8Array(n), q = new Int32Array(n);
      let head = 0, tail = 0;
      const s0 = y * W + x; reg[s0] = 1; q[tail++] = s0;
      const d2 = (i, A) => (lab[i * 3] - A[0]) ** 2 + (lab[i * 3 + 1] - A[1]) ** 2 + (lab[i * 3 + 2] - A[2]) ** 2;
      const t2 = tol * tol, l2 = local * local;
      while (head < tail && tail < n * 0.7) {
        const i = q[head++], xx = i % W;
        const P = [lab[i * 3], lab[i * 3 + 1], lab[i * 3 + 2]];
        const nb = [xx > 0 ? i - 1 : -1, xx < W - 1 ? i + 1 : -1, i >= W ? i - W : -1, i < n - W ? i + W : -1];
        for (const j of nb) {
          if (j < 0 || reg[j]) continue;
          if (d2(j, seed) < t2 && d2(j, P) < l2) { reg[j] = 1; q[tail++] = j; }
        }
      }
      return { reg, size: tail };
    };
    let { reg, size } = grow(18, 10);
    if (size < n * 0.0004) ({ reg, size } = grow(28, 14));
    /* chiusura dei piccoli buchi e dei bordi sfrangiati */
    const f = new Float32Array(n); for (let i = 0; i < n; i++) f[i] = reg[i];
    const r = Math.max(2, Math.round(Math.max(W, H) / 250));
    const dil = PaintCore.boxBlur1(f, W, H, r); for (let i = 0; i < n; i++) f[i] = dil[i] > 0.05 ? 1 : 0;
    const ero = PaintCore.boxBlur1(f, W, H, r);
    const out = new Uint8Array(n); for (let i = 0; i < n; i++) out[i] = ero[i] > 0.95 || reg[i] ? 1 : 0;
    const inv = new Uint8Array(n); for (let i = 0; i < n; i++) inv[i] = out[i] ? 0 : 1;
    const { lab: comp, sizes } = PaintCore.components(inv, W, H);
    const touches = new Uint8Array(sizes.length);
    for (let x0 = 0; x0 < W; x0++) { if (comp[x0] >= 0) touches[comp[x0]] = 1; const b = (H - 1) * W + x0; if (comp[b] >= 0) touches[comp[b]] = 1; }
    for (let y0 = 0; y0 < H; y0++) { const a = y0 * W, b = a + W - 1; if (comp[a] >= 0) touches[comp[a]] = 1; if (comp[b] >= 0) touches[comp[b]] = 1; }
    for (let i = 0; i < n; i++) if (comp[i] >= 0 && !touches[comp[i]] && sizes[comp[i]] < n * 0.02) out[i] = 1;
    return out;
  }
  function selPaintDot(x, y, r, val) {
    const { W, H } = sel, m = selMask(), other = sel.pass === 1 ? sel.object : sel.subject;
    const r2 = r * r;
    for (let yy = Math.max(0, Math.floor(y - r)); yy <= Math.min(H - 1, Math.ceil(y + r)); yy++)
      for (let xx = Math.max(0, Math.floor(x - r)); xx <= Math.min(W - 1, Math.ceil(x + r)); xx++) {
        if ((xx - x) ** 2 + (yy - y) ** 2 > r2) continue;
        const i = yy * W + xx;
        if (val) { if (sel.pass === 2 && other[i]) continue; m[i] = 1; } else m[i] = 0;
      }
  }
  const selPt = (e) => {
    const r = sc.getBoundingClientRect();
    return { x: Math.round(((e.clientX - r.left) * sel.W) / r.width), y: Math.round(((e.clientY - r.top) * sel.H) / r.height), k: sel.W / r.width };
  };
  let selDown = null;
  sc.addEventListener('pointerdown', (e) => {
    e.preventDefault(); sc.setPointerCapture(e.pointerId);
    const p = selPt(e);
    selDown = { ...p, cx: e.clientX, cy: e.clientY, moved: false };
    if (sel.tool !== 'tap') {
      selPushUndo();
      selPaintDot(p.x, p.y, ($('#brushSize').value / 2) * p.k, sel.tool === 'brush');
      selDraw();
    }
  });
  sc.addEventListener('pointermove', (e) => {
    if (!selDown) return;
    if (Math.hypot(e.clientX - selDown.cx, e.clientY - selDown.cy) > 8) selDown.moved = true;
    if (sel.tool === 'tap') return;
    const p = selPt(e), r = ($('#brushSize').value / 2) * p.k;
    const steps = Math.max(1, Math.ceil(Math.hypot(p.x - selDown.x, p.y - selDown.y) / Math.max(1, r / 2)));
    for (let k = 1; k <= steps; k++) selPaintDot(selDown.x + ((p.x - selDown.x) * k) / steps, selDown.y + ((p.y - selDown.y) * k) / steps, r, sel.tool === 'brush');
    selDown.x = p.x; selDown.y = p.y;
    selDraw();
  });
  const selUp = () => {
    if (!selDown) return;
    if (sel.tool === 'tap' && !selDown.moved) {
      const x = Math.min(sel.W - 1, Math.max(0, selDown.x)), y = Math.min(sel.H - 1, Math.max(0, selDown.y));
      selPushUndo();
      const reg = smartSelect(x, y), m = selMask(), other = sel.pass === 1 ? sel.object : sel.subject;
      for (let i = 0; i < reg.length; i++) if (reg[i] && !(sel.pass === 2 && other[i])) m[i] = 1;
      selDraw();
    }
    selDown = null;
  };
  sc.addEventListener('pointerup', selUp);
  sc.addEventListener('pointercancel', () => { selDown = null; });
  $$('#selTools [data-tool]').forEach((b) => b.addEventListener('click', () => { sel.tool = b.dataset.tool; selTexts(); }));
  $('#selUndo').addEventListener('click', () => { const u = sel.undo.pop(); if (u) { sel.subject = u[0]; sel.object = u[1]; selDraw(); } });
  $('#selClear').addEventListener('click', () => { selPushUndo(); selMask().fill(0); selDraw(); });
  $('#selNext').addEventListener('click', () => {
    if (sel.pass === 1) {
      let a = 0; for (let i = 0; i < sel.subject.length; i++) a += sel.subject[i];
      if (a < sel.subject.length * 0.002) { $('#selErr').textContent = t('selEmpty'); $('#selErr').hidden = false; return; }
      $('#selErr').hidden = true; sel.pass = 2; sel.tool = 'tap'; selTexts(); selDraw(); window.scrollTo({ top: 0 });
    } else runAnalysis({ subject: sel.subject, object: sel.object });
  });
  $('#selSkip').addEventListener('click', () => runAnalysis(null));
  $('#selBack').addEventListener('click', () => {
    if (sel.pass === 2) { sel.pass = 1; sel.tool = 'tap'; selTexts(); selDraw(); }
    else show('size');
  });

  /* ---------- 5. analisi ---------- */
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
    state.rect = rect;
    state.orig = new ImageData(new Uint8ClampedArray(state.src.rgba), W, H);
    state.srcCanvas = c;
    openSelect();
  }

  async function runAnalysis(user) {
    const c = state.srcCanvas, W = state.src.w, H = state.src.h;

    state.pigs = PaintCore.getPigments(state.medium, state.palette);
    state.recipes.clear();
    show('work');
    const bar = $('#workFill'), msg = $('#workMsg');
    state.data = await PaintCore.buildSteps(state.src, state.medium, (prog) => aiDepth(c, W, H, prog), (p, key, vars) => {
      state.workKey = key; state.workVars = vars;
      bar.style.width = (p * 100).toFixed(0) + '%';
      msg.textContent = t(key, vars);
    }, (prog) => aiSeg(c, W, H, prog), user);
    state.i = 0; state.zones = false; state.path = []; state.zoomOrig = false; state.split = false;
    $('#ribbon').innerHTML = state.data.steps.map(() => '<i></i>').join('');
    show('step');
    render(false);
  }

  $('#newBtn').addEventListener('click', () => {
    state.data = null; state.path = []; state.zoomOrig = false; state.split = false; state.zones = false;
    state.img = null; state.src = null; state.orig = null; state.dims = null; state.dropError = null;
    input.value = '';
    $('#preview').hidden = true; $('#preview').removeAttribute('src');
    $('#dropEmpty').hidden = false;
    $('#dropHint').textContent = t('uploadHint');
    $('#toSizeBtn').disabled = true;
    wIn.value = ''; hIn.value = ''; wIn.placeholder = ''; hIn.placeholder = '';
    show('upload');
  });

  /* ---------- 5. step ---------- */
  const cv = $('#stepCanvas'), ctx = cv.getContext('2d');
  const off = document.createElement('canvas'), offctx = off.getContext('2d');

  /* Zona mostrata: percorso di quadranti (0–2 livelli), es. [2] = in basso a sinistra, [2, 1] = sua parte in alto a destra */
  function regionOf(path) {
    let r = { x: 0, y: 0, w: state.data.w, h: state.data.h };
    for (const q of path) {
      const hw = Math.floor(r.w / 2), hh = Math.floor(r.h / 2);
      r = { x: r.x + (q % 2 ? hw : 0), y: r.y + (q > 1 ? hh : 0), w: q % 2 ? r.w - hw : hw, h: q > 1 ? r.h - hh : hh };
    }
    return r;
  }

  function dimmed(step, test) {
    const { w, h } = state.data;
    const out = new ImageData(w, h);
    const src = step.img, d = out.data;
    for (let i = 0; i < w * h; i++) {
      const o = i * 4;
      if (step.changed[i] && test(i)) { d[o] = src[o]; d[o + 1] = src[o + 1]; d[o + 2] = src[o + 2]; }
      else {
        const g = (src[o] * 0.3 + src[o + 1] * 0.59 + src[o + 2] * 0.11) * 0.22 + 60;
        d[o] = g * 0.85; d[o + 1] = g * 0.9; d[o + 2] = g * 1.1;
      }
      d[o + 3] = 255;
    }
    return out;
  }

  function drawRegion(target, tctx, data, r, scale) {
    const { w, h } = state.data;
    off.width = w; off.height = h;
    offctx.putImageData(data, 0, 0);
    target.width = Math.round(r.w * scale); target.height = Math.round(r.h * scale);
    tctx.imageSmoothingEnabled = true; tctx.imageSmoothingQuality = 'high';
    tctx.drawImage(off, r.x, r.y, r.w, r.h, 0, 0, target.width, target.height);
  }
  /* Originale dalla foto a piena risoluzione: più nitido negli zoom */
  function drawOriginal(target, tctx, r, scale) {
    const R = state.rect, k = R.w / state.data.w, kh = R.h / state.data.h;
    target.width = Math.round(r.w * scale); target.height = Math.round(r.h * scale);
    tctx.imageSmoothingEnabled = true; tctx.imageSmoothingQuality = 'high';
    tctx.fillStyle = '#fff'; tctx.fillRect(0, 0, target.width, target.height);
    tctx.drawImage(state.img, R.x + r.x * k, R.y + r.y * kh, r.w * k, r.h * kh, 0, 0, target.width, target.height);
  }

  function paint() {
    const step = state.data.steps[state.i];
    const r = regionOf(state.path);
    const scale = Math.pow(2, state.path.length);
    const zoomed = state.path.length > 0;
    if (state.showingOrig || (zoomed && state.zoomOrig)) {
      if (state.img && state.rect) drawOriginal(cv, ctx, r, scale);
      else drawRegion(cv, ctx, state.orig, r, scale);
    } else {
      const data = state.zones ? dimmed(step, () => true) : new ImageData(new Uint8ClampedArray(step.img), state.data.w, state.data.h);
      drawRegion(cv, ctx, data, r, scale);
    }
    if (zoomed) drawMini();
  }

  /* Miniatura dell'opera con la zona zoomata evidenziata in arancione */
  function drawMini() {
    const mc = $('#miniMap'), mctx = mc.getContext('2d');
    const { w, h } = state.data;
    const box = window.innerWidth < 520 ? 116 : 150;
    let cw = box, ch = (box * h) / w;
    if (ch > box) { ch = box; cw = (box * w) / h; }
    const dpr = window.devicePixelRatio || 1;
    mc.style.width = cw + 'px'; mc.style.height = ch + 'px';
    mc.width = Math.round(cw * dpr); mc.height = Math.round(ch * dpr);
    mctx.imageSmoothingEnabled = true; mctx.imageSmoothingQuality = 'high';
    if (state.zoomOrig && state.img && state.rect) {
      const R = state.rect;
      mctx.drawImage(state.img, R.x, R.y, R.w, R.h, 0, 0, mc.width, mc.height);
    } else {
      off.width = w; off.height = h;
      offctx.putImageData(new ImageData(new Uint8ClampedArray(state.data.steps[state.i].img), w, h), 0, 0);
      mctx.drawImage(off, 0, 0, mc.width, mc.height);
    }
    const k = mc.width / w;
    const r = regionOf(state.path);
    const X = r.x * k, Y = r.y * k, W = r.w * k, H = r.h * k;
    mctx.fillStyle = 'rgba(8, 14, 30, .55)';
    mctx.fillRect(0, 0, mc.width, Y);
    mctx.fillRect(0, Y + H, mc.width, mc.height - Y - H);
    mctx.fillRect(0, Y, X, H);
    mctx.fillRect(X + W, Y, mc.width - X - W, H);
    if (state.path.length > 1) {
      const p = regionOf(state.path.slice(0, 1));
      mctx.setLineDash([4 * dpr, 3 * dpr]);
      mctx.strokeStyle = 'rgba(255, 138, 31, .8)'; mctx.lineWidth = 1.2 * dpr;
      mctx.strokeRect(p.x * k + 0.5, p.y * k + 0.5, p.w * k - 1, p.h * k - 1);
      mctx.setLineDash([]);
    }
    mctx.strokeStyle = '#FF8A1F'; mctx.lineWidth = 2.5 * dpr;
    mctx.strokeRect(X + 1.25 * dpr, Y + 1.25 * dpr, W - 2.5 * dpr, H - 2.5 * dpr);
  }

  function swatchInfo(step) {
    const key = state.path.join('');
    if (!key || step.all) return { swatches: step.swatches, map: step.map };
    step.zoomSw = step.zoomSw || {};
    if (!step.zoomSw[key]) {
      step.zoomSw[key] = PaintCore.computeSwatches(step.target, step.changed, state.data.w, state.data.h, regionOf(state.path));
    }
    return step.zoomSw[key];
  }
  const swatchesFor = (step) => swatchInfo(step).swatches;

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
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (state.slide && !reduced) {
      cv.classList.remove('from-left', 'from-right', 'from-top', 'from-bottom');
      draw(); void cv.offsetWidth; cv.classList.add(state.slide);
    } else if (animate && !reduced) { cv.classList.add('fading'); setTimeout(draw, 140); }
    else draw();
    state.slide = null;

    [...$('#ribbon').children].forEach((el, j) => { el.className = j < state.i ? 'done' : j === state.i ? 'now' : ''; });

    /* testi della fase */
    const ph = D().phase;
    const grp = state.medium === 'acquerello' ? ph.wat : ph.paint;
    const title = grp.title[step.phase];
    let desc = grp.desc[step.phase];
    if (state.medium === 'olio' && ph.oil.desc[step.phase]) desc = ph.oil.desc[step.phase];
    $('#stepNum').textContent = t('stepOf', { i: state.i + 1, n: N });
    $('#stepTitle').textContent = title;
    $('#stepDesc').textContent = desc;
    $('#zonesBtn').setAttribute('aria-pressed', String(state.zones));

    /* zoom (fino a due livelli) */
    const level = state.path.length, zoomed = level > 0;
    $('#zoomHead').hidden = !zoomed;
    if (zoomed) {
      $('#zoomTitle').textContent = t('zoomTitle', { s: state.i + 1, z: state.path.map((q) => q + 1).join('.') });
      $('#zoomPos').textContent = state.path.map((q) => t('q' + q)).join(' › ');
      $('#vtStep').textContent = t('tStep', { s: state.i + 1 });
      $('#vtStep').setAttribute('aria-pressed', String(!state.zoomOrig));
      $('#vtOrig').setAttribute('aria-pressed', String(state.zoomOrig));
    }
    $('#frame').classList.toggle('zoomed', zoomed);
    $('#rail').hidden = level >= 2;
    $('#splitGrid').hidden = !state.split || level >= 2;
    $('#splitColors').hidden = !state.split || level >= 2;
    $('#splitBtn').setAttribute('aria-pressed', String(state.split));
    $('#frame').style.setProperty('--split', state.splitColor);
    $$('#splitColors button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.c === state.splitColor)));
    $$('#splitGrid button').forEach((b) => b.setAttribute('aria-label', t('openQuad', { q: t('q' + b.dataset.q) })));
    $('#stepsNav').hidden = zoomed;
    $('#zoomNav').hidden = !zoomed;
    $('#backZoomBtn').hidden = level < 2;
    if (level >= 2) $('#backZoomLbl').textContent = t('backZoom', { z: state.path[0] + 1 });
    $('#backStepLbl').textContent = t('backStep', { s: state.i + 1 });
    $('#origBtn').hidden = zoomed;

    /* misure */
    const si = $('#sizeInfo');
    if (state.dims) {
      const d = state.dims, f = Math.pow(2, level);
      si.hidden = false;
      si.textContent = zoomed
        ? t('quadSize', { w: fmt(d.w / f), h: fmt(d.h / f), u: d.u })
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

    $('#depthNote').textContent = t(state.data.ai ? 'depthAI' : 'depthSimple') +
      (state.data.seg ? ' ' + t('segNote', { list: state.data.found.map((k) => t(k)).join(', ') }) : '') +
      (state.data.user ? ' ' + t('userNote') : '');
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
  let suppressClickUntil = 0;
  $$('#splitGrid button').forEach((b) => b.addEventListener('click', () => {
    if (Date.now() < suppressClickUntil || state.path.length >= 2) return;
    state.path = state.path.concat(Number(b.dataset.q));
    state.split = false;
    render();
    $('#stage').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }));
  $('#backZoomBtn').addEventListener('click', () => { state.path = state.path.slice(0, 1); state.split = false; render(); });
  $('#backStepBtn').addEventListener('click', () => { state.path = []; state.split = false; state.zoomOrig = false; render(); });
  $('#vtStep').addEventListener('click', () => { state.zoomOrig = false; render(false); });
  $('#vtOrig').addEventListener('click', () => { state.zoomOrig = true; render(false); });

  /* Spostamento tra gli zoom vicini (dx, dy = -1 / 0 / +1) */
  function moveZoom(dx, dy) {
    const L = state.path.length;
    if (!L) return;
    const q = state.path[L - 1];
    const col = (q % 2) + dx, row = (q >> 1) + dy;
    if (col < 0 || col > 1 || row < 0 || row > 1) {
      const f = $('#frame');
      f.classList.remove('bump'); void f.offsetWidth; f.classList.add('bump');
      return;
    }
    state.path = state.path.slice(0, L - 1).concat(row * 2 + col);
    state.slide = dx > 0 ? 'from-right' : dx < 0 ? 'from-left' : dy > 0 ? 'from-bottom' : 'from-top';
    render();
  }
  $('#miniMap').addEventListener('click', (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    let x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    const path = [];
    for (let k = 0; k < state.path.length; k++) {
      const col = x >= 0.5 ? 1 : 0, row = y >= 0.5 ? 1 : 0;
      path.push(row * 2 + col);
      x = (x - col * 0.5) * 2; y = (y - row * 0.5) * 2;
    }
    if (path.join() !== state.path.join()) { state.path = path; render(); }
  });

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
      a.download = `paintstep-step-${String(state.i + 1).padStart(2, '0')}${state.path.length ? '-zoom' + state.path.map((q) => q + 1).join('.') : ''}${state.zoomOrig && state.path.length ? '-originale' : ''}.png`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, 'image/png');
  });

  let sx = null, sy = null, sid = null;
  const frame = $('#frame');
  frame.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && !state.path.length) return;
    sx = e.clientX; sy = e.clientY; sid = e.pointerId;
  });
  window.addEventListener('pointerup', (e) => {
    if (sx === null || e.pointerId !== sid) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    sx = sy = null;
    const ax = Math.abs(dx), ay = Math.abs(dy);
    if (state.path.length) {
      if (Math.max(ax, ay) < 40) return;
      suppressClickUntil = Date.now() + 350;
      if (ax > ay) moveZoom(dx < 0 ? 1 : -1, 0); else moveZoom(0, dy < 0 ? 1 : -1);
    } else if (ax > 50 && ax > ay * 1.5) go(dx < 0 ? 1 : -1);
  });
  window.addEventListener('pointercancel', () => { sx = sy = null; });

  document.addEventListener('keydown', (e) => {
    if (!$('#contactBackdrop').hidden) { if (e.key === 'Escape') closeContact(); return; }
    if (!$('#sheetBackdrop').hidden) { if (e.key === 'Escape') closeSheet(); return; }
    if (views.step.hidden) return;
    if (e.target.matches('input, select, textarea')) return;
    if (state.path.length) {
      const mv = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] }[e.key];
      if (mv) { e.preventDefault(); moveZoom(...mv); }
      if (e.key === 'Escape') { state.path = state.path.slice(0, -1); state.split = false; render(); }
      return;
    }
    if (e.key === 'ArrowRight') go(1);
    if (e.key === 'ArrowLeft') go(-1);
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

    const info = swatchInfo(step), T = step.target;
    const im = step.all || !info.map ? dimmed(step, () => true) : dimmed(step, (i) => info.map[PaintCore.key15(T, i * 4)] === k);
    drawRegion($('#whereCanvas'), $('#whereCanvas').getContext('2d'), im, regionOf(state.path), 1);
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
