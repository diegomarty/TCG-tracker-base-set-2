#!/usr/bin/env python3
"""
Descarga precios de Cardmarket para Base Set 2 (condiciones Near Mint y Excellent).

Diseñado para ir DESPACIO y no provocar un baneo:
  * 1 sola petición a Cardmarket por carta (la página de producto filtrada por
    idioma y condición mínima EX, de la que se separan las ofertas NM y EX).
  * Pausa aleatoria entre peticiones (por defecto 9-16 s) y pausas largas
    cada cierto número de cartas.
  * Backoff exponencial ante 429/403/5xx y abandono ordenado si Cardmarket
    sigue bloqueando (se guarda lo que haya).
  * Guardado incremental tras cada carta: si se corta, la siguiente ejecución
    continúa donde lo dejó (solo refresca entradas más viejas que --max-age).

Además se consultan (1 petición por cada 250 cartas) los datos públicos de la
API de pokemontcg.io, que incluyen la tendencia de Cardmarket y la URL del
producto. Sirven de respaldo si Cardmarket bloquea el scraping.

Uso:
    pip install -r scripts/requirements.txt
    python scripts/fetch_prices.py               # refresca lo caducado
    python scripts/fetch_prices.py --max-age 0   # refresca todo
    python scripts/fetch_prices.py --only 4,2,10 # solo esas cartas (por número)
"""
from __future__ import annotations

import argparse
import json
import os
import random
import re
import statistics
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode, urlsplit, urlunsplit

from bs4 import BeautifulSoup

try:  # curl_cffi imita la huella TLS de un navegador real (menos bloqueos de Cloudflare)
    from curl_cffi import requests as http

    IMPERSONATE = {"impersonate": "chrome"}
except ImportError:  # pragma: no cover - respaldo
    import requests as http  # type: ignore

    IMPERSONATE = {}

ROOT = Path(__file__).resolve().parent.parent
CARDS_FILE = ROOT / "data" / "cards.json"
PRICES_FILE = ROOT / "data" / "prices.json"
URLS_FILE = ROOT / "data" / "cardmarket_urls.json"
DEBUG_DIR = ROOT / ".debug"

SET_ID = "base4"
CM_BASE = "https://www.cardmarket.com/en/Pokemon/Products/Singles/Base-Set-2"
# Cardmarket: idioma 1 = inglés. Condiciones: 1 MT, 2 NM, 3 EX, 4 GD, 5 LP, 6 PL, 7 PO
CONDITION_CODES = {"MT": 1, "NM": 2, "EX": 3, "GD": 4, "LP": 5, "PL": 6, "PO": 7}

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
HEADERS = {
    "User-Agent": UA,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-GB,en;q=0.9,es;q=0.8",
}


def log(msg: str) -> None:
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def load_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def save_json(path: Path, data) -> None:
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    tmp.replace(path)


def parse_eur(text: str | None) -> float | None:
    """'1.234,56 €' -> 1234.56"""
    if not text:
        return None
    m = re.search(r"(\d{1,3}(?:[.\s]\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?)\s*€", text)
    if not m:
        return None
    raw = m.group(1).replace(".", "").replace(" ", "").replace(",", ".")
    try:
        return round(float(raw), 2)
    except ValueError:
        return None


class Blocked(Exception):
    pass


class Session:
    def __init__(self, min_delay: float, max_delay: float):
        self.s = http.Session()
        self.min_delay = min_delay
        self.max_delay = max_delay
        self.last = 0.0
        self.count = 0

    def _sleep(self):
        wait = random.uniform(self.min_delay, self.max_delay)
        # Cada ~15 peticiones, una pausa larga extra para parecer humano.
        if self.count and self.count % 15 == 0:
            wait += random.uniform(30, 60)
        elapsed = time.monotonic() - self.last
        if elapsed < wait:
            time.sleep(wait - elapsed)

    def get(self, url: str, *, polite: bool = True, allow_redirects: bool = True, retries: int = 4):
        backoff = 60.0
        for attempt in range(1, retries + 1):
            if polite:
                self._sleep()
            self.last = time.monotonic()
            self.count += 1
            try:
                r = self.s.get(url, headers=HEADERS, timeout=45, allow_redirects=allow_redirects, **IMPERSONATE)
            except Exception as e:  # red caída, timeout...
                log(f"  ! error de red ({e}); reintento {attempt}/{retries} en {backoff:.0f}s")
                time.sleep(backoff)
                backoff *= 2
                continue
            if r.status_code == 403:
                # Cloudflare / bloqueo: insistir solo empeora. Un reintento corto y abandonar.
                if attempt >= 2:
                    raise Blocked(f"HTTP 403 en {url}")
                log("  ! HTTP 403; espero 45s y pruebo una vez más")
                time.sleep(45)
                continue
            if r.status_code in (429, 503) or r.status_code >= 500:
                retry_after = r.headers.get("Retry-After")
                wait = float(retry_after) if retry_after and retry_after.isdigit() else backoff
                log(f"  ! HTTP {r.status_code}; espero {wait:.0f}s (intento {attempt}/{retries})")
                time.sleep(wait)
                backoff *= 2
                continue
            return r
        raise Blocked(f"Sin respuesta válida tras {retries} intentos: {url}")


