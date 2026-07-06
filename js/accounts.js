/* =========================================================
   계정 통합 매니저
========================================================= */
function toggleIdListPopup() {
  const popup = document.getElementById('idListPopupWrap');
  popup.classList.toggle('hidden');
}

async function createEmployeeAccount() {
  const empId = document.getElementById('newAdminEmpId').value.trim();
  const empName = document.getElementById('newAdminEmpName').value.trim();
  
  if(!empId || !empName) { alert('ID(사번)와 이름을 정확히 기입하세요.'); return; }
  if(empId.toUpperCase() === ADMIN_ID) { alert('관리자 계정과 중복될 수 없습니다.'); return; }

  try {
    await userAccountsRef.child(empId).set({
      empId: empId,
      empName: empName,
      pw: "" 
    });
    alert(`[${empName}] 사원의 계정이 정상 생성되었습니다.\n직원이 처음 로그인할 때 타이핑하는 번호가 초기 비밀번호로 자동 설정됩니다.`);
    document.getElementById('newAdminEmpId').value = '';
    document.getElementById('newAdminEmpName').value = '';
  } catch(e) {
    alert('데이터베이스 연동 오류');
  }
}

async function resetEmployeePassword(empId) {
  if(!confirm(`[${empId}] 계정의 비밀번호를 공백 상태로 리셋하시겠습니까?\n초기화 후 직원이 새로 로그인 창에 입력하는 비밀번호가 초기 비밀번호가 됩니다.`)) return;

  try {
    await userAccountsRef.child(empId).update({ pw: "" });
    alert(`[${empId}] 계정의 비밀번호가 성공적으로 공백 리셋되었습니다.`);
  } catch(e) {
    alert('비밀번호 초기화 실패');
  }
}

async function deleteEmployeeAccount(empId) {
  if(!confirm(`[${empId}] 계정을 서버에서 영구 삭제하시겠습니까?`)) return;
  await userAccountsRef.child(empId).remove();
  alert('계정이 즉각 소멸되었습니다.');
}

function renderAdminPopupIdList() {
  const container = document.getElementById('popupIdContainerList');
  if(!container) return;
  container.innerHTML = '';
  
  const keys = Object.keys(userAccountsCache);
  if(keys.length === 0) {
    container.innerHTML = '<div style="font-size:12px; color:#aaa; text-align:center; padding:10px;">등록된 사원이 없습니다.</div>';
    return;
  }
  
  keys.forEach(key => {
    const user = userAccountsCache[key];
    const div = document.createElement('div');
    div.className = 'id-item';
    
    const currentPwStatus = user.pw === "" ? "🔑 미등록 (최초 입력 대기 상태)" : `비밀번호: ${user.pw}`;
    
    div.innerHTML = `
      <div class="id-item-info">
        <strong>${escapeHtml(user.empId)}</strong> (${escapeHtml(user.empName || '미지정')})<br>
        <span style="font-size:11px; color:#8b6df8; font-weight:600;">${escapeHtml(currentPwStatus)}</span>
      </div>
      <div class="id-item-actions">
        <button class="id-pw-reset-btn" onclick="resetEmployeePassword('${user.empId}')">PW초기화</button>
        <button class="id-del-btn" onclick="deleteEmployeeAccount('${user.empId}')">삭제</button>
      </div>
    `;
    container.appendChild(div);
  });
}
