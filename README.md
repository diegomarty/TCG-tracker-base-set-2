# Base Set 2 · Tracker de colección

Web estática (GitHub Pages) para llevar la colección de **Pokémon Base Set 2** (130 cartas) desde el móvil, con precios de **Cardmarket** en **Near Mint** y **Excellent**.

## Uso

- **Toca** una carta para marcarla / desmarcarla (con «Deshacer»).
- **Mantén pulsado** o toca la **i** para ver la carta en grande con los precios NM y EX, tendencia y enlace a Cardmarket.
- Arriba: progreso, valor de lo que tienes, lo que te falta y total del set. Botón **NM / EX** para elegir qué precio se usa.
- Filtros: Todas / Faltan / Tengo, rareza, búsqueda por nombre o número, orden por número/precio/nombre.
- Menú **⋯**: copiar enlace con tu colección (para abrirla en otro dispositivo), exportar/importar JSON, cartas que faltan en gris, borrar.
- La colección se guarda en el navegador (`localStorage`). Se puede «Añadir a pantalla de inicio» y funciona sin conexión.

## Precios

Hay dos fuentes, y la web usa la mejor disponible para cada carta:

| Fuente | Qué da | Dónde se ejecuta |
|---|---|---|
| **Scraping de Cardmarket** (`scripts/fetch_prices.py`) | Precio **desde**, media de las 5 más baratas, mediana y nº de ofertas, separado en **NM** y **EX** (cartas en inglés) | **Tu ordenador** |
| API pública pokemontcg.io | Tendencia de Cardmarket, medias 7/30 días y «desde EX+», más la URL exacta de cada producto | GitHub Actions (cada lunes) |

> ⚠️ Cardmarket (Cloudflare) responde **403 a las IPs de GitHub Actions**, así que el scraping NM/EX hay que lanzarlo desde casa. En la web, un precio con «~» es de tendencia (aproximado).

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

En *Settings → Pages* elige **Source: GitHub Actions**. El workflow `pages.yml` publica en cada push a `main` y después de cada actualización de precios.

Datos de cartas e imágenes: [pokemontcg.io](https://pokemontcg.io). No afiliado a Nintendo, The Pokémon Company ni Cardmarket.
