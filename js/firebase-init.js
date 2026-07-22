/* =========================================================
   Firebase 세션 정의
========================================================= */
const firebaseConfig = {
  apiKey: "AIzaSyCI63LAj72YVvDHJUE2cD3YQIZH7z1e_J4",
  authDomain: "pusdoc-83c80.firebaseapp.com",
  databaseURL: "https://pusdoc-83c80-default-rtdb.firebaseio.com",
  projectId: "pusdoc-83c80",
  storageBucket: "pusdoc-83c80.firebasestorage.app",
  messagingSenderId: "902413106606",
  appId: "1:902413106606:web:aaab7c8652847763bf5c3f"
};
firebase.initializeApp(firebaseConfig);

const categoriesRef = firebase.database().ref('categories');
const dataRef = firebase.database().ref('dynamicData');
const noticeMetadataRef = firebase.database().ref('noticeMetadata');
const scheduleMasterRef = firebase.database().ref('scheduleMaster'); 
const scheduleMetaRef = firebase.database().ref('scheduleMeta');   // ✅ 업로드 이력
const userAccountsRef = firebase.database().ref('userAccounts'); 
const briefingsRef = firebase.database().ref('briefings');
const briefingConfirmationsRef = firebase.database().ref('briefingConfirmations'); 
const briefingConfirmationIndexRef = firebase.database().ref('briefingConfirmationIndex');
const briefingTemplateRef = firebase.database().ref('briefingTemplate'); 
const briefingTemplateMappingRef = firebase.database().ref('briefingTemplateMapping'); 
const briefingTemplateContentRef = firebase.database().ref('briefingTemplateContent');

const WORKER_URL = 'https://pusdoc.jeongkil0486.workers.dev'; 
const UPLOAD_SECRET = 'PUSDOC';                                        
const R2_PUBLIC_BASE = 'https://pub-0ac04327385c410ca267e994bea14de1.r2.dev'; 

const SESSION_KEY = 'eduSiteSession';
const LOGGED_IN_ID_KEY = 'loggedInUserId'; 
const ADMIN_ID = 'PUSEDU';
const ADMIN_PW = 'PUSEDU'; // 관리자 아이디 및 비번 PUSEDU로 동일 세팅 완료
const USER_ID  = 'PUSDOC';

let categoriesCache = {};
let dynamicDataCache = {};
let noticeMetadataCache = {};
let scheduleMasterCache = {};
let userAccountsCache = {};
let briefingsCache = {};
let briefingConfirmationsCache = {};
let briefingTemplateCache = {};
let briefingTemplateMappingCache = {};
let briefingTemplateContentCache = {};
let currentCategory = null;
let isCategoriesLoaded   = false;
let isDataLoaded         = false;
let isAccountsLoaded     = false;
let sessionRestoreDone   = false;  // 세션 복원 중복 방지

let isFileListMinimizedMap = {};

/* Firebase compat listener registry. Every live query is registered under a
   stable key so repeated session/menu entry replaces, rather than duplicates,
   the previous listener. */
const activeFirebaseListeners = new Map();
const FIREBASE_READ_DEBUG = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);

function subscribeFirebase(key, query, eventType, callback) {
  removeFirebaseListener(key);
  query.on(eventType, callback);
  activeFirebaseListeners.set(key, { query, eventType, callback });
  if (FIREBASE_READ_DEBUG) console.debug('[RTDB subscribe]', key, query.toString());
}

function removeFirebaseListener(key) {
  const active = activeFirebaseListeners.get(key);
  if (!active) return;
  active.query.off(active.eventType, active.callback);
  activeFirebaseListeners.delete(key);
  if (FIREBASE_READ_DEBUG) console.debug('[RTDB unsubscribe]', key);
}

function removeFirebaseListenersByPrefix(prefix) {
  Array.from(activeFirebaseListeners.keys()).forEach(function(key) {
    if (key.indexOf(prefix) === 0) removeFirebaseListener(key);
  });
}

function resetRoleCaches() {
  dynamicDataCache = {};
  noticeMetadataCache = {};
  scheduleMasterCache = {};
  userAccountsCache = {};
  briefingsCache = {};
  briefingConfirmationsCache = {};
  briefingTemplateCache = {};
  briefingTemplateMappingCache = {};
  briefingTemplateContentCache = {};
  activeUserCategoryId = null;
  isFileListMinimizedMap = {};
  if (typeof resetAdminSensitiveState === 'function') resetAdminSensitiveState();
}

function stopSessionFirebaseListeners() {
  userBriefingLoadGeneration++;
  adminBriefingLoadGeneration++;
  removeFirebaseListenersByPrefix('session:');
  removeFirebaseListenersByPrefix('view:');
  resetRoleCaches();
}

