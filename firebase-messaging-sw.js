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

  self.registration.showNotification(title, {
    body,
    icon: '/icon.png',
    badge: '/icon.png',
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
