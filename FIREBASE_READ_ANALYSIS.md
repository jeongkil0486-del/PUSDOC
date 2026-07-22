# Firebase read/download analysis

## Confirmed causes and changes

| Cause | Files / functions | Previous scope | Required scope | Change | Compatibility risk |
| --- | --- | --- | --- | --- | --- |
| Large listeners started before login | `js/firebase-init.js` top-level listeners | Full `dynamicData`, `scheduleMaster`, `userAccounts`, `briefings`, `briefingConfirmations`, `briefingTemplate`, mapping and schedule metadata | Logged-out users need only `categories` | Added a keyed listener registry and role/view loaders; only `categories` starts at boot | Low; session restore now starts role-specific loaders after categories arrive |
| Employee account lookup fallback | `js/user-auth.js` `doLogin` | `userAccounts/{input}` followed by all `userAccounts` | `userAccounts/{employeeId}` only | Removed name-based full-list fallback | Employees must enter their employee ID, as the login UI already states |
| Employee schedule download | old top-level schedule listener; schedule render/change functions | All employees under `scheduleMaster` | `scheduleMaster/{employeeId}` | Employee cache remains `{ [employeeId]: schedule }`; admin retains full schedule after admin login | Low; schedule uploads already key data by employee ID |
| All employee signatures downloaded | old top-level confirmation listener | All dates and employees, including base64 PNG signatures | Employee's lightweight status for the selected month; own legacy record only as fallback | Added `briefingConfirmationIndex/{employeeId}/{dateKey}`; signature save uses a root multi-location update; fallback reads only `briefingConfirmations/{dateKey}/{employeeId}` | Existing records work through scoped fallback; old data is not automatically migrated |
| All briefings downloaded continuously | old top-level briefing listener | All dates | Selected month | Uses `orderByKey().startAt(YYYY-MM-01).endAt(YYYY-MM-31)` and replaces the old month listener | Menu badge now represents the loaded/current month rather than every historical month |
| Workbook dataUrl downloaded by employees | old top-level template listener; `getTemplateSectionText` | Entire `briefingTemplate` workbook plus mapping | Text needed to display template-backed sections only | Employees read `briefingTemplateContent` on first template-backed briefing open; admin template/mapping saves refresh that lightweight copy; newly saved briefings also embed resolved template text | Existing installations should explicitly re-save the template or mapping once to create the lightweight text copy; no automatic migration runs |
| All category data downloaded | old top-level `dynamicData` listener | Every category, including grievances and base64 images | Current category; lightweight timestamps for the notice badge | Category listener is installed on entry and removed on exit; employee login subscribes to `noticeMetadata` instead of `dynamicData/notice` | Non-notice menu badges populate after a category has been loaded instead of forcing all data downloads |
| Grievances present in employee/admin cache too early | old full `dynamicData` listener; admin grievance renderer | Every grievance before employee filtering or admin password prompt | Employee's own submissions; administrator only after prompt | Employee query filters by `writerId`; admin listener starts only after the existing prompt succeeds | RTDB Rules must enforce equivalent access; client-side queries are not an authorization boundary |
| Board images stored in RTDB | `js/data-handlers.js` `saveBoardItem` | New image converted to base64 dataUrl and saved in `dynamicData` | R2 URL only | New images upload through `uploadToR2(..., 'board_images')`; RTDB write occurs only after upload succeeds | Existing base64 records still display and are not migrated; unchanged images remain unchanged on edit |
| Duplicate/stale listeners | entry/session functions across files | Re-entry could add listeners with no matching `off()` | One listener per role/view/query | Registry stores the exact query/event/callback and replaces it by key; logout, role change, category change, month change and section collapse detach listeners | Low; local debug builds log subscribe/unsubscribe paths |
| Admin monthly workbook read scope | `downloadBriefingMonthlyWorkbook` | Relied on globally cached all-history confirmations/template | Selected month's briefings and confirmations; template/mapping only for the action | Action performs bounded month reads and one-time template/mapping reads before preserving the existing ExcelJS workflow | Workbook cloning, merges, borders, fonts, dimensions and signature placement code were not changed |

## Read lifecycle after the change

- Logged out: live `categories`; one-time default-category check and one `userAccounts/PUSDOC` existence check remain.
- Employee login: one account record, one employee schedule record, lightweight `noticeMetadata`, current-month briefings, and the employee's current-month confirmation index.
- Employee category view: one selected `dynamicData/{catId}` listener; grievance is additionally filtered by `writerId`.
- Employee briefing month change: previous briefing and index queries are detached, caches are reset, and the selected month is subscribed.
- Administrator login: full accounts and schedules plus schedule upload metadata. Category content is loaded only when its section is expanded; grievance content only after the existing prompt.
- Administrator briefing section: selected-month briefings and confirmations plus one-time template/mapping reads. Collapsing detaches month listeners and drops workbook caches.
- Logout/role change: every `session:` and `view:` listener is detached and role caches are cleared.

## New RTDB paths and compatibility

- `briefingConfirmationIndex/{employeeId}/{dateKey}` stores `confirmed`, `signedAt`, and `signedAtTs` without a signature image.
- `briefingTemplateContent` stores only the four extracted section texts and an update timestamp; it never contains the workbook dataUrl or cell mapping.
- `noticeMetadata/{itemId}` stores only the notice timestamp used for unread badge calculation. New notice create/edit/delete operations update the content and metadata together with a multi-location update.
- Existing `briefingConfirmations`, template dataUrl, base64 board images, and all other records are left in place.
- No automatic migration, deletion, Firebase Rules deployment, Worker deployment, or R2 migration is performed.

## Security and residual cost findings

- `ADMIN_ID`/`ADMIN_PW`, the grievance prompt password, and `UPLOAD_SECRET` are hardcoded in client JavaScript. Anyone who receives the site assets can inspect them.
- The R2 upload secret is sent from the browser, so it cannot be treated as a secret. The Worker should issue short-lived authenticated upload authorization or validate a server-side authenticated session.
- No Firebase Rules file is present in this repository. The deployed RTDB Rules must independently prevent employees from reading all accounts, schedules, grievances, confirmations, confirmation indexes, templates and FCM tokens. Query scoping reduces downloads but does not replace authorization.
- Authentication and role restoration rely on client-side constants/local storage rather than Firebase Authentication or server-verified claims. A broader authentication redesign was intentionally not attempted in this download-optimization change.
- Notice content was previously kept live only to calculate unread counts from each item's `timestamp`. The badge needs item IDs and timestamps, not titles, bodies, or `imageUrl`, so `noticeMetadata` is sufficient at login.
- Existing notices, including base64 `imageUrl` values, remain readable and display when the notice menu is opened. They are not copied automatically into `noticeMetadata`; administrators can perform a separately reviewed one-time metadata backfill if historical unread badge counts must be exact before the next notice changes.
- Existing confirmation records remain base64-heavy for administrators when a month is explicitly opened or downloaded. Moving future signature binaries to object storage would reduce those action-specific reads, but was outside the compatibility constraints.
