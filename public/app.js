let activities = [];

let notified = new Set(
  JSON.parse(
    localStorage.getItem('unemi-notified') || '[]'
  )
);

/* =========================================
   ELEMENTOS
========================================= */

const $ = s => document.querySelector(s);

const toast = m => {
  const t = $('#toast');

  t.textContent = m;

  t.classList.add('show');

  setTimeout(
    () => t.classList.remove('show'),
    3000
  );
};

/* =========================================
   SEGURIDAD HTML
========================================= */

const esc = (s = '') =>
  String(s).replace(
    /[&<>"']/g,
    c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c])
  );

const escAttr = esc;

/* =========================================
   FECHAS
========================================= */

const formatDate = v => {

  if (!v) {
    return '—';
  }

  const d = new Date(v);

  return Number.isNaN(d.getTime())
    ? v
    : d.toLocaleString(
        'es-EC',
        {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }
      );
};

/* =========================================
   PRIORIDADES
========================================= */

const priorityOrder = {
  Urgente: 0,
  Alta: 1,
  Media: 2,
  Baja: 3
};

const priorityLabel = {
  Urgente: '🔴 Urgente',
  Alta: '🟠 Alta',
  Media: '🟡 Media',
  Baja: '🟢 Baja'
};

const normalizePriority = priority =>
  priorityOrder[priority] !== undefined
    ? priority
    : 'Media';

/* =========================================
   ORDENAR ACTIVIDADES
========================================= */

function sortActivities(items) {

  return [...items].sort((a, b) => {

    const priorityA =
      priorityOrder[
        normalizePriority(a.priority)
      ];

    const priorityB =
      priorityOrder[
        normalizePriority(b.priority)
      ];

    /* Primero prioridad */

    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }

    /* Después fecha de entrega */

    const dateA =
      a.dueDate
        ? new Date(a.dueDate).getTime()
        : Infinity;

    const dateB =
      b.dueDate
        ? new Date(b.dueDate).getTime()
        : Infinity;

    const validA =
      Number.isFinite(dateA)
        ? dateA
        : Infinity;

    const validB =
      Number.isFinite(dateB)
        ? dateB
        : Infinity;

    return validA - validB;
  });
}

/* =========================================
   NOTIFICACIONES
========================================= */

const saveNotified = () =>
  localStorage.setItem(
    'unemi-notified',
    JSON.stringify(
      [...notified].slice(-500)
    )
  );

async function requestNotifications() {

  if (!('Notification' in window)) {
    return false;
  }

  if (
    Notification.permission ===
    'default'
  ) {

    try {
      await Notification.requestPermission();
    } catch {}
  }

  return (
    Notification.permission ===
    'granted'
  );
}

function notify(title, body) {

  if (
    'Notification' in window &&
    Notification.permission === 'granted'
  ) {

    new Notification(
      title,
      {
        body,
        icon:
          'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">📚</text></svg>'
      }
    );
  }
}

function checkReminders() {

  const now = Date.now();

  activities.forEach(a => {

    if (
      a.status === 'Completada' ||
      !a.dueDate
    ) {
      return;
    }

    const due =
      new Date(a.dueDate).getTime();

    if (!Number.isFinite(due)) {
      return;
    }

    const mins =
      Number(
        a.reminderMinutes ?? 1440
      );

    const reminderAt =
      due - mins * 60000;

    const key =
      `${a.id}:${mins}:${a.dueDate}`;

    if (
      now >= reminderAt &&
      now <= due &&
      !notified.has(key)
    ) {

      notified.add(key);

      saveNotified();

      const when =
        due - now <= 0
          ? 'ya vence'
          : `vence ${formatDate(a.dueDate)}`;

      notify(
        '🔔 Actividad próxima',
        `${a.course}: ${a.title} — ${when}`
      );

      toast(
        `🔔 ${a.title} está próxima a vencer`
      );
    }
  });
}

/* =========================================
   RENDERIZAR
========================================= */

