# Configurar Firebase paso a paso

Alcanza con el **plan Spark** (gratis). Pizarra no usa Cloud Storage, que hoy exige el plan Blaze.

Conviene un **proyecto aparte del de Notillas**. Un proyecto de Firebase tiene un solo archivo de reglas de Firestore, y si las dos apps compartieran proyecto, publicar las reglas de una borraría las de la otra.

## 1. Crear el proyecto

1. Entrá a <https://console.firebase.google.com> y tocá **Crear un proyecto**.
2. Ponele un nombre, por ejemplo `pizarra`. Anotá el **ID del proyecto** que te propone (por ejemplo `pizarra-3f2a1`).
3. Google Analytics no hace falta: podés desactivarlo.

## 2. Registrar la app web y obtener las credenciales

1. En la página del proyecto, tocá el ícono **`</>`** (Web).
2. Como apodo poné `pizarra-web`. No hace falta tildar Firebase Hosting.
3. Firebase te muestra un bloque `const firebaseConfig = { … }`. Esos seis valores van:
   - **en GitHub**, para la versión publicada: en el repo, **Settings → Secrets and variables → Actions → pestaña Variables**, una variable por valor;
   - **en tu compu**, si querés correrla contra el proyecto real: en un archivo `.env`, copiado de `.env.example`.

   | `firebaseConfig` | Variable |
   |---|---|
   | `apiKey` | `VITE_FIREBASE_API_KEY` |
   | `authDomain` | `VITE_FIREBASE_AUTH_DOMAIN` |
   | `projectId` | `VITE_FIREBASE_PROJECT_ID` |
   | `storageBucket` | `VITE_FIREBASE_STORAGE_BUCKET` |
   | `messagingSenderId` | `VITE_FIREBASE_MESSAGING_SENDER_ID` |
   | `appId` | `VITE_FIREBASE_APP_ID` |

   Si los perdés, están en ⚙️ **Configuración del proyecto → General → Tus apps**.

Estos valores no son secretos (viajan al navegador de todos modos). Lo que protege los datos son las reglas del paso 5.

## 3. Activar el acceso anónimo

No hay cuentas: cada navegador entra como un usuario anónimo, sin que la persona haga nada.

1. Menú **Compilación → Authentication → Comenzar**.
2. Pestaña **Método de acceso → Agregar proveedor nuevo → Anónimo**.
3. Activalo y guardá.

## 4. Crear Firestore

1. Menú **Compilación → Firestore Database → Crear base de datos**.
2. Elegí la edición **Standard** si te pregunta.
3. Ubicación: `southamerica-east1 (São Paulo)`, que es la más cercana. **No se puede cambiar después.**
4. Empezá en **modo de producción**: todo queda cerrado hasta que publiques las reglas.

## 5. Publicar las reglas

Elegí una de las dos formas.

**Desde la consola (lo más simple):** en **Firestore Database → Reglas**, borrá lo que hay, pegá el contenido de [`firestore.rules`](../firestore.rules) y tocá **Publicar**.

**Con el CLI:**

```sh
npm install -g firebase-tools
firebase login
firebase use --add          # elegí el proyecto y como alias poné "default"
firebase deploy --only firestore:rules,firestore:indexes
```

Cada vez que cambie `firestore.rules` en el repo hay que volver a publicarlas.

### Qué permiten las reglas

- Con el código se puede abrir una sala, pero **no se pueden listar**: no hay forma de ver las salas de otros.
- **Dibujan** quienes administran la sala y, según la sala, todos o solo quienes estén habilitados.
- **Administra** quien creó la sala, y quien abre el **enlace de administración**, que lleva una clave que nadie puede leer de la base.
- Quien fue **sacado de la sala** no la puede abrir, ni leer, ni dibujar, ni volver a entrar desde ese dispositivo.
- Las pruebas están en `scripts/test-rules.mjs` (`npm run test:rules`).

## Cuánto entra en el plan gratis

Por día: 50 000 lecturas y 20 000 escrituras. Cada trazo es una escritura, y una lectura por cada persona que lo recibe. Una clase de una hora con unos 500 trazos y dos personas usa del orden de 1000 escrituras y 1000 lecturas, así que sobra.

## Problemas frecuentes

| Mensaje | Qué hacer |
|---|---|
| «El acceso anónimo no está habilitado…» | Activá el proveedor Anónimo (paso 3). |
| «Firebase rechazó el acceso…» al crear una sala | No están publicadas las reglas (paso 5), o la app usa otro proyecto: revisá las variables. |
| «Firestore no está listo en este proyecto» | Falta crear la base de datos (paso 4). |
| «Falta configurar Firebase» al abrir la app publicada | Faltan las variables `VITE_FIREBASE_*` en GitHub (paso 2). Después de cargarlas, volvé a correr el workflow. |
