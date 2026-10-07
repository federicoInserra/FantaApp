const status = document.querySelector('#offline-status');
async function prepareOffline() {
  if (!('serviceWorker' in navigator)) {
    status.textContent = 'Accesso offline non supportato.';
    return;
  }
  try {
    await navigator.serviceWorker.register(new URL('../sw.js', import.meta.url));
    await navigator.serviceWorker.ready;
    status.textContent = 'Le squadre richiedono una connessione Internet.';
  } catch {
    status.textContent = 'Offline non pronto. Riapri l’app con Internet.';
  }
}
prepareOffline();
