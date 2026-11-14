# KAT Tattoo Studio — Sitio Web + Base de Datos + Asistente IA

Sitio web completo de **KAT Tattoo Studio** con:

- **Frontend**: HTML + CSS + JS (Montserrat, diseño dark/púrpura).
- **Backend**: Node.js + Express.
- **Base de datos**: PostgreSQL con 15 tablas (IDs con prefijo tipo `ART-0001`).
- **Asistente IA**: 100% gratis, sin claves externas. Texto y visión con **Ollama + Qwen**, imágenes con **Flux** (Pollinations).

---

## 1. Requisitos instalados en esta máquina

| Software       | Versión verificada      |
|----------------|-------------------------|
| PostgreSQL     | 18.6 (servicio corriendo) |
| Node.js        | v24.21.0                |
| npm            | 11.19.0                 |

---

## 2. Estructura del proyecto

```
kat-tattoo/
├── server.js            # Servidor Express (arranque)
├── package.json         # Dependencias y scripts
├── .env                 # Configuración (BD + IA local)
├── start.bat            # Arranque fácil (Windows)
├── db/
│   ├── schema.sql       # Definición de las 15 tablas
│   └── seed.sql         # Datos iniciales (artistas, servicios, galería...)
├── scripts/
│   └── setup-db.js      # Crea BD + tablas + datos (npm run setup-db)
├── src/
│   ├── config/db.js     # Pool de conexión a PostgreSQL
│   ├── middleware/      # Manejo de errores
│   ├── routes/          # Endpoints de la API
│   │   ├── gallery.js   # CRUD galería
│   │   ├── services.js  # Servicios
│   │   ├── artists.js   # Artistas
│   │   ├── appointments.js # Citas (reserva)
│   │   ├── contact.js   # Mensajes de contacto
│   │   └── ai.js        # Chat del asistente IA
│   └── ai/llm.js        # IA local: texto/visión (Ollama + Qwen) + imágenes (Flux)
└── public/
    ├── index.html       # Página principal
    ├── ai.html          # Chat completo del asistente IA
    ├── css/             # styles.css + extra.css
    ├── js/              # main.js + ai.js
    └── Imagenes/        # Los assets del sitio (logo, fondos, tattoos)
```

---

## 3. Las 15 tablas de la base de datos

Base de datos: **`kat_tattoo`** (usuario `postgres`, clave `Admin123`).

| Tabla              | Contenido                                      |
|--------------------|------------------------------------------------|
| `artists`          | Artistas del estudio                           |
| `gallery`          | Tatuajes de la galería (con categoría y precio)|
| `services`         | Servicios y precios                            |
| `clients`          | Clientes (autocreados al reservar)             |
| `appointments`     | Citas/reservas (pending, confirmed, completed, cancelled) |
| `messages`         | Mensajes del formulario de contacto            |
| `ai_conversations` | Conversaciones del asistente IA                |
| `ai_messages`      | Mensajes de cada conversación IA               |
| `users`            | Cuentas del sistema (admin, artist, client)    |
| `user_references`  | Imágenes de referencia subidas por el cliente  |
| `design_proposals` | Propuestas de diseño generadas por IA          |
| `artist_schedules` | Horarios / disponibilidad de cada artista      |
| `session_notes`    | Notas y avances de cada sesión                 |
| `notifications`    | Notificaciones internas por usuario            |
| `activity_log`     | Registro de auditoría / trazabilidad           |

> **Equipo real**: Nataly Arguello y Pedro García (tatuadores), Elsy Arias
> (body piercer) y Sharlot Ramírez (studio manager).

---

## 4. Paso a paso para levantar todo

### 4.1 Base de datos (crear tablas + datos)

```bash
npm run setup-db
```

> Ya ejecutado en esta máquina. Mira la consola: crea la BD, aplica `schema.sql`
> (renueva las tablas) y carga `seed.sql` (4 artistas, 5 servicios, 8 tatuajes).

### 4.2 IA local (Ollama + Qwen, sin claves ni cuotas)

La IA corre **en este PC** con **Ollama**. No hay que configurar claves.

- **Texto** (chat, ideas, recomendaciones): modelo `qwen2.5:3b`
  (configurable con `OLLAMA_MODEL` en `.env`).
- **Visión** (analizar fotos de referencia): modelo `qwen2.5vl:3b`
  (configurable con `OLLAMA_VISION_MODEL`).
- **Imágenes** (diseños): **Flux** vía Pollinations (gratis, sin clave).

> Requisito: tener Ollama instalado y en ejecución en `http://localhost:11434`
> (configurable con `OLLAMA_URL`). Si Ollama no responde, el chat y el análisis
> devuelven un error claro.

Instalación de Ollama y modelos (ya hecha en esta máquina):

```bash
# Instalar Ollama (Windows): https://ollama.com/download
ollama pull qwen2.5:3b      # texto
ollama pull qwen2.5vl:3b    # visión
```

> Nota: esta máquina es una VM sin GPU; la IA funciona por CPU (correcto, pero
> más lento). La generación de imágenes NO es viable en local, por eso se usa
> Flux (Pollinations) en la nube.

### 4.3 Arrancar el servidor

Opción A (doble clic):

```
start.bat
```

Opción B (terminal):

```bash
npm start
```

Verás:

```
==============================================
  KAT TATTOO STUDIO
  Sitio web:  http://localhost:3000
  API health: http://localhost:3000/api/health
==============================================
```

Abre **http://localhost:3000** en el navegador.

---

## 5. Endpoints de la API

| Método | Ruta                          | Descripción                                  |
|--------|-------------------------------|----------------------------------------------|
| GET    | `/api/health`                 | Estado del servidor y BD                     |
| GET    | `/api/gallery`                | Lista tatuajes (`?category=` / `?featured=true`) |
| GET    | `/api/gallery/:id`            | Detalle de un tatuaje                        |
| POST   | `/api/gallery`                | Crear tatuaje                                |
| PUT    | `/api/gallery/:id`            | Actualizar tatuaje                           |
| DELETE | `/api/gallery/:id`            | Eliminar tatuaje                             |
| GET    | `/api/services`               | Lista servicios                              |
| POST   | `/api/services`               | Crear servicio                               |
| GET    | `/api/artists`                | Lista artistas                               |
| POST   | `/api/appointments`           | Reservar cita (público)                      |
| GET    | `/api/appointments`           | Listar citas (`?status=pending`)             |
| PATCH  | `/api/appointments/:id/status`| Cambiar estado de cita                       |
| POST   | `/api/contact`                | Enviar mensaje de contacto                   |
| GET    | `/api/contact`                | Listar mensajes                              |
| POST   | `/api/ai/chat`                | Enviar mensaje al asistente IA               |
| GET    | `/api/ai/history/:sessionId`  | Historial de una conversación IA             |

---

## 6. Datos de conexión a PostgreSQL

```
Host:     127.0.0.1
Puerto:   5432
Base:     kat_tattoo
Usuario:  postgres
Clave:    Admin123
```

---

## 7. Notas

- La galería, servicios y artistas se cargan **desde la base de datos** (la página
  los pinta dinámicamente desde `/api/...`).
- El formulario **Reservar Cita** crea/actualiza el cliente, guarda la cita como
  `pending` y luego se cambia a `confirmed` desde la API.
- El chat IA guarda las conversaciones por `session_id` en `ai_conversations` /
  `ai_messages`, así el asistente recuerda el contexto de la conversación.
- Las imágenes originales están en `public/Imagenes/` (copia de tus archivos de
  `Downloads`).