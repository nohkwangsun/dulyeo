# Dulyeo

영어 스크립트(마크다운/클립보드 텍스트)를 mp3로 만들고, 같은 앱에서 바로 들을 수 있는 PWA입니다.
출퇴근길에 화면을 끄고 음악 앱처럼 듣는 것이 목표입니다.

## 동작 방식

```
스크립트 붙여넣기 → 서버가 문장 분리 + Edge 신경망 TTS → 반복·간격을 넣어 mp3 1개로 합성
→ 폰(IndexedDB)에 저장 → <audio> + Media Session으로 재생
```

- **반복/간격은 mp3 안에 구워 넣습니다.** 화면을 꺼도 JS 타이머에 의존하지 않아서 끊기지 않습니다.
- **속도 조절**은 재생 중 `playbackRate`(0.5~1.5배, 음높이 유지)로 합니다.
- **문장/문단 이동**은 잠금화면·이어폰의 이전/다음 버튼에 연결됩니다.
- 한 번 만든 트랙은 폰에 저장되어 오프라인(지하철)에서도 재생됩니다.
- 문장별 음성은 서버에 캐시되므로, 반복 횟수만 바꿔 다시 만들면 거의 즉시 끝납니다.

## 실행

```sh
npm install
npm start            # http://localhost:8787
npm test
```

- `ACCESS_TOKEN=비밀값 npm start` — 외부에 공개할 때 API를 토큰으로 보호합니다. 앱의 "서버 설정"에 같은 값을 입력하세요.
- `TTS_PROVIDER=fake npm run dev` — 테스트용 톤 소리(실제 음성 아님, ffmpeg 필요).
- `PORT`, `DATA_DIR` 환경변수로 포트와 저장 위치를 바꿀 수 있습니다.

폰에서 쓰려면 서버를 폰이 접근할 수 있는 곳(집 PC + Tailscale, 또는 작은 VPS 등)에서 **HTTPS**로 실행해야 PWA 설치와 백그라운드 재생이 됩니다.
mp3 생성에는 서버 연결이 필요하지만, 생성된 뒤의 재생은 오프라인으로 됩니다.

## 구조

| 경로 | 역할 |
|---|---|
| `server/text.js` | 마크다운 → 문단 → 문장 (약어 처리) |
| `server/build.js` | 문장별 음성 합성, 반복/간격/쉐도잉을 넣어 mp3와 타임라인 생성 |
| `server/mp3.js` | CBR mp3 이어붙이기·무음 프레임 |
| `server/providers.js` | TTS 공급자 (Edge, 테스트용 fake). 다른 TTS는 여기에 추가 |
| `public/` | PWA (플레이어, 라이브러리, Media Session, 서비스워커) |

## 알려진 한계

- Edge TTS는 비공식 엔드포인트라 Microsoft 쪽 변경으로 깨질 수 있습니다. 그 경우 `providers.js`에 OpenAI/Google 등을 추가하면 됩니다(출력은 `audio-24khz-48kbitrate-mono-mp3` 형식이어야 합니다).
- 표(`|`)와 코드블록은 읽지 않고 건너뜁니다.
- 한 번에 최대 60,000자까지 변환합니다.
- iOS에서는 홈 화면에 추가(PWA)한 뒤 사용하는 것을 권장합니다.
