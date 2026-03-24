import { useRef, useEffect, useState, useCallback } from 'react';
import { X, Camera, RotateCcw } from 'lucide-react';

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (image: HTMLImageElement) => void;
}

export function CameraModal({ isOpen, onClose, onCapture }: CameraModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [ready, setReady] = useState(false);

  const startCamera = useCallback(async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => setReady(true);
      }
    } catch (err) {
      console.error('Camera error:', err);
    }
  }, [facingMode]);

  useEffect(() => {
    if (isOpen) {
      startCamera();
    }
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      setReady(false);
    };
  }, [isOpen, startCamera]);

  const handleCapture = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0);

    const img = new Image();
    img.onload = () => {
      onCapture(img);
      onClose();
    };
    img.src = canvas.toDataURL('image/jpeg', 0.9);
  }, [onCapture, onClose]);

  const toggleFacing = useCallback(() => {
    setFacingMode(prev => (prev === 'user' ? 'environment' : 'user'));
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center">
      <div className="relative w-full max-w-2xl mx-4">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute -top-12 right-0 text-white/70 hover:text-white transition-colors z-10"
        >
          <X size={24} />
        </button>

        {/* Video */}
        <div className="relative bg-black rounded overflow-hidden aspect-[4/3]">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
          {!ready && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-white/50 text-xs uppercase tracking-widest">Loading camera...</span>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-4 mt-4">
          <button
            onClick={toggleFacing}
            className="p-3 text-white/70 hover:text-white transition-colors"
          >
            <RotateCcw size={20} />
          </button>
          <button
            onClick={handleCapture}
            disabled={!ready}
            className="w-16 h-16 rounded-full border-4 border-white flex items-center justify-center
                      hover:bg-white/20 transition-colors disabled:opacity-30"
          >
            <Camera size={24} className="text-white" />
          </button>
          <div className="w-11" /> {/* spacer */}
        </div>
      </div>
    </div>
  );
}
