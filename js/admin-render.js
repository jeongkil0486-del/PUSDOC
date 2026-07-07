/* =========================================================
   관리자 UI 렌더링 엔진
========================================================= */

/* 카테고리 아이콘 반환 - type 기준으로 override
   briefing 타입은 DB에 저장된 구버전 🛫 아이콘을 무시하고 📋 반환 */
function getCategoryIcon(cat) {
  if (!cat) return '📁';
  if (cat.type === 'briefing') return '📋';
  return cat.icon || '📁';
}

function toggleMinimizeSection(catId) {
  isFileListMinimizedMap[catId] = !isFileListMinimizedMap[catId];
  renderAdminAll();
}

function unlockGrievanceInspection(catId) {
  const pw = prompt("🔑 고충 접수내역을 조회하려면 CM 확인 비밀번호를 입력하세요.");
  if(!pw) return;
  
  // 고충 접수 조회 비밀번호 skdmlwlq12@@ 로 완벽 교체 완료
  if(pw !== "skdmlwlq12@@") {
    alert("❌ 비밀번호가 올바르지 않습니다. CM만 확인 가능합니다.");
    return;
  }
  
  const listWrap = document.getElementById(`grivContentArea_${catId}`);
  if(!listWrap) return;
  
  const itemsData = dynamicDataCache[catId] || {};
  const items = Object.keys(itemsData).map(k => ({id: k, ...itemsData[k]})).sort((a,b) => b.timestamp - a.timestamp);
  
  if(items.length === 0) {
    listWrap.innerHTML = '<li class="empty-msg">접수된 고충 내역이 없습니다.</li>';
    return;
  }
  
  listWrap.innerHTML = items.map(item => {
    if(!item.isAdminRead) {
      dataRef.child(catId).child(item.id).update({ isAdminRead: true });
    }
    
    return `
      <li class="file-item" style="display:block; background:#fff; text-align:left; border-left: 4px solid #de5246;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; border-bottom:1px dashed #eef0fa; padding-bottom:6px;">
          <span style="font-weight:700; color:#de5246; font-size:13px;">👤 접수자: ${escapeHtml(item.writerName)} (${escapeHtml(item.writerId)})</span>
          <span style="font-size:11px; color:#aaa;">등록시간: ${item.date}</span>
        </div>
        <div style="font-weight:700; font-size:14px; color:#2b2f3e; margin-bottom:6px;">제목: ${escapeHtml(item.title)}</div>
        <div style="font-size:13px; color:#444; white-space:pre-wrap; background:#f8f9fd; padding:10px; border-radius:6px; border:1px solid #eef0fa; margin-bottom:8px; line-height:1.5;">${escapeHtml(item.content)}</div>
        <div style="text-align:right;">
          <button class="del-btn" style="margin-left:0; padding:4px 10px;" onclick="deleteDataItem('${catId}','${item.id}')">내역 파기(삭제)</button>
        </div>
      </li>
    `;
  }).join('');
}

