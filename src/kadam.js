/* ═════════ कदम का पेड़ ═════════ */
(() => {
"use strict";
const POEM = [
  "यह कदम का पेड़ अगर न होता आँगन बीचे",
  "रोज़ डालियों पर चढ़कर में खाता कदम रसीले",
  "कदम रसीले खाता जाता",
  "गुण इसके में गाता जाता",
  "मीठा मीठा कदम जो खाओ",
  "स्वाद में इसके घुल से जाओ",
  "अगर कदम हो थोड़ा खट्टा, थोड़ा मीठा, थोड़ा पक्का",
  "तो चटनी का स्वाद न पूछो",
  "लग जाए टमाटर नींबू को बट्टा"
];
const FONT = '"Tiro Devanagari Hindi","Noto Serif Devanagari","Noto Sans Devanagari",serif';
const seg = (typeof Intl !== "undefined" && Intl.Segmenter) ? new Intl.Segmenter("hi", {granularity:"grapheme"}) : null;
const graphemes = s => seg ? [...seg.segment(s)].map(o => ({g:o.segment, i:o.index}))
                           : [...s].map((g, k, a) => ({g, i:a.slice(0, k).join("").length}));

/* ───────── setup ───────── */
const cv = document.getElementById("kadam"), ctx = cv.getContext("2d");
let W, H, DPR, cell, treeSize, groundS, treeHS, poemSize, blockLeft, bbox;
let bits = [], bitSize = 2, bitMode = "in", bitT0 = 0, bitKind = "grow";
let particles = [], lines = [], mode = "init", phaseEnd = 0, hoverLine = -1, lastT = 0;
const ptr = {x:-1e4, y:-1e4, on:false};
const now = () => performance.now()/1000;
const clamp = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
const easeIO = e => e < .5 ? 4*e*e*e : 1 - Math.pow(-2*e + 2, 3)/2;
function rng(a){ return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0)/4294967296; }; }

const wcache = new Map();
function w100(g){ let v = wcache.get(g); if (v === undefined){ ctx.font = `100px ${FONT}`; v = ctx.measureText(g).width; wcache.set(g, v); } return v; }
const tsz = g => Math.min(treeSize, cell*1.08*100/Math.max(1, w100(g)));

