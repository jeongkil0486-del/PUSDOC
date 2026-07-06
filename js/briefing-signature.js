/* =========================================================
   브리핑일지 확인/서명 모듈
========================================================= */
let signaturePadState = { drawing:false, initialized:false, hasStroke:false };

function getCurrentUserId() {
  return (localStorage.getItem(LOGGED_IN_ID_KEY) || '').trim();
}
function getCurrentUserName() {
  return (localStorage.getItem('loggedInUserName') || '').trim() || '사원';
}
function getMyAccount() {
  const id = getCurrentUserId();
  return (id && userAccountsCache[id]) ? userAccountsCache[id] : null;
}
function getMySignature() {
  const account = getMyAccount();
  return account && account.signature ? account.signature : '';
}

function setupSignatureCanvas() {
  const canvas = document.getElementById('signatureCanvas');
  if(!canvas || signaturePadState.initialized) return;
  const ctx = canvas.getContext('2d');
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#111827';

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
    signaturePadState.drawing = true;
    signaturePadState.hasStroke = true;
    const p = pos(evt);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }
  function move(evt) {
    if(!signaturePadState.drawing) return;
    evt.preventDefault();
    const p = pos(evt);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
  function end(evt) {
    if(evt) evt.preventDefault();
    signaturePadState.drawing = false;
  }
  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  window.addEventListener('mouseup', end);
  canvas.addEventListener('touchstart', start, {passive:false});
  canvas.addEventListener('touchmove', move, {passive:false});
  canvas.addEventListener('touchend', end, {passive:false});
  signaturePadState.initialized = true;
}

function clearSignatureCanvas() {
  const canvas = document.getElementById('signatureCanvas');
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  signaturePadState.hasStroke = false;
  const status = document.getElementById('signatureStatus');
  if(status) status.textContent = '서명을 다시 입력하세요.';
}

function drawSavedSignature(dataUrl) {
  clearSignatureCanvas();
  if(!dataUrl) return;
  const canvas = document.getElementById('signatureCanvas');
  const ctx = canvas.getContext('2d');
  const img = new Image();
  img.onload = () => {
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    signaturePadState.hasStroke = true;
  };
  img.src = dataUrl;
}

function openSignatureModal() {
  const id = getCurrentUserId();
  if(!id || id === ADMIN_ID) {
    alert('직원 아이디로 로그인한 뒤 서명을 등록할 수 있습니다.');
    return;
  }
  document.getElementById('signatureModal').classList.remove('hidden');
  setupSignatureCanvas();
  setTimeout(() => drawSavedSignature(getMySignature()), 30);
  const status = document.getElementById('signatureStatus');
  if(status) status.textContent = getMySignature() ? '기존 서명이 불러와졌습니다.' : '아직 등록된 서명이 없습니다.';
}

function closeSignatureModal() {
  document.getElementById('signatureModal').classList.add('hidden');
}

async function saveMySignature() {
  const id = getCurrentUserId();
  if(!id) { alert('로그인 정보가 없습니다.'); return; }
  const canvas = document.getElementById('signatureCanvas');
  if(!signaturePadState.hasStroke) { alert('서명을 먼저 작성해 주세요.'); return; }
  const dataUrl = canvas.toDataURL('image/png');
  await userAccountsRef.child(id).update({
    signature: dataUrl,
    signatureUpdatedAt: new Date().toLocaleString('ko-KR')
  });
  const status = document.getElementById('signatureStatus');
  if(status) status.textContent = '✅ 서명이 저장되었습니다.';
  alert('서명 등록이 완료되었습니다.');
}

function getBriefingConfirmCount(itemId) {
  return Object.keys(briefingConfirmationsCache[itemId] || {}).length;
}
function isBriefingConfirmed(itemId) {
  const id = getCurrentUserId();
  return !!(id && briefingConfirmationsCache[itemId] && briefingConfirmationsCache[itemId][id]);
}

