/* =========================================================
   스케줄 양식 다운로드 & 업로드 엔진 (완전 재설계)
========================================================= */

/* ── 양식 다운로드 ─────────────────────────────────── */
function downloadScheduleTemplate() {
  const year  = parseInt(document.getElementById('adminSchYear').value, 10);
  const month = parseInt(document.getElementById('adminSchMonth').value, 10);
  const daysInMonth = new Date(year, month, 0).getDate();

  const wb = XLSX.utils.book_new();

  /* ── 시트1: 근무표 ── */
  const headerRow = ['이름', '사번'];
  for(let d = 1; d <= daysInMonth; d++) headerRow.push(d + '일');

  const employees = Object.values(userAccountsCache)
    .filter(u => u.empId !== 'PUSDOC')
    .sort((a, b) => String(a.empId).localeCompare(String(b.empId)));

  const rows = [headerRow];
  employees.forEach(emp => {
    const row = [emp.empName || '', emp.empId];
    for(let d = 0; d < daysInMonth; d++) row.push('');
    rows.push(row);
  });
  for(let i = 0; i < 5; i++) {
    const row = ['', ''];
    for(let d = 0; d < daysInMonth; d++) row.push('');
    rows.push(row);
  }

  const ws1 = XLSX.utils.aoa_to_sheet(rows);
  ws1['!cols'] = [{ wch: 8 }, { wch: 12 }];
  for(let d = 0; d < daysInMonth; d++) ws1['!cols'].push({ wch: 5 });
  XLSX.utils.book_append_sheet(wb, ws1, `${year}년${month}월 근무표`);

  /* ── 시트2: 시간코드 매핑표 ── */
  const tcRows = [
    ['근무코드', '근무시간 (예: 0730-1630)', '설명 (오전/오후/롱/출퇴출 중 선택)'],
    ['G74', '0730-1630', '오전'],
    ['D',   '0900-1800', '오전'],
    ['N',   '2100-0600', '롱'],
    ['E',   '1300-2200', '오후'],
    ['',    '',          '← 이 아래에 직접 추가 가능'],
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(tcRows);
  ws2['!cols'] = [{ wch: 12 }, { wch: 20 }, { wch: 28 }];
  XLSX.utils.book_append_sheet(wb, ws2, '시간코드');

  XLSX.writeFile(wb, `근무표_양식_${year}년${month}월.xlsx`);
}

/* ── 양식 업로드 & Firebase 저장 ─────────────────── */
async function handleScheduleUpload(event) {
  const file = event.target.files[0];
  if(!file) return;
  event.target.value = '';

  const year  = parseInt(document.getElementById('adminSchYear').value, 10);
  const month = parseInt(document.getElementById('adminSchMonth').value, 10);
  const yStr  = String(year);
  const mStr  = month < 10 ? '0' + month : String(month);
  const daysInMonth = new Date(year, month, 0).getDate();

  const statusEl = document.getElementById('scheduleGlobalStatus');
  statusEl.textContent = '⏳ 파일 읽는 중...';

  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });

    /* ── 시간코드 시트 파싱 ── */
    const timeCodeMap = {};
    const tcSheetName = workbook.SheetNames.find(n => n.includes('시간코드'));
    if(tcSheetName) {
      const tcRows = XLSX.utils.sheet_to_json(workbook.Sheets[tcSheetName], { header: 1, defval: '' });
      for(let r = 1; r < tcRows.length; r++) {
        const code      = String(tcRows[r][0] || '').trim();
        const time      = String(tcRows[r][1] || '').trim();
        const shiftType = String(tcRows[r][2] || '').trim();
        if(code) timeCodeMap[code] = { workTime: time, shiftType };
      }
    }

    /* ── 근무표 시트 파싱 ── */
    const ws = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    if(rows.length < 2) { alert('데이터가 없습니다.'); statusEl.textContent = ''; return; }

    const header = rows[0];
    if(String(header[0]).trim() !== '이름' || String(header[1]).trim() !== '사번') {
      alert('양식이 올바르지 않습니다.\n반드시 다운로드한 양식을 사용해 주세요.\n(A열: 이름, B열: 사번)');
      statusEl.textContent = '';
      return;
    }

    const dayColMap = {};
    for(let c = 2; c < header.length; c++) {
      const dayNum = parseInt(String(header[c]).replace(/[^0-9]/g, ''), 10);
      if(!isNaN(dayNum) && dayNum >= 1 && dayNum <= 31) dayColMap[c] = dayNum;
    }

    if(Object.keys(dayColMap).length === 0) {
      alert('날짜 헤더를 인식할 수 없습니다. 다운로드한 양식을 그대로 사용해 주세요.');
      statusEl.textContent = '';
      return;
    }

    statusEl.textContent = '⏳ 데이터 처리 중...';

    const updateMap = {};
    let empCount = 0;

    for(let r = 1; r < rows.length; r++) {
      const row     = rows[r];
      const empName = String(row[0] || '').trim();
      const empId   = String(row[1] || '').trim();
      if(!empId) continue;

      if(!updateMap[empId]) updateMap[empId] = {};
      empCount++;

      Object.entries(dayColMap).forEach(([colIdx, dayNum]) => {
        const code = String(row[colIdx] || '').trim();
        if(!code) return;
        const dStr = dayNum < 10 ? '0' + dayNum : String(dayNum);
        const dateKey = `${yStr}-${mStr}-${dStr}`;
        if(dayNum <= daysInMonth) {
          const tc = timeCodeMap[code] || {};
          updateMap[empId][dateKey] = {
            code,
            workTime:  tc.workTime  || '',
            shiftType: tc.shiftType || '',
            empName,
            empId
          };
        }
      });
    }

    if(empCount === 0) {
      alert('직원 데이터가 없습니다. 사번을 입력했는지 확인해 주세요.');
      statusEl.textContent = '';
      return;
    }

    statusEl.textContent = `⏳ Firebase 저장 중... (${empCount}명)`;
    const promises = Object.entries(updateMap).map(([empId, dateMap]) =>
      scheduleMasterRef.child(empId).update(dateMap)
    );
    await Promise.all(promises);

    const metaKey = `${yStr}${mStr}`;
    const now = new Date();
    const uploadedAt = now.toLocaleString('ko-KR');
    await scheduleMetaRef.child(metaKey).set({
      label: `${year}년 ${month}월 근무표`,
      year, month, empCount,
      uploadedAt,
      timeCodeCount: Object.keys(timeCodeMap).length
    });

    statusEl.textContent = `✅ ${year}년 ${month}월 근무표 저장 완료! (${empCount}명)`;
    setTimeout(() => { statusEl.textContent = ''; }, 5000);

  } catch(err) {
    console.error(err);
    alert('업로드 처리 중 오류가 발생했습니다.');
    statusEl.textContent = '❌ 오류 발생';
    setTimeout(() => { statusEl.textContent = ''; }, 4000);
  }
}

