# Rediseño: "Elige cómo jugar" — onboarding guiado + landings por modalidad

## El problema actual
Hoy todo se mezcla: una landing de marketing larga, un solo lobby `/concursos` con filtros sueltos, reglas globales y pronósticos en otra pantalla. El usuario no entiende *qué* está comprando ni *con qué nivel de compromiso*. Las 4 modalidades (Mundial completo, Por fase, Día de partidos, Por partido) compiten sin jerarquía.

## La nueva estrategia
Un **onboarding guiado** que pregunta el nivel de compromiso y lleva a cada usuario a la **landing dedicada de su modalidad**, donde nada se mezcla: solo esa modalidad, su ejemplo, sus reglas, sus concursos y un CTA directo. Simple por defecto, con profundidad opcional (sirve a casual y a fan total por igual).

```text
  HOME (/)
  "¿Cómo quieres jugar?"
        │
        ▼
  ONBOARDING GUIADO  (1 pregunta: ¿cuánto te quieres comprometer?)
   ├─ "Solo un partido"      → /jugar/partido
   ├─ "Un día de fútbol"     → /jugar/dia
   ├─ "Una fase del torneo"  → /jugar/fase
   └─ "El Mundial completo"  → /jugar/mundial
        │
        ▼
  LANDING DE MODALIDAD  (todo lo de esa modalidad, sin mezclar)
   1. Explicación simple + ejemplo visual de puntuación
   2. Reglas y reparto de premios propios de la modalidad
   3. Lista de concursos de esa modalidad (pozo, cuota, jugadores, deadline)
   4. CTA directo: inscribirse / pronosticar
        │
        ▼
  DETALLE DE CONCURSO  (ya existe, /concursos/$id) → pronóstico
```

## Pantallas

### 1. Home `/` rediseñada
- Hero corto y claro con una sola promesa y un CTA principal: **"Empieza a jugar"** → abre el onboarding.
- Debajo, las 4 modalidades como tarjetas grandes (icono, nombre, "ideal para…", cuota típica, nivel de compromiso) que también enlazan directo a su landing para usuarios que ya saben qué quieren.
- Se retiran de la home: el formulario de inscripción global, la tabla de premios global y el bloque de pago. Esos contenidos pasan a vivir en su contexto correcto (landing de modalidad / detalle de concurso).

### 2. Onboarding guiado `/jugar` (nuevo)
- Un paso, lenguaje humano: "¿Cuánto te quieres comprometer?" con 4 opciones visuales (1 partido → todo el Mundial), cada una con tiempo estimado, cuota orientativa y nº de pronósticos.
- Al elegir, navega a la landing de esa modalidad. Sin fricción, sin login obligatorio para mirar.

### 3. Landings por modalidad `/jugar/$modalidad` (nuevo, 4 variantes de un mismo route param)
Cada landing comparte estructura pero con contenido y acento propios:
- **Cabecera** con icono, nombre y una frase que explica la modalidad.
- **Cómo funciona + ejemplo**: 2–3 pasos y un ejemplo visual concreto de cómo se puntúa (acierto exacto = 3, resultado = 1, fallo = 0) aplicado a esa modalidad.
- **Reglas y premios específicos**: deadlines, alcance (1 partido / 1 día / 1 fase / 104 partidos) y reparto de premios de esa modalidad.
- **Concursos disponibles**: grid filtrado a esa modalidad reusando las tarjetas existentes (pozo, cuota, jugadores, cuenta regresiva, estado de inscripción).
- **CTA directo**: "Inscribirme" / "Pronosticar" según estado de sesión y pago.
- Estados vacíos claros cuando aún no hay concursos de esa modalidad.

### 4. Ajustes de navegación
- Navbar: "Concursos" pasa a **"Jugar"** apuntando al onboarding; se conserva el acceso a Tabla y Reglas.
- `/concursos` se mantiene como "ver todos" (acceso avanzado), pero deja de ser la puerta principal.
- Reglas `/reglas` se reorganiza por modalidad (acordeón) para coherencia, enlazando a cada landing.

## Detalle técnico
- **Datos**: sin cambios de esquema. Se reutilizan `useConcursosOverview`, `useMyInscripciones`, `useConcurso*` y `lib/concursos.ts` (`MODALIDAD_*`, `ESTADO_META`, `PAGO_META`).
- **Rutas nuevas** (TanStack file-based): `src/routes/jugar.tsx` (onboarding) y `src/routes/jugar.$modalidad.tsx` (landing por modalidad). El param se valida contra `partido|dia|fase|mundial`; valor inválido → `notFound()`. Cada ruta define su `head()` propio (title/description/og) para SEO e indexación independiente.
- **Componentes nuevos** reutilizables: `ModalidadCard` (home + onboarding), `ScoringExample` (ejemplo visual de puntuación), `ModalidadRules` (reglas/premios por modalidad), y un `ConcursoGrid` extraído de `/concursos` para reuso en las landings.
- **i18n**: todas las cadenas nuevas en `src/lib/i18n/translations.ts` con paridad ES/EN/FR (las 4 modalidades, onboarding, ejemplos, reglas, CTAs). Se mantiene 1:1 entre idiomas.
- **Diseño**: se respeta el sistema de tokens actual (glass-card, gold/primary/info, font-display). Cada modalidad recibe un color de acento consistente para diferenciarlas visualmente sin romper el tema. Responsive a 393px verificado.
- **Limpieza**: la home pierde el `RegistrationForm` global; ese flujo de inscripción queda contextual al concurso (ya existe en el detalle). Sin deuda técnica ni rutas muertas: se actualizan enlaces internos y traducciones.

## Fases
1. **Componentes base** + i18n: `ModalidadCard`, `ScoringExample`, `ModalidadRules`, `ConcursoGrid` y claves de traducción ES/EN/FR.
2. **Onboarding** `/jugar` + rediseño de la **home** como entrada limpia.
3. **Landings por modalidad** `/jugar/$modalidad` con las 4 secciones y CTA.
4. **Navegación y reglas**: navbar, `/reglas` por modalidad, `/concursos` como vista "todos".
5. **QA**: build limpio, paridad i18n (script de verificación de claves), responsive 393px y revisión visual en preview.

Criterio de hecho: build sin errores, las 4 landings renderizan con sus concursos y ejemplos, idiomas completos, y un usuario nuevo entiende en <10s a qué se está inscribiendo.