async function confirmBriefing(catId, itemId) {
  const id = getCurrentUserId();
  const name = getCurrentUserName();
  if(!id) { alert('로그인 정보가 없습니다.'); return; }
  const signature = getMySignature();
  if(!signature) {
    alert('먼저 내 서명을 등록해야 브리핑일지를 확인할 수 있습니다.');
    openSignatureModal();
    return;
  }
  const item = dynamicDataCache[catId] && dynamicDataCache[catId][itemId];
  if(!item) { alert('브리핑일지를 찾을 수 없습니다.'); return; }
  if(isBriefingConfirmed(itemId)) {
    alert('이미 확인 완료된 브리핑일지입니다.');
    return;
  }
  if(!confirm(`브리핑일지 [${item.title}] 내용을 확인했고, 내 서명으로 확인 처리할까요?`)) return;
  await briefingConfirmationsRef.child(itemId).child(id).set({
    briefingId: itemId,
    briefingTitle: item.title || '',
    briefingDate: item.date || '',
    briefingDateKey: getBriefingItemDateKey(item),
    empId: id,
    empName: name,
    signature,
    signedAt: new Date().toLocaleString('ko-KR'),
    signedAtTs: Date.now()
  });
  alert('✅ 확인 및 서명 기록이 완료되었습니다.');
  renderUserFiles();
}

function downloadBriefingMonthlyExcel(catId) {
  if(typeof XLSX === 'undefined') { alert('엑셀 라이브러리가 로드되지 않았습니다.'); return; }
  const yearSel = document.getElementById('adminSchYear');
  const monthSel = document.getElementById('adminSchMonth');
  const year = yearSel ? parseInt(yearSel.value, 10) : new Date().getFullYear();
  const month = monthSel ? parseInt(monthSel.value, 10) : (new Date().getMonth() + 1);
  const ym = `${year}-${String(month).padStart(2,'0')}`;
  const itemsData = dynamicDataCache[catId] || {};
  const briefingItems = Object.keys(itemsData)
    .map(k => ({id:k, ...itemsData[k]}))
    .filter(item => {
      const d = new Date(item.timestamp || 0);
      if(item.timestamp) return d.getFullYear() === year && (d.getMonth()+1) === month;
      return String(item.date || '').includes(`${year}. ${month}.`) || String(item.date || '').includes(`${year}-${String(month).padStart(2,'0')}`);
    })
    .sort((a,b) => (a.timestamp || 0) - (b.timestamp || 0));

  const rows = [];
  briefingItems.forEach(item => {
    const confirms = briefingConfirmationsCache[item.id] || {};
    const keys = Object.keys(confirms);
    if(keys.length === 0) {
      rows.push({
        '브리핑일지 제목': item.title || '',
        '브리핑 등록일': item.date || '',
        '사번': '',
        '이름': '',
        '확인일시': '',
        '서명등록여부': '미확인'
      });
    } else {
      keys.forEach(empId => {
        const c = confirms[empId] || {};
        rows.push({
          '브리핑일지 제목': item.title || '',
          '브리핑 등록일': item.date || '',
          '사번': c.empId || empId,
          '이름': c.empName || '',
          '확인일시': c.signedAt || '',
          '서명등록여부': c.signature ? '서명완료' : '서명없음'
        });
      });
    }
  });

  if(rows.length === 0) {
    alert(`${year}년 ${month}월에 등록된 브리핑일지 확인 기록이 없습니다.`);
    return;
  }
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{wch:28},{wch:22},{wch:14},{wch:16},{wch:24},{wch:14}];
  XLSX.utils.book_append_sheet(wb, ws, '브리핑확인명단');
  XLSX.writeFile(wb, `브리핑일지_확인명단_${ym}.xlsx`);
}

