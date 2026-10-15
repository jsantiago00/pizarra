# Pizarra

Pizarra online para trabajar, estudiar o dar clases en vivo. Se entra con un **código de sala**, sin crear cuentas. Quien crea la sala decide quién puede dibujar. Quien entra con Google, además, guarda las pizarras en las que participó.

Usa el mismo motor de dibujo que [Notillas](https://github.com/jsantiago00/Notillas): presión del lápiz, rechazo de palma, formas, goma, lazo y exportación.

> **Estado:** etapas 1 (salas y permisos) y 2 (en vivo y cuenta de Google). El plan está en [PLAN.md](PLAN.md).

## Qué hace

- **Salas con código:** creás una sala y pasás el código (`ABC-234`) o el enlace. Para entrar alcanza con escribir tu nombre.
- **Permisos:** al crear la sala elegís si dibujan **todos** o **solo vos y a quien habilites**. Desde **Participantes** cambiás eso en cualquier momento, habilitás o deshabilitás a cada persona, o la sacás de la sala.
- **En vivo:** los demás ven tu trazo **mientras** lo dibujás, y el puntero de cada uno con su nombre.
- **Seguir mi vista:** quien administra puede hacer que todos vean lo mismo que ve en su pantalla (la parte de la hoja y el zoom). Cada uno puede dejar de seguir esa vista moviendo la hoja, y volver con un toque.
- **Con Google o sin cuenta:** sin cuenta no se guarda nada. Con Google, cada sala en la que participás se guarda sola en **Mis pizarras** (al salir, al cerrar la pestaña y cada dos minutos): una copia para repasar y exportar a PDF aunque la sala cambie o se borre.
- **Varios dispositivos tuyos:** el **enlace de administración** (en **Invitar**) te deja administrar la sala desde otro dispositivo, por ejemplo la tablet y la compu.
- **Lo de Notillas:** lapicera con presión, resaltador, goma por trazo o por área (también con el botón del S Pen), lazo, formas (dejá el lápiz quieto medio segundo), deshacer, hojas A4 apiladas lisas, rayadas, cuadriculadas o punteadas, y exportar a PDF o PNG.
- **Para quien administra:** «Borrar todo lo de esta página», en el menú ⋯. Se puede deshacer.

## Requisitos

- Node **20.19+** o **22.12+**.
- Un proyecto de Firebase: la guía está en [docs/FIREBASE.md](docs/FIREBASE.md).

## Correr en local

Sin tocar Firebase, contra los emuladores (hace falta Java y `firebase-tools`):

```sh
npm install
npm run emulators      # en una terminal
npm run dev:emu        # en otra: http://localhost:5173
```

Para probar con dos personas, abrí la app en dos navegadores distintos, o en una ventana normal y otra de incógnito. Cada navegador es una persona distinta.

Contra el proyecto real: copiá `.env.example` como `.env`, completalo y corré `npm run dev`.

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo con el proyecto de Firebase del `.env`. |
| `npm run dev:emu` | Servidor de desarrollo contra los emuladores (usa `.env.emu`). |
| `npm run dev:lan` | Por HTTPS en tu red local, para el celular o la tablet. |
| `npm test` | Tests unitarios (Vitest). |
| `npm run test:rules` | Prueba las reglas de Firestore y Realtime Database en el emulador. |
| `npm run typecheck` / `npm run lint` | TypeScript y ESLint. |
| `npm run build` | Build de producción en `dist/`, con el service worker. |
| `npm run icons` | Regenera los íconos a partir de `public/logo.svg`. |

## Publicar en GitHub Pages

El workflow `.github/workflows/pages.yml` compila y publica en cada push a `main`. También se puede lanzar a mano desde la pestaña **Actions**.

Una sola vez:

1. En el repo, **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. En **Settings → Secrets and variables → Actions → Variables**, creá las seis variables `VITE_FIREBASE_*` ([docs/FIREBASE.md](docs/FIREBASE.md), paso 2).

La app queda en `https://<usuario>.github.io/pizarra/`, o en tu dominio propio si la cuenta lo tiene (`https://santiagososa.com.ar/pizarra/`).

## Cómo se guardan las salas

```
rooms/{código}              título, quién puede dibujar, personas sacadas, a quién se sigue, orden de las páginas
  secret/admin              la clave del enlace de administración (nadie la puede leer)
  admins/{uid}              quienes administran
  members/{uid}             nombre y última vez visto (para la lista de participantes)
  pages/{id}/strokes/{id}   un documento por trazo, con los puntos comprimidos en bytes
users/{uid}/boards/{código} la copia de «Mis pizarras» (con Google), con los trazos en pocos documentos grandes
```

Y en Realtime Database, lo efímero: `live/{código}/{uid}` con el puntero, lo que se ve y el trazo en curso. Se borra solo al desconectarse.

Sin cuenta, cada navegador es un usuario anónimo de Firebase. Al entrar con Google, ese usuario anónimo se convierte en tu cuenta: seguís siendo la misma persona en las salas (y seguís administrando las tuyas). Las salas recientes y tu nombre quedan guardados en el dispositivo.
