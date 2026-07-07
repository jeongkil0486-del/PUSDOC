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
const scheduleMasterRef = firebase.database().ref('scheduleMaster'); 
const scheduleMetaRef = firebase.database().ref('scheduleMeta');   // ✅ 업로드 이력
const userAccountsRef = firebase.database().ref('userAccounts'); 
const briefingsRef = firebase.database().ref('briefings');
const briefingConfirmationsRef = firebase.database().ref('briefingConfirmations'); 
const briefingTemplateRef = firebase.database().ref('briefingTemplate'); 
const briefingTemplateMappingRef = firebase.database().ref('briefingTemplateMapping'); 

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
let scheduleMasterCache = {};
let userAccountsCache = {};
let briefingsCache = {};
let briefingConfirmationsCache = {};
let briefingTemplateCache = {};
let briefingTemplateMappingCache = {};
let currentCategory = null;
let isCategoriesLoaded   = false;
let isDataLoaded         = false;
let isAccountsLoaded     = false;
let sessionRestoreDone   = false;  // 세션 복원 중복 방지

let isFileListMinimizedMap = {};

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

categoriesRef.on('value', snapshot => {
  categoriesCache = snapshot.val() || {};
  isCategoriesLoaded = true;
  renderAdminAll();
  renderUserMenu();
  checkInitialSessionRestore();
});

dataRef.on('value', snapshot => {
  dynamicDataCache = snapshot.val() || {};
  isDataLoaded = true;
  renderAdminAll();
  if (currentCategory && categoriesCache[currentCategory]?.type !== 'schedule') {
    if (categoriesCache[currentCategory]?.type === 'grievance') renderUserGrievance();
    else renderUserFiles();
  }
  updateNoticeBadge(); // 내부에서 통합 상단 알림 처리
  checkInitialSessionRestore();
});

scheduleMasterRef.on('value', snapshot => {
  scheduleMasterCache = snapshot.val() || {};
  const infoPanel = document.getElementById('adminScheduleInfoPanel');
  if(infoPanel) {
    const totalEmployees = Object.keys(scheduleMasterCache).length;
    infoPanel.textContent = totalEmployees > 0 ? `📊 현재 서버에 ${totalEmployees}명의 엑셀 스케줄 데이터가 실시간 유지 중입니다.` : '❌ 등록된 스케줄이 없습니다. XLSX 파일을 업로드해 주세요.';
  }
  // ✅ 스케줄 데이터가 로드되면 달력의 년/월을 데이터 기준으로 자동 보정
  if(Object.keys(scheduleMasterCache).length > 0) {
    try {
      const firstKey = Object.keys(scheduleMasterCache)[0];
      const firstDates = Object.keys(scheduleMasterCache[firstKey] || {});
      if(firstDates.length > 0) {
        const sample = firstDates[0]; // "YYYY-MM-DD"
        const parts = sample.split('-');
        if(parts.length === 3) {
          const dataYear  = parseInt(parts[0], 10);
          const dataMonth = parseInt(parts[1], 10);
          const yearSel  = document.getElementById('calendarYearSelect');
          const monthSel = document.getElementById('calendarMonthSelect');
          if(yearSel && monthSel && yearSel.options.length > 0) {
            // 해당 년도 옵션이 있으면 선택
            const yOpt = Array.from(yearSel.options).find(o => parseInt(o.value,10) === dataYear);
            if(yOpt) yearSel.value = dataYear;
            if(monthSel.options.length >= dataMonth) monthSel.value = dataMonth;
          }
        }
      }
    } catch(e) { /* 자동 보정 실패 시 무시 */ }
  }

  // 📌 데이터 로드 시 사용자가 메뉴 진입을 안 해도 배경에서 실시간 스케줄 변경 이력을 선제 계산합니다.
  checkScheduleChangesBackground();

  if (currentCategory && categoriesCache[currentCategory]?.type === 'schedule') {
    renderScheduleCalendar();
  } else {
    renderUserMenu();
  }
});

userAccountsRef.on('value', snapshot => {
  userAccountsCache = snapshot.val() || {};
  isAccountsLoaded = true;
  renderAdminPopupIdList();
  checkInitialSessionRestore();
});

scheduleMetaRef.on('value', snapshot => {
  renderAdminUploadHistory(snapshot.val() || {});
});

briefingsRef.on('value', snapshot => {
  briefingsCache = snapshot.val() || {};
  renderAdminAll();
  if (currentCategory && categoriesCache[currentCategory]?.type === 'briefing') renderUserFiles();
});

briefingConfirmationsRef.on('value', snapshot => {
  briefingConfirmationsCache = snapshot.val() || {};
  renderAdminAll();
  renderUserMenu(); // 서명 저장 후 직원 홈 배지 즉시 갱신
  updateNoticeBadge(); // 상단 헤더 배지도 즉시 갱신
  if (currentCategory && categoriesCache[currentCategory]?.type === 'briefing') renderUserFiles();
});

briefingTemplateRef.on('value', snapshot => {
  briefingTemplateCache = snapshot.val() || {};
  renderAdminAll();
});

briefingTemplateMappingRef.on('value', snapshot => {
  briefingTemplateMappingCache = snapshot.val() || {};
  renderAdminAll();
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
  if (!isCategoriesLoaded || !isDataLoaded || !isAccountsLoaded) return;
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
