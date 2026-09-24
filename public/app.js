let activities = [];

let isAdmin =
  sessionStorage.getItem('unemi-admin') === 'true';

let adminKey =
  sessionStorage.getItem('unemi-admin-key') || '';

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

  if (!t) return;

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

    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }

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
   ADMINISTRADOR
========================================= */

function getAdminKey() {
  return sessionStorage.getItem(
    'unemi-admin-key'
  ) || '';
}

function updateAdminButton() {

  const button =
    document.querySelector('#adminBtn');

  const addButton =
    document.querySelector('#addBtn');

  const formCard =
    document.querySelector('#formCard');

  if (button) {

    if (isAdmin) {

      button.textContent =
        '🔐 Administrador activo';

      button.title =
        'Cerrar sesión de administrador';

    } else {

      button.textContent =
        '🔑 Administrador';

      button.title =
        'Iniciar sesión de administrador';
    }
  }

  /*
     Agregar actividad:
     SOLO visible para administrador
  */

  if (addButton) {

    addButton.style.display =
      isAdmin ? '' : 'none';
  }

  /*
     Formulario:
     SOLO visible para administrador
  */

  if (formCard && !isAdmin) {

    formCard.classList.add('hidden');
  }
}
async function loginAdmin() {

  const key =
    prompt(
      'Ingrese la clave de administrador:'
    );

  if (!key) {
    return;
  }

  try {

    const response =
      await fetch(
        '/api/admin/check',
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json',

            'X-Admin-Key':
              key
          }
        }
      );

    const data =
      await response
        .json()
        .catch(
          () => ({})
        );

    if (
      !response.ok ||
      !data.admin
    ) {

      toast(
        '❌ Clave de administrador incorrecta'
      );

      return;
    }

    isAdmin = true;
    adminKey = key;

    sessionStorage.setItem(
      'unemi-admin',
      'true'
    );

    sessionStorage.setItem(
      'unemi-admin-key',
      key
    );

    updateAdminButton();

    render();

    toast(
      '✅ Modo administrador activado'
    );

  } catch (error) {

    console.error(error);

    toast(
      '❌ No se pudo validar el administrador'
    );
  }
}

