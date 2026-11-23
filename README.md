# 🤿 선데이프리다이빙 앱 (PWA)

선데이프리다이빙 수강생과 버디를 위한 **아이폰 우선 웹앱**입니다.
숨참기(CO2·O2) 훈련 타이머, 수업일정, 버디 찾기 세 가지로 이루어져 있습니다.

- 빌드 도구 없이 **정적 파일만으로 동작**합니다. (HTML/CSS/JS)
- 아이폰 사파리에서 **홈 화면에 추가**하면 네이티브 앱처럼 전체 화면으로 열립니다.
- Supabase를 연결하면 수업일정과 버디 글이 **모든 기기에서 공유**됩니다.
- 연결하지 않아도 **로컬 체험 모드**로 바로 사용해 볼 수 있습니다.

---

## 1. 파일 구성

```
sunday-freediving-app/
├── index.html              앱 화면 (3개 탭 + 타이머 + 시트)
├── styles.css              iOS 스타일 디자인 (라이트/다크 자동)
├── app.js                  모든 기능 (테이블·타이머·캘린더·버디·관리자)
├── config.js               ⭐ Supabase 주소/키, 관리자 이메일 설정
├── manifest.webmanifest    PWA 매니페스트 (이름, 아이콘, 테마)
├── sw.js                   서비스 워커 (오프라인 캐시)
├── icons/
│   ├── icon-192.png
│   ├── icon-512.png
│   ├── icon-1024.png       (앱스토어용 원본)
│   ├── icon-maskable-512.png
│   ├── apple-touch-icon.png
│   ├── favicon-32.png
│   └── splash-*.png        아이폰 실행 화면 (6종)
├── tools/
│   └── make_icons.py       아이콘·스플래시 재생성 스크립트
├── supabase/
│   └── schema.sql          테이블 + 보안 정책(RLS) SQL
└── README.md
```

---

## 2. 지금 바로 켜 보기 (로컬 체험 모드)

`config.js`가 비어 있으면 자동으로 **로컬 체험 모드**로 실행됩니다.
샘플 수업일정과 버디 글이 들어 있고, 모든 데이터는 **그 기기의 브라우저 저장소(localStorage)** 에만 저장됩니다.

```bash
cd sunday-freediving-app
python3 -m http.server 8000
```

브라우저에서 `http://localhost:8000` 을 엽니다.
(파일을 더블클릭해 `file://`로 열어도 화면은 보이지만, 서비스 워커·홈 화면 추가는 http/https에서만 동작합니다.)

**관리자 화면 미리 보기**
1. 오른쪽 위 **설정(슬라이더) 버튼**을 누릅니다.
2. 체험용 PIN `0619` 를 입력합니다.
3. 일정 탭에 **+ 버튼**이 생기고, 각 수업 카드에 수정/삭제 버튼이 나타납니다.

> 체험 모드에서는 상단에 `체험 모드` 배지가 표시됩니다.
> 체험 데이터를 지우려면 브라우저 개발자 도구 콘솔에서 `localStorage.clear()` 후 새로고침하세요.

아이폰에서 같은 Wi-Fi로 `http://<컴퓨터 IP>:8000` 을 열어 볼 수도 있지만,
이 경우 HTTPS가 아니라서 **홈 화면 추가·오프라인 설치는 동작하지 않습니다.** 실제 사용은 4장의 배포를 이용하세요.

---

## 3. Supabase 5분 세팅 (모든 기기에서 공유하기)

### 3-1. 프로젝트 만들기
1. <https://supabase.com> 가입 → **New project**
2. 이름: `sunday-freediving` / DB 비밀번호 저장 / Region: **Northeast Asia (Seoul)**
3. 프로젝트가 준비될 때까지 1~2분 기다립니다.

### 3-2. 테이블·보안 정책 만들기
1. 왼쪽 **SQL Editor** → **New query**
2. `supabase/schema.sql` 내용을 **전부 복사해 붙여넣기** → **Run**
3. `Success. No rows returned` 가 나오면 완료입니다.

이 SQL이 만드는 것:

| 테이블 | 용도 | 읽기 | 쓰기 |
|---|---|---|---|
| `schedules` | 수업일정 | 누구나 | **관리자만** 추가·수정·삭제 |
| `buddy_posts` | 버디 모집 한 줄 글 | 누구나 | 누구나 작성, 관리자만 삭제 |
| `buddy_comments` | 버디 글 댓글 | 누구나 | 누구나 작성, 관리자만 삭제 |

관리자 판별은 로그인한 계정의 이메일이 `sundayfreediving@gmail.com` 인지로 합니다.
(수업일정을 쓰는 요청은 데이터베이스가 직접 거부하므로, 앱 화면을 우회해도 안전합니다.)

