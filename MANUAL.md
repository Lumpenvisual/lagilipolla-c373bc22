# Manual de uso — LA GILIPOLLA 2026

Guía práctica para participantes y para el admin del bar. Para la documentación técnica del
proyecto (stack, arquitectura, desarrollo local) ver [`README.md`](README.md). Para el
reglamento oficial de puntuación, ver [`reglas/Reglamento2026.pdf`](reglas/Reglamento2026.pdf)
y sus [aclaraciones técnicas](reglas/ACLARACIONES.md).

---

## 1. Para participantes

### 1.1 Inscribirse

Entra a **Inscribirme** desde el menú o la portada. Vas a ver dos opciones, cada una con su
cuota y qué se pronostica:

- **Polla del Mundial** — la competencia completa: grupos, Grupo K (Colombia) y todas las
  eliminatorias hasta la final.
- **La Revancha** — competencia **aparte**, con su **propio pozo**: solo se pronostican los
  marcadores de semifinales y final. No afecta ni suma a la tabla principal de la polla, y la
  polla no afecta ni suma a la de Revancha.

Elige una, completa **alias** (tu nombre para la tabla) y un **PIN de 4 dígitos** — no hace
falta correo ni contraseña. Guarda tu alias y PIN: son tu usuario y contraseña para entrar
después.

Tras inscribirte, tu pago queda **pendiente** hasta que el admin lo confirme en el bar.