/* ───────── the tree as a dithered density field, sampled at grid size c ───────── */
let GEO = null;
function trunkPath(o, g){
  const {cx, groundY, th, tb, tt, topY, lean} = g;
  o.beginPath();
  // a curving trunk that tapers upward and flares into roots
  o.moveTo(cx - tb*4, groundY + th*.004);
  o.bezierCurveTo(cx - tb*2, groundY - th*.01, cx - tb*1.25, groundY - th*.05, cx - tb*1.05, groundY - th*.13);
  o.bezierCurveTo(cx - tb*1.05, groundY - th*.2, cx - tb*.25, groundY - th*.3, cx - tt*.9 + lean*.6, groundY - th*.4);
  o.bezierCurveTo(cx - tt*1.4 + lean*1.2, groundY - th*.48, cx - tt + lean, topY + th*.08, cx - tt + lean, topY);
  o.lineTo(cx + tt + lean, topY);
  o.bezierCurveTo(cx + tt + lean, topY + th*.08, cx + tt*.7 + lean*1.2, groundY - th*.48, cx + tt*1.25 + lean*.6, groundY - th*.4);
  o.bezierCurveTo(cx + tb*1.15, groundY - th*.3, cx + tb*.95, groundY - th*.2, cx + tb*1.05, groundY - th*.09);
  o.bezierCurveTo(cx + tb*1.2, groundY - th*.05, cx + tb*2.2, groundY - th*.012, cx + tb*4.2, groundY + th*.004);
  o.closePath();
}
function buildTreeAt(c){
  cell = c; treeSize = cell*.9;
  const cols = Math.floor(W/cell), rows = Math.floor(H/cell);
  const S = 3, OW = cols*S, OH = rows*S;
  const oc = document.createElement("canvas"); oc.width = OW; oc.height = OH;
  const o = oc.getContext("2d");
  const R = rng(21);
  const gv = v => { const k = Math.round(clamp(v)*255); return `rgb(${k},${k},${k})`; };
  o.fillStyle = "#000"; o.fillRect(0, 0, OW, OH);

  const th = Math.min(OH*.74, OW*1.22);
  const groundY = OH*.5 + th*.47, cx = OW*.5;
  const ccy = groundY - th*.66, rx = Math.min(OW*.47, th*.6), ry = th*.31;

  o.globalCompositeOperation = "lighten";
  o.save(); o.translate(cx, groundY); o.scale(1, .07);
  const gr = o.createRadialGradient(0, 0, 0, 0, 0, th*.45);
  gr.addColorStop(0, gv(.6)); gr.addColorStop(1, gv(0));
  o.fillStyle = gr; o.beginPath(); o.arc(0, 0, th*.45, 0, Math.PI*2); o.fill(); o.restore();

  const tb = th*.064, tt = th*.032, topY = ccy + ry*.3, lean = th*.05;
  const tg = o.createLinearGradient(cx - tb, 0, cx + tb, 0);
  tg.addColorStop(0, gv(1)); tg.addColorStop(.45, gv(.86)); tg.addColorStop(1, gv(.42));
  o.fillStyle = tg; trunkPath(o, {cx, groundY, th, tb, tt, topY, lean}); o.fill();

  const blobs = [];
  for (let i = 0; i < 75; i++){
    const a = R()*Math.PI*2, r = Math.sqrt(R());
    const bx = cx + Math.cos(a)*r*rx*.8, by = ccy + Math.sin(a)*r*ry*.75;
    const br = (.18 + R()*.16)*rx*(1 - r*.3);
    blobs.push([bx, by, br]);
    const lt = clamp(.5 + .5*(-(by - ccy)/ry*.8 - (bx - cx)/rx*.35));
    const v = .5 + .5*lt;
    const rg = o.createRadialGradient(bx - br*.35, by - br*.4, br*.1, bx, by, br);
    rg.addColorStop(0, gv(v + .14)); rg.addColorStop(.7, gv(v)); rg.addColorStop(1, gv(v*.72));
    o.fillStyle = rg; o.beginPath(); o.arc(bx, by, br, 0, Math.PI*2); o.fill();
  }
  o.globalCompositeOperation = "source-over";
  const sy = ccy + ry*.45;
  const sg = o.createRadialGradient(cx, sy, 0, cx, sy, rx*.8);
  sg.addColorStop(0, "rgba(0,0,0,.66)"); sg.addColorStop(.6, "rgba(0,0,0,.34)"); sg.addColorStop(1, "rgba(0,0,0,0)");
  o.fillStyle = sg; o.fillRect(0, 0, OW, OH);

  o.globalCompositeOperation = "lighten"; o.lineCap = "round";
  const branch = (x, y, ang, len, wd, depth) => {
    const x2 = x + Math.cos(ang)*len, y2 = y + Math.sin(ang)*len;
    o.strokeStyle = gv(.58 + depth*.11); o.lineWidth = Math.max(1, wd);
    o.beginPath(); o.moveTo(x, y);
    o.quadraticCurveTo((x + x2)/2 + (R() - .5)*len*.35, (y + y2)/2, x2, y2); o.stroke();
    if (depth > 0){
      const n = 2 + (R() < .35 ? 1 : 0);
      for (let k = 0; k < n; k++) branch(x2, y2, ang + (R() - .5)*.9 + (k - (n - 1)/2)*.6, len*(.58 + R()*.15), wd*.6, depth - 1);
    }
  };
  const bx0 = cx + lean, by0 = topY + th*.03;
  branch(bx0, by0, -Math.PI/2 - .6, th*.17, tt*1.7, 3);
  branch(bx0, by0, -Math.PI/2 + .55, th*.17, tt*1.7, 3);
  branch(bx0, by0, -Math.PI/2 + .05, th*.13, tt*1.3, 2);

  for (let i = 0; i < 13; i++){
    const a = R()*Math.PI*2, r = .3 + R()*.6;
    const fx = cx + Math.cos(a)*r*rx*.85, fy = ccy + Math.sin(a)*r*ry*.8 - ry*.08;
    o.globalCompositeOperation = "source-over";
    o.fillStyle = "#000"; o.beginPath(); o.arc(fx, fy, S*2.5, 0, Math.PI*2); o.fill();
    o.fillStyle = "#fff"; o.beginPath(); o.arc(fx, fy, S*1.55, 0, Math.PI*2); o.fill();
  }

  const data = o.getImageData(0, 0, OW, OH).data;
  const inCrown = (x, y) => blobs.some(([bx, by, br]) => (x - bx)**2 + (y - by)**2 < (br*.96)**2);
  const tcv = document.createElement("canvas"); tcv.width = OW; tcv.height = OH;
  const tctx = tcv.getContext("2d"); tctx.fillStyle = "#fff"; trunkPath(tctx, {cx, groundY, th, tb, tt, topY, lean}); tctx.fill();
  const tdata = tctx.getImageData(0, 0, OW, OH).data;
  const bayer = [[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]];
  const offX = (W - cols*cell)/2, offY = (H - rows*cell)/2;
  const cands = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++){
    const v = data[((j*S + 1)*OW + i*S + 1)*4]/255;
    if (v < .07) continue;
    const score = v + (R() - .5)*.14 - (((bayer[j&3][i&3] + .5)/16)*.78 + .04);
    const gx = i*S + 1, gy = j*S + 1;
    const trunk = (tdata[(gy*OW + gx)*4 + 3] > 60 || gy > groundY - th*.02) && !inCrown(gx, gy);
    cands.push({i, j, v, score, trunk, hx:offX + i*cell + cell/2, hy:offY + j*cell + cell/2});
  }
  groundS = offY + groundY/S*cell; treeHS = th/S*cell;
  GEO = {S, cell, offX, offY, cx, groundY, th, tb, tt, topY, lean, ccy, rx, ry, blobs};
  return cands;
}

