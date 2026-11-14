/* Base Set 2 tracker — sin dependencias. Todo se guarda en localStorage. */
(() => {
  "use strict";

  const STORE_KEY = "bs2-tracker-v1";
  const BACKUP_KEY = STORE_KEY + "-backup";
  const LONG_PRESS_MS = 450;
  const APP_CACHE = "bs2-app-v2";
  const IMG_CACHE = "bs2-img-v1";
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  // ---------- Catálogos ----------
  const CATEGORIES = [
    { key: "holo", label: "Holo" },
    { key: "rare", label: "Rara" },
    { key: "uncommon", label: "Infrecuente" },
    { key: "common", label: "Común" },
    { key: "trainer", label: "Entrenador" },
    { key: "energy", label: "Energía" },
  ];
  const CAT_ORDER = { holo: 0, rare: 1, uncommon: 2, common: 3, trainer: 4, energy: 5 };
  const RARITY_ES = { "Rare Holo": "Holo rara", Rare: "Rara", Uncommon: "Infrecuente", Common: "Común" };
  const TYPES = [
    { key: "Fire", label: "Fuego", color: "#e8553e" },
    { key: "Water", label: "Agua", color: "#3d8fe0" },
    { key: "Grass", label: "Planta", color: "#46a35a" },
    { key: "Lightning", label: "Eléctrico", color: "#e2b31b" },
    { key: "Psychic", label: "Psíquico", color: "#9a5bc9" },
    { key: "Fighting", label: "Lucha", color: "#b8693a" },
    { key: "Colorless", label: "Incoloro", color: "#9a9a9a" },
    { key: "none", label: "Sin tipo", color: "#666" },
  ];
  const TYPE_ES = Object.fromEntries(TYPES.map((t) => [t.key, t.label]));
  const PRICE_RANGES = [
    { key: "any", label: "Cualquiera", min: -Infinity, max: Infinity },
    { key: "lt1", label: "< 1 €", min: -Infinity, max: 1 },
    { key: "1-5", label: "1–5 €", min: 1, max: 5 },
    { key: "5-20", label: "5–20 €", min: 5, max: 20 },
    { key: "20-100", label: "20–100 €", min: 20, max: 100 },
    { key: "gt100", label: "> 100 €", min: 100, max: Infinity },
  ];
  const EXTRAS = [
    { key: "dupes", label: "Repetidas" },
    { key: "paid", label: "Con precio de compra" },
    { key: "unpaid", label: "Sin precio de compra" },
  ];
  const DENSITIES = [
    { key: "l", label: "Grandes" },
    { key: "m", label: "Normales" },
    { key: "s", label: "Pequeñas" },
  ];
  const SORTS = [
    { key: "num", label: "Número (1 → 130)", short: "Nº ↑" },
    { key: "numDesc", label: "Número (130 → 1)", short: "Nº ↓" },
    { key: "priceDesc", label: "Precio: más caras primero", short: "Precio ↓" },
    { key: "priceAsc", label: "Precio: más baratas primero", short: "Precio ↑" },
    { key: "name", label: "Nombre (A → Z)", short: "A–Z" },
    { key: "nameDesc", label: "Nombre (Z → A)", short: "Z–A" },
    { key: "rarity", label: "Rareza (holos primero)", short: "Rareza" },
    { key: "type", label: "Tipo", short: "Tipo" },
    { key: "wish", label: "Prioridad de objetivos (★)", short: "Prioridad" },
    { key: "recent", label: "Marcadas recientemente", short: "Recientes" },
    { key: "paidDesc", label: "Lo que más me costó", short: "Pagado ↓" },
    { key: "trendUp", label: "Suben de precio (7 días vs 30)", short: "Suben" },
    { key: "trendDown", label: "Bajan de precio (7 días vs 30)", short: "Bajan" },
  ];
  const CONDITIONS = ["MT", "NM", "EX", "GD", "LP", "PL", "PO"];
  const PRIORITIES = [
    { key: 1, label: "Alta" },
    { key: 2, label: "Media" },
    { key: 3, label: "Baja" },
  ];

  const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
  const fmt = (v) => (v == null || isNaN(v) ? "–" : eur.format(v));
  const pct = (v) => `${v > 0 ? "+" : ""}${Math.round(v * 100)} %`;
  const num = (v) => {
    if (v == null || v === "") return null;
    const n = parseFloat(String(v).replace(/\s|€/g, "").replace(",", "."));
    return isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
  };
  const today = () => new Date().toISOString().slice(0, 10);

  // ---------- Estado ----------
  const DEFAULT_SETTINGS = {
    cond: "nm", filter: "all", sort: "num", cats: [], types: [], price: "any", extras: [],
    density: "m", grayscale: true, fair: false, fairPrev: null, offlineAt: null, query: "",
  };
  const state = {
    cards: [],
    byId: new Map(),
    prices: { cards: {} },
    owned: {},  // id -> timestamp en que se marcó
    meta: {},   // id -> { qty, paid, cond, date }
    wish: {},   // id -> { max, prio }
    lot: [],    // [{ id, asked }]
    settings: { ...DEFAULT_SETTINGS },
  };
  const S = () => state.settings;

  // ---------- Guardado ----------
  let storageOk = true;
  function readKey(k) {
    try { const v = JSON.parse(localStorage.getItem(k) || "null"); return v && typeof v === "object" ? v : null; }
    catch { return null; }
  }
  function applySaved(saved) {
    state.owned = saved.owned || {};
    state.meta = saved.meta || {};
    state.wish = saved.wish || {};
    state.lot = Array.isArray(saved.lot) ? saved.lot : [];
    state.settings = { ...DEFAULT_SETTINGS, ...(saved.settings || {}), query: "" };
    const s = state.settings;
    if (!SORTS.some((x) => x.key === s.sort)) s.sort = "num";
    for (const k of ["cats", "types", "extras"]) if (!Array.isArray(s[k])) s[k] = [];
  }
  function load() { applySaved(readKey(STORE_KEY) || readKey(BACKUP_KEY) || {}); }
  function snapshot() {
    const { query, ...settings } = state.settings;
    return { owned: state.owned, meta: state.meta, wish: state.wish, lot: state.lot, settings, savedAt: Date.now() };
  }
  function save() {
    const data = JSON.stringify(snapshot());
    try {
      localStorage.setItem(STORE_KEY, data);
      localStorage.setItem(BACKUP_KEY, data);
      storageOk = true;
    } catch {
      if (storageOk) showToast("⚠️ No se pudo guardar en este navegador (¿modo privado?). Exporta una copia.");
      storageOk = false;
    }
    renderSaveState();
  }
  function renderSaveState() {
    const el = $("#saveState");
    if (!el) return;
    el.textContent = storageOk
      ? `✓ Colección guardada en este dispositivo (${Object.keys(state.owned).length} cartas)`
      : "⚠️ Este navegador no permite guardar: exporta una copia desde el menú ⋯";
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  window.addEventListener("pagehide", () => save());
  window.addEventListener("storage", (e) => {
    if (e.key !== STORE_KEY || !e.newValue) return;
    try { const q = S().query; applySaved(JSON.parse(e.newValue)); S().query = q; render(); } catch { /* ignorar */ }
  });

  // ---------- Utilidades de cartas ----------
  const card = (id) => state.byId.get(id);
  const category = (c) =>
    c.supertype === "Trainer" ? "trainer"
    : c.supertype === "Energy" ? "energy"
    : c.rarity === "Rare Holo" ? "holo"
    : c.rarity === "Rare" ? "rare"
    : c.rarity === "Uncommon" ? "uncommon" : "common";
  const typeOf = (c) => (c.types && c.types[0]) || "none";
  const qtyOf = (id) => (state.owned[id] ? Math.max(1, (state.meta[id] || {}).qty || 1) : 0);
  function trendDelta(c) {
    const g = (state.prices.cards[c.id] || {}).guide || {};
    return g.avg7 != null && g.avg30 ? (g.avg7 - g.avg30) / g.avg30 : null;
  }

  // Precio de referencia para la condición. Prioridad: NM/EX real -> guía oficial -> respaldo.
  function priceOf(c, cond = S().cond) {
    const p = state.prices.cards[c.id];
    if (!p) return null;
    const cm = p.cm || {};
    const exact = cm[cond] && cm[cond].from;
    if (exact != null) return { value: exact, approx: false };
    if (cond === "ex" && cm.exPlusFrom != null) return { value: cm.exPlusFrom, approx: true };
    const api = p.api || {};
    const g = p.guide || {};
    const t = g.trend ?? cm.trend ?? api.trend ?? g.avg30 ?? api.avg30;
    return t != null ? { value: t, approx: true } : null;
  }
  // Veredicto de un precio pedido frente a la referencia
  function verdict(c, asked) {
    const ref = priceOf(c);
    const w = state.wish[c.id];
    if (asked == null || !ref) return null;
    const d = (asked - ref.value) / ref.value;
    const level = d <= -0.1 ? "good" : d <= 0.1 ? "fair" : "bad";
    const text = level === "good" ? "Buen precio" : level === "fair" ? "Precio justo" : "Caro";
    const underMax = w && w.max != null ? asked <= w.max : null;
    return { d, level, text, ref, underMax, max: w && w.max };
  }

  function cardmarketUrl(c, cond = S().cond) {
    const base = (state.prices.cards[c.id] || {}).url;
    if (!base) return `https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=${encodeURIComponent(c.name + " Base Set 2")}`;
    const u = new URL(base);
    u.searchParams.set("language", state.prices.language || 1);
    u.searchParams.set("minCondition", cond === "nm" ? 2 : 3);
    return u.toString();
  }

  // ---------- Rejilla ----------
  const grid = $("#grid");
  const tiles = new Map();

  function buildGrid() {
    const frag = document.createDocumentFragment();
    for (const c of state.cards) {
      const li = document.createElement("li");
      li.dataset.id = c.id;
      li.innerHTML = `
        <div class="card" role="button" tabindex="0" aria-pressed="false" aria-label="${c.number}. ${escapeHtml(c.name)}">
          <div class="art">
            <img src="${c.img}" alt="" loading="lazy" decoding="async" width="245" height="342">
            <span class="check" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg></span>
            <span class="flags"></span>
            <button type="button" class="info" aria-label="Detalles de ${escapeHtml(c.name)}"><span>i</span></button>
            <button type="button" class="cm" aria-label="Ver ${escapeHtml(c.name)} en Cardmarket">CM</button>
          </div>
          <div class="meta"><span class="num">${c.number}/130</span><span class="price"></span></div>
          <div class="name">${escapeHtml(c.name)}</div>
        </div>`;
      tiles.set(c.id, li);
      frag.appendChild(li);
    }
    grid.appendChild(frag);
  }

  function paintTile(c) {
    const li = tiles.get(c.id);
    const el = li.firstElementChild;
    const owned = !!state.owned[c.id];
    el.classList.toggle("owned", owned);
    el.setAttribute("aria-pressed", owned);
    const q = qtyOf(c.id), w = state.wish[c.id];
    $(".flags", li).innerHTML =
      (w ? `<span class="flag star" title="Objetivo">★${w.max != null ? " ≤" + Math.round(w.max) + "€" : ""}</span>` : "") +
      (q > 1 ? `<span class="flag qty" title="Copias">×${q}</span>` : "");
    const pe = $(".price", li);
    const p = priceOf(c);
    pe.textContent = p ? (p.approx ? "~" : "") + fmt(p.value) : "";
    pe.classList.toggle("approx", !!(p && p.approx));
  }

  // ---------- Filtros y orden ----------
  function activeFilterCount() {
    const s = S();
    return s.cats.length + s.types.length + s.extras.length + (s.price !== "any" ? 1 : 0);
  }
  function filterCards() {
    const { filter, cats, types, price, extras, query } = S();
    const q = query.trim().toLowerCase().replace(/^#/, "");
    const range = PRICE_RANGES.find((r) => r.key === price) || PRICE_RANGES[0];
    return state.cards.filter((c) => {
      const owned = !!state.owned[c.id];
      if (filter === "owned" && !owned) return false;
      if (filter === "missing" && owned) return false;
      if (filter === "wish" && !state.wish[c.id]) return false;
      if (cats.length && !cats.includes(category(c))) return false;
      if (types.length && !types.includes(typeOf(c))) return false;
      if (range.key !== "any") {
        const v = (priceOf(c) || {}).value;
        if (v == null || v < range.min || v >= range.max) return false;
      }
      if (extras.includes("dupes") && qtyOf(c.id) < 2) return false;
      if (extras.includes("paid") && (state.meta[c.id] || {}).paid == null) return false;
      if (extras.includes("unpaid") && (!owned || (state.meta[c.id] || {}).paid != null)) return false;
      if (q && !(c.name.toLowerCase().includes(q) || String(c.number) === q)) return false;
      return true;
    });
  }
  function visibleCards() {
    const list = filterCards();
    const pv = (c) => (priceOf(c) || {}).value;
    const prio = (c) => (state.wish[c.id] ? state.wish[c.id].prio || 2 : 9);
    const by = {
      num: (a, b) => a.number - b.number,
      numDesc: (a, b) => b.number - a.number,
      priceDesc: (a, b) => (pv(b) ?? -1) - (pv(a) ?? -1),
      priceAsc: (a, b) => (pv(a) ?? 1e9) - (pv(b) ?? 1e9),
      name: (a, b) => a.name.localeCompare(b.name, "es"),
      nameDesc: (a, b) => b.name.localeCompare(a.name, "es"),
      rarity: (a, b) => CAT_ORDER[category(a)] - CAT_ORDER[category(b)] || (pv(b) ?? 0) - (pv(a) ?? 0),
      type: (a, b) => (TYPE_ES[typeOf(a)] || "").localeCompare(TYPE_ES[typeOf(b)] || "", "es") || a.number - b.number,
      wish: (a, b) => prio(a) - prio(b) || (pv(b) ?? 0) - (pv(a) ?? 0),
      recent: (a, b) => (state.owned[b.id] || 0) - (state.owned[a.id] || 0) || a.number - b.number,
      paidDesc: (a, b) => ((state.meta[b.id] || {}).paid ?? -1) - ((state.meta[a.id] || {}).paid ?? -1),
      trendUp: (a, b) => (trendDelta(b) ?? -9) - (trendDelta(a) ?? -9),
      trendDown: (a, b) => (trendDelta(a) ?? 9) - (trendDelta(b) ?? 9),
    };
    // En la pestaña «Busco», el orden por defecto es la prioridad
    const key = S().filter === "wish" && S().sort === "num" ? "wish" : S().sort;
    return list.sort(by[key] || by.num);
  }
  function clearFilters() {
    const s = S();
    s.cats = []; s.types = []; s.extras = []; s.price = "any"; s.query = "";
    $("#search").value = "";
  }

  // ---------- Render ----------
  function render() {
    const list = visibleCards();
    const frag = document.createDocumentFragment();
    const shown = new Set(list.map((c) => c.id));
    for (const c of list) frag.appendChild(tiles.get(c.id));
    for (const [id, li] of tiles) li.hidden = !shown.has(id);
    grid.prepend(frag);
    for (const c of state.cards) paintTile(c);
    $("#empty").hidden = list.length > 0;
    $("#emptyText").textContent = S().filter === "wish" && !Object.keys(state.wish).length
      ? "Aún no tienes objetivos. Abre una carta y pulsa «☆ La busco»."
      : "No hay cartas con estos filtros.";
    grid.dataset.density = S().density;
    document.body.classList.toggle("grayscale", S().grayscale);
    document.body.classList.toggle("fair-mode", S().fair);
    renderResultBar(list);
    renderControls();
    renderStats();
  }

  function renderStats() {
    const total = state.cards.length;
    const n = state.cards.filter((c) => state.owned[c.id]).length;
    const copies = state.cards.reduce((a, c) => a + qtyOf(c.id), 0);
    $("#progressText").textContent = `${n}/${total} · ${Math.round((n / total) * 100)}%` + (copies > n ? ` · +${copies - n} rep.` : "");
    $("#progressBar").style.width = `${(n / total) * 100}%`;
    let have = 0, miss = 0;
    for (const c of state.cards) {
      const p = priceOf(c);
      if (!p) continue;
      if (state.owned[c.id]) have += p.value; else miss += p.value;
    }
    $("#ownedValue").textContent = fmt(have);
    $("#missingValue").textContent = fmt(miss);
    const spent = totals().spent;
    $("#spentBox").hidden = !spent;
    $("#spentValue").textContent = fmt(spent);
    $("#countAll").textContent = total;
    $("#countOwned").textContent = n;
    $("#countMissing").textContent = total - n;
    $("#countWish").textContent = Object.keys(state.wish).length || "";
  }

  function renderControls() {
    const s = S();
    $$(".cond-toggle button").forEach((b) => b.setAttribute("aria-checked", b.dataset.cond === s.cond));
    $$(".segmented button").forEach((b) => b.setAttribute("aria-selected", b.dataset.filter === s.filter));
    $("#grayState").textContent = s.grayscale ? "Activado" : "Desactivado";
    const n = activeFilterCount();
    $("#filtersCount").hidden = !n; $("#filtersCount").textContent = n;
    $("#filtersBtn").classList.toggle("on", n > 0);
    $("#sortBtn").classList.toggle("on", s.sort !== "num");
    $("#clearSearch").hidden = !s.query;
    $("#lotCount").hidden = !state.lot.length; $("#lotCount").textContent = state.lot.length;
    $("#fairBtn").setAttribute("aria-pressed", s.fair);
    $("#offlineState").textContent = s.offlineAt
      ? `✓ Listo desde el ${new Date(s.offlineAt).toLocaleDateString("es-ES")} · toca para actualizar`
      : "Descarga las 130 imágenes y los precios";
  }

  function renderResultBar(list) {
    const s = S();
    const sum = list.reduce((acc, c) => acc + ((priceOf(c) || {}).value || 0), 0);
    $("#resultCount").textContent = `${list.length === state.cards.length ? "Todas las" : list.length} ${list.length === 1 ? "carta" : "cartas"}` + (list.length ? ` · ${fmt(sum)}` : "");
    const sortKey = s.filter === "wish" && s.sort === "num" ? "wish" : s.sort;
    $("#sortLabel").textContent = `Orden: ${(SORTS.find((x) => x.key === sortKey) || SORTS[0]).short}`;
    const chips = [];
    if (s.query) chips.push({ label: `“${s.query}”`, clear: () => { s.query = ""; $("#search").value = ""; } });
    s.cats.forEach((k) => chips.push({ label: CATEGORIES.find((c) => c.key === k).label, clear: () => s.cats.splice(s.cats.indexOf(k), 1) }));
    s.types.forEach((k) => chips.push({ label: TYPE_ES[k], clear: () => s.types.splice(s.types.indexOf(k), 1) }));
    s.extras.forEach((k) => chips.push({ label: EXTRAS.find((e) => e.key === k).label, clear: () => s.extras.splice(s.extras.indexOf(k), 1) }));
    if (s.price !== "any") chips.push({ label: PRICE_RANGES.find((r) => r.key === s.price).label, clear: () => { s.price = "any"; } });
    const box = $("#activeFilters");
    box.hidden = !chips.length;
    box.innerHTML = chips.map((c, i) => `<button type="button" class="chip on" data-i="${i}">${escapeHtml(c.label)} <span aria-hidden="true">×</span></button>`).join("") +
      (chips.length > 1 ? `<button type="button" class="chip ghost" data-i="all">Quitar todo</button>` : "");
    box.onclick = (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.i === "all") clearFilters(); else chips[+b.dataset.i].clear();
      save(); render();
    };
  }

  function fmtDate(iso) {
    const d = new Date(String(iso).replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
    return isNaN(d) ? String(iso).slice(0, 10) : d.toLocaleDateString("es-ES");
  }
  function renderPricesInfo() {
    const p = state.prices;
    const parts = [];
    if (p.guideCreatedAt) parts.push(`Guía oficial de precios de Cardmarket del ${fmtDate(p.guideCreatedAt)} (se actualiza a diario).`);
    if (p.updatedAt) parts.push(`Precios NM/EX (inglés) del ${fmtDate(p.updatedAt)}.`);
    else if (!p.guideCreatedAt) parts.push("Aún no hay precios descargados.");
    parts.push("«~» = tendencia de Cardmarket (todas las condiciones); sin «~» = precio real NM/EX.");
    $("#pricesInfo").textContent = parts.join(" ");
  }

  // ---------- Marcar / desmarcar ----------
  function setOwned(id, on, extra) {
    if (on) {
      state.owned[id] = state.owned[id] || Date.now();
      state.meta[id] = { qty: 1, ...(state.meta[id] || {}), ...(extra || {}) };
      if (!state.meta[id].date) state.meta[id].date = today();
    } else {
      delete state.owned[id];
      delete state.meta[id];
    }
  }
  function toggle(id, { fromSheet = false, paid = null } = {}) {
    const c = card(id);
    const prev = { owned: state.owned[id], meta: state.meta[id] && { ...state.meta[id] } };
    const was = !!prev.owned;
    setOwned(id, !was, paid != null ? { paid } : null);
    // Si la buscabas y la consigues, deja de ser objetivo (se puede deshacer)
    const prevWish = state.wish[id];
    if (!was && prevWish) delete state.wish[id];
    save();
    if (navigator.vibrate) navigator.vibrate(was ? 8 : 15);
    const el = tiles.get(id).firstElementChild;
    el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop");
    paintTile(c); renderStats(); renderControls();
    if (fromSheet) openSheet(id);
    const restore = () => {
      if (prev.owned) state.owned[id] = prev.owned; else delete state.owned[id];
      if (prev.meta) state.meta[id] = prev.meta; else delete state.meta[id];
      if (prevWish) state.wish[id] = prevWish;
      save(); render(); if (sheet.open && sheetId === id) openSheet(id);
    };
    if (!was && !fromSheet) {
      showToast(`Marcada: ${c.name}`, [
        { label: "Deshacer", fn: restore },
        { label: "€ Precio", fn: () => openSheet(id, { focus: "paid" }) },
      ]);
    } else {
      showToast(`${was ? "Quitada" : "Marcada"}: ${c.name}`, [{ label: "Deshacer", fn: restore }]);
    }
  }

  // ---------- Toast ----------
  let toastTimer;
  function showToast(text, actions = []) {
    const t = $("#toast");
    $("#toastText").textContent = text;
    $$("#toast button").forEach((b) => b.remove());
    for (const a of actions) {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = a.label;
      b.onclick = () => { t.hidden = true; a.fn(); };
      t.appendChild(b);
    }
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, actions.length ? 4500 : 2500);
  }

  // ---------- Gestos de la rejilla ----------
  function setupGridGestures() {
    let timer = null, startX = 0, startY = 0, longFired = false;
    const idFrom = (e) => e.target.closest("li")?.dataset.id;
    grid.addEventListener("pointerdown", (e) => {
      const id = idFrom(e);
      if (!id || e.button > 0) return;
      longFired = false; startX = e.clientX; startY = e.clientY;
      clearTimeout(timer);
      if (e.target.closest(".info, .cm")) return;
      timer = setTimeout(() => { longFired = true; if (navigator.vibrate) navigator.vibrate(20); openSheet(id); }, LONG_PRESS_MS);
    });
    const cancel = () => clearTimeout(timer);
    grid.addEventListener("pointermove", (e) => {
      if (Math.abs(e.clientX - startX) > 10 || Math.abs(e.clientY - startY) > 10) cancel();
    });
    grid.addEventListener("pointercancel", cancel);
    grid.addEventListener("pointerup", cancel);
    grid.addEventListener("contextmenu", (e) => { if (e.target.closest(".card")) e.preventDefault(); });
    grid.addEventListener("click", (e) => {
      const id = idFrom(e);
      if (!id) return;
      if (e.target.closest(".cm")) { openCmSheet(id); return; }
      if (e.target.closest(".info")) { openSheet(id); return; }
      if (longFired) { longFired = false; return; }
      toggle(id);
    });
    grid.addEventListener("keydown", (e) => {
      if (!e.target.classList.contains("card")) return;
      const id = idFrom(e);
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(id); }
      if (e.key.toLowerCase() === "i") openSheet(id);
    });
  }

  // ---------- Hoja de detalle ----------
  const sheet = $("#sheet");
  let sheetId = null;
  const askedDraft = {}; // lo que te piden por cada carta (durante la sesión)

  function priceBox(label, key, data, fallback) {
    const active = S().cond === key ? " active" : "";
    if (!data) {
      return `<div class="pbox${active}"><h3>${label}</h3><div class="big">${fallback != null ? "~" + fmt(fallback) : "–"}</div>
        <p class="small muted" style="margin:4px 0 0">${fallback != null ? "Aprox. (tendencia)" : "Sin datos"}</p></div>`;
    }
    return `<div class="pbox${active}"><h3>${label}</h3><div class="big">${fmt(data.from)}</div>
      <dl><dt>Media 5 más bar.</dt><dd>${fmt(data.avg5)}</dd>
      <dt>Mediana (10)</dt><dd>${fmt(data.median)}</dd>
      <dt>Ofertas vistas</dt><dd>${data.offers}</dd></dl></div>`;
  }
  function verdictHtml(c, asked) {
    const v = verdict(c, asked);
    if (!v) return `<p class="verdict muted">Escribe lo que te piden y te digo si compensa.</p>`;
    const vsMax = v.underMax == null ? "" : v.underMax
      ? `<span class="vmax ok">✓ Dentro de tu máximo (${fmt(v.max)})</span>`
      : `<span class="vmax bad">✗ Por encima de tu máximo (${fmt(v.max)})</span>`;
    return `<p class="verdict ${v.level}"><strong>${v.text}</strong> · ${pct(v.d)} vs ${v.ref.approx ? "tendencia" : S().cond.toUpperCase()} (${fmt(v.ref.value)})${vsMax}</p>`;
  }

  function openSheet(id, { focus } = {}) {
    sheetId = id;
    const c = card(id);
    const p = state.prices.cards[id] || {};
    const cm = p.cm || {}, api = p.api || {}, g = p.guide || {};
    const owned = !!state.owned[id];
    const m = state.meta[id] || {};
    const w = state.wish[id];
    const trend = g.trend ?? cm.trend ?? api.trend;
    const searchUrl = `https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=${encodeURIComponent(c.name + " Base Set 2")}`;
    const ref = [
      ["Tendencia Cardmarket", trend],
      ["Media venta (ayer)", g.avg1],
      ["Media 7 días", g.avg7 ?? cm.avg7 ?? api.avg7],
      ["Media 30 días", g.avg30 ?? cm.avg30 ?? api.avg30],
      ["Precio medio en venta", g.avg],
      ["Desde (cualquier estado)", g.low],
      ["Desde (EX o mejor)", cm.exPlusFrom],
    ].filter(([, v]) => v != null);
    const td = trendDelta(c);
    const asked = askedDraft[id] ?? null;
    const inLot = state.lot.some((x) => x.id === id);

    $("#sheetBody").innerHTML = `
      <div class="detail-head">
        <img src="${c.imgLarge}" alt="${escapeHtml(c.name)}" onerror="this.onerror=null;this.src='${c.img}'">
        <div>
          <h2 id="sheetTitle">${escapeHtml(c.name)}</h2>
          <p class="muted" style="margin:0 0 8px">Nº ${c.number}/130</p>
          <span class="badge ${c.rarity === "Rare Holo" ? "holo" : ""}">${RARITY_ES[c.rarity] || c.supertype}</span>
          ${c.supertype !== "Pokémon" ? `<span class="badge">${c.supertype === "Trainer" ? "Entrenador" : "Energía"}</span>` : ""}
          ${(c.types || []).map((t) => `<span class="badge">${TYPE_ES[t] || t}</span>`).join("")}
          ${td != null ? `<p class="small ${td >= 0 ? "up" : "down"}" style="margin:6px 0 0">${td >= 0 ? "▲" : "▼"} ${pct(td)} (7 días vs 30)</p>` : ""}
          ${owned ? `<p class="owned-note">✓ La tengo${qtyOf(id) > 1 ? ` · ×${qtyOf(id)}` : ""}${m.paid != null ? ` · pagué ${fmt(m.paid)}` : ""}</p>` : ""}
        </div>
      </div>
      <div class="price-boxes">
        ${priceBox("Near Mint", "nm", cm.nm, trend)}
        ${priceBox("Excellent", "ex", cm.ex, cm.exPlusFrom ?? trend)}
      </div>

      <section class="block check-block">
        <label class="field big">
          <span>¿Cuánto te piden?</span>
          <span class="money"><input type="text" inputmode="decimal" id="askedInput" placeholder="0" value="${asked ?? ""}" autocomplete="off"><b>€</b></span>
        </label>
        <div id="verdictBox">${verdictHtml(c, asked)}</div>
        <div class="row-btns">
          <button type="button" class="pill-btn" id="lotAdd">${inLot ? "✓ En el lote · actualizar" : "+ Añadir al lote"}</button>
          ${owned ? "" : `<button type="button" class="pill-btn primary" id="buyNow">Comprada a este precio</button>`}
        </div>
      </section>

      ${p.url ? cmButtons(c) : `<div class="links"><a href="${searchUrl}" target="_blank" rel="noopener">Buscar en Cardmarket ↗</a></div>`}

      ${owned ? `
      <section class="block">
        <h3 class="block-title">Mi copia</h3>
        <div class="field-row">
          <span>Copias</span>
          <div class="stepper"><button type="button" data-step="-1" aria-label="Una menos">−</button><output id="qtyOut">${qtyOf(id)}</output><button type="button" data-step="1" aria-label="Una más">+</button></div>
        </div>
        <label class="field">
          <span>Pagado</span>
          <span class="money"><input type="text" inputmode="decimal" id="paidInput" placeholder="—" value="${m.paid ?? ""}" autocomplete="off"><b>€</b></span>
        </label>
        <div class="field-row wrap"><span>Estado</span>
          <div class="chip-wrap" id="condChips">${CONDITIONS.map((k) => `<button type="button" class="chip sm" data-cond="${k}" aria-pressed="${m.cond === k}">${k}</button>`).join("")}</div>
        </div>
        ${m.date ? `<p class="small muted" style="margin:6px 0 0">Comprada el ${new Date(m.date).toLocaleDateString("es-ES")}</p>` : ""}
      </section>` : ""}

      <section class="block">
        <div class="field-row">
          <h3 class="block-title" style="margin:0">Objetivo</h3>
          <button type="button" class="chip ${w ? "on" : ""}" id="wishToggle">${w ? "★ La busco" : "☆ La busco"}</button>
        </div>
        ${w ? `
        <label class="field">
          <span>Pago como máximo</span>
          <span class="money"><input type="text" inputmode="decimal" id="maxInput" placeholder="sin límite" value="${w.max ?? ""}" autocomplete="off"><b>€</b></span>
        </label>
        <div class="field-row"><span>Prioridad</span>
          <div class="chip-wrap" id="prioChips">${PRIORITIES.map((pr) => `<button type="button" class="chip sm" data-prio="${pr.key}" aria-pressed="${(w.prio || 2) === pr.key}">${pr.label}</button>`).join("")}</div>
        </div>` : ""}
      </section>

      ${ref.length ? `<details class="more"><summary>Más datos de Cardmarket</summary>
        <div class="ref">${ref.map(([k, v]) => `<span class="muted">${k}</span><span>${fmt(v)}</span>`).join("")}</div>
        <p class="small muted">${[p.scrapedAt && "NM/EX del " + fmtDate(p.scrapedAt), p.guide && state.prices.guideCreatedAt && "Guía oficial Cardmarket del " + fmtDate(state.prices.guideCreatedAt)].filter(Boolean).join(" · ")}</p>
      </details>` : ""}

      <div class="sheet-sticky">
        <button type="button" class="big-btn ${owned ? "owned" : ""}" id="sheetToggle">${owned ? "✓ La tengo · toca para quitar" : "Marcar como conseguida"}</button>
      </div>`;

    // --- eventos de la hoja ---
    const askedInput = $("#askedInput");
    askedInput.addEventListener("input", () => {
      askedDraft[id] = num(askedInput.value);
      $("#verdictBox").innerHTML = verdictHtml(c, askedDraft[id]);
    });
    $("#lotAdd").onclick = () => {
      const v = num(askedInput.value);
      const i = state.lot.findIndex((x) => x.id === id);
      if (i >= 0) state.lot[i].asked = v; else state.lot.push({ id, asked: v });
      save(); renderControls();
      showToast(`Lote: ${state.lot.length} ${state.lot.length === 1 ? "carta" : "cartas"}`, [{ label: "Ver lote", fn: openLot }]);
      openSheet(id);
    };
    const buy = $("#buyNow");
    if (buy) buy.onclick = () => toggle(id, { fromSheet: true, paid: num(askedInput.value) });
    $("#sheetToggle").onclick = () => toggle(id, { fromSheet: true });

    if (owned) {
      $$("#sheetBody .stepper button").forEach((b) => b.onclick = () => {
        const q = Math.max(1, qtyOf(id) + +b.dataset.step);
        state.meta[id] = { ...(state.meta[id] || {}), qty: q };
        $("#qtyOut").textContent = q;
        save(); paintTile(c); renderStats();
      });
      const paid = $("#paidInput");
      paid.addEventListener("input", () => {
        state.meta[id] = { ...(state.meta[id] || {}), paid: num(paid.value) };
        save(); renderStats();
      });
      $("#condChips").onclick = (e) => {
        const b = e.target.closest("[data-cond]"); if (!b) return;
        const cur = (state.meta[id] || {}).cond;
        state.meta[id] = { ...(state.meta[id] || {}), cond: cur === b.dataset.cond ? null : b.dataset.cond };
        save();
        $$("#condChips .chip").forEach((x) => x.setAttribute("aria-pressed", x.dataset.cond === state.meta[id].cond));
      };
    }
    $("#wishToggle").onclick = () => {
      if (state.wish[id]) delete state.wish[id]; else state.wish[id] = { max: null, prio: 2 };
      save(); paintTile(c); renderStats(); openSheet(id, { focus: state.wish[id] ? "max" : null });
    };
    if (w) {
      const mx = $("#maxInput");
      mx.addEventListener("input", () => {
        state.wish[id] = { ...state.wish[id], max: num(mx.value) };
        save(); paintTile(c);
        $("#verdictBox").innerHTML = verdictHtml(c, askedDraft[id] ?? null);
      });
      $("#prioChips").onclick = (e) => {
        const b = e.target.closest("[data-prio]"); if (!b) return;
        state.wish[id] = { ...state.wish[id], prio: +b.dataset.prio };
        save();
        $$("#prioChips .chip").forEach((x) => x.setAttribute("aria-pressed", +x.dataset.prio === state.wish[id].prio));
      };
    }
    if (!sheet.open) sheet.showModal();
    if (focus === "paid" && $("#paidInput")) setTimeout(() => $("#paidInput").focus(), 250);
    if (focus === "max" && $("#maxInput")) setTimeout(() => $("#maxInput").focus(), 250);
    if (focus === "asked") setTimeout(() => askedInput.focus(), 250);
  }
  // Al cerrar la ficha se aplica el filtro (p. ej. «Faltan» oculta la que acabas de marcar)
  sheet.addEventListener("close", () => render());
  $("#sheetClose").addEventListener("click", () => sheet.close());

  // ---------- Cardmarket: elegir NM o EX ----------
  function cmButtons(c) {
    const cm = (state.prices.cards[c.id] || {}).cm || {};
    const opt = (cond, title, sub) => {
      const pr = priceOf(c, cond);
      return `<a class="cm-opt ${S().cond === cond ? "pref" : ""}" href="${cardmarketUrl(c, cond)}" target="_blank" rel="noopener" data-cond="${cond}">
        <span class="cm-cond">${cond.toUpperCase()}</span>
        <span class="cm-text"><strong>${title}</strong><small>${sub}</small></span>
        <span class="cm-price">${pr ? (pr.approx ? "~" : "") + fmt(pr.value) : ""}<small>${cm[cond] ? `${cm[cond].offers} ofertas` : pr ? "tendencia" : ""}</small></span>
        <span class="cm-arrow" aria-hidden="true">↗</span>
      </a>`;
    };
    return `<div class="cm-opts">
      ${opt("nm", "Near Mint o mejor", "Inglés · NM o Mint")}
      ${opt("ex", "Excellent o mejor", "Inglés · EX, NM o Mint")}
    </div>`;
  }
  const cmSheet = $("#cmSheet");
  function openCmSheet(id) {
    const c = card(id);
    $("#cmBody").innerHTML = `
      <div class="cm-head">
        <img src="${c.img}" alt="" width="60" height="84">
        <div><h2 class="sheet-title" id="cmTitle">${escapeHtml(c.name)}</h2>
        <p class="muted small">Nº ${c.number}/130 · Abrir en Cardmarket (pestaña nueva)</p></div>
      </div>
      ${cmButtons(c)}`;
    if (navigator.vibrate) navigator.vibrate(8);
    cmSheet.showModal();
  }
  cmSheet.addEventListener("click", (e) => { if (e.target.closest(".cm-opt")) setTimeout(() => cmSheet.close(), 150); });

  // ---------- Teclado numérico ----------
  const keypad = $("#keypad");
  let kp = "";
  function renderKeypad() {
    $("#kpValue").textContent = kp || "–";
    const n = +kp;
    const c = kp ? state.cards.find((x) => x.number === n) : null;
    const box = $("#kpPreview");
    box.dataset.id = c ? c.id : "";
    if (!kp) { box.innerHTML = `<p class="muted kp-hint">Escribe el número que aparece abajo en la carta (p. ej. 4 de «4/130»).</p>`; return; }
    if (!c) { box.innerHTML = `<p class="muted kp-hint">No existe la carta nº ${kp} en Base Set 2 (1–130).</p>`; return; }
    const owned = !!state.owned[c.id];
    const p = priceOf(c);
    box.innerHTML = `
      <div class="kp-card ${owned ? "owned" : ""}">
        <img src="${c.img}" alt="">
        <div class="kp-info">
          <strong>${escapeHtml(c.name)}</strong>
          <span class="muted small">${RARITY_ES[c.rarity] || c.supertype}${state.wish[c.id] ? " · ★ objetivo" : ""}</span>
          <span class="kp-price">${p ? (p.approx ? "~" : "") + fmt(p.value) : "–"} <small class="muted">${S().cond.toUpperCase()}</small></span>
          <span class="kp-state ${owned ? "ok" : ""}">${owned ? `✓ La tengo${qtyOf(c.id) > 1 ? " ×" + qtyOf(c.id) : ""}` : "Me falta"}</span>
        </div>
      </div>
      <div class="kp-actions">
        <button type="button" class="pill-btn" data-kpa="price">¿Buen precio?</button>
        <button type="button" class="pill-btn" data-kpa="cm">CM</button>
        <button type="button" class="pill-btn ${owned ? "" : "primary"}" data-kpa="toggle">${owned ? "Quitar" : "✓ Marcar"}</button>
      </div>`;
  }
  function openKeypad() { kp = ""; renderKeypad(); keypad.showModal(); }
  $("#kpKeys").addEventListener("click", (e) => {
    const b = e.target.closest("[data-k]"); if (!b) return;
    const k = b.dataset.k;
    if (k === "clear") kp = "";
    else if (k === "back") kp = kp.slice(0, -1);
    else if (kp.length < 3) kp = (kp + k).replace(/^0+/, "");
    if (navigator.vibrate) navigator.vibrate(5);
    renderKeypad();
  });
  $("#kpPreview").addEventListener("click", (e) => {
    const id = $("#kpPreview").dataset.id;
    if (!id) return;
    const b = e.target.closest("[data-kpa]");
    if (!b) { if (e.target.closest(".kp-card")) { keypad.close(); openSheet(id); } return; }
    if (b.dataset.kpa === "price") { keypad.close(); openSheet(id, { focus: "asked" }); }
    if (b.dataset.kpa === "cm") openCmSheet(id);
    if (b.dataset.kpa === "toggle") { toggle(id); kp = ""; renderKeypad(); }
  });
  keypad.addEventListener("keydown", (e) => {
    if (/^\d$/.test(e.key) && kp.length < 3) { kp = (kp + e.key).replace(/^0+/, ""); renderKeypad(); }
    if (e.key === "Backspace") { kp = kp.slice(0, -1); renderKeypad(); }
  });

  // ---------- Lote / calculadora ----------
  const lotSheet = $("#lotSheet");
  function openLot() {
    renderLot();
    if (!lotSheet.open) lotSheet.showModal();
  }
  function renderLot() {
    const rows = state.lot.map((x) => ({ ...x, c: card(x.id), ref: priceOf(card(x.id)) })).filter((x) => x.c);
    const totalAsked = rows.reduce((a, r) => a + (r.asked || 0), 0);
    const totalRef = rows.reduce((a, r) => a + ((r.ref || {}).value || 0), 0);
    const d = totalRef && totalAsked ? (totalAsked - totalRef) / totalRef : null;
    const level = d == null ? "" : d <= -0.1 ? "good" : d <= 0.1 ? "fair" : "bad";
    $("#lotBody").innerHTML = `
      <h2 class="sheet-title" id="lotTitle">Lote / calculadora</h2>
      ${rows.length ? `
      <ul class="lot-list">
        ${rows.map((r) => `
          <li>
            <img src="${r.c.img}" alt="">
            <div class="lot-name"><strong>${escapeHtml(r.c.name)}</strong><small class="muted">#${r.c.number} · ref. ${r.ref ? (r.ref.approx ? "~" : "") + fmt(r.ref.value) : "–"}${state.owned[r.id] ? " · ya la tengo" : ""}</small></div>
            <span class="money sm"><input type="text" inputmode="decimal" value="${r.asked ?? ""}" placeholder="—" data-lot-input="${r.id}" aria-label="Precio de ${escapeHtml(r.c.name)}"><b>€</b></span>
            <button type="button" class="lot-del" data-lot-del="${r.id}" aria-label="Quitar">×</button>
          </li>`).join("")}
      </ul>
      <div class="lot-totals">
        <div><span class="muted">Te piden</span><strong>${fmt(totalAsked)}</strong></div>
        <div><span class="muted">Valor ${S().cond.toUpperCase()}</span><strong>${fmt(totalRef)}</strong></div>
        <div><span class="muted">Diferencia</span><strong class="${level}">${d == null ? "–" : pct(d)}</strong></div>
      </div>
      <label class="field">
        <span>¿Precio por todo el lote?</span>
        <span class="money"><input type="text" inputmode="decimal" id="lotTotal" placeholder="opcional" autocomplete="off"><b>€</b></span>
      </label>
      <p class="verdict" id="lotVerdict"></p>
      <div class="row-btns">
        <button type="button" class="pill-btn ghost" id="lotClear">Vaciar</button>
        <button type="button" class="pill-btn primary" id="lotBuy">Comprar lote</button>
      </div>
      <p class="small muted">«Comprar lote» marca todas como conseguidas y guarda lo pagado (si pones un precio total, se reparte según el valor de cada carta). Si ya tenías alguna, suma una copia.</p>`
      : `<p class="muted">Vacío. En la ficha de una carta escribe lo que te piden y pulsa «+ Añadir al lote» para sumar varias y ver si el total compensa.</p>`}`;
    const lt = $("#lotTotal");
    if (!lt) return;
    lt.addEventListener("input", () => {
      const t = num(lt.value);
      const v = $("#lotVerdict");
      if (t == null || !totalRef) { v.textContent = ""; v.className = "verdict"; return; }
      const dd = (t - totalRef) / totalRef;
      const lv = dd <= -0.1 ? "good" : dd <= 0.1 ? "fair" : "bad";
      v.className = `verdict ${lv}`;
      v.innerHTML = `<strong>${lv === "good" ? "Buen precio" : lv === "fair" ? "Precio justo" : "Caro"}</strong> · ${pct(dd)} vs valor ${fmt(totalRef)}`;
    });
  }
  lotSheet.addEventListener("input", (e) => {
    const id = e.target.dataset.lotInput; if (!id) return;
    const it = state.lot.find((x) => x.id === id);
    if (it) { it.asked = num(e.target.value); save(); }
  });
  lotSheet.addEventListener("change", (e) => { if (e.target.dataset.lotInput) renderLot(); });
  lotSheet.addEventListener("click", (e) => {
    const del = e.target.closest("[data-lot-del]");
    if (del) { state.lot = state.lot.filter((x) => x.id !== del.dataset.lotDel); save(); renderLot(); renderControls(); return; }
    if (e.target.id === "lotClear" && confirm("¿Vaciar el lote?")) { state.lot = []; save(); renderLot(); renderControls(); }
    if (e.target.id === "lotBuy") {
      const total = num(($("#lotTotal") || {}).value);
      const rows = state.lot.map((x) => ({ ...x, ref: (priceOf(card(x.id)) || {}).value || 0 }));
      const sumRef = rows.reduce((a, r) => a + r.ref, 0);
      for (const r of rows) {
        const paid = total != null && sumRef ? Math.round((total * r.ref / sumRef) * 100) / 100 : r.asked;
        if (state.owned[r.id]) {
          state.meta[r.id] = { ...(state.meta[r.id] || {}), qty: qtyOf(r.id) + 1 };
        } else {
          setOwned(r.id, true, { paid, date: today() });
          delete state.wish[r.id];
        }
      }
      const n = rows.length;
      state.lot = [];
      save(); render(); lotSheet.close();
      showToast(`✓ ${n} ${n === 1 ? "carta añadida" : "cartas añadidas"} a la colección`);
    }
  });

  // ---------- Paneles: lista de faltas, resumen, sin conexión ----------
  const panel = $("#panel");
  function openPanel(html) { $("#panelBody").innerHTML = html; if (!panel.open) panel.showModal(); }
  panel.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) panel.close(); });

  function wantListText() {
    const missing = state.cards.filter((c) => !state.owned[c.id]);
    const wish = missing.filter((c) => state.wish[c.id]).sort((a, b) => (state.wish[a.id].prio || 2) - (state.wish[b.id].prio || 2) || a.number - b.number);
    const lines = [`Busco cartas de Pokémon Base Set 2 (inglés, NM/EX) — me faltan ${missing.length} de 130:`];
    if (wish.length) {
      lines.push("", "★ Prioridad:");
      for (const c of wish) lines.push(`#${c.number} ${c.name}${state.wish[c.id].max != null ? ` (hasta ${fmt(state.wish[c.id].max)})` : ""}`);
    }
    const groups = [["holo", "Holos"], ["rare", "Raras"], ["uncommon", "Infrecuentes"], ["common", "Comunes"], ["trainer", "Entrenadores"], ["energy", "Energías"]];
    for (const [k, label] of groups) {
      const g = missing.filter((c) => category(c) === k && !state.wish[c.id]);
      if (g.length) lines.push("", `${label} (${g.length}):`, g.map((c) => `#${c.number} ${c.name}`).join(", "));
    }
    return lines.join("\n");
  }
  function openWantList() {
    const txt = wantListText();
    openPanel(`
      <h2 class="sheet-title" id="panelTitle">Mi lista de faltas</h2>
      <pre class="wantlist">${escapeHtml(txt)}</pre>
      <div class="row-btns">
        <button type="button" class="pill-btn" id="wlCopy">Copiar</button>
        <button type="button" class="pill-btn primary" id="wlShare">Compartir</button>
      </div>`);
    $("#wlCopy").onclick = async () => { try { await navigator.clipboard.writeText(txt); showToast("Lista copiada"); } catch { prompt("Copia la lista:", txt); } };
    $("#wlShare").onclick = async () => {
      if (navigator.share) { try { await navigator.share({ title: "Busco Base Set 2", text: txt }); } catch { /* cancelado */ } }
      else window.open(`https://wa.me/?text=${encodeURIComponent(txt)}`, "_blank", "noopener");
    };
  }

  function totals() {
    let spent = 0, spentToday = 0, valuePaid = 0, nPaid = 0;
    const t = today();
    for (const [id, m] of Object.entries(state.meta)) {
      if (!state.owned[id] || m.paid == null) continue;
      spent += m.paid; nPaid++;
      if (m.date === t) spentToday += m.paid;
      valuePaid += (priceOf(card(id)) || {}).value || 0;
    }
    return { spent, spentToday, valuePaid, nPaid };
  }
  function openSummary() {
    const t = totals();
    let have = 0;
    for (const c of state.cards) if (state.owned[c.id]) have += ((priceOf(c) || {}).value || 0) * qtyOf(c.id);
    const recent = Object.entries(state.meta)
      .filter(([id, m]) => state.owned[id] && m.paid != null)
      .sort((a, b) => (state.owned[b[0]] || 0) - (state.owned[a[0]] || 0)).slice(0, 15);
    const diff = t.valuePaid - t.spent;
    openPanel(`
      <h2 class="sheet-title" id="panelTitle">Resumen de gastos</h2>
      <div class="summary-grid">
        <div><span class="muted">Gastado total</span><strong>${fmt(t.spent)}</strong></div>
        <div><span class="muted">Gastado hoy</span><strong>${fmt(t.spentToday)}</strong></div>
        <div><span class="muted">Valor colección (${S().cond.toUpperCase()})</span><strong>${fmt(have)}</strong></div>
        <div><span class="muted">Ahorro vs Cardmarket</span><strong class="${diff >= 0 ? "good" : "bad"}">${t.nPaid ? fmt(diff) : "–"}</strong></div>
      </div>
      <p class="small muted">El ahorro compara lo que pagaste con el precio actual de esas ${t.nPaid} cartas.</p>
      ${recent.length ? `<h3 class="block-title">Últimas compras</h3><ul class="buy-list">${recent.map(([id, m]) => {
        const c = card(id); const ref = (priceOf(c) || {}).value;
        return `<li><span>#${c.number} ${escapeHtml(c.name)}${m.cond ? ` <small class="muted">${m.cond}</small>` : ""}<small class="muted">${m.date ? new Date(m.date).toLocaleDateString("es-ES") : ""}</small></span><strong>${fmt(m.paid)}</strong>${ref ? `<small class="${m.paid <= ref ? "good" : "bad"}">${pct((m.paid - ref) / ref)}</small>` : ""}</li>`;
      }).join("")}</ul>` : `<p class="muted">Aún no has apuntado ningún precio de compra. Tras marcar una carta pulsa «€ Precio» en el aviso, o escríbelo en su ficha.</p>`}`);
  }

  // Descarga todo para usar sin conexión (imágenes en la caché del navegador)
  async function prepareOffline() {
    if (!("caches" in window)) { alert("Este navegador no permite guardar datos sin conexión."); return; }
    openPanel(`
      <h2 class="sheet-title" id="panelTitle">Preparar para usar sin conexión</h2>
      <p class="muted" id="offMsg">Descargando imágenes y precios…</p>
      <div class="progress big"><div id="offBar"></div></div>
      <p class="small muted" id="offCount"></p>`);
    const shell = ["./", "index.html", "assets/styles.css", "assets/app.js", "assets/icon.svg", "assets/icon-192.png", "manifest.webmanifest", "data/cards.json", "data/prices.json"];
    const imgs = state.cards.map((c) => c.img);
    const total = shell.length + imgs.length;
    let done = 0, fail = 0;
    const tick = () => {
      done++;
      $("#offBar").style.width = `${(done / total) * 100}%`;
      $("#offCount").textContent = `${done} / ${total}${fail ? ` · ${fail} fallidas` : ""}`;
    };
    try {
      const app = await caches.open(APP_CACHE);
      for (const u of shell) {
        let ok = false;
        for (let attempt = 0; attempt < 3 && !ok; attempt++) {
          try { await app.add(new Request(u, { cache: "reload" })); ok = true; } catch { await new Promise((res) => setTimeout(res, 800)); }
        }
        if (!ok) fail++;
        tick();
      }
      const img = await caches.open(IMG_CACHE);
      let i = 0;
      const worker = async () => {
        while (i < imgs.length) {
          const u = imgs[i++];
          let ok = false;
          for (let attempt = 0; attempt < 3 && !ok; attempt++) {
            try {
              if (!(await img.match(u, { ignoreVary: true }))) {
                const r = await fetch(u, { mode: "no-cors", cache: "reload" });
                await img.put(u, r);
              }
              ok = true;
            } catch { await new Promise((res) => setTimeout(res, 800 * (attempt + 1))); }
          }
          if (!ok) fail++;
          tick();
        }
      };
      await Promise.all(Array.from({ length: 6 }, worker));
      if (fail) {
        $("#offMsg").innerHTML = `Terminado con ${fail} fallos. <button type="button" class="pill-btn" id="offRetry">Reintentar</button>`;
        $("#offRetry").onclick = prepareOffline;
      } else {
        S().offlineAt = Date.now(); save(); renderControls();
        $("#offMsg").textContent = "✓ Listo. Ya puedes usar la web sin conexión (añádela a la pantalla de inicio para abrirla como una app).";
      }
    } catch (e) {
      $("#offMsg").textContent = "No se pudo completar: " + e.message;
    }
  }
  function renderNet() { $("#netState").hidden = navigator.onLine; }
  window.addEventListener("online", renderNet);
  window.addEventListener("offline", () => {
    renderNet();
    showToast(S().offlineAt ? "Sin conexión · usando datos guardados" : "Sin conexión · prepara el modo sin conexión desde ⋯");
  });

  // ---------- Modo feria + pantalla encendida ----------
  let wakeLock = null;
  async function keepAwake(on) {
    try {
      if (on && "wakeLock" in navigator && !wakeLock) {
        wakeLock = await navigator.wakeLock.request("screen");
        wakeLock.addEventListener("release", () => { wakeLock = null; });
      } else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
    } catch { /* no soportado */ }
  }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && S().fair) keepAwake(true); });
  function setFair(on) {
    const s = S();
    if (on === s.fair) return;
    if (on) {
      s.fairPrev = { filter: s.filter, density: s.density, grayscale: s.grayscale };
      Object.assign(s, { fair: true, filter: "missing", density: "l", grayscale: false });
      showToast(s.offlineAt ? "Modo feria: solo las que faltan, en grande y pantalla encendida" : "Modo feria activado · consejo: prepara el modo sin conexión (⋯)");
    } else {
      Object.assign(s, { fair: false }, s.fairPrev || {});
      s.fairPrev = null;
    }
    keepAwake(on);
    save(); render(); window.scrollTo({ top: 0 });
  }

  // ---------- Hojas de filtros y orden ----------
  const filtersSheet = $("#filtersSheet");
  const sortSheet = $("#sortSheet");
  const chip = (attr, key, label, on, extra = "") =>
    `<button type="button" class="chip" data-${attr}="${key}" aria-pressed="${on}">${extra}${label}</button>`;
  function renderFiltersSheet() {
    const s = S();
    const counts = (fn) => state.cards.reduce((m, c) => (m[fn(c)] = (m[fn(c)] || 0) + 1, m), {});
    const cc = counts(category), tc = counts(typeOf);
    $("#fCats").innerHTML = CATEGORIES.map((c) => chip("cat", c.key, `${c.label} <span class="n">${cc[c.key] || 0}</span>`, s.cats.includes(c.key))).join("");
    $("#fTypes").innerHTML = TYPES.filter((t) => tc[t.key]).map((t) =>
      chip("type", t.key, `${t.label} <span class="n">${tc[t.key]}</span>`, s.types.includes(t.key), `<i class="dot" style="background:${t.color}"></i>`)).join("");
    $("#fPrice").innerHTML = PRICE_RANGES.map((r) => chip("price", r.key, r.label, s.price === r.key)).join("");
    $("#fPriceCond").textContent = `(${s.cond.toUpperCase()})`;
    $("#fExtra").innerHTML = EXTRAS.map((e) => chip("extra", e.key, e.label, s.extras.includes(e.key))).join("");
    $("#fDensity").innerHTML = DENSITIES.map((d) => chip("density", d.key, d.label, s.density === d.key)).join("");
    const n = filterCards().length;
    $("#filtersApply").textContent = n ? `Ver ${n} ${n === 1 ? "carta" : "cartas"}` : "Ninguna carta";
  }
  filtersSheet.addEventListener("click", (e) => {
    const b = e.target.closest(".chip"); if (!b) return;
    const s = S();
    const tog = (arr, k) => { const i = arr.indexOf(k); if (i >= 0) arr.splice(i, 1); else arr.push(k); };
    if (b.dataset.cat) tog(s.cats, b.dataset.cat);
    if (b.dataset.type) tog(s.types, b.dataset.type);
    if (b.dataset.extra) {
      tog(s.extras, b.dataset.extra);
      if (b.dataset.extra === "paid") s.extras = s.extras.filter((x) => x !== "unpaid");
      if (b.dataset.extra === "unpaid") s.extras = s.extras.filter((x) => x !== "paid");
    }
    if (b.dataset.price) s.price = b.dataset.price;
    if (b.dataset.density) s.density = b.dataset.density;
    save(); render(); renderFiltersSheet();
  });
  $("#filtersApply").addEventListener("click", () => { filtersSheet.close(); window.scrollTo({ top: 0 }); });
  $("#filtersClear").addEventListener("click", () => { clearFilters(); save(); render(); renderFiltersSheet(); });
  $("#emptyClear").addEventListener("click", () => { clearFilters(); S().filter = "all"; save(); render(); });

  function renderSortSheet() {
    $("#sortList").innerHTML = SORTS.map((o) =>
      `<button type="button" role="radio" aria-checked="${S().sort === o.key}" data-sort="${o.key}">${o.label}</button>`).join("");
  }
  sortSheet.addEventListener("click", (e) => {
    const b = e.target.closest("[data-sort]"); if (!b) return;
    S().sort = b.dataset.sort;
    save(); render(); renderSortSheet();
    setTimeout(() => sortSheet.close(), 120);
    window.scrollTo({ top: 0 });
  });

  // Cerrar hojas tocando el fondo o deslizando hacia abajo
  for (const d of $$("dialog.sheet")) {
    d.addEventListener("click", (e) => { if (e.target === d) d.close(); });
    setupSwipeToClose(d);
  }
  function setupSwipeToClose(d) {
    let y0 = null;
    d.addEventListener("touchstart", (e) => {
      y0 = d.scrollTop <= 0 && !e.target.closest("input, .kp-keys") ? e.touches[0].clientY : null;
    }, { passive: true });
    d.addEventListener("touchmove", (e) => {
      if (y0 == null) return;
      const dy = e.touches[0].clientY - y0;
      if (dy > 0) d.style.transform = `translateY(${dy}px)`;
    }, { passive: true });
    d.addEventListener("touchend", (e) => {
      if (y0 == null) return;
      const dy = e.changedTouches[0].clientY - y0;
      d.style.transform = "";
      if (dy > 90) d.close();
      y0 = null;
    });
  }

  // ---------- Controles ----------
  function setupControls() {
    $("#filtersBtn").addEventListener("click", () => { renderFiltersSheet(); filtersSheet.showModal(); });
    $("#sortBtn").addEventListener("click", () => { renderSortSheet(); sortSheet.showModal(); });
    $("#keypadBtn").addEventListener("click", openKeypad);
    $("#lotBtn").addEventListener("click", openLot);
    $("#fairBtn").addEventListener("click", () => setFair(!S().fair));
    $("#clearSearch").addEventListener("click", () => { S().query = ""; $("#search").value = ""; render(); $("#search").focus(); });
    $$(".cond-toggle button").forEach((b) => b.addEventListener("click", () => { S().cond = b.dataset.cond; save(); render(); }));
    $$(".segmented button").forEach((b) => b.addEventListener("click", () => { S().filter = b.dataset.filter; save(); render(); window.scrollTo({ top: 0 }); }));
    let t;
    $("#search").addEventListener("input", (e) => { clearTimeout(t); t = setTimeout(() => { S().query = e.target.value; render(); }, 120); });
    $("#search").addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      e.target.blur();
      S().query = e.target.value; render();
      const list = visibleCards();
      // Un único resultado: abre su ficha (tras soltar Enter, para que no «pulse» el botón de cerrar)
      if (list.length === 1) setTimeout(() => openSheet(list[0].id), 50);
    });

    const menu = $("#menu");
    $("#menuBtn").addEventListener("click", () => { renderControls(); menu.showModal(); });
    menu.addEventListener("click", async (e) => {
      const b = e.target.closest("button[data-action]"); if (!b) return;
      const a = b.dataset.action;
      if (a === "close") menu.close();
      if (a === "offline") { menu.close(); prepareOffline(); }
      if (a === "wantlist") { menu.close(); openWantList(); }
      if (a === "summary") { menu.close(); openSummary(); }
      if (a === "share") {
        const url = `${location.origin}${location.pathname}#c=${encodeOwned()}`;
        try {
          if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) await navigator.share({ title: "Mi colección Base Set 2", url });
          else { await navigator.clipboard.writeText(url); showToast("Enlace copiado"); }
        } catch { prompt("Copia este enlace:", url); }
        menu.close();
      }
      if (a === "export") {
        const blob = new Blob([JSON.stringify({ app: "bs2-tracker", version: 2, exportedAt: new Date().toISOString(), ...snapshot() }, null, 1)], { type: "application/json" });
        const link = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `base-set-2-coleccion-${today()}.json` });
        link.click(); URL.revokeObjectURL(link.href); menu.close();
      }
      if (a === "import") $("#importFile").click();
      if (a === "grayscale") { S().grayscale = !S().grayscale; save(); render(); }
      if (a === "markAll") {
        const list = visibleCards();
        if (confirm(`¿Marcar ${list.length} cartas visibles como conseguidas?`)) {
          list.forEach((c) => setOwned(c.id, true));
          save(); render(); menu.close();
        }
      }
      if (a === "reset" && confirm("¿Seguro que quieres borrar toda tu colección? (Exporta antes una copia)")) {
        state.owned = {}; state.meta = {}; save(); render(); menu.close();
      }
    });
    $("#importFile").addEventListener("change", async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        const owned = data.owned || data;
        const valid = Object.keys(owned).filter((id) => tiles.has(id));
        if (!valid.length && !data.wish) throw new Error("vacío");
        state.owned = Object.fromEntries(valid.map((id) => [id, owned[id] || Date.now()]));
        if (data.meta) state.meta = data.meta;
        if (data.wish) state.wish = data.wish;
        save(); render(); showToast(`Importadas ${valid.length} cartas`);
      } catch { alert("El archivo no es una copia válida."); }
      e.target.value = ""; $("#menu").close();
    });
  }

  // ---------- Compartir colección en la URL (bits por carta) ----------
  function encodeOwned() {
    const bytes = new Uint8Array(Math.ceil(state.cards.length / 8));
    state.cards.forEach((c, i) => { if (state.owned[c.id]) bytes[i >> 3] |= 1 << (i & 7); });
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function decodeOwned(s) {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    const out = {};
    state.cards.forEach((c, i) => { if ((bin.charCodeAt(i >> 3) || 0) & (1 << (i & 7))) out[c.id] = Date.now(); });
    return out;
  }
  function checkHashImport() {
    const m = location.hash.match(/c=([\w-]+)/);
    if (!m) return;
    try {
      const incoming = decodeOwned(m[1]);
      const n = Object.keys(incoming).length;
      if (confirm(`Este enlace contiene una colección con ${n} cartas. ¿Reemplazar la colección guardada en este dispositivo?`)) {
        state.owned = incoming; save();
      }
    } catch { /* hash inválido */ }
    history.replaceState(null, "", location.pathname);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  }

  // ---------- Arranque ----------
  async function init() {
    load();
    const [cards, prices] = await Promise.all([
      fetch("data/cards.json").then((r) => r.json()),
      fetch("data/prices.json", { cache: "no-cache" }).then((r) => r.json()).catch(() => ({ cards: {} })),
    ]);
    state.cards = cards.cards;
    state.byId = new Map(state.cards.map((c) => [c.id, c]));
    state.prices = prices && prices.cards ? prices : { cards: {} };
    checkHashImport();
    buildGrid();
    setupControls();
    setupGridGestures();
    renderPricesInfo();
    renderNet();
    render();
    renderSaveState();
    if (S().fair) keepAwake(true);
    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  }
  init().catch((err) => {
    console.error(err);
    $("#progressText").textContent = "Error cargando datos";
  });
})();
