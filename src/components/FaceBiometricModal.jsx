import React, { useEffect, useRef, useState } from 'react';
import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';
import { X, ShieldAlert, ScanFace, Eye } from 'lucide-react';

// 40 key 3D facial geometry indices (eyes, irises, eyebrows, nose, jawline, mouth)
const KEY_LANDMARK_INDICES = [
  1, 4, 5, 6, 19, 94, 168, 195, 197,
  33, 133, 159, 145, 362, 263, 386, 374,
  468, 473,
  70, 63, 105, 66, 107, 300, 293, 334, 296, 336,
  61, 291, 0, 17, 78, 308,
  10, 152, 234, 454, 172, 397
];

const CONTOUR_INDICES = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109, 10];

function extractFaceDescriptor(landmarks) {
  const nose = landmarks[1];
  const leftEye = landmarks[33];
  const rightEye = landmarks[263];
  if (!nose || !leftEye || !rightEye) return null;

  const dx = rightEye.x - leftEye.x;
  const dy = rightEye.y - leftEye.y;
  const dz = (rightEye.z || 0) - (leftEye.z || 0);
  const scale = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (!scale || scale < 0.01) return null;

  const vec = [];
  for (const idx of KEY_LANDMARK_INDICES) {
    const pt = landmarks[idx];
    if (!pt) {
      vec.push(0, 0, 0);
    } else {
      vec.push((pt.x - nose.x) / scale, (pt.y - nose.y) / scale, ((pt.z || 0) - (nose.z || 0)) / scale);
    }
  }
  return vec;
}

function averageDescriptors(list) {
  if (!list.length) return [];
  const len = list[0].length;
  const avg = new Array(len).fill(0);
  for (const d of list) {
    for (let i = 0; i < len; i++) avg[i] += d[i];
  }
  return avg.map((v) => Number((v / list.length).toFixed(5)));
}

