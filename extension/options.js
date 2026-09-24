const apiBase = document.querySelector('#apiBase');
const syncKey = document.querySelector('#syncKey');
const status = document.querySelector('#status');

document.addEventListener('DOMContentLoaded', async () => {
  const saved = await chrome.storage.local.get({
    apiBase: 'https://unemi-panel-academico.onrender.com',
    syncKey: ''
  });
  apiBase.value = saved.apiBase;
  syncKey.value = saved.syncKey;
});

document.querySelector('#save').addEventListener('click', async () => {
  await chrome.storage.local.set({
    apiBase: apiBase.value.trim().replace(/\/$/, ''),
    syncKey: syncKey.value.trim()
  });
  status.textContent = '✅ Guardado';
  setTimeout(() => status.textContent = '', 2500);
});
