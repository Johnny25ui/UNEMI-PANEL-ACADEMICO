import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('ERROR: No existe DATABASE_URL.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

const filePath = path.join(process.cwd(), 'data', 'activities.json');

async function migrate() {
  try {
    console.log('======================================');
    console.log(' MIGRACION JSON -> POSTGRESQL');
    console.log('======================================');

    if (!fs.existsSync(filePath)) {
      throw new Error(`No existe el archivo: ${filePath}`);
    }

    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    const activities = Array.isArray(data)
      ? data
      : Array.isArray(data.activities)
        ? data.activities
        : [];

    console.log(`Actividades encontradas en JSON: ${activities.length}`);

    if (activities.length === 0) {
      console.log('No hay actividades para migrar.');
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

    let migrated = 0;

    for (const activity of activities) {
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
        ON CONFLICT (id) DO NOTHING
        `,
        [
          String(activity.id),
          activity.course || '',
          activity.title || 'Sin título',
          activity.type || 'Actividad',
          activity.dueDate || '',
          activity.url || '',
          activity.status || 'Pendiente',
          activity.createdAt || new Date().toISOString(),
          activity.source || 'Manual',
          activity.notes || '',
          Number.isInteger(activity.reminderMinutes)
            ? activity.reminderMinutes
            : 1440
        ]
      );

      migrated++;
    }

    const result = await pool.query(
      'SELECT COUNT(*)::int AS total FROM activities'
    );

    console.log('');
    console.log('======================================');
    console.log(' MIGRACION COMPLETADA');
    console.log('======================================');
    console.log(`Registros procesados: ${migrated}`);
    console.log(`Registros actualmente en PostgreSQL: ${result.rows[0].total}`);
    console.log('');
    console.log('Tu activities.json NO fue modificado.');
    console.log('======================================');

  } catch (error) {
    console.error('');
    console.error('ERROR DURANTE LA MIGRACION:');
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrate();