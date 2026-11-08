/* BUILT 2026-11-08 - 8k10q action-1a. KEEP UP WITH THE ACTION.

   Mark: "we can have something like keep up with the action get a notice on
   your phone", "it should be able to go out to many people because chatter
   means stock movement", "an investor that plays momentum wants to know what
   is hot not just join up to a room", "there are millions of investors and the
   market is crazy now".

   NOT A PER-ROOM SUBSCRIPTION. A man who plays momentum will not sit and
   pre-join forty rooms on the chance one of them wakes up. He wants telling
   where the action IS, whatever the ticker. So this is one switch for the
   whole wire, and the server decides what is hot.

   WHAT IT DOES NOT DO: it never asks for a name, an email or a login. The
   phone hands over an endpoint and nothing else, so a man can be told what is
   happening before he has decided to join anything. The join, the real name
   and the desk call come later, when he wants to SPEAK.
*/
(function () {
  'use strict';
  var VAPID = 'BDz84ZyMvuk6G-aQ_NMGnHabnVRNZOr4VLKlcFjTSSdo-iOyDxjbuR5Iy1YnvhYPKJXSr1mknMuiqvrffKV-qCA';
  var API = 'https://triggeredshort-room.realroofers.workers.dev';

  function b64ToU8(s) {
    var pad = '='.repeat((4 - s.length % 4) % 4);
    var b = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
    var out = new Uint8Array(b.length);
    for (var i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
    return out;
  }

  function can() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  }

  /* ⚠ iOS ONLY ALLOWS THIS ONCE THE SITE IS ON THE HOME SCREEN. Telling a man
     to press a button that cannot work is worse than not offering it, so he is
     told what to do instead. */
  function iosNeedsInstall() {
    var ios = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
              (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    var standalone = window.navigator.standalone === true ||
                     (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    return ios && !standalone;
  }

  window.WWAction = {
    supported: can,
    iosNeedsInstall: iosNeedsInstall,
    state: function () {
      if (!can()) return 'unsupported';
      if (iosNeedsInstall()) return 'ios-install';
      return Notification.permission;     // 'granted' | 'denied' | 'default'
    },
    on: function () {
      if (!can()) return Promise.reject(new Error('This browser cannot do phone notices.'));
      if (iosNeedsInstall()) return Promise.reject(new Error('ios-install'));
      return Notification.requestPermission().then(function (p) {
        if (p !== 'granted') throw new Error('You said no to notices. You can turn them on in the browser settings.');
        return navigator.serviceWorker.register('/sw.js');
      }).then(function (reg) {
        return navigator.serviceWorker.ready.then(function () { return reg; });
      }).then(function (reg) {
        return reg.pushManager.getSubscription().then(function (s) {
          return s || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(VAPID) });
        });
      }).then(function (sub) {
        return fetch(API + '/api/push/subscribe', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sub: sub.toJSON(), where: location.pathname })
        }).then(function (r) { return r.json(); });
      });
    },
    off: function () {
      if (!can()) return Promise.resolve({ ok: true });
      return navigator.serviceWorker.getRegistration().then(function (reg) {
        if (!reg) return { ok: true };
        return reg.pushManager.getSubscription().then(function (s) {
          if (!s) return { ok: true };
          var ep = s.endpoint;
          return s.unsubscribe().then(function () {
            return fetch(API + '/api/push/unsubscribe', {
              method: 'POST', headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ endpoint: ep })
            }).then(function (r) { return r.json(); });
          });
        });
      });
    }
  };
})();