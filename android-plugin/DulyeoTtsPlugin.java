package com.dulyeo.app;

import android.content.Intent;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.ByteArrayOutputStream;
import java.io.FileInputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Exposes Android's built-in text-to-speech to the web layer as "give me a WAV for this sentence".
 * The JS side converts the WAV to the app's shared MP3 format.
 */
@CapacitorPlugin(name = "DulyeoTts")
public class DulyeoTtsPlugin extends Plugin {
    private TextToSpeech tts;
    private boolean ready = false;
    private boolean initFailed = false;
    private final List<Runnable> whenReady = new ArrayList<>();

    private static class Pending {
        final PluginCall call;
        final File file;
        Pending(PluginCall call, File file) { this.call = call; this.file = file; }
    }
    private final Map<String, Pending> pending = new ConcurrentHashMap<>();

    /** Runs the task once the engine is initialised (immediately if it already is). */
    private synchronized void withTts(PluginCall call, Runnable task) {
        if (ready) { task.run(); return; }
        if (initFailed) { call.reject("이 기기에서 음성 엔진을 시작하지 못했습니다."); return; }
        whenReady.add(() -> {
            if (ready) task.run(); else call.reject("이 기기에서 음성 엔진을 시작하지 못했습니다.");
        });
        if (tts != null) return;   // init already in flight
        tts = new TextToSpeech(getContext(), status -> {
            List<Runnable> toRun;
            synchronized (DulyeoTtsPlugin.this) {
                ready = status == TextToSpeech.SUCCESS;
                initFailed = !ready;
                toRun = new ArrayList<>(whenReady);
                whenReady.clear();
            }
            if (ready) {
                tts.setLanguage(Locale.US);
                tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                    @Override public void onStart(String utteranceId) { }
                    @Override public void onDone(String utteranceId) { finish(utteranceId, null); }
                    @Override public void onError(String utteranceId) { finish(utteranceId, "음성 합성에 실패했습니다."); }
                    @Override public void onError(String utteranceId, int errorCode) { finish(utteranceId, "음성 합성에 실패했습니다. (코드 " + errorCode + ")"); }
                });
            }
            for (Runnable r : toRun) r.run();
        });
    }

    private void finish(String utteranceId, String error) {
        Pending p = pending.remove(utteranceId);
        if (p == null) return;
        try {
            if (error != null) { p.call.reject(error); return; }
            byte[] wav = readAll(p.file);
            if (wav.length < 100) { p.call.reject("빈 오디오가 생성되었습니다."); return; }
            JSObject ret = new JSObject();
            ret.put("wavBase64", Base64.encodeToString(wav, Base64.NO_WRAP));
            p.call.resolve(ret);
        } catch (Exception e) {
            p.call.reject("오디오 파일을 읽지 못했습니다: " + e.getMessage());
        } finally {
            //noinspection ResultOfMethodCallIgnored
            p.file.delete();
        }
    }

    private static byte[] readAll(File f) throws java.io.IOException {
        try (InputStream in = new FileInputStream(f); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buf = new byte[16384];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toByteArray();
        }
    }

    @PluginMethod
    public void synthesize(PluginCall call) {
        final String text = call.getString("text", "");
        final String voiceName = call.getString("voice", "");
        if (text == null || text.trim().isEmpty()) { call.reject("text is empty"); return; }
        withTts(call, () -> {
            try {
                if (voiceName != null && !voiceName.isEmpty()) {
                    Set<Voice> voices = tts.getVoices();
                    if (voices != null) {
                        for (Voice v : voices) {
                            if (v.getName().equals(voiceName)) { tts.setVoice(v); break; }
                        }
                    }
                } else {
                    tts.setLanguage(Locale.US);
                }
                File out = File.createTempFile("dulyeo-tts", ".wav", getContext().getCacheDir());
                String id = UUID.randomUUID().toString();
                pending.put(id, new Pending(call, out));
                int r = tts.synthesizeToFile(text, new Bundle(), out, id);
                if (r != TextToSpeech.SUCCESS) {
                    pending.remove(id);
                    //noinspection ResultOfMethodCallIgnored
                    out.delete();
                    call.reject("음성 합성을 시작하지 못했습니다.");
                }
            } catch (Exception e) {
                call.reject("음성 합성 오류: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void getVoices(PluginCall call) {
        withTts(call, () -> {
            JSArray arr = new JSArray();
            Set<Voice> voices = tts.getVoices();
            if (voices != null) {
                List<Voice> english = new ArrayList<>();
                for (Voice v : voices) {
                    if ("en".equals(v.getLocale().getLanguage())) english.add(v);
                }
                Collections.sort(english, new Comparator<Voice>() {
                    @Override public int compare(Voice a, Voice b) { return a.getName().compareTo(b.getName()); }
                });
                for (Voice v : english) {
                    JSObject o = new JSObject();
                    o.put("id", v.getName());
                    o.put("name", v.getName());
                    o.put("lang", v.getLocale().toLanguageTag());
                    o.put("offline", !v.isNetworkConnectionRequired());
                    arr.put(o);
                }
            }
            JSObject ret = new JSObject();
            ret.put("voices", arr);
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void openTtsSettings(PluginCall call) {
        try {
            Intent i = new Intent("com.android.settings.TTS_SETTINGS");
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("설정 화면을 열지 못했습니다. 안드로이드 설정 > 접근성 > 텍스트 음성 변환에서 직접 열어 주세요.");
        }
    }

    @Override
    protected void handleOnDestroy() {
        if (tts != null) { tts.shutdown(); tts = null; ready = false; }
    }
}
