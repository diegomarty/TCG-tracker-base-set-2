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

`scripts/fetch_prices.py` se ejecuta en GitHub Actions (cada lunes y a mano desde *Actions → Actualizar precios Cardmarket → Run workflow*):

1. Pide a la API pública de pokemontcg.io la tendencia de Cardmarket y la URL de cada producto (1 petición).
2. Visita **despacio** cada página de Cardmarket (1 petición por carta, 9–16 s de pausa aleatoria + pausas largas cada 15, backoff ante 429/403 y parada si bloquea), filtrando por inglés y condición ≥ EX. Separa las ofertas **NM** y **EX** y guarda: precio desde, media de las 5 más baratas, mediana y nº de ofertas.
3. Guarda tras cada carta en `data/prices.json`; si se corta, la siguiente ejecución sigue por donde iba.

Si Cardmarket bloquea el scraping, la web muestra la tendencia (marcada con «~»).
Si alguna carta no encuentra su URL, añádela a mano en `data/cardmarket_urls.json` (`{"base4-4": "https://www.cardmarket.com/en/Pokemon/Products/Singles/Base-Set-2/Charizard"}`).

Ejecutarlo en local (desde tu IP):

```bash
pip install -r scripts/requirements.txt
python scripts/fetch_prices.py --max-age 0     # todas
python scripts/fetch_prices.py --only 4,2,10   # solo algunas
```

## Publicación

En *Settings → Pages* elige **Source: GitHub Actions**. El workflow `pages.yml` publica en cada push a `main` y después de cada actualización de precios.

Datos de cartas e imágenes: [pokemontcg.io](https://pokemontcg.io). No afiliado a Nintendo, The Pokémon Company ni Cardmarket.