/* one cell per poem character (each used once, places shuffled) + bitmap pixels around them */
function buildTree(){
  const ALL = SLOTS;
  const N = ALL.length, R = rng(5);
  let cands = [];
  for (let c = Math.min(40, Math.min(W, H)/12); c >= 6; c -= .25){
    cands = buildTreeAt(c).filter(q => !q.trunk);
    if (cands.length >= N*1.4) break;
  }
  const chosen = cands.sort((a, b) => b.score - a.score).slice(0, N);
  // interchange: every character gets a random place in the tree
  const order = ALL.slice();
  for (let i = order.length - 1; i > 0; i--){ const j = (R()*(i + 1)) | 0; [order[i], order[j]] = [order[j], order[i]]; }
  particles = []; bbox = {x0:1e9, y0:1e9, x1:-1e9, y1:-1e9};
  chosen.forEach((c, k) => {
    const p = {hx:c.hx, hy:c.hy, g:order[k].g, slot:order[k], line:null, role:"tree", tw:null,
               a:.45 + .55*clamp(c.v), ph:R()*6.283, sp:.5 + R()*1.5};
    particles.push(p);
    bbox.x0 = Math.min(bbox.x0, p.hx); bbox.x1 = Math.max(bbox.x1, p.hx);
    bbox.y0 = Math.min(bbox.y0, p.hy); bbox.y1 = Math.max(bbox.y1, p.hy);
  });

  const save = [cell, treeSize, groundS, treeHS], coarse = cell, G = GEO;
  const taken = new Set(chosen.map(c => c.i + "," + c.j));
  const cOffX = (W - Math.floor(W/coarse)*coarse)/2, cOffY = (H - Math.floor(H/coarse)*coarse)/2;
  const fine = buildTreeAt(Math.max(4, coarse/3.4));
  bitSize = cell;                                                  // fine cell; dots are sized by tone (halftone)
  bits = fine.filter(c => !c.trunk && c.score > -.06 && !taken.has(Math.floor((c.hx - cOffX)/coarse) + "," + Math.floor((c.hy - cOffY)/coarse)))
             .map(c => ({hx:c.hx, hy:c.hy, v:clamp(c.v), a:.85, ph:R()*6.283, sp:.4 + R()*1.4, r:R()}));
  [cell, treeSize, groundS, treeHS] = save;
  buildInk(G);
}
function bitDelay(d){
  return bitKind === "grow" ? TRUNK_T*.85 + spread(d.hx, d.hy)*CROWN_T + d.r*.35 : bitKind === "out" ? d.r*1.3 : TRUNK_T*.6 + spread(d.hx, d.hy)*1.4 + d.r*.4;
}