### 3-3. 관리자 계정 만들기
1. **Authentication → Users → Add user → Create new user**
2. Email: `sundayfreediving@gmail.com`
3. Password: 본인만 아는 비밀번호 (8자 이상)
4. **Auto Confirm User** 체크 → **Create user**

> 앱에는 회원가입 화면이 없습니다. 관리자 계정 하나만 만들면 됩니다.
> 권장: **Authentication → Sign In / Providers → Email** 에서
> `Allow new users to sign up` 을 **꺼 두세요.** (외부인이 계정을 만들 수 없게)

### 3-4. 키를 `config.js`에 넣기
**Project Settings → API** 에서 두 값을 복사합니다.

```js
// config.js
window.SFD_CONFIG = {
  SUPABASE_URL: "https://abcdefghijk.supabase.co",   // Project URL
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6...", // anon public 키
  ADMIN_EMAIL: "sundayfreediving@gmail.com",
  LOCAL_ADMIN_PIN: "0619",
  APP_VERSION: "1.0.0"
};
```

저장 후 앱을 새로고침하면:
- 상단의 `체험 모드` 배지가 사라지고
- 설정 버튼 → 이메일/비밀번호 로그인으로 관리자 모드가 열립니다.

> **anon key는 공개되어도 되는 키입니다.** 데이터 보호는 3-2의 RLS 정책이 담당합니다.
> 절대 `service_role` 키를 `config.js`에 넣지 마세요. (그 키는 모든 보안을 우회합니다.)

### 3-5. 잘 되었는지 확인
- 일정 탭에서 수업이 보이는지
- 관리자 로그인 후 + 버튼으로 수업을 하나 추가하고, **다른 기기/시크릿 창**에서도 보이는지
- SQL Editor에서 `select * from public.schedules order by class_date;`

---

## 4. 무료로 배포하기

세 가지 모두 HTTPS 주소를 주고, 비용이 들지 않습니다. 하나만 고르면 됩니다.

### 방법 A. Vercel (가장 간단)
1. 이 폴더를 GitHub 저장소에 올립니다.
2. <https://vercel.com/new> → 저장소 **Import**
3. 설정:
   - Framework Preset: **Other**
   - Build Command: *(비움)*
   - Output Directory: `sunday-freediving-app` (저장소 루트에 이 폴더가 있는 경우)
4. **Deploy** → `https://sunday-freediving.vercel.app` 주소가 나옵니다.

CLI를 쓸 경우:
```bash
cd sunday-freediving-app
npx vercel --prod
```

### 방법 B. Cloudflare Pages
1. <https://dash.cloudflare.com> → **Workers & Pages → Create → Pages**
2. GitHub 연결 후 빌드 설정:
   - Framework preset: **None**
   - Build command: *(비움)*
   - Build output directory: `sunday-freediving-app` (또는 저장소 루트)
3. **Save and Deploy**
4. 폴더를 통째로 끌어다 놓는 **Direct Upload** 방식도 됩니다.

### 방법 C. GitHub Pages
1. 저장소 → **Settings → Pages**
2. Source: **Deploy from a branch** → Branch: `main` / 폴더: `/ (root)`
   (앱 파일이 저장소 루트에 있어야 합니다. `sunday-freediving-app` 폴더째 올렸다면 그 폴더를 루트로 옮기거나 `/docs` 로 이름을 바꿔 지정하세요.)
3. 저장 → 1~2분 뒤 `https://<아이디>.github.io/<저장소>/` 로 열립니다.

모든 경로가 상대 경로(`./`)라서 하위 폴더에 배포해도 그대로 동작합니다.

### 배포 후 꼭 할 일
- 배포 주소를 사파리에서 열고, 5장의 **홈 화면에 추가**를 합니다.
- `config.js`를 고친 뒤에는 **새로고침**만 하면 반영됩니다.
- `styles.css`, `app.js`, `index.html`을 수정해 재배포했다면 `sw.js`의 `VERSION` 값을 올려 주세요.
  그래야 아이폰에 저장된 예전 캐시가 새 파일로 바뀝니다.

```js
// sw.js
const VERSION = "1.0.1";   // 파일을 고칠 때마다 올리기
```

---

## 5. 아이폰 홈 화면에 추가 (앱처럼 쓰기)

1. **사파리**에서 배포 주소를 엽니다. (크롬·인스타그램 브라우저에서는 안 됩니다)
2. 하단 **공유 버튼** → 아래로 스크롤 → **홈 화면에 추가**
3. 이름을 `선데이` 로 확인 → **추가**
4. 홈 화면의 아이콘으로 열면 주소창 없는 전체 화면 앱으로 실행됩니다.

