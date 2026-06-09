# Capa de acceso a datos (DAL)

Toda la lógica de tablas vive aquí. La UI y los server fns consumen **repos** —
nunca tocan Supabase directamente. Si mañana cambias de backend, reemplazas
solo `adapter.server.ts`.

## Estructura

```
src/lib/db/
├── adapter.server.ts          # cliente DB (hoy: supabaseAdmin)
├── types.ts                   # row types reexportados
├── participants.repo.server.ts
├── picks.repo.server.ts
├── tournament.repo.server.ts
├── roles.repo.server.ts
├── audit.repo.server.ts
└── index.functions.ts         # server fns (este SÍ se importa desde la UI)
```

- Archivos `*.server.ts` están **bloqueados** del bundle de cliente. Solo se
  importan desde dentro de `createServerFn().handler()` con `await import(...)`.
- `index.functions.ts` es el único punto de entrada para componentes y rutas.

## Cómo añadir una nueva operación

1. Agrega el método al repo correspondiente (`*.repo.server.ts`).
2. Expón un `createServerFn` en `index.functions.ts` con validación Zod.
3. Consume desde la UI con `useServerFn(myFn)`.

## Cómo apuntar a otra base de datos

Edita `adapter.server.ts` y devuelve un cliente con la misma interfaz
(`from()`, `rpc()`, `storage`). Si el nuevo backend no es Supabase, escribe un
pequeño wrapper que exponga los métodos que los repos usan:
`select / insert / update / upsert / delete / eq / order / limit / single /
maybeSingle`.

Los repos no cambian. Las server fns tampoco. Solo cambia el adaptador.

## Reglas

- Nunca importes `*.repo.server.ts` ni `adapter.server.ts` desde un componente,
  hook, loader público o `__root.tsx`.
- Toda escritura crítica de admin debe loguear vía `auditRepo.log(...)`.
- Validación de input siempre con Zod en la server fn, nunca dentro del repo.