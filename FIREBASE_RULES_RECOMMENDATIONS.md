# Firebase Realtime Database Rules 권장안

이 저장소에는 배포된 RTDB Rules 파일이 없다. 아래 내용은 **배포하지 않은 권장안**이며, 실제 Firebase Authentication 또는 서버가 검증한 custom claims 도입 후 프로젝트 환경에 맞게 적용해야 한다.

현재 앱은 클라이언트 상수와 `localStorage`로 관리자/직원을 구분한다. 이 값은 Rules의 신뢰 가능한 인증 정보가 아니므로, 현 구조만으로는 직원별 읽기 제한을 안전하게 강제할 수 없다. 아래 예시는 인증 토큰에 `admin: true` 또는 `empId: "사번"` custom claim이 있다는 전제다.

## 필요한 권한

- 직원
  - `briefingConfirmationIndex/{본인사번}` 읽기
  - `briefingConfirmationIndex/{본인사번}/{dateKey}` 쓰기
  - `briefingConfirmations/{dateKey}/{본인사번}` 읽기/쓰기
  - `briefingTemplateContent` 읽기
  - 일반 `dynamicData/{catId}` 읽기
  - 고충 카테고리는 `writerId == 본인사번` 쿼리로 본인 글만 읽고 본인 글만 작성/수정
  - `noticeMetadata` 읽기
- 관리자
  - 위 경로 전체 읽기/쓰기
  - `briefingTemplate`, `briefingTemplateMapping`, `briefingTemplateContent` 쓰기
  - 월별 `briefingConfirmations` 읽기
  - 고충 전체 읽기

## Rules 예시

프로젝트의 기존 Rules와 병합하기 전에 Firebase Emulator에서 검증해야 한다.

```json
{
  "rules": {
    "briefingConfirmationIndex": {
      "$empId": {
        ".read": "auth != null && (auth.token.admin === true || auth.token.empId === $empId)",
        "$dateKey": {
          ".write": "auth != null && (auth.token.admin === true || auth.token.empId === $empId)",
          ".validate": "!newData.exists() || (newData.hasChildren(['confirmed', 'signedAtTs']) && newData.child('confirmed').val() === true && newData.child('signedAtTs').isNumber())"
        }
      }
    },
    "briefingConfirmations": {
      "$dateKey": {
        "$empId": {
          ".read": "auth != null && (auth.token.admin === true || auth.token.empId === $empId)",
          ".write": "auth != null && (auth.token.admin === true || auth.token.empId === $empId)"
        }
      }
    },
    "briefingTemplateContent": {
      ".read": "auth != null",
      ".write": "auth != null && auth.token.admin === true"
    },
    "briefingTemplate": {
      ".read": "auth != null && auth.token.admin === true",
      ".write": "auth != null && auth.token.admin === true"
    },
    "briefingTemplateMapping": {
      ".read": "auth != null && auth.token.admin === true",
      ".write": "auth != null && auth.token.admin === true"
    },
    "noticeMetadata": {
      ".read": "auth != null",
      ".write": "auth != null && auth.token.admin === true"
    },
    "dynamicData": {
      "$catId": {
        ".indexOn": ["writerId"],
        ".read": "auth != null && (root.child('categories').child($catId).child('type').val() !== 'grievance' || auth.token.admin === true || (query.orderByChild === 'writerId' && query.equalTo === auth.token.empId))",
        "$itemId": {
          ".write": "auth != null && (auth.token.admin === true || (root.child('categories').child($catId).child('type').val() === 'grievance' && ((!data.exists() && newData.child('writerId').val() === auth.token.empId) || (data.child('writerId').val() === auth.token.empId && newData.child('writerId').val() === auth.token.empId))))"
        }
      }
    }
  }
}
```

## 주의 사항

- 직원이 `briefingConfirmationIndex` 루트나 다른 사번의 자식 경로를 읽을 수 없어야 한다.
- multi-location 서명 저장은 `briefingConfirmations`와 `briefingConfirmationIndex` 양쪽 쓰기 권한이 모두 허용되어야 성공한다.
- 고충 쿼리 제한은 클라이언트 필터만으로 보안이 되지 않는다. Rules가 `orderByChild == writerId`, `equalTo == auth.token.empId`를 함께 요구해야 한다.
- `writerId` 쿼리 비용을 줄이기 위해 고충이 아닌 카테고리에도 적용되는 현재 구조에서는 `dynamicData/$catId/.indexOn: ["writerId"]`가 필요하다. 카테고리별 Rules를 분리할 수 있다면 고충 카테고리에만 설정한다.
- 관리자 여부를 프론트의 `ADMIN_ID`, 비밀번호 또는 `localStorage`로 판정해서는 안 된다.

공식 참고 자료:

- [쿼리 기반 Realtime Database Rules](https://firebase.google.com/docs/database/security/rules-conditions)
- [Realtime Database `.indexOn`](https://firebase.google.com/docs/database/security/indexing-data)
- [Firebase Authentication custom claims](https://firebase.google.com/docs/auth/admin/custom-claims)
