import React, { useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import * as api from '../api';
import { SOCKET_BASE, getToken } from '../api';

const STATUS_TABS = ['scheduled', 'in_progress', 'completed', 'cancelled'];
const STATUS_LABEL = {
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  missed: 'Missed',
};
const STATUS_BADGE = {
  scheduled: 'badge-amber',
  in_progress: 'badge-purple',
  completed: 'badge-green',
  cancelled: 'badge-gray',
  missed: 'badge-red',
};

function fmt(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default function VideoKyc({ kycQueue, customers, onToast, onKycChanged }) {
  const [tab, setTab] = useState('scheduled');
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [scheduleForId, setScheduleForId] = useState(null); // kycId currently being scheduled
  const [scheduleAt, setScheduleAt] = useState('');
  const [scheduleDuration, setScheduleDuration] = useState(30);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const list = await api.fetchVideoKycSessions();
      setSessions(list);
    } catch (err) {
      setError(err.message || 'Failed to load video KYC sessions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // KYC records that still need a video KYC booked
  const readyToSchedule = kycQueue.filter(
    (k) => k.status !== 'verified' && k.status !== 'rejected' && (k.videoKycStatus || 'not_scheduled') === 'not_scheduled'
  );

  const filtered = sessions.filter((s) => s.status === tab);

  const handleSchedule = async (kycId) => {
    if (!scheduleAt) {
      onToast('Pick a date and time first');
      return;
    }
    setSubmitting(true);
    try {
      await api.scheduleVideoKyc({
        kycId,
        scheduledAt: new Date(scheduleAt).toISOString(),
        durationMinutes: Number(scheduleDuration) || 30,
      });
      onToast('Video KYC scheduled & email reminder sent to customer!');
      setScheduleForId(null);
      setScheduleAt('');
      await load();
      onKycChanged?.();
    } catch (err) {
      onToast(err.message || 'Could not schedule video KYC');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (id) => {
    const reason = window.prompt('Reason for cancelling this call?');
    if (reason === null) return;
    try {
      await api.cancelVideoKyc(id, reason);
      onToast('Session cancelled');
      await load();
      onKycChanged?.();
    } catch (err) {
      onToast(err.message || 'Could not cancel session');
    }
  };

  if (activeSessionId) {
    return (
      <CallRoom
        sessionId={activeSessionId}
        onToast={onToast}
        onExit={async () => {
          setActiveSessionId(null);
          await load();
          onKycChanged?.();
        }}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">Ready to schedule ({readyToSchedule.length})</span>
        </div>
        {readyToSchedule.length === 0 && (
          <div className="cell-sub" style={{ padding: '10px 4px' }}>
            Nothing waiting — every KYC in review either has a video KYC booked already or is finished.
          </div>
        )}
        <table>
          <tbody>
            {readyToSchedule.map((k) => {
              const cc = customers.find((c) => c.id === k.userId);
              return (
                <React.Fragment key={k.id}>
                  <tr>
                    <td style={{ padding: '8px 4px' }}>
                      <div className="cell-user">
                        <div className="avatar">{cc?.avatar || '?'}</div>
                        <div>{cc?.name || k.name}<div className="cell-sub">{k.submitted}</div></div>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', padding: '8px 4px' }}>
                      {scheduleForId === k.id ? (
                        <button className="btn-outline btn-sm" onClick={() => setScheduleForId(null)}>
                          Cancel
                        </button>
                      ) : (
                        <button className="btn btn-sm" onClick={() => setScheduleForId(k.id)}>
                          Schedule
                        </button>
                      )}
                    </td>
                  </tr>
                  {scheduleForId === k.id && (
                    <tr>
                      <td colSpan={2} style={{ padding: '4px 4px 14px' }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                          <div>
                            <label className="field-label">Date &amp; time</label>
                            <input
                              className="field"
                              type="datetime-local"
                              value={scheduleAt}
                              onChange={(e) => setScheduleAt(e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="field-label">Duration (min)</label>
                            <input
                              className="field"
                              type="number"
                              min={10}
                              max={120}
                              style={{ width: 80 }}
                              value={scheduleDuration}
                              onChange={(e) => setScheduleDuration(e.target.value)}
                            />
                          </div>
                          <button className="btn btn-sm" disabled={submitting} onClick={() => handleSchedule(k.id)}>
                            {submitting ? 'Scheduling…' : 'Confirm'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="panel" style={{ padding: 0 }}>
        <div className="tabs" style={{ padding: '12px 12px 0' }}>
          {STATUS_TABS.map((t) => (
            <div key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
              {STATUS_LABEL[t]} ({sessions.filter((s) => s.status === t).length})
            </div>
          ))}
        </div>

        {loading && <div className="loading-panel">Loading sessions…</div>}
        {error && <div className="error-banner" style={{ margin: 12 }}>{error}</div>}

        {!loading && !error && (
          <table>
            <tbody>
              <tr>
                <th>Customer</th>
                <th>Scheduled</th>
                <th>Status</th>
                <th />
              </tr>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: 24, color: '#8b8880' }}>
                    No {STATUS_LABEL[tab].toLowerCase()} sessions.
                  </td>
                </tr>
              )}
              {filtered.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div className="cell-user">
                      <div className="avatar">{s.customerName.slice(0, 2).toUpperCase()}</div>
                      <div>{s.customerName}<div className="cell-sub">{s.customerPhone}</div></div>
                    </div>
                  </td>
                  <td>{fmt(s.scheduledAt)}</td>
                  <td><span className={`badge ${STATUS_BADGE[s.status] || 'badge-gray'}`}>{STATUS_LABEL[s.status] || s.status}</span></td>
                  <td style={{ textAlign: 'right' }}>
                    {(s.status === 'scheduled' || s.status === 'in_progress') && (
                      <>
                        <button className="btn btn-sm" style={{ marginRight: 6 }} onClick={() => setActiveSessionId(s.id)}>
                          {s.status === 'in_progress' ? 'Rejoin call' : 'Join call'}
                        </button>
                        {s.status === 'scheduled' && (
                          <button className="btn-danger-outline btn-sm" onClick={() => handleCancel(s.id)}>
                            Cancel
                          </button>
                        )}
                      </>
                    )}
                    {s.status === 'completed' && (
                      <button className="btn-outline btn-sm" onClick={() => setActiveSessionId(s.id)}>
                        View
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Live call room: WebRTC (peer-to-peer video/audio) + Socket.IO signaling,
// matching backend/sockets/videoKycSocket.js exactly (events: join-room,
// signal, liveness-challenge, challenge-done, recording-state, peer-joined,
// peer-left, call-ended, consent-updated, replaced).
// ---------------------------------------------------------------------------

const CHALLENGE_LABELS = {
  blink_twice: 'Blink twice',
  turn_left: 'Turn head left',
  turn_right: 'Turn head right',
  smile: 'Smile',
  read_number: 'Read the number aloud',
  show_pan: 'Show PAN card',
  show_aadhaar: 'Show Aadhaar card',
};

function CallRoom({ sessionId, onToast, onExit }) {
  const [phase, setPhase] = useState('connecting'); // connecting | live | ended | error
  const [errorMsg, setErrorMsg] = useState('');
  const [consentGiven, setConsentGiven] = useState(false);
  const [peerPresent, setPeerPresent] = useState(false);
  const [challengeTypes, setChallengeTypes] = useState([]);
  const [recording, setRecording] = useState(false);
  const [checklist, setChecklist] = useState({ faceVerified: false, documentVerified: false, livenessPassed: false, remarks: '' });
  const [savingChecklist, setSavingChecklist] = useState(false);
  const [ending, setEnding] = useState(false);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pcRef = useRef(null);
  const socketRef = useRef(null);
  const localStreamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);

  useEffect(() => {
    let cancelled = false;

    const setup = async () => {
      try {
        // 1. REST: ask the backend for permission + ICE servers
        const joinRes = await api.joinVideoKycSession(sessionId);
        if (cancelled) return;
        setConsentGiven(joinRes.session?.recordingConsentGiven === true);
        setChallengeTypes(joinRes.livenessChallengeTypes || []);

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

        // 4. Socket.IO signaling — same server, auth via the worker's JWT
        const socket = io(SOCKET_BASE, { auth: { token: getToken() } });
        socketRef.current = socket;

        socket.on('connect_error', (err) => {
          if (!cancelled) {
            setErrorMsg(err.message || 'Could not connect to the call server');
            setPhase('error');
          }
        });

        socket.on('signal', async ({ type, data }) => {
          if (!pcRef.current) return;
          try {
            if (type === 'offer') {
              await pc.setRemoteDescription(new RTCSessionDescription(data));
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              socket.emit('signal', { type: 'answer', data: answer });
            } else if (type === 'answer') {
              await pc.setRemoteDescription(new RTCSessionDescription(data));
            } else if (type === 'candidate') {
              await pc.addIceCandidate(new RTCIceCandidate(data));
            }
          } catch (err) {
            console.error('WebRTC signal error:', err);
          }
        });

        socket.on('peer-joined', async () => {
          setPeerPresent(true);
          onToast('Customer joined the call');
          // We're the officer, already in the room — we make the offer.
          try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit('signal', { type: 'offer', data: offer });
          } catch (err) {
            console.error('createOffer failed:', err);
          }
        });

        socket.on('peer-left', () => {
          setPeerPresent(false);
          onToast('Customer left the call');
        });

        socket.on('consent-updated', ({ given }) => setConsentGiven(given));

        socket.on('challenge-done', () => onToast('Customer completed the prompt'));

        socket.on('call-ended', ({ reason }) => {
          onToast(reason === 'cancelled' ? 'Session was cancelled' : 'Call ended');
          setPhase('ended');
        });

        socket.on('replaced', () => {
          onToast('This session was opened in another tab/window');
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
          setPeerPresent(Boolean(ack.peerPresent));
          setConsentGiven(Boolean(ack.recordingConsent));
          setPhase('live');
          if (ack.peerPresent) {
            // Customer was already waiting — make the offer now.
            (async () => {
              try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                socket.emit('signal', { type: 'offer', data: offer });
              } catch (err) {
                console.error('createOffer failed:', err);
              }
            })();
          }
        });
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(err.message || 'Could not start the call');
          setPhase('error');
        }
      }
    };

    setup();

    return () => {
      cancelled = true;
      recorderRef.current?.state === 'recording' && recorderRef.current.stop();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      pcRef.current?.close();
      socketRef.current?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const sendChallenge = (type) => {
    socketRef.current?.emit('liveness-challenge', { type }, (ack) => {
      if (!ack?.ok) onToast(ack?.message || 'Could not send prompt');
    });
  };

  const toggleRecording = async () => {
    if (!recording) {
      if (!consentGiven) {
        onToast('Customer has not given recording consent yet');
        return;
      }
      if (!localStreamRef.current) return;
      chunksRef.current = [];
      const recorder = new MediaRecorder(localStreamRef.current, { mimeType: 'video/webm' });
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        try {
          await api.uploadVideoKycRecording(sessionId, blob);
          onToast('Recording uploaded');
        } catch (err) {
          onToast(err.message || 'Recording upload failed');
        }
      };
      recorder.start();
      recorderRef.current = recorder;
      socketRef.current?.emit('recording-state', { recording: true }, (ack) => {
        if (!ack?.ok) { recorder.stop(); onToast(ack?.message || 'Recording not allowed'); }
        else setRecording(true);
      });
    } else {
      recorderRef.current?.stop();
      setRecording(false);
      socketRef.current?.emit('recording-state', { recording: false });
    }
  };

  const saveChecklist = async () => {
    setSavingChecklist(true);
    try {
      await api.updateVideoKycChecklist(sessionId, checklist);
      onToast('Checklist saved');
    } catch (err) {
      onToast(err.message || 'Could not save checklist');
    } finally {
      setSavingChecklist(false);
    }
  };

  const endCall = async () => {
    if (!window.confirm('End this video KYC call?')) return;
    setEnding(true);
    try {
      await saveChecklist();
      const { readyForDecision, missing } = await api.endVideoKycSession(sessionId);
      onToast(readyForDecision ? 'Call ended — ready for approve/reject' : `Call ended — still missing: ${(missing || []).join(', ')}`);
    } catch (err) {
      onToast(err.message || 'Could not end the call');
    } finally {
      setEnding(false);
      onExit();
    }
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">Video KYC call</span>
        <button className="btn-outline btn-sm" onClick={onExit}>← Back to sessions</button>
      </div>

      {phase === 'error' && <div className="error-banner">{errorMsg}</div>}
      {phase === 'connecting' && <div className="loading-panel">Setting up camera and connecting…</div>}
      {phase === 'ended' && <div className="cell-sub" style={{ padding: 12 }}>This call has ended.</div>}

      {(phase === 'live' || phase === 'connecting') && (
        <>
          <div className="grid-2" style={{ marginBottom: 14 }}>
            <div>
              <div className="cell-sub" style={{ marginBottom: 4 }}>You (officer)</div>
              <video ref={localVideoRef} autoPlay playsInline muted style={{ width: '100%', borderRadius: 10, background: '#000' }} />
            </div>
            <div>
              <div className="cell-sub" style={{ marginBottom: 4 }}>
                Customer {peerPresent ? '· connected' : '· waiting to join…'}
              </div>
              <video ref={remoteVideoRef} autoPlay playsInline style={{ width: '100%', borderRadius: 10, background: '#000' }} />
            </div>
          </div>

          <div className="kv-row">
            <span className="k">Recording consent</span>
            <span className={`badge ${consentGiven ? 'badge-green' : 'badge-amber'}`}>
              {consentGiven ? 'Given' : 'Not given yet'}
            </span>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0' }}>
            {challengeTypes.map((t) => (
              <button key={t} className="btn-outline btn-sm" onClick={() => sendChallenge(t)}>
                {CHALLENGE_LABELS[t] || t}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <button className={recording ? 'btn-danger-outline' : 'btn'} onClick={toggleRecording}>
              {recording ? '■ Stop recording' : '● Start recording'}
            </button>
          </div>

          <div className="panel-head"><span className="panel-title">Verification checklist</span></div>
          <label className="kv-row" style={{ cursor: 'pointer' }}>
            <span className="k">Face verified</span>
            <input type="checkbox" checked={checklist.faceVerified} onChange={(e) => setChecklist({ ...checklist, faceVerified: e.target.checked })} />
          </label>
          <label className="kv-row" style={{ cursor: 'pointer' }}>
            <span className="k">Document verified</span>
            <input type="checkbox" checked={checklist.documentVerified} onChange={(e) => setChecklist({ ...checklist, documentVerified: e.target.checked })} />
          </label>
          <label className="kv-row" style={{ cursor: 'pointer' }}>
            <span className="k">Liveness passed</span>
            <input type="checkbox" checked={checklist.livenessPassed} onChange={(e) => setChecklist({ ...checklist, livenessPassed: e.target.checked })} />
          </label>
          <div style={{ marginTop: 10 }}>
            <label className="field-label">Remarks</label>
            <input
              className="field"
              value={checklist.remarks}
              onChange={(e) => setChecklist({ ...checklist, remarks: e.target.value })}
              placeholder="Any notes for the record"
            />
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button className="btn-outline" disabled={savingChecklist} onClick={saveChecklist}>
              {savingChecklist ? 'Saving…' : 'Save checklist'}
            </button>
            <button className="btn-danger-outline" disabled={ending} onClick={endCall}>
              {ending ? 'Ending…' : 'End call'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
