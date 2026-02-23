"use client";
import { useState, useRef, useCallback, useEffect } from "react";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://127.0.0.1:8000";

interface TranscriptMessage {
  role: "user" | "assistant";
  content: string;
  is_final: boolean;
}

interface VoiceSessionState {
  isConnected: boolean;
  isRecording: boolean;
  transcript: TranscriptMessage[];
  error: string | null;
  status: string;
}

export function useVoiceSession(agentId?: string) {
  const [state, setState] = useState<VoiceSessionState>({
    isConnected: false,
    isRecording: false,
    transcript: [],
    error: null,
    status: "idle",
  });

  const wsRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const playbackContextRef = useRef<AudioContext | null>(null);
  const mountedRef = useRef(true);
  const connectingRef = useRef(false);

  const cleanup = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (playbackContextRef.current) {
      playbackContextRef.current.close().catch(() => {});
      playbackContextRef.current = null;
    }
  }, []);

  const nextPlayTime = useRef(0);

  const playAudio = useCallback((buffer: ArrayBuffer) => {
    const ctx = playbackContextRef.current;
    if (!ctx) return;

    // Resume if suspended (browser autoplay policy)
    if (ctx.state === "suspended") {
      ctx.resume();
    }

    const pcm16 = new Int16Array(buffer);
    const float32 = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) {
      float32[i] = pcm16[i] / 32768;
    }

    const audioBuffer = ctx.createBuffer(1, float32.length, 16000);
    audioBuffer.getChannelData(0).set(float32);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);

    // Schedule chunks sequentially so they don't overlap or have gaps
    const now = ctx.currentTime;
    const startTime = Math.max(now, nextPlayTime.current);
    source.start(startTime);
    nextPlayTime.current = startTime + audioBuffer.duration;
  }, []);

  const handleMessage = useCallback((msg: any) => {
    if (msg.type === "transcript") {
      setState((s) => {
        const updated = [...s.transcript];
        if (msg.is_final) {
          updated.push({ role: msg.role, content: msg.content, is_final: true });
        } else {
          const lastIdx = updated.findLastIndex(
            (t) => t.role === msg.role && !t.is_final
          );
          if (lastIdx >= 0) {
            updated[lastIdx] = { ...msg };
          } else {
            updated.push({ ...msg });
          }
        }
        return { ...s, transcript: updated };
      });
    } else if (msg.type === "error") {
      console.error("[VoiceSession] Server error:", msg.message);
      setState((s) => ({ ...s, error: msg.message || "Server error" }));
    } else if (msg.type === "session_started") {
      console.log("[VoiceSession] Session started:", msg.agent);
      setState((s) => ({ ...s, status: "active" }));
    } else if (msg.type === "session_ended") {
      console.log("[VoiceSession] Session ended:", msg.reason);
      setState((s) => ({ ...s, status: "ended" }));
    }
  }, []);

  const connect = useCallback(async () => {
    // Prevent duplicate connections
    if (wsRef.current || connectingRef.current) {
      console.log("[VoiceSession] Already connected or connecting, skipping");
      return;
    }
    connectingRef.current = true;
    console.log("[VoiceSession] Starting connection...");

    try {
      setState((s) => ({ ...s, error: null, transcript: [], status: "requesting_mic" }));

      console.log("[VoiceSession] Requesting microphone...");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      console.log("[VoiceSession] Microphone granted");

      if (!mountedRef.current) {
        console.log("[VoiceSession] Component unmounted during mic request, aborting");
        stream.getTracks().forEach((t) => t.stop());
        connectingRef.current = false;
        return;
      }

      mediaStreamRef.current = stream;

      // Create playback context during user gesture so autoplay is allowed
      const playCtx = new AudioContext({ sampleRate: 16000 });
      playbackContextRef.current = playCtx;
      playCtx.resume();
      nextPlayTime.current = 0;

      setState((s) => ({ ...s, status: "connecting" }));

      const url = `${WS_URL}/ws/voice-browser${agentId ? `?agent_id=${agentId}` : ""}`;
      console.log("[VoiceSession] Connecting WebSocket to:", url);

      const ws = new WebSocket(url);
      wsRef.current = ws;
      ws.binaryType = "arraybuffer";

      // Timeout: if onopen doesn't fire within 10s, abort
      const timeout = setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING) {
          console.error("[VoiceSession] Connection timeout after 10s");
          ws.close();
          wsRef.current = null;
          connectingRef.current = false;
          cleanup();
          setState((s) => ({
            ...s,
            isConnected: false,
            isRecording: false,
            error: "Connection timed out. Is the backend running?",
            status: "error",
          }));
        }
      }, 10000);

      ws.onopen = () => {
        clearTimeout(timeout);
        console.log("[VoiceSession] WebSocket opened!");

        if (!mountedRef.current) {
          console.log("[VoiceSession] Component unmounted, closing WebSocket");
          ws.close();
          connectingRef.current = false;
          return;
        }

        connectingRef.current = false;

        // Use default sample rate (matches hardware, typically 48kHz)
        const audioCtx = new AudioContext();
        audioContextRef.current = audioCtx;

        audioCtx.resume().then(() => {
          const nativeSR = audioCtx.sampleRate;
          console.log("[VoiceSession] Audio capture at", nativeSR, "Hz, downsampling to 16000 Hz");

          const source = audioCtx.createMediaStreamSource(stream);
          const processor = audioCtx.createScriptProcessor(4096, 1, 1);
          processorRef.current = processor;

          processor.onaudioprocess = (e) => {
            if (ws.readyState === WebSocket.OPEN) {
              const float32 = e.inputBuffer.getChannelData(0);
              const downsampled = downsample(float32, nativeSR, 16000);
              const pcm16 = float32ToPcm16(downsampled);
              ws.send(pcm16.buffer);
            }
          };

          source.connect(processor);
          processor.connect(audioCtx.destination);
        });

        setState((s) => ({ ...s, isConnected: true, isRecording: true, status: "connected" }));
      };

      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          playAudio(event.data);
        } else {
          try {
            const msg = JSON.parse(event.data);
            handleMessage(msg);
          } catch {
            // ignore parse errors
          }
        }
      };

      ws.onclose = (e) => {
        clearTimeout(timeout);
        console.log("[VoiceSession] WebSocket closed:", e.code, e.reason);
        wsRef.current = null;
        connectingRef.current = false;
        cleanup();
        if (mountedRef.current) {
          setState((s) => ({ ...s, isConnected: false, isRecording: false, status: "idle" }));
        }
      };

      ws.onerror = (e) => {
        clearTimeout(timeout);
        console.error("[VoiceSession] WebSocket error:", e);
        connectingRef.current = false;
        setState((s) => ({
          ...s,
          error: "WebSocket connection failed. Is the backend running on " + WS_URL + "?",
          status: "error",
        }));
      };
    } catch (err: any) {
      console.error("[VoiceSession] Connect error:", err);
      connectingRef.current = false;
      setState((s) => ({
        ...s,
        error: err.message || "Failed to connect",
        status: "error",
      }));
    }
  }, [agentId, cleanup, playAudio, handleMessage]);

  const disconnect = useCallback(() => {
    console.log("[VoiceSession] Disconnecting...");
    connectingRef.current = false;
    const ws = wsRef.current;
    if (ws) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "end" }));
      }
      if (ws.readyState !== WebSocket.CLOSED && ws.readyState !== WebSocket.CLOSING) {
        ws.close();
      }
      wsRef.current = null;
    }
    cleanup();
    if (mountedRef.current) {
      setState((s) => ({ ...s, isConnected: false, isRecording: false, status: "idle" }));
    }
  }, [cleanup]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "end" }));
        ws.close();
      }
      wsRef.current = null;
      connectingRef.current = false;
      cleanup();
    };
  }, [cleanup]);

  return { ...state, connect, disconnect };
}

function downsample(buffer: Float32Array, inputRate: number, outputRate: number): Float32Array {
  if (inputRate === outputRate) return buffer;
  const ratio = inputRate / outputRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const srcIndex = Math.floor(i * ratio);
    result[i] = buffer[srcIndex];
  }
  return result;
}

function float32ToPcm16(float32: Float32Array): Int16Array {
  const pcm16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return pcm16;
}
