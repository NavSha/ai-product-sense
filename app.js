/* Render content from data.js and wire up interactions. */

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};

/* ---------- Scroll progress bar ---------- */
const progress = $("#progress");
const onScroll = () => {
  const h = document.documentElement;
  const pct = (h.scrollTop / (h.scrollHeight - h.clientHeight)) * 100;
  progress.style.width = pct + "%";
};
document.addEventListener("scroll", onScroll, { passive: true });
onScroll();

/* ---------- Right-side "On this page" TOC ---------- */
const toc = $("#toc");
toc.appendChild(el("p", "toc__head", "On this page"));
const tocSections = [...document.querySelectorAll("section[data-nav]")];
const tocLinks = tocSections.map((s) => {
  const a = el("a", "toc__link", s.dataset.nav);
  a.href = "#" + s.id;
  a.dataset.target = s.id;
  toc.appendChild(a);
  return a;
});
const tocSpy = new IntersectionObserver(
  (entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        tocLinks.forEach((a) => a.classList.toggle("active", a.dataset.target === e.target.id));
      }
    });
  },
  { rootMargin: "-45% 0px -50% 0px" }
);
tocSections.forEach((s) => tocSpy.observe(s));

/* tuck the TOC away while the full-bleed builder fills the screen */
const builderSec = document.getElementById("builder");
if (builderSec) {
  new IntersectionObserver((entries) => {
    entries.forEach((e) => toc.classList.toggle("tuck", e.isIntersecting));
  }).observe(builderSec);
}

/* ---------- Inject lens palette as CSS vars + active-section highlight ---------- */
const styleVars = LENSES.map((l) => `--lens-${l.n}: ${l.color};`).join("");
document.documentElement.style.cssText += styleVars;

/* ---------- The 7 lenses ---------- */
const lensgrid = $("#lensgrid");
LENSES.forEach((l) => {
  const c = el("article", "lenscard");
  c.innerHTML = `
    <div class="lenscard__top">
      <span class="lensnum">${l.n}</span>
      <span class="lensname">${l.name}</span>
    </div>
    <p class="lensask">${l.ask}</p>
    <p class="lensdetail">${l.detail}</p>`;
  lensgrid.appendChild(c);
});

/* ---------- copy-to-clipboard helper ---------- */
function copyText(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const prev = btn.textContent;
    btn.textContent = "Copied ✓";
    btn.classList.add("copied");
    setTimeout(() => { btn.textContent = prev; btn.classList.remove("copied"); }, 1400);
  });
}

/* ---------- Phrases — a quotable cheat-sheet ---------- */
const phrasesList = $("#phrases-list");
PHRASES.forEach((p) => phrasesList.appendChild(el("blockquote", "phrase", "“" + p + "”")));