# --------------------------------------------------------------------------- #
# pokemontcg.io (respaldo + URLs de producto)
# --------------------------------------------------------------------------- #
def fetch_api_prices(sess: Session) -> dict:
    url = f"https://api.pokemontcg.io/v2/cards?q=set.id:{SET_ID}&pageSize=250&select=id,number,cardmarket"
    headers = dict(HEADERS)
    if os.environ.get("POKEMONTCG_API_KEY"):
        headers["X-Api-Key"] = os.environ["POKEMONTCG_API_KEY"]
    for attempt in range(3):
        try:
            r = sess.s.get(url, headers=headers, timeout=60)
            if r.status_code == 200:
                data = r.json().get("data", [])
                log(f"pokemontcg.io: {len(data)} cartas con datos de Cardmarket")
                return {c["id"]: c.get("cardmarket") or {} for c in data}
            log(f"pokemontcg.io HTTP {r.status_code}")
        except Exception as e:
            log(f"pokemontcg.io error: {e}")
        time.sleep(20)
    return {}


def clean_url(url: str) -> str:
    parts = urlsplit(url)
    return urlunsplit((parts.scheme, parts.netloc, parts.path, "", ""))


def resolve_product_url(sess: Session, card: dict, api_cm: dict, urls: dict) -> str | None:
    cid = card["id"]
    if urls.get(cid):
        return urls[cid]
    redirect = api_cm.get("url")
    if redirect:
        try:
            # prices.pokemontcg.io redirige a la página del producto en Cardmarket
            r = sess.s.get(redirect, headers=HEADERS, timeout=30, allow_redirects=False)
            loc = r.headers.get("Location") or r.headers.get("location")
            if loc and "cardmarket.com" in loc:
                url = clean_url(loc)
                url = re.sub(r"cardmarket\.com/[a-z]{2}/", "cardmarket.com/en/", url)
                url = url.replace("://cardmarket.com", "://www.cardmarket.com")
                urls[cid] = url
                return url
        except Exception as e:
            log(f"  ! no pude resolver {redirect}: {e}")
    return None


# --------------------------------------------------------------------------- #
# Parseo de Cardmarket
# --------------------------------------------------------------------------- #
def parse_info_box(soup: BeautifulSoup) -> dict:
    info = {}
    keys = {
        "available items": "available",
        "from": "from",
        "price trend": "trend",
        "30-days average price": "avg30",
        "7-days average price": "avg7",
        "1-day average price": "avg1",
    }
    for dt in soup.select("dl dt"):
        label = dt.get_text(" ", strip=True).lower()
        dd = dt.find_next_sibling("dd")
        if not dd or label not in keys:
            continue
        val = dd.get_text(" ", strip=True)
        if keys[label] == "available":
            try:
                info["available"] = int(re.sub(r"\D", "", val) or 0)
            except ValueError:
                pass
        else:
            info[keys[label]] = parse_eur(val)
    return info


def row_condition(row) -> str | None:
    el = row.select_one(".article-condition")
    if el:
        badge = el.select_one(".badge")
        txt = (badge or el).get_text(strip=True).upper()
        if txt in CONDITION_CODES:
            return txt
        for cls in el.get("class", []):
            m = re.match(r"condition-([a-z]{2})$", cls)
            if m:
                return m.group(1).upper()
    for badge in row.select(".badge"):
        txt = badge.get_text(strip=True).upper()
        if txt in CONDITION_CODES:
            return txt
    return None


def row_price(row) -> float | None:
    for sel in (".price-container .color-primary", ".col-offer .color-primary", ".price-container", ".col-offer"):
        el = row.select_one(sel)
        if el:
            p = parse_eur(el.get_text(" ", strip=True))
            if p is not None:
                return p
    return parse_eur(row.get_text(" ", strip=True))


def row_qty(row) -> int:
    el = row.select_one(".item-count") or row.select_one(".amount-container")
    if el:
        m = re.search(r"\d+", el.get_text())
        if m:
            return int(m.group())
    return 1


def parse_offers(soup: BeautifulSoup) -> list[dict]:
    offers = []
    for row in soup.select(".article-row"):
        cond = row_condition(row)
        price = row_price(row)
        if cond and price is not None:
            offers.append({"cond": cond, "price": price, "qty": row_qty(row)})
    return offers