function render() {

  const q =
    $('#search')
      .value
      .toLowerCase()
      .trim();

  const sf =
    $('#statusFilter').value;

  const tf =
    $('#typeFilter').value;

  const filtered =
    activities.filter(a => {

      const priority =
        normalizePriority(
          a.priority
        );

      const matchesSearch =
        `${a.course} ${a.title} ${a.type} ${priority}`
          .toLowerCase()
          .includes(q);

      const matchesStatus =
        sf === 'all' ||
        a.status === sf;

      const matchesType =
        tf === 'all' ||
        a.type === tf;

      return (
        matchesSearch &&
        matchesStatus &&
        matchesType
      );
    });

  /* =========================================
     ORDEN FINAL
  ========================================= */

  const sorted =
    sortActivities(filtered);

  /* =========================================
     ESTADISTICAS
  ========================================= */

  $('#total').textContent =
    activities.length;

  $('#pending').textContent =
    activities.filter(
      a =>
        a.status === 'Pendiente'
    ).length;

  $('#done').textContent =
    activities.filter(
      a =>
        a.status === 'Completada'
    ).length;

  const now = Date.now();

  const week =
    now + 7 * 864e5;

  $('#upcoming').textContent =
    activities.filter(a => {

      const t =
        new Date(
          a.dueDate
        ).getTime();

      return (
        Number.isFinite(t) &&
        t >= now &&
        t <= week &&
        a.status !== 'Completada'
      );
    }).length;

  /* =========================================
     MENSAJE VACIO
  ========================================= */

  $('#empty').style.display =
    sorted.length
      ? 'none'
      : 'block';

  /* =========================================
     TABLA
  ========================================= */

  $('#tbody').innerHTML =
    sorted.map(a => {

      const priority =
        normalizePriority(
          a.priority
        );

      return `
        <tr>

          <td>
            <strong>
              ${esc(a.course)}
            </strong>
          </td>

          <td>
            ${esc(a.title)}

            ${
              a.source === 'Manual'
                ? '<span class="manual-tag">Manual</span>'
                : ''
            }
          </td>

          <td>
            <span class="badge">
              ${esc(a.type)}
            </span>
          </td>

          <td>
            <span class="badge">
              ${esc(
                priorityLabel[priority]
              )}
            </span>
          </td>

          <td>
            ${formatDate(a.dueDate)}
          </td>

          <td>
            <span
              class="badge ${
                a.status === 'Completada'
                  ? 'done'
                  : a.status === 'En progreso'
                    ? 'progress'
                    : ''
              }"
            >
              ${esc(a.status)}
            </span>
          </td>

          <td>

            ${
              a.url
                ? `
                  <a
                    class="action"
                    href="${escAttr(a.url)}"
                    target="_blank"
                    rel="noopener"
                  >
                    Abrir
                  </a>
                `
                : ''
            }

            <button
              class="action"
              data-id="${escAttr(a.id)}"
            >
              Cambiar
            </button>

            ${
              a.source === 'Manual'
                ? `
                  <button
                    class="action danger"
                    data-delete="${escAttr(a.id)}"
                  >
                    Eliminar
                  </button>
                `
                : ''
            }

          </td>

        </tr>
      `;

    }).join('');

  /* =========================================
     CAMBIAR ESTADO
  ========================================= */

  document
    .querySelectorAll('[data-id]')
    .forEach(b => {

      b.onclick = async () => {

        const a =
          activities.find(
            x =>
              x.id === b.dataset.id
          );

        if (!a) {
          return;
        }

        const next =
          a.status === 'Pendiente'
            ? 'En progreso'
            : a.status === 'En progreso'
              ? 'Completada'
              : 'Pendiente';

        await fetch(
          '/api/activities/' +
          encodeURIComponent(a.id),
          {
            method: 'PATCH',

            headers: {
              'Content-Type':
                'application/json'
            },

            body: JSON.stringify({
              status: next
            })
          }
        );

        await load(false);
      };
    });

  /* =========================================
     ELIMINAR
  ========================================= */

  document
    .querySelectorAll('[data-delete]')
    .forEach(b => {

      b.onclick = async () => {

        if (
          !confirm(
            '¿Eliminar esta actividad manual?'
          )
        ) {
          return;
        }

        await fetch(
          '/api/activities/' +
          encodeURIComponent(
            b.dataset.delete
          ),
          {
            method: 'DELETE'
          }
        );

        await load(false);

        toast(
          'Actividad eliminada'
        );
      };
    });
}

