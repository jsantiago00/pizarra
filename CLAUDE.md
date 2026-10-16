# Pizarra: guía para trabajar en el proyecto

**Pizarra** es una pizarra online compartida por código de sala: Vite, React 19, TypeScript, Canvas, perfect-freehand y Firebase (Auth anónima o con Google, Firestore y Realtime Database). El motor de dibujo viene de **Notillas** (`jsantiago00/Notillas`). Toda la interfaz está en español rioplatense (voseo).

- **Plan** (decisiones, modelo de datos y etapas): [PLAN.md](PLAN.md). Leelo primero.
- **Cómo correr, probar y publicar:** [README.md](README.md). **Configurar Firebase:** [docs/FIREBASE.md](docs/FIREBASE.md).
- **Repo:** `jsantiago00/pizarra`. Se publica en GitHub Pages con `.github/workflows/pages.yml` en cada push a `main` (`https://santiagososa.com.ar/pizarra/`).
- **Firebase:** un proyecto propio, **no** el de Notillas (cada proyecto tiene un solo archivo de reglas). La configuración va en las variables de Actions `VITE_FIREBASE_*` y, en local, en `.env`. `VITE_FIREBASE_DATABASE_URL` es opcional (por defecto, la de us-central1).

## Estado

| Etapa | Estado |
|---|---|
| 1. Salas y permisos | ✅ Hecha |
| 2. En vivo (trazo en curso, punteros, seguir la vista) y cuenta de Google con «Mis pizarras» | ✅ Hecha (a confirmar en la tablet) |
| 3. Texto, fórmulas y figuras (ejes, funciones, recta numérica); escritura → fórmula con MyScript | ✅ Hecha (a confirmar; MyScript sin probar hasta tener clave) |
| 4. Gestión de salas | Pendiente |

Actualizá esta tabla en el mismo commit que cierra cada etapa.

## Cómo trabajar (acordado con el usuario en Notillas)

- **Una etapa por vez.** Al terminar cada una, explicá cómo probarla (en la compu, el celular y la tablet) y **esperá su confirmación** antes de seguir.
- **Antes de commitear,** todo en verde: `npx tsc -b && npx eslint . && npx vitest run && npx vite build`. Si tocaste `firestore.rules` o `database.rules.json`, también `npm run test:rules`.
- **En este entorno** la CLI de Firebase manda por el proxy hasta los pedidos a `localhost`, y el emulador de Realtime Database no carga las reglas: corré los emuladores con `HTTPS_PROXY= https_proxy= npm run test:rules` (o `… npx firebase emulators:start …`). No salen a internet.
- **Push:** el usuario prueba sobre lo publicado, así que pusheá a `main` (además de la rama de la sesión).
- **Commits:** autor `juansantiagososa00 <juansantiagososa00@gmail.com>`, mensaje en español.
- **Dispositivos del usuario:** una tablet Android con S Pen (Chrome) y el celular. Probá con Playwright: Chromium está en `/opt/pw-browsers` y playwright en `/opt/node-tools/node_modules/playwright`. Emulá una tablet de 1280×800 y de 800×1280, y un celular de 390×780. Para probar la sala, usá **dos contextos de navegador** (dos personas) contra los emuladores.

## Decisiones ya tomadas (no las vuelvas a discutir)

