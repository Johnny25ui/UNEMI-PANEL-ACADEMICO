import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'activities.json');

fs.mkdirSync(DATA_DIR, { recursive: true });

if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, '[]');
}

/* =========================================
   POSTGRESQL
========================================= */

const DATABASE_URL = process.env.DATABASE_URL || '';

const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : false
    })
  : null;

/* =========================================
   ARCHIVO LOCAL DE RESPALDO
========================================= */

const readLocal = () => {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return [];
  }
};

const saveLocal = (items) => {
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(items, null, 2)
  );
};

/* =========================================
   BASE DE DATOS
========================================= */

async function initDatabase() {
  if (!pool) {
    console.log('⚠️ DATABASE_URL no configurada.');
    console.log('📁 Se utilizará activities.json como almacenamiento local.');
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY,
      course TEXT NOT NULL,
      title TEXT NOT NULL,
      type TEXT DEFAULT 'Actividad',
      due_date TEXT DEFAULT '',
      url TEXT DEFAULT '',
      status TEXT DEFAULT 'Pendiente',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      source TEXT DEFAULT 'Manual',
      notes TEXT DEFAULT '',
      reminder_minutes INTEGER DEFAULT 1440
    )
  `);

  console.log('✅ PostgreSQL conectado correctamente.');
}

/* =========================================
   OBTENER ACTIVIDADES
========================================= */

async function getActivities() {
  if (!pool) {
    return readLocal();
  }

  const result = await pool.query(`
    SELECT
      id,
      course,
      title,
      type,
      due_date AS "dueDate",
      url,
      status,
      created_at AS "createdAt",
      source,
      notes,
      reminder_minutes AS "reminderMinutes"
    FROM activities
    ORDER BY created_at DESC
  `);

  return result.rows;
}

/* =========================================
   AGREGAR ACTIVIDAD
========================================= */

async function addActivity(x) {
  const activity = {
    id: x.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    course: String(x.course).trim(),
    title: String(x.title).trim(),
    type: x.type || 'Actividad',
    dueDate: x.dueDate || '',
    url: x.url || '',
    status: x.status || 'Pendiente',
    createdAt: x.createdAt || new Date().toISOString(),
    source: x.source || 'Manual',
    notes: x.notes || '',
    reminderMinutes: Number.isFinite(Number(x.reminderMinutes))
      ? Number(x.reminderMinutes)
      : 1440
  };

  if (!pool) {
    const items = readLocal();

    const exists = items.some(
      a =>
        a.id === activity.id ||
        (a.url && activity.url && a.url === activity.url)
    );

    if (!exists) {
      items.unshift(activity);
      saveLocal(items);
    }

    return {
      added: !exists,
      activity
    };
  }

  const exists = await pool.query(
    `
    SELECT id
    FROM activities
    WHERE id = $1
       OR ($2 <> '' AND url = $2)
    LIMIT 1
    `,
    [activity.id, activity.url]
  );

  if (exists.rows.length > 0) {
    return {
      added: false,
      activity
    };
  }

  await pool.query(
    `
    INSERT INTO activities (
      id,
      course,
      title,
      type,
      due_date,
      url,
      status,
      created_at,
      source,
      notes,
      reminder_minutes
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    `,
    [
      activity.id,
      activity.course,
      activity.title,
      activity.type,
      activity.dueDate,
      activity.url,
      activity.status,
      activity.createdAt,
      activity.source,
      activity.notes,
      activity.reminderMinutes
    ]
  );

  return {
    added: true,
    activity
  };
}

/* =========================================
   ACTUALIZAR ACTIVIDAD
========================================= */

async function updateActivity(id, x) {
  if (!pool) {
    const items = readLocal();

    const index = items.findIndex(
      a => a.id === id
    );

    if (index < 0) {
      return null;
    }

    items[index] = {
      ...items[index],
      ...x,
      id: items[index].id
    };

    saveLocal(items);

    return items[index];
  }

  const current = await pool.query(
    `SELECT * FROM activities WHERE id = $1`,
    [id]
  );

  if (current.rows.length === 0) {
    return null;
  }

  const old = current.rows[0];

  const updated = {
    course: x.course ?? old.course,
    title: x.title ?? old.title,
    type: x.type ?? old.type,
    dueDate: x.dueDate ?? old.due_date,
    url: x.url ?? old.url,
    status: x.status ?? old.status,
    source: x.source ?? old.source,
    notes: x.notes ?? old.notes,
    reminderMinutes:
      x.reminderMinutes ??
      old.reminder_minutes
  };

  await pool.query(
    `
    UPDATE activities
    SET
      course = $1,
      title = $2,
      type = $3,
      due_date = $4,
      url = $5,
      status = $6,
      source = $7,
      notes = $8,
      reminder_minutes = $9
    WHERE id = $10
    `,
    [
      updated.course,
      updated.title,
      updated.type,
      updated.dueDate,
      updated.url,
      updated.status,
      updated.source,
      updated.notes,
      updated.reminderMinutes,
      id
    ]
  );

  return {
    id,
    ...updated,
    createdAt: old.created_at
  };
}

/* =========================================
   ELIMINAR ACTIVIDAD
========================================= */

async function deleteActivity(id) {
  if (!pool) {
    const items = readLocal();

    const filtered = items.filter(
      a => a.id !== id
    );

    saveLocal(filtered);

    return;
  }

  await pool.query(
    `DELETE FROM activities WHERE id = $1`,
    [id]
  );
}

/* =========================================
   MIME TYPES
========================================= */

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon'
};

/* =========================================
   HEADERS
========================================= */

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods':
    'GET,POST,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type'
};

/* =========================================
   RESPUESTA
========================================= */

function send(
  res,
  status,
  data,
  type = 'application/json'
) {
  res.writeHead(status, {
    ...headers,
    'Content-Type': type
  });

  res.end(
    type.startsWith('application/json')
      ? JSON.stringify(data)
      : data
  );
}

/* =========================================
   BODY JSON
========================================= */

function body(req) {
  return new Promise((resolve, reject) => {
    let s = '';

    req.on('data', chunk => {
      s += chunk;
    });

    req.on('end', () => {
      try {
        resolve(
          s
            ? JSON.parse(s)
            : {}
        );
      } catch (error) {
        reject(error);
      }
    });
  });
}

/* =========================================
   SERVIDOR
========================================= */

const server = http.createServer(
  async (req, res) => {

    if (req.method === 'OPTIONS') {
      res.writeHead(204, headers);
      return res.end();
    }

    try {

      /* GET ACTIVIDADES */

      if (
        req.url === '/api/activities' &&
        req.method === 'GET'
      ) {
        const activities =
          await getActivities();

        return send(
          res,
          200,
          activities
        );
      }

      /* POST ACTIVIDAD */

      if (
        req.url === '/api/activities' &&
        req.method === 'POST'
      ) {

        const x = await body(req);

        if (
          !x.course ||
          !x.title
        ) {
          return send(
            res,
            400,
            {
              error:
                'course y title son obligatorios'
            }
          );
        }

        const result =
          await addActivity(x);

        return send(
          res,
          result.added ? 201 : 200,
          result
        );
      }

      /* PATCH /api/activities/:id */

      const match =
        req.url.match(
          /^\/api\/activities\/([^/]+)$/
        );

      if (
        match &&
        req.method === 'PATCH'
      ) {

        const id =
          decodeURIComponent(
            match[1]
          );

        const x =
          await body(req);

        const updated =
          await updateActivity(
            id,
            x
          );

        if (!updated) {
          return send(
            res,
            404,
            {
              error:
                'No encontrada'
            }
          );
        }

        return send(
          res,
          200,
          updated
        );
      }

      /* DELETE /api/activities/:id */

      if (
        match &&
        req.method === 'DELETE'
      ) {

        const id =
          decodeURIComponent(
            match[1]
          );

        await deleteActivity(id);

        res.writeHead(
          204,
          headers
        );

        return res.end();
      }

      /* ARCHIVOS DEL FRONTEND */

      let file =
        req.url.split('?')[0];

      if (file === '/') {
        file = '/index.html';
      }

      const publicRoot =
        path.join(
          ROOT,
          'public'
        );

      const full =
        path.normalize(
          path.join(
            publicRoot,
            file
          )
        );

      if (
        !full.startsWith(
          publicRoot
        )
      ) {
        return send(
          res,
          403,
          {
            error:
              'Forbidden'
          }
        );
      }

      if (
        fs.existsSync(full) &&
        fs.statSync(full).isFile()
      ) {

        return send(
          res,
          200,
          fs.readFileSync(full),
          mime[
            path.extname(full)
          ] ||
          'application/octet-stream'
        );
      }

      send(
        res,
        404,
        {
          error:
            'Not found'
        }
      );

    } catch (error) {

      console.error(
        '❌ Error:',
        error
      );

      send(
        res,
        500,
        {
          error:
            'Server error',
          detail:
            error.message
        }
      );
    }
  }
);

/* =========================================
   INICIAR SERVIDOR
========================================= */

async function start() {

  try {

    await initDatabase();

    server.listen(
      process.env.PORT || 3000,
      () => {

        console.log(
          '======================================'
        );

        console.log(
          '   UNEMI PANEL ACADEMICO'
        );

        console.log(
          '======================================'
        );

        console.log(
          `🚀 Servidor disponible en http://localhost:${process.env.PORT || 3000}`
        );

        console.log(
          pool
            ? '🗄️ Base de datos: PostgreSQL'
            : '📁 Base de datos: activities.json'
        );
      }
    );

  } catch (error) {

    console.error(
      '❌ No se pudo iniciar el servidor:'
    );

    console.error(
      error
    );

    process.exit(1);
  }
}

start();
