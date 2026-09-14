# UCAio - Backend

API REST de **UCAio**, la plataforma que conecta conductores con propietarios de
estacionamientos para buscar, comparar y reservar lugares disponibles.

Stack: **Node.js + Express 5 + PostgreSQL** (SQL crudo con `pg`, sin ORM).

---

## Puesta en marcha

```bash
npm install
cp .env.example .env        # completar JWT_SECRET (y DATABASE_URL cuando haya base)
npm run db:migrate          # crea tablas, constraints y tipos de vehiculo (requiere DATABASE_URL)
npm run dev
```

La API queda en `http://localhost:3000/api` y `GET /api/health` responde el estado.

### Modo sin base (temporal)

Si no se define `DATABASE_URL`, la API arranca igual y solo acepta el login
hardcodeado **`admin@gmail.com` / `admin123`** (`POST /api/auth/login`, `GET /api/auth/me` y `POST /api/auth/rol`). Tiene los perfiles CONDUCTOR y PROPIETARIO y puede alternar entre ellos.
El resto de los endpoints responde `503`. Al configurar `DATABASE_URL` ese login
deja de funcionar y se usa la tabla `usuario`.

Para usar Neon: crear la base, poner su connection string en `DATABASE_URL`,
`DATABASE_SSL=true` y correr `npm run db:migrate` (aplica `src/db/schema.sql` y `seed.sql`).

### Scripts

| Comando                   | Descripcion                                        |
| ------------------------- | -------------------------------------------------- |
| `npm run dev`             | Servidor con recarga automatica (`node --watch`)    |
| `npm start`               | Servidor en modo produccion                         |
| `npm run db:migrate`      | Aplica `schema.sql` + `seed.sql` leyendo `.env`     |
| `npm run db:migrate:prod` | Igual, pero tomando las env vars del entorno        |

### Variables de entorno

| Variable            | Obligatoria | Default         | Notas                                              |
| ------------------- | ----------- | --------------- | -------------------------------------------------- |
| `DATABASE_URL`      | no (temporal) | —             | Sin ella: modo sin base con admin hardcodeado       |
| `JWT_SECRET`        | si          | —               | Cadena larga y aleatoria                            |
| `PORT`              | no          | `3000`          | Railway la define automaticamente                   |
| `NODE_ENV`          | no          | `development`   |                                                     |
| `API_PREFIX`        | no          | `/api`          |                                                     |
| `DATABASE_SSL`      | no          | `true` en prod  | `true` para proveedores administrados               |
| `DATABASE_POOL_MAX` | no          | `10`            | Conexiones maximas del pool                         |
| `JWT_EXPIRES_IN`    | no          | `1d`            |                                                     |
| `BCRYPT_ROUNDS`     | no          | `10`            |                                                     |

El proceso **falla al arrancar** si falta `JWT_SECRET`, en vez de
levantar y romper en el primer request.

### Despliegue en Railway

1. Crear el proyecto y agregar el plugin **PostgreSQL** (expone `DATABASE_URL`).
2. Definir `JWT_SECRET`, `NODE_ENV=production` y `DATABASE_SSL=true`.
3. `railway.json` ya deja configurado el start command
   (`db:migrate:prod && start`, la migracion es idempotente) y el healthcheck
   sobre `/api/health`.

El servidor escucha en `0.0.0.0`, respeta `PORT`, confia en el proxy
(`trust proxy`) y cierra ordenadamente ante `SIGTERM`.

---

## Estructura

```
src/
├── config/
│   ├── env.js              Variables de entorno validadas al arrancar
│   └── database.js         Pool de pg, helper query() y withTransaction()
├── db/
│   ├── schema.sql          DDL completo (tablas, FKs, UNIQUEs, CHECKs, EXCLUDE)
│   ├── seed.sql            Catalogo TIPO_VEHICULO (Auto / Moto / Camioneta)
│   └── migrate.js          Runner idempotente de schema + seed
├── routes/                 Definicion de endpoints y middlewares por ruta
├── controllers/            Traducen HTTP <-> servicios (sin logica de negocio)
├── services/               Logica de negocio y todo el SQL
├── middlewares/            auth (JWT + roles), validate, notFound, errorHandler
├── validators/             Validacion y normalizacion de la entrada
├── utils/                  ApiError, asyncHandler, jwt, constantes de dominio
├── app.js                  Armado de la app Express
└── index.js                Arranque, healthcheck de DB y shutdown
```

Flujo de un request:

```
routes → middlewares (auth / rol / validate) → controller → service → PostgreSQL
                                                              ↓
                                                  errorHandler (respuesta unica)
```

---

## Modelo de datos

Fiel a `UCAio_modelo_ER.drawio.png`. Ocho tablas:

