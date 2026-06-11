# Revisión QA — LA GILIPOLLA 2026

## Pendientes / observaciones

- [x] En **admin Gilipolla**, los marcadores solo deben permitir ingresar **un dígito**. _(Hecho: `lastGol` en cliente — cada tecla reemplaza, sin cero a la izquierda — + trigger `picks_validate` en BD.)_
- [x] Agregar **debajo de la tabla de posiciones** el resumen de las reglas del sistema de puntos (ver abajo). _(Hecho: `ScoringRulesPanel` compartido entre `/leaderboard` y `/reglas`.)_

## Hecho (jun 2026)

- [x] **Admin fuera del ranking** + módulo **"Resultados oficiales"** en la tabla. _(`get_polla_leaderboard` excluye rol admin; `OfficialResultsPanel` en `/leaderboard`.)_
- [x] **Footer** "Desarrollado por Hackidevs · +57 323 437 42 00" global. _(`Footer.tsx` en `__root.tsx`, i18n ES/EN.)_
- [x] **QR del comprobante** por `VITE_APP_URL` + fix de `comprobante_code` (epoch entero) para que la verificación coincida con el QR.
- [x] **Comprobantes (PDF y Excel):** solo los partidos oficiales del **Grupo K** (helper `groupKMatches`).
- [x] **Comprobantes:** nombre del participante en cada planilla (PDF y hojas Excel).
- [x] **Comprobante PDF:** leyenda de equivalencia de puntaje de grupos (5/3/1/0).
- [x] **Export de la BD al Storage:** bucket privado `backups`; Admin → Reportes → _Cloud Backups_.

---

## Sistema de puntos (reglas oficiales)

### Apuesta por grupos (1° y 2°)

Para cada uno de los 12 grupos (A–L) eliges los **dos primeros clasificados**.

| Puntos | Condición                                        |
| :----: | ------------------------------------------------ |
|   5    | Aciertas los clasificados **en su orden**.       |
|   3    | Aciertas los clasificados **en desorden**.       |
|   1    | Aciertas **únicamente uno** de los clasificados. |
|   0    | No aciertas ninguno.                             |

### Apuesta por marcador · Grupo K y siguientes rondas

Predices el **marcador exacto** de cada partido del Grupo K (Colombia) y, en las siguientes rondas, de **todos los partidos hasta la final**.

| Puntos | Condición                                                                     |
| :----: | ----------------------------------------------------------------------------- |
|   5    | Marcador exacto del partido.                                                  |
|   3    | Aciertas el equipo ganador **Y** el número de goles de cualquier equipo.      |
|   2    | Aciertas solo el equipo ganador (sin importar los goles).                     |
|   1    | Aciertas el empate (sin importar el número de goles).                         |
|   1    | Aciertas la cantidad de goles de un equipo (sin importar el resultado final). |
|   0    | Ningún acierto.                                                               |

> **Nota:** los marcadores se cuentan a los **90 minutos + reposición**. Si hay repechaje (alargue o penales), no cuenta: solo vale el resultado de los primeros 90 minutos.
