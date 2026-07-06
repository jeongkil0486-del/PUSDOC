/* =========================================================
   브리핑일지 모듈 (v2)
   - briefings/{YYYY-MM-DD} : 관리자가 달력에서 날짜를 클릭해 등록/수정
   - briefingConfirmations/{YYYY-MM-DD}/{empId} : 직원이 팝업에서 직접 서명 후 저장
   - briefingTemplate : 관리자가 등록하는 브리핑/서명일지 양식 파일 (계속 보관)
   - 직원/관리자 모두 동일한 '월 달력' UI를 사용하되, 클릭 시 동작만 다름
     (직원: 확인+서명 / 관리자: 등록+수정)
========================================================= */

/* ---------- 공통 유틸 ---------- */
function getCurrentUserId() {
  return (localStorage.getItem(LOGGED_IN_ID_KEY) || '').trim();
}
function getCurrentUserName() {
  const id = getCurrentUserId();
  const account = id && userAccountsCache[id] ? userAccountsCache[id] : null;
  return (account && account.empName) || localStorage.getItem('loggedInUserName') || '사원';
}
function pad2(n) { return String(n).padStart(2, '0'); }
function makeBriefingDateKey(year, month, day) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function getBriefingConfirmCount(dateKey) {
  return Object.keys(briefingConfirmationsCache[dateKey] || {}).length;
}
function isBriefingConfirmed(dateKey) {
  const id = getCurrentUserId();
  return !!(id && briefingConfirmationsCache[dateKey] && briefingConfirmationsCache[dateKey][id]);
}

/* =========================================================
   서명 캔버스 (범용 - canvasId를 받아 여러 팝업에서 재사용 가능)
========================================================= */
let signaturePadRegistry = {};

function setupSignatureCanvasEl(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  if (signaturePadRegistry[canvasId] && signaturePadRegistry[canvasId].initialized) return;

  const ctx = canvas.getContext('2d');
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#111827';

  const state = { drawing: false, hasStroke: false, initialized: true };

  function pos(evt) {
    const rect = canvas.getBoundingClientRect();
    const e = evt.touches && evt.touches[0] ? evt.touches[0] : evt;
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height)
    };
  }
  function start(evt) {
    evt.preventDefault();
    state.drawing = true;
    state.hasStroke = true;
    const p = pos(evt);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }
  function move(evt) {
    if (!state.drawing) return;
    evt.preventDefault();
    const p = pos(evt);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
  function end(evt) {
    if (evt) evt.preventDefault();
    state.drawing = false;
  }
  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  window.addEventListener('mouseup', end);
  canvas.addEventListener('touchstart', start, { passive: false });
  canvas.addEventListener('touchmove', move, { passive: false });
  canvas.addEventListener('touchend', end, { passive: false });

  signaturePadRegistry[canvasId] = state;
}

function clearSignatureCanvasEl(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  if (signaturePadRegistry[canvasId]) signaturePadRegistry[canvasId].hasStroke = false;
}

function hasSignatureStroke(canvasId) {
  return !!(signaturePadRegistry[canvasId] && signaturePadRegistry[canvasId].hasStroke);
}

/* =========================================================
   브리핑 양식(엑셀) 등록 - 관리자 전용, 계속 보관
========================================================= */
async function handleBriefingTemplateUpload(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  if (!/\.xlsx?$/i.test(file.name)) { alert('엑셀 파일(.xlsx/.xls)만 등록할 수 있습니다.'); event.target.value = ''; return; }

  const reader = new FileReader();
  reader.onload = async e => {
    try {
      await briefingTemplateRef.set({
        fileName: file.name,
        dataUrl: e.target.result,
        updatedAt: new Date().toLocaleString('ko-KR'),
        updatedAtTs: Date.now()
      });
      alert('✅ 브리핑 양식이 등록되었습니다. 이 양식은 계속 보관되며 필요 시 새 파일로 교체할 수 있습니다.');
    } catch (err) {
      console.error(err);
      alert('양식 저장 중 오류가 발생했습니다. 파일 용량이 너무 크면 저장이 실패할 수 있습니다.');
    } finally {
      event.target.value = '';
    }
  };
  reader.onerror = () => { alert('엑셀 파일을 읽지 못했습니다.'); event.target.value = ''; };
  reader.readAsDataURL(file);
}

