/* Base Set 2 tracker — sin dependencias. La colección se guarda en localStorage. */
(() => {
  "use strict";

  const STORE_KEY = "bs2-tracker-v1";
  const LONG_PRESS_MS = 450;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  const CATEGORIES = [
    { key: "holo", label: "Holo" },
    { key: "rare", label: "Rara" },
    { key: "uncommon", label: "Infrecuente" },
    { key: "common", label: "Común" },
    { key: "trainer", label: "Entrenador" },
    { key: "energy", label: "Energía" },
  ];
  const RARITY_ES = { "Rare Holo": "Holo rara", Rare: "Rara", Uncommon: "Infrecuente", Common: "Común" };
  const CAT_ORDER = { holo: 0, rare: 1, uncommon: 2, common: 3, trainer: 4, energy: 5 };
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
    { key: "recent", label: "Marcadas recientemente", short: "Recientes" },
    { key: "trendUp", label: "Suben de precio (7 días vs 30)", short: "Suben" },
    { key: "trendDown", label: "Bajan de precio (7 días vs 30)", short: "Bajan" },
  ];

  const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
  const fmt = (v) => (v == null ? "–" : eur.format(v));

  // ---------- Estado ----------
  const state = {
    cards: [],
    prices: { cards: {} },
    owned: {},
    settings: { cond: "nm", filter: "all", sort: "num", cats: [], types: [], price: "any", density: "m", grayscale: true, query: "" },
  };

  // Se guarda en localStorage (clave principal + copia de seguridad) en cada cambio.
  const BACKUP_KEY = STORE_KEY + "-backup";
  let storageOk = true;
  function readKey(k) {
    try { const v = JSON.parse(localStorage.getItem(k) || "null"); return v && typeof v === "object" ? v : null; }
    catch { return null; }
  }
  function load() {
    const saved = readKey(STORE_KEY) || readKey(BACKUP_KEY) || {};
    state.owned = saved.owned || {};
    Object.assign(state.settings, saved.settings || {}, { query: "" });
    if (!SORTS.some((x) => x.key === state.settings.sort)) state.settings.sort = "num";
    if (!Array.isArray(state.settings.types)) state.settings.types = [];
  }
  function save() {
    const { query, ...settings } = state.settings;
    const data = JSON.stringify({ owned: state.owned, settings, savedAt: Date.now() });
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
    const el = document.getElementById("saveState");
    if (!el) return;
    el.textContent = storageOk
      ? `✓ Colección guardada en este dispositivo (${Object.keys(state.owned).length} cartas)`
      : "⚠️ Este navegador no permite guardar: exporta una copia desde el menú ⋯";
  }
  // Pide al navegador que no borre los datos automáticamente (Safari/Chrome)
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  window.addEventListener("pagehide", () => save());
  // Sincroniza si la colección cambia en otra pestaña
  window.addEventListener("storage", (e) => {
    if (e.key !== STORE_KEY || !e.newValue) return;
    try { state.owned = JSON.parse(e.newValue).owned || {}; render(); } catch { /* ignorar */ }
  });

  const category = (c) =>
    c.supertype === "Trainer" ? "trainer"
    : c.supertype === "Energy" ? "energy"
    : c.rarity === "Rare Holo" ? "holo"
    : c.rarity === "Rare" ? "rare"
    : c.rarity === "Uncommon" ? "uncommon" : "common";
  const typeOf = (c) => (c.types && c.types[0]) || "none";
  // Variación 7 días vs 30 días (en %), de la guía oficial
  function trendDelta(c) {
    const g = (state.prices.cards[c.id] || {}).guide || {};
    return g.avg7 != null && g.avg30 ? (g.avg7 - g.avg30) / g.avg30 : null;
  }

  // Precio para la condición elegida. Prioridad: scraping Cardmarket -> tendencia (API).
  function priceOf(card, cond = state.settings.cond) {
    const p = state.prices.cards[card.id];
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

  // ---------- Render ----------
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
    const card = li.firstElementChild;
    const owned = !!state.owned[c.id];
    card.classList.toggle("owned", owned);
    card.setAttribute("aria-pressed", owned);
    const pe = $(".price", li);
    const p = priceOf(c);
    pe.textContent = p ? (p.approx ? "~" : "") + fmt(p.value) : "";
    pe.classList.toggle("approx", !!(p && p.approx));
  }

  // Enlace a Cardmarket con filtros: inglés + condición mínima según NM/EX elegido
  function cardmarketUrl(c, cond = state.settings.cond) {
    const base = (state.prices.cards[c.id] || {}).url;
    if (!base) return `https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=${encodeURIComponent(c.name + " Base Set 2")}`;
    const u = new URL(base);
    u.searchParams.set("language", state.prices.language || 1);
    u.searchParams.set("minCondition", cond === "nm" ? 2 : 3);
    return u.toString();
  }

  function activeFilterCount() {
    const s = state.settings;
    return s.cats.length + s.types.length + (s.price !== "any" ? 1 : 0);
  }

  function filterCards({ ignoreOwned = false } = {}) {
    const { filter, cats, types, price, query } = state.settings;
    const q = query.trim().toLowerCase();
    const range = PRICE_RANGES.find((r) => r.key === price) || PRICE_RANGES[0];
    return state.cards.filter((c) => {
      if (!ignoreOwned) {
        if (filter === "owned" && !state.owned[c.id]) return false;
        if (filter === "missing" && state.owned[c.id]) return false;
      }
      if (cats.length && !cats.includes(category(c))) return false;
      if (types.length && !types.includes(typeOf(c))) return false;
      if (range.key !== "any") {
        const v = (priceOf(c) || {}).value;
        if (v == null || v < range.min || v >= range.max) return false;
      }
      if (q && !(c.name.toLowerCase().includes(q) || String(c.number) === q.replace(/^#/, ""))) return false;
      return true;
    });
  }

  function visibleCards() {
    const list = filterCards();
    const pv = (c) => (priceOf(c) || {}).value;
    const by = {
      num: (a, b) => a.number - b.number,
      numDesc: (a, b) => b.number - a.number,
      priceDesc: (a, b) => (pv(b) ?? -1) - (pv(a) ?? -1),
      priceAsc: (a, b) => (pv(a) ?? 1e9) - (pv(b) ?? 1e9),
      name: (a, b) => a.name.localeCompare(b.name, "es"),
      nameDesc: (a, b) => b.name.localeCompare(a.name, "es"),
      rarity: (a, b) => CAT_ORDER[category(a)] - CAT_ORDER[category(b)] || (pv(b) ?? 0) - (pv(a) ?? 0),
      type: (a, b) => (TYPE_ES[typeOf(a)] || "").localeCompare(TYPE_ES[typeOf(b)] || "", "es") || a.number - b.number,
      recent: (a, b) => (state.owned[b.id] || 0) - (state.owned[a.id] || 0) || a.number - b.number,
      trendUp: (a, b) => (trendDelta(b) ?? -9) - (trendDelta(a) ?? -9),
      trendDown: (a, b) => (trendDelta(a) ?? 9) - (trendDelta(b) ?? 9),
    };
    return list.sort(by[state.settings.sort] || by.num);
  }

  function render() {
    const list = visibleCards();
    // Reordenar los nodos existentes (rápido; no recrea imágenes)
    const frag = document.createDocumentFragment();
    const shown = new Set(list.map((c) => c.id));
    for (const c of list) frag.appendChild(tiles.get(c.id));
    for (const [id, li] of tiles) li.hidden = !shown.has(id);
    grid.prepend(frag);
    for (const c of state.cards) paintTile(c);
    $("#empty").hidden = list.length > 0;
    grid.dataset.density = state.settings.density;
    renderResultBar(list);
    document.body.classList.toggle("grayscale", state.settings.grayscale);
    renderControls();
    renderStats();
  }

  function renderStats() {
    const total = state.cards.length;
    const ownedCards = state.cards.filter((c) => state.owned[c.id]);
    const n = ownedCards.length;
    const pct = total ? Math.round((n / total) * 100) : 0;
    $("#progressText").textContent = `${n} de ${total} cartas · ${pct}%`;
    $("#progressBar").style.width = `${(n / total) * 100}%`;
    let have = 0, miss = 0, unknown = 0;
    for (const c of state.cards) {
      const p = priceOf(c);
      if (!p) { unknown++; continue; }
      if (state.owned[c.id]) have += p.value; else miss += p.value;
    }
    $("#ownedValue").textContent = fmt(have);
    $("#missingValue").textContent = fmt(miss);
    $("#totalValue").textContent = fmt(have + miss);
    $("#countAll").textContent = total;
    $("#countOwned").textContent = n;
    $("#countMissing").textContent = total - n;
  }

  function renderControls() {
    const s = state.settings;
    $$(".cond-toggle button").forEach((b) => b.setAttribute("aria-checked", b.dataset.cond === s.cond));
    $$(".segmented button").forEach((b) => b.setAttribute("aria-selected", b.dataset.filter === s.filter));
    $("#grayState").textContent = s.grayscale ? "Activado" : "Desactivado";
    const n = activeFilterCount();
    const fc = $("#filtersCount");
    fc.hidden = !n; fc.textContent = n;
    $("#filtersBtn").classList.toggle("on", n > 0);
    $("#sortBtn").classList.toggle("on", s.sort !== "num");
    $("#clearSearch").hidden = !s.query;
  }

  function renderResultBar(list) {
    const s = state.settings;
    const total = state.cards.length;
    const sum = list.reduce((acc, c) => acc + ((priceOf(c) || {}).value || 0), 0);
    $("#resultCount").textContent = `${list.length === total ? "Todas las" : list.length} ${list.length === 1 ? "carta" : "cartas"}` +
      (list.length ? ` · ${fmt(sum)}` : "");
    const sort = SORTS.find((x) => x.key === s.sort);
    $("#sortLabel").textContent = `Orden: ${sort ? sort.short : "Nº"}`;
    const chips = [];
    if (s.query) chips.push({ label: `“${s.query}”`, clear: () => { s.query = ""; $("#search").value = ""; } });
    s.cats.forEach((k) => chips.push({ label: CATEGORIES.find((c) => c.key === k).label, clear: () => s.cats.splice(s.cats.indexOf(k), 1) }));
    s.types.forEach((k) => chips.push({ label: TYPE_ES[k], clear: () => s.types.splice(s.types.indexOf(k), 1) }));
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

  function clearFilters() {
    const s = state.settings;
    s.cats = []; s.types = []; s.price = "any"; s.query = "";
    $("#search").value = "";
  }

  function fmtDate(iso) {
    const d = new Date(String(iso).replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
    return isNaN(d) ? String(iso).slice(0, 10) : d.toLocaleDateString("es-ES");
  }
  function renderPricesInfo() {
    const p = state.prices;
    const parts = [];
    if (p.guideCreatedAt) parts.push(`Guía oficial de precios de Cardmarket del ${fmtDate(p.guideCreatedAt)} (se actualiza a diario).`);
    if (p.updatedAt) parts.push(`Precios Cardmarket (${p.language === 1 || !p.language ? "inglés" : "idioma " + p.language}) actualizados el ${new Date(p.updatedAt).toLocaleDateString("es-ES")}.`);
    else if (p.apiUpdatedAt && !p.guideCreatedAt) parts.push(`Solo hay precios de tendencia de Cardmarket (vía pokemontcg.io) del ${new Date(p.apiUpdatedAt).toLocaleDateString("es-ES")}.`);
    else parts.push("Aún no hay precios descargados. Ejecuta la acción «Actualizar precios Cardmarket» en GitHub.");
    parts.push("«~» = tendencia de Cardmarket (todas las condiciones); sin «~» = precio real NM/EX.");
    $("#pricesInfo").textContent = parts.join(" ");
  }

  // ---------- Acciones ----------
  let undo = null;
  function toggle(id, { fromSheet = false } = {}) {
    const c = state.cards.find((x) => x.id === id);
    const was = !!state.owned[id];
    if (was) delete state.owned[id]; else state.owned[id] = Date.now();
    save();
    if (navigator.vibrate) navigator.vibrate(was ? 8 : 15);
    const card = tiles.get(id).firstElementChild;
    card.classList.remove("pop"); void card.offsetWidth; card.classList.add("pop");
    // Si el filtro oculta la carta, no la quitamos al instante para no "saltar"
    paintTile(c);
    renderStats();
    if (fromSheet) openSheet(id);
    showToast(`${was ? "Quitada" : "Marcada"}: ${c.name}`, () => {
      if (was) state.owned[id] = Date.now(); else delete state.owned[id];
      save(); render();
    });
  }

  let toastTimer;
  function showToast(text, onUndo) {
    const t = $("#toast");
    $("#toastText").textContent = text;
    const btn = $("#toastAction");
    btn.hidden = !onUndo;
    undo = onUndo;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; undo = null; }, 3500);
  }
  $("#toastAction").addEventListener("click", () => {
    if (undo) undo();
    undo = null;
    $("#toast").hidden = true;
  });

  // Toque = marcar · Pulsación larga o botón "i" = detalles
  function setupGridGestures() {
    let timer = null, startX = 0, startY = 0, longFired = false, activeId = null;
    const idFrom = (e) => e.target.closest("li")?.dataset.id;

    grid.addEventListener("pointerdown", (e) => {
      const id = idFrom(e);
      if (!id || e.button > 0) return;
      activeId = id; longFired = false; startX = e.clientX; startY = e.clientY;
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
  function priceBox(label, key, data, fallback) {
    const active = state.settings.cond === key ? " active" : "";
    if (!data) {
      return `<div class="pbox${active}"><h3>${label}</h3><div class="big">${fallback != null ? "~" + fmt(fallback) : "–"}</div>
        <p class="small muted" style="margin:4px 0 0">${fallback != null ? "Aprox. (tendencia)" : "Sin datos"}</p></div>`;
    }
    return `<div class="pbox${active}"><h3>${label}</h3><div class="big">${fmt(data.from)}</div>
      <dl><dt>Media 5 más bar.</dt><dd>${fmt(data.avg5)}</dd>
      <dt>Mediana (10)</dt><dd>${fmt(data.median)}</dd>
      <dt>Ofertas vistas</dt><dd>${data.offers}</dd></dl></div>`;
  }
  function openSheet(id) {
    const c = state.cards.find((x) => x.id === id);
    const p = state.prices.cards[id] || {};
    const cm = p.cm || {};
    const api = p.api || {};
    const owned = !!state.owned[id];
    const g = p.guide || {};
    const trend = g.trend ?? cm.trend ?? api.trend;
    const searchUrl = `https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=${encodeURIComponent(c.name + " Base Set 2")}`;
    const nmUrl = p.url ? cardmarketUrl(c, "nm") : null, exUrl = p.url ? cardmarketUrl(c, "ex") : null;
    const ref = [
      ["Tendencia Cardmarket", trend],
      ["Media venta (ayer)", g.avg1],
      ["Media 7 días", g.avg7 ?? cm.avg7 ?? api.avg7],
      ["Media 30 días", g.avg30 ?? cm.avg30 ?? api.avg30],
      ["Precio medio en venta", g.avg],
      ["Desde (cualquier estado)", g.low],
      ["Desde (EX o mejor)", cm.exPlusFrom],
    ].filter(([, v]) => v != null);
    $("#sheetBody").innerHTML = `
      <div class="detail-head">
        <img src="${c.imgLarge}" alt="${escapeHtml(c.name)}" onerror="this.src='${c.img}'">
        <div>
          <h2 id="sheetTitle">${escapeHtml(c.name)}</h2>
          <p class="muted" style="margin:0 0 8px">Nº ${c.number}/130</p>
          <span class="badge ${c.rarity === "Rare Holo" ? "holo" : ""}">${RARITY_ES[c.rarity] || c.supertype}</span>
          ${c.supertype !== "Pokémon" ? `<span class="badge">${c.supertype === "Trainer" ? "Entrenador" : "Energía"}</span>` : ""}
          ${(c.types || []).map((t) => `<span class="badge">${t}</span>`).join("")}
        </div>
      </div>
      <div class="price-boxes">
        ${priceBox("Near Mint", "nm", cm.nm, trend)}
        ${priceBox("Excellent", "ex", cm.ex, cm.exPlusFrom ?? trend)}
      </div>
      ${ref.length ? `<div class="ref">${ref.map(([k, v]) => `<span class="muted">${k}</span><span>${fmt(v)}</span>`).join("")}</div>` : ""}
      <p class="small muted" style="margin:0 0 10px">${[p.scrapedAt && "NM/EX del " + fmtDate(p.scrapedAt), p.guide && state.prices.guideCreatedAt && "Guía oficial Cardmarket del " + fmtDate(state.prices.guideCreatedAt), !p.guide && api.updatedAt && "Tendencia del " + api.updatedAt].filter(Boolean).join(" · ") || "Sin precios todavía"}</p>
      ${nmUrl ? cmButtons(c) : `<div class="links"><a href="${searchUrl}" target="_blank" rel="noopener">Buscar en Cardmarket ↗</a></div>`}
      <button type="button" class="big-btn ${owned ? "owned" : ""}" id="sheetToggle">${owned ? "✓ La tengo · toca para quitar" : "Marcar como conseguida"}</button>`;
    $("#sheetToggle").onclick = () => toggle(id, { fromSheet: true });
    if (!sheet.open) sheet.showModal();
  }
  $("#sheetClose").addEventListener("click", () => sheet.close());

  // ---------- Cardmarket: elegir NM o EX ----------
  function cmButtons(c) {
    const p = state.prices.cards[c.id] || {};
    const cm = p.cm || {};
    const opt = (cond, title, sub) => {
      const pr = priceOf(c, cond);
      return `<a class="cm-opt ${state.settings.cond === cond ? "pref" : ""}" href="${cardmarketUrl(c, cond)}" target="_blank" rel="noopener" data-cond="${cond}">
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
    const c = state.cards.find((x) => x.id === id);
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

  // ---------- Hojas de filtros y orden ----------
  const filtersSheet = $("#filtersSheet");
  const sortSheet = $("#sortSheet");
  function chip(attr, key, label, on, extra = "") {
    return `<button type="button" class="chip" data-${attr}="${key}" aria-pressed="${on}">${extra}${label}</button>`;
  }
  function renderFiltersSheet() {
    const s = state.settings;
    const counts = (fn) => state.cards.reduce((m, c) => (m[fn(c)] = (m[fn(c)] || 0) + 1, m), {});
    const cc = counts(category), tc = counts(typeOf);
    $("#fCats").innerHTML = CATEGORIES.map((c) => chip("cat", c.key, `${c.label} <span class="n">${cc[c.key] || 0}</span>`, s.cats.includes(c.key))).join("");
    $("#fTypes").innerHTML = TYPES.filter((t) => tc[t.key]).map((t) =>
      chip("type", t.key, `${t.label} <span class="n">${tc[t.key]}</span>`, s.types.includes(t.key), `<i class="dot" style="background:${t.color}"></i>`)).join("");
    $("#fPrice").innerHTML = PRICE_RANGES.map((r) => chip("price", r.key, r.label, s.price === r.key)).join("");
    $("#fPriceCond").textContent = `(${s.cond.toUpperCase()})`;
    $("#fDensity").innerHTML = DENSITIES.map((d) => chip("density", d.key, d.label, s.density === d.key)).join("");
    const n = filterCards().length;
    $("#filtersApply").textContent = n ? `Ver ${n} ${n === 1 ? "carta" : "cartas"}` : "Ninguna carta";
  }
  filtersSheet.addEventListener("click", (e) => {
    const b = e.target.closest(".chip"); if (!b) return;
    const s = state.settings;
    const tog = (arr, k) => { const i = arr.indexOf(k); if (i >= 0) arr.splice(i, 1); else arr.push(k); };
    if (b.dataset.cat) tog(s.cats, b.dataset.cat);
    if (b.dataset.type) tog(s.types, b.dataset.type);
    if (b.dataset.price) s.price = b.dataset.price;
    if (b.dataset.density) s.density = b.dataset.density;
    save(); render(); renderFiltersSheet();
  });
  $("#filtersApply").addEventListener("click", () => { filtersSheet.close(); window.scrollTo({ top: 0 }); });
  $("#filtersClear").addEventListener("click", () => { clearFilters(); save(); render(); renderFiltersSheet(); });
  $("#emptyClear").addEventListener("click", () => { clearFilters(); state.settings.filter = "all"; save(); render(); });

  function renderSortSheet() {
    $("#sortList").innerHTML = SORTS.map((o) =>
      `<button type="button" role="radio" aria-checked="${state.settings.sort === o.key}" data-sort="${o.key}">${o.label}</button>`).join("");
  }
  sortSheet.addEventListener("click", (e) => {
    const b = e.target.closest("[data-sort]"); if (!b) return;
    state.settings.sort = b.dataset.sort;
    save(); render(); renderSortSheet();
    setTimeout(() => sortSheet.close(), 120);
    window.scrollTo({ top: 0 });
  });

  for (const d of [sheet, $("#menu"), cmSheet, filtersSheet, sortSheet]) {
    d.addEventListener("click", (e) => { if (e.target === d) d.close(); }); // tocar fondo cierra
    setupSwipeToClose(d);
  }
  function setupSwipeToClose(d) {
    let y0 = null;
    d.addEventListener("touchstart", (e) => { y0 = d.scrollTop <= 0 ? e.touches[0].clientY : null; }, { passive: true });
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
    $("#clearSearch").addEventListener("click", () => { state.settings.query = ""; $("#search").value = ""; render(); $("#search").focus(); });
    $$(".cond-toggle button").forEach((b) => b.addEventListener("click", () => { state.settings.cond = b.dataset.cond; save(); render(); }));
    $$(".segmented button").forEach((b) => b.addEventListener("click", () => { state.settings.filter = b.dataset.filter; save(); render(); window.scrollTo({ top: 0 }); }));
    let t;
    $("#search").addEventListener("input", (e) => { clearTimeout(t); t = setTimeout(() => { state.settings.query = e.target.value; render(); }, 120); });
    $("#search").addEventListener("keydown", (e) => { if (e.key === "Enter") e.target.blur(); });

    const menu = $("#menu");
    $("#menuBtn").addEventListener("click", () => { renderControls(); menu.showModal(); });
    menu.addEventListener("click", async (e) => {
      const b = e.target.closest("button[data-action]"); if (!b) return;
      const a = b.dataset.action;
      if (a === "close") menu.close();
      if (a === "share") {
        const url = `${location.origin}${location.pathname}#c=${encodeOwned()}`;
        try {
          if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) await navigator.share({ title: "Mi colección Base Set 2", url });
          else { await navigator.clipboard.writeText(url); showToast("Enlace copiado"); }
        } catch { prompt("Copia este enlace:", url); }
        menu.close();
      }
      if (a === "export") {
        const blob = new Blob([JSON.stringify({ app: "bs2-tracker", exportedAt: new Date().toISOString(), owned: state.owned }, null, 1)], { type: "application/json" });
        const link = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `base-set-2-coleccion-${new Date().toISOString().slice(0, 10)}.json` });
        link.click(); URL.revokeObjectURL(link.href); menu.close();
      }
      if (a === "import") $("#importFile").click();
      if (a === "grayscale") { state.settings.grayscale = !state.settings.grayscale; save(); render(); }
      if (a === "markAll") {
        const list = visibleCards();
        if (confirm(`¿Marcar ${list.length} cartas visibles como conseguidas?`)) {
          list.forEach((c) => { state.owned[c.id] = state.owned[c.id] || Date.now(); });
          save(); render(); menu.close();
        }
      }
      if (a === "reset" && confirm("¿Seguro que quieres borrar toda tu colección? (Exporta antes una copia)")) {
        state.owned = {}; save(); render(); menu.close();
      }
    });
    $("#importFile").addEventListener("change", async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        const owned = data.owned || data;
        const valid = Object.keys(owned).filter((id) => tiles.has(id));
        if (!valid.length) throw new Error("vacío");
        state.owned = Object.fromEntries(valid.map((id) => [id, owned[id] || Date.now()]));
        save(); render(); showToast(`Importadas ${valid.length} cartas`);
      } catch { alert("El archivo no es una copia válida."); }
      e.target.value = ""; menu.close();
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
    state.prices = prices && prices.cards ? prices : { cards: {} };
    checkHashImport();
    buildGrid();
    setupControls();
    setupGridGestures();
    renderPricesInfo();
    render();
    renderSaveState();
    if ("serviceWorker" in navigator && location.protocol === "https:") {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  }
  init().catch((err) => {
    console.error(err);
    $("#progressText").textContent = "Error cargando datos";
  });
})();