/* ───────── the trunk in ink: bitmap blocks, ASCII edges, halftone shading ───────── */
let inkCells = [], inkCell = 5, CROWN = {x:0, y:0, r:1};
/* growing: the trunk climbs first (0 → TRUNK_T s), then the crown spreads out from the top of the trunk */
const TRUNK_T = 1.8, CROWN_T = 2.2;
const climb = y => clamp((groundS - y)/Math.max(1, groundS - CROWN.y));
const spread = (x, y) => clamp(Math.hypot(x - CROWN.x, (y - CROWN.y)*1.25)/CROWN.r);
function buildInk(G){
  inkCells = []; if (!G) return;
  const k = G.cell/G.S, X = gx => G.offX + gx*k, Y = gy => G.offY + gy*k;
  CROWN = {x:X(G.cx + G.lean), y:Y(G.topY + G.th*.04), r:Math.max(G.rx, G.ry)*k};
  const sc = .5, cw = Math.ceil(W*sc), chh = Math.ceil(H*sc);
  const cvs = document.createElement("canvas"); cvs.width = cw; cvs.height = chh;
  const o = cvs.getContext("2d");
  o.setTransform(k*sc, 0, 0, k*sc, G.offX*sc, G.offY*sc);
  // ground wash
  o.save(); o.translate(G.cx, G.groundY); o.scale(1, .09);
  let gr = o.createRadialGradient(0, 0, 0, 0, 0, G.th*.42); gr.addColorStop(0, "rgba(0,0,0,.75)"); gr.addColorStop(.55, "rgba(0,0,0,.35)"); gr.addColorStop(1, "rgba(0,0,0,0)");
  o.fillStyle = gr; o.beginPath(); o.arc(0, 0, G.th*.42, 0, 6.283); o.fill(); o.restore();
  // trunk: lit from the left — pale flank, dark core, deep shadow on the right
  const tg = o.createLinearGradient(G.cx - G.tb*1.2 + G.lean*.4, 0, G.cx + G.tb*1.2 + G.lean*.4, 0);
  tg.addColorStop(0, "rgba(0,0,0,.3)"); tg.addColorStop(.32, "rgba(0,0,0,.62)"); tg.addColorStop(.62, "rgba(0,0,0,1)"); tg.addColorStop(1, "rgba(0,0,0,.82)");
  o.fillStyle = tg; trunkPath(o, G); o.fill();
  // a side branch reaching up into the crown, and a smaller one on the right
  o.lineCap = "round";
  const lim = (x, y) => [x, y];
  o.strokeStyle = "rgba(0,0,0,.85)";
  o.lineWidth = G.tt*1.15; o.beginPath(); o.moveTo(G.cx - G.tt*.4 + G.lean*.5, G.groundY - G.th*.36);
  o.quadraticCurveTo(G.cx - G.rx*.22, G.groundY - G.th*.42, G.cx - G.rx*.42, G.ccy + G.ry*.5); o.stroke();
  o.lineWidth = G.tt*.8; o.beginPath(); o.moveTo(G.cx + G.tt*.6 + G.lean*.8, G.groundY - G.th*.44);
  o.quadraticCurveTo(G.cx + G.rx*.2, G.groundY - G.th*.5, G.cx + G.rx*.3, G.ccy + G.ry*.55); o.stroke();
  // crown hides the upper trunk
  o.globalCompositeOperation = "destination-out";
  for (const [bx, by, br] of G.blobs){ o.beginPath(); o.arc(bx, by, br*.96, 0, 6.283); o.fill(); }
  const img = o.getImageData(0, 0, cw, chh).data;
  const at = (x, y) => { const i = Math.round(x*sc), j = Math.round(y*sc); return i < 0 || j < 0 || i >= cw || j >= chh ? 0 : img[(j*cw + i)*4 + 3]/255; };
  inkCell = clamp(cell*.4, 4, 6.5);
  const R = rng(77), c = inkCell;
  for (let y = c/2; y < H; y += c) for (let x = c/2; x < W; x += c){
    let v = 0; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) v += at(x + a*c/3, y + b*c/3); v /= 9;
    if (v < .06) continue;
    // a little ink texture, so the wash is not flat
    v = clamp(v*(.86 + .28*Math.sin(x*.21 + Math.sin(y*.13)*2)*Math.sin(y*.17 + x*.05)));
    const gx = at(x + c, y) - at(x - c, y), gy = at(x, y + c) - at(x, y - c), gm = Math.hypot(gx, gy);
    const rnd = R(); let type, ch = "";
    if (v > .78 && gm < .3){ type = rnd < .3 ? "char" : "block"; ch = "#@%&8$M"[(rnd*700 | 0) % 7]; }
    else if (gm > .16 && v > .14){
      type = "char"; let an = Math.atan2(gy, gx) + Math.PI/2; an = ((an % Math.PI) + Math.PI) % Math.PI;
      ch = an < Math.PI/8 || an > Math.PI*7/8 ? "-" : an < Math.PI*3/8 ? "\\" : an < Math.PI*5/8 ? "|" : "/";
    }
    else if (v > .22) type = "dot";
    else { type = "wash"; ch = ".:·'`,"[(rnd*600 | 0) % 6]; }
    inkCells.push({hx:x, hy:y, v, type, ch, r:rnd});
  }
}
function drawInk(t){
  if (!inkCells.length) return;
  ctx.font = `600 ${(inkCell*1.25).toFixed(1)}px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (const c of inkCells){
    const k = clamp((t - bitT0 - (bitKind === "grow" ? climb(c.hy)*TRUNK_T + c.r*.12 : bitKind === "out" ? c.r*1.2 : climb(c.hy)*1.3 + c.r*.3))/(bitKind === "grow" ? .45 : .8));
    const f = bitMode === "in" ? k : 1 - k; if (f < .01) continue;
    const h = hf(c), sway = (Math.sin(t*.6)*7 + Math.sin(t*.55 + c.hy*.011)*2.2)*h*h;
    const x = c.hx + sway, y = c.hy + (bitMode === "out" ? (1 - f)*(1 - f)*inkCell*4 : 0);
    const flick = .9 + .1*Math.sin(t*(1.3 + c.r) + c.r*40);
    if (c.type === "block"){ const s = inkCell*(.78 + .2*c.v); ctx.globalAlpha = f*Math.min(1, .5 + c.v*.55); ctx.fillRect(x - s/2, y - s/2, s, s); }
    else if (c.type === "dot"){ ctx.globalAlpha = f; ctx.beginPath(); ctx.arc(x, y, inkCell*.56*Math.sqrt(c.v)*flick, 0, 6.283); ctx.fill(); }
    else if (c.type === "char"){ ctx.globalAlpha = f*Math.min(1, .6 + c.v*.5); ctx.fillText(c.ch, x, y); }
    else { ctx.globalAlpha = f*Math.min(.85, c.v*2.6)*flick; ctx.fillText(c.ch, x, y); }
  }
  ctx.textAlign = "start"; ctx.textBaseline = "alphabetic";
}

/* every non-space grapheme of the poem, in reading order (the reader panel uses the same order) */
const SLOTS = [];
POEM.forEach((line, li) => graphemes(line).forEach(o => { if (o.g.trim()) SLOTS.push({g:o.g, li, cx:0, cy:0, a:1}); }));

/* ───────── motion ───────── */
const hf = p => clamp((groundS - p.hy)/treeHS);
function treePos(p, t){
  const h = hf(p), hh = h*h;
  let x = p.hx + (Math.sin(t*.6)*7 + Math.sin(t*.55 + p.hy*.011)*2.2 + Math.sin(t*1.7 + p.hx*.025)*.8)*hh;
  let y = p.hy + Math.sin(t*1.1 + p.hx*.018)*1.4*hh, b = 0;
  if (ptr.on && mode === "tree"){
    const ex = x - ptr.x, ey = y - ptr.y, d = Math.hypot(ex, ey), RAD = cell*7;
    if (d < RAD && d > .01){ const f = 1 - d/RAD; x += ex/d*f*f*cell*1.5; y += ey/d*f*f*cell*1.5; b = f; }
  }
  return [x, y, b];
}
const treeAlpha = (p, t, b) => Math.min(1, p.a*(.74 + .26*Math.sin(t*p.sp + p.ph)) + b*.45);

function grow(){
  const t = now(); let end = 0;
  for (const p of particles){
    const st = t + .35 + TRUNK_T*.85 + spread(p.hx, p.hy)*CROWN_T + Math.random()*.35, d = 1 + Math.random()*.5;
    p.role = "tree";
    p.tw = {fromTree:false, toTree:true, fx:CROWN.x + (p.hx - CROWN.x)*.5, fy:CROWN.y + (p.hy - CROWN.y)*.5, fa:0, fs:tsz(p.g), ts:tsz(p.g), t0:st, dur:d, arc:0, ez:"out"};
    end = Math.max(end, st + d);
  }
  bitKind = "grow"; bitMode = "in"; bitT0 = t + .35;
  mode = "toTree"; phaseEnd = end;
}
function toPoem(){
  if (mode !== "tree") return;
  const T = window.Reader.prepare("kadam");                 // where every grapheme sits in the reading panel
  const t = now(), R = Math.random, spread = Math.min(W, H)*.22; let end = 0;
  for (const p of particles){
    const sl = p.slot, k = SLOTS.indexOf(sl), tg = T[k];
    const si = k - SLOTS.findIndex(x => x.li === sl.li);
    const st = t + .2 + sl.li*.32 + si*.012 + R()*.2, d = 1.9 + R()*.6;
    p.role = "verse";
    p.tw = {fromTree:true, toTree:false, tx:tg.cx, ty:tg.cy, ta:tg.a, fs:tsz(p.g), ts:tg.size, t0:st, dur:d, arc:(R() - .5)*spread, ez:"io"};
    end = Math.max(end, st + d);
  }
  bitKind = "out"; bitMode = "out"; bitT0 = t;
  mode = "toPoem"; phaseEnd = end; revealed = false;
}
function toTree(){
  if (mode !== "poem") return;
  const S = window.Reader.measure("kadam"); window.Reader.hide();
  const t = now(), R = Math.random, spread = Math.min(W, H)*.22; let end = 0;
  for (const p of particles){
    const k = SLOTS.indexOf(p.slot), sg = S[k];
    const st = t + .15 + R()*1.1, d = 1.7 + R()*.6;
    p.tw = {fromTree:false, toTree:true, fx:sg.cx, fy:sg.cy, fa:sg.a, fs:sg.size, ts:tsz(p.g), t0:st, dur:d, arc:(R() - .5)*spread, ez:"io"};
    end = Math.max(end, st + d);
  }
  bitKind = "back"; bitMode = "in"; bitT0 = t + .6;
  mode = "toTree"; phaseEnd = end;
}

/* ───────── render loop ───────── */
let revealed = false, revealAt = 0;
function frame(ms){
  requestAnimationFrame(frame);
  if (window.__scene !== "kadam") return;
  const t = ms/1000;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#1c1915";
  if (mode === "toPoem" && t > phaseEnd && !revealed){ revealed = true; revealAt = t; window.Reader.reveal(); }
  if (mode === "toPoem" && revealed && t > revealAt + .7){ mode = "poem"; }
  if (mode === "toTree" && t > phaseEnd){ for (const p of particles){ p.tw = null; p.role = "tree"; } mode = "tree"; }
  if (mode === "poem") return;
  const fade = revealed && mode === "toPoem" ? 1 - clamp((t - revealAt)/.6) : 1;

  drawInk(t);
  // halftone pixels
  for (const d of bits){
    const k = clamp((t - bitT0 - bitDelay(d))/.9), f = bitMode === "in" ? k : 1 - k;
    if (f <= .01) continue;
    const q = treePos(d, t);
    let x = q[0], y = q[1] + (bitMode === "out" ? (1 - f)*(1 - f)*cell*3 : 0);
    if (bitMode === "in" && f < 1){ const e = 1 - (1 - f)*(1 - f)*(1 - f); x = CROWN.x + (x - CROWN.x)*(.55 + .45*e); y = CROWN.y + (y - CROWN.y)*(.55 + .45*e); }
    ctx.globalAlpha = Math.min(1, d.a*f*(.82 + .18*Math.sin(t*d.sp + d.ph)) + q[2]*.3);
    const rr = bitSize*.36*Math.sqrt(.2 + .8*d.v);
    ctx.beginPath(); ctx.arc(x, y, rr, 0, 6.283); ctx.fill();
  }

  // poem characters
  ctx.textBaseline = "alphabetic";
  let curFont = "";
  const setFont = s => { const f = `${Math.round(s*4)/4}px ${FONT}`; if (f !== curFont){ ctx.font = f; curFont = f; } };
  for (const p of particles){
    let x, y, s, a; const g = p.g;
    if (!p.tw){ const r = treePos(p, t); x = r[0]; y = r[1]; s = tsz(g); a = treeAlpha(p, t, r[2]); }
    else {
      const tw = p.tw, e = clamp((t - tw.t0)/tw.dur);
      const k = tw.ez === "out" ? 1 - Math.pow(1 - e, 3) : .5 - .5*Math.cos(Math.PI*e);
      let fx, fy, fa, tx, ty, ta;
      if (tw.fromTree){ const r = treePos(p, t); fx = r[0]; fy = r[1]; fa = treeAlpha(p, t, r[2]); } else { fx = tw.fx; fy = tw.fy; fa = tw.fa; }
      if (tw.toTree){ const r = treePos(p, t); tx = r[0]; ty = r[1]; ta = treeAlpha(p, t, r[2]); } else { tx = tw.tx; ty = tw.ty; ta = tw.ta; }
      x = fx + (tx - fx)*k; y = fy + (ty - fy)*k;
      if (tw.arc){ const dx = tx - fx, dy = ty - fy, L = Math.hypot(dx, dy) || 1, sn = Math.sin(Math.PI*k)*tw.arc; x += -dy/L*sn; y += dx/L*sn; }
      s = tw.fs + (tw.ts - tw.fs)*k; a = fa + (ta - fa)*k;
    }
    a *= fade;
    if (a < .01) continue;
    setFont(s); ctx.globalAlpha = a;
    ctx.fillText(g, x - w100(g)*s/200, y + s*.32);
  }
  ctx.globalAlpha = 1;
  const overTree = mode === "tree" && ptr.x > bbox.x0 - cell*2 && ptr.x < bbox.x1 + cell*2 && ptr.y > bbox.y0 - cell*2 && ptr.y < bbox.y1 + cell;
  cv.style.cursor = overTree ? "pointer" : "default";
}

/* ───────── input ───────── */
cv.addEventListener("pointermove", e => { ptr.x = e.clientX; ptr.y = e.clientY; ptr.on = true; });
cv.addEventListener("pointerdown", e => { ptr.x = e.clientX; ptr.y = e.clientY; ptr.on = true; });
cv.addEventListener("pointerleave", () => { ptr.on = false; });
cv.addEventListener("pointerup", e => { if (e.pointerType !== "mouse") setTimeout(() => ptr.on = false, 400); });
cv.addEventListener("click", () => { if (mode === "tree") toPoem(); });
cv.addEventListener("keydown", e => { if ((e.key === " " || e.key === "Enter") && mode === "tree"){ e.preventDefault(); toPoem(); } });

function resize(){
  DPR = Math.min(2, window.devicePixelRatio || 1); W = innerWidth; H = innerHeight;
  cv.width = Math.round(W*DPR); cv.height = Math.round(H*DPR);
  wcache.clear();
  buildTree();
  if (window.__scene === "kadam"){ window.Reader.hide(true); grow(); } else mode = "pending";
}
let rt = null;
addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(resize, 220); });

window.Kadam = {
  POEM, graphemes,
  enter(){ window.Reader.hide(true); revealed = false; grow(); },
  back(){ toTree(); },
  get mode(){ return mode; },
  start(){ resize(); requestAnimationFrame(frame); }
};
})();
