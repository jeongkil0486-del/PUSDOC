# PUS DOC 분리본

기존 index(3).html을 기능별 파일로 분리한 버전입니다.

## 구조

- index.html: 화면 HTML 뼈대와 외부 스크립트 로딩
- css/style.css: 기존 <style> 전체 분리
- js/firebase-init.js: Firebase 설정, DB ref, 실시간 리스너, 기본 카테고리
- js/accounts.js: 직원 ID 생성/삭제/PW 초기화
- js/image-viewer.js: 이미지 전체화면 확대보기
- js/categories.js: 카테고리 추가/수정/삭제/순서변경
- js/storage-r2.js: R2 업로드 함수
- js/schedule.js: 근무표 양식 다운로드/업로드/삭제
- js/admin-render.js: 관리자 화면 렌더링
- js/data-handlers.js: 게시글/파일/링크/고충 저장·삭제
- js/user-auth.js: 직원 화면, 로그인/로그아웃, 푸시, 달력 표시
- firebase-messaging-sw.js: 푸시 백그라운드 수신용 서비스워커. 루트에 유지해야 합니다.

## 업로드 방법

압축을 풀고 전체 폴더 구조 그대로 GitHub/Vercel에 업로드하세요.
기존 index.html만 교체하는 방식이 아니라 css 폴더와 js 폴더도 함께 올라가야 합니다.
