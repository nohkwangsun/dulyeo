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

## Android 앱(APK) 만들기

필요: Node 20.19+, JDK 17+, Android Studio(또는 Android SDK).

```sh
npm install
npm run android:setup      # android/ 프로젝트 생성 + 네이티브 TTS 플러그인/권한 연결 (여러 번 실행해도 안전)
cd android && ./gradlew assembleDebug
# → android/app/build/outputs/apk/debug/app-debug.apk 를 폰에 설치
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
| `scripts/setup-android.mjs` | android 프로젝트 생성/패치 |

모든 엔진의 출력은 24kHz·48kbps·모노 MP3로 통일되어 있어 바이트 이어붙이기만으로 합칩니다.

## 알려진 한계

- 이 저장소의 자동 테스트는 텍스트 처리, mp3 합성, 엔진 로직(가짜 응답)과 브라우저 흐름까지 확인합니다. **실제 Azure 호출, 안드로이드 네이티브 플러그인, APK 빌드, 잠금화면 재생은 실제 기기에서 확인이 필요합니다.**
- 표(`|`)와 코드블록은 읽지 않고 건너뜁니다.
- 음성을 만드는 동안에는 화면을 켜 두세요(백그라운드에서는 중단될 수 있습니다).
