import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { Video, Mic, PhoneOff, ShieldAlert, Loader2 } from 'lucide-react';
import { videoKycAPI, SOCKET_BASE } from '../services/api';

const getToken = () => localStorage.getItem('flowly_token');

const CHALLENGE_HINT = {
  turn_left: 'Turn your head to the left',
  turn_right: 'Turn your head to the right',
  smile: 'Smile for the camera',
  blink: 'Blink a couple of times',
  read_number: 'Read the number below out loud',
};

/**
 * Full-screen-ish call room the customer sees once they tap "Join call" on
 * their scheduled Video KYC slot. Mirrors the officer side (worker UI):
 * the officer always creates the WebRTC offer, so this side only answers.
 */
export default function VideoKycCall({ sessionId, onExit }) {
  const [phase, setPhase] = useState('connecting'); // connecting | live | ended | error
  const [errorMsg, setErrorMsg] = useState('');
  const [consentGiven, setConsentGiven] = useState(false);
  const [consentSaving, setConsentSaving] = useState(false);
  const [officerPresent, setOfficerPresent] = useState(false);
  const [recording, setRecording] = useState(false);
  const [challenge, setChallenge] = useState(null); // current liveness prompt from officer

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pcRef = useRef(null);
  const socketRef = useRef(null);
  const localStreamRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const setup = async () => {
      try {
        // 1. REST: ask the backend for permission + ICE servers
        const { data: joinRes } = await videoKycAPI.joinSession(sessionId);
        if (cancelled) return;
        setConsentGiven(joinRes.session?.recordingConsentGiven === true);

        // 2. Local camera/mic
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;

        // 3. WebRTC peer connection
        const pc = new RTCPeerConnection({ iceServers: joinRes.iceServers || [] });
        pcRef.current = pc;
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
        pc.ontrack = (e) => {
          if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0];
        };
        pc.onicecandidate = (e) => {
          if (e.candidate) socketRef.current?.emit('signal', { type: 'candidate', data: e.candidate });
        };

        // 4. Socket.IO signaling — same server, auth via the customer's JWT
        const socket = io(SOCKET_BASE, { auth: { token: getToken() } });
        socketRef.current = socket;

        socket.on('connect_error', (err) => {
          if (!cancelled) {
            setErrorMsg(err.message || 'Could not connect to the call server');
            setPhase('error');
          }
        });

        // The officer always creates the offer — we only ever answer.
        socket.on('signal', async ({ type, data }) => {
          if (!pcRef.current) return;
          try {
            if (type === 'offer') {
              await pc.setRemoteDescription(new RTCSessionDescription(data));
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              socket.emit('signal', { type: 'answer', data: answer });
            } else if (type === 'candidate') {
              await pc.addIceCandidate(new RTCIceCandidate(data));
            }
          } catch (err) {
            console.error('WebRTC signal error:', err);
          }
        });

        socket.on('peer-joined', () => setOfficerPresent(true));
        socket.on('peer-left', () => setOfficerPresent(false));
        socket.on('consent-updated', ({ given }) => setConsentGiven(given));
        socket.on('recording-state', ({ recording: r }) => setRecording(Boolean(r)));
        socket.on('liveness-challenge', (c) => setChallenge(c));

        socket.on('call-ended', ({ reason }) => {
          setPhase('ended');
          setErrorMsg(reason === 'cancelled' ? 'This session was cancelled.' : '');
        });

        socket.on('replaced', () => {
          setErrorMsg('This call was opened in another tab or device.');
          setPhase('ended');
        });

        socket.connect();
        socket.emit('join-room', { sessionId }, (ack) => {
          if (cancelled) return;
          if (!ack?.ok) {
            setErrorMsg(ack?.message || 'Could not join the call room');
            setPhase('error');
            return;
          }
          setOfficerPresent(Boolean(ack.peerPresent));
          setConsentGiven(Boolean(ack.recordingConsent));
          setPhase('live');
        });
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(err.response?.data?.message || err.message || 'Could not start the call');
          setPhase('error');
        }
      }
    };

    setup();

    return () => {
      cancelled = true;
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      pcRef.current?.close();
      socketRef.current?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const toggleConsent = async () => {
    setConsentSaving(true);
    try {
      const { data } = await videoKycAPI.giveConsent(sessionId, !consentGiven);
      setConsentGiven(data.recordingConsentGiven);
    } catch (err) {
      console.error('Could not update consent:', err);
    } finally {
      setConsentSaving(false);
    }
  };

  const markChallengeDone = () => {
    socketRef.current?.emit('challenge-done', { id: challenge?.id });
    setChallenge(null);
  };

  const leaveCall = () => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    pcRef.current?.close();
    socketRef.current?.disconnect();
    onExit?.();
  };

  return (
    <div className="flowly-card" style={{ maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
        <h2 style={{ fontSize: '20px', color: '#201530', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Video size={20} color="#5C187B" /> Video KYC Call
        </h2>
        <button className="btn-outline-dark" onClick={leaveCall}>← Back</button>
      </div>

      {phase === 'error' && (
        <div style={{ padding: '14px', borderRadius: '10px', backgroundColor: '#FADADA', color: '#B23A2E', fontSize: '14px', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldAlert size={18} /> {errorMsg || 'Something went wrong.'}
        </div>
      )}

      {phase === 'connecting' && (
        <div style={{ padding: '48px 0', textAlign: 'center', color: '#6E677B', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
          <Loader2 size={28} className="spin" />
          Setting up your camera and connecting to the officer…
        </div>
      )}

      {phase === 'ended' && (
        <div style={{ padding: '32px 0', textAlign: 'center', color: '#6E677B' }}>
          {errorMsg || 'This call has ended.'}
        </div>
      )}

      {(phase === 'live' || phase === 'connecting') && phase !== 'error' && (
        <>
          <div className="grid-2" style={{ marginBottom: '16px' }}>
            <div>
              <div style={{ fontSize: '12px', color: '#6E677B', marginBottom: '6px', fontWeight: 600 }}>You</div>
              <video ref={localVideoRef} autoPlay playsInline muted style={{ width: '100%', borderRadius: '12px', background: '#111', aspectRatio: '4/3', objectFit: 'cover' }} />
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#6E677B', marginBottom: '6px', fontWeight: 600 }}>
                Verification officer {officerPresent ? '· connected' : '· waiting to join…'}
              </div>
              <video ref={remoteVideoRef} autoPlay playsInline style={{ width: '100%', borderRadius: '12px', background: '#111', aspectRatio: '4/3', objectFit: 'cover' }} />
            </div>
          </div>

          {challenge && (
            <div style={{ padding: '14px 16px', borderRadius: '10px', backgroundColor: '#EEE7F4', color: '#5C187B', fontWeight: 700, marginBottom: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
              <span>
                {CHALLENGE_HINT[challenge.type] || challenge.text}
                {challenge.code ? ` — ${challenge.code}` : ''}
              </span>
              <button className="btn-primary" style={{ padding: '6px 14px', fontSize: '13px' }} onClick={markChallengeDone}>
                Done
              </button>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', padding: '14px 16px', borderRadius: '10px', backgroundColor: '#FAF9F5', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className={`badge ${consentGiven ? 'badge-green' : 'badge-amber'}`}>
                {consentGiven ? 'Recording consent given' : 'Recording consent not given'}
              </span>
              {recording && <span className="badge badge-red">● Recording</span>}
            </div>
            <button className={consentGiven ? 'btn-outline-dark' : 'btn-primary'} disabled={consentSaving} onClick={toggleConsent} style={{ padding: '8px 16px', fontSize: '13px' }}>
              {consentSaving ? 'Saving…' : consentGiven ? 'Withdraw consent' : 'Give recording consent'}
            </button>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', color: '#6E677B', fontSize: '13px', marginBottom: '16px' }}>
            <Mic size={16} /> Make sure you're in a well-lit, quiet place and keep your original PAN/Aadhaar handy — the officer may ask you to show it on camera.
          </div>

          <button className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }} onClick={leaveCall}>
            <PhoneOff size={16} /> Leave call
          </button>
        </>
      )}
    </div>
  );
}
