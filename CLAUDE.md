# Pizarra: guía para trabajar en el proyecto

**Pizarra** es una pizarra online compartida por código de sala, sin cuentas: Vite, React 19, TypeScript, Canvas, perfect-freehand y Firebase (Auth anónima y Firestore). El motor de dibujo viene de **Notillas** (`jsantiago00/Notillas`). Toda la interfaz está en español rioplatense (voseo).

- **Plan** (decisiones, modelo de datos y etapas): [PLAN.md](PLAN.md). Leelo primero.
- **Cómo correr, probar y publicar:** [README.md](README.md). **Configurar Firebase:** [docs/FIREBASE.md](docs/FIREBASE.md).
- **Repo:** `jsantiago00/pizarra`. Se publica en GitHub Pages con `.github/workflows/pages.yml` en cada push a `main` (`https://santiagososa.com.ar/pizarra/`).
- **Firebase:** un proyecto propio, **no** el de Notillas (cada proyecto tiene un solo archivo de reglas). La configuración va en las variables de Actions `VITE_FIREBASE_*` y, en local, en `.env`.

## Estado

| Etapa | Estado |
|---|---|
| 1. Salas y permisos | ✅ Hecha (a confirmar por el usuario) |
| 2. En vivo: trazo en curso, punteros, seguir la vista | Pendiente |
| 3. Herramientas de clase | Pendiente |
| 4. Gestión de salas | Pendiente |

Actualizá esta tabla en el mismo commit que cierra cada etapa.

## Cómo trabajar (acordado con el usuario en Notillas)

- **Una etapa por vez.** Al terminar cada una, explicá cómo probarla (en la compu, el celular y la tablet) y **esperá su confirmación** antes de seguir.
- **Antes de commitear,** todo en verde: `npx tsc -b && npx eslint . && npx vitest run && npx vite build`. Si tocaste `firestore.rules`, también `npm run test:rules`.
- **Commits:** autor `juansantiagososa00 <juansantiagososa00@gmail.com>`, mensaje en español.
- **Dispositivos del usuario:** una tablet Android con S Pen (Chrome) y el celular. Probá con Playwright: Chromium está en `/opt/pw-browsers` y playwright en `/opt/node-tools/node_modules/playwright`. Emulá una tablet de 1280×800 y de 800×1280, y un celular de 390×780. Para probar la sala, usá **dos contextos de navegador** (dos personas) contra los emuladores.

## Decisiones ya tomadas (no las vuelvas a discutir)

- **Sin cuentas:** Auth anónima automática (`src/firebase/auth.ts`). El nombre y las salas recientes están en `localStorage` (`src/lib/localRooms.ts`).
- **Administración:** `rooms/{code}/admins/{uid}` existe si administrás. Se crea con la clave de `secret/admin`, que nadie puede leer. El enlace es `/sala/CODIGO#admin=clave`; la clave se guarda en `localStorage` del dispositivo que la tiene.
- **Permisos en el documento de la sala:** `editMode` (`all`/`some`), `editors`, `banned`. `canEdit()` en `rooms.ts` replica en el cliente lo que dicen las reglas.
- **Solo mirar:** `NoteEditor` con `readOnly` esconde las herramientas, y `Board` (opción `canEdit`) no dibuja: el lápiz y el dedo desplazan la hoja.
- **Sincronización:** igual que en Notillas. Todo cambio pasa por `NoteModel`, y `RoomSync` lo escribe en lotes cada 60 ms. Lo remoto entra con `applyRemote`, y el eco propio se reconoce por la firma del trazo. Los trazos llevan `by` (el `uid`).
- **Las reglas usan `getAfter`/`existsAfter`** para las escrituras: así la sala y su primera página entran en un mismo lote.
- **Ruta base:** `BASE_PATH` es `/<repo>/` en Pages. Para `public/` usá `asset()` o `LOGO`; en `index.html`, `%BASE_URL%`. Nunca rutas absolutas.
- **Lo heredado de Notillas sigue valiendo:** nada de `desynchronized: true` en el canvas; redibujar en `contextrestored` y en `visibilitychange`; el botón del S Pen borra; sin Firebase Storage; la tinta casi negra se dibuja clara en papel oscuro; el PDF con jsPDF bajo demanda.
- **Emuladores:** `npm run emulators` + `npm run dev:emu` (proyecto `demo-pizarra`, configuración en `.env.emu`, sin credenciales). En desarrollo existe `window.__pizarra` (`note`, `board`).

## Estructura

```
src/
  firebase/   app.ts, auth.ts (anónima), db.ts (Firestore offline), rooms.ts (rutas, salas, miembros, permisos),
              roomSync.ts (sala abierta ⇄ Firestore), syncStatus.ts
  lib/        roomCode.ts (+test: códigos), localRooms.ts (nombre y salas recientes), errors.ts, time.ts (+test),
              theme.ts, assets.ts, inputPrefs.ts, toolPrefs.ts, layoutMode.ts
  model/      types.ts, geometry.ts (+test), background.ts (+test), history.ts, note.ts (+test), pages.ts, codec.ts (+test)
  canvas/     Board.ts (motor; opción canEdit y clearPage), Viewport.ts (+test), InputController.ts, palm.ts (+test),
              Renderer.ts, strokeOutline.ts, layout.ts, backgrounds.ts (+test), renderPage.ts
  recognition/ reconocimiento de formas (+test)
  export/     exporters.ts (+test)
  ui/         Home (nombre, crear, entrar, recientes), RoomRoute (sala: nombre, administración, presencia),
              Participants (lista y permisos), ShareDialog (código, enlace, enlace de administración),
              NoteEditor (readOnly, headerExtra, banner), Toolbar, SelectionBar, BackgroundPanel, ExportDialog, Dialog,
              SyncBadge, Splash, SetupMissing, ThemeButton, UpdatePrompt, Icon
  App.tsx     rutas (/, /sala/:code) y conexión anónima
scripts/test-rules.mjs       pruebas de las reglas (npm run test:rules)
firestore.rules, firestore.indexes.json, firebase.json, .env.emu
.github/workflows/pages.yml
```
