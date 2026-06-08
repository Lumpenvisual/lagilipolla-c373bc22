## Rostizada al plan v2 (qué seguía mal)

1. **Tomé la planilla como verdad absoluta.** Es una planilla de un bar; el dueño rellenó "candidatos" donde la FIFA tiene "Ganador Repechaje X". Lo verifiqué contra el sorteo oficial del 5 dic 2025 (FIFA + olympics.com + FCF) y **6 grupos tienen un equipo que aún no existe** (se decide en repechajes de marzo 2026):

   | Grupo | Equipo en la planilla | Realidad oficial |
   |---|---|---|
   | A · Rep. Checa | Candidato | Ganador UEFA Play-off D (Denmark / Czechia / Ireland / N. Macedonia) |
   | B · Bosnia-Herzegovina | Candidato | Ganador UEFA Play-off A (Italy / Wales / Bosnia / N. Ireland) |
   | D · Turquía | Candidato | Ganador UEFA Play-off C (Türkiye / Slovakia / Kosovo / Romania) |
   | F · Suecia | Candidato | Ganador UEFA Play-off B (Ukraine / Poland / Albania / Sweden) |
   | I · Irak | Candidato | Ganador FIFA Play-off 2 (Iraq / Bolivia / Suriname) |
   | K · Congo | Candidato | Ganador FIFA Play-off 1 (DR Congo / Jamaica / N. Caledonia) |

   Si yo guardo "Bosnia-Herzegovina" como el equipo del grupo B y termina ganando Italia, **toda la apuesta de ese grupo queda inconsistente**. Mi v2 no contemplaba esto.

2. **Leí mal el bloque "COLOMBIA – GRUPO K".** Pensé que eran "los 3 partidos de Colombia". Son los **6 cruces del Grupo K completo** (cada equipo juega 3 partidos = 6 partidos en total). El calendario oficial FIFA solo tiene los **3 partidos reales de Colombia**:
   - 17 jun – **Uzbekistán vs Colombia** (Azteca, CDMX)  
   - 23 jun – **Colombia vs Ganador PO-1 FIFA** (Chivas, Guadalajara)  
   - 27 jun – **Colombia vs Portugal** (Hard Rock, Miami)
   
   Los otros 3 (Portugal vs Congo, Portugal vs Uzbekistán, Uzbekistán vs Congo) son los cruces del grupo que también juegan los otros equipos. La planilla los lista todos: hay que **respetar los 6**, pero usar fechas/sedes oficiales y nombrar correctamente al equipo PO-1.

3. **Local vs visitante invertidos.** La planilla escribe "Colombia vs Uzbekistán" pero el oficial es "Uzbekistán vs Colombia" (Colombia es visitante). Si guardo mal, todos los marcadores exactos quedan invertidos. Esto rompe el scoring silenciosamente. Hay que cargar **exactamente como FIFA**.

4. **Goleador / Mejor arquero como texto libre** → pesadilla de tildes y variantes ("Mbappe" / "Mbappé" / "K. Mbappé"). Solución: el admin define una lista de candidatos y el jugador escoge de un combobox. Comparación por `id`, no por string.

5. **Plan v2 era oscuro+dorado genérico.** No tiene nada de colombiano. La paleta debe ser bandera (amarillo, azul, rojo) + acentos cafeteros, sobre fondo oscuro de bar. Tipografía con personalidad (display bold para títulos, sans clara para datos).

6. **Currency formatting.** `Intl.NumberFormat('es-CO', { currency: 'COP' })` produce "$ 100.000" con espacio molesto. Mejor `"$" + n.toLocaleString("es-CO")` → `"$100.000"`.

## Plan v3 (definitivo)

### Modelo de datos (single‑contest, con repechajes)

```text
tournament_state                 -- singleton id=1
  groups          jsonb          -- {A:{teams:[{id,nombre,po?:"UEFA-D"|null}], pos1:id|null, pos2:id|null}, ...}
  group_matches   jsonb          -- 6 por grupo (todos los cruces), con fecha/sede/local/visitante, gh, ga
                                  -- pero la UI solo expone los del grupo K (planilla) — el resto se reserva para v2
  goleadores      jsonb          -- [{id,nombre,seleccion}, ...] lista del admin
  arqueros        jsonb          -- idem
  goleador_id     text|null      -- resultado oficial
  arquero_id      text|null      -- resultado oficial
  deadline        timestamptz    -- 2026-06-11 17:00 COT
  cuota_cop       int            -- 100000

picks
  participant_id  uuid pk
  groups          jsonb          -- {A:{pos1:id,pos2:id}, ...}
  group_k_matches jsonb          -- 6 marcadores
  goleador_id     text|null
  arquero_id      text|null
  puntos_grupos / partidos / especiales / total
```

Cada equipo dentro de `teams[]` lleva `po: "UEFA-D"` cuando todavía no se sabe quién es. La UI muestra:
- Si `po` está definido y no hay equipo real cargado → "Ganador Repechaje UEFA D" (más una lista de candidatos como hint).
- Una vez el admin carga el equipo ganador, se reemplaza el nombre y se marca como confirmado.