| Tabla             | PK                   | Restricciones destacadas                                     |
| ----------------- | -------------------- | ------------------------------------------------------------ |
| `usuario`         | `id_usuario` UUID    | `UNIQUE(email)`, `rol` ENUM (CONDUCTOR/PROPIETARIO)           |
| `tipo_vehiculo`   | `id_tipo_vehiculo`   | SMALLINT identity, `UNIQUE(nombre)`                           |
| `estacionamiento` | `id_estacionamiento` | FK → usuario, CHECKs de tarifa y coordenadas                  |
| `horario`         | `id_horario`         | `UNIQUE(id_estacionamiento, dia_semana)`, CHECK 0-6           |
| `excepcion`       | `id`                 | FK → estacionamiento                                          |
| `vehiculo`        | `id_vehiculo`        | **`UNIQUE(patente)`**, FKs → usuario y tipo_vehiculo          |
| `cochera`         | `id_cochera`         | **`UNIQUE(id_estacionamiento, identificador)`**, estado ENUM  |
| `reserva`         | `id_reserva`         | FKs → usuario/vehiculo/cochera, `CHECK (fin > inicio)` y EXCLUDE anti-solapamiento |

### Observaciones sobre el ER

Estas decisiones vale la pena revisarlas con el equipo:

1. **`USUARIO.id_usuario` figura como `ID`** (el resto de las entidades usa UUID).
   Se implemento como `UUID` por consistencia.
2. **`email` no estaba marcado como UNIQUE**, pero el login lo necesita, asi que
   se agrego `usuario_email_unico`.
3. **`inicio` / `fin` de RESERVA y los `created_at` son `TIMESTAMPTZ`**, no
   `TIMESTAMP`. Con `TIMESTAMP` sin zona, un cambio de huso o de horario de
   verano corrompe el calculo de solapamientos.
4. **La tabla `EXCEPCION` parece estar a medio definir** en el diagrama: `dia`
   figura como `TIME` (deberia ser `DATE`) y conviven `horario : TIMESTAMP` con
   `hora_apertura : TIME`. Se creo tal cual esta dibujada y todavia no la usa
   ningun endpoint. Deberia normalizarse antes del Sprint 2.
5. **`COCHERA.estado_actual` no se modifica al reservar.** Representa el estado
   fisico del lugar en este momento; una reserva a futuro no lo cambia. La
   ocupacion se deriva de las reservas vigentes.

---

## Endpoints

Autenticacion: `Authorization: Bearer <token>`.

### Auth

| Metodo | Ruta                 | Acceso   | Descripcion                          |
| ------ | -------------------- | -------- | ------------------------------------ |
| POST   | `/api/auth/register` | publico  | Alta con rol CONDUCTOR o PROPIETARIO |
| POST   | `/api/auth/login`    | publico  | Devuelve usuario + JWT               |
| GET    | `/api/auth/me`       | token    | Perfil del usuario autenticado       |
| POST   | `/api/auth/rol`      | token    | Cambia el perfil activo (`{ "rol": "CONDUCTOR" }`) si esta en `usuario.roles`; devuelve usuario + JWT nuevo |

```jsonc
// POST /api/auth/register
{ "nombre": "Ana", "apellido": "Perez", "email": "ana@mail.com",
  "password": "secreto123", "rol": "PROPIETARIO", "telefono": "1155667788" }
```

### Estacionamientos y cocheras

| Metodo | Ruta                                  | Acceso      | Descripcion                        |
| ------ | ------------------------------------- | ----------- | ---------------------------------- |
| GET    | `/api/estacionamientos`               | publico     | Busqueda de publicados y activos   |
| GET    | `/api/estacionamientos/:id`           | publico     | Detalle con horarios y cocheras    |
| GET    | `/api/estacionamientos/:id/cocheras`  | publico     | Cocheras del estacionamiento       |
| GET    | `/api/estacionamientos/mios`          | PROPIETARIO | Los del propietario autenticado    |
| POST   | `/api/estacionamientos`               | PROPIETARIO | Alta (queda vinculado a su id)     |
| POST   | `/api/estacionamientos/:id/cocheras`  | PROPIETARIO | Alta de cochera (valida propiedad) |

Filtros de busqueda: `q` (nombre o direccion), `zona`, `id_tipo_vehiculo`,
`tarifa_max`, `limit` (1-100, default 20), `offset`.

