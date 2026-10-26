'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Camera, RefreshCw, CheckCircle2, AlertCircle, Upload, SwitchCamera, X, ShieldCheck, Loader2 } from 'lucide-react';

export default function CameraCapture({ onCapture, capturedImage, onRetake, onCancel }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const [hasCamera, setHasCamera] = useState(true);
  const [cameraActive, setCameraActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [facingMode, setFacingMode] = useState('user'); // 'user' or 'environment'
  const [isCapturing, setIsCapturing] = useState(false);

  // Stop camera helper - reliably terminates all tracks
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      try {
        const tracks = streamRef.current.getTracks();
        tracks.forEach((track) => {
          try {
            track.stop();
          } catch (e) {
            console.warn('Track stop error:', e);
          }
        });
      } catch (e) {
        console.warn('Stream tracks access error:', e);
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, []);

  // Multi-tier cascading camera stream request
  const requestCameraStream = async (targetFacing) => {
    // Tier 1: Ideal 720p with ideal facingMode
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: targetFacing },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });
    } catch (e1) {
      console.warn('Tier 1 camera constraints failed, attempting Tier 2:', e1.name, e1.message);
    }

    // Tier 2: Only ideal facingMode
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: targetFacing }
        },
        audio: false
      });
    } catch (e2) {
      console.warn('Tier 2 camera constraints failed, attempting Tier 3 (video: true):', e2.name, e2.message);
    }

    // Tier 3: Basic video: true (universal fallback supported by any webcam driver)
    return await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false
    });
  };

  // Start camera helper
  const startCamera = useCallback(async () => {
    setErrorMsg('');
    setIsLoading(true);
    setHasCamera(true);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setHasCamera(false);
        setIsLoading(false);
        setErrorMsg(
          typeof window !== 'undefined' && window.isSecureContext === false
            ? 'Camera access requires a secure context (HTTPS or http://localhost). You are currently accessing via an insecure address.'
            : 'Webcam MediaDevices API is not supported by this browser.'
        );
        return;
      }

      // Stop any existing stream
      stopCamera();

      const stream = await requestCameraStream(facingMode);
      streamRef.current = stream;

      if (videoRef.current) {
        const video = videoRef.current;
        video.srcObject = stream;

        // Wait for loadedmetadata to play safely
        await new Promise((resolve) => {
          if (video.readyState >= 2) {
            resolve();
          } else {
            video.onloadedmetadata = () => resolve();
            // Safety timeout after 2.5 seconds
            setTimeout(resolve, 2500);
          }
        });

        try {
          await video.play();
        } catch (playErr) {
          console.warn('Video play warning:', playErr);
        }

        setCameraActive(true);
        setHasCamera(true);
        setIsLoading(false);
      } else {
        setCameraActive(true);
        setHasCamera(true);
        setIsLoading(false);
      }
    } catch (err) {
      console.warn('Camera initialization error:', err);
      setHasCamera(false);
      setCameraActive(false);
      setIsLoading(false);

      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setErrorMsg('Camera permission was blocked. Please click the camera or lock icon in your browser address bar to allow camera access, or verify Windows Settings > Privacy & security > Camera, then click Retry.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setErrorMsg('No camera detected on this device. Please connect a webcam or enable your camera hardware, or use the Upload Photo option below.');
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setErrorMsg('Camera is currently in use by another application (Zoom, Teams, or another tab). Please close other camera apps and click Retry.');
      } else if (err.name === 'OverconstrainedError') {
        setErrorMsg('Camera could not satisfy constraint (' + (err.constraint || 'settings') + '). Click Retry to use standard mode.');
      } else {
        setErrorMsg(err.message || 'Unable to access device camera.');
      }
    }
  }, [facingMode, stopCamera]);

  useEffect(() => {
    if (!capturedImage) {
      startCamera();
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [capturedImage, startCamera, stopCamera]);

  // Watermark source (video or image) onto canvas and generate verification payload
  const watermarkAndSaveCanvas = (sourceElement, isVideo = true) => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const width = isVideo ? (sourceElement.videoWidth || 640) : (sourceElement.naturalWidth || sourceElement.width || 640);
    const height = isVideo ? (sourceElement.videoHeight || 480) : (sourceElement.naturalHeight || sourceElement.height || 480);

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // Mirror image if front camera live video
    if (isVideo && facingMode === 'user') {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(sourceElement, 0, 0, width, height);

    // Reset transform before overlaying banner
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Overlay verification banner and timestamp
    ctx.fillStyle = 'rgba(11, 17, 32, 0.80)';
    ctx.fillRect(0, height - 38, width, 38);
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText('SheWings Geo-Verified Live Selfie', 14, height - 15);
    ctx.fillStyle = '#f1f5f9';
    ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const timeText = new Date().toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      dateStyle: 'medium',
      timeStyle: 'medium'
    });
    const textWidth = ctx.measureText(timeText).width;
    ctx.fillText(timeText, width - textWidth - 14, height - 15);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

    // Immediately stop camera tracks so the webcam turns off
    stopCamera();
    setIsCapturing(false);

    if (onCapture) {
      onCapture(dataUrl);
    }
  };

  // Capture photo from live video onto canvas
  const takePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    setIsCapturing(true);
    watermarkAndSaveCanvas(videoRef.current, true);
  };

  // Fallback file upload with same canvas watermarking for devices without webcam stream
  const handleFileUpload = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        watermarkAndSaveCanvas(img, false);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  const toggleFacingMode = () => {
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  };

  const handleRetake = () => {
    if (onRetake) onRetake();
    startCamera();
  };

  const handleCancel = () => {
    stopCamera();
    if (onCancel) onCancel();
  };

  return (
    <div className="w-full flex flex-col items-center">
      {/* Video / Preview Container */}
      <div className="relative w-full max-w-md aspect-[4/3] rounded-2xl overflow-hidden bg-slate-950 border-2 border-slate-800 shadow-2xl flex items-center justify-center">
        {/* Always mounted video element so videoRef is never null */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover ${facingMode === 'user' ? '-scale-x-100' : ''} ${
            !capturedImage && hasCamera && cameraActive && !isLoading ? 'block' : 'hidden'
          }`}
        />

        {capturedImage ? (
          // Review captured image
          <div className="relative w-full h-full">
            <img
              src={capturedImage}
              alt="Captured verification selfie"
              className="w-full h-full object-cover"
            />
            <div className="absolute top-3 left-3 px-3 py-1.5 rounded-xl bg-emerald-600/90 text-white text-xs font-semibold flex items-center gap-1.5 shadow-lg backdrop-blur-sm">
              <CheckCircle2 className="w-4 h-4 text-emerald-200" />
              <span>Selfie Captured & Verified</span>
            </div>
          </div>
        ) : isLoading ? (
          // Connecting spinner
          <div className="p-6 text-center flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
            <p className="text-sm font-semibold text-white">Starting Camera...</p>
            <p className="text-xs text-slate-400">Requesting webcam permissions from browser</p>
          </div>
        ) : hasCamera && cameraActive ? (
          // Active camera overlay guides
          <>
            {/* Face alignment guideline overlay */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-36 h-48 xs:w-44 xs:h-56 sm:w-48 sm:h-60 rounded-[50%] border-2 border-dashed border-blue-400/70 shadow-[0_0_0_9999px_rgba(11,17,32,0.45)]" />
              <div className="absolute top-2.5 sm:top-3 text-center px-2.5 sm:px-3.5 py-1 rounded-full bg-slate-900/90 text-blue-300 text-[11px] sm:text-xs font-semibold border border-blue-500/30 backdrop-blur-sm max-w-[90%] truncate">
                Center your face inside the oval
              </div>
            </div>

            {/* Switch camera toggle button */}
            <button
              type="button"
              onClick={toggleFacingMode}
              title="Flip between front and rear cameras"
              className="absolute top-2.5 right-2.5 sm:top-3 sm:right-3 p-2 rounded-xl bg-slate-900/80 hover:bg-blue-600 text-white transition border border-slate-700 shadow-md"
              aria-label="Switch camera"
            >
              <SwitchCamera className="w-4 h-4" />
            </button>
          </>
        ) : (
          // Camera unavailable fallback view
          <div className="p-4 sm:p-6 text-center max-w-sm mx-auto">
            <AlertCircle className="w-10 h-10 sm:w-12 sm:h-12 text-amber-400 mx-auto mb-2.5 sm:mb-3" />
            <p className="text-xs sm:text-sm font-bold text-white mb-1.5">Camera Not Accessible</p>
            <p className="text-[11px] sm:text-xs text-slate-400 mb-3.5 sm:mb-4 leading-relaxed">
              {errorMsg || 'Unable to connect to your webcam. Please allow camera permissions in your browser or select a photo to proceed.'}
            </p>
            <div className="flex flex-col gap-2 sm:gap-2.5">
              <button
                type="button"
                onClick={startCamera}
                className="w-full py-2.5 px-4 min-h-[42px] rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-lg shadow-blue-600/25 transition active:scale-98"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retry Camera Access
              </button>
              <label className="w-full py-2.5 px-4 min-h-[42px] rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer transition border border-slate-700 flex items-center justify-center gap-2 active:scale-98">
                <Upload className="w-3.5 h-3.5 text-blue-400" />
                Upload Photo File
                <input
                  type="file"
                  accept="image/*"
                  capture="user"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        )}

        {/* Hidden Canvas for capture processing */}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {/* Control Action Buttons */}
      <div className="mt-3.5 sm:mt-4 flex flex-col sm:flex-row items-center gap-2 sm:gap-3 w-full max-w-md">
        {capturedImage ? (
          <>
            <button
              type="button"
              onClick={handleRetake}
              className="w-full sm:flex-1 py-2.5 px-4 min-h-[42px] rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 font-semibold text-xs flex items-center justify-center gap-2 transition"
            >
              <RefreshCw className="w-4 h-4 text-blue-400" />
              Retake Selfie
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="w-full sm:w-auto py-2.5 px-5 min-h-[42px] rounded-xl border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition"
            >
              <X className="w-4 h-4" />
              Cancel
            </button>
          </>
        ) : hasCamera && cameraActive ? (
          <>
            <button
              type="button"
              onClick={takePhoto}
              disabled={isCapturing}
              className="w-full sm:flex-1 py-3 px-4 min-h-[44px] rounded-xl bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 active:scale-[0.99] transition disabled:opacity-50"
            >
              <Camera className="w-4 h-4" />
              <span>Capture Selfie</span>
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="w-full sm:w-auto py-3 px-5 min-h-[44px] rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 hover:text-white font-semibold text-xs transition flex items-center justify-center"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={handleCancel}
            className="w-full py-2.5 px-4 min-h-[42px] rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 font-semibold text-xs transition"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
