(() => {
  const DEFAULT_API_BASE = 'https://unemi-panel-academico.onrender.com';
  const SCAN_INTERVAL_MS = 30000;
  const DETAIL_CACHE_MS = 10 * 60 * 1000;
  const MOD_RE = /\/mod\/(assign|quiz|forum|workshop|lesson|choice|feedback|data|glossary)\//i;

  let running = false;
  let timer = null;
  const detailCache = new Map();
  const courseCache = new Map();
  const norm = (s = '') => String(s).replace(/\s+/g, ' ').trim();

  function typeFromUrl(url = '') {
    const u = String(url).toLowerCase();
    if (u.includes('/mod/assign/')) return 'Tarea';
    if (u.includes('/mod/quiz/')) return 'Test';
    if (u.includes('/mod/forum/')) return 'Foro';
    if (u.includes('/mod/workshop/')) return 'Taller';
    return 'Actividad';
  }

  function cleanTitle(title = '') {
    let t = norm(title);
    t = t.replace(/^(?:Vencimiento\s+de|Se\s+abre|Apertura\s+de|Cierre\s+de)\s+/i, '');
    return t.trim();
  }

  function isNoiseTitle(title = '') {
    const t = norm(title).toLowerCase();
    return /^(avisos|announcements|novedades|news forum|foro de avisos)$/.test(t);
  }


  function cleanCourseName(name = '') {
    let t = norm(name);
    // Conserva solo el nombre de la materia y elimina metadatos de cohorte/paralelo.
    // Ej.: "PRÁCTICAS LABORALES I,[PPP] - C1[138546] - P" -> "PRÁCTICAS LABORALES I"
    t = t.replace(/\s*,\s*\[[^\]]*\].*$/i, '');
    t = t.replace(/\s+-\s+C\d+\s*\[[^\]]*\]\s*-\s*[A-Z]\s*$/i, '');
    return norm(t);
  }

  function isBadCourseName(name = '') {
    const t = cleanCourseName(name).toLowerCase();
    if (!t) return true;
    if (/^(foros?|ex[aá]menes?|simuladores?|actividades(?:\s+.+)?|september\s+\d{4}|septiembre\s+\d{4})$/i.test(t)) return true;
    if (/^(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}$/i.test(t)) return true;
    return false;
  }

  function parseDateCandidate(text = '') {
    const s = norm(text);
    let m = s.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:[^\d]{0,12}(\d{1,2}):(\d{2})\s*(AM|PM|a\.?\s*m\.?|p\.?\s*m\.?)?)?/i);
    if (m) {
      let hh = Number(m[4] || 23);
      const ap = String(m[6] || '').toLowerCase().replace(/\s|\./g, '');
      if (ap === 'pm' && hh < 12) hh += 12;
      if (ap === 'am' && hh === 12) hh = 0;
      const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), hh, Number(m[5] || 59));
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }

    m = s.match(/(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)?,?\s*(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})(?:,?\s*(\d{1,2}):(\d{2})\s*(AM|PM)?)?/i);
    if (m) {
      const months = { january:0, february:1, march:2, april:3, may:4, june:5, july:6, august:7, september:8, october:9, november:10, december:11 };
      let hh = Number(m[4] || 23);
      const ap = String(m[6] || '').toUpperCase();
      if (ap === 'PM' && hh < 12) hh += 12;
      if (ap === 'AM' && hh === 12) hh = 0;
      const d = new Date(Number(m[3]), months[m[2].toLowerCase()], Number(m[1]), hh, Number(m[5] || 59));
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }

    m = s.match(/(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)?,?\s*(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+de\s+(\d{4})(?:,?\s*(\d{1,2}):(\d{2})\s*(a\.?\s*m\.?|p\.?\s*m\.?)?)?/i);
    if (m) {
      const months = { enero:0, febrero:1, marzo:2, abril:3, mayo:4, junio:5, julio:6, agosto:7, septiembre:8, setiembre:8, octubre:9, noviembre:10, diciembre:11 };
      let hh = Number(m[4] || 23);
      const ap = String(m[6] || '').toLowerCase().replace(/\s|\./g, '');
      if (ap === 'pm' && hh < 12) hh += 12;
      if (ap === 'am' && hh === 12) hh = 0;
      const d = new Date(Number(m[3]), months[m[2].toLowerCase()], Number(m[1]), hh, Number(m[5] || 59));
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
    return '';
  }

  function dueDateFromText(text = '') {
    const raw = norm(text);
    const labels = [
      /(?:Due date|Due|Closes?|Close date|Deadline)\s*:?\s*(.{3,140}?)(?=(?:Opened|Opens?|Available|Attempts?|Time limit|$))/i,
      /(?:will close at)\s*(.{3,140}?)(?=(?:Attempts?|Time limit|$))/i,
      /(?:Fecha de entrega|Fecha l[ií]mite|Vence|Vencimiento|Cierra|Cierre|Hasta)\s*:?\s*(.{3,140}?)(?=(?:Abre|Apertura|Disponible|Intentos?|Tiempo|$))/i
    ];
    for (const re of labels) {
      const m = raw.match(re);
      if (!m) continue;
      const parsed = parseDateCandidate(m[1]);
      if (parsed) return parsed;
    }
    return '';
  }

  function titleFromDoc(doc, fallback = '') {
    const candidates = [
      doc.querySelector('.page-header-headings h1'),
      doc.querySelector('#page-header h1'),
      doc.querySelector('h1')
    ];
    for (const el of candidates) {
      const t = cleanTitle(el?.textContent);
      if (t && t.length > 1 && !/^(dashboard|área personal)$/i.test(t)) return t;
    }
    return cleanTitle(fallback);
  }

  function getCourseRefFromDoc(doc) {
    const links = [...doc.querySelectorAll('a[href*="/course/view.php"]')];
    const candidates = [];
    for (const a of links) {
      try {
        const u = new URL(a.getAttribute('href'), location.origin);
        const id = u.searchParams.get('id');
        if (!id) continue;
        const text = norm(a.textContent);
        let score = 0;
        if (!u.searchParams.has('section')) score += 100;
        if (text && !isBadCourseName(text)) score += 40;
        if (/breadcrumb/i.test(a.closest('nav, .breadcrumb, #page-navbar')?.className || '')) score += 20;
        candidates.push({ id, text, score, url: `${u.origin}/course/view.php?id=${encodeURIComponent(id)}` });
      } catch {}
    }
    candidates.sort((a,b) => b.score - a.score);
    return candidates[0] || null;
  }

  async function canonicalCourseName(courseRef) {
    if (!courseRef?.id) return '';
    if (courseCache.has(courseRef.id)) return courseCache.get(courseRef.id);

    if (courseRef.text && !isBadCourseName(courseRef.text)) {
      const cleaned = cleanCourseName(courseRef.text);
      courseCache.set(courseRef.id, cleaned);
      return cleaned;
    }

    try {
      const r = await fetch(courseRef.url, { credentials:'include', cache:'no-store' });
      if (!r.ok) return '';
      const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
      const h1 = cleanCourseName(doc.querySelector('.page-header-headings h1, #page-header h1, h1')?.textContent);
      if (h1 && !isBadCourseName(h1)) {
        courseCache.set(courseRef.id, h1);
        return h1;
      }
    } catch {}
    return '';
  }

  function dueDateFromDoc(doc) {
    const focusedSelectors = ['.activity-dates','.quizinfo','.generaltable','.boxaligncenter','[data-region="activity-dates"]','#region-main'];
    for (const selector of focusedSelectors) {
      for (const el of doc.querySelectorAll(selector)) {
        const parsed = dueDateFromText(el.textContent || '');
        if (parsed) return parsed;
      }
    }
    const times = [...doc.querySelectorAll('time[datetime]')]
      .map(t => t.getAttribute('datetime')).filter(Boolean)
      .map(v => new Date(v)).filter(d => !Number.isNaN(d.getTime()));
    if (times.length) return times.at(-1).toISOString();
    return '';
  }

  async function fetchActivityDetails(url, fallbackTitle = '') {
    const cached = detailCache.get(url);
    if (cached && Date.now() - cached.fetchedAt < DETAIL_CACHE_MS) return cached.details;

    const response = await fetch(url, { method:'GET', credentials:'include', cache:'no-store' });
    if (!response.ok) throw new Error(`No se pudo leer actividad ${response.status}`);
    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const courseRef = getCourseRefFromDoc(doc);
    const course = await canonicalCourseName(courseRef);
    const details = {
      course,
      title: titleFromDoc(doc, fallbackTitle),
      dueDate: dueDateFromDoc(doc)
    };
    detailCache.set(url, { fetchedAt: Date.now(), details });
    return details;
  }

  function fallbackTitleFromAnchor(anchor) {
    return cleanTitle(
      anchor.querySelector?.('.instancename')?.textContent ||
      anchor.getAttribute('aria-label') ||
      anchor.getAttribute('title') ||
      anchor.textContent
    ).replace(/\s*(Assignment|Quiz|Cuestionario|Foro|Forum)\s*$/i, '').trim();
  }

  function fallbackCourseFromPage() {
    const heading = document.querySelector('.page-header-headings h1, #page-header h1, h1');
    const t = cleanCourseName(heading?.textContent || '');
    if (t && !isBadCourseName(t) && !/^(dashboard|área personal|my courses|mis cursos)$/i.test(t)) return t;
    return '';
  }

  async function buildActivity(url, fallbackTitle = '', old = null) {
    let details = { course:'', title:cleanTitle(fallbackTitle), dueDate:'' };
    try {
      details = await fetchActivityDetails(url, fallbackTitle);
    } catch (error) {
      console.warn('[UNEMI Sync] No se pudo ampliar', url, error);
    }
    const course = cleanCourseName(details.course || (!isBadCourseName(old?.course) ? old?.course : '') || fallbackCourseFromPage());
    const title = cleanTitle(details.title || fallbackTitle || old?.title || '');
    return {
      course,
      title,
      type: typeFromUrl(url),
      dueDate: details.dueDate || old?.dueDate || '',
      url,
      status: old?.status || 'Pendiente',
      source: 'Aula UNEMI',
      notes: old?.notes || '',
      priority: old?.priority || 'Media'
    };
  }

  async function collectVisibleActivities() {
    const anchors = [...document.querySelectorAll('a[href]')]
      .filter(a => MOD_RE.test(a.getAttribute('href') || ''));
    const byUrl = new Map();
    for (const anchor of anchors) {
      let url;
      try { url = new URL(anchor.href, location.href).href; } catch { continue; }
      const fallbackTitle = fallbackTitleFromAnchor(anchor);
      if (!fallbackTitle || fallbackTitle.length < 2 || isNoiseTitle(fallbackTitle)) continue;
      if (!byUrl.has(url)) byUrl.set(url, fallbackTitle);
    }

    const entries = [...byUrl.entries()];
    const results = [];
    for (let i = 0; i < entries.length; i += 4) {
      const batch = entries.slice(i, i + 4);
      results.push(...await Promise.all(batch.map(([url,title]) => buildActivity(url,title))));
    }
    return results.filter(a => a.course && a.title && a.url && !isNoiseTitle(a.title));
  }

  async function getSettings() {
    if (!globalThis.chrome?.storage?.local) {
      throw new Error('Chrome storage no está disponible. Recarga la extensión y abre una pestaña nueva del Aula Virtual.');
    }
    return await chrome.storage.local.get({ apiBase: DEFAULT_API_BASE, syncKey: '' });
  }

  async function sendActivity(activity, settings) {
    const apiBase = String(settings.apiBase || DEFAULT_API_BASE).replace(/\/$/, '');
    const syncKey = String(settings.syncKey || '').trim();
    if (!syncKey) return { ok:false, skipped:'missing-key' };
    const response = await fetch(`${apiBase}/api/sync/activity`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'X-Sync-Key':syncKey },
      body:JSON.stringify(activity)
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Sync HTTP ${response.status}: ${detail.slice(0,180)}`);
    }
    return { ok:true, data:await response.json().catch(() => ({})) };
  }

  async function repairExisting(settings) {
    const apiBase = String(settings.apiBase || DEFAULT_API_BASE).replace(/\/$/, '');
    try {
      const response = await fetch(`${apiBase}/api/activities`, { cache:'no-store' });
      if (!response.ok) return 0;
      const all = await response.json();
      if (!Array.isArray(all)) return 0;

      const suspects = all.filter(a => {
        if (!MOD_RE.test(String(a.url || ''))) return false;
        const expectedType = typeFromUrl(a.url);
        return isBadCourseName(a.course) || cleanCourseName(a.course) !== norm(a.course) || a.type !== expectedType || /^(Vencimiento\s+de|Se\s+abre)\s+/i.test(String(a.title || '')) || !a.dueDate;
      }).slice(0, 60);

      let repaired = 0;
      for (let i = 0; i < suspects.length; i += 4) {
        const batch = suspects.slice(i, i + 4);
        const fixed = await Promise.all(batch.map(a => buildActivity(a.url, a.title, a)));
        for (const activity of fixed) {
          if (!activity.course || isBadCourseName(activity.course)) continue;
          try {
            const result = await sendActivity(activity, settings);
            if (result.ok) repaired += 1;
          } catch (e) {
            console.warn('[UNEMI Sync] No se pudo reparar', activity.url, e);
          }
        }
      }
      return repaired;
    } catch (e) {
      console.warn('[UNEMI Sync] Reparación omitida:', e);
      return 0;
    }
  }

  async function scanAndSync() {
    if (running) return;
    running = true;
    try {
      const settings = await getSettings();
      if (!settings.syncKey) {
        console.info('[UNEMI Sync] Falta configurar la clave de sincronización en las opciones de la extensión.');
        return;
      }

      const activities = await collectVisibleActivities();
      let synced = 0;
      for (const activity of activities) {
        try {
          const result = await sendActivity(activity, settings);
          if (result.ok) synced += 1;
        } catch (error) {
          console.warn('[UNEMI Sync]', error);
        }
      }

      const repaired = await repairExisting(settings);
      console.info(`[UNEMI Sync] ${synced}/${activities.length} visibles sincronizadas; ${repaired} registros antiguos reparados.`);
    } catch (error) {
      console.error('[UNEMI Sync]', error);
    } finally {
      running = false;
    }
  }

  function scheduleScan(delay = 1500) {
    clearTimeout(timer);
    timer = setTimeout(scanAndSync, delay);
  }

  scanAndSync();
  setInterval(scanAndSync, SCAN_INTERVAL_MS);
  const observer = new MutationObserver(() => scheduleScan());
  observer.observe(document.documentElement, { childList:true, subtree:true });
})();