function monthKeyRange(year, month) {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  return { prefix, start: `${prefix}-01`, end: `${prefix}-31` };
}

function makeMonthQuery(ref, year, month) {
  const range = monthKeyRange(year, month);
  return ref.orderByKey().startAt(range.start).endAt(range.end);
}

let activeUserCategoryId = null;
function unloadUserCategoryData() {
  removeFirebaseListener('view:user:category');
  if (activeUserCategoryId) delete dynamicDataCache[activeUserCategoryId];
  activeUserCategoryId = null;
}

function loadUserCategoryData(catId) {
  unloadUserCategoryData();
  activeUserCategoryId = catId;
  const cat = categoriesCache[catId] || {};
  const empId = (localStorage.getItem(LOGGED_IN_ID_KEY) || '').trim();
  let query = dataRef.child(catId);
  if (cat.type === 'grievance' && empId) {
    query = query.orderByChild('writerId').equalTo(empId);
  }
  subscribeFirebase('view:user:category', query, 'value', function(snapshot) {
    dynamicDataCache[catId] = snapshot.val() || {};
    if (currentCategory !== catId) return;
    if (cat.type === 'grievance') renderUserGrievance();
    else renderUserFiles();
  });
}

async function loadLegacyUserConfirmations(empId, dateKeys, generation) {
  const missing = dateKeys.filter(function(dateKey) {
    return !(briefingConfirmationsCache[dateKey] && briefingConfirmationsCache[dateKey][empId]);
  });
  await Promise.all(missing.map(async function(dateKey) {
    const snapshot = await briefingConfirmationsRef.child(dateKey).child(empId).once('value');
    if (generation !== userBriefingLoadGeneration || !snapshot.exists()) return;
    briefingConfirmationsCache[dateKey] = { [empId]: snapshot.val() };
  }));
}

let briefingTemplateContentPromise = null;
async function loadUserBriefingTemplateContentOnce() {
  if (Object.keys(briefingTemplateContentCache).length) return briefingTemplateContentCache;
  if (!briefingTemplateContentPromise) {
    briefingTemplateContentPromise = briefingTemplateContentRef.once('value').then(function(snapshot) {
      if (localStorage.getItem(SESSION_KEY) !== 'user') return {};
      briefingTemplateContentCache = snapshot.val() || {};
      return briefingTemplateContentCache;
    }).finally(function() {
      briefingTemplateContentPromise = null;
    });
  }
  return briefingTemplateContentPromise;
}

let userBriefingLoadGeneration = 0;
function loadUserBriefingMonth(year, month) {
  const empId = (localStorage.getItem(LOGGED_IN_ID_KEY) || '').trim();
  if (!empId) return;
  const generation = ++userBriefingLoadGeneration;
  briefingsCache = {};
  briefingConfirmationsCache = {};
  removeFirebaseListener('session:user:briefings');
  removeFirebaseListener('session:user:confirmation-index');

  subscribeFirebase('session:user:confirmation-index', makeMonthQuery(briefingConfirmationIndexRef.child(empId), year, month), 'value', async function(snapshot) {
    if (generation !== userBriefingLoadGeneration) return;
    const index = snapshot.val() || {};
    briefingConfirmationsCache = {};
    Object.keys(index).forEach(function(dateKey) {
      briefingConfirmationsCache[dateKey] = { [empId]: index[dateKey] };
    });
    await loadLegacyUserConfirmations(empId, Object.keys(briefingsCache), generation);
    if (generation !== userBriefingLoadGeneration) return;
    renderUserMenu();
    updateNoticeBadge();
    if (currentCategory && categoriesCache[currentCategory]?.type === 'briefing') renderBriefingCalendar();
  });

  subscribeFirebase('session:user:briefings', makeMonthQuery(briefingsRef, year, month), 'value', async function(snapshot) {
    if (generation !== userBriefingLoadGeneration) return;
    briefingsCache = snapshot.val() || {};
    await loadLegacyUserConfirmations(empId, Object.keys(briefingsCache), generation);
    if (generation !== userBriefingLoadGeneration) return;
    renderUserMenu();
    updateNoticeBadge();
    if (currentCategory && categoriesCache[currentCategory]?.type === 'briefing') renderBriefingCalendar();
  });
}

