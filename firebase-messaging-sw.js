importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCI63LAj72YVvDHJUE2cD3YQIZH7z1e_J4",
  authDomain: "pusdoc-83c80.firebaseapp.com",
  databaseURL: "https://pusdoc-83c80-default-rtdb.firebaseio.com",
  projectId: "pusdoc-83c80",
  storageBucket: "pusdoc-83c80.firebasestorage.app",
  messagingSenderId: "902413106606",
  appId: "1:902413106606:web:aaab7c8652847763bf5c3f"
});

const messaging = firebase.messaging();

// 백그라운드 메시지 수신 (앱이 닫혀있거나 백그라운드일 때)
messaging.onBackgroundMessage(function(payload) {
  const title = payload.notification?.title || 'PUS DOC';
  const body  = payload.notification?.body  || '새 알림이 있습니다.';

  const ICON = 'data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 180 180%27%3E%3Cdefs%3E%3ClinearGradient id=%27g%27 x1=%270%27 y1=%270%27 x2=%271%27 y2=%271%27%3E%3Cstop offset=%270%27 stop-color=%27%236d83ff%27/%3E%3Cstop offset=%271%27 stop-color=%27%23a78bfa%27/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width=%27180%27 height=%27180%27 rx=%2736%27 fill=%27url(%23g)%27/%3E%3Ctext x=%2790%27 y=%27112%27 font-size=%2748%27 font-weight=%27800%27 fill=%27white%27 text-anchor=%27middle%27 font-family=%27Arial%27%3EPUS%3C/text%3E%3C/svg%3E';

  self.registration.showNotification(title, {
    body,
    icon: ICON,
    badge: ICON,
    vibrate: [200, 100, 200, 100, 200],
    tag: 'pusdoc-push',
    renotify: true,
    data: { url: self.location.origin }
  });
});

// 알림 클릭 시 앱 열기
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});
