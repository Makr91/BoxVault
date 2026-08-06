self.addEventListener("push", (event) => {
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
    self.registration.showNotification(title || "BoxVault", {
      body,
      icon,
      tag,
      data,
      actions,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.openWindow(event.notification.data?.navigate || "/")
  );
});

self.addEventListener("pushsubscriptionchange", (event) => {
  const applicationServerKey =
    event.oldSubscription?.options?.applicationServerKey;

  if (!applicationServerKey) {
    return;
  }

  event.waitUntil(
    self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    })
  );
});
