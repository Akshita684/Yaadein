/* ═════════ reading panel + router ═════════ */
(() => {
"use strict";
const $ = id => document.getElementById(id);
const root = $("reader"), box = root.querySelector(".swb-box"), text = $("rText");
const TITLES = {kadam:"कदम का पेड़", yaadein:"यादों के झरोखे से", sansar:"यह सुंदर संसार", phool:"मिट्टी में एक पौधा"};
const CANVAS = {kadam:"kadam", yaadein:"yaad", sansar:"sansar", phool:"phool"};
const DIM = .2, FONT = '"Tiro Devanagari Hindi",serif';
const clamp = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
const supportsView = !!(window.CSS && CSS.supports("animation-timeline: view()"));
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* the panel's own brightness rule, computed so the flying letters land at the same ink */
function inkAt(el, boxR){
  const r = el.getBoundingClientRect();
  const p = (boxR.bottom - r.top)/(boxR.height + r.height);            // view() "cover" progress
  const lit = reduce ? 1 : DIM + (1 - DIM)*clamp((p - .18)/.30);
  const rel = (r.top + r.height/2 - boxR.top)/boxR.height;              // the panel's soft top / bottom mask
  const m = rel < .14 ? rel/.14 : rel > .8 ? (1 - rel)/.2 : 1;
  return lit*clamp(m);
}

/* ── building the poem inside the panel ── */
let built = null, io = null;
function buildTyped(){
  text.className = "swb-text typed"; text.innerHTML = "";
  window.Kadam.POEM.forEach(line => {
    const ln = document.createElement("span"); ln.className = "ln";
    line.split(" ").forEach((w, k, arr) => {
      const s = document.createElement("span"); s.className = "swb-w"; s.textContent = w; ln.appendChild(s);
      if (k < arr.length - 1) ln.appendChild(document.createTextNode(" "));
    });
    text.appendChild(ln);
  });
}
function buildHand(Y){
  const P = Y.pages, pad = 3, keys = Object.keys(P).sort();
  text.className = "swb-text hand"; text.innerHTML = "";
  const bw = box.clientWidth;
  const pw = Math.max(...keys.map(k => P[k][2] - P[k][0]));
  const sc = Math.min(1.3, (bw - 12)/pw);
  const top = 110, gap = 70, off = {};
  let y = top;
  keys.forEach(k => { off[k] = [(bw - (P[k][2] - P[k][0])*sc)/2, y]; y += (P[k][3] - P[k][1])*sc + gap; });
  text.style.height = (y - gap + 240) + "px";
  const NS = "http://www.w3.org/2000/svg";
  for (const u of Y.units){
    const b = P[u.p], o = off[u.p];
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "swb-w"); svg.dataset.i = u.i;
    svg.setAttribute("viewBox", `${u.x - pad} ${u.y - pad} ${u.w + pad*2} ${u.h + pad*2}`);
    svg.setAttribute("width", ((u.w + pad*2)*sc).toFixed(2)); svg.setAttribute("height", ((u.h + pad*2)*sc).toFixed(2));
    svg.style.left = (o[0] + (u.x - pad - b[0])*sc).toFixed(2) + "px"; svg.style.top = (o[1] + (u.y - pad - b[1])*sc).toFixed(2) + "px";
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", u.d); path.setAttribute("fill", "currentColor"); path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", ".6"); path.setAttribute("vector-effect", "non-scaling-stroke");
    svg.appendChild(path); text.appendChild(svg);
  }
  text.dataset.sc = sc;
  text.setAttribute("aria-label", Y.alt || "The handwritten poem");
}
function build(id){
  $("rTitle").textContent = TITLES[id];
  if (id === "kadam") buildTyped(); else buildHand(window.SCENES[id]);
  built = id;
  if (io){ io.disconnect(); io = null; }
  if (!supportsView && !reduce){
    box.setAttribute("data-fallback", "");
    io = new IntersectionObserver(es => es.forEach(e => {
      const above = e.rootBounds && e.boundingClientRect.top < e.rootBounds.top;
      e.target.classList.toggle("swb-lit", e.isIntersecting || above);
    }), {root:box, rootMargin:"0px 0px -45% 0px"});
    text.querySelectorAll(".swb-w").forEach(w => io.observe(w));
  }
}

