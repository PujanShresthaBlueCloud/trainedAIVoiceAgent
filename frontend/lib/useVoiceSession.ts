"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import {
  Room,
  RoomEvent,
  Track,
  RemoteTrackPublication,
  RemoteParticipant,
  DataPacket_Kind,
} from "livekit-client";
import { api } from "./api";

const LIVEKIT_URL =
  process.env.NEXT_PUBLIC_LIVEKIT_URL || "ws://localhost:7880";

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

  const roomRef = useRef<Room | null>(null);
  const mountedRef = useRef(true);
  const connectingRef = useRef(false);

  const connect = useCallback(async () => {
    if (roomRef.current || connectingRef.current || !agentId) {
      return;
    }
    connectingRef.current = true;

    try {
      setState((s) => ({
        ...s,
        error: null,
        transcript: [],
        status: "connecting",
      }));

      // Get token from backend
      const tokenData = await api.getLivekitToken(agentId);
      const { token, room_name, livekit_url } = tokenData;

      const url = livekit_url || LIVEKIT_URL;

      // Create and connect room
      const room = new Room();
      roomRef.current = room;

      // Handle remote audio tracks (agent TTS audio)
      room.on(
        RoomEvent.TrackSubscribed,
        (
          track: any,
          publication: RemoteTrackPublication,
          participant: RemoteParticipant
        ) => {
          if (track.kind === Track.Kind.Audio) {
            // Attach audio element for playback — LiveKit handles codecs/transport
            const element = track.attach();
            element.id = `livekit-audio-${participant.identity}`;
            document.body.appendChild(element);
          }
        }
      );

      // Clean up audio elements when tracks are unsubscribed
      room.on(
        RoomEvent.TrackUnsubscribed,
        (track: any, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
          track.detach().forEach((el: HTMLMediaElement) => el.remove());
        }
      );

      // Handle transcript data from agent via data channel
      room.on(
        RoomEvent.DataReceived,
        (data: Uint8Array, participant?: RemoteParticipant) => {
          try {
            const msg = JSON.parse(new TextDecoder().decode(data));
            if (msg.type === "transcript") {
              setState((s) => {
                const updated = [...s.transcript];
                if (msg.is_final) {
                  updated.push({
                    role: msg.role,
                    content: msg.content,
                    is_final: true,
                  });
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
          } catch {
            // ignore parse errors
          }
        }
      );

      room.on(RoomEvent.Disconnected, () => {
        connectingRef.current = false;
        roomRef.current = null;
        if (mountedRef.current) {
          setState((s) => ({
            ...s,
            isConnected: false,
            isRecording: false,
            status: "idle",
          }));
        }
      });

      // Connect to the room
      await room.connect(url, token);

      // Enable microphone
      await room.localParticipant.setMicrophoneEnabled(true);

      connectingRef.current = false;

      if (mountedRef.current) {
        setState((s) => ({
          ...s,
          isConnected: true,
          isRecording: true,
          status: "connected",
        }));
      }
    } catch (err: any) {
      console.error("[VoiceSession] Connect error:", err);
      connectingRef.current = false;
      roomRef.current = null;
      setState((s) => ({
        ...s,
        error: err.message || "Failed to connect",
        status: "error",
      }));
    }
  }, [agentId]);

  const disconnect = useCallback(() => {
    connectingRef.current = false;
    const room = roomRef.current;
    if (room) {
      room.disconnect();
      roomRef.current = null;
    }
    if (mountedRef.current) {
      setState((s) => ({
        ...s,
        isConnected: false,
        isRecording: false,
        status: "idle",
      }));
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const room = roomRef.current;
      if (room) {
        room.disconnect();
      }
      roomRef.current = null;
      connectingRef.current = false;
    };
  }, []);

  return { ...state, connect, disconnect };
}
