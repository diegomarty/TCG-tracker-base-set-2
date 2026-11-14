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

  const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
  const fmt = (v) => (v == null ? "–" : eur.format(v));

  // ---------- Estado ----------
  const state = {
    cards: [],
    prices: { cards: {} },
    owned: {},
    settings: { cond: "nm", filter: "all", sort: "num", cats: [], grayscale: true, query: "" },
  };

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
      state.owned = saved.owned || {};
      Object.assign(state.settings, saved.settings || {}, { query: "" });
    } catch { /* almacenamiento no disponible */ }
  }
  function save() {
    try {
      const { query, ...settings } = state.settings;
      localStorage.setItem(STORE_KEY, JSON.stringify({ owned: state.owned, settings }));
    } catch { /* ignorar */ }
  }

  const category = (c) =>
    c.supertype === "Trainer" ? "trainer"
    : c.supertype === "Energy" ? "energy"
    : c.rarity === "Rare Holo" ? "holo"
    : c.rarity === "Rare" ? "rare"
    : c.rarity === "Uncommon" ? "uncommon" : "common";

  // Precio para la condición elegida. Prioridad: scraping Cardmarket -> tendencia (API).
  function priceOf(card, cond = state.settings.cond) {
    const p = state.prices.cards[card.id];
    if (!p) return null;
    const cm = p.cm || {};
    const exact = cm[cond] && cm[cond].from;
    if (exact != null) return { value: exact, approx: false };
    if (cond === "ex" && cm.exPlusFrom != null) return { value: cm.exPlusFrom, approx: true };
    const api = p.api || {};
    const t = cm.trend ?? api.trend ?? api.avg30 ?? (cond === "ex" ? api.lowExPlus : null);
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

  function visibleCards() {
    const { filter, cats, query, sort } = state.settings;
    const q = query.trim().toLowerCase();
    let list = state.cards.filter((c) => {
      if (filter === "owned" && !state.owned[c.id]) return false;
      if (filter === "missing" && state.owned[c.id]) return false;
      if (cats.length && !cats.includes(category(c))) return false;
      if (q && !(c.name.toLowerCase().includes(q) || String(c.number) === q)) return false;
      return true;
    });
    const pv = (c) => (priceOf(c) || {}).value;
    if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name, "es"));
    else if (sort === "priceDesc") list.sort((a, b) => (pv(b) ?? -1) - (pv(a) ?? -1));
    else if (sort === "priceAsc") list.sort((a, b) => (pv(a) ?? 1e9) - (pv(b) ?? 1e9));
    else list.sort((a, b) => a.number - b.number);
    return list;
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
    $$("#chips .chip").forEach((b) => b.setAttribute("aria-pressed", s.cats.includes(b.dataset.cat)));
    $("#sort").value = s.sort;
    $("#grayState").textContent = s.grayscale ? "Activado" : "Desactivado";
  }

  function renderPricesInfo() {
    const p = state.prices;
    const parts = [];
    if (p.updatedAt) parts.push(`Precios Cardmarket (${p.language === 1 || !p.language ? "inglés" : "idioma " + p.language}) actualizados el ${new Date(p.updatedAt).toLocaleDateString("es-ES")}.`);
    else if (p.apiUpdatedAt) parts.push(`Solo hay precios de tendencia de Cardmarket (vía pokemontcg.io) del ${new Date(p.apiUpdatedAt).toLocaleDateString("es-ES")}.`);
    else parts.push("Aún no hay precios descargados. Ejecuta la acción «Actualizar precios Cardmarket» en GitHub.");
    parts.push("«~» = precio aproximado (tendencia), no hay ofertas en esa condición.");
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
      if (e.target.closest(".info")) return;
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
  function cmUrl(base, cond) {
    if (!base) return null;
    const u = new URL(base);
    u.searchParams.set("language", state.prices.language || 1);
    u.searchParams.set("minCondition", cond === "nm" ? 2 : 3);
    return u.toString();
  }
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
    const trend = cm.trend ?? api.trend;
    const searchUrl = `https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=${encodeURIComponent(c.name + " Base Set 2")}`;
    const nmUrl = cmUrl(p.url, "nm"), exUrl = cmUrl(p.url, "ex");
    const ref = [
      ["Tendencia Cardmarket", trend],
      ["Media 30 días", cm.avg30 ?? api.avg30],
      ["Media 7 días", cm.avg7 ?? api.avg7],
      ["Desde (EX o mejor)", cm.exPlusFrom ?? api.lowExPlus],
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
      <p class="small muted" style="margin:0 0 10px">${p.scrapedAt ? "Precios del " + new Date(p.scrapedAt).toLocaleDateString("es-ES") : api.updatedAt ? "Tendencia del " + api.updatedAt : "Sin precios todavía"}</p>
      <div class="links">
        ${nmUrl ? `<a href="${nmUrl}" target="_blank" rel="noopener">Cardmarket NM ↗</a><a href="${exUrl}" target="_blank" rel="noopener">Cardmarket EX+ ↗</a>`
                : `<a href="${searchUrl}" target="_blank" rel="noopener">Buscar en Cardmarket ↗</a>`}
      </div>
      <button type="button" class="big-btn ${owned ? "owned" : ""}" id="sheetToggle">${owned ? "✓ La tengo · toca para quitar" : "Marcar como conseguida"}</button>`;
    $("#sheetToggle").onclick = () => toggle(id, { fromSheet: true });
    if (!sheet.open) sheet.showModal();
  }
  $("#sheetClose").addEventListener("click", () => sheet.close());
  for (const d of [sheet, $("#menu")]) {
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
    $("#chips").innerHTML = CATEGORIES.map((c) => `<button type="button" class="chip" data-cat="${c.key}" aria-pressed="false">${c.label}</button>`).join("");
    $("#chips").addEventListener("click", (e) => {
      const b = e.target.closest(".chip"); if (!b) return;
      const cats = state.settings.cats;
      const i = cats.indexOf(b.dataset.cat);
      if (i >= 0) cats.splice(i, 1); else cats.push(b.dataset.cat);
      save(); render();
    });
    $$(".cond-toggle button").forEach((b) => b.addEventListener("click", () => { state.settings.cond = b.dataset.cond; save(); render(); }));
    $$(".segmented button").forEach((b) => b.addEventListener("click", () => { state.settings.filter = b.dataset.filter; save(); render(); window.scrollTo({ top: 0 }); }));
    $("#sort").addEventListener("change", (e) => { state.settings.sort = e.target.value; save(); render(); });
    let t;
    $("#search").addEventListener("input", (e) => { clearTimeout(t); t = setTimeout(() => { state.settings.query = e.target.value; render(); }, 120); });

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
    if ("serviceWorker" in navigator && location.protocol === "https:") {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  }
  init().catch((err) => {
    console.error(err);
    $("#progressText").textContent = "Error cargando datos";
  });
})();
