// Prueba las reglas de Firestore contra el emulador, con usuarios anónimos de verdad.
// Se corre con `npm run test:rules` (levanta los emuladores, corre esto y los apaga).
import assert from 'node:assert/strict'
import { deleteApp, initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth'
import {
  Bytes,
  connectFirestoreEmulator,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  collection,
  initializeFirestore,
  serverTimestamp,
  setDoc,
  updateDoc,
  setLogLevel,
  writeBatch,
} from 'firebase/firestore'

// Los rechazos esperados no ensucian la salida
setLogLevel('silent')

const config = { apiKey: 'demo-key', projectId: 'demo-pizarra', appId: '1:0:web:0', authDomain: 'demo-pizarra.firebaseapp.com' }
const apps = []

async function user(name) {
  const app = initializeApp(config, name)
  apps.push(app)
  const auth = getAuth(app)
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  const { user } = await signInAnonymously(auth)
  const db = initializeFirestore(app, {})
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  return { uid: user.uid, db }
}

const KEY = 'clave-de-administracion-larga-123'
const bg = { type: 'grid', spacing: 42, color: '#c4c8ce', paper: '#ffffff' }

function stroke(uid, extra = {}) {
  return {
    tool: 'pen',
    color: '#000',
    size: 4,
    opacity: 1,
    pts: Bytes.fromUint8Array(new Uint8Array(10)),
    n: 2,
    bbox: [0, 0, 1, 1],
    z: Date.now(),
    simulated: false,
    createdAt: serverTimestamp(),
    by: uid,
    ...extra,
  }
}

async function createRoom(u, code, editMode = 'all') {
  const b = writeBatch(u.db)
  b.set(doc(u.db, 'rooms', code), { title: 'Prueba', editMode, editors: {}, banned: {}, pageIds: ['p1'], createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
  b.set(doc(u.db, 'rooms', code, 'secret', 'admin'), { key: KEY })
  b.set(doc(u.db, 'rooms', code, 'admins', u.uid), { key: KEY })
  b.set(doc(u.db, 'rooms', code, 'pages', 'p1'), { width: 1240, height: 1754, background: bg, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
  b.set(doc(u.db, 'rooms', code, 'members', u.uid), { name: 'Profe', admin: true, joinedAt: serverTimestamp(), lastSeen: serverTimestamp() })
  await b.commit()
}

const ok = (p, what) => p.then(() => {}, (e) => assert.fail(`${what}: debería poder (${e.code})`))
const denied = (p, what) =>
  p.then(
    () => assert.fail(`${what}: no debería poder`),
    (e) => assert.equal(e.code, 'permission-denied', `${what}: ${e.message}`),
  )

let passed = 0
async function test(name, fn) {
  await fn()
  passed++
  console.log(`  ✓ ${name}`)
}

const profe = await user('profe')
const alumno = await user('alumno')
const otro = await user('otro')

console.log('Reglas de Firestore')

await test('crear una sala con su clave, su página y quien la crea como administrador', () => createRoom(profe, 'ABC234', 'some'))

await test('no se puede crear una sala con un código que ya existe', () =>
  denied(createRoom(otro, 'ABC234'), 'pisar una sala existente'),
)

await test('no se puede crear una sala sin ser su administrador', async () => {
  const b = writeBatch(otro.db)
  b.set(doc(otro.db, 'rooms', 'XYZ789'), { title: '', editMode: 'all', editors: {}, banned: {}, pageIds: [], createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
  await denied(b.commit(), 'crear sala sin admins')
})

await test('nadie lee la clave de administración', () => denied(getDoc(doc(alumno.db, 'rooms', 'ABC234', 'secret', 'admin')), 'leer la clave'))
await test('no se pueden listar las salas', () => denied(getDocs(collection(alumno.db, 'rooms')), 'listar salas'))
await test('con el código se puede abrir la sala', () => ok(getDoc(doc(alumno.db, 'rooms', 'ABC234')), 'abrir la sala'))
await test('una sala que no existe se puede consultar (para validar el código)', async () => {
  const snap = await getDoc(doc(alumno.db, 'rooms', 'NOPE22'))
  assert.equal(snap.exists(), false)
})

await test('entrar a la sala con mi nombre', () =>
  ok(setDoc(doc(alumno.db, 'rooms', 'ABC234', 'members', alumno.uid), { name: 'Juli', admin: false, joinedAt: serverTimestamp(), lastSeen: serverTimestamp() }), 'entrar'),
)
await test('no puedo decir que administro si no es cierto', () =>
  denied(setDoc(doc(alumno.db, 'rooms', 'ABC234', 'members', alumno.uid), { name: 'Juli', admin: true, joinedAt: serverTimestamp(), lastSeen: serverTimestamp() }), 'admin falso'),
)
await test('no puedo anotar a otra persona', () =>
  denied(setDoc(doc(alumno.db, 'rooms', 'ABC234', 'members', otro.uid), { name: 'X', admin: false, joinedAt: serverTimestamp(), lastSeen: serverTimestamp() }), 'anotar a otro'),
)

const strokeDoc = (u, id) => doc(u.db, 'rooms', 'ABC234', 'pages', 'p1', 'strokes', id)

await test('en modo «solo quienes habilite», quien no está habilitado no dibuja', () => denied(setDoc(strokeDoc(alumno, 's1'), stroke(alumno.uid)), 'dibujar sin permiso'))
await test('ni agrega páginas', () => denied(updateDoc(doc(alumno.db, 'rooms', 'ABC234'), { pageIds: ['p1', 'p2'] }), 'agregar página'))
await test('quien administra dibuja', () => ok(setDoc(strokeDoc(profe, 's0'), stroke(profe.uid)), 'dibujar como admin'))
await test('quien no administra no cambia los permisos', () =>
  denied(updateDoc(doc(alumno.db, 'rooms', 'ABC234'), { [`editors.${alumno.uid}`]: true }), 'darse permiso'),
)
await test('quien administra habilita a alguien', () => ok(updateDoc(doc(profe.db, 'rooms', 'ABC234'), { [`editors.${alumno.uid}`]: true }), 'habilitar'))
await test('la persona habilitada dibuja', () => ok(setDoc(strokeDoc(alumno, 's1'), stroke(alumno.uid)), 'dibujar habilitado'))
await test('y borra trazos', () => ok(deleteDoc(strokeDoc(alumno, 's0')), 'borrar trazo'))
await test('y agrega páginas, pero no toca el título', async () => {
  const b = writeBatch(alumno.db)
  b.set(doc(alumno.db, 'rooms', 'ABC234', 'pages', 'p2'), { width: 1240, height: 1754, background: bg, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
  b.update(doc(alumno.db, 'rooms', 'ABC234'), { pageIds: ['p1', 'p2'], updatedAt: serverTimestamp() })
  await ok(b.commit(), 'agregar página')
  await denied(updateDoc(doc(alumno.db, 'rooms', 'ABC234'), { title: 'Mía' }), 'cambiar el título')
})
await test('un trazo no puede figurar como de otra persona', () => denied(setDoc(strokeDoc(alumno, 's2'), stroke(profe.uid)), 'firmar como otro'))
await test('un lote grande de trazos (300) entra de una vez', async () => {
  const b = writeBatch(alumno.db)
  for (let i = 0; i < 300; i++) b.set(strokeDoc(alumno, `lote${i}`), stroke(alumno.uid))
  await ok(b.commit(), 'lote de 300')
})
await test('quien administra le saca el permiso', () => ok(updateDoc(doc(profe.db, 'rooms', 'ABC234'), { [`editors.${alumno.uid}`]: deleteField() }), 'quitar permiso'))
await test('y ya no dibuja', () => denied(setDoc(strokeDoc(alumno, 's3'), stroke(alumno.uid)), 'dibujar sin permiso'))
await test('con «todos dibujan», cualquiera dibuja', async () => {
  await ok(updateDoc(doc(profe.db, 'rooms', 'ABC234'), { editMode: 'all' }), 'cambiar a todos')
  await ok(setDoc(strokeDoc(otro, 's4'), stroke(otro.uid)), 'dibujar en modo todos')
})

await test('con una clave equivocada no se administra', () => denied(setDoc(doc(otro.db, 'rooms', 'ABC234', 'admins', otro.uid), { key: 'cualquiera-cualquiera-1' }), 'clave falsa'))
await test('con el enlace de administración (clave correcta) sí', async () => {
  const profe2 = await user('profe-tablet')
  await ok(setDoc(doc(profe2.db, 'rooms', 'ABC234', 'admins', profe2.uid), { key: KEY }), 'clave correcta')
  await ok(updateDoc(doc(profe2.db, 'rooms', 'ABC234'), { title: 'Desde la tablet' }), 'renombrar desde la tablet')
})

await test('quien administra saca a alguien de la sala', async () => {
  await ok(updateDoc(doc(profe.db, 'rooms', 'ABC234'), { [`banned.${otro.uid}`]: true }), 'expulsar')
  await ok(deleteDoc(doc(profe.db, 'rooms', 'ABC234', 'members', otro.uid)), 'borrar de la lista')
})
await test('quien fue sacado no abre la sala, no lee ni dibuja ni vuelve a entrar', async () => {
  await denied(getDoc(doc(otro.db, 'rooms', 'ABC234')), 'abrir la sala')
  await denied(getDocs(collection(otro.db, 'rooms', 'ABC234', 'pages', 'p1', 'strokes')), 'leer trazos')
  await denied(setDoc(strokeDoc(otro, 's5'), stroke(otro.uid)), 'dibujar')
  await denied(
    setDoc(doc(otro.db, 'rooms', 'ABC234', 'members', otro.uid), { name: 'X', admin: false, joinedAt: serverTimestamp(), lastSeen: serverTimestamp() }),
    'volver a entrar',
  )
})
await test('los demás siguen leyendo', () => ok(getDocs(collection(alumno.db, 'rooms', 'ABC234', 'pages', 'p1', 'strokes')), 'leer trazos'))

console.log(`\n${passed} pruebas pasaron`)
await Promise.all(apps.map((a) => deleteApp(a)))
process.exit(0)
