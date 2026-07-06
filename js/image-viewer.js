/* =========================================================
   전체화면 확대보기 전용 기능 함수
========================================================= */
function openFullscreenImage(src) {
  if(!src) return;
  document.getElementById('fullscreenImageTarget').src = src;
  document.getElementById('fullscreenImageViewer').classList.remove('hidden');
}
function closeFullscreenImage() {
  document.getElementById('fullscreenImageViewer').classList.add('hidden');
  document.getElementById('fullscreenImageTarget').src = '';
}
