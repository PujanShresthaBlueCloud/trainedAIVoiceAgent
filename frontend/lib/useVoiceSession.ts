"use client";
import { useState, useRef, useCallback, useEffect } from "react";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";

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
}

export function useVoiceSession(agentId?: string) {
  const [state, setState] = useState<VoiceSessionState>({
    isConnected: false,
    isRecording: false,
    transcript: [],
    error: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const playbackContextRef = useRef<AudioContext | null>(null);
  const mountedRef = useRef(true);

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

  const connect = useCallback(async () => {
    // Prevent connecting if already connected
    if (wsRef.current) return;

    try {
      setState((s) => ({ ...s, error: null, transcript: [] }));

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      // Check if component unmounted while awaiting mic permission
      if (!mountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      mediaStreamRef.current = stream;

      const audioCtx = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioCtx;
      playbackContextRef.current = new AudioContext({ sampleRate: 16000 });

      const url = `${WS_URL}/ws/voice-browser${agentId ? `?agent_id=${agentId}` : ""}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;
      ws.binaryType = "arraybuffer";

      ws.onopen = () => {
        if (!mountedRef.current) {
          ws.close();
          return;
        }
        setState((s) => ({ ...s, isConnected: true, isRecording: true }));

        const source = audioCtx.createMediaStreamSource(stream);
        const processor = audioCtx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (e) => {
          if (ws.readyState === WebSocket.OPEN) {
            const float32 = e.inputBuffer.getChannelData(0);
            const pcm16 = float32ToPcm16(float32);
            ws.send(pcm16.buffer);
          }
        };

        source.connect(processor);
        processor.connect(audioCtx.destination);
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

      ws.onclose = () => {
        wsRef.current = null;
        cleanup();
        setState((s) => ({ ...s, isConnected: false, isRecording: false }));
      };

      ws.onerror = () => {
        setState((s) => ({ ...s, error: "WebSocket connection failed" }));
      };
    } catch (err: any) {
      setState((s) => ({ ...s, error: err.message || "Failed to connect" }));
    }
  }, [agentId, cleanup]);

  const disconnect = useCallback(() => {
    const ws = wsRef.current;
    if (ws) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "end" }));
      }
      ws.close();
      wsRef.current = null;
    }
    cleanup();
    setState((s) => ({ ...s, isConnected: false, isRecording: false }));
  }, [cleanup]);

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
    }
  }, []);

  const playAudio = useCallback((buffer: ArrayBuffer) => {
    const ctx = playbackContextRef.current;
    if (!ctx) return;

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
    source.start();
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      disconnect();
    };
  }, [disconnect]);

  return { ...state, connect, disconnect };
}

function float32ToPcm16(float32: Float32Array): Int16Array {
  const pcm16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return pcm16;
}
