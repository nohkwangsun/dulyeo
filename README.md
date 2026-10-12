# Dulyeo

영어 스크립트(마크다운/클립보드 텍스트)를 **폰 안에서** mp3로 만들고, 같은 앱에서 바로 들을 수 있는 독립 앱입니다.
서버가 없습니다. 출퇴근길에 화면을 끄고 음악 앱처럼 듣는 것이 목표입니다.

## 동작 방식

```
스크립트 붙여넣기 → 문장 분리 → 음성 엔진 → 반복·간격을 넣어 mp3 1개로 합성
→ 폰(IndexedDB)에 저장 → <audio> + 미디어 세션(알림/잠금화면 컨트롤)으로 재생
```

- **반복/간격은 mp3 안에 구워 넣습니다.** 화면을 꺼도 JS 타이머에 의존하지 않아서 끊기지 않습니다.
- **속도 조절**은 재생 중 `playbackRate`(0.5~1.5배, 음높이 유지)로 합니다.
- **문장/문단 이동**은 알림·잠금화면·이어폰의 이전/다음 버튼에 연결됩니다.
- 한 번 만든 트랙은 폰에 저장되어 오프라인(지하철)에서도 재생됩니다.
- **끝나면 다음 트랙이 자동으로 이어집니다**(라이브러리 순서). 출퇴근길에 여러 스크립트를 연달아 들을 수 있습니다.
- 라이브러리에서 **편집**을 누르면 원본 스크립트가 만들기 화면으로 돌아옵니다. 반복·간격을 바꿔 다시 만들 때 쓰세요.
- 문장별 음성은 기기에 캐시되므로, 반복 횟수·간격만 바꿔 다시 만들면 다시 합성하지 않고 즉시 끝납니다.

## 음성 엔진 (둘 중 선택)

| | Azure Speech 무료 구간 | 안드로이드 내장 음성 |
|---|---|---|
| 음질 | 최상(신경망) | 기기/설치한 음성에 따라 다름 |
| 만들 때 인터넷 | 필요 | 불필요 |
| 계정/키 | Azure 계정 + Speech 키 | 없음 |
| 비용 | 월 50만 자까지 무료(1시간 분량 ≈ 5만 자) | 무료 |
| 사용 가능한 곳 | 앱(APK)·브라우저* | **앱(APK)만** |

\* 브라우저(PWA)에서 Azure를 직접 호출하는 것은 Azure 쪽 CORS 허용 여부를 확인하지 못했습니다. 앱(APK)에서는 이 문제가 없습니다.

내장 음성은 안드로이드 설정 > 텍스트 음성 변환(Google 음성 엔진)에서 영어 고품질 음성을 내려받으면 좋아집니다. 앱의 "음성 설치/설정 열기" 버튼이 그 화면을 엽니다.