def summarize(prices: list[float]) -> dict | None:
    if not prices:
        return None
    prices = sorted(prices)
    cheapest = prices[:5]
    return {
        "from": prices[0],
        "avg5": round(statistics.mean(cheapest), 2),
        "median": round(statistics.median(prices[:10]), 2),
        "offers": len(prices),
    }


def scrape_card(sess: Session, url: str, language: int, debug: bool, cid: str) -> dict:
    query = urlencode({"language": language, "minCondition": CONDITION_CODES["EX"]})
    page = f"{url}?{query}"
    try:
        r = sess.get(page)
    except Blocked:
        raise
    html = r.text
    log(f"  GET {page} -> HTTP {r.status_code}, {len(html)} bytes")
    if debug:
        DEBUG_DIR.mkdir(exist_ok=True)
        (DEBUG_DIR / f"{cid}.html").write_text(html, encoding="utf-8")
    challenge = "cf-chl" in html or "challenge-platform" in html or "Just a moment..." in html
    if challenge and "article-row" not in html:
        raise Blocked("Desafío de Cloudflare")
    soup = BeautifulSoup(html, "html.parser")
    info = parse_info_box(soup)
    offers = parse_offers(soup)
    nm = [o["price"] for o in offers if o["cond"] in ("NM", "MT")]
    ex = [o["price"] for o in offers if o["cond"] == "EX"]
    if not offers and not info:
        raise ValueError("No se encontraron ofertas ni caja de precios (¿cambió el HTML?)")
    return {
        "nm": summarize(nm),
        "ex": summarize(ex),
        "exPlusFrom": info.get("from"),
        "trend": info.get("trend"),
        "avg30": info.get("avg30"),
        "avg7": info.get("avg7"),
        "available": info.get("available"),
    }


# --------------------------------------------------------------------------- #
# Guía de precios OFICIAL de Cardmarket (pública, se regenera a diario)
# --------------------------------------------------------------------------- #
IDS_FILE = ROOT / "data" / "cardmarket_ids.json"
PRICE_GUIDE_URL = "https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_6.json"  # 6 = Pokémon
GUIDE_FIELDS = ("avg", "low", "trend", "avg1", "avg7", "avg30")


def resolve_product_ids(sess: Session, cards: list[dict]) -> dict:
    """idProduct de Cardmarket de cada carta, vía la API pública de TCGdex (se cachea en el repo)."""
    ids = load_json(IDS_FILE, {})
    missing = [c for c in cards if c["id"] not in ids]
    if missing:
        log(f"TCGdex: buscando idProduct de {len(missing)} cartas")
    for c in missing:
        try:
            r = sess.s.get(f"https://api.tcgdex.net/v2/en/cards/{c['id']}", headers=HEADERS, timeout=30)
            if r.status_code == 200:
                pid = ((r.json().get("pricing") or {}).get("cardmarket") or {}).get("idProduct")
                if pid:
                    ids[c["id"]] = pid
        except Exception as e:
            log(f"  ! TCGdex {c['id']}: {e}")
        time.sleep(0.3)
    save_json(IDS_FILE, dict(sorted(ids.items(), key=lambda kv: int(kv[0].split("-")[1]))))
    log(f"idProduct conocidos: {len(ids)}/{len(cards)}")
    return ids


def fetch_price_guide(sess: Session, cards: list[dict], prices: dict) -> int:
    ids = resolve_product_ids(sess, cards)
    try:
        r = sess.s.get(PRICE_GUIDE_URL, headers=HEADERS, timeout=120)
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        log(f"No pude descargar la guía de precios de Cardmarket: {e}")
        return 0
    guide = {g["idProduct"]: g for g in data.get("priceGuides", [])}
    created = data.get("createdAt")
    n = 0
    for c in cards:
        g = guide.get(ids.get(c["id"]))
        if not g:
            continue
        entry = prices["cards"].setdefault(c["id"], {})
        entry["idProduct"] = ids[c["id"]]
        entry["guide"] = {k: g.get(k) for k in GUIDE_FIELDS}
        n += 1
    prices["guideCreatedAt"] = created
    prices["guideUpdatedAt"] = now_iso()
    log(f"Guía de precios oficial de Cardmarket ({created}): {n}/{len(cards)} cartas")
    return n