function renderAdminAll() {
  const container = document.getElementById('adminSectionsContainer');
  if(!container) return;
  container.innerHTML = '';

  const sortedKeys = Object.keys(categoriesCache).sort((a,b) => (categoriesCache[a].order || 0) - (categoriesCache[b].order || 0));

  if(sortedKeys.length === 0) {
    container.innerHTML = '<div class="empty-msg">항목이 없습니다. 우측 상단에서 새 항목을 추가해 주세요.</div>';
    return;
  }

  sortedKeys.forEach((catId, idx) => {
    const cat = categoriesCache[catId];
    
    if(isFileListMinimizedMap[catId] === undefined) {
      isFileListMinimizedMap[catId] = true; 
    }

    const section = document.createElement('div');
    section.className = 'category-section';

    const isFirst = idx === 0;
    const isLast  = idx === sortedKeys.length - 1;

    let alertBadgeHtml = "";
    if(cat.type === 'grievance') {
      section.style.borderLeft = "5px solid #de5246";
      const itemsData = dynamicDataCache[catId] || {};
      const unreadGrivCount = Object.keys(itemsData).filter(k => !itemsData[k].isAdminRead).length;
      if(unreadGrivCount > 0) {
        alertBadgeHtml = `<span class="notice-badge" style="margin-left:6px; background:linear-gradient(135deg,#ff4b4b,#de5246);">${unreadGrivCount}</span>`;
      }
    }

    section.innerHTML = `
      <div class="category-title-wrap">
        <h3>
          ${getCategoryIcon(cat)} <span>${escapeHtml(cat.name)}</span> ${alertBadgeHtml}
          <span class="edit-title-icon" onclick="openEditCategoryModal('${catId}')">✏️</span>
        </h3>
        <div style="display:flex; gap:6px; align-items:center;">
          <button class="order-btn" onclick="moveCategoryOrder('${catId}',-1)" ${isFirst?'disabled':''}>▲</button>
          <button class="order-btn" onclick="moveCategoryOrder('${catId}',1)"  ${isLast ?'disabled':''}>▼</button>
          ${(cat.type !== 'schedule' && cat.type !== 'grievance') ? `<button class="toggle-minimize-btn" onclick="toggleMinimizeSection('${catId}')">${isFileListMinimizedMap[catId] ? '▶ 목록 펼치기' : '▼ 목록 접기'}</button>` : ''}
          <button class="delete-category-btn" onclick="deleteCategory('${catId}')">❌ 항목 삭제</button>
        </div>
      </div>
    `;

    if(cat.type === 'schedule') {
      const schDiv = document.createElement('div');
      schDiv.className = 'empty-msg';
      schDiv.style.background = '#f8f9fd';
      schDiv.style.textAlign = 'left';
      schDiv.style.color = '#4e65df';
      schDiv.innerHTML = `📅 <strong>근무 스케줄 관리 안내:</strong><br>본 항목은 상단에 위치한 '스마트 엑셀 스케줄 관리 엔진' 업로더와 자동 맵핑되는 고유 시스템입니다. 수정 및 파일 변경은 상단 업로더를 이용하세요.`;
      section.appendChild(schDiv);
      container.appendChild(section);
      return;
    }

    if(cat.type === 'grievance') {
      const grivData = dynamicDataCache[catId] || {};
      const totalCount = Object.keys(grivData).length;
      
      const grivBox = document.createElement('div');
      grivBox.innerHTML = `
        <div style="background:#fff1f1; border:1px dashed #ff8a8a; border-radius:10px; padding:14px; margin-bottom:12px; text-align:left;">
          <div style="font-size:13px; font-weight:700; color:#de5246; margin-bottom:4px;">🔒 고충 접수 정보 보안함</div>
          <div style="font-size:12px; color:#444; font-weight:600; margin-bottom:8px;">부가설명: "${escapeHtml(cat.description || '요청 및 고충 접수')}"</div>
          <div style="font-size:11px; color:#666; line-height:1.5;">본 항목은 직원 전용 투고함입니다. 비밀번호 인증 전까지는 화면 코드와 캐시에 작성자 정보, 접수 내용이 노출되지 않고 완전 blind 처리됩니다.</div>
        </div>
        <div style="background:#f4f6fb; padding:18px; border-radius:12px; text-align:center; border:1px solid #eef0fa;">
          <div style="font-size:15px; font-weight:800; color:#2b2f3e; margin-bottom:12px;">📊 접수 현황 : <span style="color:#de5246;">${totalCount}건 접수되었습니다</span></div>
          <button class="upload-btn" style="background:linear-gradient(135deg,#6d83ff,#4e65df); margin:0 auto;" onclick="unlockGrievanceInspection('${catId}')">🔑 비밀번호 치고 내역 조회하기</button>
        </div>
        <ul id="grivContentArea_${catId}" class="file-list" style="margin-top:14px; max-height:400px; overflow-y:auto;"></ul>
      `;
      section.appendChild(grivBox);
      container.appendChild(section);
      return;
    }

    if(cat.type === 'briefing') {
      container.appendChild(section);
      if(isFileListMinimizedMap[catId]) {
        const minimInfo = document.createElement('div');
        minimInfo.className = 'empty-msg';
        minimInfo.style.background = '#f1f5f9';
        minimInfo.style.borderRadius = '8px';
        minimInfo.textContent = '목록이 최소화 상태입니다. 펼치기 버튼을 누르면 전체 리스트를 조회합니다.';
        section.appendChild(minimInfo);
        return;
      }
      if(typeof renderAdminBriefingSection === 'function') {
        try { renderAdminBriefingSection(section, catId); }
        catch (err) {
          console.error('Briefing admin render failed:', err);
          section.insertAdjacentHTML('beforeend', '<div class="empty-msg" style="background:#fff5f5; color:#de5246; text-align:left;">브리핑일지 화면을 불러오는 중 오류가 발생했습니다. 콘솔 오류를 확인해 주세요.</div>');
        }
      } else {
        section.insertAdjacentHTML('beforeend', '<div class="empty-msg" style="background:#f8f9fd; text-align:left;">브리핑일지 UI를 불러오는 중입니다. 잠시 후 자동으로 다시 표시됩니다.</div>');
      }
      return;
    }

    const row = document.createElement('div');
    row.className = 'upload-row';

    if(cat.type === 'board') {
      row.innerHTML = `<button class="upload-btn" onclick="openBoardEditor('${catId}')">새 글 작성</button>`;
    } else if(cat.type === 'link') {
      row.innerHTML = `<button class="upload-btn" style="background:linear-gradient(135deg,#ff9f43,#ff793f);" onclick="openLinkEditor('${catId}')">🔗 링크 추가</button>`;
    } else {
      row.innerHTML = `
        <button class="upload-btn" id="btn_${catId}" onclick="document.getElementById('file_${catId}').click()">PDF 업로드</button>
        <input type="file" id="file_${catId}" accept="application/pdf" onchange="handleFileUpload(event,'${catId}')">
        <span class="upload-status" id="status_${catId}"></span>
      `;
    }
    section.appendChild(row);

    const ul = document.createElement('ul');
    ul.className = 'file-list';
    
    if(isFileListMinimizedMap[catId]) {
      const minimInfo = document.createElement('div');
      minimInfo.className = 'empty-msg';
      minimInfo.style.background = '#f1f5f9';
      minimInfo.style.borderRadius = '8px';
      minimInfo.textContent = '목록이 최소화 상태입니다. 펼치기 버튼을 누르면 전체 리스트를 조회합니다.';
      section.appendChild(ul);
      section.appendChild(minimInfo);
      container.appendChild(section);
      return;
    }

    const itemsData = dynamicDataCache[catId] || {};
    const items = Object.keys(itemsData).map(k => ({id: k, ...itemsData[k]})).sort((a,b) => b.timestamp - a.timestamp);

    if(items.length === 0) {
      ul.innerHTML = '<li class="empty-msg">등록된 내용이 없습니다.</li>';
      section.appendChild(ul);
      container.appendChild(section);
      return;
    }

    items.forEach(item => {
      const li = document.createElement('li');
      li.className = 'file-item';
      if(cat.type === 'board') {
        let imgPreviewHtml = "";
        if(item.imageUrl) {
          imgPreviewHtml = `<div style="margin-top:10px; display:block;"><img src="${item.imageUrl}" style="max-width:200px; max-height:140px; border-radius:6px; border:1px solid #ddd; box-shadow:0 3px 10px rgba(0,0,0,0.1); object-fit:cover; cursor:zoom-in;" onclick="openFullscreenImage('${item.imageUrl}'); event.stopPropagation();"></div>`;
        }
        
        li.innerHTML = `
          <div class="fname" style="cursor:pointer; display:block; width:100%;" onclick="viewBoardItem('${catId}','${item.id}')">
            <div>
              📝 <span class="label" style="font-weight:600; font-size:14px; color:#2b2f3e;">${escapeHtml(item.title)}</span>
              <span style="color:#aaa; font-size:11px; margin-left:8px;">${item.date}</span>
            </div>
            ${imgPreviewHtml}
          </div>
          <div style="display:flex; gap:6px; flex-shrink:0;">
            <button class="del-btn" style="background:#6d83ff;" onclick="openBoardEditor('${catId}','${item.id}'); event.stopPropagation();">수정</button>
            <button class="del-btn" onclick="deleteDataItem('${catId}','${item.id}'); event.stopPropagation();">삭제</button>
          </div>
        `;
      } else if(cat.type === 'link') {
        li.innerHTML = `
          <div class="fname">🔗 <span class="label">${escapeHtml(item.title)}</span> <span style="font-size:11px; color:#aaa;">${escapeHtml(item.url)}</span></div>
          <button class="del-btn" onclick="deleteDataItem('${catId}','${item.id}')">삭제</button>
        `;
      } else {
        li.innerHTML = `
          <div class="fname">📄 <span class="label">${escapeHtml(item.name)}</span></div>
          <button class="del-btn" onclick="deleteDataItem('${catId}','${item.id}')">삭제</button>
        `;
      }
      ul.appendChild(li);
    });

    section.appendChild(ul);
    container.appendChild(section);
  });
}