function startUserFirebaseListeners() {
  stopSessionFirebaseListeners();
  const empId = (localStorage.getItem(LOGGED_IN_ID_KEY) || '').trim();
  if (!empId) return;
  userAccountsCache = { [empId]: { empId, empName: localStorage.getItem('loggedInUserName') || '' } };

  subscribeFirebase('session:user:account', userAccountsRef.child(empId), 'value', function(snapshot) {
    if (snapshot.exists()) userAccountsCache = { [empId]: snapshot.val() };
  });
  subscribeFirebase('session:user:schedule', scheduleMasterRef.child(empId), 'value', function(snapshot) {
    scheduleMasterCache = { [empId]: snapshot.val() || {} };
    checkScheduleChangesBackground();
    if (currentCategory && categoriesCache[currentCategory]?.type === 'schedule') renderScheduleCalendar();
    else renderUserMenu();
  });
  subscribeFirebase('session:user:notice-metadata', noticeMetadataRef, 'value', function(snapshot) {
    noticeMetadataCache = snapshot.val() || {};
    updateNoticeBadge();
    renderUserMenu();
  });
  const now = new Date();
  loadUserBriefingMonth(now.getFullYear(), now.getMonth() + 1);
}

function updateAdminScheduleInfo() {
  const infoPanel = document.getElementById('adminScheduleInfoPanel');
  if (!infoPanel) return;
  const count = Object.keys(scheduleMasterCache).length;
  infoPanel.textContent = count > 0
    ? `📊 현재 서버에 ${count}명의 엑셀 스케줄 데이터가 실시간 유지 중입니다.`
    : '❌ 등록된 스케줄이 없습니다. XLSX 파일을 업로드해 주세요.';
}

function startAdminFirebaseListeners() {
  stopSessionFirebaseListeners();
  subscribeFirebase('session:admin:accounts', userAccountsRef, 'value', function(snapshot) {
    userAccountsCache = snapshot.val() || {};
    renderAdminPopupIdList();
  });
  subscribeFirebase('session:admin:schedule', scheduleMasterRef, 'value', function(snapshot) {
    scheduleMasterCache = snapshot.val() || {};
    updateAdminScheduleInfo();
  });
  subscribeFirebase('session:admin:schedule-meta', scheduleMetaRef, 'value', function(snapshot) {
    renderAdminUploadHistory(snapshot.val() || {});
  });
}

function loadAdminCategoryData(catId) {
  const key = `view:admin:category:${catId}`;
  subscribeFirebase(key, dataRef.child(catId), 'value', function(snapshot) {
    dynamicDataCache[catId] = snapshot.val() || {};
    renderAdminAll();
  });
}

function unloadAdminCategoryData(catId) {
  removeFirebaseListener(`view:admin:category:${catId}`);
  delete dynamicDataCache[catId];
}

let adminBriefingLoadGeneration = 0;
function loadAdminBriefingMonth(catId, year, month) {
  const generation = ++adminBriefingLoadGeneration;
  briefingsCache = {};
  briefingConfirmationsCache = {};
  removeFirebaseListener('view:admin:briefings');
  removeFirebaseListener('view:admin:confirmations');
  subscribeFirebase('view:admin:briefings', makeMonthQuery(briefingsRef, year, month), 'value', function(snapshot) {
    if (generation !== adminBriefingLoadGeneration) return;
    briefingsCache = snapshot.val() || {};
    renderAdminAll();
  });
  subscribeFirebase('view:admin:confirmations', makeMonthQuery(briefingConfirmationsRef, year, month), 'value', function(snapshot) {
    if (generation !== adminBriefingLoadGeneration) return;
    briefingConfirmationsCache = snapshot.val() || {};
  });
}

async function loadAdminBriefingResources(catId, year, month) {
  loadAdminBriefingMonth(catId, year, month);
  const generation = adminBriefingLoadGeneration;
  const results = await Promise.all([
    briefingTemplateRef.once('value'),
    briefingTemplateMappingRef.once('value')
  ]);
  if (generation !== adminBriefingLoadGeneration || localStorage.getItem(SESSION_KEY) !== 'admin' || isFileListMinimizedMap[catId]) return;
  briefingTemplateCache = results[0].val() || {};
  briefingTemplateMappingCache = results[1].val() || {};
  renderAdminAll();
}

async function ensureAdminBriefingDownloadData(year, month) {
  const results = await Promise.all([
    makeMonthQuery(briefingsRef, year, month).once('value'),
    makeMonthQuery(briefingConfirmationsRef, year, month).once('value'),
    briefingTemplateRef.once('value'),
    briefingTemplateMappingRef.once('value')
  ]);
  briefingsCache = results[0].val() || {};
  briefingConfirmationsCache = results[1].val() || {};
  briefingTemplateCache = results[2].val() || {};
  briefingTemplateMappingCache = results[3].val() || {};
}

