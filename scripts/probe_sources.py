"""Sonda de diagnóstico: comprueba qué fuentes de precios responden desde GitHub Actions."""
import json, urllib.request

def get(url, n=1500):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (bs2-tracker)", "Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=60) as r:
            body = r.read()
            print(f"\n=== {r.status} {url} ({len(body)} bytes)")
            return body
    except Exception as e:
        print(f"\n=== ERROR {url}: {e}")
        return None

b = get("https://api.tcgdex.net/v2/en/cards/base4-4")
if b: print(json.dumps(json.loads(b).get("pricing"), indent=1)[:2000])
b = get("https://api.tcgdex.net/v2/en/sets/base4")
if b:
    d = json.loads(b); print(d.get("name"), d.get("cardCount"), [c["id"] for c in d.get("cards", [])][:5])

pg = get("https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_6.json")
if pg:
    d = json.loads(pg)
    print({k: v for k, v in d.items() if k != "priceGuides"}, len(d.get("priceGuides", [])))
    print(json.dumps(d["priceGuides"][:2], indent=1))
pl = get("https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_6.json")
if pl:
    d = json.loads(pl)
    print({k: v for k, v in d.items() if k != "products"}, len(d.get("products", [])))
    prods = d["products"]
    print(json.dumps(prods[:2], indent=1))
    zard = [p for p in prods if p.get("name", "").startswith("Charizard")]
    print("Charizard products:", json.dumps(zard[:40]))
    from collections import Counter
    exps = Counter(p["idExpansion"] for p in prods if p.get("name") in ("Charizard", "Wigglytuff", "Scyther", "Mr. Mime", "Imposter Professor Oak", "Clefable"))
    print("expansions with key names:", exps.most_common(10))