- 상태 표시줄·홈 인디케이터 여백까지 iOS에 맞춰 처리되어 있습니다.
- 실행할 때 잠깐 뜨는 **스플래시 화면**도 아이폰 기종별로 넣어 두었습니다.
- 한 번 열어 두면 비행기 모드에서도 앱 껍데기와 마지막으로 불러온 화면이 열립니다.
  (클라우드 데이터는 새로고침 시 네트워크가 필요합니다.)

---

## 6. 기능 사용법

### 숨참기
- **PB(개인 최고 기록)** 를 `2:30` 또는 `150` 형태로 입력하면 모든 테이블이 다시 계산됩니다.
- **CO2 테이블**: 숨참기 시간은 고정, 휴식이 라운드마다 줄어듭니다. (이산화탄소 내성)
- **O2 테이블**: 휴식은 고정, 숨참기 시간이 라운드마다 늘어납니다. (산소 저항)
- 라운드(3~12), 숨참기 비율(30~90%), 휴식 시작(30초~5분), 증감폭(0~45초)을 조절할 수 있습니다.
- **훈련 시작** → 원형 타이머가 돌아가고, 휴식/숨참기 전환과 마지막 3초에 신호음이 납니다.
- 일시정지 · 건너뛰기 · 리셋이 가능하고, 화면이 자동으로 꺼지지 않도록 유지합니다. (iOS 16.4+)
- 끝까지 마치면 훈련 기록이 기기에 저장됩니다. (최근 40회)

> ⚠️ **안전**: 모든 훈련은 반드시 육상에서, 버디와 함께 하세요. 물속에서는 절대 하지 마세요.

### 수업일정
- 월간 달력에서 수업이 있는 날은 점으로 표시됩니다. 날짜를 누르면 아래에 수업 카드가 나옵니다.
- 카드에는 시간, 장소(K26·잠실·딥스테이션·보홀), 과정(AIDA1~4·트레이닝·투어), 정원, 메모가 표시됩니다.
- **관리자로 로그인하면** 오른쪽 아래 + 버튼과 카드별 수정/삭제 버튼이 나타납니다.
- 정원은 **안내용 숫자**입니다. 앱에서 예약을 받지는 않습니다. (예약은 기존 채널 이용)
- 관리자 화면은 로그인한 사람에게만 보이고, 실제 쓰기도 데이터베이스가 관리자 이메일만 허용합니다.

### 버디 찾기
- 한 줄 글 + 닉네임, 원하면 날짜·장소 태그를 붙여 올립니다.
- 각 글의 **댓글 n** 을 누르면 댓글창이 열리고 바로 답글을 남길 수 있습니다.
- 관리자는 글·댓글을 삭제할 수 있습니다. (신고·정리용)
- 닉네임은 마지막에 쓴 이름이 기억됩니다. 연락처 같은 개인정보는 올리지 않도록 안내해 주세요.

---

## 7. 네이티브 iOS 앱으로 확장하기

지금 구조는 **웹 자산을 그대로 쓰면서** 네이티브 껍데기를 씌우는 방식에 잘 맞습니다.

### 7-1. Capacitor (추천 · 가장 빠름)
웹 코드를 거의 그대로 두고 iOS 앱으로 감쌀 수 있습니다.

```bash
# 1) 준비 (Node.js 필요)
npm init -y
npm install @capacitor/core @capacitor/cli
npx cap init "선데이프리다이빙" "com.sundayfreediving.app" --web-dir=www

# 2) 웹 자산을 www 폴더로 복사
mkdir -p www
cp index.html styles.css app.js config.js manifest.webmanifest sw.js www/
cp -r icons www/

# 3) iOS 플랫폼 추가
npm install @capacitor/ios
npx cap add ios
npx cap sync ios
npx cap open ios
```

Xcode에서:
- **Signing & Capabilities** → Team 선택, Bundle Identifier 확인
- 시뮬레이터 또는 실기기에서 실행
- App Store 배포하려면 **Product → Archive**

Capacitor에서는 앱이 `capacitor://localhost` 로 로드되므로 서비스 워커는 자동으로 건너뜁니다(파일이 앱에 내장되므로 문제없음).
네이티브 기능을 붙이면 앱스토어 심사에도 유리합니다:

```bash
npm install @capacitor/local-notifications @capacitor/push-notifications @capacitor/haptics
```

- 수업 하루 전 **로컬 알림**
- 훈련 시작/종료 **햅틱**
- (선택) Supabase 푸시 알림

### 7-2. SwiftUI + WKWebView (최소 래퍼)
이미 있는 웹앱을 그대로 띄우는 가장 가벼운 방법입니다.

