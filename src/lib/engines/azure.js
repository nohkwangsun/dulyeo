// Azure AI Speech (free F0 tier: 500k neural characters/month). Needs a user-supplied key.
// Output format matches the rest of the pipeline: 24 kHz / 48 kbit/s / mono MP3.

export const AZURE_VOICES = [
  { id: 'en-US-AriaNeural', label: 'Aria (US, female)' },
  { id: 'en-US-JennyNeural', label: 'Jenny (US, female)' },
  { id: 'en-US-GuyNeural', label: 'Guy (US, male)' },
  { id: 'en-US-AndrewNeural', label: 'Andrew (US, male)' },
  { id: 'en-GB-SoniaNeural', label: 'Sonia (UK, female)' },
  { id: 'en-GB-RyanNeural', label: 'Ryan (UK, male)' },
  { id: 'en-AU-NatashaNeural', label: 'Natasha (AU, female)' },
];

const escapeXml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);

export function azureEngine({ key, region, voice, fetchImpl = (...a) => fetch(...a) }) {
  if (!key || !region) throw new Error('Azure 키와 지역(region)을 설정에서 입력해 주세요.');
  const url = `https://${region.trim()}.tts.speech.microsoft.com/cognitiveservices/v1`;
  const lang = voice.split('-').slice(0, 2).join('-');
  return {
    id: `azure:${voice}`,
    concurrency: 4,
    async synth(text) {
      const ssml = `<speak version="1.0" xml:lang="${lang}"><voice name="${voice}">${escapeXml(text)}</voice></speak>`;
      let lastErr;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const res = await fetchImpl(url, {
            method: 'POST',
            headers: {
              'Ocp-Apim-Subscription-Key': key.trim(),
              'Content-Type': 'application/ssml+xml',
              'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
            },
            body: ssml,
          });
          if (res.status === 401 || res.status === 403) throw Object.assign(new Error('Azure 키가 올바르지 않거나 권한이 없습니다.'), { fatal: true });
          if (res.status === 429) throw Object.assign(new Error('Azure 무료 한도(월 50만 자)를 넘었거나 요청이 너무 많습니다.'), { fatal: true });
          if (!res.ok) throw new Error(`Azure 오류 ${res.status}`);
          const buf = new Uint8Array(await res.arrayBuffer());
          if (buf.length < 200) throw new Error('빈 오디오가 왔습니다.');
          return buf;
        } catch (err) {
          if (err.fatal) throw err;
          lastErr = err;
          await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        }
      }
      throw new Error(`음성 생성 실패(네트워크?): ${lastErr?.message}`);
    },
  };
}