function logoutAdmin() {

  isAdmin = false;
  adminKey = '';

  sessionStorage.removeItem(
    'unemi-admin'
  );

  sessionStorage.removeItem(
    'unemi-admin-key'
  );

  updateAdminButton();

  render();

  toast(
    '🔒 Sesión de administrador cerrada'
  );
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
        body
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

  const searchInput =
    $('#search');

  const statusFilter =
    $('#statusFilter');

  const typeFilter =
    $('#typeFilter');

  if (
    !searchInput ||
    !statusFilter ||
    !typeFilter
  ) {
    return;
  }

  const q =
    searchInput.value
      .toLowerCase()
      .trim();

  const sf =
    statusFilter.value;

  const tf =
    typeFilter.value;

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

  const sorted =
    sortActivities(filtered);

  /* =========================================
     ESTADÍSTICAS
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
     TABLA
  ========================================= */

  const tbody =
    $('#activitiesBody');

  if (!tbody) {
    return;
  }

  tbody.innerHTML =
    sorted.map(a => {

      const priority =
        normalizePriority(
          a.priority
        );

      const deleteButton =
        isAdmin &&
        a.source === 'Manual'
          ? `
            <button
              class="action danger"
              data-delete="${escAttr(a.id)}"
            >
              Eliminar
            </button>
          `
          : '';

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
            <span class="badge">
              ${esc(
                priorityLabel[priority]
              )}
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

            ${
              isAdmin
                ? `
                  <button
                    class="action"
                    data-id="${escAttr(a.id)}"
                  >
                    Cambiar
                  </button>
                `
                : ''
            }

            ${deleteButton}

          </td>

        </tr>
      `;

    }).join('');

  /* =========================================
     CAMBIAR ESTADO
  ========================================= */

  document
    .querySelectorAll('[data-id]')
    .forEach(button => {

      button.onclick =
        async () => {

          const a =
            activities.find(
              x =>
                String(x.id) ===
                String(button.dataset.id)
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

          try {

            const response =
              await fetch(
                '/api/activities/' +
                encodeURIComponent(a.id),
                {
                  method: 'PATCH',

                  headers: {
                    'Content-Type':
                      'application/json',

                    'X-Admin-Key':
                      getAdminKey()
                  },

                  body:
                    JSON.stringify({
                      status: next
                    })
                }
              );

            if (!response.ok) {
              throw new Error(
                'No se pudo actualizar'
              );
            }

            await load(false);

          } catch (error) {

            console.error(error);

            toast(
              '❌ No se pudo cambiar el estado'
            );
          }
        };
    });

  /* =========================================
     ELIMINAR
  ========================================= */

  document
    .querySelectorAll('[data-delete]')
    .forEach(button => {

      button.onclick =
        async () => {

          if (!isAdmin) {

            toast(
              '🔒 Necesitas permisos de administrador'
            );

            return;
          }

          if (
            !confirm(
              '¿Eliminar esta actividad manual?'
            )
          ) {
            return;
          }

          try {

            const response =
              await fetch(
                '/api/activities/' +
                encodeURIComponent(
                  button.dataset.delete
                ),
                {
                  method: 'DELETE',

                  headers: {
                    'X-Admin-Key':
                      getAdminKey()
                  }
                }
              );

            if (
              response.status === 401 ||
              response.status === 403
            ) {

              logoutAdmin();

              toast(
                '🔒 Sesión de administrador inválida'
              );

              return;
            }

            if (!response.ok) {

              const data =
                await response
                  .json()
                  .catch(
                    () => ({})
                  );

              throw new Error(
                data.error ||
                'No se pudo eliminar'
              );
            }

            await load(false);

            toast(
              '✅ Actividad eliminada'
            );

          } catch (error) {

            console.error(error);

            toast(
              '❌ ' +
              (
                error.message ||
                'No se pudo eliminar'
              )
            );
          }
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

    const response =
      await fetch(
        '/api/activities'
      );

    if (!response.ok) {

      throw new Error(
        'No se pudieron cargar las actividades'
      );
    }

    activities =
      await response.json();

    activities =
      activities.map(a => ({
        ...a,
        priority:
          normalizePriority(
            a.priority
          )
      }));

    render();

    const lastSync =
      $('#lastSync');

    if (lastSync) {

      lastSync.textContent =
        'Última sincronización: ' +
        new Date()
          .toLocaleTimeString(
            'es-EC'
          );
    }

    checkReminders();

    if (showToast) {

      toast(
        'Panel actualizado'
      );
    }

  } catch (error) {

    console.error(error);

    toast(
      '❌ No se pudieron cargar las actividades'
    );
  }
}

/* =========================================
   FORMULARIO
========================================= */

function openModal() {

  const formCard =
    $('#formCard');

  if (!formCard) {
    return;
  }

  formCard.classList.remove(
    'hidden'
  );

  const course =
    $('#course');

  if (course) {
    course.focus();
  }
}

function closeModal() {

  const formCard =
    $('#formCard');

  if (formCard) {

    formCard.classList.add(
      'hidden'
    );
  }

  const form =
    $('#activityForm');

  if (form) {
    form.reset();
  }
}

/* =========================================
   BOTÓN AGREGAR
========================================= */

const addBtn =
  $('#addBtn');

if (addBtn) {

  addBtn.onclick =
    async () => {

      if (!isAdmin) {
        toast(
          'Solo el administrador puede agregar actividades'
        );
        return;
      }

      await requestNotifications();

      openModal();
    };
}

/* =========================================
   CERRAR FORMULARIO
========================================= */

const closeFormBtn =
  $('#closeFormBtn');

if (closeFormBtn) {

  closeFormBtn.onclick =
    closeModal;
}

const cancelBtn =
  $('#cancelBtn');

if (cancelBtn) {

  cancelBtn.onclick =
    closeModal;
}

/* =========================================
   FORMULARIO
========================================= */

const activityForm =
  $('#activityForm');

if (activityForm) {

  activityForm.addEventListener(
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
            $('#reminderMinutes').value
          ),

        source:
          'Manual'
      };

      try {

        const response =
          await fetch(
            '/api/activities',
            {
              method: 'POST',

              headers: {
                'Content-Type':
                  'application/json',

                'X-Admin-Key':
                  getAdminKey()
              },

              body:
                JSON.stringify(data)
            }
          );

        if (!response.ok) {

          const dataError =
            await response
              .json()
              .catch(
                () => ({})
              );

          toast(
            dataError.error ||
            'No se pudo guardar'
          );

          return;
        }

        closeModal();

        await load(false);

        toast(
          '✅ Actividad guardada correctamente'
        );

      } catch (error) {

        console.error(error);

        toast(
          '❌ No se pudo guardar la actividad'
        );
      }
    }
  );
}

/* =========================================
   FILTROS
========================================= */

[
  'search',
  'statusFilter',
  'typeFilter'
].forEach(id => {

  const element =
    $('#' + id);

  if (!element) {
    return;
  }

  element.addEventListener(
    'input',
    render
  );

  element.addEventListener(
    'change',
    render
  );
});

/* =========================================
   ACTUALIZAR
========================================= */

const refreshBtn =
  $('#refreshBtn');

if (refreshBtn) {

  refreshBtn.onclick =
    () => load(true);
}

/* =========================================
   NOTIFICACIONES
========================================= */

const notifyBtn =
  $('#notifyBtn');

if (notifyBtn) {

  notifyBtn.onclick =
    async () => {

      const ok =
        await requestNotifications();

      toast(
        ok
          ? '🔔 Notificaciones activadas'
          : 'El navegador no permite notificaciones'
      );
    };
}

/* =========================================
   BOTÓN ADMINISTRADOR
========================================= */

const adminBtn =
  $('#adminBtn');

if (adminBtn) {

  updateAdminButton();

  adminBtn.onclick =
    () => {

      if (isAdmin) {
        logoutAdmin();
      } else {
        loginAdmin();
      }
    };
}

/* =========================================
   INICIO
========================================= */

updateAdminButton();

load(false);

setInterval(
  () => load(false),
  15000
);

setInterval(
  checkReminders,
  30000
);






