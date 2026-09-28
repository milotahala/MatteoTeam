const {onDocumentCreated, onDocumentUpdated} = require("firebase-functions/v2/firestore");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const {getMessaging} = require("firebase-admin/messaging");

initializeApp();

const SUPERADMIN_UID = "zHjssSqBb4W1iffwCs9RJmfUVYJ3";

exports.notifySuperAdminOutsideRadius = onDocumentUpdated({
  document:"timeClock/{recordId}",
  region:"europe-west1"
}, async event => {
  const before = event.data.before.data() || {};
  const after = event.data.after.data() || {};
  if(before.geofenceAlert?.active || !after.geofenceAlert?.active) return;

  const db = getFirestore();
  const tokenSnapshot = await db.collection("fcmTokens")
    .where("uid", "==", SUPERADMIN_UID)
    .where("active", "==", true)
    .get();
  if(tokenSnapshot.empty) return;

  const distance = Math.round(after.geofenceAlert.distanceMeters || 0);
  const employee = after.userName || "Ein Mitarbeiter";
  const tokens = tokenSnapshot.docs.map(item => item.data().token).filter(Boolean);
  const response = await getMessaging().sendEachForMulticast({
    tokens,
    notification:{
      title:"⚠️ MatteoTeam Standort-Alarm",
      body:`${employee} ist seit mehr als 1 Minute außerhalb des 30-m-Radius (${distance} m).`
    },
    data:{type:"geofence", recordId:event.params.recordId},
    webpush:{
      notification:{requireInteraction:true, vibrate:[250,120,250], tag:`geofence-${event.params.recordId}`},
      fcmOptions:{link:"https://milotahala.github.io/MatteoTeam/#stempeluhr"}
    }
  });

  const invalidCodes = new Set([
    "messaging/registration-token-not-registered",
    "messaging/invalid-registration-token"
  ]);
  const cleanup = [];
  response.responses.forEach((result, index) => {
    if(!result.success && invalidCodes.has(result.error?.code)){
      cleanup.push(tokenSnapshot.docs[index].ref.update({active:false, disabledAt:FieldValue.serverTimestamp()}));
    }
  });
  await Promise.all(cleanup);
});

exports.notifyNewAnnouncement = onDocumentCreated({
  document:"announcements/{announcementId}",
  region:"europe-west1"
}, async event => {
  const announcement = event.data?.data();
  if(!announcement?.text) return;

  const db = getFirestore();
  const tokenSnapshot = await db.collection("fcmTokens")
    .where("active", "==", true)
    .get();
  const recipients = tokenSnapshot.docs.filter(item =>
    item.data().token && item.data().uid !== announcement.authorId
  );
  if(!recipients.length) return;

  const title = announcement.important ? "Wichtige Mitteilung" : "Neue Mitteilung";
  const body = `${announcement.authorName || "Matteo Team"}: ${String(announcement.text).slice(0, 160)}`;
  const invalidCodes = new Set([
    "messaging/registration-token-not-registered",
    "messaging/invalid-registration-token"
  ]);
  const cleanup = [];
  for(let start = 0; start < recipients.length; start += 500){
    const batch = recipients.slice(start, start + 500);
    const response = await getMessaging().sendEachForMulticast({
      tokens:batch.map(item => item.data().token),
      notification:{title, body},
      data:{type:"announcement", announcementId:event.params.announcementId},
      webpush:{
        notification:{
          icon:"https://milotahala.github.io/MatteoTeam/icons/icon-192.png",
          badge:"https://milotahala.github.io/MatteoTeam/icons/icon-192.png",
          tag:`announcement-${event.params.announcementId}`
        },
        fcmOptions:{link:"https://milotahala.github.io/MatteoTeam/#mitteilungen"}
      }
    });
    response.responses.forEach((result, index) => {
      if(!result.success && invalidCodes.has(result.error?.code)){
        cleanup.push(batch[index].ref.update({
          active:false, disabledAt:FieldValue.serverTimestamp()
        }));
      }
    });
  }
  await Promise.all(cleanup);
});
