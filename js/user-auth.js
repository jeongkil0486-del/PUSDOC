/* =========================================================
   일반 모드(회원용) 및 로그인 제어 파트
========================================================= */
async function doLogin() {
  const id  = document.getElementById('loginId').value.trim();
  const pw  = document.getElementById('loginPw').value.trim();
  const err = document.getElementById('loginError');
  const btn = document.querySelector('.login-box button');

  err.textContent = '';
  if (!id || !pw) { err.textContent = '사번과 비밀번호를 모두 입력해 주세요.'; return; }

  // 관리자 ID 및 PW인 PUSEDU 매칭 변경 세팅부
  if (id === ADMIN_ID && pw === ADMIN_PW) {
    localStorage.setItem(LOGGED_IN_ID_KEY, id);
    localStorage.setItem('loggedInUserName', '');
    localStorage.setItem(SESSION_KEY, 'admin');
    enterAdmin();
    return;
  }

  if (id === USER_ID && pw === 'PUSDOC') {
    localStorage.setItem(LOGGED_IN_ID_KEY, id);
    localStorage.setItem('loggedInUserName', '마스터');
    localStorage.setItem(SESSION_KEY, 'user');
    enterUser();
    return;
  }

  btn.disabled = true;
  btn.textContent = '확인 중...';
  err.textContent = '';

  try {
    let snap = await userAccountsRef.child(id).once('value');
    let account = snap.val();
    let accountKey = id;

    if (!account) {
      err.textContent = '존재하지 않는 사번이거나 계정이 없습니다.';
      return;
    }

    if (account.pw === '' || account.pw == null) {
      await userAccountsRef.child(accountKey).update({ pw: pw });
      alert('🔒 비밀번호 등록 완료!\n입력하신 번호가 초기 비밀번호로 설정되었습니다.');
      localStorage.setItem(LOGGED_IN_ID_KEY, account.empId || accountKey);
      localStorage.setItem('loggedInUserName', account.empName || '');
      localStorage.setItem(SESSION_KEY, 'user');
      enterUser();
      return;
    }

    if (account.pw === pw) {
      localStorage.setItem(LOGGED_IN_ID_KEY, account.empId || accountKey);
      localStorage.setItem('loggedInUserName', account.empName || '');
      localStorage.setItem(SESSION_KEY, 'user');
      enterUser();
      return;
    }

    err.textContent = '비밀번호가 일치하지 않습니다.';

  } catch(e) {
    console.error(e);
    err.textContent = '서버 연결 오류. 잠시 후 다시 시도해 주세요.';
  } finally {
    btn.disabled = false;
    btn.textContent = '로그인';
  }
}

function enterAdmin() {
  startAdminFirebaseListeners();
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('userScreen').classList.add('hidden');
  document.getElementById('adminScreen').classList.remove('hidden');
  renderAdminAll();
}

function enterUser() {
  startUserFirebaseListeners();
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('adminScreen').classList.add('hidden');
  document.getElementById('userScreen').classList.remove('hidden');
  
  checkScheduleChangesBackground();
  showMenu();
  updateNoticeBadge();
  initFCMAfterLogin();
}

function logout() {
  stopSessionFirebaseListeners();
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(LOGGED_IN_ID_KEY);
  localStorage.removeItem('loggedInUserName');

  // 부팅 시 주입된 loginScreen 숨김 스타일 제거 — 모바일에서 흰 화면 방지
  const bootStyle = document.getElementById('bootHideLoginStyle');
  if (bootStyle) bootStyle.remove();

  // app-booting 클래스가 남아있을 경우 제거 (PWA 재진입 등 방어)
  document.body.classList.remove('app-booting');
  const bootScreen = document.getElementById('appBootScreen');
  if (bootScreen) bootScreen.remove();

  document.getElementById('adminScreen').classList.add('hidden');
  document.getElementById('userScreen').classList.add('hidden');

  // loginScreen을 인라인 style 포함 모든 방법으로 반드시 표시
  const loginScreen = document.getElementById('loginScreen');
  loginScreen.classList.remove('hidden');
  loginScreen.style.removeProperty('display');

  document.getElementById('loginId').value = '';
  document.getElementById('loginPw').value = '';
  document.getElementById('loginError').textContent = '';

  document.getElementById('idListPopupWrap').classList.add('hidden');
  closePreview();
  showMenu();
}

function showMenu() {
  unloadUserCategoryData();
  document.getElementById('menuView').classList.remove('hidden');
  document.getElementById('browseView').classList.add('hidden');
  document.getElementById('userTitle').textContent = 'PUS여객';
  currentCategory = null;
  renderUserMenu(); 
  updateNoticeBadge();
}

function initCalendarSelectors() {
  const yearSel = document.getElementById('calendarYearSelect');
  const monthSel = document.getElementById('calendarMonthSelect');
  if(yearSel.options.length > 0) return; 

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  for(let y = currentYear - 1; y <= currentYear + 1; y++) {
    const opt = document.createElement('option');
    opt.value = y; opt.textContent = y + '년';
    if(y === currentYear) opt.selected = true;
    yearSel.appendChild(opt);
  }
  for(let m = 1; m <= 12; m++) {
    const opt = document.createElement('option');
    opt.value = m; opt.textContent = m + '월';
    if(m === currentMonth) opt.selected = true;
    monthSel.appendChild(opt);
  }
}