async function clearSystemSchedules() {
  if(!confirm('서버에 보존된 전직원 스케줄 및 이력을 전부 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.')) return;
  await scheduleMasterRef.remove();
  await scheduleMetaRef.remove();
  alert('전체 스케줄이 삭제되었습니다.');
}

async function deleteMonthSchedule() {
  const year  = parseInt(document.getElementById('adminSchYear').value, 10);
  const month = parseInt(document.getElementById('adminSchMonth').value, 10);
  const MM = month < 10 ? '0' + month : String(month);
  const label = `${year}년 ${month}월`;

  if(!confirm(`[${label}] 스케줄을 전직원 대상으로 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;

  try {
    const empIds = Object.keys(scheduleMasterCache);
    if(empIds.length === 0) { alert('삭제할 스케줄 데이터가 없습니다.'); return; }

    const promises = empIds.map(async empId => {
      const empDates = scheduleMasterCache[empId] || {};
      const keysToDelete = Object.keys(empDates).filter(d => d.startsWith(`${year}-${MM}`));
      return Promise.all(keysToDelete.map(d => scheduleMasterRef.child(empId).child(d).remove()));
    });
    await Promise.all(promises);

    const metaKey = `${year}${MM}`;
    await scheduleMetaRef.child(metaKey).remove();

    alert(`[${label}] 스케줄이 삭제되었습니다.`);
  } catch(e) {
    console.error(e);
    alert('삭제 중 오류가 발생했습니다.');
  }
}
