/*
 * Particle field
 * ---------------------------------------------------------------
 * One set of particles that rebuilds itself into a 3D sculpture of
 * whatever section you are looking at. Plain WebGL, no libraries.
 *
 * How it works
 *  - Every shape is a list of target points (x, y, z) and colours.
 *  - Each frame, every particle is pulled toward its target by a
 *    spring and slowed by damping, so changes look physical.
 *  - Some shapes are alive: they rewrite their targets every frame
 *    (keys press down, the bin fills up, the ocean moves).
 *  - Rotation, perspective, the cursor push and the click ripple
 *    happen on the GPU in the vertex shader.
 */
(function () {
  'use strict';

  const TAU = Math.PI * 2;
  const R = Math.random;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const frac = v => v - Math.floor(v);
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  function gauss() { let u = 0, v = 0; while (!u) u = R(); while (!v) v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v); }
  function hex(h) { const n = parseInt(h.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function scale(c, k) { return [c[0] * k, c[1] * k, c[2] * k]; }

  const COL = {
    star: hex('#ece8df'),
    amber: hex('#ffb23e'),
    dust: hex('#6f7891'),
    blue: hex('#a9bcff'),
  };

  /* ---------- samplers: random points on simple solids ---------- */
  function onSphere(r) { const x = gauss(), y = gauss(), z = gauss(); const l = Math.hypot(x, y, z) || 1; return [x / l * r, y / l * r, z / l * r]; }
  function inSphere(r) { const p = onSphere(r), k = Math.cbrt(R()); return [p[0] * k, p[1] * k, p[2] * k]; }
  function onBox(sx, sy, sz, faces) {
    // faces: optional mask 'xyz' of which face pairs to use
    const f = faces || 'xyz';
    const ax = f.includes('x') ? sy * sz : 0, ay = f.includes('y') ? sx * sz : 0, az = f.includes('z') ? sx * sy : 0;
    const u = R() * (ax + ay + az), s = R() < 0.5 ? -1 : 1;
    const p = [(R() - 0.5) * sx, (R() - 0.5) * sy, (R() - 0.5) * sz];
    if (u < ax) p[0] = s * sx / 2; else if (u < ax + ay) p[1] = s * sy / 2; else p[2] = s * sz / 2;
    return p;
  }
  function onBoxEdge(sx, sy, sz) {
    const L = [sx, sy, sz], u = R() * 4 * (sx + sy + sz);
    const axis = u < 4 * sx ? 0 : u < 4 * (sx + sy) ? 1 : 2;
    const p = [(R() < 0.5 ? -1 : 1) * sx / 2, (R() < 0.5 ? -1 : 1) * sy / 2, (R() < 0.5 ? -1 : 1) * sz / 2];
    p[axis] = (R() - 0.5) * L[axis];
    return p;
  }
  function onCyl(r, h, capFrac) {
    const a = R() * TAU;
    if (R() < capFrac) { const rr = r * Math.sqrt(R()); return [Math.cos(a) * rr, (R() < 0.5 ? -1 : 1) * h / 2, Math.sin(a) * rr]; }
    return [Math.cos(a) * r, (R() - 0.5) * h, Math.sin(a) * r];
  }

  /* Split N particles into parts by weight: part[i] tells which part particle i belongs to */
  function split(N, weights) {
    const tot = weights.reduce((a, b) => a + b, 0), part = new Uint8Array(N);
    let i = 0;
    weights.forEach((w, k) => { const n = Math.round(w / tot * N); for (let j = 0; j < n && i < N; j++) part[i++] = k; });
    while (i < N) part[i++] = weights.length - 1;
    return part;
  }

  function makeShape(N, cfg) {
    return {
      N,
      pos: new Float32Array(N * 3),
      col: new Float32Array(N * 3),
      aux: new Float32Array(N * 4), // free per-particle data for animated shapes
      cfg: Object.assign({ spin: 0.1, tilt: 0.35, roll: 0, size: 1, gain: 1, sway: 0, y: 0 }, cfg),
      update: null,
    };
  }
  function put(s, i, p, c) {
    s.pos[i * 3] = p[0]; s.pos[i * 3 + 1] = p[1]; s.pos[i * 3 + 2] = p[2];
    s.col[i * 3] = c[0]; s.col[i * 3 + 1] = c[1]; s.col[i * 3 + 2] = c[2];
  }

  /* =================================================================
   * SHAPES
   * Each one is a small sculpture of a real project, about 2 units wide.
   * ================================================================= */
  const SHAPES = {};

  /* Intro: a spiral galaxy */
  SHAPES.galaxy = N => {
    const s = makeShape(N, { spin: 0.05, tilt: 1.12, roll: 0.3, size: 1.25, gain: 1.3 });
    const core = hex('#ffe2b4'), arm = hex('#9fb3ff');
    for (let i = 0; i < N; i++) {
      const u = R();
      let p, c;
      if (u < 0.06) { // distant stars
        p = onSphere(2.6 + R() * 3.4);
        c = scale(mix(COL.dust, COL.star, R()), 0.55);
      } else if (u < 0.2) { // bulge
        p = [gauss() * 0.22, gauss() * 0.09, gauss() * 0.22];
        c = mix(core, COL.star, R() * 0.4);
      } else { // three arms
        const k = i % 3, r = 0.12 + Math.pow(R(), 1.1) * 1.85;
        const th = k * TAU / 3 + r * 2.4 + gauss() * 0.16 / (0.5 + r);
        const sp = 0.025 + 0.035 * r;
        p = [Math.cos(th) * r + gauss() * sp, gauss() * 0.05 * (1.4 - r * 0.45), Math.sin(th) * r + gauss() * sp];
        c = mix(core, arm, clamp(r / 1.5, 0, 1));
        if (R() < 0.035) c = COL.amber;
      }
      put(s, i, p, c);
    }
    return s;
  };

  /* Work index: six star clusters on a ring, one per project */
  SHAPES.constellation = N => {
    const s = makeShape(N, { spin: 0.07, tilt: 0.95, roll: -0.18, size: 1.05, gain: 0.95 });
    const part = split(N, [0.82, 0.18]);
    s.part = part;
    for (let i = 0; i < N; i++) {
      let p, c;
      if (part[i] === 0) {
        const k = i % 6, a = k * TAU / 6;
        const r = 0.17 * Math.pow(R(), 0.8);
        const q = onSphere(r);
        p = [Math.cos(a) * 1.3 + q[0], q[1], Math.sin(a) * 1.3 + q[2]];
        c = mix(COL.star, COL.blue, R() * 0.5);
        s.aux[i * 4] = k;
      } else {
        const a = R() * TAU, r = 1.3 + gauss() * 0.03;
        p = [Math.cos(a) * r, gauss() * 0.015, Math.sin(a) * r];
        c = scale(COL.dust, 0.8);
        s.aux[i * 4] = -1;
      }
      put(s, i, p, c);
    }
    s.update = (t, T, TC, st) => {
      for (let i = 0; i < N; i++) {
        const k = s.aux[i * 4];
        if (k < 0) continue;
        const on = k === st.highlight;
        const j = i * 3, bx = s.pos[j], by = s.pos[j + 1], bz = s.pos[j + 2];
        const a = k * TAU / 6, cx = Math.cos(a) * 1.3, cz = Math.sin(a) * 1.3;
        const g = on ? 1.7 : 1;
        T[j] = cx + (bx - cx) * g; T[j + 1] = by * g; T[j + 2] = cz + (bz - cz) * g;
        const c = on ? COL.amber : null;
        if (c) { TC[j] = c[0]; TC[j + 1] = c[1]; TC[j + 2] = c[2]; }
        else { TC[j] = s.col[j]; TC[j + 1] = s.col[j + 1]; TC[j + 2] = s.col[j + 2]; }
      }
    };
    return s;
  };

  /* 1. Custom macropad: acrylic case, three keys, a knob */
  SHAPES.macropad = N => {
    const s = makeShape(N, { spin: 0.2, tilt: 0.55, size: 1.05, gain: 1 });
    const acrylic = hex('#9cc3ff'), pcb = hex('#58648a'), cap = COL.star, sw = hex('#8a8f9c');
    const keyX = [-0.74, -0.25, 0.24], knobX = 0.76;
    // parts: 0 case edges, 1 case faces, 2 pcb, 3 keys, 4 switches, 5 knob, 6 screws
    const part = split(N, [0.16, 0.14, 0.06, 0.38, 0.08, 0.16, 0.02]);
    s.part = part;
    for (let i = 0; i < N; i++) {
      let p, c;
      switch (part[i]) {
        case 0: p = onBoxEdge(2.0, 0.26, 0.72); p[1] -= 0.2; c = acrylic; break;
        case 1: p = onBox(2.0, 0.26, 0.72); p[1] -= 0.2; c = scale(acrylic, 0.55); break;
        case 2: p = [(R() - 0.5) * 1.9, -0.2, (R() - 0.5) * 0.62]; c = pcb; break;
        case 3: {
          const k = i % 3; s.aux[i * 4] = k;
          p = onBox(0.42, 0.24, 0.42);
          const taper = 1 - (p[1] + 0.12) / 0.24 * 0.2; // slightly narrower at the top
          p[0] = p[0] * taper + keyX[k]; p[2] *= taper; p[1] += 0.1;
          c = cap; break;
        }
        case 4: { const k = i % 3; s.aux[i * 4] = k; p = onBox(0.32, 0.1, 0.32); p[0] += keyX[k]; p[1] -= 0.04; c = sw; break; }
        case 5: {
          if (R() < 0.12) { const rr = R() * 0.15; p = [knobX + rr, 0.28, 0]; c = COL.star; } // marker line on top
          else { p = onCyl(0.17, 0.34, 0.3); p[0] += knobX; p[1] += 0.11; c = COL.amber; }
          break;
        }
        default: { const sx = R() < 0.5 ? -0.93 : 0.93, sz = R() < 0.5 ? -0.29 : 0.29; const q = inSphere(0.025); p = [sx + q[0], -0.07 + q[1], sz + q[2]]; c = COL.star; }
      }
      put(s, i, p, c);
    }
    s.update = t => {
      const P = 0.75, k = Math.floor(t / P) % 3, ph = frac(t / P);
      const dip = ph < 0.45 ? Math.sin(ph / 0.45 * Math.PI) * 0.09 : 0;
      const ang = Math.sin(t * 0.6) * 2.2, ca = Math.cos(ang), sa = Math.sin(ang);
      const T = s._T;
      for (let i = 0; i < N; i++) {
        const pt = part[i], j = i * 3;
        if (pt === 3) T[j + 1] = s.pos[j + 1] - (s.aux[i * 4] === k ? dip : 0);
        else if (pt === 5) {
          const x = s.pos[j] - knobX, z = s.pos[j + 2];
          T[j] = knobX + x * ca - z * sa; T[j + 2] = x * sa + z * ca;
        }
      }
    };
    return s;
  };

  /* 2. Memory Mirror: a screen of pixels that keeps fading into blocks */
  SHAPES.mirror = N => {
    const s = makeShape(N, { spin: 0, sway: 0.42, tilt: 0.06, size: 1.05, gain: 1.05 });
    const W = 2.3, H = 1.5;
    const part = split(N, [0.92, 0.08]);
    s.part = part;
    const nScreen = part.filter(p => p === 0).length;
    const cols = Math.round(Math.sqrt(nScreen * W / H)), rows = Math.ceil(nScreen / cols);
    const bgA = hex('#f6b98e'), bgB = hex('#4a2a2e'), face = hex('#fff0d6'), cool = hex('#7ea6ff');
    // Procedural "memory": warm room gradient with a figure in it
    function img(u, v) {
      const d = clamp(u * 0.6 + (1 - v) * 0.6, 0, 1);
      let c = mix(bgA, bgB, d);
      const hx = (u - 0.52) / 0.13, hy = (v - 0.63) / 0.17;
      const sx = (u - 0.52) / 0.3, sy = (v - 0.1) / 0.3;
      if (hx * hx + hy * hy < 1 || (sx * sx + sy * sy < 1 && v < 0.4)) c = mix(face, cool, clamp(1 - v, 0, 1) * 0.35);
      const stripe = Math.abs(frac(u * 1.0 - v * 0.9 + 0.2) - 0.5) < 0.05; // the diagonal from the real sketch
      if (stripe) c = mix(c, COL.amber, 0.6);
      return c;
    }
    s.img = img;
    let n = 0;
    for (let i = 0; i < N; i++) {
      let p, c;
      if (part[i] === 0) {
        const cx = n % cols, cy = Math.floor(n / cols); n++;
        const u = (cx + 0.5 + (R() - 0.5) * 0.4) / cols, v = (cy + 0.5 + (R() - 0.5) * 0.4) / rows;
        s.aux[i * 4] = u; s.aux[i * 4 + 1] = v;
        p = [(u - 0.5) * W, (v - 0.5) * H, 0];
        c = img(u, v);
      } else { // frame
        p = onBoxEdge(W + 0.16, H + 0.16, 0.02); p[2] = (R() - 0.5) * 0.08;
        c = scale(COL.star, 0.7);
      }
      put(s, i, p, c);
    }
    s.update = t => {
      const T = s._T, TC = s._TC;
      const knobA = 0.5 - 0.5 * Math.cos(t * 0.55); // blockiness
      const knobB = 0.5 - 0.5 * Math.cos(t * 0.37 + 1); // colour
      const steps = [0, 0.05, 0.08, 0.12, 0.17, 0.23];
      const b = steps[Math.min(steps.length - 1, Math.floor(smooth(0.15, 0.95, knobA) * steps.length))];
      const sat = lerp(0.7, 1.5, knobB);
      for (let i = 0; i < N; i++) {
        if (part[i] !== 0) continue;
        const j = i * 3, u = s.aux[i * 4], v = s.aux[i * 4 + 1];
        let x = (u - 0.5) * W, y = (v - 0.5) * H, z, cu = u, cv = v;
        if (b > 0) {
          const qx = (Math.floor(x / b) + 0.5) * b, qy = (Math.floor(y / b) + 0.5) * b;
          x = qx + (x - qx) * 0.6; y = qy + (y - qy) * 0.6;
          cu = qx / W + 0.5; cv = qy / H + 0.5;
          z = 0;
        } else z = Math.sin(x * 4 + t * 2.2) * Math.cos(y * 3 - t) * 0.035;
        T[j] = x; T[j + 1] = y; T[j + 2] = z;
        const c = img(clamp(cu, 0, 1), clamp(cv, 0, 1));
        const g = (c[0] + c[1] + c[2]) / 3;
        TC[j] = clamp(g + (c[0] - g) * sat, 0, 1); TC[j + 1] = clamp(g + (c[1] - g) * sat, 0, 1); TC[j + 2] = clamp(g + (c[2] - g) * sat, 0, 1);
      }
    };
    return s;
  };

  /* 3. Smart bin: fills up, then calls for help over the air */
  SHAPES.smartbin = N => {
    const s = makeShape(N, { spin: 0.22, tilt: 0.28, size: 0.95, gain: 1, y: -0.05 });
    const body = scale(COL.star, 0.62), wood = hex('#cf8a52'), cable = hex('#3d7bff');
    // parts: 0 body, 1 lid, 2 pedal, 3 cable, 4 fill, 5 signal arcs
    const part = split(N, [0.36, 0.14, 0.03, 0.06, 0.29, 0.12]);
    s.part = part;
    const bez = (a, b, c, d, t) => { const m = 1 - t; return m * m * m * a + 3 * m * m * t * b + 3 * m * t * t * c + t * t * t * d; };
    for (let i = 0; i < N; i++) {
      let p, c;
      switch (part[i]) {
        case 0: p = onCyl(0.55, 1.3, 0.04); p[1] -= 0.15; c = body; break;
        case 1: p = onCyl(0.62, 0.12, 0.6); p[1] += 0.56; c = wood; break;
        case 2: p = onBox(0.36, 0.07, 0.2); p[1] -= 0.78; p[2] += 0.66; c = wood; break;
        case 3: {
          const t = R();
          p = [bez(0.55, 1.25, 0.95, 1.45, t) + gauss() * 0.012, bez(0.48, 0.42, -0.6, -0.8, t) + gauss() * 0.012, bez(0.1, 0.3, 0.6, 0.95, t) + gauss() * 0.012];
          c = cable; break;
        }
        case 4: {
          const a = R() * TAU, r = 0.5 * Math.sqrt(R()), h = R();
          s.aux[i * 4] = a; s.aux[i * 4 + 1] = r; s.aux[i * 4 + 2] = h;
          p = [Math.cos(a) * r, -0.78 + h * 0.3, Math.sin(a) * r]; c = COL.amber; break;
        }
        default: {
          const k = i % 3, rr = 0.22 + k * 0.17, a = lerp(0.25 * Math.PI, 0.75 * Math.PI, R());
          s.aux[i * 4] = k;
          p = [Math.cos(a) * rr, 0.72 + Math.sin(a) * rr - 0.05, gauss() * 0.01]; c = COL.star;
        }
      }
      put(s, i, p, c);
    }
    const low = hex('#7fd69a');
    s.update = t => {
      const T = s._T, TC = s._TC;
      const level = 0.12 + 0.82 * (0.5 - 0.5 * Math.cos(t * 0.45));
      const full = level > 0.78;
      const fc = mix(low, COL.amber, smooth(0.4, 0.9, level));
      const top = -0.78 + level * 1.28;
      for (let i = 0; i < N; i++) {
        const pt = part[i], j = i * 3;
        if (pt === 4) {
          const a = s.aux[i * 4], r = s.aux[i * 4 + 1], h = s.aux[i * 4 + 2];
          const y = -0.78 + h * (top + 0.78);
          T[j] = Math.cos(a) * r; T[j + 1] = y + (h > 0.96 ? Math.sin(a * 5 + t * 3) * 0.015 : 0); T[j + 2] = Math.sin(a) * r;
          TC[j] = fc[0]; TC[j + 1] = fc[1]; TC[j + 2] = fc[2];
        } else if (pt === 5) {
          const k = s.aux[i * 4];
          const pulse = full ? Math.pow(Math.max(0, Math.sin((t * 2.2 - k * 0.7))), 3) : 0;
          const g = 0.08 + pulse * 1.0;
          TC[j] = COL.amber[0] * g + 0.05; TC[j + 1] = COL.amber[1] * g + 0.05; TC[j + 2] = COL.amber[2] * g + 0.05;
        }
      }
    };
    return s;
  };

  /* 4. Da Vinci tank: ribbed wooden cone, cannons all round, wheels underneath */
  SHAPES.tank = N => {
    const s = makeShape(N, { spin: 0.16, tilt: 0.36, size: 1.02, gain: 0.95 });
    const wood = hex('#e3a070'), dark = hex('#b06c45'), brass = hex('#e2cfa0');
    const wheels = [[-0.42, 0.36], [0.42, 0.36], [-0.42, -0.36], [0.42, -0.36]];
    // parts: 0 cone, 1 skirt, 2 cannons, 3 chassis, 4 wheels
    const part = split(N, [0.5, 0.16, 0.12, 0.06, 0.16]);
    s.part = part;
    for (let i = 0; i < N; i++) {
      let p, c;
      switch (part[i]) {
        case 0: {
          const rib = Math.floor(R() * 44), a = (rib + 0.5 + gauss() * 0.12) / 44 * TAU;
          const f = Math.sqrt(R()), r = f * 1.0;
          p = [Math.cos(a) * r, 0.62 - f * 0.64, Math.sin(a) * r];
          c = scale(wood, 0.8 + 0.25 * ((rib * 7) % 5) / 5); break;
        }
        case 1: { const a = R() * TAU, h = R(), r = lerp(1.0, 0.76, h); p = [Math.cos(a) * r, -0.02 - h * 0.32, Math.sin(a) * r]; c = dark; break; }
        case 2: {
          const k = i % 12, a = k / 12 * TAU + 0.13, t = R(), rr = 0.035;
          const ra = R() * TAU, along = lerp(0.62, 1.22, t);
          const ox = Math.cos(ra) * rr, oy = Math.sin(ra) * rr;
          p = [Math.cos(a) * along - Math.sin(a) * ox, 0.07 + oy, Math.sin(a) * along + Math.cos(a) * ox];
          c = brass; break;
        }
        case 3: p = onBoxEdge(1.05, 0.08, 0.86); p[1] -= 0.4; c = dark; break;
        default: {
          const w = i % 4, wh = wheels[w]; s.aux[i * 4] = w;
          let lx, ly;
          if (R() < 0.6) { const a = R() * TAU; lx = Math.cos(a) * 0.18; ly = Math.sin(a) * 0.18; }
          else { const a = Math.floor(R() * 6) / 6 * TAU, r = R() * 0.18; lx = Math.cos(a) * r; ly = Math.sin(a) * r; }
          s.aux[i * 4 + 1] = lx; s.aux[i * 4 + 2] = ly;
          p = [wh[0] + lx, -0.55 + ly, wh[1] + gauss() * 0.01]; c = wood;
        }
      }
      put(s, i, p, c);
    }
    s.update = t => {
      const T = s._T, a = t * 1.4, ca = Math.cos(a), sa = Math.sin(a);
      for (let i = 0; i < N; i++) {
        if (part[i] !== 4) continue;
        const j = i * 3, wh = wheels[s.aux[i * 4]], lx = s.aux[i * 4 + 1], ly = s.aux[i * 4 + 2];
        T[j] = wh[0] + lx * ca - ly * sa; T[j + 1] = -0.55 + lx * sa + ly * ca;
      }
    };
    return s;
  };

  /* 5. Tatami room: paper-grid walls, sweeping roof, mats on the floor */
  SHAPES.tatami = N => {
    const s = makeShape(N, { spin: 0.14, tilt: 0.4, size: 1.05, gain: 0.95, y: -0.05 });
    const paper = hex('#f1eadc'), woodC = hex('#9a6644'), straw = hex('#d9c37c'), tile = hex('#f6f2ea');
    const part = split(N, [0.42, 0.4, 0.18]);
    const WX = 1.5, WZ = 1.0, Y0 = -0.56, Y1 = 0.06, g = 0.1;
    const snap = v => Math.round(v / g) * g;
    for (let i = 0; i < N; i++) {
      let p, c;
      if (part[i] === 0) { // walls
        for (;;) {
          p = onBox(WX, Y1 - Y0, WZ, 'xz'); p[1] += (Y0 + Y1) / 2;
          if (p[2] > WZ / 2 - 0.001 && Math.abs(p[0]) < 0.16 && p[1] < 0.0) continue; // door opening
          break;
        }
        if (p[1] < Y0 + 0.14) c = woodC;
        else {
          const onX = Math.abs(Math.abs(p[0]) - WX / 2) < 0.001;
          if (R() < 0.5) p[1] = snap(p[1]);
          else if (onX) p[2] = snap(p[2]); else p[0] = snap(p[0]);
          c = paper;
        }
      } else if (part[i] === 1) { // roof
        let u = R() * 2 - 1;
        const w = R() * 2 - 1;
        if (R() < 0.55) u = Math.round(u * 13) / 13;
        const au = Math.abs(u);
        const y = Y1 + 0.66 * Math.pow(1 - au, 1.9) + 0.05 * Math.pow(au, 6);
        let z = w * 0.68;
        if (R() < 0.35) z = Math.round(w * 10) / 10 * 0.68;
        p = [u * 0.98, y, z];
        c = mix(tile, COL.amber, au > 0.97 ? 0.4 : 0);
      } else { // tatami mats: 2:1 rectangles, drawn as outlines with a light weave
        const mx = Math.floor(R() * 4), mz = Math.floor(R() * 2);
        const x0 = -0.7 + mx * 0.35, z0 = -0.44 + mz * 0.44;
        let x = x0 + R() * 0.35, z = z0 + R() * 0.44;
        if (R() < 0.6) { if (R() < 0.5) x = R() < 0.5 ? x0 + 0.01 : x0 + 0.34; else z = R() < 0.5 ? z0 + 0.01 : z0 + 0.43; }
        p = [x, Y0 + 0.01, z];
        c = scale(straw, 0.85);
      }
      put(s, i, p, c);
    }
    return s;
  };

  /* 6. Creature program: a moving ocean, three creatures, a red ball */
  SHAPES.creature = N => {
    const s = makeShape(N, { spin: 0, sway: 0.45, tilt: 0.5, size: 0.92, gain: 0.95, y: -0.28 });
    const deep = hex('#2f62ff'), foam = hex('#c8ecff'), sand = hex('#e9dcc4'), blueC = hex('#4a78f5'), belly = hex('#a9d3ff'), pink = hex('#f3a3cf'), red = hex('#ff4436'), white = hex('#ffffff');
    const crit = [[-0.95, 0.42, 1], [0.95, 0.42, 1], [0, -0.05, 0.75]]; // x, z, scale
    // parts: 0 ocean, 1 sand, 2 creatures, 3 ball
    const part = split(N, [0.42, 0.12, 0.4, 0.06]);
    s.part = part;
    for (let i = 0; i < N; i++) {
      let p, c;
      switch (part[i]) {
        case 0: { const x = (R() - 0.5) * 3.4, z = -1.3 + R() * 1.0; s.aux[i * 4] = x; s.aux[i * 4 + 1] = z; p = [x, -0.32, z]; c = deep; break; }
        case 1: p = [(R() - 0.5) * 3.4, -0.42, -0.3 + R() * 1.3]; c = scale(sand, 0.45); break;
        case 2: {
          const k = i % 3, cr = crit[k], sc = cr[2] * 0.9;
          const u = R();
          let q, cc;
          if (u < 0.42) { q = onSphere(1); q = [q[0] * 0.17, q[1] * 0.21 + 0.27, q[2] * 0.14]; cc = q[2] > 0.06 && Math.abs(q[0]) < 0.1 ? belly : blueC; }
          else if (u < 0.75) { q = onSphere(1); q = [q[0] * 0.21, q[1] * 0.18 + 0.64, q[2] * 0.18]; cc = blueC; }
          else if (u < 0.93) { // ears
            const sd = R() < 0.5 ? -1 : 1, q0 = onSphere(1);
            q = [sd * (0.3 + q0[0] * 0.16), 0.74 + q0[1] * 0.08 + q0[0] * sd * 0.05, q0[2] * 0.025];
            cc = Math.abs(q0[0]) < 0.6 && Math.abs(q0[1]) < 0.6 ? pink : blueC;
          } else { const sd = R() < 0.5 ? -1 : 1, q0 = inSphere(0.05); q = [sd * 0.085 + q0[0], 0.68 + q0[1], 0.17 + q0[2]]; cc = white; }
          s.aux[i * 4] = k;
          p = [cr[0] + q[0] * sc, -0.42 + q[1] * sc, cr[1] + q[2] * sc]; c = cc; break;
        }
        default: { const q = onSphere(0.085); s.aux[i * 4] = q[0]; s.aux[i * 4 + 1] = q[1]; s.aux[i * 4 + 2] = q[2]; p = [0, 0.3, 0.42]; c = red; }
      }
      put(s, i, p, c);
    }
    s.update = t => {
      const T = s._T, TC = s._TC;
      const P = 1.8, n = Math.floor(t / P), ph = frac(t / P), dir = n % 2 ? -1 : 1;
      const bx = dir * lerp(-0.82, 0.82, ph), by = 0.05 + Math.sin(ph * Math.PI) * 0.7;
      for (let i = 0; i < N; i++) {
        const pt = part[i], j = i * 3;
        if (pt === 0) {
          const x = s.aux[i * 4], z = s.aux[i * 4 + 1];
          const y = -0.32 + 0.05 * Math.sin(x * 3 + t * 1.6) + 0.035 * Math.sin(z * 6 - t * 1.3 + x);
          T[j + 1] = y;
          const c = mix(deep, foam, clamp((y + 0.33) * 9, 0, 1));
          TC[j] = c[0]; TC[j + 1] = c[1]; TC[j + 2] = c[2];
        } else if (pt === 2) {
          const k = s.aux[i * 4];
          T[j + 1] = s.pos[j + 1] + Math.abs(Math.sin(t * 3.2 + k * 2)) * 0.04;
        } else if (pt === 3) {
          T[j] = bx + s.aux[i * 4]; T[j + 1] = by + s.aux[i * 4 + 1]; T[j + 2] = 0.42 + s.aux[i * 4 + 2];
        }
      }
    };
    return s;
  };

  /* About: an LED cube, the first thing I soldered */
  SHAPES.ledcube = N => {
    const s = makeShape(N, { spin: 0.18, tilt: 0.5, roll: 0.12, size: 0.95, gain: 1 });
    const n = 7, step = 1.7 / (n - 1), o = -0.85;
    const part = split(N, [0.62, 0.38]);
    for (let i = 0; i < N; i++) {
      let p, c;
      if (part[i] === 0) {
        const a = Math.floor(R() * n), b = Math.floor(R() * n), d = Math.floor(R() * n);
        const q = inSphere(0.03);
        p = [o + a * step + q[0], o + b * step + q[1], o + d * step + q[2]];
        s.aux[i * 4] = a; s.aux[i * 4 + 1] = b; s.aux[i * 4 + 2] = d; s.aux[i * 4 + 3] = 1;
        c = scale(COL.star, 0.4);
      } else { // wires: vertical legs and horizontal rows
        const a = Math.floor(R() * n), d = Math.floor(R() * n);
        if (R() < 0.6) p = [o + a * step, o + R() * 1.7, o + d * step];
        else p = [o + R() * 1.7, o + Math.floor(R() * n) * step, o + d * step];
        s.aux[i * 4 + 3] = 0;
        c = scale(COL.dust, 0.55);
      }
      put(s, i, p, c);
    }
    s.update = t => {
      const TC = s._TC;
      for (let i = 0; i < N; i++) {
        if (s.aux[i * 4 + 3] !== 1) continue;
        const a = s.aux[i * 4], b = s.aux[i * 4 + 1], d = s.aux[i * 4 + 2];
        // a sheet of light sweeping through the cube, plus slow rain
        const wave = Math.sin(a * 0.7 + b * 0.9 + d * 0.5 - t * 2.4);
        const rain = frac(-t * 0.6 + ((a * 7 + d * 13) % 11) / 11) * n;
        const lit = Math.max(smooth(0.72, 0.98, wave), Math.abs(rain - b) < 0.6 ? 0.85 : 0);
        const c = mix(scale(COL.star, 0.35), COL.amber, lit);
        const j = i * 3;
        TC[j] = c[0]; TC[j + 1] = c[1]; TC[j + 2] = c[2];
      }
    };
    return s;
  };

  /* Journey: a path that climbs through milestones */
  SHAPES.path = N => {
    const s = makeShape(N, { spin: 0, sway: 0.38, tilt: 0.25, size: 0.85, gain: 1, y: -0.1 });
    const K = 7, now = 4;
    const curve = u => [-1.55 + 3.1 * u, -0.95 + 1.9 * u + 0.28 * Math.sin(u * TAU * 1.1), 0.55 * Math.sin(u * TAU * 0.75)];
    const part = split(N, [0.62, 0.38]);
    for (let i = 0; i < N; i++) {
      let p, c, u;
      if (part[i] === 0) { u = R(); const q = curve(u); p = [q[0] + gauss() * 0.025, q[1] + gauss() * 0.025, q[2] + gauss() * 0.025]; c = scale(COL.star, 0.5); }
      else {
        const k = i % K; u = k / (K - 1);
        const q = curve(u), r = k === now ? 0.13 : 0.09, b = onSphere(r * Math.pow(R(), 0.6));
        p = [q[0] + b[0], q[1] + b[1], q[2] + b[2]];
        c = k < now ? COL.star : k === now ? COL.amber : scale(COL.blue, 0.6);
      }
      s.aux[i * 4] = u; s.aux[i * 4 + 1] = part[i];
      put(s, i, p, c);
    }
    s.update = t => {
      const TC = s._TC, head = frac(t * 0.11);
      for (let i = 0; i < N; i++) {
        if (s.aux[i * 4 + 1] !== 0) continue;
        const u = s.aux[i * 4], d = head - u;
        const glow = d > 0 && d < 0.12 ? (1 - d / 0.12) : 0;
        const c = mix(scale(COL.star, 0.45), COL.amber, glow);
        const j = i * 3;
        TC[j] = c[0]; TC[j + 1] = c[1]; TC[j + 2] = c[2];
      }
    };
    return s;
  };

  /* Contact: a small planet with a ring and a moon */
  SHAPES.orbit = N => {
    const s = makeShape(N, { spin: 0.12, tilt: 0.42, roll: -0.35, size: 1, gain: 1 });
    const part = split(N, [0.48, 0.34, 0.04, 0.14]);
    const L = [0.6, 0.5, 0.62];
    for (let i = 0; i < N; i++) {
      let p, c;
      switch (part[i]) {
        case 0: {
          const q = onSphere(0.62); p = q;
          const lit = clamp((q[0] * L[0] + q[1] * L[1] + q[2] * L[2]) / 0.62, 0, 1);
          c = mix(scale(COL.blue, 0.25), COL.star, Math.pow(lit, 0.8)); break;
        }
        case 1: { const a = R() * TAU, r = 0.9 + Math.pow(R(), 0.7) * 0.42; p = [Math.cos(a) * r, gauss() * 0.008, Math.sin(a) * r]; c = mix(COL.amber, COL.star, (r - 0.9) / 0.42 * 0.7); break; }
        case 2: { const q = onSphere(0.075); s.aux[i * 4] = q[0]; s.aux[i * 4 + 1] = q[1]; s.aux[i * 4 + 2] = q[2]; s.aux[i * 4 + 3] = 1; p = q; c = COL.star; break; }
        default: p = onSphere(2.4 + R() * 3); c = scale(COL.star, 0.35 + R() * 0.3);
      }
      put(s, i, p, c);
    }
    s.update = t => {
      const T = s._T, a = t * 0.5;
      const mx = Math.cos(a) * 1.65, mz = Math.sin(a) * 1.65, my = Math.sin(a) * 0.35;
      for (let i = 0; i < N; i++) {
        if (s.aux[i * 4 + 3] !== 1) continue;
        const j = i * 3;
        T[j] = mx + s.aux[i * 4]; T[j + 1] = my + s.aux[i * 4 + 1]; T[j + 2] = mz + s.aux[i * 4 + 2];
      }
    };
    return s;
  };

  /* =================================================================
   * ENGINE
   * ================================================================= */
  const VERT = `
    attribute vec3 aPos;
    attribute vec3 aCol;
    attribute float aSize;
    uniform mat4 uModel;
    uniform mat4 uProj;
    uniform float uCamZ;
    uniform float uAspect;
    uniform float uPx;
    uniform float uGain;
    uniform vec3 uMouse;   // xy in clip space, z = strength
    uniform vec3 uShock;   // xy in clip space, z = age in seconds
    varying vec3 vCol;
    varying float vA;
    void main() {
      vec4 w = uModel * vec4(aPos, 1.0);
      w.z -= uCamZ;
      vec4 clip = uProj * w;
      vec2 ndc = clip.xy / clip.w;
      float boost = 0.0;

      vec2 d = ndc - uMouse.xy; d.x *= uAspect;
      float dist = length(d);
      float push = uMouse.z * smoothstep(0.22, 0.0, dist);
      ndc += normalize(d + 1e-5) * push * 0.06 * vec2(1.0 / uAspect, 1.0);
      boost += push * 0.9;

      if (uShock.z < 2.2) {
        vec2 e = ndc - uShock.xy; e.x *= uAspect;
        float de = length(e);
        float ring = uShock.z * 1.25;
        float wv = exp(-pow((de - ring) * 11.0, 2.0)) * (1.0 - uShock.z / 2.2);
        ndc += normalize(e + 1e-5) * wv * 0.06 * vec2(1.0 / uAspect, 1.0);
        boost += wv * 1.4;
      }

      clip.xy = ndc * clip.w;
      gl_Position = clip;
      float depth = -w.z;
      gl_PointSize = clamp(aSize * uPx / depth, 1.0, 28.0);
      vCol = aCol;
      vA = uGain * clamp(1.75 - depth * 0.24, 0.3, 1.0) * (1.0 + boost);
    }`;
  const FRAG = `
    precision mediump float;
    varying vec3 vCol;
    varying float vA;
    void main() {
      vec2 p = gl_PointCoord - 0.5;
      float r = length(p);
      float halo = smoothstep(0.5, 0.0, r);
      float core = smoothstep(0.2, 0.05, r);
      float a = halo * halo * 0.45 + core * 0.75;
      gl_FragColor = vec4(vCol * a * vA, 1.0);
    }`;

  function mat4mul(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return o;
  }
  const rotX = a => { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]); };
  const rotY = a => { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]); };
  const rotZ = a => { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); };
  const trs = (x, y, z, k) => new Float32Array([k, 0, 0, 0, 0, k, 0, 0, 0, 0, k, 0, x, y, z, 1]);
  function persp(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
  }

  function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    return sh;
  }

  const Field = {
    supported: false,
    count: 0,
    init(canvas, opts) {
      opts = opts || {};
      const gl = canvas.getContext('webgl', { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: 'high-performance' });
      if (!gl) return false;
      this.supported = true;
      const reduced = !!opts.reducedMotion;
      const area = window.innerWidth * window.innerHeight;
      let N = area > 1.4e6 ? 18000 : area > 7e5 ? 14000 : 8000;
      if ((navigator.hardwareConcurrency || 8) <= 4) N = Math.round(N * 0.7);
      this.count = N;

      const prog = gl.createProgram();
      gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      gl.useProgram(prog);
      const U = {};
      ['uModel', 'uProj', 'uCamZ', 'uAspect', 'uPx', 'uGain', 'uMouse', 'uShock'].forEach(n => { U[n] = gl.getUniformLocation(prog, n); });

      // particle state
      const P = new Float32Array(N * 3), V = new Float32Array(N * 3), C = new Float32Array(N * 3);
      let T = new Float32Array(N * 3), TC = new Float32Array(N * 3);
      const S = new Float32Array(N), seed = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const p = onSphere(4 + R() * 4);
        P[i * 3] = p[0]; P[i * 3 + 1] = p[1]; P[i * 3 + 2] = p[2];
        S[i] = R() < 0.03 ? 2.6 : 0.6 + R() * 0.9;
        seed[i] = R();
      }

      const mk = (data, usage) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, usage); return b; };
      const bPos = mk(P, gl.DYNAMIC_DRAW), bCol = mk(C, gl.DYNAMIC_DRAW), bSize = mk(S, gl.STATIC_DRAW);
      const attr = (name, buf, n) => { const l = gl.getAttribLocation(prog, name); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, n, gl.FLOAT, false, 0, 0); };
      attr('aPos', bPos, 3); attr('aCol', bCol, 3); attr('aSize', bSize, 1);

      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);

      const FOV = 35 * Math.PI / 180, CAMZ = 4.4;
      let W = 1, H = 1, dpr = 1, aspect = 1;
      function resize() {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        W = window.innerWidth; H = window.innerHeight; aspect = W / H;
        canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
        canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.uniformMatrix4fv(U.uProj, false, persp(FOV, aspect, 0.1, 60));
        gl.uniform1f(U.uCamZ, CAMZ);
        gl.uniform1f(U.uAspect, aspect);
        gl.uniform1f(U.uPx, 19.0 * dpr * Math.sqrt(H / 900));
      }
      resize();
      window.addEventListener('resize', resize);

      const cache = {};
      const get = name => cache[name] || (cache[name] = SHAPES[name](N));
      const st = { highlight: -1 };
      let shape = null, changedAt = 0, time = 0, angle = 0, spinBoost = 0;
      const L = { x: 0, y: 0, k: 1, tilt: 1, roll: 0, gain: 0, sway: 0 }; // current layout, eased toward target
      let layoutFor = () => ({ x: 0, y: 0, k: 1 });
      const mouse = { x: 0, y: 0, tx: 0, ty: 0, str: 0, tstr: 0 };
      const shock = { x: 0, y: 0, age: 9 };
      let dim = 1;

      function setShape(name) {
        if (!SHAPES[name] || (shape && shape.name === name)) return;
        const s = get(name);
        s.name = name;
        s._T = T; s._TC = TC;
        T.set(s.pos); TC.set(s.col);
        shape = s; changedAt = time;
        // swirl kick so the change reads as one motion
        if (!reduced) for (let i = 0; i < N; i++) {
          const j = i * 3, x = P[j], z = P[j + 2];
          V[j] += -z * 0.03 + gauss() * 0.012; V[j + 1] += gauss() * 0.012; V[j + 2] += x * 0.03 + gauss() * 0.012;
        }
      }

      function frame(now) {
        const dt = Math.min(0.05, (now - (frame.last || now)) / 1000);
        frame.last = now;
        time += dt;
        if (shape) {
          const tl = time - changedAt;
          if (shape.update) shape.update(time, T, TC, st);
          const cfg = shape.cfg, lay = layoutFor(shape.name, aspect);
          const e = 1 - Math.pow(0.04, dt);
          L.x = lerp(L.x, lay.x, e); L.y = lerp(L.y, lay.y + cfg.y * lay.k, e); L.k = lerp(L.k, lay.k * cfg.size, e);
          L.tilt = lerp(L.tilt, cfg.tilt, e); L.roll = lerp(L.roll, cfg.roll, e); L.sway = lerp(L.sway, cfg.sway, e);
          L.gain = lerp(L.gain, cfg.gain * dim * (lay.gain || 1), 1 - Math.pow(0.15, dt));
          spinBoost *= Math.pow(0.08, dt);
          if (cfg.spin === 0) { // face the viewer: ease back to the nearest full turn
            angle = lerp(angle, Math.round(angle / TAU) * TAU, 1 - Math.pow(0.08, dt)) + spinBoost * dt * 0.3;
          } else angle += (cfg.spin * (reduced ? 0.4 : 1) + spinBoost) * dt;

          // springs
          const f = dt * 60;
          const damp = Math.pow(0.84, f);
          const ramp = Math.min(1, tl * 1.4);
          for (let i = 0; i < N; i++) {
            const j = i * 3;
            const k = 0.05 * clamp(tl * 1.6 - seed[i] * 0.9, 0.04, 1) * f;
            V[j] = V[j] * damp + (T[j] - P[j]) * k;
            V[j + 1] = V[j + 1] * damp + (T[j + 1] - P[j + 1]) * k;
            V[j + 2] = V[j + 2] * damp + (T[j + 2] - P[j + 2]) * k;
            P[j] += V[j] * f; P[j + 1] += V[j + 1] * f; P[j + 2] += V[j + 2] * f;
            const ce = 0.05 * f * ramp + 0.01;
            C[j] += (TC[j] - C[j]) * ce; C[j + 1] += (TC[j + 1] - C[j + 1]) * ce; C[j + 2] += (TC[j + 2] - C[j + 2]) * ce;
          }
        }
        mouse.x = lerp(mouse.x, mouse.tx, 1 - Math.pow(0.002, dt));
        mouse.y = lerp(mouse.y, mouse.ty, 1 - Math.pow(0.002, dt));
        mouse.str = lerp(mouse.str, mouse.tstr, 1 - Math.pow(0.02, dt));
        shock.age += dt;

        const ay = angle + (L.sway ? Math.sin(time * 0.35) * L.sway : 0) + mouse.x * 0.22;
        let m = trs(L.x, L.y, 0, L.k);
        m = mat4mul(m, rotZ(L.roll));
        m = mat4mul(m, rotX(L.tilt - mouse.y * 0.12));
        m = mat4mul(m, rotY(ay));
        gl.uniformMatrix4fv(U.uModel, false, m);
        gl.uniform1f(U.uGain, L.gain);
        gl.uniform3f(U.uMouse, mouse.x, mouse.y, reduced ? 0 : mouse.str);
        gl.uniform3f(U.uShock, shock.x, shock.y, shock.age);

        gl.bindBuffer(gl.ARRAY_BUFFER, bPos); gl.bufferSubData(gl.ARRAY_BUFFER, 0, P);
        gl.bindBuffer(gl.ARRAY_BUFFER, bCol); gl.bufferSubData(gl.ARRAY_BUFFER, 0, C);
        gl.clearColor(0.0196, 0.0275, 0.051, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.POINTS, 0, N);
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);

      // input
      window.addEventListener('pointermove', e => {
        mouse.tx = e.clientX / W * 2 - 1; mouse.ty = 1 - e.clientY / H * 2; mouse.tstr = 1;
      }, { passive: true });
      document.addEventListener('pointerleave', () => { mouse.tstr = 0; });
      window.addEventListener('blur', () => { mouse.tstr = 0; });

      this.setShape = setShape;
      this.setLayout = fn => { layoutFor = fn; };
      this.setHighlight = i => { st.highlight = i; };
      this.setDim = v => { dim = v; };
      this.spin = v => { if (!reduced) spinBoost = clamp(spinBoost + v, -1.2, 1.2); };
      this.shock = (cx, cy) => { if (reduced) return; shock.x = cx / W * 2 - 1; shock.y = 1 - cy / H * 2; shock.age = 0; };
      this.shapes = Object.keys(SHAPES);
      return true;
    },
  };

  window.Field = Field;
})();