/* =========================================================
   관리자 화면 - 브리핑일지 달력 + 양식 등록
========================================================= */
function initAdminBriefingSelectors(catId) {
  const yearSel = document.getElementById(`adminBriefYear_${catId}`);
  const monthSel = document.getElementById(`adminBriefMonth_${catId}`);
  if (!yearSel || !monthSel || yearSel.options.length > 0) return;

  const now = new Date();
  for (let y = now.getFullYear() - 1; y <= now.getFullYear() + 1; y++) {
    const opt = document.createElement('option');
    opt.value = y; opt.textContent = y + '년';
    if (y === now.getFullYear()) opt.selected = true;
    yearSel.appendChild(opt);
  }
  for (let m = 1; m <= 12; m++) {
    const opt = document.createElement('option');
    opt.value = m; opt.textContent = m + '월';
    if (m === now.getMonth() + 1) opt.selected = true;
    monthSel.appendChild(opt);
  }
}

function renderAdminBriefingSection(section, catId) {
  const wrap = document.createElement('div');

  const templateName = briefingTemplateCache && briefingTemplateCache.fileName
    ? briefingTemplateCache.fileName : '등록된 양식 없음';
  const templateUpdatedAt = briefingTemplateCache && briefingTemplateCache.updatedAt
    ? ` (등록: ${escapeHtml(briefingTemplateCache.updatedAt)})` : '';

  wrap.innerHTML = `
    <div style="background:#f8f0ff; border:1px dashed #a78bfa; border-radius:10px; padding:14px; margin-bottom:14px;">
      <div style="font-size:13px; font-weight:700; color:#8b6df8; margin-bottom:8px;">📎 브리핑 양식 등록</div>
      <div style="font-size:11px; color:#888; margin-bottom:10px; line-height:1.6;">등록된 양식은 계속 보관되며, 필요 시 새 파일로 교체(재업로드)할 수 있습니다.</div>
      <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
        <button class="upload-btn" style="background:linear-gradient(135deg,#8b6df8,#a78bfa);" onclick="document.getElementById('briefingTemplateInput_${catId}').click()">⬆️ 양식 파일 등록</button>
        <input type="file" id="briefingTemplateInput_${catId}" accept=".xlsx,.xls" onchange="handleBriefingTemplateUpload(event)">
        <span class="upload-status">현재 등록 양식: ${escapeHtml(templateName)}${templateUpdatedAt}</span>
      </div>
    </div>

    <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px; flex-wrap:wrap;">
      <span style="font-size:13px; font-weight:700; color:#6d83ff;">📆 조회할 년월</span>
      <select id="adminBriefYear_${catId}" onchange="renderAdminBriefingCalendar('${catId}')" style="padding:7px 12px; border-radius:8px; border:1px solid #c5caee; font-size:14px; font-weight:600;"></select>
      <select id="adminBriefMonth_${catId}" onchange="renderAdminBriefingCalendar('${catId}')" style="padding:7px 12px; border-radius:8px; border:1px solid #c5caee; font-size:14px; font-weight:600;"></select>
    </div>
    <div style="font-size:11px; color:#777; margin-bottom:10px; line-height:1.5;">날짜를 클릭하면 해당 일자의 브리핑일지를 등록하거나 수정할 수 있습니다.</div>
    <div id="adminBriefCalendar_${catId}"></div>
  `;
  section.appendChild(wrap);

  initAdminBriefingSelectors(catId);
  renderAdminBriefingCalendar(catId);
}

