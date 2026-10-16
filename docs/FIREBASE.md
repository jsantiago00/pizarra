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

   Hay una séptima variable, **opcional**: `VITE_FIREBASE_DATABASE_URL`, la dirección de Realtime Database (paso 6). Solo hace falta si la creás en una ubicación que no sea Estados Unidos.

Estos valores no son secretos (viajan al navegador de todos modos). Lo que protege los datos son las reglas del paso 5.

## 3. Activar el acceso anónimo y el de Google

Sin cuenta, cada navegador entra como un usuario anónimo, sin que la persona haga nada. Con Google, además se guardan sus pizarras en «Mis pizarras».

1. Menú **Compilación → Authentication → Comenzar**.
2. Pestaña **Método de acceso → Agregar proveedor nuevo → Anónimo**. Activalo y guardá.
3. **Agregar proveedor nuevo → Google**. Activalo, elegí tu mail como **correo de asistencia** y guardá.
4. Pestaña **Configuración → Dominios autorizados → Agregar dominio**: `santiagososa.com.ar` (el dominio donde se publica). Sin esto, el botón «Entrar con Google» da error de dominio no autorizado. `localhost` ya viene cargado.

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

## 6. Crear Realtime Database (lo en vivo)

Los trazos mientras se dibujan, los punteros y «seguir mi vista» van por Realtime Database, que no cobra por escritura y avisa sola cuando alguien se desconecta. Sin ella, la sala anda igual, pero los trazos aparecen recién al levantar el lápiz.

1. Menú **Compilación → Realtime Database → Crear una base de datos**.
2. Ubicación: **Estados Unidos (us-central1)**. Si elegís otra, cargá su dirección (la que aparece arriba de los datos, `https://…firebasedatabase.app`) en la variable `VITE_FIREBASE_DATABASE_URL`.
3. Empezá en **modo bloqueado**.
4. En la pestaña **Reglas**, borrá lo que hay, pegá el contenido de [`database.rules.json`](../database.rules.json) y tocá **Publicar**. Con el CLI: `firebase deploy --only database`.

### Qué permiten las reglas

- Con el código se puede abrir una sala, pero **no se pueden listar**: no hay forma de ver las salas de otros.
- **Dibujan** quienes administran la sala y, según la sala, todos o solo quienes estén habilitados.
- **Administra** quien creó la sala, y quien abre el **enlace de administración**, que lleva una clave que nadie puede leer de la base.
- Quien fue **sacado de la sala** no la puede abrir, ni leer, ni dibujar, ni volver a entrar desde ese dispositivo.
- **«Mis pizarras»** (`users/{uid}`): cada persona lee y escribe solo las suyas.
- **En vivo** (Realtime Database): cada uno escribe solo su parte (`live/{código}/{su uid}`) y lee la de su sala; no se puede listar el conjunto de salas.
- Las pruebas están en `scripts/test-rules.mjs` (`npm run test:rules`).

## Cuánto entra en el plan gratis

**Firestore**, por día: 50 000 lecturas y 20 000 escrituras. Cada trazo es una escritura, y una lectura por cada persona que lo recibe. Una clase de una hora con unos 500 trazos y dos personas usa del orden de 1000 escrituras y 1000 lecturas, así que sobra. Guardar la copia en «Mis pizarras» son 2 o 3 escrituras.

**Realtime Database:** 100 conexiones a la vez y 10 GB de descarga por mes. Lo en vivo manda solo lo nuevo de cada trazo: una clase de una hora es del orden de unos pocos MB.

## Problemas frecuentes

| Mensaje | Qué hacer |
|---|---|
| «El acceso anónimo no está habilitado…» | Activá el proveedor Anónimo (paso 3). |
| «Este dominio (…) no está autorizado» al entrar con Google | Agregalo en Authentication → Configuración → Dominios autorizados (paso 3). |
| No se ven los trazos mientras se dibujan, ni los punteros | Falta crear Realtime Database o publicar sus reglas (paso 6). |
| «Firebase rechazó el acceso…» al crear una sala | No están publicadas las reglas (paso 5), o la app usa otro proyecto: revisá las variables. |
| «Firestore no está listo en este proyecto» | Falta crear la base de datos (paso 4). |
| «Falta configurar Firebase» al abrir la app publicada | Faltan las variables `VITE_FIREBASE_*` en GitHub (paso 2). Después de cargarlas, volvé a correr el workflow. |

## Opcional: escritura a mano → fórmula (MyScript)

Para que aparezca **«A fórmula»** al seleccionar con el lazo algo escrito a mano:

1. Creá una cuenta gratis en <https://developer.myscript.com> y pedí las claves de la **Cloud API** (iink). Te da una **Application key** y una **HMAC key**.
2. En el panel de MyScript, restringí las claves al dominio de la app (`santiagososa.com.ar`), si lo permite: las claves viajan al navegador.
3. En GitHub, **Settings → Secrets and variables → Actions → Variables**, creá `VITE_MYSCRIPT_APP_KEY` y `VITE_MYSCRIPT_HMAC_KEY`, y volvé a correr el workflow.

Sin estas variables la opción no aparece y el resto anda igual. El plan gratis tiene un límite mensual de reconocimientos: alcanza de sobra para clases.