function renderBriefingUserList(keyword, container, items) {
  const filtered = items.filter(n => (n.title || '').toLowerCase().includes(keyword));
  if(filtered.length === 0) {
    container.innerHTML = `<div class="no-result">등록된 브리핑일지가 없습니다.</div>`;
    return;
  }
  filtered.forEach(n => {
    const confirmed = isBriefingConfirmed(n.id);
    const div = document.createElement('div');
    div.className = 'doc-item';
    div.style.display = 'block';
    const btnHtml = confirmed
      ? `<button class="upload-btn" style="width:100%; margin-top:12px; background:linear-gradient(135deg,#34c98f,#27ae60);" disabled>✅ 확인 완료</button>`
      : `<button class="upload-btn" style="width:100%; margin-top:12px;" onclick="confirmBriefing('${currentCategory}','${n.id}'); event.stopPropagation();">확인하고 서명 입력</button>`;
    div.innerHTML = `
      <div style="display:flex; align-items:center; gap:12px;">
        <div class="picon" style="background:linear-gradient(135deg,#6d83ff,#8b6df8); flex-shrink:0;">🛫</div>
        <div class="pname" style="font-weight:700;">${escapeHtml(n.title || '')}<br><span style="font-size:11px; color:#aaa; font-weight:normal;">${escapeHtml(n.briefingDateKey || n.date || '')}</span></div>
      </div>
      <div style="font-size:13px; color:#444; line-height:1.6; white-space:pre-wrap; background:#f8f9fd; border:1px solid #eef0fa; border-radius:10px; padding:12px; margin-top:12px;">${escapeHtml(n.content || '')}</div>
      ${btnHtml}
    `;
    div.addEventListener('click', () => viewBoardItem(currentCategory, n.id));
    container.appendChild(div);
  });
}

const originalRenderUserFilesForBriefing = renderUserFiles;
renderUserFiles = function() {
  if (!currentCategory || !categoriesCache[currentCategory]) return;
  const cat = categoriesCache[currentCategory];
  if(cat.type !== 'briefing') return originalRenderUserFilesForBriefing();
  const keyword = document.getElementById('searchInput').value.trim().toLowerCase();
  const container = document.getElementById('userFileList');
  container.innerHTML = '';
  const itemsData = dynamicDataCache[currentCategory] || {};
  const items = Object.keys(itemsData).map(k => ({id: k, ...itemsData[k]})).sort((a,b) => b.timestamp - a.timestamp);
  renderBriefingUserList(keyword, container, items);
};

const originalViewBoardItemForBriefing = viewBoardItem;
viewBoardItem = function(catId, id) {
  const oldActionBefore = document.getElementById('briefingConfirmActionBox');
  if(oldActionBefore) oldActionBefore.remove();
  const cat = categoriesCache[catId];
  originalViewBoardItemForBriefing(catId, id);
  if(cat && cat.type === 'briefing') {
    const item = dynamicDataCache[catId] && dynamicDataCache[catId][id];
    const content = document.getElementById('noticeViewContent');
    if(content && item) {
      const confirmed = isBriefingConfirmed(id);
      const count = getBriefingConfirmCount(id);
      const action = document.createElement('div');
      action.id = 'briefingConfirmActionBox';
      action.style.marginTop = '16px';
      action.innerHTML = confirmed
        ? `<div style="background:#f0fff7; border:1px solid #b8efd2; color:#178a52; border-radius:10px; padding:12px; font-size:13px; font-weight:700; text-align:center;">✅ 이미 확인 및 서명 완료했습니다. 현재 확인 인원 ${count}명</div>`
        : `<button class="upload-btn" style="width:100%;" onclick="confirmBriefing('${catId}','${id}')">확인하고 내 서명으로 기록</button><div style="font-size:11px; color:#888; margin-top:8px; text-align:center;">현재 확인 인원 ${count}명</div>`;
      content.after(action);
    }
  }
};

/* =========================================================
   브리핑일지 엑셀 양식 연동 다운로드 모듈
   - 양식은 Firebase briefingTemplate 또는 /templates/briefing-template.xlsx 사용
   - 직원 확인 시 저장된 서명 이미지를 해당 날짜 시트의 이름 옆 Signature 칸에 삽입
========================================================= */
function dataUrlToArrayBuffer(dataUrl) {
  const base64 = String(dataUrl || '').split(',')[1] || '';
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for(let i=0; i<len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function arrayBufferToDataUrl(buffer, mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for(let i=0; i<bytes.length; i+=chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i+chunkSize));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

async function handleBriefingTemplateUpload(event) {
  const file = event.target.files && event.target.files[0];
  if(!file) return;
  if(!/\.xlsx$/i.test(file.name)) { alert('엑셀 파일(.xlsx)만 등록할 수 있습니다.'); event.target.value=''; return; }
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      await briefingTemplateRef.set({
        fileName: file.name,
        dataUrl: e.target.result,
        updatedAt: new Date().toLocaleString('ko-KR'),
        updatedAtTs: Date.now()
      });
      alert('브리핑일지 엑셀 양식이 등록되었습니다. 이제 월별 다운로드 시 이 양식을 기준으로 서명이 들어갑니다.');
    } catch(err) {
      alert('양식 저장 중 오류가 발생했습니다. 파일 용량이 너무 크면 저장이 실패할 수 있습니다.');
    } finally {
      event.target.value = '';
    }
  };
  reader.onerror = () => alert('엑셀 파일을 읽지 못했습니다.');
  reader.readAsDataURL(file);
}

