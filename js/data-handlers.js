/* =========================================================
   데이터 생성 / 삭제 / 수정 비즈니스 핸들러
========================================================= */
async function handleFileUpload(event, catId) {
  const file = event.target.files[0];
  if(!file) return;
  if(!file.name.toLowerCase().endsWith('.pdf')) { alert('PDF 파일만 업로드할 수 있습니다.'); return; }

  const btn = document.getElementById(`btn_${catId}`);
  const status = document.getElementById(`status_${catId}`);
  btn.disabled = true;
  status.textContent = '업로드 중...';

  try {
    const fileUrl = await uploadToR2(file, 'pdf_files', (pct) => {
      status.textContent = `업로드 중... ${pct}%`;
    });
    
    const itemId = 'file_' + Date.now();
    await dataRef.child(catId).child(itemId).set({
      name: file.name,
      url: fileUrl,
      timestamp: Date.now()
    });
    status.textContent = '✅ 완료';
  } catch(e) {
    alert('업로드 오류 발생');
    status.textContent = '❌ 실패';
  } finally {
    btn.disabled = false;
    event.target.value = '';
    setTimeout(() => { status.textContent = ''; }, 3000);
  }
}

let activeEditorCatId = null;
let activeEditorItemId = null;
let attachedImageFile = null;

function previewBoardImage(event) {
  const file = event.target.files[0];
  if(!file) return;
  attachedImageFile = file;
  document.getElementById('boardImgStatus').textContent = file.name;
  const reader = new FileReader();
  reader.onload = e => {
    const img = document.getElementById('boardImgPrev');
    img.src = e.target.result;
    img.classList.remove('hidden');
  };
  reader.readAsDataURL(file);
}

function openBoardEditor(catId, itemId = null) {
  activeEditorCatId = catId;
  activeEditorItemId = itemId;
  attachedImageFile = null;
  const cat = categoriesCache[catId] || {};
  const dateWrap = document.getElementById('briefingDateWrap');
  const dateInput = document.getElementById('briefingDateInput');
  if(dateWrap && dateInput) {
    if(cat.type === 'briefing') {
      dateWrap.classList.remove('hidden');
      const today = new Date();
      dateInput.value = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    } else {
      dateWrap.classList.add('hidden');
      dateInput.value = '';
    }
  }

  document.getElementById('boardImgFile').value = '';
  document.getElementById('boardImgStatus').textContent = '';
  document.getElementById('boardImgPrev').classList.add('hidden');

  if(itemId) {
    const item = dynamicDataCache[catId][itemId];
    document.getElementById('noticeTitleInput').value = item.title;
    document.getElementById('noticeContentInput').value = item.content;
    if(dateInput && item.briefingDateKey) dateInput.value = item.briefingDateKey;
    if(item.imageUrl) {
      const img = document.getElementById('boardImgPrev');
      img.src = item.imageUrl;
      img.classList.remove('hidden');
    }
  } else {
    document.getElementById('noticeTitleInput').value = '';
    document.getElementById('noticeContentInput').value = '';
  }
  document.getElementById('noticeEditorModal').classList.remove('hidden');
}

function closeNoticeEditor() {
  document.getElementById('noticeEditorModal').classList.add('hidden');
}

async function saveBoardItem() {
  const title = document.getElementById('noticeTitleInput').value.trim();
  const content = document.getElementById('noticeContentInput').value.trim();
  if(!title || !content) { alert('제목과 내용을 입력해 주세요.'); return; }

  const confirmBtn = document.querySelector('#noticeEditorModal .modal-confirm');
  confirmBtn.disabled = true;
  confirmBtn.textContent = '저장 중...';

  try {
    let imageUrl = "";
    if(activeEditorItemId && dynamicDataCache[activeEditorCatId][activeEditorItemId].imageUrl) {
      imageUrl = dynamicDataCache[activeEditorCatId][activeEditorItemId].imageUrl;
    }

    if(attachedImageFile) {
      imageUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(attachedImageFile);
      });
    }

    const dateStr = new Date().toLocaleString('ko-KR');
    const cat = categoriesCache[activeEditorCatId] || {};
    const briefingDateInput = document.getElementById('briefingDateInput');
    const briefingDateKey = cat.type === 'briefing' && briefingDateInput ? briefingDateInput.value : '';
    if(cat.type === 'briefing' && !briefingDateKey) { alert('브리핑 적용 날짜를 선택해 주세요.'); return; }
    const savePayload = { title, content, date: dateStr, imageUrl };
    if(cat.type === 'briefing') savePayload.briefingDateKey = briefingDateKey;

    if(activeEditorItemId) {
      await dataRef.child(activeEditorCatId).child(activeEditorItemId).update(savePayload);
    } else {
      const newItemId = 'board_' + Date.now();
      await dataRef.child(activeEditorCatId).child(newItemId).set({
        ...savePayload, timestamp: Date.now()
      });
    }
    closeNoticeEditor();
  } catch(e) {
    alert('글 저장 중 오류가 발생했습니다.');
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.textContent = '저장';
  }
}

async function deleteDataItem(catId, itemId) {
  if(!confirm('이 항목을 정말 삭제하시겠습니까?')) return;
  await dataRef.child(catId).child(itemId).remove();
}

let activeLinkEditorCatId = null;

function openLinkEditor(catId) {
  activeLinkEditorCatId = catId;
  document.getElementById('linkTitleInput').value = '';
  document.getElementById('linkUrlInput').value = '';
  document.getElementById('linkEditorModal').classList.remove('hidden');
}

function closeLinkEditor() {
  document.getElementById('linkEditorModal').classList.add('hidden');
}

async function saveLinkItem() {
  const title = document.getElementById('linkTitleInput').value.trim();
  const url   = document.getElementById('linkUrlInput').value.trim();
  if(!title || !url) { alert('제목과 URL을 모두 입력해 주세요.'); return; }
  if(!/^https?:\/\//i.test(url)) { alert('URL은 http:// 또는 https:// 로 시작해야 합니다.'); return; }

  const confirmBtn = document.querySelector('#linkEditorModal .modal-confirm');
  confirmBtn.disabled = true;
  try {
    const newId = 'link_' + Date.now();
    await dataRef.child(activeLinkEditorCatId).child(newId).set({
      title, url, timestamp: Date.now()
    });
    closeLinkEditor();
  } catch(e) {
    alert('링크 저장 중 오류가 발생했습니다.');
  } finally {
    confirmBtn.disabled = false;
  }
}
