# Pizarra

Pizarra online para trabajar, estudiar o dar clases en vivo. Se entra con un **código de sala**, sin crear cuentas. Quien crea la sala decide quién puede dibujar.

Usa el mismo motor de dibujo que [Notillas](https://github.com/jsantiago00/Notillas): presión del lápiz, rechazo de palma, formas, goma, lazo y exportación.

> **Estado:** etapa 1 (salas, permisos y dibujo en tiempo real). El plan está en [PLAN.md](PLAN.md).

## Qué hace

- **Salas con código:** creás una sala y pasás el código (`ABC-234`) o el enlace. Para entrar alcanza con escribir tu nombre.
- **Permisos:** al crear la sala elegís si dibujan **todos** o **solo vos y a quien habilites**. Desde **Participantes** cambiás eso en cualquier momento, habilitás o deshabilitás a cada persona, o la sacás de la sala.
- **Tiempo real:** cada trazo aparece en las pantallas de los demás al levantar el lápiz.
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
| `npm run test:rules` | Prueba las reglas de Firestore en el emulador. |
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
rooms/{código}              título, quién puede dibujar, personas sacadas, orden de las páginas
  secret/admin              la clave del enlace de administración (nadie la puede leer)
  admins/{uid}              quienes administran
  members/{uid}             nombre y última vez visto (para la lista de participantes)
  pages/{id}/strokes/{id}   un documento por trazo, con los puntos comprimidos en bytes
```

Cada navegador es un usuario anónimo de Firebase. Las salas en las que estuviste y tu nombre quedan guardados en ese dispositivo.
