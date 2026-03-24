import { useState, useCallback, useEffect, useRef } from 'react';
import { HalftoneCanvas } from './components/HalftoneCanvas';
import { ControlPanel } from './components/ControlPanel';
import { CameraModal } from './components/CameraModal';
import { DEFAULT_SETTINGS, type HalftoneSettings } from './utils/halftone';
import { Menu, X } from 'lucide-react';

export interface TextLayer {
  id: string;
  text: string;
  fontFamily: string;
  fontSize: number;
  x: number; // 0-1 percentage
  y: number; // 0-1 percentage
  color: string;
}

export default function App() {
  const [sourceMedia, setSourceMedia] = useState<HTMLImageElement | HTMLVideoElement | null>(null);
  const [settings, setSettings] = useState<HalftoneSettings>(DEFAULT_SETTINGS);
  const [settingsHistory, setSettingsHistory] = useState<HalftoneSettings[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [hasCamera, setHasCamera] = useState(false);
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [textLayers, setTextLayers] = useState<TextLayer[]>([]);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const appRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'Escape' && isFullscreen) {
        e.preventDefault();
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else {
          setIsFullscreen(false);
        }
      }
      if (e.key === '1') {
        setShowOriginal(prev => !prev);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isFullscreen]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      const el = appRef.current;
      if (el?.requestFullscreen) {
        el.requestFullscreen().catch(() => setIsFullscreen(prev => !prev));
      } else if ((el as any)?.webkitRequestFullscreen) {
        (el as any).webkitRequestFullscreen();
      } else {
        setIsFullscreen(prev => !prev);
      }
    }
  }, []);

  useEffect(() => {
    navigator.mediaDevices?.enumerateDevices().then(devices => {
      setHasCamera(devices.some(d => d.kind === 'videoinput'));
    }).catch(() => setHasCamera(false));
  }, []);

  const handleSettingsChange = useCallback((updates: Partial<HalftoneSettings>) => {
    setSettings(prev => {
      setSettingsHistory(h => [...h.slice(-49), prev]);
      return { ...prev, ...updates };
    });
  }, []);

  const handleUndo = useCallback(() => {
    setSettingsHistory(h => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setSettings(prev);
      return h.slice(0, -1);
    });
  }, []);

  const cleanupVideo = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.src = '';
      videoRef.current.load();
      videoRef.current = null;
    }
  }, []);

  const handleFileSelect = useCallback((file: File) => {
    if (file.type.startsWith('video/')) {
      cleanupVideo();
      const url = URL.createObjectURL(file);
      const video = document.createElement('video');
      video.src = url;
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      video.crossOrigin = 'anonymous';
      video.addEventListener('loadeddata', () => {
        videoRef.current = video;
        setSourceMedia(video);
        video.play();
      });
      video.addEventListener('error', () => {
        URL.revokeObjectURL(url);
      });
      video.load();
      return;
    }

    cleanupVideo();

    if (file.type === 'image/svg+xml' || file.name.endsWith('.svg')) {
      const reader = new FileReader();
      reader.onload = () => {
        const svgText = reader.result as string;
        const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(img.width, 800);
          canvas.height = Math.max(img.height, 800);
          const ctx = canvas.getContext('2d')!;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
          const x = (canvas.width - img.width * scale) / 2;
          const y = (canvas.height - img.height * scale) / 2;
          ctx.drawImage(img, x, y, img.width * scale, img.height * scale);

          const finalImg = new Image();
          finalImg.onload = () => {
            setSourceMedia(finalImg);
            URL.revokeObjectURL(url);
          };
          finalImg.src = canvas.toDataURL();
        };
        img.src = url;
      };
      reader.readAsText(file);
      return;
    }

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setSourceMedia(img);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }, [cleanupVideo]);

  const handleCameraCapture = useCallback((img: HTMLImageElement) => {
    cleanupVideo();
    setSourceMedia(img);
  }, [cleanupVideo]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && (file.type.startsWith('image/') || file.type.startsWith('video/') || file.name.endsWith('.svg'))) {
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const addTextLayer = useCallback(() => {
    const newLayer: TextLayer = {
      id: Date.now().toString(),
      text: 'Text',
      fontFamily: 'Arial',
      fontSize: 48,
      x: 0.5,
      y: 0.5,
      color: '#000000',
    };
    setTextLayers(prev => [...prev, newLayer]);
    setSelectedTextId(newLayer.id);
  }, []);

  const updateTextLayer = useCallback((id: string, updates: Partial<TextLayer>) => {
    setTextLayers(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l));
  }, []);

  const deleteTextLayer = useCallback((id: string) => {
    setTextLayers(prev => prev.filter(l => l.id !== id));
    setSelectedTextId(prev => prev === id ? null : prev);
  }, []);

  return (
    <div
      ref={appRef}
      className="h-screen w-screen flex flex-col lg:flex-row overflow-hidden bg-black"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {!isFullscreen && (
        <div className="lg:hidden flex items-center justify-between px-4 py-3 bg-white/80 backdrop-blur-sm border-b border-neutral-200">
          <div className="flex items-center gap-2">
            <img src="/logo-default.svg" className="w-5 h-5" alt="" />
            <span className="text-[11px] uppercase tracking-[0.2em] font-medium">0TO1 Halftone</span>
          </div>
          <button
            onClick={() => setMobileControlsOpen(!mobileControlsOpen)}
            className="p-1"
          >
            {mobileControlsOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      )}

      <main className="flex-1 relative min-h-0">
        {!isFullscreen && (
          <div className="absolute top-4 left-4 z-10 flex items-center gap-2 pointer-events-none">
            <img src="/logo-default.svg" className="w-6 h-6 hidden lg:block" alt="" />
            <span className="text-[11px] uppercase tracking-[0.25em] font-medium text-neutral-400 hidden lg:block">
              0TO1 Halftone
            </span>
          </div>
        )}

        <HalftoneCanvas
          sourceImage={sourceMedia}
          settings={settings}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          showOriginal={showOriginal}
          textLayers={textLayers}
          selectedTextId={selectedTextId}
          onSelectText={setSelectedTextId}
          onUpdateTextLayer={updateTextLayer}
        />

        {!sourceMedia && textLayers.length === 0 && !isFullscreen && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center space-y-3 opacity-30">
              <p className="text-[10px] uppercase tracking-[0.2em]">Drop image or video here</p>
            </div>
          </div>
        )}
      </main>

      {!isFullscreen && (
        <div className="hidden lg:block h-full">
          <ControlPanel
            settings={settings}
            onSettingsChange={handleSettingsChange}
            onFileSelect={handleFileSelect}
            onCameraCapture={() => setCameraOpen(true)}
            onReset={() => { setSettingsHistory(h => [...h.slice(-49), settings]); setSettings(DEFAULT_SETTINGS); }}
            onUndo={handleUndo}
            canUndo={settingsHistory.length > 0}
            hasCamera={hasCamera}
            textLayers={textLayers}
            selectedTextId={selectedTextId}
            onSelectText={setSelectedTextId}
            onAddText={addTextLayer}
            onUpdateText={updateTextLayer}
            onDeleteText={deleteTextLayer}
          />
        </div>
      )}

      {mobileControlsOpen && !isFullscreen && (
        <div className="lg:hidden fixed inset-x-0 bottom-0 top-[52px] z-40 bg-white/95 backdrop-blur-sm overflow-y-auto">
          <ControlPanel
            settings={settings}
            onSettingsChange={handleSettingsChange}
            onFileSelect={handleFileSelect}
            onCameraCapture={() => {
              setCameraOpen(true);
              setMobileControlsOpen(false);
            }}
            onReset={() => { setSettingsHistory(h => [...h.slice(-49), settings]); setSettings(DEFAULT_SETTINGS); }}
            onUndo={handleUndo}
            canUndo={settingsHistory.length > 0}
            hasCamera={hasCamera}
            textLayers={textLayers}
            selectedTextId={selectedTextId}
            onSelectText={setSelectedTextId}
            onAddText={addTextLayer}
            onUpdateText={updateTextLayer}
            onDeleteText={deleteTextLayer}
          />
        </div>
      )}

      <CameraModal
        isOpen={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={handleCameraCapture}
      />
    </div>
  );
}
