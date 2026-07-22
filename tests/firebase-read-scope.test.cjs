const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const refs = [];
const values = {
  categories: {
    notice: { type: 'board' },
    schedule: { type: 'schedule' },
    briefing: { type: 'briefing' },
    grievance: { type: 'grievance' }
  }
};

class Snapshot {
  constructor(value) { this.value = value; }
  val() { return this.value; }
  exists() { return this.value !== null && this.value !== undefined; }
}

class MockRef {
  constructor(refPath, query = '') {
    this.path = refPath;
    this.query = query;
    this.active = false;
    this.offCount = 0;
    refs.push(this);
  }
  child(key) { return new MockRef([this.path, key].filter(Boolean).join('/'), this.query); }
  orderByKey() { return new MockRef(this.path, `${this.query}|orderByKey`); }
  orderByChild(key) { return new MockRef(this.path, `${this.query}|orderByChild:${key}`); }
  startAt(value) { return new MockRef(this.path, `${this.query}|startAt:${value}`); }
  endAt(value) { return new MockRef(this.path, `${this.query}|endAt:${value}`); }
  equalTo(value) { return new MockRef(this.path, `${this.query}|equalTo:${value}`); }
  on(event, callback) {
    this.active = true;
    this.callback = callback;
    if (this.path === 'categories') callback(new Snapshot(values.categories));
  }
  off() { this.active = false; this.offCount++; }
  once(event, callback) {
    const snapshot = new Snapshot(values[this.path] || null);
    if (callback) callback(snapshot);
    return Promise.resolve(snapshot);
  }
  set() { return Promise.resolve(); }
  update() { return Promise.resolve(); }
  remove() { return Promise.resolve(); }
  toString() { return `mock://${this.path}${this.query}`; }
}

const storage = new Map();
const context = {
  firebase: {
    initializeApp() {},
    database() { return { ref(refPath = '') { return new MockRef(refPath); } }; }
  },
  location: { hostname: 'localhost' },
  localStorage: {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, String(value)); },
    removeItem(key) { storage.delete(key); }
  },
  document: {
    body: { classList: { remove() {} } },
    getElementById() { return null; }
  },
  console: { debug() {}, warn() {}, error() {}, log() {} },
  renderAdminAll() {}, renderUserMenu() {}, renderAdminPopupIdList() {},
  renderAdminUploadHistory() {}, checkScheduleChangesBackground() {},
  renderScheduleCalendar() {}, updateNoticeBadge() {}, renderBriefingCalendar() {},
  renderUserGrievance() {}, renderUserFiles() {},
  setTimeout, clearTimeout, Map, Promise, Date, Array, Object, String
};
vm.createContext(context);
const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'firebase-init.js'), 'utf8');
vm.runInContext(source, context, { filename: 'firebase-init.js' });

function activePaths() {
  return refs.filter(ref => ref.active).map(ref => ref.path).sort();
}

assert.deepStrictEqual(activePaths(), ['categories'], 'logged-out boot must subscribe only to categories');

storage.set('loggedInUserId', 'E001');
storage.set('loggedInUserName', '테스트 직원');
context.startUserFirebaseListeners();
assert.deepStrictEqual(activePaths(), [
  'briefingConfirmationIndex/E001', 'briefings', 'categories', 'noticeMetadata',
  'scheduleMaster/E001', 'userAccounts/E001'
].sort(), 'employee session must use scoped account, schedule, notice, briefing and confirmation-index reads');

const firstUserSessionRefs = refs.filter(ref => ref.active && ref.path !== 'categories');
context.stopSessionFirebaseListeners();
context.startUserFirebaseListeners();
assert(firstUserSessionRefs.every(ref => ref.offCount === 1), 'employee re-entry must detach every previous session listener');
assert.deepStrictEqual(activePaths(), [
  'briefingConfirmationIndex/E001', 'briefings', 'categories', 'noticeMetadata',
  'scheduleMaster/E001', 'userAccounts/E001'
].sort(), 'employee re-entry must not duplicate listeners');

context.loadUserCategoryData('grievance');
const grievanceQuery = refs.find(ref => ref.active && ref.path === 'dynamicData/grievance');
assert(grievanceQuery && grievanceQuery.query.includes('orderByChild:writerId') && grievanceQuery.query.includes('equalTo:E001'),
  'employee grievance read must be filtered to the logged-in employee');

const previousBriefingRefs = refs.filter(ref => ref.active && (ref.path === 'briefings' || ref.path === 'briefingConfirmationIndex/E001'));
context.loadUserBriefingMonth(2026, 8);
assert(previousBriefingRefs.every(ref => ref.offCount === 1), 'month change must detach the previous briefing listeners');