async function loadBriefingTemplateBuffer() {
  if(briefingTemplateCache && briefingTemplateCache.dataUrl) {
    return dataUrlToArrayBuffer(briefingTemplateCache.dataUrl);
  }
  const res = await fetch('templates/briefing-template.xlsx');
  if(!res.ok) throw new Error('기본 브리핑 양식을 찾을 수 없습니다.');
  return await res.arrayBuffer();
}

function normalizeBriefingName(value) {
  return String(value || '').replace(/\s+/g, '').trim();
}

function getBriefingItemDateKey(item) {
  if(item && item.briefingDateKey) return item.briefingDateKey;
  const ts = item && item.timestamp ? new Date(item.timestamp) : null;
  if(ts && !isNaN(ts.getTime())) {
    return `${ts.getFullYear()}-${String(ts.getMonth()+1).padStart(2,'0')}-${String(ts.getDate()).padStart(2,'0')}`;
  }
  return '';
}

function findBriefingWorksheet(workbook, dateKey) {
  const d = new Date(dateKey + 'T00:00:00');
  if(isNaN(d.getTime())) return null;
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const candidates = [
    dateKey,
    `${month}-${day}`, `${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`,
    `${month}.${day}`, `${String(month).padStart(2,'0')}.${String(day).padStart(2,'0')}`,
    `${day}`, `${String(day).padStart(2,'0')}`,
    `${month}월 ${day}일`, `${day}일`
  ].map(v => String(v).toLowerCase().replace(/\s+/g,''));
  let ws = workbook.worksheets.find(sh => candidates.includes(String(sh.name).toLowerCase().replace(/\s+/g,'')));
  if(ws) return ws;
  ws = workbook.worksheets.find(sh => {
    const nm = String(sh.name).toLowerCase().replace(/\s+/g,'');
    return candidates.some(c => nm.includes(c));
  });
  if(ws) return ws;
  return workbook.worksheets[day - 1] || workbook.worksheets[0] || null;
}

function findSignatureCellByName(worksheet, empName) {
  const target = normalizeBriefingName(empName);
  if(!target) return null;
  const maxRow = Math.min(worksheet.rowCount || 200, 220);
  const maxCol = Math.min(worksheet.columnCount || 30, 30);
  for(let r=1; r<=maxRow; r++) {
    for(let c=1; c<=maxCol; c++) {
      const cellVal = worksheet.getCell(r, c).value;
      let text = '';
      if(cellVal && typeof cellVal === 'object') text = cellVal.text || cellVal.result || cellVal.richText?.map(x=>x.text).join('') || '';
      else text = cellVal || '';
      if(normalizeBriefingName(text) === target) {
        // 기본 양식이 No / Name / Signature 반복 구조라 이름 오른쪽 칸을 우선 사용
        return { row: r, col: c + 1 };
      }
    }
  }
  return null;
}

function setCellPlainText(cell, text) {
  cell.value = text || '';
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false };
  cell.font = { name: 'Malgun Gothic', size: 10 };
}