function renderAdminBriefingCalendar(catId) {
  const container = document.getElementById(`adminBriefCalendar_${catId}`);
  if (!container) return;
  const yearSel = document.getElementById(`adminBriefYear_${catId}`);
  const monthSel = document.getElementById(`adminBriefMonth_${catId}`);
  const now = new Date();
  const year = yearSel ? parseInt(yearSel.value, 10) : now.getFullYear();
  const month = monthSel ? parseInt(monthSel.value, 10) : now.getMonth() + 1;
  const first = new Date(year, month - 1, 1);
  const lastDate = new Date(year, month, 0).getDate();
  const startDay = first.getDay();
  const todayKey = makeBriefingDateKey(now.getFullYear(), now.getMonth() + 1, now.getDate());

  let html = `<table class="calendar-table"><thead><tr><th>일</th><th>월</th><th>화</th><th>수</th><th>목</th><th>금</th><th>토</th></tr></thead><tbody>`;
  let day = 1;
  for (let r = 0; r < 6; r++) {
    html += '<tr>';
    for (let c = 0; c < 7; c++) {
      if ((r === 0 && c < startDay) || day > lastDate) {
        html += '<td class="day-empty"><div class="calendar-day-cell"></div></td>';
      } else {
        const dateKey = makeBriefingDateKey(year, month, day);
        const registered = !!briefingsCache[dateKey];
        const cls = dateKey === todayKey ? 'today-cell' : '';
        const badge = registered
          ? `<div class="sch-code" style="background:linear-gradient(135deg,#34c98f,#27ae60);">등록됨</div>`
          : `<div class="sch-code" style="background:#dfe3f5; color:#8a90ab;">미등록</div>`;
        html += `<td class="${cls}" onclick="openAdminBriefingEditor('${catId}','${dateKey}')" style="cursor:pointer;"><div class="calendar-day-cell"><div class="day-num">${day}</div>${badge}</div></td>`;
        day++;
      }
    }
    html += '</tr>';
    if (day > lastDate) break;
  }
  html += '</tbody></table>';
  container.innerHTML = html;
}