values['briefingConfirmations/2026-08-01/E001'] = { empId: 'E001', signedAtTs: 1, signature: 'data:image/png;base64,legacy' };
const currentGeneration = vm.runInContext('userBriefingLoadGeneration', context);
context.loadLegacyUserConfirmations('E001', ['2026-08-01'], currentGeneration);
assert(refs.some(ref => ref.path === 'briefingConfirmations/2026-08-01/E001'),
  'legacy fallback must request only the current employee confirmation');

context.startAdminFirebaseListeners();
assert.deepStrictEqual(activePaths(), ['categories', 'scheduleMaster', 'scheduleMeta', 'userAccounts'].sort(),
  'admin session must start only admin account/schedule/meta listeners');

context.loadAdminCategoryData('notice');
const firstAdminNotice = refs.find(ref => ref.active && ref.path === 'dynamicData/notice');
context.loadAdminCategoryData('notice');
assert.strictEqual(firstAdminNotice.offCount, 1, 're-registering an admin category must detach the old listener');

context.stopSessionFirebaseListeners();
assert.deepStrictEqual(activePaths(), ['categories'], 'logout must leave only the boot categories listener');

const authSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'user-auth.js'), 'utf8');
assert(!/userAccountsRef\.once\(['"]value['"]\)/.test(authSource),
  'employee login must never fall back to reading all user accounts');
const indexSource = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert(indexSource.includes('<div id="loginScreen">') && !indexSource.includes('<div id="loginScreen" class="hidden">'),
  'latest main login screen visibility fix must remain');
const logoutSource = authSource.slice(authSource.indexOf('function logout()'), authSource.indexOf('function showMenu()'));
assert(logoutSource.includes("getElementById('bootHideLoginStyle')") &&
  logoutSource.includes("classList.remove('app-booting')") &&
  logoutSource.includes("getElementById('appBootScreen')") &&
  logoutSource.includes("loginScreen.classList.remove('hidden')"),
  'mobile/PWA logout white-screen recovery must remain');
assert(source.includes("getElementById('bootHideLoginStyle')") && source.includes("classList.remove('app-booting')"),
  'finishAppBoot white-screen recovery must remain');
assert(!source.slice(source.indexOf('function startUserFirebaseListeners'), source.indexOf('function updateAdminScheduleInfo')).includes('briefingTemplateRef'),
  'employee session must not read briefingTemplate.dataUrl');
assert(source.includes("briefingConfirmationsRef.child(dateKey).child(empId).once('value')"),
  'legacy confirmation fallback must read only the current employee record');

const handlerSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'data-handlers.js'), 'utf8');
const saveBoardSource = handlerSource.slice(handlerSource.indexOf('async function saveBoardItem'), handlerSource.indexOf('async function deleteDataItem'));
assert(saveBoardSource.includes("uploadToR2(attachedImageFile, 'board_images'"),
  'new board images must upload to R2');
assert(!saveBoardSource.includes('readAsDataURL'), 'board save must not persist a base64 image');
assert(saveBoardSource.includes('noticeMetadata/${newItemId}') && saveBoardSource.includes('dynamicData/${activeEditorCatId}/${newItemId}'),
  'new notices must update content and lightweight metadata together');
assert(authSource.includes('if(n.imageUrl)') && authSource.includes('src="${n.imageUrl}"'),
  'existing base64 imageUrl values must remain renderable');

const briefingSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'briefing-signature.js'), 'utf8');
assert(briefingSource.includes('briefingConfirmations/${dateKey}/${id}') &&
  briefingSource.includes('briefingConfirmationIndex/${id}/${dateKey}'),
  'signature save must update both the existing confirmation and lightweight index');
assert(briefingSource.includes('function cloneWorksheetFull') &&
  briefingSource.includes('mergeCellsWithoutStyle') &&
  briefingSource.includes('insertSignatureImageCentered') &&
  briefingSource.includes('const ws = cloneWorksheetFull'),
  'monthly ExcelJS workbook cloning and signature placement code must remain');

const rulesDoc = fs.readFileSync(path.join(__dirname, '..', 'FIREBASE_RULES_RECOMMENDATIONS.md'), 'utf8');
const rulesExample = rulesDoc.match(/```json\s*([\s\S]*?)```/);
assert(rulesExample, 'rules recommendation must contain a JSON example');
JSON.parse(rulesExample[1]);
assert(rulesExample[1].includes("query.orderByChild === 'writerId'") &&
  rulesExample[1].includes("query.equalTo === auth.token.empId") &&
  rulesExample[1].includes('".indexOn": ["writerId"]'),
  'grievance rules must require the employee writerId query and index');

console.log('firebase-read-scope tests passed');