function triggerWorkbookDownload(buffer, fileName) {
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function downloadBriefingTemplateExcel(catId) {
  if(typeof ExcelJS === 'undefined') { alert('ExcelJS 라이브러리가 로드되지 않았습니다. 인터넷 연결 또는 CDN 로드를 확인해 주세요.'); return; }
  const yearSel = document.getElementById('adminSchYear');
  const monthSel = document.getElementById('adminSchMonth');
  const year = yearSel ? parseInt(yearSel.value, 10) : new Date().getFullYear();
  const month = monthSel ? parseInt(monthSel.value, 10) : (new Date().getMonth()+1);
  const ym = `${year}-${String(month).padStart(2,'0')}`;

  const itemsData = dynamicDataCache[catId] || {};
  const briefingItems = Object.keys(itemsData)
    .map(k => ({ id:k, ...itemsData[k] }))
    .filter(item => getBriefingItemDateKey(item).startsWith(ym))
    .sort((a,b) => String(getBriefingItemDateKey(a)).localeCompare(String(getBriefingItemDateKey(b))));

  if(briefingItems.length === 0) {
    alert(`${year}년 ${month}월에 등록된 브리핑일지가 없습니다.`);
    return;
  }

  try {
    const templateBuffer = await loadBriefingTemplateBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(templateBuffer);

    let insertedCount = 0;
    let missingNameCount = 0;
    const used = new Set();

    for(const item of briefingItems) {
      const dateKey = getBriefingItemDateKey(item);
      const ws = findBriefingWorksheet(workbook, dateKey);
      if(!ws) continue;

      const confirms = briefingConfirmationsCache[item.id] || {};
      Object.keys(confirms).forEach(empId => {
        const c = confirms[empId] || {};
        const empName = c.empName || (userAccountsCache[empId] && userAccountsCache[empId].empName) || '';
        const hit = findSignatureCellByName(ws, empName);
        if(!hit) { missingNameCount++; return; }
        const key = `${ws.name}:${hit.row}:${hit.col}:${empId}`;
        if(used.has(key)) return;
        used.add(key);
        const cell = ws.getCell(hit.row, hit.col);
        if(c.signature && /^data:image\/png;base64,/.test(c.signature)) {
          try {
            const imgId = workbook.addImage({ base64: c.signature, extension: 'png' });
            ws.addImage(imgId, {
              tl: { col: hit.col - 1 + 0.08, row: hit.row - 1 + 0.12 },
              ext: { width: 90, height: 28 },
              editAs: 'oneCell'
            });
            cell.value = '';
            ws.getRow(hit.row).height = Math.max(ws.getRow(hit.row).height || 18, 26);
          } catch(e) {
            setCellPlainText(cell, '서명완료');
          }
        } else {
          setCellPlainText(cell, '서명완료');
        }
        insertedCount++;
      });
    }

    const out = await workbook.xlsx.writeBuffer();
    triggerWorkbookDownload(out, `브리핑일지_${ym}_서명본.xlsx`);
    alert(`다운로드 완료\n서명 입력: ${insertedCount}건${missingNameCount ? `\n양식에서 이름을 못 찾은 건수: ${missingNameCount}건` : ''}`);
  } catch(err) {
    console.error(err);
    alert('브리핑일지 서명본 생성 중 오류가 발생했습니다. 양식 파일이 손상되었거나 브라우저가 엑셀 생성을 지원하지 않을 수 있습니다.');
  }
}

/* =========================================================
   브리핑일지 월별 엑셀 업로드 + 직원 달력 확인 모듈
   - 관리자: 일별 시트가 있는 엑셀을 업로드하면 각 시트가 해당 날짜 브리핑으로 등록됨
   - 직원: 브리핑일지 메뉴에서 달력으로 확인 필요/확인 완료 상태 확인
   - 읽기 팝업: 내용을 열고 스크롤/대기 후에만 확인 버튼 활성화
========================================================= */
function getAdminSelectedBriefingYearMonth() {
  const ySel = document.getElementById('adminSchYear');
  const mSel = document.getElementById('adminSchMonth');
  const now = new Date();
  return {
    year: ySel ? parseInt(ySel.value, 10) : now.getFullYear(),
    month: mSel ? parseInt(mSel.value, 10) : now.getMonth() + 1
  };
}

function daysInBriefingMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function normalizeSheetNameForDate(name) {
  return String(name || '').toLowerCase().replace(/\s+/g, '').replace(/월/g,'.').replace(/일/g,'').replace(/_/g,'.').replace(/-/g,'.');
}

function inferBriefingDayFromSheetName(sheetName, fallbackIndex, year, month) {
  const nm = normalizeSheetNameForDate(sheetName);
  const maxDay = daysInBriefingMonth(year, month);
  const patterns = [
    /^(\d{1,2})$/,
    /^(\d{1,2})\.$/,
    /^(\d{1,2})\.(\d{1,2})$/,
    /^(\d{4})\.(\d{1,2})\.(\d{1,2})$/,
    /(\d{1,2})\.(\d{1,2})/,
    /(\d{1,2})일?$/
  ];
  for(const re of patterns) {
    const m = nm.match(re);
    if(!m) continue;
    let d = null;
    if(m.length >= 4) {
      const y = parseInt(m[1],10), mo = parseInt(m[2],10), day = parseInt(m[3],10);
      if(y === year && mo === month) d = day;
    } else if(m.length >= 3) {
      const a = parseInt(m[1],10), b = parseInt(m[2],10);
      if(a === month) d = b;
      else if(b === month) d = a;
      else d = b;
    } else if(m.length >= 2) {
      d = parseInt(m[1],10);
    }
    if(d && d >= 1 && d <= maxDay) return d;
  }
  const idxDay = fallbackIndex + 1;
  return idxDay >= 1 && idxDay <= maxDay ? idxDay : null;
}

function makeBriefingDateKey(year, month, day) {
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}

function stripHtmlToText(html) {
  const div = document.createElement('div');
  div.innerHTML = html || '';
  return div.textContent || div.innerText || '';
}

function cleanSheetHtml(html) {
  return String(html || '')
    .replace(/<html[^>]*>|<\/html>|<head[\s\S]*?<\/head>|<body[^>]*>|<\/body>/gi, '')
    .replace(/<table/gi, '<table class="briefing-sheet-table"')
    .trim();
}

async function handleBriefingWorkbookUpload(event, catId) {
  const file = event.target.files && event.target.files[0];
  if(!file) return;
  if(!/\.xlsx?$/i.test(file.name)) { alert('엑셀 파일(.xlsx/.xls)만 업로드할 수 있습니다.'); event.target.value=''; return; }
  if(typeof XLSX === 'undefined') { alert('XLSX 라이브러리가 로드되지 않았습니다.'); event.target.value=''; return; }

  const { year, month } = getAdminSelectedBriefingYearMonth();
  const ym = `${year}-${String(month).padStart(2,'0')}`;
  const ok = confirm(`${year}년 ${month}월 브리핑일지로 등록합니다.\n\n엑셀의 각 시트가 일자별 브리핑으로 저장되고, 같은 날짜가 이미 있으면 덮어쓰기 됩니다. 진행할까요?`);
  if(!ok) { event.target.value=''; return; }

  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const dataUrl = e.target.result;
      const base64 = String(dataUrl).split(',')[1];
      const wb = XLSX.read(base64, { type:'base64', cellDates:true });
      const updates = {};
      let count = 0;
      const nowTs = Date.now();

      wb.SheetNames.forEach((sheetName, idx) => {
        const day = inferBriefingDayFromSheetName(sheetName, idx, year, month);
        if(!day) return;
        const ws = wb.Sheets[sheetName];
        const rawHtml = XLSX.utils.sheet_to_html(ws, { editable:false });
        const contentHtml = cleanSheetHtml(rawHtml);
        const text = stripHtmlToText(contentHtml).replace(/\s+/g, ' ').trim();
        if(!text) return;
        const dateKey = makeBriefingDateKey(year, month, day);
        const itemId = `brief_${dateKey}`;
        updates[itemId] = {
          title: `${dateKey} 브리핑일지`,
          content: text.slice(0, 4000),
          contentHtml,
          date: new Date().toLocaleString('ko-KR'),
          imageUrl: '',
          briefingDateKey: dateKey,
          sourceSheetName: sheetName,
          sourceFileName: file.name,
          timestamp: nowTs + day,
          uploadedAt: new Date().toLocaleString('ko-KR'),
          uploadType: 'excel-sheet'
        };
        count++;
      });

      if(count === 0) {
        alert('등록할 수 있는 시트를 찾지 못했습니다. 시트명 또는 선택한 년/월을 확인해 주세요.');
        return;
      }

      await dataRef.child(catId).update(updates);
      await briefingTemplateRef.set({
        fileName: file.name,
        dataUrl,
        year,
        month,
        ym,
        sheetCount: count,
        updatedAt: new Date().toLocaleString('ko-KR'),
        updatedAtTs: Date.now()
      });
      alert(`✅ ${year}년 ${month}월 브리핑일지 ${count}개 시트가 등록되었습니다.`);
    } catch(err) {
      console.error(err);
      alert('브리핑 엑셀 업로드 중 오류가 발생했습니다. 파일 형식이나 시트 구성을 확인해 주세요.');
    } finally {
      event.target.value = '';
      renderAdminAll();
    }
  };
  reader.onerror = () => { alert('엑셀 파일을 읽지 못했습니다.'); event.target.value=''; };
  reader.readAsDataURL(file);
}

