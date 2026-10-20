# MatteoTeam

Static Firebase restaurant app, served from `index.html`.

## Weekly plan photo import

Admins can import an image or a private `matteoteam-plan-v1` JSON transcription. OCR runs in the browser using lazily loaded
Tesseract.js 5.1.1. Images are not uploaded. Network access is needed for the OCR
engine and language files. Clear, straight photos with seven dated columns work
best. All names, target dates, sectors and times must be checked before applying.
OCR may omit or misread cells; the original image stays visible during review.

Start-only values expand using the owner's shift rules. Noon deliberately stays
unresolved until the admin chooses an end time. Blank imported cells preserve
existing shifts; conflicts block import. Applying a preview only updates the
local draft. `Plan speichern` persists the plan and roster in one transaction.
Concurrent plan/roster edits block saving and require reload.

Planning identities live in `weeklyPlans/_people`, independently of Firebase Auth
and `users`. Week documents retain a people snapshot, sector-specific rows, and
canonical `entries` for existing hours, vacation and sick-leave workflows.
No personal plan data is embedded in the public application source.
Connecting a planning person to an account retains identity aliases for historical
hours. Milot and Mirela each have one identity across two sector rows. Overlapping
same-day sector shifts block saving. Existing canonical sick/vacation changes
supersede stale sector rows. Actual `timeClock` records are never written by the
weekly-plan editor; existing Soll/Ist views use canonical linked identities.

The existing automatic break and night-pay policies remain in effect. A shift's
end time is planned; actual extensions are recorded in Stempeluhr. Existing
Firestore permissions continue to apply; read-only staff controls are enforced
in the UI and write handlers retain admin checks.

## Checks

With Node.js 24 or later:

```sh
npm ci
npm test
```

Tests cover shift rules, ambiguous noon, minutes, midnight, sector conflicts,
positioned OCR columns, import review/rollback, account linking/history,
concurrent writes, canonical sick-leave updates, and staff read-only rendering.
DOM integration uses an isolated Firestore adapter; it does not contact production
Firebase. Browser OCR quality and production Firebase authorization still need a
check with an admin session and a real image.
