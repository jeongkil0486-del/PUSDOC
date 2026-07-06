/* =========================================================
   R2 스토리지 실제 파일 업로드 처리함수
========================================================= */
async function uploadToR2(file, folderPath, onProgress) {
  const id = Date.now() + '_' + Math.random().toString(36).slice(2,8);
  const extension = file.name.split('.').pop();
  const key = folderPath + '/' + id + '.' + extension;

  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', WORKER_URL + '/' + key);
    xhr.setRequestHeader('x-api-key', UPLOAD_SECRET);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.upload.onprogress = (e) => {
      if (onProgress && e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error('업로드 실패'));
    };
    xhr.onerror = () => reject(new Error('네트워크 오류'));
    xhr.send(file);
  });

  return R2_PUBLIC_BASE + '/' + key;
}