- **Cuentas:** anónima automática por defecto; Google opcional con `linkWithPopup` (conserva el uid). Si la cuenta ya existía, `signInWithCredential` y la administración se recupera con las claves de `localStorage`. Sin cuenta no se guarda nada. Todo en `src/firebase/auth.ts`; en los emuladores, `window.__pizarraAuth.signInForTests(sub, email, nombre)`.
- **«Mis pizarras»:** copia por sala en `users/{uid}/boards/{code}` (`src/firebase/library.ts`, `BoardSaver`): al salir, en `visibilitychange: hidden` y cada 2 min si cambió algo.
- **En vivo** por Realtime Database (`src/firebase/live.ts`, `src/ui/useRoomLive.ts`): el `Board` avisa con `onLive`, `onCursor`, `onView` y `onUserView`, y recibe `setRemote` y `showRect`. Si la base no existe, la sala anda igual sin esto.
- **Seguir la vista:** `follow` (uid) en el documento de la sala, solo lo cambia quien administra. Quien sigue deja de seguir al mover la hoja (`onUserView`).
- **Administración:** `rooms/{code}/admins/{uid}` existe si administrás. Se crea con la clave de `secret/admin`, que nadie puede leer. El enlace es `/sala/CODIGO#admin=clave`; la clave se guarda en `localStorage` del dispositivo que la tiene.
- **Permisos en el documento de la sala:** `editMode` (`all`/`some`), `editors`, `banned`. `canEdit()` en `rooms.ts` replica en el cliente lo que dicen las reglas.
- **Solo mirar:** `NoteEditor` con `readOnly` esconde las herramientas, y `Board` (opción `canEdit`) no dibuja: el lápiz y el dedo desplazan la hoja.
- **Sincronización:** igual que en Notillas. Todo cambio pasa por `NoteModel`, y `RoomSync` lo escribe en lotes cada 60 ms. Lo remoto entra con `applyRemote`, y el eco propio se reconoce por la firma del trazo. Los trazos llevan `by` (el `uid`).
- **Las reglas usan `getAfter`/`existsAfter`** para las escrituras: así la sala y su primera página entran en un mismo lote.
- **Ruta base:** `BASE_PATH` es `/<repo>/` en Pages. Para `public/` usá `asset()` o `LOGO`; en `index.html`, `%BASE_URL%`. Nunca rutas absolutas.
- **Lo heredado de Notillas sigue valiendo:** nada de `desynchronized: true` en el canvas; redibujar en `contextrestored` y en `visibilitychange`; el botón del S Pen borra; sin Firebase Storage; la tinta casi negra se dibuja clara en papel oscuro; el PDF con jsPDF bajo demanda.
- **Objetos:** texto, fórmula, ejes y recta numérica son `Stroke` con `item` (`model/types.ts`); se dibujan en `items/draw.ts` (pantalla, miniaturas, PNG y PDF). Las fórmulas: AsciiMath → TeX (`asciimath2tex`) → MathJax SVG (`items/mathjax.ts`, cargado bajo demanda desde `items/math.ts`). Vite define `global` = `globalThis` por MathJax.
- **Editor de texto y fórmulas:** `ui/ItemEditor.tsx` sobre la hoja (sigue el zoom); `ui/useItems.tsx` arma inserción, diálogos (`FigureDialogs.tsx`) y acciones de la selección. El `Board` avisa con `onPlace` y expone `replace`, `selectStroke`, `selectedItem`, `selectedInk`, `viewCenter`, `pageToScreen`, `setEditing`.
- **MyScript:** `items/handwriting.ts`, con `VITE_MYSCRIPT_APP_KEY` y `VITE_MYSCRIPT_HMAC_KEY`; sin claves no aparece.
- **Emuladores:** `npm run emulators` + `npm run dev:emu` (proyecto `demo-pizarra`, configuración en `.env.emu`, sin credenciales). En desarrollo existe `window.__pizarra` (`note`, `board`).

## Estructura

```
src/
  firebase/   app.ts, auth.ts (anónima o Google), db.ts (Firestore offline), rooms.ts (rutas, salas, miembros, permisos),
              roomSync.ts (sala abierta ⇄ Firestore), live.ts (Realtime Database: en vivo), library.ts («Mis pizarras»),
              syncStatus.ts
  lib/        roomCode.ts (+test: códigos), localRooms.ts (nombre y salas recientes), people.ts (color e iniciales), errors.ts, time.ts (+test),
              theme.ts, assets.ts, inputPrefs.ts, toolPrefs.ts, layoutMode.ts
  model/      types.ts, geometry.ts (+test), background.ts (+test), history.ts, note.ts (+test), pages.ts, codec.ts (+test)
  canvas/     Board.ts (motor; opción canEdit y clearPage), Viewport.ts (+test), InputController.ts, palm.ts (+test),
              Renderer.ts, strokeOutline.ts, layout.ts, backgrounds.ts (+test), renderPage.ts
  items/      expr.ts (+test: funciones para graficar), draw.ts (dibujo de objetos), math.ts + mathjax.ts (+test: fórmulas),
              insert.ts (figuras nuevas), handwriting.ts (+test: MyScript)
  recognition/ reconocimiento de formas (+test)
  export/     exporters.ts (+test)
  ui/         Home (nombre, crear, entrar, «Mis pizarras», recientes), RoomRoute (sala: nombre, administración, guardado),
              useRoomLive (en vivo y seguir la vista), SavedRoute (una copia guardada), AccountButton (Google),
              Participants (lista y permisos), ShareDialog (código, enlace, enlace de administración),
              NoteEditor (readOnly, headerExtra, banner), ItemEditor, useItems, FigureDialogs, Toolbar, SelectionBar, BackgroundPanel, ExportDialog, Dialog,
              SyncBadge, Splash, SetupMissing, ThemeButton, UpdatePrompt, Icon
  App.tsx     rutas (/, /sala/:code, /guardada/:code) y conexión
scripts/test-rules.mjs       pruebas de las reglas (npm run test:rules)
firestore.rules, database.rules.json, firestore.indexes.json, firebase.json, .env.emu
.github/workflows/pages.yml
```
