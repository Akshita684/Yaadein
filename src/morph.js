/* ═════════ morphed-stroke figure engine ═════════
   A figure is made of the poem's own handwritten strokes, morphed into a shape.
   Each poem word owns one cluster of figure strokes. Tap: the cluster lifts off, folds in,
   and becomes the true handwritten word as it lands in the reading panel. Optional ink layer
   (bitmap + ASCII + halftone) for parts drawn in ink, such as a trunk. */
window.SCENES = window.SCENES || {};
window.makeMorphScene = function(cfg){
"use strict";
const cv = document.getElementById(cfg.canvas), ctx = cv.getContext("2d");
const INK = "#1c1915", PAPER = "#ffffff";
const clamp = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
const lerp = (a, b, k) => a + (b - a)*k;
const sine = e => .5 - .5*Math.cos(Math.PI*e);
const smooth = (a, b, x) => { const k = clamp((x - a)/(b - a)); return k*k*(3 - 2*k); };
const now = () => performance.now()/1000;
const TY = cfg.ty || 0, FILL = cfg.fig.evenodd ? "evenodd" : "nonzero", LINE = cfg.fig.line || 0;

const units = cfg.poem.units.map((u, i) => {
  const [x, y, w, h] = u.b;
  return {i, p:u.p, d:u.d, path:new Path2D(u.d), x, y, w, h, cx:x + w/2, cy:y + h/2, tw:null};
});
const FB = cfg.fig.bbox, PIV = cfg.fig.pivot;
const strokes = cfg.fig.strokes.map(s => {
  const [x, y, w, h] = s.b, cx = x + w/2, cy = y + h/2;
  const r = Math.hypot(cx - PIV[0], cy - PIV[1]);
  return {path:new Path2D(s.d), c:s.c, cx, cy, w, h, r, wing:cx < PIV[0] + 25 && r > 40,
          hgt:clamp((PIV[1] - cy)/Math.max(1, PIV[1] - FB[1])), ph:Math.random()*6.283, in:0};
});
const clusters = units.map(() => ({members:[], w:0}));
strokes.forEach(s => clusters[s.c].members.push(s));
clusters.forEach(c => {
  if (!c.members.length){ c.w = 20; return; }
  c.w = Math.max(...c.members.map(s => s.cx + s.w/2)) - Math.min(...c.members.map(s => s.cx - s.w/2));
});

let W, H, DPR, mode = "init", phaseEnd = 0, revealAt = 0, revealed = false;
let MT = 1e9, BS = 1, BX = 0, BY = 0, F = 1, ENTER = null, BS0 = 1, BX0 = 0, BY0 = 0, CAM = null, VEC = 1;

function layout(){
  const top = Math.min(80, H*.09);
  BS = Math.min((W*.92)/FB[2], (H - top - 24)/FB[3], cfg.maxScale || 1.25);
  BX = (W - FB[2]*BS)/2 - FB[0]*BS; BY = top + (H - top - FB[3]*BS)/2 - FB[1]*BS;
  if (cfg.anchorBottom) BY = Math.max(BY, H - (FB[1] + FB[3])*BS);   // the stem always runs off the bottom edge
  BS0 = BS; BX0 = BX; BY0 = BY;
  if (cfg.perch) perchLayout();
  if (cfg.ink){ buildInk();
    if (cfg.sproutFrom){ let mx = 1; const [ox, oy] = cfg.sproutFrom;
      for (const s of strokes){ s.nx = ox; s.ny = oy; s.dn = Math.hypot(s.cx - ox, s.cy - oy); mx = Math.max(mx, s.dn); }
      for (const s of strokes) s.dn /= mx; }
    else nearestBranch(); }
}
/* each crown stroke remembers the nearest bit of trunk or branch, so it can sprout from it */
function nearestBranch(){
  const wood = inkCells.filter(c => c.v > .45 && c.type !== "wash");
  let maxd = 1;
  for (const s of strokes){
    let best = 1e9, bx = s.cx, by = s.cy;
    for (let i = 0; i < wood.length; i += 2){ const c = wood[i], d = (c.px - s.cx)**2 + (c.py - s.cy)**2; if (d < best){ best = d; bx = c.px; by = c.py; } }
    s.nx = bx; s.ny = by; s.dn = Math.sqrt(best); maxd = Math.max(maxd, s.dn);
  }
  for (const s of strokes) s.dn /= maxd;
}

/* ── idle motion ── */
function swayAt(cx, cy, hgt, ph, t){
  if (cfg.sway === "wind"){
    // the whole tree bends together from its base, the crown flutters a little on top
    const A = cfg.swayAmp || 1, h2 = hgt*hgt, bend = (Math.sin(t*.62)*12 + Math.sin(t*1.27 + .7)*2.6)*A;
    const dx = bend*h2 + Math.sin(t*1.7 + cx*.03 + cy*.02 + ph)*1.3*hgt*A;
    return {dx, dy:Math.abs(bend)*h2*.07 + Math.sin(t*1.3 + cx*.025)*.9*hgt, r:bend*h2*.004 + Math.sin(t*1.5 + cx*.04)*.012*hgt};
  }
  return {dx:0, dy:0, r:0};
}
function strokePose(s, t){
  let x = s.cx, y = s.cy, r = 0;
  if (cfg.sway === "wing"){
    if (s.wing){
      const dt = ENTER === null ? -1 : t - ENTER;
      const burst = dt < 0 ? 0 : Math.exp(-dt/1.7)*smooth(0, .35, dt);   // take-off wingbeats, easing to the idle beat
      const a = Math.sin(t*1.1 - s.r*.006)*.028*(s.r/600)*(dt < 0 ? .3 : 1)
              + burst*Math.sin(dt*5.4 - s.r*.004 - 1.2)*.4*Math.min(1, s.r/420);
      const dx = x - PIV[0], dy = y - PIV[1], c = Math.cos(a), sn = Math.sin(a);
      x = PIV[0] + dx*c - dy*sn; y = PIV[1] + dx*sn + dy*c; r = a;
    } else { x += Math.sin(t*.9 + s.ph)*.35; y += Math.sin(t*.8)*1.2 + Math.sin(t*1.3 + s.ph)*.3; }
    y += Math.sin(t*.8)*1.5;
    if (ENTER !== null) y -= smooth(0, 2.6, t - ENTER)*38;      // lifting off the branch
    if (cfg.perch && s.sx !== undefined && MT < 1e8){             // perched words unfolding into the flying bird
      if (s.body){                                                // body words drift a little into place, one by one
        const d0 = PERCH.morph0 - .9 + s.md*1.6, e = ease3(smooth(d0, d0 + 1.5, MT));
        s.me = e; x = s.sx + (x - s.sx)*e; y = s.sy + (y - s.sy)*e;
      } else {                                                    // the wing opens feather by feather from the shoulder outwards
        const d0 = PERCH.morph0 + .3 + s.md*.9, e = ease3(smooth(d0, d0 + 1.9, MT));
        s.me = e;
        const ax = s.sx, ay = s.sy, zx = x, zy = y;
        x = ax + (zx - ax)*e; y = ay + (zy - ay)*e; r *= e;
      }
    } else s.me = 1;
  } else {
    const w = swayAt(s.cx, s.cy, s.hgt, s.ph, t); x += w.dx; y += w.dy; r = w.r;
  }
  return {x:BX + x*BS, y:BY + (y + TY)*BS, r};
}
function clusterCenter(c, t){
  if (!c.members.length) return {x:BX + (FB[0] + FB[2]/2)*BS, y:BY + (FB[1] + FB[3]*.3)*BS};
  let x = 0, y = 0; for (const s of c.members){ const p = strokePose(s, t); x += p.x; y += p.y; }
  return {x:x/c.members.length, y:y/c.members.length};
}
const wordScaleFor = (c, u) => clamp(c.w*BS/Math.max(8, u.w), .15, 3);

function drawStroke(s, x, y, r, sc, a){
  const c = Math.cos(r)*sc, sn = Math.sin(r)*sc;
  ctx.setTransform(DPR*c, DPR*sn, -DPR*sn, DPR*c, DPR*(x - (c*s.cx - sn*s.cy)), DPR*(y - (sn*s.cx + c*s.cy)));
  ctx.globalAlpha = a*F;
  if (LINE){ ctx.lineWidth = LINE; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.stroke(s.path); } else ctx.fill(s.path, FILL);
}
function drawWord(u, x, y, r, sc, a){
  const c = Math.cos(r)*sc, sn = Math.sin(r)*sc;
  ctx.setTransform(DPR*c, DPR*sn, -DPR*sn, DPR*c, DPR*(x - (c*u.cx - sn*u.cy)), DPR*(y - (sn*u.cx + c*u.cy)));
  ctx.globalAlpha = a*F; ctx.fill(u.path); ctx.lineWidth = .6/sc; ctx.stroke(u.path);
}

/* ── ink layer: solid ink as bitmap blocks, edges as ASCII following the brush, mid-tones as halftone dots, wash as sparse marks ── */
let inkCells = [], inkCell = 7, inkState = {kind:"grow", t0:0, dir:1};
const INK_GRID = cfg.ink ? (() => { const b = atob(cfg.ink.data), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; })() : null;
function inkAt(px, py){                                  // page units → darkness 0..1 (bilinear)
  const g = cfg.ink, fx = (px - g.x)/g.cell - .5, fy = (py - g.y)/g.cell - .5;
  const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
  const at = (a, b) => (a < 0 || b < 0 || a >= g.w || b >= g.h) ? 0 : INK_GRID[b*g.w + a]/255;
  return lerp(lerp(at(i, j), at(i + 1, j), u), lerp(at(i, j + 1), at(i + 1, j + 1), u), v);
}
function buildInk(){
  const g = cfg.ink;
  inkCell = clamp(BS*3.4, 4, 6.2);
  const cu = inkCell/BS, R = (() => { let a = 99; return () => (a = (a*16807) % 2147483647)/2147483647; })();
  inkCells = [];
  const x0 = g.x, y0 = g.y, x1 = g.x + g.w*g.cell, y1 = g.y + g.h*g.cell;
  let row = 0;
  for (let py = y0 + cu/2; py < y1; py += cu, row++){
    for (let px = x0 + cu/2 + (row % 2 ? cu/2 : 0)*0; px < x1; px += cu){
      let v = 0; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) v += inkAt(px + a*cu/3, py + b*cu/3); v /= 9;
      if (v < .06) continue;
      const gx = inkAt(px + cu, py) - inkAt(px - cu, py), gy = inkAt(px, py + cu) - inkAt(px, py - cu), gm = Math.hypot(gx, gy);
      const rnd = R();
      let type, ch = "";
      if (cfg.inkDots){ type = v > .82 ? "block" : "dot"; }
      else if (v > .62 && gm < .3){ type = rnd < .35 ? "char" : "block"; ch = "#@%&8$M"[(rnd*700 | 0) % 7]; }
      else if (gm > .16 && v > .14){
        type = "char";
        let a = Math.atan2(gy, gx) + Math.PI/2; a = ((a % Math.PI) + Math.PI) % Math.PI;     // edge direction
        ch = a < Math.PI/8 || a > Math.PI*7/8 ? "-" : a < Math.PI*3/8 ? "\\" : a < Math.PI*5/8 ? "|" : "/";
      }
      else if (v > .24) type = "dot";
      else { type = "wash"; ch = ".:·'`,"[(rnd*600 | 0) % 6]; }
      const hgt = clamp((PIV[1] - py)/Math.max(1, PIV[1] - FB[1]));
      inkCells.push({px, py, v, type, ch, r:rnd, hgt});
    }
  }
}
function inkFade(c, t){
  const s = inkState, base = s.kind === "grow" ? c.hgt*1.9 + c.r*.1 : s.kind === "out" ? c.r*1.3 + (1 - c.hgt)*.2 : c.hgt*1.5 + c.r*.5;
  const k = clamp((t - s.t0 - base)/(s.kind === "grow" ? .45 : .8));
  return s.dir > 0 ? k : 1 - k;
}
function drawInk(t){
  if (!cfg.ink) return;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.font = `600 ${(inkCell*1.25).toFixed(1)}px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (const c of inkCells){
    const f = inkFade(c, t); if (f < .01) continue;
    const w = swayAt(c.px, c.py, c.hgt, 0, t);
    const x = BX + (c.px + w.dx)*BS, y = BY + (c.py + w.dy + TY)*BS + (inkState.dir < 0 ? (1 - f)*(1 - f)*inkCell*4 : 0);
    const flick = .9 + .1*Math.sin(t*(1.3 + c.r) + c.r*40);
    if (c.type === "block"){ const s = inkCell*(.78 + .2*c.v); ctx.globalAlpha = f*F*Math.min(1, .5 + c.v*.55); ctx.fillRect(x - s/2, y - s/2, s, s); }
    else if (c.type === "dot"){ const r = inkCell*.56*Math.sqrt(c.v)*flick; ctx.globalAlpha = f*F; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill(); }
    else if (c.type === "char"){ ctx.globalAlpha = f*F*Math.min(1, .6 + c.v*.5); ctx.fillText(c.ch, x, y); }
    else { ctx.globalAlpha = f*F*Math.min(.85, c.v*2.6)*flick; ctx.fillText(c.ch, x, y); }
  }
}

/* ── perch opening: a small bird on a far branch; the view zooms in; the bird of words takes off ──
   everything that isn't the words is drawn in greys and ordered-dithered to 1-bit ink */
const PERCH = {anchor:[405, 783], z0:.14, appear:1.0, zoom0:1.5, zoom1:5.6, silOut:99, perchIn:0, morph0:6.0, takeoff:9.0};
const BAYER = (() => { let M = [[0]];
  for (let n = 1; n < 8; n *= 2){ const N = []; for (let y = 0; y < n*2; y++){ N.push([]); for (let x = 0; x < n*2; x++) N[y].push(M[y % n][x % n]*4 + [[0, 2], [3, 1]][(y/n) | 0][(x/n) | 0]); } M = N; }
  return M.map(r => r.map(v => (v + .5)/64)); })();
const pg = document.createElement("canvas"), pgc = pg.getContext("2d", {willReadFrequently:true});
const pd = document.createElement("canvas"), pdc = pd.getContext("2d");
let PC = 2.5, pw = 0, ph = 0, pimg = null, BR = null;
const ease3 = e => e < .5 ? 4*e*e*e : 1 - Math.pow(-2*e + 2, 3)/2;
const shade = d => { const v = Math.round(255*(1 - clamp(d))); return `rgb(${v},${v},${v})`; };
let PST = null, BODY_D = [0, 0];                                                 // the perching word bird's strokes
function perchStrokes(){
  if (PST || !cfg.perchFig) return;
  PST = cfg.perchFig.map(p => ({path:new Path2D(p.d), cx:p.cx, cy:p.cy, tx:p.tx, ty:p.ty, k:p.k}));
  // body and head stay one piece; only the wing unfolds out of the folded wing
  PST.forEach(p => p.wing = p.cx < 395);
  const mean = a => [a.reduce((s, q) => s + q.cx, 0)/a.length, a.reduce((s, q) => s + q.cy, 0)/a.length];
  const pb = mean(PST.filter(p => !p.wing)), fb = mean(strokes.filter(s => !s.wing));
  BODY_D = [pb[0] - fb[0], pb[1] - fb[1]];
  const pw = PST.filter(p => p.wing).map(p => [Math.atan2(p.cy - 600, p.cx - 430), p]).sort((a, b) => a[0] - b[0]).map(q => q[1]);
  const fw = strokes.filter(s => s.wing).map(s => [Math.atan2(s.cy - PIV[1], s.cx - PIV[0]), s]).sort((a, b) => a[0] - b[0]);
  fw.forEach(([, s], r) => { const p = pw[Math.floor(r*pw.length/fw.length)]; s.sx = p.cx; s.sy = p.cy; s.md = r/fw.length; });
  for (const p of PST){ p.cx -= BODY_D[0]; p.cy -= BODY_D[1]; }
  PERCH.anchor = [PERCH.anchor[0] - BODY_D[0], PERCH.anchor[1] - BODY_D[1]];
  for (const [, s] of fw){ s.sx -= BODY_D[0]; s.sy -= BODY_D[1]; }
  const pbody = PST.filter(p => !p.wing);
  pbody.forEach(p => p.fd = Math.random());
  for (const s of strokes) if (!s.wing){           // each body word grows out of the nearest perched body word
    let best = 1e9, q = pbody[0];
    for (const p of pbody){ const d = (p.cx - s.cx)**2 + (p.cy - s.cy)**2; if (d < best){ best = d; q = p; } }
    s.sx = q.cx; s.sy = q.cy; s.md = Math.random(); s.body = true; }
}
function perchLayout(){
  perchStrokes();
  PC = W < 700 ? 2 : 2.5; pw = Math.ceil(W/PC); ph = Math.ceil(H/PC);
  pg.width = pd.width = pw; pg.height = pd.height = ph; pimg = pdc.createImageData(pw, ph);
  if (BR) return;
  // the branch, in drawing units, passing under the bird's feet
  let seed = 7; const R = () => (seed = (seed*16807) % 2147483647)/2147483647;
  const main = [[-1300, 945], [-600, 880], [0, 818], [405, 785], [820, 750], [1300, 716], [1900, 692]];
  const twigs = [], leaves = [], blooms = [];
  const along = (P, u) => { const f = u*(P.length - 1), i = Math.min(P.length - 2, Math.floor(f)), k = f - i; return [P[i][0] + (P[i + 1][0] - P[i][0])*k, P[i][1] + (P[i + 1][1] - P[i][1])*k]; };
  [[.12, -1], [.2, 1], [.33, -1], [.47, 1], [.62, -1], [.7, 1], [.82, -1], [.9, 1]].forEach(([u, sd]) => {
    const p = along(main, u), ang = -Math.PI/2 + sd*(.55 + R()*.5) + (sd > 0 ? .1 : -.4), len = 160 + R()*220;
    const q = [p[0] + Math.cos(ang)*len, p[1] + Math.sin(ang)*len*(sd > 0 ? -.2 : 1)];
    if (sd > 0) q[1] = p[1] + 60 + R()*140;                     // some twigs droop
    twigs.push([p, [(p[0] + q[0])/2 + (R() - .5)*60, (p[1] + q[1])/2 - 20], q]);
    for (let k = 0; k < 4; k++){ const v = .35 + k*.2, a = [p[0] + (q[0] - p[0])*v, p[1] + (q[1] - p[1])*v];
      leaves.push({x:a[0], y:a[1], r:(R() - .5)*2.4 + (k % 2 ? .9 : -.9), l:70 + R()*45, d:.35 + R()*.25}); }
    if (R() < .75) blooms.push({x:q[0], y:q[1], s:22 + R()*14, n:3 + (R()*3 | 0)});
  });
  BR = {main, twigs, leaves, blooms};
}
const FLY_TIPS = [[100, 50], [60, 135], [25, 240], [40, 380], [70, 470], [95, 590], [165, 640], [95, 750], [270, 850]];
const L2 = (a, b, k) => [a[0] + (b[0] - a[0])*k, a[1] + (b[1] - a[1])*k];
function feather(o, tip, w, tone){                       // a rounded feather from its base to its tip, with a pale linocut quill
  const dx = tip[0] - o[0], dy = tip[1] - o[1], l = Math.hypot(dx, dy) || 1;
  pgc.save(); pgc.translate(o[0], o[1]); pgc.rotate(Math.atan2(dy, dx));
  pgc.fillStyle = shade(tone); pgc.beginPath();
  pgc.moveTo(0, -w*.22); pgc.bezierCurveTo(l*.35, -w*.62, l*.85, -w*.5, l, 0); pgc.bezierCurveTo(l*.85, w*.45, l*.35, w*.5, 0, w*.22); pgc.closePath(); pgc.fill();
  pgc.strokeStyle = shade(.2); pgc.lineWidth = Math.max(2, w*.07); pgc.beginPath(); pgc.moveTo(l*.12, 0); pgc.lineTo(l*.86, w*.04); pgc.stroke();
  pgc.restore();
}
function blob(c, rx, ry, rot, g){ pgc.save(); pgc.translate(c[0], c[1]); pgc.rotate(rot); pgc.fillStyle = g; pgc.beginPath(); pgc.ellipse(0, 0, rx, ry, 0, 0, 6.283); pgc.fill(); pgc.restore(); }
function silhouette(alpha, t){
  pgc.globalAlpha = alpha;
  const sh = [452, 585];
  feather([352, 752], [42, 845], 46, .92);                       // tail
  for (let i = 0; i < 6; i++) feather(sh, [70 + i*34, 830 - i*30], 72 - i*4, i % 2 ? .96 : .82);   // folded wing
  const bg = pgc.createLinearGradient(380, 0, 500, 0); bg.addColorStop(0, shade(.96)); bg.addColorStop(.6, shade(.88)); bg.addColorStop(1, shade(.6));
  blob([440, 650], 56, 120, -.22, bg);
  blob([468, 548], 40, 50, -.2, shade(.94));                     // neck
  blob([490, 502], 40, 36, 0, shade(.95));                       // head
  pgc.fillStyle = shade(.95); pgc.beginPath(); pgc.moveTo(522, 492); pgc.lineTo(562, 505); pgc.lineTo(522, 512); pgc.closePath(); pgc.fill();
  pgc.fillStyle = shade(.02); pgc.beginPath(); pgc.arc(504, 494, 7, 0, 6.283); pgc.fill();
  pgc.fillStyle = shade(1); pgc.beginPath(); pgc.arc(505, 494, 3.2, 0, 6.283); pgc.fill();
  pgc.globalAlpha = 1;
}
function legs(alpha){
  pgc.globalAlpha = alpha; pgc.strokeStyle = shade(.95); pgc.lineWidth = 7; pgc.lineCap = "round";
  for (const [x0, y0, x1, y1] of [[418, 755, 408, 783], [446, 752, 450, 781]]){ pgc.beginPath(); pgc.moveTo(x0, y0); pgc.lineTo(x1, y1); pgc.moveTo(x1 - 15, y1 + 4); pgc.lineTo(x1 + 15, y1 + 2); pgc.stroke(); }
  pgc.globalAlpha = 1;
}
function camera(t){
  if (CAM === null){ VEC = 1; return; }
  const T = t - CAM, k = ease3(smooth(PERCH.zoom0, PERCH.zoom1, T));
  const Z = PERCH.z0*Math.pow(1/PERCH.z0, k);                  // zoom feels even when it's exponential
  const A = PERCH.anchor, ex = BX0 + A[0]*BS0, ey = BY0 + (A[1] + TY)*BS0;
  const sx = W*(W < 700 ? .55 : .6), sy = H*.6;
  const ax = sx + (ex - sx)*k, ay = sy + (ey - sy)*k;
  BS = BS0*Z; BX = ax - A[0]*BS; BY = ay - (A[1] + TY)*BS;
  VEC = smooth(PERCH.morph0 - 1, PERCH.morph0 - .7, T);             // flying words appear once the morph begins
  MT = T;
  if (T > PERCH.takeoff + 4){ CAM = null; BS = BS0; BX = BX0; BY = BY0; VEC = 1; MT = 1e9; }
}
function drawPerch(t){
  if (CAM === null) return;
  const T = t - CAM, appear = smooth(0, PERCH.appear, T);
  const go = smooth(PERCH.takeoff, PERCH.takeoff + 2.2, T);     // the branch dissolves and falls away as the bird lifts
  const k = BS/PC;
  pgc.setTransform(1, 0, 0, 1, 0, 0); pgc.fillStyle = "#fff"; pgc.fillRect(0, 0, pw, ph);
  // far haze: a soft ground line and distant trees, only while we're far away
  const far = 1 - smooth(.15, .5, BS/BS0);
  if (far > 0){                                               // a pale ground far below, and a hairline horizon
    const gy = ph*.78, lg = pgc.createLinearGradient(0, gy, 0, ph);
    lg.addColorStop(0, `rgba(0,0,0,${.1*far})`); lg.addColorStop(1, `rgba(0,0,0,${.03*far})`);
    pgc.fillStyle = lg; pgc.fillRect(0, gy, pw, ph - gy);
    pgc.fillStyle = `rgba(0,0,0,${.35*far})`; pgc.fillRect(0, gy, pw, 1);
  }
  pgc.setTransform(k, 0, 0, k, BX/PC, (BY + (go*go)*H*.6)/PC + TY*k); pgc.translate(-BODY_D[0], -BODY_D[1]);
  pgc.globalAlpha = 1 - go;
  pgc.lineCap = "round"; pgc.lineJoin = "round";
  // twigs and the main branch (darker underside, lit top edge)
  for (const [a, c, b] of BR.twigs){ pgc.strokeStyle = shade(.85); pgc.lineWidth = 13; pgc.beginPath(); pgc.moveTo(a[0], a[1]); pgc.quadraticCurveTo(c[0], c[1], b[0], b[1]); pgc.stroke(); }
  const M = BR.main;
  const stroke = (w, d, dy) => { pgc.strokeStyle = shade(d); pgc.lineWidth = w; pgc.beginPath(); M.forEach((p, i) => i ? pgc.lineTo(p[0], p[1] + dy) : pgc.moveTo(p[0], p[1] + dy)); pgc.stroke(); };
  stroke(30, .92, 3); stroke(16, .55, -4); stroke(6, .3, -8);
  // leaves: halftone-shaded, with a pale midrib
  for (const L of BR.leaves){
    pgc.save(); pgc.translate(L.x, L.y); pgc.rotate(L.r + Math.sin(t*.9 + L.x*.01)*.05);
    const g = pgc.createLinearGradient(0, -L.l*.22, 0, L.l*.22); g.addColorStop(0, shade(L.d*.55)); g.addColorStop(1, shade(L.d));
    pgc.fillStyle = g; pgc.beginPath(); pgc.ellipse(L.l*.55, 0, L.l*.55, L.l*.26, 0, 0, 6.283); pgc.fill();
    pgc.strokeStyle = shade(.1); pgc.lineWidth = 3; pgc.beginPath(); pgc.moveTo(4, 0); pgc.lineTo(L.l*.95, 0); pgc.stroke();
    pgc.restore();
  }
  // blossoms: pale petals with dark outlines and centres
  for (const b of BR.blooms) for (let n = 0; n < b.n; n++){
    const bx = b.x + Math.cos(n*2.3)*b.s*1.4*(n > 0), by = b.y + Math.sin(n*2.3)*b.s*1.1*(n > 0);
    for (let p = 0; p < 5; p++){ const a = p/5*6.283 + n; pgc.fillStyle = shade(.06); pgc.strokeStyle = shade(.85); pgc.lineWidth = 3;
      pgc.beginPath(); pgc.ellipse(bx + Math.cos(a)*b.s*.5, by + Math.sin(a)*b.s*.5, b.s*.45, b.s*.32, a, 0, 6.283); pgc.fill(); pgc.stroke(); }
    pgc.fillStyle = shade(.95); pgc.beginPath(); pgc.arc(bx, by, b.s*.2, 0, 6.283); pgc.fill();
  }
  // the silhouette bird: perched with folded wings, opening into flight as we zoom in
  // dither to ink
  const src = pgc.getImageData(0, 0, pw, ph).data, out = pimg.data;
  for (let y = 0; y < ph; y++){ const row = BAYER[y & 7];
    for (let x = 0; x < pw; x++){ const i = (y*pw + x)*4, d = (1 - src[i]/255)*appear;
      if (d > row[x & 7]){ out[i] = 28; out[i + 1] = 25; out[i + 2] = 21; out[i + 3] = 255; } else out[i + 3] = 0; } }
  pdc.putImageData(pimg, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false; ctx.globalAlpha = F;
  ctx.drawImage(pd, 0, 0, pw*PC*DPR, ph*PC*DPR); ctx.globalAlpha = 1;
}

/* ── a halftone butterfly that flutters in and settles on the flower ── */
const BF = {t0:null, leave:null};
// the butterfly is the reference drawing itself, sampled as a halftone: dark wing, pale spots
let BFM = null;
function bfMask(){
  if (BFM || !cfg.butterfly || !cfg.butterfly.shape) return BFM;
  const S = cfg.butterfly.shape, c = document.createElement("canvas"); c.width = 200; c.height = 260;
  const g = c.getContext("2d"); g.translate(-5, -140);
  g.fillStyle = "#000"; for (const d of S.dark) g.fill(new Path2D(d));
  g.fillStyle = "#fff"; for (const d of S.light) g.fill(new Path2D(d));
  BFM = g.getImageData(0, 0, 200, 260).data; return BFM;
}
const BF_O = [148, 342];                                     // where the butterfly holds on (reference coords)
function bfTone(u, v){
  const M = bfMask(); if (!M) return 0;
  const x = Math.round(u + BF_O[0] - 5), y = Math.round(v + BF_O[1] - 140);
  if (x < 0 || y < 0 || x >= 200 || y >= 260) return 0;
  const i = (y*200 + x)*4; if (M[i + 3] < 128) return 0;
  return M[i] < 128 ? .96 : 0;
}
function butterfly(t){
  if (!cfg.butterfly || BF.t0 === null) return;
  const B = cfg.butterfly, T = t - BF.t0;
  if (T < 0) return;
  // landing spot rides on the swaying flower
  const w = swayAt(B.land[0], B.land[1], clamp((PIV[1] - B.land[1])/(PIV[1] - FB[1])), 0, t);
  const L = [BX + (B.land[0] + w.dx)*BS, BY + (B.land[1] + w.dy + TY)*BS];
  const S0 = [-W*.15, H*.05], C1 = [W*.25, -H*.1], C2 = [L[0] - W*.35, L[1] + H*.25];
  const fly = clamp(T/B.flight), k = 1 - Math.pow(1 - fly, 2.2);
  let x, y, flap, ang;
  if (BF.leave !== null){
    const e = clamp((t - BF.leave)/2.2), q = e*e;
    x = L[0] + q*W*.7; y = L[1] - q*H*.9 + Math.sin(e*18)*8*(1 - e); flap = Math.abs(Math.cos(t*16)); ang = -.4 - .3*e;
  } else if (fly < 1){
    const m = 1 - k;
    x = m*m*m*S0[0] + 3*m*m*k*C1[0] + 3*m*k*k*C2[0] + k*k*k*L[0];
    y = m*m*m*S0[1] + 3*m*m*k*C1[1] + 3*m*k*k*C2[1] + k*k*k*L[1] + Math.sin(T*5.5)*14*(1 - k);
    flap = Math.abs(Math.cos(T*(14 - 6*k)));
    ang = -.25 + Math.sin(T*2.3)*.15*(1 - k);
  } else {
    // resting: a slow open-and-close every few seconds
    x = L[0]; y = L[1];
    const r = (T - B.flight) % 4.2; flap = r < 1.4 ? .55 + .45*Math.cos(r/1.4*6.283) : 1;
    ang = B.restAng + w.r;
  }
  flap = Math.max(.12, flap);
  const sc = BS*B.size/100, g = Math.max(3, 3.4*Math.sqrt(BS)), R = 240*sc;
  const c = Math.cos(ang), s = Math.sin(ang);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.fillStyle = INK; ctx.globalAlpha = F;
  ctx.beginPath();
  for (let py = Math.floor((y - R)/g)*g; py < y + R; py += g) for (let px = Math.floor((x - R)/g)*g; px < x + R; px += g){
    const dx = (px - x)/sc, dy = (py - y)/sc;
    let u = dx*c + dy*s, v = -dx*s + dy*c;
    if (u < 0) u /= flap;                                       // the wings fold toward the body as they beat
    const tn = bfTone(u, v); if (tn < .05) continue;
    const r = g*.56*Math.sqrt(tn);
    ctx.moveTo(px + r, py); ctx.arc(px, py, r, 0, 6.283);
  }
  ctx.fill();
  ctx.globalAlpha = 1;
}

/* ── transitions ── */
function intro(){
  const t = now(); let end = 0;
  ENTER = null;
  for (const s of strokes){
    if (cfg.sway === "wing") s.in = t;                               // already whole; it flies in
    else if (cfg.ink) s.in = t + .2 + 1.9 + (s.dn || 0)*1.9 + Math.random()*.3;   // after the trunk, out from the branches
    else s.in = t + .3 + (1 - s.hgt)*1.2 + Math.random()*.5;
    end = Math.max(end, s.in + 1);
  }
  if (cfg.butterfly){ BF.t0 = t + cfg.butterfly.delay; BF.leave = null; }
  if (cfg.sway === "wing"){
    if (cfg.perch){ CAM = t; MT = 0; ENTER = t + PERCH.takeoff; end = t + PERCH.takeoff + 2.6; }
    else { ENTER = t; end = t + 3.9; }
  }
  inkState = {kind:"grow", t0:t + .2, dir:1};
  units.forEach(u => u.tw = null);
  mode = "toBird"; phaseEnd = Math.max(end, t + 3); revealed = false;
}
function toPoem(){
  if (mode !== "bird") return;
  const T = window.Reader.prepare(cfg.key);
  const t = now(), R = Math.random, N = units.length; let end = 0;
  units.forEach(u => {
    const lift = 70 + R()*Math.min(170, H*.17);
    u.tw = {dir:1, t0:t + (u.i/N)*2.4 + R()*.3, dur:2.7 + R()*.7, to:T[u.i],
            c1:[(R() - .5)*W*.1, -lift], c2:[(R() - .5)*40, -30 - R()*60], swirl:(R() - .5)*1.1};
    end = Math.max(end, u.tw.t0 + u.tw.dur);
  });
  inkState = {kind:"out", t0:t, dir:-1};
  if (cfg.butterfly) BF.leave = t;
  mode = "toPoem"; phaseEnd = end; revealed = false;
}
function toBird(){
  if (mode !== "poem") return;
  const S = window.Reader.measure(cfg.key); window.Reader.hide();
  revealed = false;
  const t = now(), R = Math.random; let end = 0;
  units.forEach(u => {
    u.tw = {dir:-1, t0:t + R()*1.3, dur:2.5 + R()*.8, from:S[u.i],
            c1:[(R() - .5)*60, -40 - R()*90], c2:[(R() - .5)*W*.1, -50 - R()*120], swirl:(R() - .5)*1.1};
    end = Math.max(end, u.tw.t0 + u.tw.dur);
  });
  inkState = {kind:"back", t0:t + .5, dir:1};
  if (cfg.butterfly){ BF.t0 = t + 2.2; BF.leave = null; }
  mode = "toBird"; phaseEnd = end;
}
function drawPair(u, t){
  const c = clusters[u.i], tw = u.tw, e = clamp((t - tw.t0)/tw.dur), k = sine(e);
  const going = tw.dir > 0, home = clusterCenter(c, t);
  const A = going ? home : {x:tw.from.x, y:tw.from.y}, Z = going ? {x:tw.to.x, y:tw.to.y} : home;
  const m1 = 1 - k, x = m1*m1*m1*A.x + 3*m1*m1*k*(A.x + tw.c1[0]) + 3*m1*k*k*(Z.x + tw.c2[0]) + k*k*k*Z.x;
  const y = m1*m1*m1*A.y + 3*m1*m1*k*(A.y + tw.c1[1]) + 3*m1*k*k*(Z.y + tw.c2[1]) + k*k*k*Z.y;
  const m = going ? smooth(.22, .68, k) : 1 - smooth(.32, .78, k);
  const rot = Math.sin(Math.PI*k)*tw.swirl, fold = 1 - .7*m;
  if (m < .99) for (const s of c.members){
    const p = strokePose(s, t), dx = (p.x - home.x)*fold, dy = (p.y - home.y)*fold, cr = Math.cos(rot), sr = Math.sin(rot);
    drawStroke(s, x + dx*cr - dy*sr, y + dx*sr + dy*cr, p.r + rot, BS*lerp(1, .6, m), 1 - m);
  }
  if (m > .01){
    const s0 = wordScaleFor(c, u);
    const sc = going ? lerp(s0, tw.to.s, k) : lerp(tw.from.s, s0, k);
    const a = going ? lerp(1, tw.to.a, smooth(.6, 1, k)) : lerp(tw.from.a, 1, smooth(0, .3, k));
    drawWord(u, x, y, rot, sc, m*a);
  }
}

/* ── render ── */
function frame(ms){
  requestAnimationFrame(frame);
  if (window.__scene !== cfg.key) return;
  const t = ms/1000;
  if (mode === "toPoem" && t > phaseEnd && !revealed){ revealed = true; revealAt = t; window.Reader.reveal(); }
  if (mode === "toPoem" && revealed && t > revealAt + .7){ units.forEach(u => u.tw = null); mode = "poem"; }
  if (mode === "toBird" && t > phaseEnd){ units.forEach(u => u.tw = null); strokes.forEach(s => s.in = 0); mode = "bird"; }
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);
  if (mode === "poem") return;
  F = revealed ? 1 - clamp((t - revealAt)/.6) : 1;
  if (cfg.perch) camera(t);
  ctx.fillStyle = INK; ctx.strokeStyle = INK;
  drawInk(t);
  if (cfg.perch) drawPerch(t);
  if (cfg.perch && CAM !== null && PST){
    const T = t - CAM, pa = smooth(0, PERCH.appear, T)*(1 - smooth(PERCH.morph0 + .3, PERCH.morph0 + 1.6, T));
    if (pa > .01){ const br = Math.sin(t*.8)*1.2;
      ctx.setTransform(DPR*BS, 0, 0, DPR*BS, DPR*(BX - (38 + BODY_D[0])*BS), DPR*(BY + (br - 232 - BODY_D[1])*BS));
      const pb = smooth(0, PERCH.appear, T)*(1 - smooth(PERCH.morph0 - .3, PERCH.morph0 + .5, T));
      ctx.globalAlpha = pa*F; for (const p of PST) if (p.wing) ctx.fill(p.path);
      for (const p of PST) if (!p.wing){                         // perched body words fade one by one
        const d0 = PERCH.morph0 - .9 + p.fd*1.6, a = smooth(0, PERCH.appear, T)*(1 - smooth(d0 + .3, d0 + 1.4, T));
        if (a > .01){ ctx.globalAlpha = a*F; ctx.fill(p.path); } } }
  }
  const F0 = F; F *= VEC;
  units.forEach((u, i) => {
    if (u.tw){
      if (t >= u.tw.t0){ drawPair(u, t); return; }
      if (u.tw.dir < 0){ const f = u.tw.from; drawWord(u, f.x, f.y, 0, f.s, f.a); return; }
    }
    for (const s of clusters[i].members){
      const p = strokePose(s, t), a = (s.in ? clamp((t - s.in)/1) : 1)*(cfg.perch && MT < 1e8 ? smooth(0, .45, s.me) : 1);
      if (a > .01 && a < 1 && s.nx !== undefined){
        const e = 1 - Math.pow(1 - a, 3), nx = BX + s.nx*BS, ny = BY + (s.ny + TY)*BS;
        drawStroke(s, nx + (p.x - nx)*(.3 + .7*e), ny + (p.y - ny)*(.3 + .7*e), p.r, BS*(.5 + .5*e), a);
      } else if (a > .01) drawStroke(s, p.x, p.y, p.r, BS, a);
    }
  });
  F = F0;
  butterfly(t);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.globalAlpha = 1;
  cv.style.cursor = mode === "bird" ? "pointer" : "default";
}
cv.addEventListener("click", () => { if (mode === "bird") toPoem(); });
cv.addEventListener("keydown", e => { if ((e.key === " " || e.key === "Enter") && mode === "bird"){ e.preventDefault(); toPoem(); } });

function resize(){
  DPR = Math.min(2, window.devicePixelRatio || 1); W = innerWidth; H = innerHeight;
  cv.width = Math.round(W*DPR); cv.height = Math.round(H*DPR);
  layout();
  units.forEach(u => u.tw = null);
  if (window.__scene === cfg.key){ window.Reader.hide(true); intro(); } else mode = "pending";
}
let rt = null;
addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(resize, 220); });

const scene = {
  key:cfg.key, units, pages:cfg.poem.pages, alt:cfg.alt,
  enter(){ window.Reader.hide(true); CAM = null; intro(); },
  back(){ toBird(); },
  get mode(){ return mode; }
};
window.SCENES[cfg.key] = scene;
resize();
requestAnimationFrame(frame);
return scene;
};