### Datos verificados a sembrar

**12 grupos (oficiales del sorteo 5 dic 2025):**
```
A: México, Sudáfrica, Corea del Sur, Ganador UEFA-D
B: Canadá, Ganador UEFA-A, Qatar, Suiza
C: Brasil, Marruecos, Haití, Escocia
D: EE.UU., Paraguay, Australia, Ganador UEFA-C
E: Alemania, Curazao, Costa de Marfil, Ecuador
F: Países Bajos, Japón, Ganador UEFA-B, Túnez
G: Bélgica, Egipto, Irán, Nueva Zelanda
H: España, Cabo Verde, Arabia Saudita, Uruguay
I: Francia, Senegal, Ganador FIFA-2, Noruega
J: Argentina, Argelia, Austria, Jordania
K: Portugal, Ganador FIFA-1, Uzbekistán, Colombia
L: Inglaterra, Croacia, Ghana, Panamá
```

**6 partidos del Grupo K (en orden de la planilla, fechas oficiales FIFA):**

| # | Fecha | Local | Visitante | Sede |
|---|---|---|---|---|
| 1 | 17 jun 21:00 COT | Uzbekistán | Colombia | Estadio Azteca · CDMX |
| 2 | 17 jun (12m → mediodía local) | Portugal | Ganador FIFA-1 | (sede oficial cuando FIFA publique) |
| 3 | 23 jun | Colombia | Ganador FIFA-1 | Estadio Akron · Guadalajara |
| 4 | 23 jun | Portugal | Uzbekistán | (sede oficial) |
| 5 | 27 jun 18:30 COT | Colombia | Portugal | Hard Rock Stadium · Miami |
| 6 | 27 jun | Uzbekistán | Ganador FIFA-1 | (sede oficial) |

> Nota: la planilla escribe "Colombia vs Uzbekistán" pero el oficial es **Uzbekistán vs Colombia**. Guardamos como FIFA y la UI muestra `local · marcador · visitante` en ese orden. En la pantalla mostramos también una nota "(Colombia juega de visitante)" para que el jugador no se confunda.

**Candidatos a goleador/arquero (admin puede editar):**
Lista inicial con favoritos: Mbappé, Haaland, Vinícius Jr, Lautaro Martínez, Harry Kane, Lamine Yamal, Cristiano Ronaldo, Messi (goleadores). Courtois, Donnarumma, Alisson, Emiliano Martínez, Maignan, Vicario, Sommer (arqueros). El admin puede agregar/quitar antes y durante el mundial.

### Reglas de puntaje (idénticas a la planilla)

Sin cambios respecto al v2 — quedan los bloques de grupos / partidos / especiales con la misma lógica.

### Look colombiano

**Paleta (tokens en `src/styles.css`):**
```text
--bg          oklch(0.18 0.03 245)   /* azul noche profundo - "noche en el bar" */
--bg-elev     oklch(0.22 0.04 250)
--primary     oklch(0.85 0.18 95)    /* amarillo bandera #FCD116 */
--primary-ink oklch(0.20 0.05 250)   /* texto sobre amarillo */
--azul        oklch(0.42 0.18 260)   /* azul bandera #003893 */
--rojo        oklch(0.58 0.22 28)    /* rojo bandera #CE1126 */
--cafe        oklch(0.45 0.08 60)    /* café cafetero, para borders sutiles */
--gold        oklch(0.78 0.15 88)    /* amarillo más cálido para acentos */
--gradient-bandera linear-gradient(135deg, var(--primary) 0%, var(--azul) 50%, var(--rojo) 100%)
--gradient-tropical linear-gradient(135deg, var(--primary), var(--gold))
```

**Uso semántico:**
- Hero: fondo azul noche con franja superior amarilla delgada (banderita); título principal en amarillo con sombra; subtítulo blanco.
- CTAs primarios: amarillo con tipografía oscura (alta legibilidad, "primary" puro).
- Estados / acentos: azul para info, rojo para destructivo/cerrado, amarillo para activo.
- Tarjetas de grupo: borde sutil café/azul, header con cinta amarilla cuando el jugador completó el pick.
- Tabla líder: top 3 con destellos amarillo→rojo (medallas tropicales).
- "Polla del bar": detalle de cinta diagonal estilo sello "ENTREGA HASTA 11 JUN 2026" como en la planilla original.

**Tipografía:**
- Display: **Bebas Neue** (mayúsculas, presencia tipo cartel de bar/cancha) para títulos.
- Texto: **Inter** o **Manrope** para datos, tablas y formularios.

**Detalles temáticos sin caer en cliché:**
- Sutiles patrones de hojas de café como `ambient-blob` muy tenue en hero.
- Iconografía: cinta tricolor en separadores. Banderita pequeña al lado del nombre "Colombia" en tablas.
- Sonidos NO (no se piden).

### UI — qué se elimina, qué se mantiene

