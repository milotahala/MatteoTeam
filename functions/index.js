const {onDocumentUpdated} = require("firebase-functions/v2/firestore");
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const {getMessaging} = require("firebase-admin/messaging");
const nodemailer = require("nodemailer");

initializeApp();

const SUPERADMIN_UID = "zHjssSqBb4W1iffwCs9RJmfUVYJ3";
const SMTP_USER = defineSecret("SMTP_USER");
const SMTP_PASSWORD = defineSecret("SMTP_PASSWORD");

function escapeHtml(value){
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function orderTable(order){
  const vegetable = order.type === "gemuese";
  const headings = vegetable
    ? ["Nr.", "Artikel", "Kiste/Sack", "Kilo", "Stück/Bund"]
    : ["Nr.", "Artikel", "Bezeichnung", "Stück", "Karton"];
  const rows = order.items.map(item => {
    const values = vegetable
      ? [item.nr, item.name, item.crate, item.kilo, item.bundle]
      : [item.nr, item.article, item.name, item.piece, item.carton];
    return `<tr>${values.map(value => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`;
  }).join("");
  return `<table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">
    <thead><tr>${headings.map(value => `<th style="border:1px solid #cbd5e1;background:#eef2f7;padding:9px;text-align:left">${value}</th>`).join("")}</tr></thead>
    <tbody>${rows}</tbody>
  </table>`.replaceAll("<td>", '<td style="border:1px solid #cbd5e1;padding:9px">');
}

exports.sendSupplierOrderEmail = onCall({
  region:"europe-west1",
  secrets:[SMTP_USER, SMTP_PASSWORD]
}, async request => {
  if(!request.auth) throw new HttpsError("unauthenticated", "Bitte neu anmelden.");
  const db = getFirestore();
  const userSnap = await db.collection("users").doc(request.auth.uid).get();
  const role = userSnap.data()?.role;
  if(request.auth.uid !== SUPERADMIN_UID && !["admin", "superadmin"].includes(role)){
    throw new HttpsError("permission-denied", "Nur Admin darf Bestellungen senden.");
  }

  const data = request.data || {};
  const email = String(data.email || "").trim().toLowerCase();
  const supplier = String(data.supplier || "").trim();
  const orderNumber = String(data.orderNumber || "").trim();
  const items = Array.isArray(data.items) ? data.items.slice(0, 300) : [];
  const other = String(data.other || "").trim().slice(0, 10000);
  if(!supplier || !orderNumber || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
    throw new HttpsError("invalid-argument", "Lieferant oder E-Mail-Adresse ist ungültig.");
  }
  if(!items.length && !other) throw new HttpsError("invalid-argument", "Die Bestellung ist leer.");

  const table = items.length ? orderTable({...data, items}) : "";
  const html = `<div style="max-width:900px;margin:auto;font-family:Arial,sans-serif;color:#172033">
    <h2 style="margin-bottom:4px">Bestellung ${escapeHtml(orderNumber)}</h2>
    <p style="margin-top:0"><strong>Pizzeria Ristorante Matteo GmbH</strong></p>
    <p>Guten Tag,<br><br>hiermit bestellen wir folgende Artikel:</p>
    ${table}
    ${other ? `<h3>Sonstiges</h3><div style="white-space:pre-wrap;border:1px solid #cbd5e1;padding:12px">${escapeHtml(other)}</div>` : ""}
    ${data.deliveryDate ? `<p><strong>Gewünschtes Lieferdatum:</strong> ${escapeHtml(data.deliveryDate)}</p>` : ""}
    ${data.note ? `<p><strong>Nachricht:</strong><br>${escapeHtml(data.note)}</p>` : ""}
    <p><strong>Bestellnummer:</strong> ${escapeHtml(orderNumber)}</p>
    <p>Mit freundlichen Grüßen<br><strong>Pizzeria Ristorante Matteo GmbH</strong></p>
  </div>`;

  const transporter = nodemailer.createTransport({
    host:"smtp.ionos.de",
    port:465,
    secure:true,
    auth:{user:SMTP_USER.value(), pass:SMTP_PASSWORD.value()}
  });
  try{
    const info = await transporter.sendMail({
      from:`Pizzeria Ristorante Matteo GmbH <${SMTP_USER.value()}>`,
      to:email,
      replyTo:"milot@pizzeriamatteo.de",
      subject:`Bestellung ${orderNumber} – Pizzeria Ristorante Matteo`,
      html
    });
    return {ok:true, messageId:info.messageId || ""};
  }catch(error){
    console.error("Supplier email failed", error);
    throw new HttpsError("internal", "E-Mail konnte über 1&1 nicht gesendet werden.");
  }
});

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
