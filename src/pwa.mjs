const status = document.querySelector('#offline-status');
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
document.querySelector('#install-help').hidden = Boolean(standalone);
document.querySelector('#install-help').addEventListener('click', () => document.querySelector('#install-dialog').showModal());

async function prepareOffline() {
  if (!('serviceWorker' in navigator)) {
    status.textContent = 'Accesso offline non supportato.';
    return;
  }
  try {
    await navigator.serviceWorker.register(new URL('../sw.js', import.meta.url));
    await navigator.serviceWorker.ready;
    status.textContent = 'Disponibile offline';
  } catch {
    status.textContent = 'Offline non pronto. Riapri l’app con Internet.';
  }
}
prepareOffline();