function openCategory(category) {
  unloadUserCategoryData();
  currentCategory = category;
  document.getElementById('menuView').classList.add('hidden');
  document.getElementById('browseView').classList.remove('hidden');
  
  const catInfo = categoriesCache[category];
  document.getElementById('userTitle').textContent = catInfo ? `${catInfo.icon} ${catInfo.name}` : '자료실';

  const myEmpId = (localStorage.getItem(LOGGED_IN_ID_KEY) || '').trim();

  if(catInfo && catInfo.type === 'schedule') {
    document.getElementById('userSearchBoxWrap').classList.add('hidden');
    document.getElementById('userFileList').classList.add('hidden');
    document.getElementById('userGrievanceWrap').classList.add('hidden');
    document.getElementById('userCalendarWrap').classList.remove('hidden'); 
    const btnRow = document.querySelector('#userCalendarWrap .calendar-button-row');
    if(btnRow) btnRow.style.display = 'flex';
    initCalendarSelectors();
    const ySel = document.getElementById('calendarYearSelect');
    const mSel = document.getElementById('calendarMonthSelect');
    if(ySel) ySel.onchange = renderScheduleCalendar;
    if(mSel) mSel.onchange = renderScheduleCalendar;

    if (myEmpId) {
      const currentUnread = parseInt(localStorage.getItem(`unreadcount_${myEmpId}`) || '0', 10);
      localStorage.setItem(`last_computed_bell_${myEmpId}`, String(currentUnread));
      localStorage.setItem(`unreadcount_${myEmpId}`, '0');
    }
    renderScheduleCalendar();
  } else if(catInfo && catInfo.type === 'briefing') {
    document.getElementById('userSearchBoxWrap').classList.add('hidden');
    document.getElementById('userFileList').classList.add('hidden');
    document.getElementById('userGrievanceWrap').classList.add('hidden');
    document.getElementById('userCalendarWrap').classList.remove('hidden');
    const btnRow = document.querySelector('#userCalendarWrap .calendar-button-row');
    if(btnRow) btnRow.style.display = 'none';
    initCalendarSelectors();
    const ySel = document.getElementById('calendarYearSelect');
    const mSel = document.getElementById('calendarMonthSelect');
    const changeBriefingMonth = function() {
      loadUserBriefingMonth(parseInt(ySel.value, 10), parseInt(mSel.value, 10));
      renderBriefingCalendar();
    };
    if(ySel) ySel.onchange = changeBriefingMonth;
    if(mSel) mSel.onchange = changeBriefingMonth;
    loadUserBriefingMonth(parseInt(ySel.value, 10), parseInt(mSel.value, 10));
    renderBriefingCalendar();
  } else if(catInfo && catInfo.type === 'grievance') {
    document.getElementById('userSearchBoxWrap').classList.add('hidden');
    document.getElementById('userFileList').classList.add('hidden');
    document.getElementById('userCalendarWrap').classList.add('hidden');
    document.getElementById('userGrievanceWrap').classList.remove('hidden');
    loadUserCategoryData(category);
    renderUserGrievance();
  } else {
    document.getElementById('userSearchBoxWrap').classList.remove('hidden');
    document.getElementById('userFileList').classList.remove('hidden');
    document.getElementById('userCalendarWrap').classList.add('hidden');
    document.getElementById('userGrievanceWrap').classList.add('hidden');
    document.getElementById('searchInput').value = '';
    
    localStorage.setItem(`cat_lastseen_${category}`, String(Date.now()));
    loadUserCategoryData(category);
    renderUserFiles();
  }

  if (category === 'notice') markNoticesRead();
  else updateNoticeBadge();
}