```jsonc
// POST /api/estacionamientos
{ "nombre": "Cochera Centro", "direccion": "Av. Corrientes 1234",
  "barrio_zona": "Centro", "latitud": -34.6037, "longitud": -58.3816,
  "telefono_contacto": "1155667788", "email_contacto": "contacto@centro.com",
  "tarifa_hora": 1500.5, "publicado": true,
  "horarios": [ { "dia_semana": 1, "hora_apertura": "08:00", "hora_cierre": "20:00" } ] }

// POST /api/estacionamientos/:id/cocheras
{ "identificador": "A-01", "id_tipo_vehiculo": 1, "estado_actual": "LIBRE" }
```

### Vehiculos y reservas

| Metodo | Ruta                   | Acceso    | Descripcion                     |
| ------ | ---------------------- | --------- | ------------------------------- |
| GET    | `/api/vehiculos/tipos` | publico   | Catalogo de tipos de vehiculo   |
| POST   | `/api/vehiculos`       | CONDUCTOR | Registra un vehiculo            |
| GET    | `/api/vehiculos`       | CONDUCTOR | Sus vehiculos                   |
| POST   | `/api/reservas`        | CONDUCTOR | Crea una reserva                |
| GET    | `/api/reservas`        | CONDUCTOR | Sus reservas                    |

```jsonc
// POST /api/reservas
{ "id_cochera": "uuid", "id_vehiculo": "uuid",
  "inicio": "2026-09-10T14:00:00-03:00", "fin": "2026-09-10T18:00:00-03:00" }
```

### Formato de errores

Todos los errores salen con la misma forma:

```jsonc
{ "error": {
    "message": "Datos invalidos",
    "details": [ { "campo": "email", "mensaje": "no tiene formato de email" } ] } }
```

`400` validacion · `401` sin token o credenciales invalidas · `403` rol o
propiedad incorrecta · `404` inexistente · `409` conflicto (email/patente/
identificador duplicado, solapamiento) · `500` inesperado.

---

## Reservas sin solapamiento

Es la parte critica: dos conductores no pueden reservar la misma cochera en
franjas que se pisan. Hay dos capas de defensa.

**1. Transaccion en `src/services/reserva.service.js`**

```
BEGIN
  SELECT ... FROM cochera c WHERE c.id_cochera = $1 FOR UPDATE OF c   -- (a)
  validar cochera activa, estacionamiento publicado, vehiculo del conductor
  validar que el tipo de vehiculo coincida con el de la cochera
  SELECT 1 FROM reserva                                                -- (b)
   WHERE id_cochera = $1
     AND estado = ANY('{PENDIENTE,CONFIRMADA}')
     AND inicio < $fin AND fin > $inicio
  INSERT INTO reserva ...
COMMIT
```

- **(a)** El lock va sobre la fila de `COCHERA`, no sobre las reservas. Bloquear
  las reservas existentes no alcanzaria: dos transacciones simultaneas no verian
  las filas que la otra esta por insertar (phantom read). Al tomar el lock sobre
  la cochera, el segundo pedido espera el commit del primero y recien despues
  evalua el solapamiento.
- **(b)** Dos intervalos `[a, b)` y `[c, d)` se solapan si `a < d AND b > c`.
  Esto cubre solapamiento exacto, parcial de cada lado, contenido y continente.
  Una reserva que arranca justo cuando termina otra **no** se considera
  solapada (limite abierto a derecha).
- Solo cuentan los estados **PENDIENTE** y **CONFIRMADA**; las CANCELADA y
  FINALIZADA liberan la franja.

**2. Constraint en la base (`schema.sql`)**

```sql
ALTER TABLE reserva ADD CONSTRAINT reserva_sin_solapamiento
  EXCLUDE USING gist (
    id_cochera WITH =,
    tstzrange(inicio, fin, '[)') WITH &&
  ) WHERE (estado IN ('PENDIENTE', 'CONFIRMADA'));
```

Garantiza la invariante aunque alguien escriba por fuera de la API. Si la
extension `btree_gist` no esta disponible, la migracion emite un NOTICE y sigue:
la validacion transaccional se mantiene.

Verificado con 6 requests concurrentes sobre la misma franja: se crea
exactamente 1 reserva y las otras 5 reciben `409`.

---

## Alcance del Sprint 1

- [x] Nombre de la aplicacion: **UCAio**
- [x] Registro y login con roles Conductor y Propietario
- [x] Alta de estacionamientos con nombre, direccion, horarios y contacto
- [x] ABM de cocheras con identificador y tipo de vehiculo admitido
- [x] Registro de vehiculos del conductor
- [x] Consulta de estacionamientos publicados
- [x] Creacion de reservas con vehiculo, fecha y franja horaria

Pendiente para el proximo sprint: baja/modificacion de usuarios y
estacionamientos (el ABM hoy cubre alta y consulta), cambios de estado de la
reserva (confirmar / cancelar / finalizar), validacion de la reserva contra los
horarios de apertura y normalizacion de `EXCEPCION`.
