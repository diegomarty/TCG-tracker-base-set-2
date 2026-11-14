# Base Set 2 · Tracker de colección

🔗 **Web: https://diegomarty.github.io/TCG-tracker-base-set-2/**

Web estática (GitHub Pages) para llevar la colección de **Pokémon Base Set 2** (130 cartas) desde el móvil, con precios de **Cardmarket** en **Near Mint** y **Excellent**.

## Uso

- **Toca** una carta para marcarla / desmarcarla. El aviso trae «Deshacer» y «€ Precio» para apuntar lo que pagaste.
- **Mantén pulsado** o toca la **i** para abrir la ficha.
- Botón **«CM»** en cada carta: eliges **Near Mint o mejor** o **Excellent o mejor** (con su precio) y se abre Cardmarket en una pestaña nueva con los filtros puestos.
- Arriba: progreso, valor de lo que tienes, lo que te falta y lo gastado. **NM / EX** elige qué precio se usa. Pestañas **Todas / Faltan / Tengo / ★ Busco**.
- **Barra inferior** (al alcance del pulgar): búsqueda, **#**, lote, filtros y orden.

### Pensado para un cardshow

| Función | Cómo |
|---|---|
| **Sin conexión** | Menú ⋯ → «Preparar para usar sin conexión»: descarga las 130 imágenes, los precios y la app (con reintentos). Añádela a la pantalla de inicio. Si no hay red verás «Sin conexión» arriba. |
| **Buscar por número** | Botón **#** → teclado numérico grande. Escribes el número de la carta (el «4» de «4/130») y sale con su precio y si la tienes. Desde ahí: «✓ Marcar», «CM» o «¿Buen precio?». En la búsqueda normal, Enter con un único resultado abre su ficha. |
| **¿Es buen precio?** | En la ficha, «¿Cuánto te piden?» → verde (≥10 % por debajo), amarillo (±10 %) o rojo (caro) frente al precio NM/EX, y si está dentro de tu máximo. |
| **Lote / calculadora** | «+ Añadir al lote» desde la ficha. En el lote ves lo que te piden, el valor y la diferencia; puedes poner un precio por todo el lote y «Comprar lote» (reparte el precio según el valor de cada carta). |
| **Registrar compras** | «Comprada a este precio» o el campo «Pagado» en la ficha, con el estado (MT…PO) y la fecha. Menú ⋯ → «Resumen de gastos»: gastado total y de hoy, valor y ahorro frente a Cardmarket, últimas compras. |
| **Objetivos** | En la ficha «☆ La busco» + precio máximo y prioridad. Pestaña **★ Busco** ordenada por prioridad; las cartas llevan una estrella con tu máximo. Al conseguirla deja de ser objetivo. |
| **Modo feria** | Botón «Feria»: solo las que faltan, cartas grandes, precios más visibles y la pantalla no se apaga. Al quitarlo vuelve todo como estaba. |
| **Lista de faltas** | Menú ⋯ → «Mi lista de faltas»: texto con objetivos primero y el resto por rareza, para enseñar o compartir por WhatsApp. |
| **Repetidas** | En la ficha, «Copias − / +». Filtro «Repetidas» y marca «×2» en la carta. |

- Filtros: rareza, tipo, rango de precio, repetidas, con/sin precio de compra y tamaño de las cartas. Orden: número, precio, nombre, rareza, tipo, prioridad, recientes, lo más caro que pagaste y tendencia.
- Menú **⋯**: también copiar enlace con tu colección, exportar/importar JSON (incluye compras, repetidas y objetivos), cartas que faltan en gris, marcar todas las visibles y borrar.
- Todo se guarda automáticamente en el navegador (`localStorage`, con copia de seguridad): al recargar o cerrar la página no se pierde nada. Es por navegador y dispositivo: para pasarla a otro, usa el enlace o exportar/importar.

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
