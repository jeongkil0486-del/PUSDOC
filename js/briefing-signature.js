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

/* 브리핑일지 4개 고정 섹션 */
const BRIEFING_SECTIONS = [
  { key: 'tw', label: '① 업무 공지 (TW)' },
  { key: 'tas', label: '② 업무 공지 (TAS)' },
  { key: 'forward', label: '③ 전달사항' },
  { key: 'edu', label: '④ 교육사항' }
];

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

function setupSignatureCanvasEl(canvasId, onStroke) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  if (signaturePadRegistry[canvasId] && signaturePadRegistry[canvasId].initialized) return;

  const ctx = canvas.getContext('2d');
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#111827';

  const state = { drawing: false, hasStroke: false, initialized: true, onStroke: onStroke || null };

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
    if (state.onStroke) state.onStroke();
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
let adminBriefingSelectedYM = {};

function initAdminBriefingSelectors(catId) {
  const yearSel = document.getElementById(`adminBriefYear_${catId}`);
  const monthSel = document.getElementById(`adminBriefMonth_${catId}`);
  if (!yearSel || !monthSel) return;

  // adminSectionsContainer 전체가 자주 재렌더링되므로(다른 카테고리 데이터 변경 시에도 발생),
  // 매번 select가 새로 생성됨 -> 이전에 선택했던 년/월을 복원해서 "현재월로 리셋" 되는 것을 방지
  const now = new Date();
  const saved = adminBriefingSelectedYM[catId] || { year: now.getFullYear(), month: now.getMonth() + 1 };

  yearSel.innerHTML = '';
  monthSel.innerHTML = '';
  for (let y = now.getFullYear() - 1; y <= now.getFullYear() + 1; y++) {
    const opt = document.createElement('option');
    opt.value = y; opt.textContent = y + '년';
    if (y === saved.year) opt.selected = true;
    yearSel.appendChild(opt);
  }
  for (let m = 1; m <= 12; m++) {
    const opt = document.createElement('option');
    opt.value = m; opt.textContent = m + '월';
    if (m === saved.month) opt.selected = true;
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
  adminBriefingSelectedYM[catId] = { year, month };
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

  const sectionsHtml = BRIEFING_SECTIONS.map(s => `
    <div style="margin-bottom:14px; border:1px solid #eef0fa; border-radius:10px; padding:12px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-wrap:wrap; gap:6px;">
        <label style="font-weight:700; font-size:13px; color:#2b2f3e; margin:0;">${s.label}</label>
        <label style="display:flex; align-items:center; gap:6px; font-size:12px; color:#666; font-weight:600; cursor:pointer; margin:0;">
          <input type="checkbox" id="adminBriefSection_${s.key}_useTemplate" checked onchange="toggleAdminBriefingSectionEditable('${s.key}')" style="width:auto; margin:0;">
          양식 내용 그대로 사용
        </label>
      </div>
      <textarea id="adminBriefSection_${s.key}_content" placeholder="${s.label} 내용을 입력하세요" disabled
        style="width:100%; min-height:80px; padding:8px; border:1px solid #ddd; border-radius:8px; font-size:13px; resize:vertical; font-family:inherit; background:#f4f4f7;"></textarea>
    </div>`).join('');

  modal.innerHTML = `
    <div class="modal-box" style="width:600px; max-width:94vw; max-height:90vh; overflow-y:auto;">
      <h3 id="adminBriefingEditorTitle">브리핑일지 등록</h3>
      <div style="font-size:11px; color:#888; margin-bottom:14px; line-height:1.5;">각 항목별로 "양식 내용 그대로 사용"에 체크되어 있으면 기존 양식 내용을 그대로 사용합니다. 체크를 해제하고 직접 입력하면 해당 내용으로 덮어씁니다.</div>
      ${sectionsHtml}
      <div class="modal-actions">
        <button class="modal-cancel" onclick="closeAdminBriefingEditor()">취소</button>
        <button class="modal-confirm" onclick="saveAdminBriefing()">저장</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  return modal;
}

function toggleAdminBriefingSectionEditable(key) {
  const checkbox = document.getElementById(`adminBriefSection_${key}_useTemplate`);
  const textarea = document.getElementById(`adminBriefSection_${key}_content`);
  if (!checkbox || !textarea) return;
  textarea.disabled = checkbox.checked;
  textarea.style.background = checkbox.checked ? '#f4f4f7' : '#fff';
}

let activeAdminBriefingCatId = null;
let activeAdminBriefingDateKey = null;

function openAdminBriefingEditor(catId, dateKey) {
  activeAdminBriefingCatId = catId;
  activeAdminBriefingDateKey = dateKey;
  const modal = ensureAdminBriefingEditor();
  const existing = briefingsCache[dateKey] || null;
  const existingSections = existing && existing.sections ? existing.sections : null;
  // 구버전(제목/내용 단일 구조) 데이터 호환: 전달사항 섹션에 옮겨서 보여줌
  const legacyContent = existing && !existingSections && existing.content ? existing.content : '';

  document.getElementById('adminBriefingEditorTitle').textContent = `🛫 ${dateKey} 브리핑일지 ${existing ? '수정' : '등록'}`;

  BRIEFING_SECTIONS.forEach(s => {
    const sec = existingSections ? (existingSections[s.key] || { useTemplate: true, content: '' })
      : { useTemplate: s.key !== 'forward' || !legacyContent, content: s.key === 'forward' ? legacyContent : '' };
    const checkbox = document.getElementById(`adminBriefSection_${s.key}_useTemplate`);
    const textarea = document.getElementById(`adminBriefSection_${s.key}_content`);
    checkbox.checked = !!sec.useTemplate;
    textarea.value = sec.content || '';
    textarea.disabled = !!sec.useTemplate;
    textarea.style.background = sec.useTemplate ? '#f4f4f7' : '#fff';
  });

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

  const sections = {};
  BRIEFING_SECTIONS.forEach(s => {
    const useTemplate = document.getElementById(`adminBriefSection_${s.key}_useTemplate`).checked;
    const content = document.getElementById(`adminBriefSection_${s.key}_content`).value.trim();
    sections[s.key] = { useTemplate, content: useTemplate ? '' : content };
  });

  const confirmBtn = document.querySelector('#adminBriefingEditorModal .modal-confirm');
  confirmBtn.disabled = true;
  confirmBtn.textContent = '저장 중...';
  try {
    const existing = briefingsCache[dateKey] || null;
    await briefingsRef.child(dateKey).update({
      date: dateKey,
      sections,
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

function renderBriefingDaySections(item) {
  const wrap = document.getElementById('briefingDaySections');
  if (!wrap) return;
  const sections = item.sections || null;

  if (!sections) {
    // 구버전(제목/내용 단일 구조) 데이터 호환 표시
    wrap.innerHTML = `<div style="border:1px solid #e2e5f3; border-radius:10px; padding:12px; font-size:13px; line-height:1.6; white-space:pre-wrap;">${escapeHtml(item.content || '(등록된 내용이 없습니다)')}</div>`;
    return;
  }

  wrap.innerHTML = BRIEFING_SECTIONS.map(s => {
    const sec = sections[s.key] || { useTemplate: true, content: '' };
    const body = sec.useTemplate
      ? `<div style="font-size:12px; color:#999; font-style:italic;">(양식 내용 그대로 적용됨)</div>`
      : `<div style="font-size:13px; color:#333; line-height:1.6; white-space:pre-wrap;">${escapeHtml(sec.content || '')}</div>`;
    return `
      <div style="margin-bottom:12px; border:1px solid #e2e5f3; border-radius:10px; padding:12px;">
        <div style="font-weight:700; font-size:13px; color:#4e65df; margin-bottom:6px;">${s.label}</div>
        ${body}
      </div>`;
  }).join('');
}

function ensureBriefingPopup() {
  let modal = document.getElementById('briefingDayViewModal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'briefingDayViewModal';
  modal.className = 'modal-overlay hidden';
  modal.innerHTML = `
    <div class="modal-box" style="width:560px; max-width:94vw; max-height:90vh; display:flex; flex-direction:column; padding:22px; overflow-y:auto;">
      <h3 id="briefingDayTitle" style="margin-bottom:6px; color:#2b2f3e;">브리핑일지</h3>
      <div id="briefingDayMeta" style="font-size:11px; color:#888; margin-bottom:10px;"></div>
      <div id="briefingDaySections"></div>

      <div id="briefingConfirmedInfo" class="hidden" style="margin-top:6px; background:#f0fff7; border:1px solid #b8efd2; color:#178a52; border-radius:10px; padding:12px; font-size:13px; font-weight:700; text-align:center;"></div>

      <div id="briefingReadAllWrap" style="margin-top:10px; padding:10px; background:#f8f9fd; border-radius:8px; border:1px solid #eef0fa;">
        <label style="display:flex; align-items:center; gap:8px; font-size:13px; font-weight:700; color:#2b2f3e; cursor:pointer; margin:0;">
          <input type="checkbox" id="briefingReadAllCheck" onchange="onBriefingReadAllToggle()" style="width:auto; margin:0;">
          브리핑 내용을 모두 확인했습니다.
        </label>
      </div>

      <div id="briefingSignSection" style="margin-top:14px;">
        <div style="font-size:12px; color:#666; margin-bottom:6px;">✍️ 위 체크 후 아래 칸에 서명해 주세요.</div>
        <canvas id="briefingDaySignCanvas" width="360" height="150" style="width:100%; height:150px; background:#fff; border:1px solid #ddd; border-radius:10px; touch-action:none; opacity:0.5;"></canvas>
        <div style="display:flex; gap:8px; margin-top:8px;">
          <button class="modal-cancel" id="briefingSignRedoBtn" style="flex:1; padding:8px; border:none; border-radius:8px;" onclick="clearSignatureCanvasEl('briefingDaySignCanvas'); document.getElementById('briefingConfirmBtn').disabled = true;" disabled>다시쓰기</button>
        </div>
      </div>

      <div class="modal-actions" style="margin-top:14px;">
        <button class="modal-cancel" onclick="closeBriefingDayPopup()">닫기</button>
        <button class="modal-confirm" id="briefingConfirmBtn" disabled>저장</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  return modal;
}

function onBriefingReadAllToggle() {
  const checked = document.getElementById('briefingReadAllCheck').checked;
  const canvas = document.getElementById('briefingDaySignCanvas');
  const redoBtn = document.getElementById('briefingSignRedoBtn');
  const saveBtn = document.getElementById('briefingConfirmBtn');
  if (checked) {
    canvas.style.pointerEvents = 'auto';
    canvas.style.opacity = '1';
    redoBtn.disabled = false;
    saveBtn.disabled = !hasSignatureStroke('briefingDaySignCanvas');
  } else {
    canvas.style.pointerEvents = 'none';
    canvas.style.opacity = '0.5';
    redoBtn.disabled = true;
    saveBtn.disabled = true;
  }
}

function openBriefingDayPopup(dateKey) {
  const item = briefingsCache[dateKey];
  if (!item) { alert('해당 날짜에 등록된 브리핑일지가 없습니다.'); return; }

  const modal = ensureBriefingPopup();
  const title = document.getElementById('briefingDayTitle');
  const meta = document.getElementById('briefingDayMeta');
  const btn = document.getElementById('briefingConfirmBtn');
  const signSection = document.getElementById('briefingSignSection');
  const confirmedInfo = document.getElementById('briefingConfirmedInfo');
  const readAllWrap = document.getElementById('briefingReadAllWrap');
  const readAllCheck = document.getElementById('briefingReadAllCheck');
  const redoBtn = document.getElementById('briefingSignRedoBtn');
  const canvas = document.getElementById('briefingDaySignCanvas');

  title.textContent = `${dateKey} 브리핑일지`;
  meta.textContent = `적용일자: ${dateKey}`;
  renderBriefingDaySections(item);

  const confirmed = isBriefingConfirmed(dateKey);
  if (confirmed) {
    const myId = getCurrentUserId();
    const myConfirm = (briefingConfirmationsCache[dateKey] || {})[myId] || {};
    readAllWrap.classList.add('hidden');
    signSection.classList.add('hidden');
    btn.classList.add('hidden');
    confirmedInfo.classList.remove('hidden');
    confirmedInfo.innerHTML = `✅ 이미 확인 및 서명 완료했습니다.<br><span style="font-weight:400; font-size:11px;">확인시간: ${escapeHtml(myConfirm.signedAt || '')}</span>`;
  } else {
    confirmedInfo.classList.add('hidden');
    readAllWrap.classList.remove('hidden');
    signSection.classList.remove('hidden');
    btn.classList.remove('hidden');
    btn.textContent = '저장';
    btn.disabled = true;
    btn.onclick = () => confirmBriefing(dateKey);

    readAllCheck.checked = false;
    canvas.style.pointerEvents = 'none';
    canvas.style.opacity = '0.5';
    redoBtn.disabled = true;
    setupSignatureCanvasEl('briefingDaySignCanvas', () => {
      const saveBtn = document.getElementById('briefingConfirmBtn');
      if (saveBtn) saveBtn.disabled = false;
    });
    clearSignatureCanvasEl('briefingDaySignCanvas');
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
  const readAllCheck = document.getElementById('briefingReadAllCheck');
  if (!readAllCheck || !readAllCheck.checked) { alert('먼저 "브리핑 내용을 모두 확인했습니다"에 체크해 주세요.'); return; }
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
    btn.textContent = '저장';
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