/* ---------- THE CENTERPIECE — Answer Builder ---------- */
(function buildAnswerBuilder() {
  const lensMeta = (n) => LENSES.find((l) => l.n === n);
  const shuffle = (a) => { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };

  const scenpick = $("#scenpick");
  const promptEl = $("#builder-prompt");
  const coverage = $("#coverage");
  const cmeta = $("#cmeta");
  const stepHost = $("#stepHost");
  const assembled = $("#assembled");
  const bend = $("#bend");
  const bgrid = $("#bgrid");

  let STEPS = [], idx = 0, score = 0, results = [], current = 0;

  if (SCENARIOS.length > 1) {
    SCENARIOS.forEach((sc, i) => {
      const b = el("button", "scenbtn", sc.label);
      b.addEventListener("click", () => load(i));
      scenpick.appendChild(b);
    });
  }

  function load(i) {
    current = i;
    [...scenpick.children].forEach((b, j) => b.classList.toggle("on", j === i));
    const sc = SCENARIOS[i];
    STEPS = sc.steps; idx = 0; score = 0; results = [];
    promptEl.innerHTML = `Interview prompt: <b>“${sc.prompt}”</b> Walk the 7 lenses and pick the move a strong candidate makes — your answer assembles as you go.`;
    coverage.innerHTML = "";
    STEPS.forEach((s) => { const d = el("div", "cdot"); d.style.setProperty("--ac", lensMeta(s.lens).color); coverage.appendChild(d); });
    cmeta.textContent = "0 of 7 lenses · choose to begin";
    assembled.innerHTML = '<span class="empty">Your answer will build here, one lens at a time…</span>';
    bend.className = "bend"; bend.innerHTML = "";
    bgrid.style.display = "";
    renderStep();
  }

  function renderStep() {
    const s = STEPS[idx];
    const m = lensMeta(s.lens);
    stepHost.innerHTML = "";
    const card = el("div", "bstep");
    card.style.setProperty("--ac", m.color);
    card.innerHTML = `
      <div class="bstep__lens">
        <span class="blensnum">${s.lens}</span>
        <span class="blensname">Lens ${s.lens} · ${m.name}</span>
        <span class="bstepcount">${idx + 1} / ${STEPS.length}</span>
      </div>
      <p class="bq">${s.q}</p>
      <div class="bchoices"></div>
      <div class="bfb"></div>
      <button class="bnext">Next lens →</button>`;
    const choicesEl = $(".bchoices", card), fbEl = $(".bfb", card), nextEl = $(".bnext", card);
    const cdots = [...coverage.children];

    shuffle(s.choices).forEach((c) => {
      const b = el("button", "bchoice", c.t);
      b._strong = c.strong;
      b.addEventListener("click", () => {
        if (choicesEl.dataset.locked) return;
        choicesEl.dataset.locked = "1";
        [...choicesEl.children].forEach((btn) => {
          btn.disabled = true;
          if (btn._strong) { btn.classList.add("correct"); btn.insertAdjacentHTML("beforeend", '<span class="bmark">✓</span>'); }
          if (btn === b && !c.strong) { btn.classList.add("wrong"); btn.insertAdjacentHTML("beforeend", '<span class="bmark">✗</span>'); }
          if (btn === b) btn.classList.add("picked");
        });
        if (c.strong) score++;
        results.push({ lens: s.lens, name: m.name, color: m.color, hit: c.strong });
        fbEl.className = "bfb show " + (c.strong ? "good" : "miss");
        fbEl.innerHTML = `<b>${c.strong ? "Strong move" : "A stronger candidate would say"}</b>${c.fb}`;
        addSentence(s, m);
        cdots[idx].classList.add("on");
        cmeta.textContent = `${idx + 1} of 7 lenses · ${score} strong so far`;
        nextEl.classList.add("show");
      });
      choicesEl.appendChild(b);
    });

    nextEl.addEventListener("click", () => { idx++; idx < STEPS.length ? renderStep() : showEnd(); });
    stepHost.appendChild(card);
  }

  function addSentence(s, m) {
    if (assembled.querySelector(".empty")) assembled.innerHTML = "";
    const p = el("div", "bsent");
    p.style.setProperty("--ac", m.color);
    p.textContent = s.answer;
    assembled.appendChild(p);
  }

  function showEnd() {
    bgrid.style.display = "none";
    let recap = "";
    results.forEach((r) => {
      recap += `<div class="brecap__row"><span class="brecap__chip" style="--ac:${r.color}">${r.lens}</span><span>${r.name}</span><span class="brecap__res ${r.hit ? "hit" : "missed"}">${r.hit ? "✓ strong" : "✗ missed"}</span></div>`;
    });
    let finals = "";
    STEPS.forEach((s) => { finals += `<p style="--ac:${lensMeta(s.lens).color}">${s.answer}</p>`; });
    const verdict = score === 7 ? "A complete, AI-native answer. You hit every lens."
      : score >= 5 ? "A strong answer. Tighten the lenses you missed and you're interview-ready."
      : "Good start. Re-run it and watch the lenses you missed — that's where the signal is.";
    bend.innerHTML = `
      <p class="eyebrow">Your scorecard</p>
      <div class="bscore">${score}<span> / 7 strong</span></div>
      <p class="bscoreline">${verdict}</p>
      <div class="brecap">${recap}</div>
      <div class="bfinal"><h3>The answer you built</h3>${finals}</div>
      <div class="bend__actions">
        <button class="brestart copyans">⧉ Copy the answer</button>
        <button class="brestart again">↺ Build it again</button>
      </div>`;
    bend.classList.add("show");
    const fullText = STEPS.map((s) => s.answer).join(" ");
    $(".copyans", bend).addEventListener("click", (e) => copyText(fullText, e.currentTarget));
    $(".again", bend).addEventListener("click", () => {
      load(current);
      document.getElementById("builder").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    bend.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  load(0);
})();

/* ---------- §7 practice levels ---------- */
const levels = $("#levels");
LEVELS.forEach((lvl) => {
  const block = el("div", "level");
  block.appendChild(el("h3", "level__title", lvl.title));
  const ol = el("ol", "level__qs");
  lvl.qs.forEach((q) => ol.appendChild(el("li", null, q)));
  block.appendChild(ol);
  levels.appendChild(block);
});

/* ---------- Auto-number section kickers in document order ---------- */
document.querySelectorAll(".kicker:not(.kicker--plain)").forEach((k, i) => {
  const label = k.textContent.replace(/^\s*\d+\s*—\s*/, "");
  k.textContent = String(i + 1).padStart(2, "0") + " — " + label;
});