function ensureAdminBriefingEditor() {
  let modal = document.getElementById('adminBriefingEditorModal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'adminBriefingEditorModal';
  modal.className = 'modal-overlay hidden';
  modal.innerHTML = `
    <div class="modal-box" style="width:560px; max-width:92vw;">
      <h3 id="adminBriefingEditorTitle">브리핑일지 등록</h3>
      <label for="adminBriefingTitleInput">제목</label>
      <input type="text" id="adminBriefingTitleInput" placeholder="예: 2026-07-06 브리핑일지">
      <label for="adminBriefingContentInput">내용</label>
      <textarea id="adminBriefingContentInput" placeholder="브리핑 내용을 입력하세요"
        style="width:100%; min-height:200px; padding:10px; border:1px solid #ddd; border-radius:8px; font-size:14px; margin-bottom:14px; resize:vertical; font-family:inherit;"></textarea>
      <div class="modal-actions">
        <button class="modal-cancel" onclick="closeAdminBriefingEditor()">취소</button>
        <button class="modal-confirm" onclick="saveAdminBriefing()">저장</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  return modal;
}

let activeAdminBriefingCatId = null;
let activeAdminBriefingDateKey = null;

function openAdminBriefingEditor(catId, dateKey) {
  activeAdminBriefingCatId = catId;
  activeAdminBriefingDateKey = dateKey;
  const modal = ensureAdminBriefingEditor();
  const existing = briefingsCache[dateKey] || null;

  document.getElementById('adminBriefingEditorTitle').textContent = `🛫 ${dateKey} 브리핑일지 ${existing ? '수정' : '등록'}`;
  document.getElementById('adminBriefingTitleInput').value = existing ? (existing.title || '') : `${dateKey} 브리핑일지`;
  document.getElementById('adminBriefingContentInput').value = existing ? (existing.content || '') : '';

  modal.classList.remove('hidden');
}

function closeAdminBriefingEditor() {
  const modal = document.getElementById('adminBriefingEditorModal');
  if (modal) modal.classList.add('hidden');
  activeAdminBriefingCatId = null;
  activeAdminBriefingDateKey = null;
}

async function saveAdminBriefing() {
  const dateKey = activeAdminBriefingDateKey;
  const catId = activeAdminBriefingCatId;
  if (!dateKey) return;
  const title = document.getElementById('adminBriefingTitleInput').value.trim();
  const content = document.getElementById('adminBriefingContentInput').value.trim();
  if (!title || !content) { alert('제목과 내용을 입력해 주세요.'); return; }

  const confirmBtn = document.querySelector('#adminBriefingEditorModal .modal-confirm');
  confirmBtn.disabled = true;
  confirmBtn.textContent = '저장 중...';
  try {
    const existing = briefingsCache[dateKey] || null;
    await briefingsRef.child(dateKey).update({
      date: dateKey,
      title,
      content,
      createdAt: existing && existing.createdAt ? existing.createdAt : Date.now(),
      updatedAt: Date.now()
    });
    closeAdminBriefingEditor();
    if (catId) renderAdminBriefingCalendar(catId);
  } catch (err) {
    console.error(err);
    alert('브리핑일지 저장 중 오류가 발생했습니다.');
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.textContent = '저장';
  }
}

/* =========================================================
   직원 화면 - 브리핑일지 달력 + 확인/서명 팝업
========================================================= */
function renderBriefingCalendar() {
  const container = document.getElementById('calendarGridContainer');
  if (!container) return;
  const yearSel = document.getElementById('calendarYearSelect');
  const monthSel = document.getElementById('calendarMonthSelect');
  const now = new Date();
  const year = yearSel ? parseInt(yearSel.value, 10) : now.getFullYear();
  const month = monthSel ? parseInt(monthSel.value, 10) : now.getMonth() + 1;
  const first = new Date(year, month - 1, 1);
  const lastDate = new Date(year, month, 0).getDate();
  const startDay = first.getDay();
  const todayKey = makeBriefingDateKey(now.getFullYear(), now.getMonth() + 1, now.getDate());

  let html = `
    <div style="background:#fff; border:1px solid #e2e5f3; border-radius:14px; padding:12px; margin-bottom:12px; box-shadow:0 6px 16px rgba(109,131,255,0.06);">
      <div style="font-size:13px; font-weight:800; color:#4e65df; margin-bottom:4px;">🛫 브리핑일지 확인 달력</div>
      <div style="font-size:11px; color:#777; line-height:1.5;">확인/서명하지 않은 브리핑은 <b style="color:#e25b5b;">확인 필요</b>로 표시됩니다. 날짜를 누르면 내용을 확인하고 서명을 남길 수 있습니다.</div>
    </div>
    <table class="calendar-table"><thead><tr><th>일</th><th>월</th><th>화</th><th>수</th><th>목</th><th>금</th><th>토</th></tr></thead><tbody>`;
  let day = 1;
  for (let r = 0; r < 6; r++) {
    html += '<tr>';
    for (let c = 0; c < 7; c++) {
      if ((r === 0 && c < startDay) || day > lastDate) {
        html += '<td class="day-empty"><div class="calendar-day-cell"></div></td>';
      } else {
        const dateKey = makeBriefingDateKey(year, month, day);
        const registered = !!briefingsCache[dateKey];
        const confirmed = registered ? isBriefingConfirmed(dateKey) : false;
        const cls = dateKey === todayKey ? 'today-cell' : '';
        let badge = '';
        let click = '';
        if (registered) {
          badge = confirmed
            ? `<div class="sch-code" style="background:linear-gradient(135deg,#34c98f,#27ae60);">확인 완료</div>`
            : `<div class="sch-code off-code">확인 필요</div>`;
          click = `onclick="openBriefingDayPopup('${dateKey}')" style="cursor:pointer;"`;
        }
        html += `<td class="${cls}" ${click}><div class="calendar-day-cell"><div class="day-num">${day}</div>${badge}</div></td>`;
        day++;
      }
    }
    html += '</tr>';
    if (day > lastDate) break;
  }
  html += '</tbody></table>';
  container.innerHTML = html;
}

function ensureBriefingPopup() {
  let modal = document.getElementById('briefingDayViewModal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'briefingDayViewModal';
  modal.className = 'modal-overlay hidden';
  modal.innerHTML = `
    <div class="modal-box" style="width:520px; max-width:94vw; max-height:90vh; display:flex; flex-direction:column; padding:22px; overflow-y:auto;">
      <h3 id="briefingDayTitle" style="margin-bottom:6px; color:#2b2f3e;">브리핑일지</h3>
      <div id="briefingDayMeta" style="font-size:11px; color:#888; margin-bottom:10px;"></div>
      <div id="briefingDayContent" style="overflow:auto; max-height:34vh; border:1px solid #e2e5f3; background:#fff; border-radius:10px; padding:12px; font-size:13px; line-height:1.6; white-space:pre-wrap;"></div>

      <div id="briefingConfirmedInfo" class="hidden" style="margin-top:14px; background:#f0fff7; border:1px solid #b8efd2; color:#178a52; border-radius:10px; padding:12px; font-size:13px; font-weight:700; text-align:center;"></div>

      <div id="briefingSignSection" style="margin-top:14px;">
        <div style="font-size:12px; color:#666; margin-bottom:6px;">✍️ 아래 칸에 서명 후 저장을 누르면 확인 처리됩니다.</div>
        <canvas id="briefingDaySignCanvas" width="360" height="150" style="width:100%; height:150px; background:#fff; border:1px solid #ddd; border-radius:10px; touch-action:none;"></canvas>
        <div style="display:flex; gap:8px; margin-top:8px;">
          <button class="modal-cancel" style="flex:1; padding:8px; border:none; border-radius:8px;" onclick="clearSignatureCanvasEl('briefingDaySignCanvas')">지우기</button>
        </div>
      </div>

      <div class="modal-actions" style="margin-top:14px;">
        <button class="modal-cancel" onclick="closeBriefingDayPopup()">닫기</button>
        <button class="modal-confirm" id="briefingConfirmBtn">서명 저장 및 확인</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  return modal;
}

function openBriefingDayPopup(dateKey) {
  const item = briefingsCache[dateKey];
  if (!item) { alert('해당 날짜에 등록된 브리핑일지가 없습니다.'); return; }

  const modal = ensureBriefingPopup();
  const content = document.getElementById('briefingDayContent');
  const title = document.getElementById('briefingDayTitle');
  const meta = document.getElementById('briefingDayMeta');
  const btn = document.getElementById('briefingConfirmBtn');
  const signSection = document.getElementById('briefingSignSection');
  const confirmedInfo = document.getElementById('briefingConfirmedInfo');

  title.textContent = item.title || `${dateKey} 브리핑일지`;
  meta.textContent = `적용일자: ${dateKey}`;
  content.textContent = item.content || '';
  content.scrollTop = 0;

  const confirmed = isBriefingConfirmed(dateKey);
  if (confirmed) {
    const myId = getCurrentUserId();
    const myConfirm = (briefingConfirmationsCache[dateKey] || {})[myId] || {};
    signSection.classList.add('hidden');
    btn.classList.add('hidden');
    confirmedInfo.classList.remove('hidden');
    confirmedInfo.innerHTML = `✅ 이미 확인 및 서명 완료했습니다.<br><span style="font-weight:400; font-size:11px;">확인시간: ${escapeHtml(myConfirm.signedAt || '')}</span>`;
  } else {
    confirmedInfo.classList.add('hidden');
    signSection.classList.remove('hidden');
    btn.classList.remove('hidden');
    btn.disabled = false;
    btn.textContent = '서명 저장 및 확인';
    setupSignatureCanvasEl('briefingDaySignCanvas');
    clearSignatureCanvasEl('briefingDaySignCanvas');
    btn.onclick = () => confirmBriefing(dateKey);
  }

  modal.classList.remove('hidden');
}

function closeBriefingDayPopup() {
  const modal = document.getElementById('briefingDayViewModal');
  if (modal) modal.classList.add('hidden');
}

async function confirmBriefing(dateKey) {
  const id = getCurrentUserId();
  const name = getCurrentUserName();
  if (!id) { alert('로그인 정보가 없습니다.'); return; }
  if (!briefingsCache[dateKey]) { alert('브리핑일지를 찾을 수 없습니다.'); return; }
  if (isBriefingConfirmed(dateKey)) { alert('이미 확인 완료된 브리핑일지입니다.'); return; }
  if (!hasSignatureStroke('briefingDaySignCanvas')) { alert('서명을 먼저 입력해 주세요.'); return; }

  const canvas = document.getElementById('briefingDaySignCanvas');
  const signature = canvas.toDataURL('image/png');
  const btn = document.getElementById('briefingConfirmBtn');
  btn.disabled = true;
  btn.textContent = '저장 중...';

  try {
    await briefingConfirmationsRef.child(dateKey).child(id).set({
      empId: id,
      empName: name,
      signature,
      signedAt: new Date().toLocaleString('ko-KR'),
      signedAtTs: Date.now()
    });
    alert('✅ 확인 및 서명이 저장되었습니다.');
    closeBriefingDayPopup();
    renderBriefingCalendar();
  } catch (err) {
    console.error(err);
    alert('저장 중 오류가 발생했습니다.');
    btn.disabled = false;
    btn.textContent = '서명 저장 및 확인';
  }
}

/* 브리핑 항목은 목록 대신 달력으로 렌더링 */
const renderUserFilesCoreForBriefingCalendar = renderUserFiles;
renderUserFiles = function () {
  if (currentCategory && categoriesCache[currentCategory]?.type === 'briefing') {
    renderBriefingCalendar();
    return;
  }
  return renderUserFilesCoreForBriefingCalendar();
};
