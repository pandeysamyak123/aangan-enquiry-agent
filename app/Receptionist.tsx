'use client';
// "Talk to Meera": a live voice session with the Vaani agent, in the browser.
// Flow: POST /api/receptionist → LiveKit token → connect, publish mic, play Meera's audio, show live captions.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Room } from 'livekit-client';

type Phase = 'idle' | 'connecting' | 'live' | 'ended' | 'error';
type Line = { who: 'meera' | 'you'; text: string };

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function Receptionist() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');
  const [muted, setMuted] = useState(false);
  const [left, setLeft] = useState(0);
  const [speaking, setSpeaking] = useState<'meera' | 'you' | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const roomRef = useRef<Room | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const orbRef = useRef<HTMLDivElement | null>(null);
  const timers = useRef<number[]>([]);

  const cleanup = useCallback(() => {
    timers.current.forEach((t) => clearInterval(t));
    timers.current = [];
    wsRef.current?.close();
    wsRef.current = null;
    roomRef.current?.disconnect();
    roomRef.current = null;
    document.querySelectorAll('audio[data-meera]').forEach((a) => a.remove());
    setSpeaking(null);
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const end = useCallback(() => {
    cleanup();
    setPhase((p) => (p === 'error' ? p : 'ended'));
  }, [cleanup]);

  const addCaption = (who: Line['who'], text: string) => {
    if (!text.trim()) return;
    setLines((prev) => {
      const last = prev[prev.length - 1];
      // Captions stream in pieces; extend the current line while the same person is speaking.
      if (last && last.who === who) return [...prev.slice(0, -1), { who, text: text.startsWith(last.text) ? text : `${last.text} ${text}`.trim() }];
      return [...prev.slice(-12), { who, text }];
    });
  };

  async function start() {
    setError('');
    setLines([]);
    setPhase('connecting');
    try {
      const res = await fetch('/api/receptionist', { method: 'POST' });
      const s = await res.json();
      if (!res.ok) throw new Error(s.error ?? 'Could not reach Meera');

      const { Room, RoomEvent, Track } = await import('livekit-client');
      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;

      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Audio) {
          const el = track.attach();
          el.setAttribute('data-meera', '1');
          document.body.appendChild(el);
        }
      });
      room.on(RoomEvent.Disconnected, () => end());

      await room.connect(s.url, s.token);
      await room.localParticipant.setMicrophoneEnabled(true);
      setPhase('live');
      setLeft(s.maxSeconds ?? 240);

      // Orb reacts to whoever is speaking.
      timers.current.push(window.setInterval(() => {
        const remote = [...room.remoteParticipants.values()].reduce((m, p) => Math.max(m, p.audioLevel ?? 0), 0);
        const local = room.localParticipant.audioLevel ?? 0;
        const level = Math.max(remote, local);
        orbRef.current?.style.setProperty('--level', String(Math.min(1, level * 2.5)));
        setSpeaking(remote > 0.04 ? 'meera' : local > 0.04 ? 'you' : null);
      }, 80));
      // Hard stop so a forgotten tab can't run up minutes.
      timers.current.push(window.setInterval(() => setLeft((l) => {
        if (l <= 1) { end(); return 0; }
        return l - 1;
      }), 1000));

      if (s.captionsUrl) {
        try {
          const ws = new WebSocket(s.captionsUrl);
          wsRef.current = ws;
          ws.onmessage = (ev) => {
            try {
              const m = JSON.parse(String(ev.data));
              const text = m.text ?? m.transcript ?? m.message ?? m.content ?? m.data?.text;
              const role = String(m.role ?? m.speaker ?? m.participant ?? m.data?.role ?? '').toLowerCase();
              if (typeof text === 'string') addCaption(/user|caller|human|you/.test(role) ? 'you' : 'meera', text);
            } catch {
              /* non-JSON keepalives */
            }
          };
        } catch {
          /* captions are optional */
        }
      }
    } catch (e) {
      cleanup();
      setPhase('error');
      const msg = e instanceof Error ? `${e.name} ${e.message}` : '';
      setError(/NotAllowed|Permission|denied/i.test(msg)
        ? 'Please allow microphone access in your browser to talk to Meera.'
        : /NotFound|device/i.test(msg) ? 'No microphone found. Plug one in or use your phone.'
        : e instanceof Error ? e.message : 'Something went wrong');
    }
  }

  async function toggleMute() {
    const room = roomRef.current;
    if (!room) return;
    await room.localParticipant.setMicrophoneEnabled(muted);
    setMuted(!muted);
  }

  const live = phase === 'live';
  const status =
    phase === 'connecting' ? 'Connecting you to Meera…'
    : live ? (speaking === 'meera' ? 'Meera is speaking' : speaking === 'you' ? 'Listening…' : muted ? 'You’re muted' : 'Go ahead, I’m listening')
    : phase === 'ended' ? 'Thanks for calling Aangan Studio'
    : phase === 'error' ? error
    : 'Ask about your home, office or a single room';

  return (
    <div className="recep" data-phase={phase} data-speaking={speaking ?? ''}>
      <div className="orb-wrap" aria-hidden>
        <div className="orb-ring r1" /><div className="orb-ring r2" /><div className="orb-ring r3" />
        <div className="orb" ref={orbRef}><div className="orb-core" /></div>
      </div>

      <div className="recep-name">Meera <span className="recep-tag">AI receptionist · Aangan Studio</span></div>
      <p className="recep-status" role="status" aria-live="polite">{status}</p>

      <div className="recep-actions">
        {(phase === 'idle' || phase === 'ended' || phase === 'error') && (
          <button className="btn-talk" onClick={start}>
            <span className="btn-talk-dot" />{phase === 'idle' ? 'Talk to Meera' : 'Talk again'}
          </button>
        )}
        {phase === 'connecting' && <button className="btn-talk" disabled><span className="spinner" /> Connecting</button>}
        {live && (
          <>
            <button className="btn-round" onClick={toggleMute} aria-pressed={muted} aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}>{muted ? '🔇' : '🎙'}</button>
            <button className="btn-end" onClick={end}>End call</button>
            <span className="recep-timer num" title="Web calls end automatically">{fmt(left)}</span>
          </>
        )}
      </div>

      {lines.length > 0 && (
        <div className="captions" aria-label="Live captions">
          {lines.slice(-4).map((l, i) => <p key={i} className={`cap cap-${l.who}`}><b>{l.who === 'meera' ? 'Meera' : 'You'}:</b> {l.text}</p>)}
        </div>
      )}
      <p className="recep-fine">Uses your microphone · calls are recorded so a designer has your details · Meera never quotes prices</p>
    </div>
  );
}