**¿Ya tienes cuenta y quieres sumarte a la otra competencia?** No crees una cuenta nueva — ver
[1.4 Sumarme a la otra competencia](#14-sumarme-a-la-otra-competencia).

### 1.2 Iniciar sesión

**Iniciar sesión** con el mismo alias y PIN. Si olvidaste el PIN, pídele al admin que te lo
restablezca (Panel de admin → Pagos → ícono de llave).

### 1.3 Tu panel (dashboard)

Al entrar ves tu estado:

| Estado de tu pago | Qué significa |
|---|---|
| ⏳ Pendiente | Acércate al bar y paga tu cuota. El admin confirma tu pago. |
| ❌ Rechazado | Habla con el admin en el bar. |
| ✅ Aprobado | Ya puedes llenar tu planilla y aparecer en la tabla. |

Si estás **solo en La Revancha** (nunca te inscribiste a la polla principal), tu panel te lo
dice explícitamente y te lleva directo a tu planilla de Revancha — no vas a ver el mensaje de
pago de la polla, porque no aplica.

### 1.4 Sumarme a la otra competencia

- **Estás en la polla y quieres sumarte a La Revancha:** en tu panel vas a ver una tarjeta
  "La Revancha" con un botón para pedir entrar. Eso pone tu solicitud en pendiente; el admin la
  aprueba por separado, sin tocar tu inscripción de la polla.
- **Estás solo en La Revancha y quieres sumarte a la polla principal:** hoy no hay un botón de
  autoservicio para esto — díselo al admin en el bar. (La polla podría estar cerrada, y sumarte
  es una decisión suya.)

Si La Revancha te fue **rechazada**, no puedes volver a pedirla tú mismo — el sistema lo
bloquea a propósito para que la aprobación sea siempre del admin. Habla con él o paga tu cuota
para que te apruebe directamente.

### 1.5 Llenar tu planilla

- **Polla:** `Pronósticos` en el menú. Marca 1º y 2º de cada grupo, los marcadores del Grupo K,
  las eliminatorias (según se vayan habilitando), y tu goleador/arquero. Puedes editar hasta
  **24 horas antes** de cada partido — lo ya guardado queda fijo. Las eliminatorias cierran
  **1 hora antes** del primer partido de cada ronda (toda la ronda junta, no partido por
  partido).
- **La Revancha:** desde tu panel, solo semis y final. Mismo criterio de un dígito 0–9 por
  marcador; el candado de tiempo lo define el admin (abre/cierra la ventana completa).

### 1.6 Tabla de posiciones

- **Tabla de la polla:** menú → `Tabla`. Toca un nombre para ver el detalle de su planilla.
  Desempates: más aciertos de 5, luego de 3, luego de 2.
- **Tabla de La Revancha:** aparece en el menú/tu panel **solo si estás aprobado** en esa
  competencia (o si estás en ambas). Mismo desempate, pero con acento de color distinto para
  que no la confundas con la principal — es su propio pozo, su propia tabla.

Los marcadores ajenos de una fase (Grupo K o cualquier eliminatoria) se revelan recién cuando
**arranca** el primer partido de esa fase — antes, se ven ocultos para todos menos para ti
mismo y el admin.

### 1.7 Comprobante oficial

Desde tu panel, **Descargar comprobante PDF**: incluye tu planilla y un código QR verificable
en `/verificar/<código>`. Se actualiza cada vez que guardas cambios.

---

## 2. Para el admin

Entra con el usuario y contraseña de organizador (no con alias+PIN) en **Iniciar sesión**.

### 2.1 Pagos (polla)

`Panel de admin → Pagos`. Lista a quienes están inscritos en la **polla principal**
únicamente. Aprobar (✅) o rechazar (❌) su pago; también puedes reiniciar su PIN, editar su
planilla sin candados, o eliminarlo. El recaudado que ves ahí es **solo el de la polla** —
nunca incluye lo de Revancha.

### 2.2 La Revancha (pagos + tabla)

`Panel de admin → La Revancha`. Pestaña **separada a propósito** de Pagos, para que nunca se
confunda una aprobación con la otra: aquí solo se toca el pago de Revancha de cada quien, con
un aviso de si esa persona también está en la polla. Debajo de la lista de pagos está la
**tabla de posiciones de Revancha**, para verla sin salir del panel.

### 2.3 Resultados oficiales

`Panel de admin → Resultados`. Carga los marcadores del Grupo K, 1º/2º de cada grupo, y
goleador/arquero oficiales. Los puntos de todos se recalculan solos (polla y Revancha, cada una
con su propio motor de cálculo — nunca se mezclan).

### 2.4 Cronograma (eliminatorias)

`Panel de admin → Cronograma`. Activa cada fase para que sea visible y editable; genera los
cruces de dieciseisavos a partir de los grupos; avanza ganadores ronda a ronda cargando los
marcadores en Resultados.

### 2.5 Reportes

`Panel de admin → Reportes`. Exporta participantes, tabla de posiciones y planillas a Excel;
sube backups a la nube.

### 2.6 Operaciones de base de datos (reset, migraciones, backups)

Cualquier operación que toque directamente la base de datos — limpiar usuarios para arrancar
de cero, resetear resultados oficiales, aplicar migraciones — sigue el procedimiento
documentado en la skill del repo
[`.claude/skills/gilipolla-ops/SKILL.md`](.claude/skills/gilipolla-ops/SKILL.md). Son
operaciones **irreversibles sobre datos reales de participantes** — no se ejecutan a la
ligera, y siempre con un backup previo (`Reportes → Cloud Backups`).

---

## 3. Preguntas frecuentes

**¿Por qué La Revancha no me deja ver la tabla de la polla / la polla no me deja ver la de
Revancha?** Cada quien ve solo las tablas de las competencias en las que está inscrito y
aprobado — es intencional, para que nadie confunda en cuál va ganando.

**¿Inscribirme a La Revancha me mete en la tabla principal, o al revés?** No. Son dos
competencias separadas, con dos pozos separados. Ninguna sube ni baja tus puntos en la otra.

**Ya me inscribí a la polla, ¿por qué no puedo crear otra cuenta para La Revancha con el mismo
alias?** El alias es tu identidad única en todo el sistema — no puedes tener dos cuentas con el
mismo nombre. Inicia sesión con tu cuenta existente y usa el botón "Entrar a La Revancha" desde
tu panel; no hace falta una cuenta nueva.

**Me rechazaron La Revancha, ¿puedo volver a pedirla yo mismo?** No — el sistema lo bloquea a
propósito. Habla con el admin o paga tu cuota para que te apruebe directamente.
