importScripts("https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey:"AIzaSyBTq_1aKrXLXq20714biUn7qDRBhIBZkMo",
  authDomain:"matteoteam-test.firebaseapp.com",
  projectId:"matteoteam-test",
  storageBucket:"matteoteam-test.firebasestorage.app",
  messagingSenderId:"1084486170913",
  appId:"1:1084486170913:web:d68cf328becefe226a6660"
});

firebase.messaging();

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(clients.matchAll({type:"window", includeUncontrolled:true}).then(list => {
    for(const client of list){
      if("focus" in client) return client.focus();
    }
    return clients.openWindow("./#stempeluhr");
  }));
});
