/* ═════════ landing: a halftone doorway, then the poems as cards ═════════ */
(() => {
"use strict";
const INK = "#1c1915", PAPER = "#ffffff";
const clamp = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
const smooth = (a, b, x) => { const k = clamp((x - a)/(b - a)); return k*k*(3 - 2*k); };
const land = document.getElementById("landing");

/* ── a doorway slowly opening, drawn in greys and ordered-dithered to 1-bit ink, stepped like a time-lapse ── */
const cv = document.getElementById("door"), ctx = cv.getContext("2d");
let W, H, DPR, cell, gw, gh, box, t0 = null;
const gcv = document.createElement("canvas"), g = gcv.getContext("2d", {willReadFrequently:true});
const dcv = document.createElement("canvas"), dctx = dcv.getContext("2d");
let dimg = null;
const BAYER = (() => {                                   // 8×8 ordered-dither thresholds
  const m = [[0]]; let M = m;
  for (let n = 1; n < 8; n *= 2){
    const N = []; for (let y = 0; y < n*2; y++){ N.push([]); for (let x = 0; x < n*2; x++){
      const q = M[y % n][x % n]*4; N[y].push(q + [[0, 2], [3, 1]][(y/n) | 0][(x/n) | 0]); } }
    M = N;
  }
  return M.map(r => r.map(v => (v + .5)/64));
})();
const INKRGB = [28, 25, 21];
const ease = e => e < .5 ? 4*e*e*e : 1 - Math.pow(-2*e + 2, 3)/2;
const lerp = (a, b, k) => a + (b - a)*k;
const shade = d => { const v = Math.round(255*(1 - clamp(d))); return `rgb(${v},${v},${v})`; };   // d = how much ink

function layout(){
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = cv.clientWidth; H = cv.clientHeight;
  cv.width = Math.round(W*DPR); cv.height = Math.round(H*DPR);
  cell = Math.max(2, Math.round(Math.min(W, H)/360*2)/2);
  gw = Math.ceil(W/cell); gh = Math.ceil(H/cell);
  gcv.width = dcv.width = gw; gcv.height = dcv.height = gh;
  dimg = dctx.createImageData(gw, gh);
  const s = W < 700 ? Math.min(W*1.25, H*.8) : Math.min(H*.98, W*.62);
  box = W < 700 ? {x:W*.28 - s/2, y:(H - s)/2 + H*.09, s} : {x:W*.35 - s/2, y:(H - s)/2 + H*.02, s};
  // "Yaadein" rests just above the line where the wall meets the floor
  const ht = document.querySelector(".hero-text");
  if (ht){ ht.style.top = "auto"; ht.style.bottom = (H - (box.y + D.y1/1000*box.s) + Math.max(10, H*.02)) + "px"; }
}

/* the doorway, drawn in greys (design space 1000 × 1000), then dithered like the flower */
const D = {x0:452, x1:548, y0:225, y1:640};               // the door opening
function room(o, glow, T){
  // the dark room, dissolving into the paper at its edges
  // the room fills the whole page (page edges in design units)
  const u = 1000/box.s, R = {x0:-box.x*u - 30, x1:(W - box.x)*u + 30, y0:-box.y*u - 30, y1:(H - box.y)*u + 30};
  let rg;
  g.fillStyle = "rgba(0,0,0,.9)"; g.fillRect(R.x0, R.y0, R.x1 - R.x0, R.y1 - R.y0);
  const fade = (x0, y0, x1, y1) => { const lg = g.createLinearGradient(x0, y0, x1, y1); lg.addColorStop(0, "#fff"); lg.addColorStop(.12, "#fff"); lg.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = lg; g.fillRect(R.x0 - 20, R.y0 - 20, R.x1 - R.x0 + 40, R.y1 - R.y0 + 40); };
  // a faint vignette: the room is a touch lighter toward the far wall, darkest at the page corners
  rg = g.createRadialGradient(500, 430, 0, 500, 430, 900);
  rg.addColorStop(0, "rgba(255,255,255,.05)"); rg.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = rg; g.fillRect(R.x0, R.y0, R.x1 - R.x0, R.y1 - R.y0);

  // floor a shade lighter than the wall
  g.fillStyle = "rgba(255,255,255,.1)"; g.fillRect(R.x0, D.y1, R.x1 - R.x0, R.y1 - D.y1);
  // light leaking round the closed door, then the open gap
  const hingeX = D.x0, W0 = D.x1 - D.x0, th = o*1.35, panelW = W0*Math.cos(th);
  const gapL = hingeX + Math.max(0, panelW);
  // glow on the wall around the frame
  const open = clamp(o*1.4);
  g.save(); g.translate((D.x0 + D.x1)/2, (D.y0 + D.y1)/2); g.scale(1, 2.3);
  rg = g.createRadialGradient(0, 0, 0, 0, 0, 170);
  rg.addColorStop(0, `rgba(255,255,255,${(.25 + .6*open)*glow})`); rg.addColorStop(.4, `rgba(255,255,255,${(.08 + .32*open)*glow})`); rg.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = rg; g.beginPath(); g.arc(0, 0, 170, 0, 6.283); g.fill(); g.restore();
  // the lit opening
  g.fillStyle = "#fff"; g.fillRect(D.x0, D.y0, W0, D.y1 - D.y0);
  // the door panel, swinging inward on its left hinge (its far edge recedes)
  if (panelW > 1){
    const shrink = Math.sin(th)*16;
    g.fillStyle = shade(.9);
    g.beginPath(); g.moveTo(hingeX, D.y0); g.lineTo(hingeX + panelW, D.y0 + shrink); g.lineTo(hingeX + panelW, D.y1 - shrink*.6); g.lineTo(hingeX, D.y1); g.closePath(); g.fill();
    if (o < .02){                                          // closed: only the cracks glow
      g.fillStyle = "#fff"; g.fillRect(D.x0, D.y1 - 3, W0, 3); g.fillRect(D.x1 - 2.5, D.y0, 2.5, D.y1 - D.y0);
    }
  }
  // light on the floor: a pool in front of the door and a beam raking to the lower left
  const lit = clamp((D.x1 - gapL)/W0), I = lit*glow;
  if (I > .01){
    g.save();
    let lg = g.createLinearGradient(0, D.y1, 0, 1000);
    lg.addColorStop(0, `rgba(255,255,255,${.95*I})`); lg.addColorStop(.45, `rgba(255,255,255,${.5*I})`); lg.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = lg;
    g.beginPath(); g.moveTo(gapL, D.y1); g.lineTo(D.x1, D.y1); g.lineTo(D.x1 + 50, 990); g.lineTo(gapL - 80 - 120*lit, 990); g.closePath(); g.fill();
    // the beam: a fan of rays from the bottom of the gap toward the lower left
    const ox = gapL + 4, oy = D.y1;
    for (let k = 0; k < 11; k++){
      const a0 = 2.86 + k*.03, a1 = a0 + .012 + .018*Math.abs(Math.sin(k*1.7 + T*.4)), r = 760*lit;
      lg = g.createRadialGradient(ox, oy, 0, ox, oy, r);
      const al = Math.min(1, (.8 + .25*Math.sin(k*2.1 + T*.6))*I);
      lg.addColorStop(0, `rgba(255,255,255,${al})`); lg.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = lg; g.beginPath(); g.moveTo(ox, oy);
      g.lineTo(ox + Math.cos(a0)*r, oy + 18 + Math.sin(a0)*r*1.6); g.lineTo(ox + Math.cos(a1)*r, oy + 18 + Math.sin(a1)*r*1.6); g.closePath(); g.fill();
    }
    // dust drifting in the light
    g.fillStyle = `rgba(255,255,255,${.9*I})`;
    for (let k = 0; k < 22; k++){
      const u = ((k*.137 + T*.012*(1 + k % 3)) % 1), px = ox - u*360, py = D.y1 - 160*Math.abs(Math.sin(k*1.3)) + 30*u + Math.sin(T*.8 + k)*6;
      g.beginPath(); g.arc(px, py, 2.2 + (k % 3), 0, 6.283); g.fill();
    }
    g.restore();
  }
}

function draw(t){
  if (t0 === null) t0 = t;
  const T = t - t0;
  // stepped like a time-lapse: the scene advances in small frames, with a slight exposure flicker
  const step = Math.floor(T*12)/12, flick = 1 + .05*Math.sin(step*37.1)*Math.sin(step*11.3);
  const appear = smooth(0, 1.4, step), o = ease(smooth(1.8, 9.5, step)), glow = clamp((.35 + .65*smooth(1.2, 6, step))*flick, 0, 1.1);
  g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = "#fff"; g.fillRect(0, 0, gw, gh);
  const k = box.s/1000/cell;
  g.setTransform(k, 0, 0, k, box.x/cell, box.y/cell);
  room(o, glow, step);
  // dither the greys into ink
  const src = g.getImageData(0, 0, gw, gh).data, out = dimg.data;
  for (let y = 0; y < gh; y++){
    const row = BAYER[y & 7];
    for (let x = 0; x < gw; x++){
      const i = (y*gw + x)*4, d = (1 - src[i]/255)*appear;
      if (d > row[x & 7]){ out[i] = INKRGB[0]; out[i + 1] = INKRGB[1]; out[i + 2] = INKRGB[2]; out[i + 3] = 255; }
      else out[i + 3] = 0;
    }
  }
  dctx.putImageData(dimg, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(dcv, 0, 0, gw*cell*DPR, gh*cell*DPR);
}
let last = 0;
function frame(ms){
  requestAnimationFrame(frame);
  if (window.__scene !== "landing"){ t0 = null; return; }
  if (land.scrollTop > H*1.1) return;
  if (ms - last < 40) return; last = ms;
  draw(ms/1000);
}

/* ── card previews, drawn once from each poem's own figure ── */
function thumbs(){
  document.querySelectorAll(".thumb").forEach(c => {
    const w = c.clientWidth, h = c.clientHeight, d = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(w*d); c.height = Math.round(h*d);
    const g = c.getContext("2d"); g.setTransform(d, 0, 0, d, 0, 0);
    g.fillStyle = PAPER; g.fillRect(0, 0, w, h); g.fillStyle = INK; g.strokeStyle = INK;
    const fit = (bx, by, bw, bh, pad = .1) => { const s = Math.min(w*(1 - 2*pad)/bw, h*(1 - 2*pad)/bh); return {s, ox:(w - bw*s)/2 - bx*s, oy:(h - bh*s)/2 - by*s}; };
    const k = c.dataset.k;
    if (k === "yaadein"){
      const B = window.__BIRD, f = fit(21, 51, 713, 806);
      g.setTransform(d*f.s, 0, 0, d*f.s, d*f.ox, d*f.oy);
      for (const s of B.strokes) g.fill(new Path2D(s.d));
    } else if (k === "phool"){
      const F = window.__F4, b = F.bbox, f = fit(b[0], b[1], b[2], b[3], .06), T = F.trunk;
      g.setTransform(d*f.s, 0, 0, d*f.s, d*f.ox, d*f.oy);
      const bin = atob(T.data), step = 3;
      for (let j = 0; j < T.h; j += step) for (let i = 0; i < T.w; i += step){
        const v = bin.charCodeAt(j*T.w + i)/255; if (v < .08) continue;
        g.beginPath(); g.arc(T.x + (i + .5)*T.cell, T.y + (j + .5)*T.cell, T.cell*step*.55*Math.sqrt(v), 0, 6.283); g.fill();
      }
      for (const s of F.strokes) g.fill(new Path2D(s.d));
    } else if (k === "sansar"){
      const F = window.__TF, b = F.bbox, f = fit(b[0], b[1], b[2], b[3], .08), T = F.trunk;
      g.setTransform(d*f.s, 0, 0, d*f.s, d*f.ox, d*f.oy);
      const bin = atob(T.data), step = 2;
      for (let j = 0; j < T.h; j += step) for (let i = 0; i < T.w; i += step){
        const v = bin.charCodeAt(j*T.w + i)/255; if (v < .08) continue;
        g.beginPath(); g.arc(T.x + (i + .5)*T.cell, T.y + (j + .5)*T.cell, T.cell*step*.55*Math.sqrt(v), 0, 6.283); g.fill();
      }
      g.lineWidth = 1.1; g.lineCap = "round"; g.lineJoin = "round";
      for (const s of F.strokes) g.stroke(new Path2D(s.d));
    } else {
      // a small halftone kadam: round crown of dots and letters, an ink trunk
      const cx = w/2, cy = h*.4, rx = w*.36, ry = h*.25, s = 7;
      const letters = "कदमकापेड़रसीलेमीठाखट्टाचटनीटमाटरनींबू";
      g.font = `${s*1.5}px "Tiro Devanagari Hindi", serif`; g.textAlign = "center"; g.textBaseline = "middle";
      let n = 0;
      for (let y = cy - ry; y < cy + ry; y += s) for (let x = cx - rx; x < cx + rx; x += s){
        const q = ((x - cx)/rx)**2 + ((y - cy)/ry)**2 + .18*Math.sin(x*.21)*Math.sin(y*.17); if (q > 1) continue;
        const lit = clamp(.55 + .5*(-(y - cy)/ry*.7 - (x - cx)/rx*.3)), v = clamp(.25 + .65*lit*(1 - q*.4));
        if ((n++ % 11) === 0){ g.globalAlpha = .9; g.fillText([...letters][n % 30] || "क", x, y); }
        else { g.globalAlpha = .9; g.beginPath(); g.arc(x, y, s*.42*Math.sqrt(v), 0, 6.283); g.fill(); }
      }
      g.globalAlpha = 1;
      for (let y = cy + ry*.7; y < h*.86; y += 4) for (let x = cx - 22; x < cx + 22; x += 4){
        const tw = 9 + (y - cy)*.05, dx = x - cx - (h*.86 - y)*.06; if (Math.abs(dx) > tw) continue;
        const v = clamp(.35 + (dx/tw + 1)*.35); g.beginPath(); g.arc(x, y, 2.1*Math.sqrt(v), 0, 6.283); g.fill();
      }
      g.globalAlpha = .5; for (let x = cx - w*.3; x < cx + w*.3; x += 4){ const v = 1 - Math.abs(x - cx)/(w*.3); g.beginPath(); g.arc(x, h*.865, 1.6*v, 0, 6.283); g.fill(); }
      g.globalAlpha = 1;
    }
  });
}

let rt = null;
addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { layout(); thumbs(); }, 200); });
/* ── dither veil: as you scroll down, the opening screen dissolves into black, pixel by pixel ── */
const veil = document.getElementById("veil"), vctx = veil.getContext("2d");
const vcv = document.createElement("canvas"), vc = vcv.getContext("2d");
let vimg = null, VC = 4, vw = 0, vh = 0, lastP = -1;
function veilLayout(){
  const d = Math.min(2, window.devicePixelRatio || 1);
  veil.width = Math.round(veil.clientWidth*d); veil.height = Math.round(veil.clientHeight*d);
  VC = Math.max(3, Math.round(Math.min(innerWidth, innerHeight)/220));
  vw = Math.ceil(veil.clientWidth/VC); vh = Math.ceil(veil.clientHeight/VC);
  vcv.width = vw; vcv.height = vh; vimg = vc.createImageData(vw, vh); lastP = -1; drawVeil();
}
function drawVeil(){
  const p = clamp(land.scrollTop/Math.max(1, land.clientHeight));
  if (Math.abs(p - lastP) < .004) return; lastP = p;
  const o = vimg.data;
  for (let y = 0; y < vh; y++){
    const row = BAYER[y & 7], lead = (y/vh)*.55;                 // the bottom goes first
    for (let x = 0; x < vw; x++){
      const i = (y*vw + x)*4, cov = clamp(p*1.55 - .55 + lead);
      o[i] = o[i + 1] = o[i + 2] = 0; o[i + 3] = cov > row[x & 7] ? 255 : 0;
    }
  }
  vc.putImageData(vimg, 0, 0);
  vctx.setTransform(1, 0, 0, 1, 0, 0); vctx.clearRect(0, 0, veil.width, veil.height);
  vctx.imageSmoothingEnabled = false; vctx.drawImage(vcv, 0, 0, veil.width, veil.height);
}
land.addEventListener("scroll", () => requestAnimationFrame(drawVeil), {passive:true});
addEventListener("resize", () => setTimeout(veilLayout, 220));
window.__landingStart = () => { veilLayout(); layout(); thumbs(); requestAnimationFrame(frame); };
})();