export default function FaceBiometricModal({
  mode = 'verify', // 'verify' | 'enroll'
  labelInput = 'Admin Face ID',
  authHeaders = {},
  secretCode = '',
  onSuccess,
  onClose
}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const landmarkerRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);

  const [statusText, setStatusText] = useState('INITIALIZING NEURAL OPTICS...');
  const [subText, setSubText] = useState('Loading 478-point 3D Face & Iris Landmarker');
  const [livenessDone, setLivenessDone] = useState(mode === 'enroll');
  const [blinkScore, setBlinkScore] = useState(0);
  const [progressPct, setProgressPct] = useState(0);
  const [logs, setLogs] = useState([
    '> BOOTING SLHF-BIOMETRIC-KERNEL v4.2',
    '> ALLOCATING WEBGPU / WASM TENSOR ENGINE...'
  ]);
  const [errorMsg, setErrorMsg] = useState('');
  const [grantedInfo, setGrantedInfo] = useState(null);

  const samplesRef = useRef([]);
  const livenessRef = useRef(mode === 'enroll');
  const submittingRef = useRef(false);

  const pushLog = (msg) => {
    setLogs((prev) => [...prev.slice(-6), msg]);
  };

  useEffect(() => {
    let cancelled = false;

    async function startBiometrics() {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm'
        );
        if (cancelled) return;

        const landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
            delegate: 'GPU'
          },
          outputFaceBlendshapes: true,
          runningMode: 'VIDEO',
          numFaces: 1
        });
        if (cancelled) return;
        landmarkerRef.current = landmarker;

        pushLog('> VISION MODEL ONLINE [478 LANDMARKS + IRIS]');
        setStatusText('REQUESTING OPTICAL CAMERA ACCESS...');

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        pushLog('> CAMERA STREAM LOCKED [640x480 @ 30FPS]');
        setStatusText(mode === 'enroll' ? 'HOLD STEADY — CAPTURING FACE VECTOR' : 'EYE-TRACKING LOCKED — BLINK TO VERIFY');
        setSubText(
          mode === 'enroll'
            ? 'Look directly at the camera to enroll your 3D biometric signature'
            : 'Blink your eyes once to pass anti-spoof liveness verification'
        );

        const detectFrame = async () => {
          if (cancelled) return;
          const video = videoRef.current;
          const canvas = canvasRef.current;
          if (video && canvas && video.readyState >= 2 && landmarkerRef.current) {
            if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
            }
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const results = landmarkerRef.current.detectForVideo(video, performance.now());
            if (results.faceLandmarks && results.faceLandmarks.length > 0) {
              const lm = results.faceLandmarks[0];
              const w = canvas.width;
              const h = canvas.height;

              // Draw cyber face contour
              ctx.strokeStyle = livenessRef.current ? 'rgba(0, 255, 136, 0.65)' : 'rgba(0, 229, 255, 0.65)';
              ctx.lineWidth = 1.4;
              ctx.beginPath();
              CONTOUR_INDICES.forEach((idx, i) => {
                const pt = lm[idx];
                if (!pt) return;
                const x = w - pt.x * w;
                const y = pt.y * h;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
              });
              ctx.stroke();

              // Draw glowing Eye-Tracking Reticles (Left Iris 468, Right Iris 473)
              const drawEyeReticle = (irisPt, label) => {
                if (!irisPt) return;
                const ex = w - irisPt.x * w;
                const ey = irisPt.y * h;
                ctx.strokeStyle = '#00ff88';
                ctx.lineWidth = 1.6;
                ctx.beginPath();
                ctx.arc(ex, ey, 14, 0, Math.PI * 2);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(ex - 20, ey);
                ctx.lineTo(ex - 8, ey);
                ctx.moveTo(ex + 8, ey);
                ctx.lineTo(ex + 20, ey);
                ctx.moveTo(ex, ey - 20);
                ctx.lineTo(ex, ey - 8);
                ctx.moveTo(ex, ey + 8);
                ctx.lineTo(ex, ey + 20);
                ctx.stroke();
                ctx.fillStyle = '#00e5ff';
                ctx.font = '10px monospace';
                ctx.fillText(label, ex - 18, ey - 20);
              };

              drawEyeReticle(lm[468] || lm[159], 'IRIS_L');
              drawEyeReticle(lm[473] || lm[386], 'IRIS_R');

              // Check eye blink blendshapes for real liveness
              let bScore = 0;
              if (results.faceBlendshapes && results.faceBlendshapes.length > 0) {
                const cats = results.faceBlendshapes[0].categories || [];
                const bl = cats.find((c) => c.categoryName === 'eyeBlinkLeft')?.score || 0;
                const br = cats.find((c) => c.categoryName === 'eyeBlinkRight')?.score || 0;
                bScore = Math.max(bl, br);
                setBlinkScore(Math.round(bScore * 100));
              }

              if (!livenessRef.current && bScore >= 0.42) {
                livenessRef.current = true;
                setLivenessDone(true);
                pushLog(`> LIVENESS CONFIRMED [BLINK=${(bScore * 100).toFixed(0)}%]`);
                setStatusText('LIVENESS VERIFIED — MATCHING BIOMETRIC HASH');
                setSubText('Hold steady while comparing 3D facial geometry...');
              }

              if (livenessRef.current && !submittingRef.current) {
                const desc = extractFaceDescriptor(lm);
                if (desc) {
                  samplesRef.current.push(desc);
                  const targetCount = mode === 'enroll' ? 8 : 5;
                  setProgressPct(Math.min(100, Math.round((samplesRef.current.length / targetCount) * 100)));

                  if (samplesRef.current.length >= targetCount) {
                    submittingRef.current = true;
                    const avgDesc = averageDescriptors(samplesRef.current);
                    pushLog(`> VECTOR EXTRACTED [${avgDesc.length}D] -> TRANSMITTING...`);

                    if (mode === 'enroll') {
                      const res = await fetch('/api/manage/face/register', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          ...authHeaders
                        },
                        body: JSON.stringify({
                          code: secretCode,
                          descriptor: avgDesc,
                          label: labelInput || 'Admin Face ID'
                        })
                      });
                      const data = await res.json();
                      if (!res.ok) {
                        setErrorMsg(data.error || 'Enrollment failed.');
                        pushLog(`> ERROR: ${data.error || 'ENROLLMENT_REJECTED'}`);
                      } else {
                        setGrantedInfo({ title: 'FACE ID ENROLLED', sub: data.face?.label || 'Admin Face ID' });
                        pushLog('> SIGNATURE STORED IN ENCRYPTED VAULT');
                        setTimeout(() => onSuccess && onSuccess(data), 900);
                      }
                    } else {
                      const res = await fetch('/api/manage/face/verify', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          descriptor: avgDesc,
                          livenessPassed: true
                        })
                      });
                      const data = await res.json();
                      if (!res.ok || !data.verified) {
                        setErrorMsg(data.error || 'Identity mismatch. Access denied.');
                        pushLog(`> INTRUSION ALERT: MATCH=${data.similarity || 0}%`);
                      } else {
                        setGrantedInfo({
                          title: `ACCESS GRANTED (${data.similarity}%)`,
                          sub: `IDENTITY: ${data.label}`
                        });
                        pushLog(`> ACCESS GRANTED [MATCH=${data.similarity}%]`);
                        setTimeout(() => onSuccess && onSuccess(data), 900);
                      }
                    }
                  }
                }
              }
            } else {
              ctx.fillStyle = 'rgba(255, 70, 70, 0.85)';
              ctx.font = 'bold 13px monospace';
              ctx.fillText('NO FACE TARGET DETECTED', 20, 32);
            }
          }
          rafRef.current = requestAnimationFrame(detectFrame);
        };

        rafRef.current = requestAnimationFrame(detectFrame);
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(err?.message || 'Camera or FaceLandmarker initialization failed.');
          pushLog(`> FATAL: ${err?.message || 'OPTIC_INIT_ERR'}`);
        }
      }
    }

    startBiometrics();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (landmarkerRef.current && landmarkerRef.current.close) {
        landmarkerRef.current.close();
      }
    };
  }, [mode]);

  const handleRetry = () => {
    samplesRef.current = [];
    submittingRef.current = false;
    livenessRef.current = mode === 'enroll';
    setLivenessDone(mode === 'enroll');
    setProgressPct(0);
    setErrorMsg('');
    setGrantedInfo(null);
    pushLog('> RE-ARMING BIOMETRIC SCANNER...');
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 font-mono">
      <div className="relative w-full max-w-2xl bg-[#030712] border border-[#00ff88]/40 rounded-2xl shadow-[0_0_50px_rgba(0,255,136,0.18)] overflow-hidden text-[#00ff88]">
        {/* Top Cyber HUD Bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#00ff88]/25 bg-[#050d16]">
          <div className="flex items-center gap-2.5">
            <ScanFace className="w-4 h-4 text-[#00e5ff] animate-pulse" />
            <span className="text-xs font-bold tracking-widest uppercase text-[#00ff88]">
              SLHF // BIOMETRIC OPTIC SCANNER [{mode === 'enroll' ? 'ENROLL' : 'VERIFY'}]
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close biometric scanner"
            className="text-[#00ff88]/70 hover:text-white p-1 rounded transition-colors"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>

        {/* Camera Viewport with HUD Reticle */}
        <div className="relative bg-black aspect-video w-full overflow-hidden">
          <video
            ref={videoRef}
            playsInline
            muted
            className="w-full h-full object-cover scale-x-[-1] opacity-90"
          />
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none"
          />

          {/* Cyber Corner Brackets */}
          <div className="absolute top-3 left-3 w-6 h-6 border-t-2 border-l-2 border-[#00ff88]" />
          <div className="absolute top-3 right-3 w-6 h-6 border-t-2 border-r-2 border-[#00ff88]" />
          <div className="absolute bottom-3 left-3 w-6 h-6 border-b-2 border-l-2 border-[#00ff88]" />
          <div className="absolute bottom-3 right-3 w-6 h-6 border-b-2 border-r-2 border-[#00ff88]" />

          {/* Telemetry Overlay */}
          <div className="absolute top-3 left-11 text-[10px] leading-tight text-[#00e5ff] bg-black/60 px-2 py-1 rounded border border-[#00e5ff]/30">
            <div>EYE_TRACKING: {livenessDone ? 'LOCKED' : 'AWAITING_BLINK'}</div>
            <div>BLINK_CONF: {blinkScore}% | CAPTURE: {progressPct}%</div>
          </div>

          {grantedInfo && (
            <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center text-center p-4">
              <div className="px-5 py-3 border-2 border-[#00ff88] bg-[#00ff88]/10 rounded-xl">
                <div className="text-lg font-black tracking-widest text-[#00ff88]">{grantedInfo.title}</div>
                <div className="text-xs text-[#00e5ff] mt-1">{grantedInfo.sub}</div>
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center text-center p-5 gap-3">
              <ShieldAlert className="w-8 h-8 text-red-500" />
              <div className="text-xs sm:text-sm text-red-400 font-bold max-w-md">{errorMsg}</div>
              <button
                type="button"
                onClick={handleRetry}
                className="px-4 py-2 rounded-lg border border-[#00ff88] text-[#00ff88] hover:bg-[#00ff88]/15 text-xs font-bold uppercase tracking-wider"
              >
                Retry Scan
              </button>
            </div>
          )}
        </div>

        {/* Status & Scrolling Terminal Log */}
        <div className="p-4 space-y-3 bg-[#030712] border-t border-[#00ff88]/25">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-[#00ff88] flex items-center gap-2">
                <Eye className="w-3.5 h-3.5 text-[#00e5ff]" />
                <span>{statusText}</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">{subText}</div>
            </div>
            <div className="text-xs font-bold text-[#00e5ff]">{progressPct}%</div>
          </div>

          <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden border border-[#00ff88]/20">
            <div
              className="h-full bg-gradient-to-r from-[#00e5ff] to-[#00ff88] transition-all duration-150"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          <div className="bg-black/80 border border-[#00ff88]/20 rounded-lg p-2.5 text-[10px] text-[#00ff88]/80 space-y-0.5 h-24 overflow-hidden">
            {logs.map((line, i) => (
              <div key={i} className="truncate">
                {line}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
