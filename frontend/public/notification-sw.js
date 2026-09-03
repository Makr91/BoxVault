const APP_NAME = new URL(self.location.href).searchParams.get('app') || 'Notification';

self.addEventListener('push', event => {
  if (!event.data) {
    return;
  }

  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }

  const { title, body, icon, tag, data, actions } = payload;

  event.waitUntil(
    self.registration.showNotification(title || APP_NAME, {
      body,
      icon,
      tag,
      data,
      actions,
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(event.notification.data?.navigate || '/'));
});

self.addEventListener('pushsubscriptionchange', event => {
  const applicationServerKey = event.oldSubscription?.options?.applicationServerKey;

  if (!applicationServerKey) {
    return;
  }

  const oldEndpoint = event.oldSubscription?.endpoint || null;

  event.waitUntil(
    self.registration.pushManager
      .subscribe({ userVisibleOnly: true, applicationServerKey })
      .then(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: 'pushsubscriptionchange', oldEndpoint });
        });
      })
  );
});
