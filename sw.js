/* BUILT 2026-11-08 - 8k10q sw-1a. THE PART THAT LISTENS WHEN THE SITE IS SHUT.

   Mark: "i should get a notice when someone enters and have an app on my phone
   so i can join the conversation", "keep up with the action get a notice on
   your phone", "people should be able to respond".

   This file is why a notice can arrive when nobody has the site open. It is
   registered once, lives in the browser, and wakes when a push comes in.

   It holds no keys and asks for nothing. It shows what the server sent and
   opens the room when the notice is tapped.
*/
self.addEventListener('install', function (e) { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('push', function (event) {
  var d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { body: event.data && event.data.text() }; }
  var title = d.title || '8K10Q';
  /* the room is where a tap must land - the whole point is to answer the man */
  var url = d.url || (d.ticker ? '/room?t=' + encodeURIComponent(d.ticker) : '/');
  event.waitUntil(self.registration.showNotification(title, {
    body: d.body || '',
    icon: '/apple-touch-icon.png',
    badge: '/favicon-32.png',
    tag: d.tag || ('room-' + (d.ticker || 'x')),
    renotify: true,
    data: { url: url },
    actions: [{ action: 'open', title: 'Answer in the room' }]
  }));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    /* if a tab is already open on that room, use it rather than piling up tabs */
    for (var i = 0; i < list.length; i++) {
      if (list[i].url.indexOf(url) > -1 && 'focus' in list[i]) return list[i].focus();
    }
    return clients.openWindow(url);
  }));
});