(() => {
  const DEFAULT_API_BASE = 'https://unemi-panel-academico.onrender.com';
  const SCAN_INTERVAL_MS = 30000;
  const MOD_RE = /\/mod\/(assign|quiz|forum|workshop|lesson|choice|feedback|data|glossary)\//i;

  let running = false;
  let timer = null;
  let observer = null;

  const norm = (s = '') => String(s).replace(/\s+/g, ' ').trim();

  function guessType(url, text = '') {
    const hay = `${url} ${text}`.toLowerCase();
    if (/\/quiz\/|\b(test|quiz|cuestionario|examen)\b/.test(hay)) return 'Test';
    if (/\/forum\/|\b(foro|forum)\b/.test(hay)) return 'Foro';
    if (/\/assign\/|\b(tarea|deber|assignment|taller)\b/.test(hay)) return 'Tarea';
    if (/\/workshop\/|\btaller\b/.test(hay)) return 'Taller';
    return 'Actividad';
  }

  function getCourseName(anchor) {
    const card = anchor.closest(
      '.course-content, .course-section, .section, .activity, .activity-item, li.activity, .card, [data-region="course-content"]'
    );

    const localHeading = card?.querySelector(
      '.course-name, .coursename, .sectionname, h2, h3, h4, [data-region="course-name"]'
    );

    const globalHeading = document.querySelector(
      '.page-header-headings h1, #page-header h1, .breadcrumb li:last-child, h1'
    );

    return norm(localHeading?.textContent || globalHeading?.textContent || document.title || 'Curso UNEMI')
      .replace(/\s*[-–|]\s*UNEMI.*$/i, '') || 'Curso UNEMI';
  }

  function getContainer(anchor) {
    return anchor.closest(
      '.activity, .activity-item, li.activity, .modtype_assign, .modtype_quiz, .modtype_forum, .card, .list-group-item, .timeline-event-list-item'
    ) || anchor.parentElement || anchor;
  }

  function extractDateText(container) {
    const selectors = [
      'time[datetime]',
      '[data-timestamp]',
      '.activity-dates',
      '.date',
      '.due-date',
      '.deadline',
      '[class*="date"]',
      '[class*="due"]'
    ];

    for (const selector of selectors) {
      const el = container.querySelector?.(selector);
      if (!el) continue;
      const value = el.getAttribute?.('datetime') || el.textContent;
      if (norm(value)) return norm(value);
    }

    return norm(container.textContent || '');
  }

  function parseDateCandidate(text) {
    let m = text.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:[^\d]{0,8}(\d{1,2}):(\d{2}))?/i);
    if (m) {
      const [, dd, mm, yyyy, hh = '23', min = '59'] = m;
      const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min));
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }

    m = text.match(/(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)?,?\s*(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})(?:,?\s*(\d{1,2}):(\d{2})\s*(AM|PM)?)?/i);
    if (m) {
      const months = {
        january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
        july: 6, august: 7, september: 8, october: 9, november: 10, december: 11
      };
      let hh = Number(m[4] || 23);
      const ap = (m[6] || '').toUpperCase();
      if (ap === 'PM' && hh < 12) hh += 12;
      if (ap === 'AM' && hh === 12) hh = 0;
      const d = new Date(Number(m[3]), months[m[2].toLowerCase()], Number(m[1]), hh, Number(m[5] || 59));
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }

    m = text.match(/(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+de\s+(\d{4})(?:[^\d]{0,8}(\d{1,2}):(\d{2}))?/i);
    if (m) {
      const months = {
        enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
        julio: 6, agosto: 7, septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11
      };
      const d = new Date(Number(m[3]), months[m[2].toLowerCase()], Number(m[1]), Number(m[4] || 23), Number(m[5] || 59));
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }

    return '';
  }

  function parseDueDate(container) {
    const raw = norm(container.textContent || '');

    // Primero buscamos explícitamente la fecha de entrega/cierre y evitamos confundirla con "Opened".
    const duePatterns = [
      /(?:Due|Closes?|Deadline)\s*:\s*([^|]{3,100})/i,
      /(?:Vence|Cierra|Entrega|Fecha\s*l[ií]mite|Hasta)\s*:\s*([^|]{3,100})/i
    ];

    for (const pattern of duePatterns) {
      const match = raw.match(pattern);
      if (match) {
        const parsed = parseDateCandidate(match[1]);
        if (parsed) return parsed;
      }
    }

    // Moodle suele exponer varias etiquetas de fecha. Preferimos la última si hay "Opened" y "Due/Closes".
    const times = [...(container.querySelectorAll?.('time[datetime]') || [])]
      .map(t => t.dateTime)
      .filter(Boolean)
      .map(v => new Date(v))
      .filter(d => !Number.isNaN(d.getTime()));

    if (times.length) {
      return times[times.length - 1].toISOString();
    }

    // Último recurso: tomar la última fecha reconocible del bloque.
    const candidates = [];
    const dateRe = /(?:\d{1,2}[\/-]\d{1,2}[\/-]\d{4}(?:[^\d]{0,8}\d{1,2}:\d{2})?)|(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)?,?\s*\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}(?:,?\s*\d{1,2}:\d{2}\s*(?:AM|PM)?)?)|(?:\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+de\s+\d{4}(?:[^\d]{0,8}\d{1,2}:\d{2})?)/gi;
    for (const m of raw.matchAll(dateRe)) {
      const parsed = parseDateCandidate(m[0]);
      if (parsed) candidates.push(parsed);
    }

    return candidates.at(-1) || '';
  }

  function titleFromAnchor(anchor) {
    const explicit = norm(
      anchor.querySelector?.('.instancename')?.textContent ||
      anchor.getAttribute('aria-label') ||
      anchor.getAttribute('title') ||
      anchor.textContent
    );

    return explicit
      .replace(/\s*(Tarea|Assignment|Quiz|Cuestionario|Foro|Forum)\s*$/i, '')
      .trim();
  }

  function collectActivities() {
    const seen = new Map();
    const anchors = [...document.querySelectorAll('a[href]')]
      .filter(a => MOD_RE.test(a.getAttribute('href') || ''));

    for (const anchor of anchors) {
      let url;
      try {
        url = new URL(anchor.href, location.href).href;
      } catch {
        continue;
      }

      const title = titleFromAnchor(anchor);
      if (!title || title.length < 2) continue;

      const container = getContainer(anchor);
      const surroundingText = norm(container.textContent || '');

      const activity = {
        course: getCourseName(anchor),
        title,
        type: guessType(url, `${title} ${surroundingText}`),
        dueDate: parseDueDate(container),
        url,
        status: 'Pendiente',
        source: 'Aula UNEMI',
        notes: '',
        priority: 'Media'
      };

      const old = seen.get(url);
      // Preferimos la versión que sí consiguió una fecha límite.
      if (!old || (!old.dueDate && activity.dueDate)) seen.set(url, activity);
    }

    return [...seen.values()];
  }

  async function getSettings() {
    return await chrome.storage.local.get({
      apiBase: DEFAULT_API_BASE,
      syncKey: ''
    });
  }

  async function sendActivity(activity, settings) {
    const apiBase = String(settings.apiBase || DEFAULT_API_BASE).replace(/\/$/, '');
    const syncKey = String(settings.syncKey || '').trim();
    if (!syncKey) return { ok: false, skipped: 'missing-key' };

    const response = await fetch(`${apiBase}/api/sync/activity`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sync-Key': syncKey
      },
      body: JSON.stringify(activity)
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Sync HTTP ${response.status}: ${detail.slice(0, 180)}`);
    }

    return { ok: true, data: await response.json().catch(() => ({})) };
  }

  async function scanAndSync() {
    if (running) return;
    running = true;

    try {
      const settings = await getSettings();
      const activities = collectActivities();
      if (!activities.length) return;

      let synced = 0;
      for (const activity of activities) {
        try {
          const result = await sendActivity(activity, settings);
          if (result.ok) synced += 1;
        } catch (error) {
          console.warn('[UNEMI Sync]', error);
        }
      }

      if (synced) {
        console.info(`[UNEMI Sync] ${synced} actividades sincronizadas.`);
      } else if (!settings.syncKey) {
        console.info('[UNEMI Sync] Falta configurar la clave de sincronización en las opciones de la extensión.');
      }
    } finally {
      running = false;
    }
  }

  function scheduleScan(delay = 1200) {
    clearTimeout(timer);
    timer = setTimeout(scanAndSync, delay);
  }

  scanAndSync();
  setInterval(scanAndSync, SCAN_INTERVAL_MS);

  observer = new MutationObserver(() => scheduleScan());
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener('pageshow', scanAndSync);
})();