/* =========================================
   CARGAR ACTIVIDADES
========================================= */

async function load(
  showToast = true
) {

  try {

    const r =
      await fetch(
        '/api/activities'
      );

    if (!r.ok) {
      throw new Error(
        'No se pudieron cargar las actividades'
      );
    }

    activities =
      await r.json();

    activities =
      activities.map(a => ({
        ...a,
        priority:
          normalizePriority(
            a.priority
          )
      }));

    render();

    $('#lastSync').textContent =
      'Última sincronización: ' +
      new Date()
        .toLocaleTimeString(
          'es-EC'
        );

    checkReminders();

    if (showToast) {
      toast(
        'Panel actualizado'
      );
    }

  } catch (error) {

    console.error(error);

    toast(
      'No se pudieron cargar las actividades'
    );
  }
}

/* =========================================
   MODAL
========================================= */

function openModal() {

  $('#activityModal')
    .classList
    .add('show');

  $('#course').focus();
}

function closeModal() {

  $('#activityModal')
    .classList
    .remove('show');

  $('#activityForm').reset();
}

/* =========================================
   BOTONES
========================================= */

$('#addBtn').onclick =
  async () => {

    await requestNotifications();

    openModal();
  };

$('#closeModal').onclick =
  closeModal;

$('#cancelBtn').onclick =
  closeModal;

$('#activityModal')
  .addEventListener(
    'click',
    e => {

      if (
        e.target.id ===
        'activityModal'
      ) {
        closeModal();
      }
    }
  );

/* =========================================
   FORMULARIO
========================================= */

$('#activityForm')
  .addEventListener(
    'submit',
    async e => {

      e.preventDefault();

      const due =
        $('#dueDate').value;

      const data = {

        course:
          $('#course')
            .value
            .trim(),

        title:
          $('#title')
            .value
            .trim(),

        type:
          $('#type').value,

        priority:
          $('#priority').value,

        dueDate:
          due
            ? new Date(
                due
              ).toISOString()
            : '',

        url:
          $('#url')
            .value
            .trim(),

        status:
          $('#status').value,

        notes:
          $('#notes')
            .value
            .trim(),

        reminderMinutes:
          Number(
            $('#reminder').value
          ),

        source:
          'Manual'
      };

      const r =
        await fetch(
          '/api/activities',
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json'
            },

            body:
              JSON.stringify(data)
          }
        );

      if (!r.ok) {

        const x =
          await r
            .json()
            .catch(
              () => ({})
            );

        toast(
          x.error ||
          'No se pudo guardar'
        );

        return;
      }

      closeModal();

      await load(false);

      toast(
        '✅ Actividad guardada correctamente'
      );
    }
  );

/* =========================================
   FILTROS
========================================= */

[
  'search',
  'statusFilter',
  'typeFilter'
].forEach(id => {

  $('#' + id)
    .addEventListener(
      'input',
      render
    );
});

/* =========================================
   ACTUALIZAR
========================================= */

$('#refreshBtn').onclick =
  () => load(true);

/* =========================================
   NOTIFICACIONES
========================================= */

$('#notifyBtn').onclick =
  async () => {

    const ok =
      await requestNotifications();

    toast(
      ok
        ? '🔔 Notificaciones activadas'
        : 'El navegador no permite notificaciones'
    );
  };

/* =========================================
   INICIO
========================================= */

load(false);

setInterval(
  () => load(false),
  15000
);

setInterval(
  checkReminders,
  30000
);