# --------------------------------------------------------------------------- #
def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-age", type=float, default=6, help="días antes de volver a pedir una carta (0 = todas)")
    ap.add_argument("--min-delay", type=float, default=9)
    ap.add_argument("--max-delay", type=float, default=16)
    ap.add_argument("--language", type=int, default=int(os.environ.get("CM_LANGUAGE", 1)), help="1 = inglés")
    ap.add_argument("--only", default="", help="números de carta separados por comas")
    ap.add_argument("--limit", type=int, default=0, help="máximo de cartas a pedir en esta ejecución")
    ap.add_argument("--time-budget", type=float, default=100, help="minutos máximos de ejecución")
    ap.add_argument("--no-scrape", action="store_true", help="no visitar páginas de Cardmarket (solo guía oficial + APIs)")
    ap.add_argument("--debug", action="store_true", help="guarda el HTML en .debug/")
    args = ap.parse_args()

    started = time.monotonic()
    cards = load_json(CARDS_FILE, {})["cards"]
    prices = load_json(PRICES_FILE, {"cards": {}})
    prices.setdefault("cards", {})
    urls = load_json(URLS_FILE, {})
    sess = Session(args.min_delay, args.max_delay)

    # 1) Guía de precios oficial de Cardmarket (diaria, todas las cartas, sin scraping)
    fetch_price_guide(sess, cards, prices)
    save_json(PRICES_FILE, prices)

    # 2) Respaldo: tendencias de Cardmarket vía pokemontcg.io (una sola petición)
    api = fetch_api_prices(sess)
    for card in cards:
        cm = api.get(card["id"]) or {}
        p = cm.get("prices") or {}
        if p:
            entry = prices["cards"].setdefault(card["id"], {})
            entry["api"] = {
                "trend": p.get("trendPrice"),
                "avg30": p.get("avg30"),
                "avg7": p.get("avg7"),
                "low": p.get("lowPrice"),
                "lowExPlus": p.get("lowPriceExPlus"),
                "avgSell": p.get("averageSellPrice"),
                "updatedAt": cm.get("updatedAt"),
            }
    prices["apiUpdatedAt"] = now_iso() if api else prices.get("apiUpdatedAt")
    save_json(PRICES_FILE, prices)

    if args.no_scrape:
        # Sin tocar Cardmarket: solo resolvemos las URLs de producto (vía prices.pokemontcg.io)
        for card in cards:
            if card["id"] not in urls and api.get(card["id"]):
                time.sleep(0.5)
            url = resolve_product_url(sess, card, api.get(card["id"], {}), urls)
            if url:
                prices["cards"].setdefault(card["id"], {})["url"] = url
        save_json(URLS_FILE, urls)
        save_json(PRICES_FILE, prices)
        log(f"URLs de Cardmarket conocidas: {len(urls)}/{len(cards)}")
        return 0

    # 2) Scraping lento de Cardmarket
    only = {int(x) for x in args.only.split(",") if x.strip()}
    cutoff = datetime.now(timezone.utc) - timedelta(days=args.max_age)
    todo = []
    for card in cards:
        if only and card["number"] not in only:
            continue
        ts = prices["cards"].get(card["id"], {}).get("scrapedAt")
        if args.max_age > 0 and ts and datetime.fromisoformat(ts) > cutoff:
            continue
        todo.append(card)
    # Primero las más antiguas / nunca descargadas
    todo.sort(key=lambda c: prices["cards"].get(c["id"], {}).get("scrapedAt") or "")
    if args.limit:
        todo = todo[: args.limit]
    log(f"Cartas a consultar en Cardmarket: {len(todo)}")

    ok = fail = 0
    consecutive_blocks = 0
    for i, card in enumerate(todo, 1):
        if (time.monotonic() - started) / 60 > args.time_budget:
            log("Tiempo agotado; continuaré en la próxima ejecución.")
            break
        label = f"#{card['number']} {card['name']}"
        url = resolve_product_url(sess, card, api.get(card["id"], {}), urls)
        save_json(URLS_FILE, urls)
        if not url:
            log(f"[{i}/{len(todo)}] {label}: sin URL de Cardmarket (añádela a data/cardmarket_urls.json)")
            fail += 1
            continue
        try:
            data = scrape_card(sess, url, args.language, args.debug, card["id"])
        except Blocked as e:
            consecutive_blocks += 1
            log(f"[{i}/{len(todo)}] {label}: BLOQUEADO ({e})")
            fail += 1
            if consecutive_blocks >= 2:
                log("Cardmarket está bloqueando. Paro para no empeorarlo; se reanudará en la próxima ejecución.")
                break
            time.sleep(180)
            continue
        except Exception as e:
            log(f"[{i}/{len(todo)}] {label}: error ({e})")
            fail += 1
            continue
        consecutive_blocks = 0
        entry = prices["cards"].setdefault(card["id"], {})
        entry.update({"url": url, "cm": data, "scrapedAt": now_iso()})
        prices["updatedAt"] = now_iso()
        save_json(PRICES_FILE, prices)
        ok += 1
        nm = (data.get("nm") or {}).get("from")
        ex = (data.get("ex") or {}).get("from")
        log(f"[{i}/{len(todo)}] {label}: NM desde {nm} € · EX desde {ex} € · tendencia {data.get('trend')} €")

    prices["language"] = args.language
    save_json(PRICES_FILE, prices)
    log(f"Hecho: {ok} OK, {fail} fallidas.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