function getBriefingItemsForCurrentCategory() {
  const catId = currentCategory || 'briefing';
  const itemsData = dynamicDataCache[catId] || {};
  return Object.keys(itemsData).map(k => ({ id:k, ...itemsData[k] }))
    .filter(item => getBriefingItemDateKey(item))
    .sort((a,b) => String(getBriefingItemDateKey(a)).localeCompare(String(getBriefingItemDateKey(b))));
}

function findBriefingByDate(dateKey) {
  return getBriefingItemsForCurrentCategory().find(item => getBriefingItemDateKey(item) === dateKey) || null;
}

function renderBriefingCalendar() {
  const container = document.getElementById('calendarGridContainer');
  if(!container) return;
  const yearSel = document.getElementById('calendarYearSelect');
  const monthSel = document.getElementById('calendarMonthSelect');
  const now = new Date();
  const year = yearSel ? parseInt(yearSel.value, 10) : now.getFullYear();
  const month = monthSel ? parseInt(monthSel.value, 10) : now.getMonth() + 1;
  const first = new Date(year, month - 1, 1);
  const lastDate = new Date(year, month, 0).getDate();
  const startDay = first.getDay();
  const todayKey = makeBriefingDateKey(now.getFullYear(), now.getMonth()+1, now.getDate());
  const items = getBriefingItemsForCurrentCategory();
  const itemMap = {};
  items.forEach(item => { itemMap[getBriefingItemDateKey(item)] = item; });

  let html = `
    <div style="background:#fff; border:1px solid #e2e5f3; border-radius:14px; padding:12px; margin-bottom:12px; box-shadow:0 6px 16px rgba(109,131,255,0.06);">
      <div style="font-size:13px; font-weight:800; color:#4e65df; margin-bottom:4px;">🛫 브리핑일지 확인 달력</div>
      <div style="font-size:11px; color:#777; line-height:1.5;">확인하지 않은 브리핑은 <b style="color:#e25b5b;">확인 필요</b>로 표시됩니다. 날짜를 누르면 내용을 읽고 확인 서명을 남길 수 있습니다.</div>
    </div>
    <table class="calendar-table"><thead><tr><th>일</th><th>월</th><th>화</th><th>수</th><th>목</th><th>금</th><th>토</th></tr></thead><tbody>`;
  let day = 1;
  for(let r=0; r<6; r++) {
    html += '<tr>';
    for(let c=0; c<7; c++) {
      if((r===0 && c<startDay) || day>lastDate) {
        html += '<td class="day-empty"><div class="calendar-day-cell"></div></td>';
      } else {
        const dateKey = makeBriefingDateKey(year, month, day);
        const item = itemMap[dateKey];
        const confirmed = item ? isBriefingConfirmed(item.id) : false;
        const cls = dateKey === todayKey ? 'today-cell' : '';
        const badge = item ? (confirmed
          ? `<div class="sch-code" style="background:linear-gradient(135deg,#34c98f,#27ae60);">확인 완료</div>`
          : `<div class="sch-code off-code">확인 필요</div>`) : '';
        const title = item ? `<div class="sch-time" style="cursor:pointer; color:#2b2f3e;">브리핑 등록</div>` : '';
        const click = item ? `onclick="openBriefingDayPopup('${dateKey}')" style="cursor:pointer;"` : '';
        html += `<td class="${cls}" ${click}><div class="calendar-day-cell"><div class="day-num">${day}</div>${badge}${title}</div></td>`;
        day++;
      }
    }
    html += '</tr>';
    if(day > lastDate) break;
  }
  html += '</tbody></table>';
  container.innerHTML = html;
}