function renderUserMenu() {
  const container = document.getElementById('userMenuCardContainer');
  if(!container) return;
  container.innerHTML = '';

  const sortedKeys = Object.keys(categoriesCache).sort((a,b) => (categoriesCache[a].order || 0) - (categoriesCache[b].order || 0));
  const myEmpId = (localStorage.getItem(LOGGED_IN_ID_KEY) || '').trim();

  sortedKeys.forEach(catId => {
    const cat = categoriesCache[catId];
    const card = document.createElement('div');
    card.className = 'menu-card';
    card.setAttribute('onclick', `openCategory('${catId}')`);

    let unreadCount = 0;
    // 고충접수 회색 가이드 문구 간결화 교체 완료
    let subDescription = cat.description ||
      (cat.type==='board' ? '안내글 및 게시사항 확인' :
       cat.type==='schedule' ? '달력식 실시간 개인 근무 확인' :
       cat.type==='briefing' ? '브리핑 내용 확인 및 서명' :
       cat.type==='link' ? '관련 링크 바로가기' :
       '자료실 및 파일 확인');
    
    if (cat.type === 'schedule') {
      if (myEmpId) unreadCount = parseInt(localStorage.getItem(`unreadcount_${myEmpId}`) || '0', 10);
    } else if(cat.type === 'grievance') {
      subDescription = cat.description || "요청 및 고충 접수";
      const itemsData = dynamicDataCache[catId] || {};
      unreadCount = Object.keys(itemsData).filter(k => !itemsData[k].isAdminRead).length;
    } else {
      const lastSeen = parseInt(localStorage.getItem(`cat_lastseen_${catId}`) || '0', 10);
      const itemsData = dynamicDataCache[catId] || {};
      unreadCount = Object.keys(itemsData).filter(k => (itemsData[k].timestamp || 0) > lastSeen).length;
    }

    let badgeHtml = '';
    if (unreadCount > 0) {
      const displayCount = unreadCount > 99 ? '99+' : String(unreadCount);
      badgeHtml = `<span class="notice-badge" id="menuBadge_${catId}">${displayCount}</span>`;
    } else {
      badgeHtml = `<span class="notice-badge hidden" id="menuBadge_${catId}">0</span>`;
    }

    card.innerHTML = `
      <div class="icon" style="${catId==='standard'?'background:linear-gradient(135deg,#34c98f,#6de0b8);':''} ${catId==='schedule'?'background:linear-gradient(135deg,#8b6df8,#a78bfa);':''} ${cat.type==='grievance'?'background:linear-gradient(135deg,#ff7675,#de5246);':''}">${getCategoryIcon(cat)}${badgeHtml}</div>
      <div class="text">
        <h4>${escapeHtml(cat.name)}</h4>
        <p>${subDescription}</p>
      </div>
    `;
    container.appendChild(card);
  });
}