/* ── where everything sits, so the canvas can fly letters exactly onto it ── */
let asc = .8;
function fontMetrics(){
  const c = document.createElement("canvas").getContext("2d"); c.font = `100px ${FONT}`;
  const m = c.measureText("कदम"); if (m.fontBoundingBoxAscent) asc = m.fontBoundingBoxAscent/(m.fontBoundingBoxAscent + m.fontBoundingBoxDescent);
}
function measure(id){
  const boxR = box.getBoundingClientRect(), out = [];
  if (id === "kadam"){
    const size = parseFloat(getComputedStyle(text).fontSize), seg = window.Kadam.graphemes;
    text.querySelectorAll(".swb-w").forEach(span => {
      const node = span.firstChild, a = inkAt(span, boxR), rg = document.createRange();
      seg(node.textContent).forEach(o => {
        if (!o.g.trim()) return;
        rg.setStart(node, o.i); rg.setEnd(node, o.i + o.g.length);
        const r = rg.getBoundingClientRect(), base = r.top + r.height*asc;
        out.push({cx:r.left + r.width/2, cy:base - size*.32, size, a});
      });
    });
  } else {
    const sc = parseFloat(text.dataset.sc);
    text.querySelectorAll("svg.swb-w").forEach(svg => {
      const r = svg.getBoundingClientRect();
      out[+svg.dataset.i] = {x:r.left + r.width/2, y:r.top + r.height/2, r:0, s:sc, a:inkAt(svg, boxR)};
    });
  }
  return out;
}

/* ── the slow demo scroll (stops for good once the reader touches it) ── */
const AUTO_PX_PER_SEC = 22;
let frame = 0, last = 0, pos = 0, stopped = false;
function step(t){
  const dt = last ? Math.min(t - last, 50) : 0; last = t;
  pos += AUTO_PX_PER_SEC*dt/1000;
  if (pos >= box.scrollHeight - box.clientHeight) pos = 0;
  box.scrollTop = pos; frame = requestAnimationFrame(step);
}
function startDemo(){ if (!stopped && !frame && !reduce){ last = 0; pos = box.scrollTop; frame = requestAnimationFrame(step); } }
function stopDemo(){ cancelAnimationFrame(frame); frame = 0; }
["wheel", "touchstart", "pointerdown", "keydown"].forEach(ev => box.addEventListener(ev, () => { stopped = true; stopDemo(); }, {passive:true}));

let demoTimer = 0;
window.Reader = {
  prepare(id){
    stopDemo(); clearTimeout(demoTimer);
    root.classList.remove("shown", "quick"); root.classList.add("measure");
    build(id); box.scrollTop = 0;
    return measure(id);
  },
  measure(id){ return measure(id); },
  reveal(){
    root.classList.add("shown"); document.body.classList.add("reading");
    stopped = false; demoTimer = setTimeout(startDemo, 1400);
  },
  hide(instant){
    stopDemo(); clearTimeout(demoTimer);
    root.classList.toggle("quick", !instant);
    if (instant) root.style.transition = "none";
    root.classList.remove("shown"); document.body.classList.remove("reading");
    setTimeout(() => { if (!root.classList.contains("shown")) root.classList.remove("measure"); root.style.transition = ""; }, instant ? 0 : 300);
  }
};
const backToPicture = () => { if (!root.classList.contains("shown")) return;
  if (window.__scene === "kadam") window.Kadam.back(); else if (window.SCENES[window.__scene]) window.SCENES[window.__scene].back(); };
box.addEventListener("click", backToPicture);
box.addEventListener("keydown", e => { if (e.key === "Enter"){ e.preventDefault(); backToPicture(); } });

/* ── router: landing → picture → (click) reading panel ── */
function route(){
  const h = location.hash.slice(1), scene = TITLES[h] ? h : "landing";
  window.__scene = scene;
  $("landing").classList.toggle("off", scene !== "landing");
  Object.entries(CANVAS).forEach(([k, id]) => $(id).classList.toggle("off", scene !== k));
  $("bar").classList.toggle("off", scene === "landing");
  $("home").classList.toggle("off", scene === "landing");
  $("title").textContent = TITLES[scene] || "";
  window.Reader.hide(true);
  if (scene === "kadam") window.Kadam.enter();
  else if (window.SCENES[scene]) window.SCENES[scene].enter();
  if (scene !== "landing") $(CANVAS[scene]).focus({preventScroll:true});
  if (scene === "landing"){ const L = $("landing"); L.style.scrollBehavior = "auto";
    L.scrollTop = h === "kavitayen" ? $("poems").offsetTop : 0; L.style.scrollBehavior = ""; }
}
window.__boot = () => {
  const fonts = document.fonts && document.fonts.load
    ? Promise.race([Promise.all([document.fonts.load(`24px "Tiro Devanagari Hindi"`, "कदम का पेड़"), document.fonts.load(`80px "Pinyon Script"`, "Yaadein")]), new Promise(r => setTimeout(r, 2500))]) : Promise.resolve();
  fonts.catch(() => {}).then(() => { fontMetrics(); window.Kadam.start(); if (window.__landingStart) window.__landingStart(); addEventListener("hashchange", route); route(); });
};
})();