function initDefaultCategories() {
  categoriesRef.once('value', snapshot => {
    const existing = snapshot.val() || {};
    const updates = {};
    if(!existing["notice"]) updates["notice"] = { name: "공지사항", type: "board", icon: "📢", order: 1 };
    // "업무 표준화"(standard) 자동생성 제거 - 사용자가 직접 만든 항목은 DB에 유지됨
    if(!existing["schedule"]) updates["schedule"] = { name: "근무 스케줄", type: "schedule", icon: "📅", order: 3 };
    if(!existing["briefing"]) updates["briefing"] = { name: "브리핑일지", type: "briefing", icon: "🛫", order: 4 };
    if(!existing["edu"]) updates["edu"] = { name: "교육자료", type: "file", icon: "📘", order: 5 };
    if(Object.keys(updates).length > 0) categoriesRef.update(updates);
  });
  
  userAccountsRef.child('PUSDOC').once('value', s => {
    if(!s.exists()) userAccountsRef.child('PUSDOC').set({ empId: 'PUSDOC', empName: '마스터 사원', pw: 'PUSDOC' });
  });
}
initDefaultCategories();

subscribeFirebase('boot:categories', categoriesRef, 'value', snapshot => {
  categoriesCache = snapshot.val() || {};
  isCategoriesLoaded = true;
  renderAdminAll();
  renderUserMenu();
  checkInitialSessionRestore();
});


/* 앱 부팅 완료 — booting 클래스 제거 + 로딩 화면 삭제
   세션 있으면 enterAdmin/enterUser가 이미 올바른 화면을 표시한 상태이고,
   세션 없으면 loginScreen이 정상 노출된다. */
function finishAppBoot() {
  document.body.classList.remove('app-booting');
  const boot = document.getElementById('appBootScreen');
  if (boot) boot.remove();
  // 세션이 없을 때: 부팅 스타일 제거 후 loginScreen 표시
  const session = localStorage.getItem(SESSION_KEY);
  if (!session || (session !== 'admin' && session !== 'user')) {
    const bootStyle = document.getElementById('bootHideLoginStyle');
    if (bootStyle) bootStyle.remove();
    const ls = document.getElementById('loginScreen');
    if (ls) {
      ls.classList.remove('hidden');
      ls.style.removeProperty('display');
    }
  }
}

function checkInitialSessionRestore() {
  if (sessionRestoreDone) return;
  if (!isCategoriesLoaded) return;
  sessionRestoreDone = true;

  const session = localStorage.getItem(SESSION_KEY);
  if (session === 'admin') {
    enterAdmin();
  } else if (session === 'user') {
    enterUser();
  }

  finishAppBoot();
}

function renderAdminUploadHistory(metaData) {
  const panel = document.getElementById('adminUploadHistoryPanel');
  if(!panel) return;
  const keys = Object.keys(metaData).sort().reverse(); // 최신순
  if(keys.length === 0) {
    panel.innerHTML = '<span style="color:#bbb;">아직 업로드된 근무표가 없습니다.</span>';
    return;
  }
  panel.innerHTML = keys.map(k => {
    const m = metaData[k];
    return `<div style="display:flex; justify-content:space-between; align-items:center; padding:6px 8px; background:#fff; border-radius:7px; border:1px solid #eef0fa; margin-bottom:5px;">
      <div>
        <span style="font-weight:700; color:#6d83ff;">${escapeHtml(m.label)}</span>
        <span style="color:#aaa; font-size:11px; margin-left:8px;">${escapeHtml(m.uploadedAt)}</span>
        <span style="color:#27ae60; font-size:11px; margin-left:6px;">직원 ${m.empCount}명</span>
      </div>
      <button onclick="deleteUploadMeta('${k}')" style="background:none; border:none; color:#ddd; cursor:pointer; font-size:12px; padding:2px 6px;" title="이력 삭제">✕</button>
    </div>`;
  }).join('');
}

async function deleteUploadMeta(key) {
  await scheduleMetaRef.child(key).remove();
}

// ✅ 관리자 년/월 셀렉터 초기화
(function initAdminSchSelectors() {
  const now = new Date();
  const yearSel  = document.getElementById('adminSchYear');
  const monthSel = document.getElementById('adminSchMonth');
  if(!yearSel || !monthSel) return;
  for(let y = now.getFullYear() - 1; y <= now.getFullYear() + 2; y++) {
    const opt = document.createElement('option');
    opt.value = y; opt.textContent = y + '년';
    if(y === now.getFullYear()) opt.selected = true;
    yearSel.appendChild(opt);
  }
  for(let m = 1; m <= 12; m++) {
    const opt = document.createElement('option');
    opt.value = m; opt.textContent = m + '월';
    if(m === now.getMonth() + 1) opt.selected = true;
    monthSel.appendChild(opt);
  }
})();