/* =========================================================
   한국 공휴일 데이터
========================================================= */
function getKoreanHolidays(year) {
  const fixed = [
    [1,1],[3,1],[5,5],[6,6],[8,15],[10,3],[10,9],[12,25]
  ];
  const set = new Set();
  fixed.forEach(([m, d]) => {
    set.add(`${year}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
  });
  const lunar = {
    2024: ['2024-02-09','2024-02-10','2024-02-11','2024-02-12','2024-09-16','2024-09-17','2024-09-18'],
    2025: ['2025-01-28','2025-01-29','2025-01-30','2025-01-31','2025-10-05','2025-10-06','2025-10-07','2025-10-08'],
    2026: ['2026-02-16','2026-02-17','2026-02-18','2026-02-19','2026-09-24','2026-09-25','2026-09-26'],
    2027: ['2027-02-06','2027-02-07','2027-02-08','2027-09-14','2027-09-15','2027-09-16'],
  };
  (lunar[year] || []).forEach(d => set.add(d));
  return set;
}

const OFF_CODES = new Set(['휴','전','청','교','연','예','반']);

function getSchCodeClass(code, shiftType) {
  if(OFF_CODES.has(code)) return 'sch-code off-code';
  const st = (shiftType || '').trim();
  if(st === '오전') return 'sch-code am-code';
  if(st === '오후') return 'sch-code pm-code';
  if(st === '롱' || st === '출퇴출') return 'sch-code long-code';
  return 'sch-code';
}

function showCodePopup(code, workTime, shiftType) {
  const cssClass = getSchCodeClass(code, shiftType);
  const colorMap = {
    'off-code':  { bg:'#ff6b6b', color:'#fff' },
    'am-code':   { bg:'#ffd32a', color:'#5a3e00' },
    'pm-code':   { bg:'#4a90e2', color:'#fff' },
    'long-code': { bg:'#27ae60', color:'#fff' },
  };
  const cls = cssClass.replace('sch-code','').trim() || 'default';
  const c = colorMap[cls] || { bg:'#6d83ff', color:'#fff' };
  const typeLabel = shiftType || '기타';
  const timeDisplay = workTime || '시간 미설정';

  const overlay = document.createElement('div');
  overlay.className = 'sch-popup-overlay';
  overlay.innerHTML = `
    <div class="sch-popup-box">
      <div class="pop-badge" style="background:${c.bg}; color:${c.color};">${escapeHtml(code)}</div>
      <div class="pop-time">${escapeHtml(timeDisplay)}</div>
      <div class="pop-type">${escapeHtml(typeLabel)}</div>
      <button class="pop-close" onclick="this.closest('.sch-popup-overlay').remove()">확인</button>
    </div>
  `;
  overlay.addEventListener('click', e => { if(e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

/* =========================================================
   백그라운드 상시 근무표 변경 내역 검증 엔진
========================================================= */
function checkScheduleChangesBackground() {
  const myEmpId = (localStorage.getItem(LOGGED_IN_ID_KEY) || '').trim();
  const myEmpName = (localStorage.getItem('loggedInUserName') || '').trim();
  if (!myEmpId) return;

  let mySchedule = null;
  if(myEmpId && scheduleMasterCache[myEmpId]) mySchedule = scheduleMasterCache[myEmpId];
  if(!mySchedule && myEmpName && scheduleMasterCache[myEmpName]) mySchedule = scheduleMasterCache[myEmpName];
  if(!mySchedule) {
    const lowerId   = myEmpId.toLowerCase().replace(/\s/g, '');
    const lowerName = myEmpName.toLowerCase().replace(/\s/g, '');
    const foundKey  = Object.keys(scheduleMasterCache).find(k => {
      const lk = k.toLowerCase().replace(/\s/g, '');
      return (lowerId && lk === lowerId) || (lowerName && lk === lowerName);
    });
    if(foundKey) mySchedule = scheduleMasterCache[foundKey];
  }
  if(!mySchedule) return; 

  const now = new Date();
  const currentYear = now.getFullYear();
  const logsKey = `changelogs_${myEmpId}`;
  const unreadKey = `unreadcount_${myEmpId}`;
  const bellKey = `last_computed_bell_${myEmpId}`;
  
  let currentLogs = JSON.parse(localStorage.getItem(logsKey) || '[]');
  
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const nowTime = Date.now();
  currentLogs = currentLogs.filter(log => (nowTime - log.timestamp) < THIRTY_DAYS_MS);
  
  let hasNewChanges = false;
  let changeCounter = 0;

  for (let year = currentYear - 1; year <= currentYear + 1; year++) {
    for (let month = 1; month <= 12; month++) {
      const snapshotKey = `snapshot_${myEmpId}_${year}_${month}`;
      let savedSnapshot = JSON.parse(localStorage.getItem(snapshotKey) || '{}');
      
      if (Object.keys(savedSnapshot).length > 0) {
        Object.entries(mySchedule).forEach(([dateStr, dayData]) => {
          if (!dateStr.startsWith(`${year}-${month < 10 ? '0' + month : month}`)) return;
          const targetDay = parseInt(dateStr.split('-')[2], 10);
          const oldCode = savedSnapshot[targetDay] || '';
          const newCode = (dayData && dayData.code) ? dayData.code : '';
          
          if (oldCode && newCode && oldCode !== newCode) {
            const isDuplicate = currentLogs.some(l => l.year === year && l.month === month && l.day === targetDay && l.oldCode === oldCode && l.newCode === newCode);
            if (!isDuplicate) {
              currentLogs.unshift({
                year, month, day: targetDay,
                oldCode, newCode,
                timestamp: nowTime
              });
              hasNewChanges = true;
              changeCounter++;
            }
          }
        });
      }

      const newSnapshot = {};
      Object.entries(mySchedule).forEach(([dateStr, dayData]) => {
        if (!dateStr.startsWith(`${year}-${month < 10 ? '0' + month : month}`)) return;
        const targetDay = parseInt(dateStr.split('-')[2], 10);
        if (dayData && dayData.code) newSnapshot[targetDay] = dayData.code;
      });
      localStorage.setItem(snapshotKey, JSON.stringify(newSnapshot));
    }
  }

  localStorage.setItem(logsKey, JSON.stringify(currentLogs));

  if (hasNewChanges) {
    let unreadTotal = parseInt(localStorage.getItem(unreadKey) || '0', 10);
    localStorage.setItem(unreadKey, unreadTotal + changeCounter);
    
    let bellTotal = parseInt(localStorage.getItem(bellKey) || '0', 10);
    localStorage.setItem(bellKey, String(bellTotal + changeCounter));
  }
  
  const currentMonth = now.getMonth() + 1;
  renderHistoryModuleData(myEmpId, currentYear, currentMonth);
  updateNoticeBadge();
}

/* =========================================================
   스케줄 전용 달력식 드로잉 시각화 엔진
========================================================= */
function renderScheduleCalendar() {
  const year  = parseInt(document.getElementById('calendarYearSelect').value, 10);
  const month = parseInt(document.getElementById('calendarMonthSelect').value, 10);
  const container = document.getElementById('calendarGridContainer');
  
  const myEmpId   = (localStorage.getItem(LOGGED_IN_ID_KEY) || '').trim();
  const myEmpName = (localStorage.getItem('loggedInUserName') || '').trim();

  let mySchedule = null;
  if(myEmpId && scheduleMasterCache[myEmpId]) mySchedule = scheduleMasterCache[myEmpId];
  if(!mySchedule && myEmpName && scheduleMasterCache[myEmpName]) mySchedule = scheduleMasterCache[myEmpName];
  if(!mySchedule) {
    const lowerId   = myEmpId.toLowerCase().replace(/\s/g, '');
    const lowerName = myEmpName.toLowerCase().replace(/\s/g, '');
    const foundKey  = Object.keys(scheduleMasterCache).find(k => {
      const lk = k.toLowerCase().replace(/\s/g, '');
      return (lowerId && lk === lowerId) || (lowerName && lk === lowerName);
    });
    if(foundKey) mySchedule = scheduleMasterCache[foundKey];
  }
  if(!mySchedule) mySchedule = {};

  if (myEmpId) {
    renderHistoryModuleData(myEmpId, year, month);
  }

  const holidays = getKoreanHolidays(year);
  const firstDay = new Date(year, month - 1, 1).getDay();
  const lastDate = new Date(year, month, 0).getDate();
  const MM = month < 10 ? '0' + month : String(month);

  const todayObj = new Date();
  const todayKey = `${todayObj.getFullYear()}-${String(todayObj.getMonth()+1).padStart(2,'0')}-${String(todayObj.getDate()).padStart(2,'0')}`;

  const codeInfo = {};
  for(let d = 1; d <= lastDate; d++) {
    const DD = d < 10 ? '0' + d : String(d);
    const dd = mySchedule[`${year}-${MM}-${DD}`];
    if(dd && dd.code) {
      const c = dd.code;
      if(!codeInfo[c]) codeInfo[c] = { cnt: 0, shiftType: dd.shiftType || '', workTime: dd.workTime || '' };
      codeInfo[c].cnt++;
    }
  }

  const groups = { '오전': [], '오후': [], '롱·출퇴출': [], '휴무': [], '기타': [] };
  Object.entries(codeInfo).forEach(([code, info]) => {
    if(OFF_CODES.has(code)) groups['휴무'].push({code, ...info});
    else if(info.shiftType === '오전')  groups['오전'].push({code, ...info});
    else if(info.shiftType === '오후')  groups['오후'].push({code, ...info});
    else if(info.shiftType === '롱' || info.shiftType === '출퇴출') groups['롱·출퇴출'].push({code, ...info});
    else groups['기타'].push({code, ...info});
  });

  const groupMeta = {
    '오전':     { icon:'🌅', bg:'linear-gradient(135deg,#fff9c4,#fff176)', border:'#ffe082', color:'#5a3e00' },
    '오후':     { icon:'🌆', bg:'linear-gradient(135deg,#bbdefb,#90caf9)', border:'#64b5f6', color:'#0d47a1' },
    '롱·출퇴출':{ icon:'🌙', bg:'linear-gradient(135deg,#c8e6c9,#a5d6a7)', border:'#81c784', color:'#1b5e20' },
    '휴무':     { icon:'🏖️', bg:'linear-gradient(135deg,#ffcdd2,#ef9a9a)', border:'#e57373', color:'#b71c1c' },
    '기타':     { icon:'📋', bg:'linear-gradient(135deg,#e8eaf6,#c5cae9)', border:'#9fa8da', color:'#283593' },
  };

  let summaryHtml = '<div style="padding:4px 2px 16px;">';
  let hasAny = false;
  Object.entries(groups).forEach(([groupName, items]) => {
    if(items.length === 0) return;
    hasAny = true;
    const meta = groupMeta[groupName];
    const totalCnt = items.reduce((s,i) => s+i.cnt, 0);
    const codeChips = items.sort((a,b) => b.cnt-a.cnt).map(i =>
      `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;padding:2px 8px;background:rgba(255,255,255,0.55);border-radius:12px;border:1px solid rgba(0,0,0,0.08);">
        ${escapeHtml(i.code)}<b style="opacity:0.75">${i.cnt}</b>
      </span>`
    ).join('');
    summaryHtml += `
      <div style="background:${meta.bg};border:1px solid ${meta.border};border-radius:12px;padding:10px 14px;margin-bottom:8px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <div style="font-size:18px;flex-shrink:0;">${meta.icon}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:11px;font-weight:800;color:${meta.color};letter-spacing:0.5px;margin-bottom:5px;">${groupName} · 총 <b>${totalCnt}</b>일</div>
          <div style="display:flex;flex-wrap:wrap;gap:4px;">${codeChips}</div>
        </div>
      </div>`;
  });
  if(!hasAny) summaryHtml += '<div style="text-align:center;color:#bbb;font-size:12px;padding:6px 0;">이번 달 스케줄 없음</div>';
  summaryHtml += '</div>';

  let html = `<table class="calendar-table">
                <thead><tr>
                  <th>일</th><th>월</th><th>화</th><th>수</th><th>목</th><th>금</th><th>토</th>
                </tr></thead>
                <tbody><tr>`;
  
  let dayCount = 0;
  for(let i = 0; i < firstDay; i++) { html += `<td class="day-empty"></td>`; dayCount++; }
  
  for(let d = 1; d <= lastDate; d++) {
    if(dayCount > 0 && dayCount % 7 === 0) html += `</tr><tr>`;

    const DD = d < 10 ? '0' + d : String(d);
    const dateKey = `${year}-${MM}-${DD}`;
    const isHoliday = holidays.has(dateKey);
    const isToday   = dateKey === todayKey;
    const dayOfWeek = new Date(year, month-1, d).getDay();

    let dayNumClass = 'day-num';
    if(isHoliday || dayOfWeek === 0) dayNumClass += ' is-holiday';

    const dayData = mySchedule[dateKey];
    let schHtml = '';

    if(dayData && dayData.code) {
      const code      = dayData.code;
      const workTime  = dayData.workTime  || '';
      const shiftType = dayData.shiftType || '';
      const legacyTime = (dayData.start && dayData.end) ? `${dayData.start}~${dayData.end}` : '';
      const displayTime = workTime || legacyTime;
      const isOff = OFF_CODES.has(code);
      const codeClass = getSchCodeClass(code, shiftType);

      if(isOff) {
        schHtml += `<div class="${codeClass}" style="cursor:default;">${escapeHtml(code)}</div>`;
      } else {
        const safeCode = code.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
        const safeTime = displayTime.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
        const safeType = shiftType.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
        schHtml += `<div class="${codeClass}" onclick="showCodePopup('${safeCode}','${safeTime}','${safeType}')">${escapeHtml(code)}</div>`;
      }
    }

    html += `<td${isToday ? ' class="today-cell"' : ''}>
              <div class="calendar-day-cell">
                <span class="${dayNumClass}">${d}</span>
                ${schHtml}
              </div>
             </td>`;
    dayCount++;
  }
  
  while(dayCount % 7 !== 0) { html += `<td class="day-empty"></td>`; dayCount++; }
  html += `</tr></tbody></table>`;

  container.innerHTML = html + summaryHtml;
}

/* =========================================================
   변경 내역 전용 제어 핸들러
========================================================= */
function toggleHistoryPopup(event) {
  event.stopPropagation();
  const popup = document.getElementById('historyPopupWrap');
  const myEmpId = (localStorage.getItem(LOGGED_IN_ID_KEY) || '').trim();
  
  if (popup.classList.contains('hidden')) {
    popup.classList.remove('hidden');
    if (myEmpId) {
      localStorage.setItem(`last_computed_bell_${myEmpId}`, '0');
      const badge = document.getElementById('historyCountBadge');
      if (badge) { badge.textContent = '0'; badge.classList.add('hidden'); }
    }
  } else {
    popup.classList.add('hidden');
  }
}

function clearUserHistoryLogs() {
  const myEmpId = (localStorage.getItem(LOGGED_IN_ID_KEY) || '').trim();
  if (!myEmpId) return;
  if (!confirm('누적된 스케줄 변경 내역을 모두 초기화(삭제) 하시겠습니까?')) return;
  
  localStorage.removeItem(`changelogs_${myEmpId}`);
  localStorage.setItem(`unreadcount_${myEmpId}`, '0');
  localStorage.setItem(`last_computed_bell_${myEmpId}`, '0');
  
  const year = parseInt(document.getElementById('calendarYearSelect').value, 10);
  const month = parseInt(document.getElementById('calendarMonthSelect').value, 10);
  renderHistoryModuleData(myEmpId, year, month);
  document.getElementById('historyPopupWrap').classList.add('hidden');
  updateNoticeBadge();
  alert('변경 내역이 완전하게 소멸되었습니다.');
}

function renderHistoryModuleData(myEmpId, currentYear, currentMonth) {
  const listEl = document.getElementById('historyPopupContainerList');
  const badgeEl = document.getElementById('historyCountBadge');
  if (!listEl) return;
  
  const logs = JSON.parse(localStorage.getItem(`changelogs_${myEmpId}`) || '[]');
  const bellCount = parseInt(localStorage.getItem(`last_computed_bell_${myEmpId}`) || '0', 10);
  
  if (badgeEl) {
    if (bellCount > 0) {
      badgeEl.textContent = bellCount;
      badgeEl.classList.remove('hidden');
    } else {
      badgeEl.classList.add('hidden');
    }
  }

  const targetLogs = logs.filter(l => l.year === currentYear && l.month === currentMonth);
  if (targetLogs.length === 0) {
    listEl.innerHTML = '<li style="text-align:center; color:#bbb; padding:10px 0;">이번 달 변경점이 없습니다.</li>';
    return;
  }

  listEl.innerHTML = targetLogs.map(log => {
    return `<li>📅 ${log.day}일 : <span style="color:#de5246; font-weight:700;">${escapeHtml(log.oldCode)}</span> → <span style="color:#27ae60; font-weight:700;">${escapeHtml(log.newCode)}</span></li>`;
  }).join('');
}

document.addEventListener('click', function() {
  const popup = document.getElementById('historyPopupWrap');
  if (popup) popup.classList.add('hidden');
});

function backToMenu() { showMenu(); }

let activeGrivItemId = null;

function renderUserGrievance() {
  if (!currentCategory) return;
  const container = document.getElementById('userGrievanceList');
  container.innerHTML = '';
  
  const myEmpId = (localStorage.getItem(LOGGED_IN_ID_KEY) || '').trim();
  const itemsData = dynamicDataCache[currentCategory] || {};
  
  const myItems = Object.keys(itemsData)
    .map(k => ({id: k, ...itemsData[k]}))
    .filter(item => item.writerId === myEmpId)
    .sort((a,b) => b.timestamp - a.timestamp);
    
  if(myItems.length === 0) {
    container.innerHTML = '<div class="no-result">내가 접수한 고충 내역이 없습니다.</div>';
    return;
  }
  
  myItems.forEach(item => {
    const div = document.createElement('div');
    div.className = 'doc-item';
    div.style.display = 'block';
    
    const readStatusHtml = item.isAdminRead 
      ? '<span style="color:#aaa; font-weight:bold; font-size:11px; margin-left:6px;">[CM확인완료 - 수정 불가]</span>' 
      : '<span style="color:#27ae60; font-weight:bold; font-size:11px; margin-left:6px;">[접수대기 - 수정 가능]</span>';
      
    div.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
        <div style="flex:1; min-width:0; padding-right:8px;">
          <div style="font-weight:700; font-size:14px; color:#2b2f3e; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">🔒 ${escapeHtml(item.title)}</div>
          <div style="font-size:11px; color:#aaa; margin-top:3px;">접수일: ${item.date} ${readStatusHtml}</div>
        </div>
        <div style="flex-shrink:0; display:flex; gap:6px;">
          <button class="del-btn" style="background:#6d83ff; padding:5px 10px; font-size:12px; margin-left:0;" onclick="viewOrEditGrievance('${item.id}', 'edit'); event.stopPropagation();">수정</button>
          <button class="del-btn" style="background:#4e65df; padding:5px 10px; font-size:12px; margin-left:0;" onclick="viewOrEditGrievance('${item.id}', 'view'); event.stopPropagation();">보기</button>
        </div>
      </div>
    `;
    container.appendChild(div);
  });
}

function openGrievanceEditor() {
  activeGrivItemId = null;
  document.getElementById('grievanceEditorTitle').textContent = '🔒 새로운 고충 접수처 신청';
  document.getElementById('grivTitleInput').value = '';
  document.getElementById('grivContentInput').value = '';
  document.getElementById('grivPwInput').value = '';
  document.getElementById('grivPwInput').disabled = false;
  document.getElementById('grievanceEditorModal').classList.remove('hidden');
}

function closeGrievanceEditor() {
  document.getElementById('grievanceEditorModal').classList.add('hidden');
}

function viewOrEditGrievance(itemId, mode) {
  const item = dynamicDataCache[currentCategory][itemId];
  if(!item) return;
  
  const typedPw = prompt("🔒 본인 확인을 위해 글 작성 시 입력했던 비밀번호를 기입하세요.");
  if(!typedPw) return;
  if(item.grivPw !== typedPw) {
    alert("❌ 비밀번호가 올바르지 않습니다.");
    return;
  }
  
  if(mode === 'view') {
    document.getElementById('grivViewMeta').textContent = `${item.date} / 상태: ${item.isAdminRead?'CM확인함':'대기중'}`;
    document.getElementById('grivViewTitle').textContent = `제목: ${item.title}`;
    document.getElementById('grivViewContent').textContent = item.content;
    document.getElementById('grievanceViewModal').classList.remove('hidden');
  } else if(mode === 'edit') {
    if(item.isAdminRead) {
      alert("🔒 CM이 이미 해당 고충 접수 내역을 확인하고 처리 중이므로 더 이상 수정이 불가능합니다.");
      return;
    }
    
    activeGrivItemId = itemId;
    document.getElementById('grievanceEditorTitle').textContent = '✏️ 고충 접수 내용 수정';
    document.getElementById('grivTitleInput').value = item.title;
    document.getElementById('grivContentInput').value = item.content;
    document.getElementById('grivPwInput').value = item.grivPw;
    document.getElementById('grivPwInput').disabled = true;
    document.getElementById('grievanceEditorModal').classList.remove('hidden');
  }
}

function closeGrievanceView() {
  document.getElementById('grievanceViewModal').classList.add('hidden');
}

async function saveGrievanceItem() {
  const title = document.getElementById('grivTitleInput').value.trim();
  const content = document.getElementById('grivContentInput').value.trim();
  const grivPw = document.getElementById('grivPwInput').value.trim();
  
  if(!title || !content) { alert('제목과 고충 본문을 입력해 주세요.'); return; }
  if(!grivPw) { alert('⚠️ 글을 보호하고 본인만 수정하기 위해 반드시 암호(비밀번호)를 기입하셔야 저장 가능합니다.'); return; }
  
  const confirmBtn = document.querySelector('#grievanceEditorModal .modal-confirm');
  confirmBtn.disabled = true;
  
  const myEmpId = (localStorage.getItem(LOGGED_IN_ID_KEY) || '').trim();
  const myEmpName = (localStorage.getItem('loggedInUserName') || '사원').trim();
  const dateStr = new Date().toLocaleString('ko-KR');
  
  try {
    if(activeGrivItemId) {
      const currentItem = dynamicDataCache[currentCategory][activeGrivItemId];
      if(currentItem && currentItem.isAdminRead) {
        alert("🔒 수정 실패: 관리자가 검토 처리를 시작한 내역은 수정할 수 없습니다.");
        closeGrievanceEditor();
        return;
      }
      
      await dataRef.child(currentCategory).child(activeGrivItemId).update({
        title, content, date: dateStr
      });
    } else {
      const newItemId = 'griv_' + Date.now();
      await dataRef.child(currentCategory).child(newItemId).set({
        title, content, grivPw,
        writerId: myEmpId,
        writerName: myEmpName,
        date: dateStr,
        timestamp: Date.now(),
        isAdminRead: false
      });
    }
    closeGrievanceEditor();
    alert("🔒 고충 접수처에 안전하게 등록되었습니다. 절대 비밀이 보장됩니다.");
  } catch(e) {
    alert("접수 중 서버 오류가 발생했습니다.");
  } finally {
    confirmBtn.disabled = false;
  }
}

function renderUserFiles() {
  if (!currentCategory || !categoriesCache[currentCategory]) return;
  const keyword = document.getElementById('searchInput').value.trim().toLowerCase();
  const container = document.getElementById('userFileList');
  container.innerHTML = '';

  const cat = categoriesCache[currentCategory];
  const itemsData = dynamicDataCache[currentCategory] || {};
  const items = Object.keys(itemsData).map(k => ({id: k, ...itemsData[k]})).sort((a,b) => b.timestamp - a.timestamp);

  if (cat.type === 'board') {
    const filtered = items.filter(n => n.title.toLowerCase().includes(keyword));
    if (filtered.length === 0) {
      container.innerHTML = `<div class="no-result">등록된 글이 없습니다.</div>`;
      return;
    }
    filtered.forEach(n => {
      let userImgPreviewHtml = "";
      if(n.imageUrl) {
        userImgPreviewHtml = `<div style="margin-top:10px;"><img src="${n.imageUrl}" style="max-width:160px; max-height:110px; border-radius:6px; border:1px solid #eef0fa; box-shadow:0 2px 6px rgba(0,0,0,0.05); object-fit:cover; cursor:zoom-in;" onclick="openFullscreenImage('${n.imageUrl}'); event.stopPropagation();"></div>`;
      }

      const div = document.createElement('div');
      div.className = 'doc-item';
      div.style.display = 'block'; 
      div.innerHTML = `
        <div style="display:flex; align-items:center; gap:12px;">
          <div class="picon" style="background:#6d83ff; flex-shrink:0;">📝</div>
          <div class="pname" style="font-weight:600;">${escapeHtml(n.title)}<br><span style="font-size:11px; color:#aaa; font-weight:normal;">${n.date}</span></div>
        </div>
        ${userImgPreviewHtml}
      `;
      div.addEventListener('click', () => viewBoardItem(currentCategory, n.id));
      container.appendChild(div);
    });
    return;
  } else if (cat.type === 'link') {
    const filtered = items.filter(f => f.title.toLowerCase().includes(keyword));
    if (filtered.length === 0) {
      container.innerHTML = '<div class="no-result">등록된 링크가 없습니다.</div>';
      return;
    }
    filtered.forEach(f => {
      const div = document.createElement('div');
      div.className = 'doc-item';
      div.innerHTML = `
        <div class="picon" style="background:linear-gradient(135deg,#ff9f43,#ff793f);">🔗</div>
        <div class="pname">
          <span style="font-weight:600; color:#2b2f3e;">${escapeHtml(f.title)}</span><br>
          <span style="font-size:11px; color:#9095ab;">${escapeHtml(f.url)}</span>
        </div>
      `;
      div.addEventListener('click', () => window.open(f.url, '_blank'));
      container.appendChild(div);
    });
    return;
  } else if (cat.type === 'file') {
    const filtered = items.filter(f => f.name.toLowerCase().includes(keyword));
    if (filtered.length === 0) {
      container.innerHTML = '<div class="no-result">검색 결과가 없습니다.</div>';
      return;
    }
    filtered.forEach(f => {
      const div = document.createElement('div');
      div.className = 'doc-item';
      div.innerHTML = `<div class="picon">PDF</div><div class="pname">${escapeHtml(f.name)}</div>`;
      div.addEventListener('click', () => openPreview(f));
      container.appendChild(div);
    });
  }
}

/* =========================================================
   상세 글/항목 제어 유틸 스크립트 모듈
========================================================= */
function viewBoardItem(catId, id) {
  const item = dynamicDataCache[catId][id];
  if (!item) return;
  document.getElementById('noticeViewTitle').textContent = item.title;
  document.getElementById('noticeViewDate').textContent = item.date;
  document.getElementById('noticeViewContent').textContent = item.content;
  
  const imgWrap = document.getElementById('noticeViewImgWrap');
  if(item.imageUrl) {
    document.getElementById('noticeViewImg').src = item.imageUrl;
    imgWrap.classList.remove('hidden');
  } else {
    imgWrap.classList.add('hidden');
  }
  
  document.getElementById('noticeViewModal').classList.remove('hidden');
}

function closeNoticeView() { document.getElementById('noticeViewModal').classList.add('hidden'); }

function openPreview(file) {
  if (!file.url) { alert('파일 주소가 올바르지 않습니다.'); return; }
  document.getElementById('previewTitle').textContent = file.name;
  document.getElementById('previewFrame').src = 'https://docs.google.com/viewer?embedded=true&url=' + encodeURIComponent(file.url);
  document.getElementById('previewModal').classList.remove('hidden');
}

function closePreview() {
  document.getElementById('previewModal').classList.add('hidden');
  document.getElementById('previewFrame').src = '';
}
const NOTICE_LAST_SEEN_KEY = 'eduSiteNoticeNoticeLastSeenTs';
function getNoticeLastSeenTs() { return parseInt(localStorage.getItem(NOTICE_LAST_SEEN_KEY) || '0', 10); }

function markNoticesRead() {
  const noticesData = dynamicDataCache['notice'] || {};
  const maxLoadedTs = Object.keys(noticesData).reduce((m, k) => Math.max(m, noticesData[k].timestamp || 0), 0);
  const maxMetaTs = Object.keys(noticeMetadataCache).reduce((m, k) => Math.max(m, Number(noticeMetadataCache[k]) || 0), 0);
  const maxTs = Math.max(maxLoadedTs, maxMetaTs);
  localStorage.setItem(NOTICE_LAST_SEEN_KEY, String(Math.max(maxTs, Date.now())));
  updateNoticeBadge();
}

function updateNoticeBadge() {
  const myEmpId = (localStorage.getItem(LOGGED_IN_ID_KEY) || '').trim();
  let totalUnread = 0;

  const lastSeenNotice = getNoticeLastSeenTs();
  const noticesData = dynamicDataCache['notice'] || {};
  const noticeTimestamps = Object.keys(noticeMetadataCache).length
    ? noticeMetadataCache
    : Object.keys(noticesData).reduce(function(result, key) {
        result[key] = noticesData[key].timestamp || 0;
        return result;
      }, {});
  totalUnread += Object.keys(noticeTimestamps).filter(k => (Number(noticeTimestamps[k]) || 0) > lastSeenNotice).length;

  Object.keys(categoriesCache).forEach(catId => {
    if (catId === 'notice') return;
    const cat = categoriesCache[catId];
    if (cat.type === 'grievance') return; // 고충 접수는 직원 배지 완전 제외

    if (cat.type === 'schedule') {
      if (myEmpId) {
        totalUnread += parseInt(localStorage.getItem(`unreadcount_${myEmpId}`) || '0', 10);
      }
    } else if (cat.type === 'briefing') {
      // 브리핑 미확인 수 = 등록된 브리핑 중 현재 직원이 서명하지 않은 건수
      if (myEmpId) {
        const myConfirms = briefingConfirmationsCache || {};
        totalUnread += Object.keys(briefingsCache).filter(function(dateKey) {
          return !(myConfirms[dateKey] && myConfirms[dateKey][myEmpId]);
        }).length;
      }
    } else {
      const lastSeen = parseInt(localStorage.getItem(`cat_lastseen_${catId}`) || '0', 10);
      const itemsData = dynamicDataCache[catId] || {};
      totalUnread += Object.keys(itemsData).filter(k => (itemsData[k].timestamp || 0) > lastSeen).length;
    }
  });

  const headerBadge = document.getElementById('noticeBadgeHeader');
  if (headerBadge) {
    if (totalUnread > 0) {
      headerBadge.textContent = totalUnread > 99 ? '99+' : String(totalUnread);
      headerBadge.classList.remove('hidden');
    } else {
      headerBadge.classList.add('hidden');
    }
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
document.getElementById('loginPw').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
document.getElementById('previewFrame').addEventListener('contextmenu', e => e.preventDefault());

/* =========================================================
   FCM 푸시 알림 시스템
========================================================= */
const FCM_VAPID_KEY = 'BLbxRitLNS6G-B8jLtDsxm9DaVBkFalVgV7HbXbVdScIUqbsz9NgdgUqjLQQ073fMhfFONv4SJgoCzDKqhEV8Ig';
const FCM_WORKER_URL = 'https://pusdoc.jeongkil0486.workers.dev/fcm-send';

const fcmTokensRef = firebase.database().ref('fcmTokens');
let fcmMessaging = null;

async function initFCM() {
  try {
    if (!('serviceWorker' in navigator) || !('Notification' in window)) return;

    const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    fcmMessaging = firebase.messaging();

    fcmMessaging.onMessage(payload => {
      const title = payload.notification?.title || 'PUS DOC';
      const body  = payload.notification?.body  || '새 알림이 있습니다.';
      if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]);
      if (Notification.permission === 'granted') {
        new Notification(title, { body, icon: '/icon.png', tag: 'pusdoc-push' });
      }
    });

    await registerFCMToken();
  } catch(e) {
    console.warn('FCM 초기화 실패:', e);
  }
}

async function registerFCMToken() {
  try {
    if (!fcmMessaging) return;
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    const token = await fcmMessaging.getToken({ vapidKey: FCM_VAPID_KEY });
    if (!token) return;

    const empId = (localStorage.getItem(LOGGED_IN_ID_KEY) || 'unknown').replace(/[.#$/[\]]/g, '_');
    await fcmTokensRef.child(empId).set({ token, empId, updatedAt: Date.now() });
  } catch(e) {
    console.warn('FCM 토큰 등록 실패:', e);
  }
}

function initFCMAfterLogin() {
  setTimeout(initFCM, 1000);
}

/* 관리자 푸시 전송 모달 */
function openPushModal() {
  document.getElementById('pushTitleInput').value = '';
  document.getElementById('pushBodyInput').value = '';
  document.getElementById('pushSendStatus').textContent = '';
  document.getElementById('pushModal').classList.remove('hidden');
}
function closePushModal() {
  document.getElementById('pushModal').classList.add('hidden');
}

async function sendPushNotification() {
  const title = document.getElementById('pushTitleInput').value.trim();
  const body  = document.getElementById('pushBodyInput').value.trim();
  if (!title || !body) { alert('제목과 내용을 입력해 주세요.'); return; }

  const btn    = document.getElementById('pushSendBtn');
  const status = document.getElementById('pushSendStatus');
  btn.disabled = true;
  status.textContent = '⏳ 수신자 목록 불러오는 중...';

  try {
    const snap   = await fcmTokensRef.once('value');
    const tokens = Object.values(snap.val() || {}).map(t => t.token).filter(Boolean);

    if (tokens.length === 0) {
      status.textContent = '❌ 등록된 수신자가 없습니다. 직원들이 먼저 앱에 로그인해야 합니다.';
      btn.disabled = false;
      return;
    }

    status.textContent = `⏳ ${tokens.length}명에게 전송 중...`;

    const res = await fetch(FCM_WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': UPLOAD_SECRET },
      body: JSON.stringify({ title, body, tokens })
    });

    const result = await res.json();
    if (res.ok) {
      status.textContent = `✅ ${result.successCount}/${tokens.length}명 전송 완료!`;
      setTimeout(closePushModal, 2000);
    } else {
      status.textContent = `❌ 전송 실패: ${result.error || '알 수 없는 오류'}`;
    }
  } catch(e) {
    console.error(e);
    status.textContent = '❌ 전송 오류 발생';
  } finally {
    btn.disabled = false;
  }
}
