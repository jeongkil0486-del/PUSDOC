/* =========================================================
   카테고리 제어 파트
========================================================= */
let editingCategoryId = null;

function handleCategoryTypeSelectChange(value) {
  const noticeArea = document.getElementById('grievanceNoticeArea');
  if(value === 'grievance') {
    noticeArea.classList.remove('hidden');
    document.getElementById('categoryNameInput').value = "고충 접수처";
  } else {
    noticeArea.classList.add('hidden');
  }
}

function openAddCategoryModal() {
  editingCategoryId = null;
  document.getElementById('categoryModalTitle').textContent = '➕ 새 항목 추가';
  document.getElementById('categoryNameInput').value = '';
  document.getElementById('categoryTypeSelect').disabled = false;
  document.getElementById('categoryTypeSelect').value = 'board';
  document.getElementById('grievanceNoticeArea').classList.add('hidden');
  document.getElementById('categoryModal').classList.remove('hidden');
}

function openEditCategoryModal(id) {
  editingCategoryId = id;
  document.getElementById('categoryModalTitle').textContent = '✏️ 항목 이름 수정';
  document.getElementById('categoryNameInput').value = categoriesCache[id].name;
  document.getElementById('categoryTypeSelect').value = categoriesCache[id].type;
  document.getElementById('categoryTypeSelect').disabled = true;
  document.getElementById('grievanceNoticeArea').classList.add('hidden');
  document.getElementById('categoryModal').classList.remove('hidden');
}

function closeCategoryModal() {
  document.getElementById('categoryModal').classList.add('hidden');
}

function saveCategory() {
  const name = document.getElementById('categoryNameInput').value.trim();
  const type = document.getElementById('categoryTypeSelect').value;
  if(!name) { alert('이름을 입력해주세요.'); return; }

  if(editingCategoryId) {
    categoriesRef.child(editingCategoryId).update({ name: name });
  } else {
    const newId = 'cat_' + Date.now();
    let icon = '📁';
    if(type === 'board') icon = '📝';
    if(type === 'schedule') icon = '📅';
    if(type === 'briefing') icon = '🛫';
    if(type === 'link') icon = '🔗';
    if(type === 'grievance') icon = '🔒';
    const order = Object.keys(categoriesCache).length + 1;
    
    const saveData = { name, type, icon, order };
    if(type === 'grievance') {
      saveData.description = "요청 및 고충 접수";
    }
    categoriesRef.child(newId).set(saveData);
  }
  closeCategoryModal();
}

function moveCategoryOrder(id, direction) {
  const sorted = Object.keys(categoriesCache).sort((a,b) => (categoriesCache[a].order||0) - (categoriesCache[b].order||0));
  const idx = sorted.indexOf(id);
  const swapIdx = idx + direction;
  if(swapIdx < 0 || swapIdx >= sorted.length) return;

  const newOrders = {};
  sorted.forEach((k, i) => { newOrders[k] = i + 1; });
  newOrders[sorted[idx]]     = swapIdx + 1;
  newOrders[sorted[swapIdx]] = idx + 1;

  sorted.forEach(k => { categoriesCache[k].order = newOrders[k]; });
  sorted.forEach(k => { categoriesRef.child(k).update({ order: newOrders[k] }); });

  renderAdminAll();
  renderUserMenu();
}

function deleteCategory(id) {
  if(!confirm('이 항목을 삭제하시겠습니까? 내부 데이터와 파일정보도 전부 함께 삭제됩니다.')) return;
  categoriesRef.child(id).remove();
  dataRef.child(id).remove();
  if(currentCategory === id) showMenu();
}
