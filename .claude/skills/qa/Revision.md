# Revisión QA — LA GILIPOLLA 2026

## Pendientes / observaciones

- [x] En **admin Gilipolla**, los marcadores solo deben permitir ingresar **un dígito**. _(Hecho: `lastGol` en cliente — cada tecla reemplaza, sin cero a la izquierda — + trigger `picks_validate` en BD.)_
- [x] Agregar **debajo de la tabla de posiciones** el resumen de las reglas del sistema de puntos (ver abajo). _(Hecho: `ScoringRulesPanel` compartido entre `/leaderboard` y `/reglas`.)_

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

# Todo

Actualiza el qr para la verificación de comprobante -  http://localhost:8080/verificar/9ecf4ee69d33 - cambiar el enpoint por .env

en los comprobantes verifica que en los partidos del grupo K solamente salgan los que pertenecen oficialmente al grupo K. en .pdf y excel. 

En los comprobantes agrega el nombre de cada participante al que pertenecen los resultados. 