1. Xcode → **iOS App** → SwiftUI
2. 웹 파일을 프로젝트에 넣고(번들 리소스, `Create folder references`)
3. `WKWebView`를 `UIViewRepresentable`로 감싸 `index.html`을 로드
   (`loadFileURL(_:allowingReadAccessTo:)` 사용)
4. `Info.plist`에 `UIViewControllerBasedStatusBarAppearance`, 세로 방향 고정 등 설정

장점은 간단함, 단점은 웹 그대로라 **앱스토어 심사 4.2(최소 기능)** 에서 반려될 수 있습니다.
이 경우 7-1처럼 알림·햅틱·오프라인 오디오 같은 네이티브 기능을 더하세요.

### 7-3. 완전한 SwiftUI 앱
앱이 커지고 푸시·결제·예약까지 붙일 계획이라면 SwiftUI로 다시 쓰는 편이 좋습니다.
- 데이터: **supabase-swift** (`https://github.com/supabase/supabase-swift`)
- 테이블·RLS는 지금 `schema.sql`을 그대로 사용
- 디자인 토큰은 `styles.css`의 색상값을 그대로 옮기면 통일감이 유지됩니다.

### 앱스토어 배포에 필요한 것
- Apple Developer Program (연 $99)
- 앱 아이콘 **1024×1024** (`icons/icon-1024.png` 사용)
- 개인정보처리방침 URL, 스크린샷, 앱 설명
- 버디 게시판이 있는 앱은 **사용자 차단/신고 기능**을 요구받을 수 있습니다. (관리자 삭제로 대응 중이라는 설명 준비)

---

## 8. 자주 겪는 문제

| 증상 | 확인할 것 |
|---|---|
| 상단에 `체험 모드`가 계속 보임 | `config.js`의 URL/키가 비어 있거나 오타. 저장 후 새로고침 |
| 관리자 로그인이 안 됨 | 이메일이 `sundayfreediving@gmail.com` 인지, Auto Confirm 되었는지, Authentication → Email provider가 켜져 있는지 |
| 수업 추가가 "저장하지 못했어요" | `schema.sql`을 실제로 실행했는지, 로그인 계정 이메일이 SQL의 이메일과 같은지 |
| 일정·글이 다른 기기에서 안 보임 | 두 기기가 같은 Supabase 프로젝트를 보고 있는지(`config.js`), 새로고침했는지 |
| 아이폰 아이콘이 예전 디자인 | 홈 화면에서 삭제 후 다시 추가 (아이콘 캐시) |
| 수정한 화면이 그대로 | `sw.js`의 `VERSION`을 올려 재배포. 급하면 홈 화면 앱 삭제 후 재설치 |
| 홈 화면 추가 메뉴가 없음 | 사파리인지 확인 (크롬/인앱 브라우저 불가), HTTPS 주소인지 확인 |
| 화면이 자동으로 꺼짐 | iOS 16.4 미만이거나 저전력 모드. 타이머 화면 안내 문구 확인 |
| 타이머 신호음이 안 남 | 아이폰 **무음 모드**에서는 웹 오디오가 들리지 않을 수 있어요. 벨소리 모드로 바꾸거나 이어폰을 사용하세요. |

---

## 9. 커스터마이징 메모

- **색상**: `styles.css` 맨 위 `:root` 변수 (`--ocean-*`, `--teal`, `--amber`)와 다크 모드 블록
- **앱 이름**: `manifest.webmanifest`의 `name`/`short_name`, `index.html`의 `<title>`·`apple-mobile-web-app-title`
- **관리자 이메일**: `config.js`의 `ADMIN_EMAIL` **그리고** `supabase/schema.sql`의 이메일 두 곳을 함께 변경 후 SQL 재실행
- **체험용 PIN**: `config.js`의 `LOCAL_ADMIN_PIN` (로컬 체험 모드에서만 사용)
- **PB 기본값/테이블 범위**: `app.js`의 `DEFAULT_PREFS`, 스텝퍼 `clamp()` 값
- **아이콘**: `icons/`의 PNG를 같은 파일명으로 교체 (1024px 원본 권장)

---

## 10. 보안·개인정보 체크리스트

- [x] 수업일정 쓰기는 데이터베이스 RLS로 관리자 이메일만 허용
- [x] anon key만 사용 (service_role 키는 앱에 넣지 않음)
- [x] 버디 글·댓글 길이 제한, 장소 값 제한
- [ ] 버디 게시판은 누구나 쓸 수 있으므로 **스팸·욕설 모니터링** 필요 (관리자 삭제)
- [ ] 수강생에게 버디 글에 전화번호·계좌 등 개인정보를 쓰지 않도록 공지
- [ ] Supabase **Authentication → Rate limits** 기본값 유지, 필요 시 CAPTCHA(Turnstile) 추가

---

문의: 선데이프리다이빙 · sundayfreediving@gmail.com