**Eliminar:** rutas `/jugar`, `/jugar/$modalidad`, `/concursos`, `/concursos/$id`, `/predictions`. Componentes `ModalidadCard`, `ConcursoGrid`, `ModalidadRules`, `PredictionCard`. `LanguageSwitcher`. Sección "Modos" del landing. Tablas viejas (`concursos`, `inscripciones`, `predictions`, `matches`) quedan huérfanas y se eliminan en una segunda iteración cuando nada las importe.

**Mantener / nuevo:**
- `/` — Hero "LA GILIPOLLA 2026 · Bar El Guanábano · $100.000 COP", countdown al 11 jun 2026 17:00 COT, CTA "Inscribirme", explicación corta de cómo se juega, footer con sede.
- `/registro` — nombre + celular + email + clave; ya guarda celular en `participants`.
- `/login` — sin toggle organizador visible.
- `/dashboard` — estado de pago + botón "Llenar planilla" (si aprobado).
- `/planilla` **(nueva, una sola pantalla)** con 3 bloques:
  1. **Primera ronda** — grilla 4×3 de tarjetas (12 grupos). Cada tarjeta lista los 4 equipos; el jugador marca 1º y 2º (radios o select). Pinta cinta amarilla cuando el grupo está completo.
  2. **Grupo K – Apuesta con resultados** — 6 filas: fecha · local · `[input]` · `[input]` · visitante. Indicador visual cuando Colombia juega.
  3. **Especiales** — Goleador (combobox de candidatos) + Mejor arquero (combobox).
  - Botón "Guardar planilla" único. Bloqueo de edición tras deadline o cuando ya hay resultado oficial.
- `/reglas` — La imagen original de la planilla + las 3 tablas de scoring tipográficas, con la paleta tricolor.
- `/leaderboard` — Tabla pública: posición · nombre · puntos totales · desglose (grupos/partidos/especiales). Top 3 destacados.
- `/admin` — tres pestañas: **Pagos** (aprobar/rechazar), **Resultados** (cargar 1º/2º de cada grupo, marcadores de los 6 partidos del K, goleador, arquero, además de poder resolver los repechajes cuando se jueguen), **Listas** (editar candidatos a goleador/arquero).

**Navbar final:** Inicio · Planilla (solo si aprobado) · Tabla · Reglas · Dashboard · Admin · Salir.

### Lógica de repechajes (clave para no romper)

Cuando el admin resuelve un repechaje:
1. Va a Admin → Resultados → "Resolver Repechaje UEFA-D" → selecciona el equipo ganador.
2. Se actualiza `tournament_state.groups.A.teams[3].nombre = "Italia"` (o el que sea).
3. Si algún jugador tenía a "Italia" como pos1/pos2 (en la lista de candidatos), su pick sigue válido. Si tenía a otro candidato, no acertó.
4. Mismo flujo para los partidos: el partido "Portugal vs Ganador FIFA-1" se renombra a "Portugal vs Jamaica" (o el ganador).

Antes del repechaje, en la planilla del jugador, cuando un equipo es PO, se muestra como **"Ganador Repechaje UEFA-D"** con un tooltip listando candidatos. El jugador puede aún elegir un candidato específico desde el dropdown (su pick = id del candidato). Si su candidato termina sin ganar el PO, su pick no puede coincidir con el ganador → 0 pts en ese grupo, fair play.

### Constantes

```ts
// src/lib/polla.ts
export const POLLA = {
  titulo: "LA GILIPOLLA 2026",
  sede: "Bar El Guanábano",
  cuotaCOP: 100_000,
  deadline: new Date("2026-06-11T17:00:00-05:00"),
  mundialStart: new Date("2026-06-11T18:00:00-05:00"),
  mundialEnd: new Date("2026-07-19T20:00:00-05:00"),
};
export const fmtCOP = (n: number) => "$" + n.toLocaleString("es-CO");
```

### Entregables (3 movimientos)

1. **Backend único + semilla verificada.** Migración con `tournament_state` + `picks`, RLS, triggers de recálculo, función SQL `recalc_all_picks()`, y semilla con los 12 grupos exactos del sorteo oficial (incluyendo los 6 PO winners marcados como tales) y los 6 partidos del Grupo K con fechas/sedes oficiales y orden local/visitante correcto.
2. **UI única con paleta colombiana.** Tokens nuevos en `styles.css`, fuentes (Bebas Neue + Inter), landing + navbar + dashboard + planilla + leaderboard + reglas adaptados. Borrar archivos modalidad/concursos.
3. **Admin completo.** Pantalla con 3 pestañas (Pagos / Resultados / Listas) + resolver repechajes + recalcular puntos.

### Lo que no se hace y por qué

- **No** se integra pasarela de pagos (se paga al bar; admin marca aprobado).
- **No** se traduce a inglés (polla colombiana).
- **No** se permite editar cuota en runtime (constante).
- **No** se borran tablas viejas en esta iteración (limpieza posterior).
- **No** se exponen los otros 24 partidos del grupo (los de A–J y L) en la planilla v1; la apuesta de marcador se limita a los 6 del Grupo K como en la imagen.

¿Apruebas v3 y empiezo a construir?
