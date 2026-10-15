# Pizarra: plan de desarrollo

Pizarra online compartida: se entra con un código de sala, sin cuentas, y quien crea la sala decide quién dibuja. Sirve para trabajar con alguien, estudiar o dar clases de apoyo.

## 1. Decisiones principales

| Tema | Decisión | Por qué |
|---|---|---|
| Base | El motor de **Notillas** (lienzo, entrada, herramientas, formas, exportar), copiado tal cual | Ya está probado con el S Pen y la tablet del usuario. Lo nuevo de esta app son las salas y los permisos. |
| Identidad | **Auth anónima** de Firebase: cada navegador es un usuario, y el nombre lo escribe la persona | «No hace falta loguear». Las reglas igual necesitan un `uid` para saber quién administra y quién dibuja. |
| Hojas | Las mismas **A4 apiladas** de Notillas | Sirven para clases (cuadriculada, rayada) y se exportan a PDF tal cual. Una pizarra infinita queda como idea para más adelante. |
| Tiempo real | **Firestore**: un documento por trazo, lotes cada 60 ms, `onSnapshot` incremental (el `NoteSync` de Notillas, ahora `RoomSync`) | Funciona igual, conflictos limitados a un trazo, y sin servidor propio. El trazo aparece al levantar el lápiz. |
| Código | 6 caracteres sin los que se confunden (0/O, 1/I/L), unos 900 millones de combinaciones | Se dicta y se copia fácil. Las salas no se pueden listar, así que hay que saber el código. |
| Administración | Quien crea la sala tiene una **clave**. Con el enlace `…/sala/CODIGO#admin=clave`, otro dispositivo se suma como administrador | Sin cuentas no hay otra forma de que el profe use la sala desde la compu y la tablet. La clave está en un documento que nadie puede leer, y las reglas la comparan al crear `admins/{uid}`. |
| Permisos | `editMode` (`all` o `some`), `editors` y `banned`, todo en el documento de la sala | Las reglas lo resuelven con un solo `getAfter` de la sala, también en lotes de cientos de trazos. |
| Presencia | Estar en `live/{code}/{uid}` (Realtime Database, se borra al desconectarse); de respaldo, `members/{uid}.lastSeen` cada 45 s | Exacto y sin escrituras de más. |
| En vivo | **Realtime Database**: el trazo en curso en pedazos base64 (solo lo nuevo, cada 50 ms), el puntero y la vista, en coordenadas de la página o del mundo | No cobra por escritura (Firestore sí) y tiene `onDisconnect`. Lo definitivo sigue yendo por Firestore: el «en vivo» se deja de mostrar cuando llega el trazo confirmado (`d` = su id). |
| Cuentas | Anónimo por defecto; **Google opcional** con `linkWithPopup` (el anónimo se convierte en la cuenta y conserva el uid). Si la cuenta ya existía, se entra con ella y la administración se recupera con las claves guardadas en el dispositivo | Pedido del usuario: sin cuenta no se guarda nada, con cuenta se guardan las pizarras. |
| «Mis pizarras» | Una **copia** por sala en `users/{uid}/boards/{code}`, con los trazos en pedazos de hasta ~700 KB | Para repasar aunque la sala cambie o se borre. Guardar una clase son 2 o 3 escrituras. |

## 2. Modelo de datos (Firestore)

```
rooms/{code}                { title, editMode: 'all'|'some', editors: {uid: true}, banned: {uid: true},
                              pageIds: string[], createdAt, updatedAt }
  secret/admin              { key }                     nadie lo lee; solo se crea junto con la sala
  admins/{uid}              { key }                     se crea solo si key == secret/admin.key
  members/{uid}             { name, admin, joinedAt, lastSeen }
  (follow: uid en el documento de la sala: todos siguen su vista)
  pages/{pageId}            { width, height, background, createdAt, updatedAt }
    strokes/{strokeId}      { tool, color, size, opacity, pts: Bytes, n, bbox, z, simulated, shape?, createdAt, by }
users/{uid}/boards/{code}   { code, title, savedAt, pages: [{ width, height, background }], chunkIds, strokes, thumb }
  chunks/{página-parte}     { page, strokes: [{ tool, color, size, opacity, pts: Bytes, bbox, z, simulated, shape? }] }
```

Realtime Database:

```
live/{code}/{uid}           { n: nombre, c: color, t, cur: {x, y}, v: {x, y, w, h},
                              s: { id, pg, tl, cl, sz, op, sm, r, k: {0: base64, 1: …}, d? } }
```

- La sala, su clave, la primera página, el primer administrador y su ficha se crean en **un mismo lote**. Si el código ya existe, las reglas lo rechazan (sería una modificación, no una creación) y se prueba con otro.
- **Quien puede dibujar** puede cambiar `pageIds` (agregar, borrar u ordenar páginas), pero no el título ni los permisos.
- **Quien administra** cambia el título y los permisos, y saca gente: la anota en `banned` y borra su ficha.
- Las pruebas de las reglas están en `scripts/test-rules.mjs`.

## 3. Etapas

Al final de cada una te paso cómo probarla y espero tu OK.

| # | Etapa | Entregable |
|---|---|---|
| 1 ✅ | Salas y permisos | Crear sala, entrar con código o enlace, nombre, sincronización en tiempo real, quién dibuja (todos o habilitados), participantes conectados, sacar de la sala, enlace de administración, borrar todo, solo mirar, publicación en GitHub Pages |
| 2 ✅ | En vivo y cuenta | Ver el trazo de los demás **mientras** lo dibujan y sus punteros con el nombre; «seguir mi vista» para que el alumno vea lo mismo que el profe (Realtime Database). Además, login con Google opcional y «Mis pizarras» con la copia de cada sala |
| 3 | Herramientas de clase | Texto con teclado, imágenes (una foto del ejercicio) comprimidas dentro de Firestore, regla y transportador, puntero láser que se borra solo |
| 4 | Gestión de salas | Cerrar o borrar una sala, duplicarla como plantilla, salas que vencen solas, exportar la clase al final |
| 5 (opcional) | Salas de la cuenta | Que quien administra con Google vea sus salas (no solo las copias) en todos sus dispositivos, sin el enlace de administración |

## 4. Riesgos y temas abiertos

- **Sin cuentas, la administración vive en el dispositivo.** Si el profe borra los datos del navegador, pierde la administración, salvo que tenga guardado el enlace de administración. La app lo ofrece en **Invitar**.
- **Sacar a alguien** bloquea ese navegador (su `uid` anónimo). Con otro navegador o en incógnito puede volver a entrar con el código. Para clases de apoyo alcanza; si hiciera falta más, la sala puede pasar a «solo quienes habilite».
- **Costo:** cada trazo es una escritura, y una lectura por cada persona en la sala. Para clases de pocas personas el plan gratis sobra (ver [docs/FIREBASE.md](docs/FIREBASE.md)).
