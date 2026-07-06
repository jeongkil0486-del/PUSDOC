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
        <div class="pname" style="font-weight:700;">${escapeHtml(n.title || '')}<br><span style="font-size:11px; color:#aaa; font-weight:normal;">${escapeHtml(n.date || '')}</span></div>
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
