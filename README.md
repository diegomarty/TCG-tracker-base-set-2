# Base Set 2 · Tracker de colección

🔗 **Web: https://diegomarty.github.io/TCG-tracker-base-set-2/**

Web estática (GitHub Pages) para llevar la colección de **Pokémon Base Set 2** (130 cartas) desde el móvil, con precios de **Cardmarket** en **Near Mint** y **Excellent**.

## Uso

- **Toca** una carta para marcarla / desmarcarla (con «Deshacer»).
- **Mantén pulsado** o toca la **i** para ver la carta en grande con los precios NM y EX, tendencia y enlace a Cardmarket.
- Arriba: progreso, valor de lo que tienes, lo que te falta y total del set. Botón **NM / EX** para elegir qué precio se usa.
- Filtros: Todas / Faltan / Tengo, rareza, búsqueda por nombre o número, orden por número/precio/nombre.
- Botón **«CM ↗»** en cada carta: abre la ficha de Cardmarket en una pestaña nueva con los filtros puestos (cartas en inglés y condición mínima NM o EX, según el botón NM / EX).
- Menú **⋯**: copiar enlace con tu colección (para abrirla en otro dispositivo), exportar/importar JSON, cartas que faltan en gris, borrar.
- La colección se guarda automáticamente en el navegador (`localStorage`, con copia de seguridad) en cada toque: al recargar o cerrar la página no se pierde nada. Abajo del todo verás «✓ Colección guardada en este dispositivo». Se guarda por navegador y dispositivo: para pasarla a otro, usa «Copiar enlace con mi colección» o exportar/importar. Se puede «Añadir a pantalla de inicio» y funciona sin conexión.

## Precios

La web usa la mejor fuente disponible para cada carta:

| Fuente | Qué da | Frecuencia | Dónde |
|---|---|---|---|
| **[Guía de precios oficial de Cardmarket](https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_6.json)** (pública) | Tendencia, media de venta de ayer / 7 / 30 días, precio medio y «desde» (todas las condiciones juntas) | **A diario** | GitHub Actions |
| Scraping de las fichas de Cardmarket | Precio **desde**, media de las 5 más baratas, mediana y nº de ofertas **separado en NM y EX** (inglés) | Cuando lo lances | Tu ordenador |
| pokemontcg.io | Tendencia antigua (respaldo) | — | GitHub Actions |

Para cruzar cada carta con su producto de Cardmarket se usa el `idProduct` que da la API pública de [TCGdex](https://tcgdex.dev) (se guarda en `data/cardmarket_ids.json`).

La acción **Actualizar precios Cardmarket** corre cada día y publica sola. En la web, «~» = tendencia (todas las condiciones); sin «~» = precio real NM/EX.

> ⚠️ La guía oficial no separa por condición. Para NM/EX reales hay que leer las ofertas de cada ficha, y Cardmarket (Cloudflare) bloquea con 403 las IPs de GitHub Actions: eso solo funciona desde casa.

### Actualizar NM/EX desde tu ordenador

Necesitas Python 3 y git con acceso al repo:

```bash
./scripts/actualizar_precios.sh              # refresca lo que tenga más de 6 días, hace commit y push
./scripts/actualizar_precios.sh --max-age 0  # fuerza todas
./scripts/actualizar_precios.sh --only 4,2   # solo esas cartas (por número)
```

(En Windows: `pip install -r scripts/requirements.txt`, luego `python scripts/fetch_prices.py` y `git add data && git commit -m precios && git push`.)

Va **despacio a propósito** para evitar baneos: 1 petición por carta, 9–16 s de pausa aleatoria + pausa larga cada 15 cartas, reintentos con espera ante 429/5xx y parada inmediata si Cardmarket bloquea (403). Las 130 cartas tardan ~35–45 min. Guarda tras cada carta: si lo cortas, la siguiente vez continúa.

Si alguna carta no encuentra su URL, añádela a mano en `data/cardmarket_urls.json`. Si Cardmarket cambia su HTML, `python scripts/fetch_prices.py --only 4 --debug` guarda la página en `.debug/` para revisarla.

## Publicación

GitHub Pages está configurado como *Deploy from a branch → main / (root)*: cada push a `main` (incluidas las actualizaciones de precios) se publica solo.

Datos de cartas e imágenes: [pokemontcg.io](https://pokemontcg.io). No afiliado a Nintendo, The Pokémon Company ni Cardmarket.