### Azure 키 발급
1. [Azure 포털](https://portal.azure.com)에서 계정을 만들고 **Speech** 리소스를 만듭니다. 가격 책정 계층은 **Free (F0)** 를 고르세요.
2. 리소스의 **키 및 엔드포인트**에서 키와 지역(region, 예: `koreacentral`)을 복사해 앱의 "Azure 키 설정"에 입력합니다. 키는 이 기기에만 저장됩니다.

## APK 자동 빌드 (GitHub Actions)

푸시할 때마다 GitHub가 APK를 만들어 줍니다. 폰에서는 **링크 하나로 설치/업데이트**하면 됩니다.

| 언제 | 결과 |
|---|---|
| PR / 다른 브랜치 | 디버그 APK를 실행 페이지의 Artifacts에서 내려받기 (테스트용) |
| `main`에 푸시 | 서명된 APK를 **`latest` 릴리스**에 올려 덮어씀 → 고정 링크 `https://github.com/<소유자>/dulyeo/releases/download/latest/dulyeo.apk` |
| `v1.2.0` 같은 태그 | 서명된 APK를 버전 릴리스로 발행 |

`ci.yml`은 모든 PR/푸시에서 테스트와 웹 빌드를 돌립니다.

### 최초 1회: 서명 키 만들기 (업데이트 설치에 필수)

폰은 **같은 키로 서명된 APK만 기존 앱의 업데이트로** 받아 줍니다. 키가 없으면 빌드마다 서명이 달라져서 매번 지우고 다시 설치해야 합니다.

```sh
scripts/make-keystore.sh          # JDK의 keytool 필요. dulyeo.keystore 생성 + 등록할 값을 출력
```

출력된 값을 저장소 **Settings > Secrets and variables > Actions**에 4개 시크릿으로 등록합니다.

| 이름 | 값 |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | 스크립트가 출력한 긴 base64 문자열 |
| `ANDROID_KEYSTORE_PASSWORD` | 입력한 비밀번호 |
| `ANDROID_KEY_PASSWORD` | 같은 비밀번호 |
| `ANDROID_KEY_ALIAS` | `dulyeo` |

> `dulyeo.keystore` 파일은 **반드시 따로 백업**하세요(저장소에 커밋하지 마세요). 잃어버리면 이후 업데이트를 설치할 수 없습니다.
> 시크릿이 없으면 `main` 푸시도 디버그 APK만 만들고 릴리스는 올리지 않습니다. PR에서는 시크릿을 쓰지 않습니다.

### 폰에서 설치/업데이트
1. 폰 브라우저에서 위 `latest` 링크(또는 Releases 페이지)를 열어 `dulyeo.apk`를 받습니다.
2. 처음 한 번 "출처를 알 수 없는 앱 설치"를 허용합니다.
3. 이후 업데이트는 같은 링크에서 다시 받아 설치하면 **데이터(저장된 트랙)가 유지된 채** 덮어써집니다. 버전 코드는 빌드 번호로 자동 증가합니다.

## Android 앱(APK) 직접 만들기

GitHub 없이 로컬에서 빌드하려면: Node 20.19+, JDK 17, Android SDK가 필요합니다.

```sh
npm install
npm run android:setup      # android/ 프로젝트 생성 + 네이티브 TTS 플러그인/권한 연결 (여러 번 실행해도 안전)
cd android && ./gradlew assembleDebug
# → android/app/build/outputs/apk/debug/app-debug.apk
```

웹 코드를 고친 뒤에는 `npm run android:sync` 후 다시 빌드합니다.
백그라운드 재생은 `@jofr/capacitor-media-session`(포그라운드 서비스 + 미디어 알림)으로 처리합니다. 알림 권한을 허용해 주세요.

## 개발

```sh
npm run dev      # 브라우저에서 UI 확인 (Azure 엔진만 사용 가능)
npm run build    # dist/ 생성 (정적 파일, GitHub Pages 등에 올려 PWA로도 설치 가능)
npm test
```

## 구조

| 경로 | 역할 |
|---|---|
| `src/lib/text.js` | 마크다운 → 문단 → 문장 (약어 처리) |
| `src/lib/build.js` | 문장별 합성, 반복/간격/쉐도잉을 넣어 mp3와 타임라인 생성 |
| `src/lib/mp3.js` | CBR mp3 이어붙이기·무음 프레임 |
| `src/lib/engines/` | `azure.js`, `system.js`(안드로이드 내장, WAV→mp3 변환 포함). 새 엔진은 `{id, concurrency, synth(text)}`만 구현하면 됩니다. |
| `src/lib/db.js` | IndexedDB(트랙, 문장 캐시) |
| `src/main.js` | UI: 만들기, 라이브러리, 플레이어, 미디어 세션 |
| `android-plugin/` | 내장 TTS를 노출하는 Capacitor 플러그인(Java) |
| `scripts/setup-android.mjs` | android 프로젝트 생성/패치(버전 주입 포함) |
| `scripts/sign-apk.sh`, `make-keystore.sh` | APK 정렬·서명, 서명 키 생성 |
| `.github/workflows/` | `ci.yml`(테스트), `apk.yml`(APK 빌드·릴리스) |

모든 엔진의 출력은 24kHz·48kbps·모노 MP3로 통일되어 있어 바이트 이어붙이기만으로 합칩니다.

## 알려진 한계

- 이 저장소의 자동 테스트는 텍스트 처리, mp3 합성, 엔진 로직(가짜 응답)과 브라우저 흐름까지 확인합니다. **실제 Azure 호출, 안드로이드 네이티브 플러그인, APK 빌드, 잠금화면 재생은 실제 기기에서 확인이 필요합니다.**
- 표(`|`)와 코드블록은 읽지 않고 건너뜁니다.
- 음성을 만드는 동안에는 화면을 켜 두세요(백그라운드에서는 중단될 수 있습니다).
- 플레이어의 "이 문장만 반복"은 화면이 켜진 동안만 정확합니다. 화면을 끄고 들을 때는 만들기의 **반복 횟수**(mp3에 포함)를 쓰세요.