function ensureBriefingPopup() {
  let modal = document.getElementById('briefingDayViewModal');
  if(modal) return modal;
  modal = document.createElement('div');
  modal.id = 'briefingDayViewModal';
  modal.className = 'modal-overlay hidden';
  modal.innerHTML = `
    <div class="modal-box" style="width:720px; max-width:94vw; max-height:90vh; display:flex; flex-direction:column; padding:22px;">
      <h3 id="briefingDayTitle" style="margin-bottom:6px; color:#2b2f3e;">브리핑일지</h3>
      <div id="briefingDayMeta" style="font-size:11px; color:#888; margin-bottom:10px;"></div>
      <div id="briefingDayContent" style="overflow:auto; max-height:58vh; border:1px solid #e2e5f3; background:#fff; border-radius:10px; padding:12px; font-size:13px; line-height:1.6;"></div>
      <div id="briefingReadGuide" style="font-size:11px; color:#e25b5b; font-weight:700; margin-top:8px; min-height:16px; text-align:center;">내용을 끝까지 읽으면 확인 버튼이 활성화됩니다.</div>
      <div class="modal-actions" style="margin-top:10px;">
        <button class="modal-cancel" onclick="closeBriefingDayPopup()">닫기</button>
        <button class="modal-confirm" id="briefingConfirmBtn" disabled>확인하고 서명 입력</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  return modal;
}

function openBriefingDayPopup(dateKey) {
  const item = findBriefingByDate(dateKey);
  if(!item) return;
  const modal = ensureBriefingPopup();
  const content = document.getElementById('briefingDayContent');
  const title = document.getElementById('briefingDayTitle');
  const meta = document.getElementById('briefingDayMeta');
  const btn = document.getElementById('briefingConfirmBtn');
  const guide = document.getElementById('briefingReadGuide');
  const confirmed = isBriefingConfirmed(item.id);

  title.textContent = item.title || `${dateKey} 브리핑일지`;
  meta.textContent = `적용일자: ${dateKey}${item.sourceSheetName ? ' / 시트: ' + item.sourceSheetName : ''}`;
  content.innerHTML = item.contentHtml ? `<div class="briefing-sheet-wrap">${item.contentHtml}</div>` : `<div style="white-space:pre-wrap;">${escapeHtml(item.content || '')}</div>`;
  content.scrollTop = 0;
  btn.onclick = () => confirmBriefing(currentCategory, item.id);

  if(confirmed) {
    btn.disabled = true;
    btn.textContent = '✅ 이미 확인 완료';
    guide.textContent = '이미 확인 및 서명 처리된 브리핑일지입니다.';
    guide.style.color = '#178a52';
  } else {
    btn.disabled = true;
    btn.textContent = '확인하고 서명 입력';
    guide.style.color = '#e25b5b';
    guide.textContent = '내용을 끝까지 읽으면 확인 버튼이 활성화됩니다.';
    const enable = () => {
      if(isBriefingConfirmed(item.id)) return;
      btn.disabled = false;
      guide.textContent = '내용 확인 후 버튼을 눌러 서명을 기록하세요.';
      guide.style.color = '#4e65df';
    };
    setTimeout(() => {
      if(content.scrollHeight <= content.clientHeight + 20) enable();
    }, 1200);
    content.onscroll = () => {
      if(content.scrollTop + content.clientHeight >= content.scrollHeight - 20) enable();
    };
  }
  modal.classList.remove('hidden');
}

function closeBriefingDayPopup() {
  const modal = document.getElementById('briefingDayViewModal');
  if(modal) modal.classList.add('hidden');
}

// 기존 확인 함수 보강: 확인 후 달력/관리자 화면 갱신
const confirmBriefingCore = confirmBriefing;
confirmBriefing = async function(catId, itemId) {
  await confirmBriefingCore(catId, itemId);
  const modal = document.getElementById('briefingDayViewModal');
  if(modal) modal.classList.add('hidden');
  if(currentCategory && categoriesCache[currentCategory]?.type === 'briefing') renderBriefingCalendar();
  renderAdminAll();
};

// 브리핑 항목은 목록 대신 달력으로 렌더링
const renderUserFilesCoreForBriefingCalendar = renderUserFiles;
renderUserFiles = function() {
  if(currentCategory && categoriesCache[currentCategory]?.type === 'briefing') {
    renderBriefingCalendar();
    return;
  }
  return renderUserFilesCoreForBriefingCalendar();
};
