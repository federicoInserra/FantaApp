const status = document.querySelector('#offline-status');
let controlled = Boolean(navigator.serviceWorker?.controller);
function showUpdate() {
  status.textContent = 'Nuova versione pronta. Ricarica per aggiornare l’app.';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button button-quiet';
  button.textContent = 'Aggiorna app';
  button.onclick = () => location.reload();
  status.append(' ', button);
}
async function prepareOffline() {
  if (!('serviceWorker' in navigator)) {
    status.textContent = 'Accesso offline non supportato.';
    return;
  }
  try {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // Never reload automatically: a user may be editing a team or saving a result.
      if(controlled) showUpdate();
      controlled = true;
    });
    const registration = await navigator.serviceWorker.register(new URL('../sw.js', import.meta.url), {updateViaCache:'none'});
    await navigator.serviceWorker.ready;
    if(!status.querySelector('button')) status.textContent = 'Le squadre richiedono una connessione Internet.';
    document.addEventListener('visibilitychange', () => {
      if(document.visibilityState === 'visible') registration.update().catch(() => {});
    });
  } catch {
    status.textContent = 'Offline non pronto. Riapri l’app con Internet.';
  }
}
prepareOffline();
