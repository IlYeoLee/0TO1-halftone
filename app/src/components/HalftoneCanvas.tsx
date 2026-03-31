import { useRef, useEffect, useCallback, useState } from 'react';
import {
  loadLogoShapes,
  renderHalftone,
  createAnimationState,
  imageToImageData,
  clearLogoCache,
  type HalftoneSettings,
  type AnimationState,
  type MouseState,
} from '../utils/halftone';
import type { TextLayer } from '../App';

interface HalftoneCanvasProps {
  sourceImage: HTMLImageElement | HTMLVideoElement | null;
  settings: HalftoneSettings;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  showOriginal: boolean;
  showCursor: boolean;
  bgMedia: HTMLImageElement | HTMLVideoElement | null;
  textLayers: TextLayer[];
  selectedTextId: string | null;
  onSelectText: (id: string | null) => void;
  onUpdateTextLayer: (id: string, updates: Partial<TextLayer>) => void;
  className?: string;
}

export function HalftoneCanvas({
  sourceImage, settings, isFullscreen, onToggleFullscreen,
  showOriginal, showCursor, bgMedia, textLayers, selectedTextId, onSelectText, onUpdateTextLayer,
  className,
}: HalftoneCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<AnimationState>(createAnimationState());
  const recAnimRef = useRef<AnimationState>(createAnimationState());
  const rafRef = useRef<number>(0);
  const shapesRef = useRef<Awaited<ReturnType<typeof loadLogoShapes>> | null>(null);
  const imageDataRef = useRef<ImageData | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mouseRef = useRef<MouseState>({ x: 0, y: 0, active: false });
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [showFsToast, setShowFsToast] = useState(false);
  const fsToastTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [isRecording, setIsRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isRecordingRef = useRef(false);
  const recCanvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas'));
  const [lottieProgress, setLottieProgress] = useState<number | null>(null);
  const [cropMode, setCropMode] = useState(false);
  const [cropRect, setCropRect] = useState({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
  const cropDragRef = useRef<{
    type: 'move' | 'tl' | 'tr' | 'bl' | 'br' | 't' | 'b' | 'l' | 'r';
    startX: number; startY: number;
    origRect: typeof cropRect;
  } | null>(null);

  // Text overlay ImageData (rendered text at canvas resolution for halftone blending)
  const textOverlayRef = useRef<ImageData | null>(null);
  const textCanvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas'));

  // Text dragging
  const dragRef = useRef<{ id: string; startX: number; startY: number; origX: number; origY: number } | null>(null);

  // Inline editing
  const textEditRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [editingTextId, setEditingTextId] = useState<string | null>(null);

  useEffect(() => {
    if (isFullscreen) {
      setShowFsToast(true);
      clearTimeout(fsToastTimeout.current);
      fsToastTimeout.current = setTimeout(() => setShowFsToast(false), 2500);
    } else {
      setShowFsToast(false);
    }
  }, [isFullscreen]);

  const dpr = window.devicePixelRatio || 1;

  useEffect(() => {
    const updateSize = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const w = Math.floor(rect.width);
      const h = Math.floor(rect.height);
      // On mobile (portrait), keep width full and use 16:9 aspect ratio
      const isMobilePortrait = w < 1024 && h > w;
      if (isMobilePortrait) {
        const canvasH = Math.floor(w * 9 / 16);
        setDimensions({ width: w, height: canvasH });
      } else {
        setDimensions({ width: w, height: h });
      }
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    loadLogoShapes().then(shapes => { shapesRef.current = shapes; });
  }, []);

  useEffect(() => { clearLogoCache(); }, [settings.dotColor, settings.dotColorV1, settings.dotColorV2, settings.dotColorV3, settings.dotColorV4, settings.gridSize]);

  useEffect(() => {
    if (!sourceImage) { imageDataRef.current = null; return; }
    if (sourceImage instanceof HTMLVideoElement) return;
    const maxDim = Math.max(dimensions.width, dimensions.height) * dpr;
    imageDataRef.current = imageToImageData(sourceImage, maxDim);
    animRef.current.phase = null;
  }, [sourceImage, dimensions, dpr]);

  // Build text overlay ImageData when text layers change
  useEffect(() => {
    if (textLayers.length === 0) {
      textOverlayRef.current = null;
      return;
    }

    const w = Math.floor(dimensions.width * dpr);
    const h = Math.floor(dimensions.height * dpr);
    if (w <= 0 || h <= 0) return;

    const canvas = textCanvasRef.current;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, w, h);

    for (const layer of textLayers) {
      ctx.save();
      ctx.font = `${layer.fontSize * dpr}px "${layer.fontFamily}"`;
      ctx.fillStyle = layer.color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(layer.text, layer.x * w, layer.y * h);
      ctx.restore();
    }

    textOverlayRef.current = ctx.getImageData(0, 0, w, h);
  }, [textLayers, dimensions, dpr]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    mouseRef.current = {
      x: (e.clientX - rect.left) * dpr,
      y: (e.clientY - rect.top) * dpr,
      active: true,
    };
  }, [dpr]);

  const handleMouseLeave = useCallback(() => {
    mouseRef.current = { ...mouseRef.current, active: false };
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const touch = e.touches[0];
    if (!touch) return;
    const rect = canvas.getBoundingClientRect();
    mouseRef.current = {
      x: (touch.clientX - rect.left) * dpr,
      y: (touch.clientY - rect.top) * dpr,
      active: true,
    };
  }, [dpr]);

  const handleTouchEnd = useCallback(() => {
    mouseRef.current = { ...mouseRef.current, active: false };
  }, []);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const shapes = shapesRef.current;
    if (!canvas || !shapes) {
      rafRef.current = requestAnimationFrame(render);
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = dimensions.width * dpr;
    const h = dimensions.height * dpr;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    if (sourceImage instanceof HTMLVideoElement && !sourceImage.paused) {
      imageDataRef.current = imageToImageData(sourceImage, Math.max(w, h));
    }

    const imageData = imageDataRef.current;
    const overlay = textOverlayRef.current;

    if (showOriginal && sourceImage) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      const sw = sourceImage instanceof HTMLVideoElement ? sourceImage.videoWidth : sourceImage.naturalWidth;
      const sh = sourceImage instanceof HTMLVideoElement ? sourceImage.videoHeight : sourceImage.naturalHeight;
      const scale = Math.min(w / sw, h / sh);
      const dx = (w - sw * scale) / 2;
      const dy = (h - sh * scale) / 2;
      ctx.drawImage(sourceImage, dx, dy, sw * scale, sh * scale);
      // Draw text as-is on original view
      for (const layer of textLayers) {
        ctx.save();
        ctx.font = `${layer.fontSize * dpr}px "${layer.fontFamily}"`;
        ctx.fillStyle = layer.color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(layer.text, layer.x * w, layer.y * h);
        ctx.restore();
      }
    } else if (!imageData && !overlay) {
      // No halftone source — just draw background
      if (bgMedia) {
        const bw = bgMedia instanceof HTMLVideoElement ? bgMedia.videoWidth : bgMedia.naturalWidth;
        const bh = bgMedia instanceof HTMLVideoElement ? bgMedia.videoHeight : bgMedia.naturalHeight;
        if (bw > 0 && bh > 0) {
          const scale = Math.max(w / bw, h / bh);
          const dw = bw * scale;
          const dh = bh * scale;
          ctx.drawImage(bgMedia, (w - dw) / 2, (h - dh) / 2, dw, dh);
        } else {
          ctx.fillStyle = settings.bgColor;
          ctx.fillRect(0, 0, w, h);
        }
      } else {
        ctx.fillStyle = settings.bgColor;
        ctx.fillRect(0, 0, w, h);
      }
    } else {
      const isMobile = dimensions.width < 1024;
      const mobileScale = isMobile ? 0.5 : 1;
      const scaledSettings = { ...settings, gridSize: Math.round(settings.gridSize * dpr * mobileScale) };
      renderHalftone(ctx, imageData, w, h, shapes, scaledSettings, animRef.current, mouseRef.current, overlay ?? undefined, bgMedia);
    }

    // Render to offscreen 1920×1080 transparent canvas when recording
    if (isRecordingRef.current) {
      const RW = 1920, RH = 1080;
      const recCanvas = recCanvasRef.current;
      if (recCanvas.width !== RW || recCanvas.height !== RH) {
        recCanvas.width = RW;
        recCanvas.height = RH;
      }
      const rctx = recCanvas.getContext('2d');
      if (rctx) {
        let recOverlay: ImageData | undefined;
        if (textLayers.length > 0) {
          const tCanvas = document.createElement('canvas');
          tCanvas.width = RW; tCanvas.height = RH;
          const tCtx = tCanvas.getContext('2d')!;
          const sf = RW / dimensions.width;
          for (const layer of textLayers) {
            tCtx.save();
            tCtx.font = `${layer.fontSize * sf}px "${layer.fontFamily}"`;
            tCtx.fillStyle = layer.color;
            tCtx.textAlign = 'center';
            tCtx.textBaseline = 'middle';
            tCtx.fillText(layer.text, layer.x * RW, layer.y * RH);
            tCtx.restore();
          }
          recOverlay = tCtx.getImageData(0, 0, RW, RH);
        }
        const sf = RW / dimensions.width;
        const recSettings = { ...settings, gridSize: Math.round(settings.gridSize * sf) };
        const recImgData = sourceImage ? imageToImageData(sourceImage, Math.max(RW, RH)) : imageDataRef.current;
        // Use separate animState to avoid phase array conflicts with display canvas
        recAnimRef.current.time = animRef.current.time;
        renderHalftone(rctx, recImgData, RW, RH, shapes, recSettings, recAnimRef.current, undefined, recOverlay, null, true);
      }
    }

    animRef.current.time += 0.016;
    rafRef.current = requestAnimationFrame(render);
  }, [sourceImage, settings, dimensions, dpr, showOriginal, bgMedia, textLayers]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafRef.current);
  }, [render]);

  const exportCanvas = useCallback(async () => {
    const shapes = shapesRef.current;
    if (!shapes) return;

    const exportW = 3840;
    const exportH = Math.round(exportW * (dimensions.height / dimensions.width));
    const offscreen = document.createElement('canvas');
    offscreen.width = exportW;
    offscreen.height = exportH;
    const ctx = offscreen.getContext('2d')!;

    // Build text overlay at export resolution
    let exportTextOverlay: ImageData | undefined;
    if (textLayers.length > 0) {
      const tCanvas = document.createElement('canvas');
      tCanvas.width = exportW;
      tCanvas.height = exportH;
      const tCtx = tCanvas.getContext('2d')!;
      const scaleFactor = exportW / dimensions.width;
      for (const layer of textLayers) {
        tCtx.save();
        tCtx.font = `${layer.fontSize * scaleFactor}px "${layer.fontFamily}"`;
        tCtx.fillStyle = layer.color;
        tCtx.textAlign = 'center';
        tCtx.textBaseline = 'middle';
        tCtx.fillText(layer.text, layer.x * exportW, layer.y * exportH);
        tCtx.restore();
      }
      exportTextOverlay = tCtx.getImageData(0, 0, exportW, exportH);
    }

    const imgData = imageDataRef.current;

    if (showOriginal && sourceImage) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, exportW, exportH);
      const sw = sourceImage instanceof HTMLVideoElement ? sourceImage.videoWidth : sourceImage.naturalWidth;
      const sh = sourceImage instanceof HTMLVideoElement ? sourceImage.videoHeight : sourceImage.naturalHeight;
      const scale = Math.min(exportW / sw, exportH / sh);
      const dx = (exportW - sw * scale) / 2;
      const dy = (exportH - sh * scale) / 2;
      ctx.drawImage(sourceImage, dx, dy, sw * scale, sh * scale);
      // Text on original
      for (const layer of textLayers) {
        const sf = exportW / dimensions.width;
        ctx.save();
        ctx.font = `${layer.fontSize * sf}px "${layer.fontFamily}"`;
        ctx.fillStyle = layer.color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(layer.text, layer.x * exportW, layer.y * exportH);
        ctx.restore();
      }
    } else if (!imgData && !exportTextOverlay) {
      ctx.fillStyle = settings.bgColor;
      ctx.fillRect(0, 0, exportW, exportH);
    } else {
      const scaleFactor = exportW / dimensions.width;
      const exportSettings = {
        ...settings,
        gridSize: Math.round(settings.gridSize * scaleFactor),
      };
      const highResImgData = sourceImage
        ? imageToImageData(sourceImage, Math.max(exportW, exportH))
        : imgData;
      renderHalftone(ctx, highResImgData, exportW, exportH, shapes, exportSettings, createAnimationState(), undefined, exportTextOverlay, bgMedia);
    }

    offscreen.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `0TO1-halftone-4K-${Date.now()}.png`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  }, [settings, dimensions, sourceImage, showOriginal, bgMedia, textLayers]);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
    } else {
      // Initialize offscreen canvas at 1920×1080
      const recCanvas = recCanvasRef.current;
      recCanvas.width = 1920;
      recCanvas.height = 1080;

      recordedChunksRef.current = [];
      // VP9 supports alpha channel (transparent background)
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm;codecs=vp8';
      const stream = recCanvas.captureStream(60);
      const mr = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 40_000_000 });

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `0TO1-halftone-transparent-${Date.now()}.webm`;
        a.click();
        URL.revokeObjectURL(url);
        isRecordingRef.current = false;
        setIsRecording(false);
        setRecSeconds(0);
        if (recTimerRef.current) clearInterval(recTimerRef.current);
      };

      mr.start(100);
      mediaRecorderRef.current = mr;
      isRecordingRef.current = true;
      setIsRecording(true);
      setRecSeconds(0);
      recTimerRef.current = setInterval(() => setRecSeconds(s => s + 1), 1000);
    }
  }, [isRecording]);

  const exportLottie = useCallback(async (durationSec = 3, fps = 24) => {
    const shapes = shapesRef.current;
    if (!shapes) return;

    const RW = 1920, RH = 1080;
    // Crop pixel coords at 1920x1080
    const cx = Math.round(cropRect.x * RW);
    const cy = Math.round(cropRect.y * RH);
    const cw = Math.round(cropRect.w * RW);
    const ch = Math.round(cropRect.h * RH);

    const totalFrames = Math.round(durationSec * fps);
    const lottieAnim: AnimationState = createAnimationState();
    const offCanvas = document.createElement('canvas');
    offCanvas.width = RW; offCanvas.height = RH;
    const ctx = offCanvas.getContext('2d')!;
    // Crop canvas — actual export size
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = cw; cropCanvas.height = ch;
    const cropCtx = cropCanvas.getContext('2d')!;

    const sf = RW / dimensions.width;
    const frameSettings = { ...settings, gridSize: Math.round(settings.gridSize * sf) };

    const assets: object[] = [];
    const layers: object[] = [];

    for (let i = 0; i < totalFrames; i++) {
      lottieAnim.time = i * 0.016 * (fps / 60);

      // Build text overlay
      let recOverlay: ImageData | undefined;
      if (textLayers.length > 0) {
        const tc = document.createElement('canvas');
        tc.width = RW; tc.height = RH;
        const tCtx = tc.getContext('2d')!;
        for (const layer of textLayers) {
          tCtx.save();
          tCtx.font = `${layer.fontSize * sf}px "${layer.fontFamily}"`;
          tCtx.fillStyle = layer.color;
          tCtx.textAlign = 'center';
          tCtx.textBaseline = 'middle';
          tCtx.fillText(layer.text, layer.x * RW, layer.y * RH);
          tCtx.restore();
        }
        recOverlay = tCtx.getImageData(0, 0, RW, RH);
      }

      const imgData = sourceImage ? imageToImageData(sourceImage, Math.max(RW, RH)) : imageDataRef.current;
      renderHalftone(ctx, imgData, RW, RH, shapes, frameSettings, lottieAnim, undefined, recOverlay, null, true);

      // Crop the rendered frame
      cropCtx.clearRect(0, 0, cw, ch);
      cropCtx.drawImage(offCanvas, cx, cy, cw, ch, 0, 0, cw, ch);

      const dataUrl = cropCanvas.toDataURL('image/png');
      const id = `fr_${i}`;
      assets.push({ id, w: cw, h: ch, u: '', p: dataUrl, e: 1 });
      layers.push({
        ddd: 0, ind: i + 1, ty: 2, nm: `frame_${i}`,
        refId: id, sr: 1,
        ks: {
          o: { a: 0, k: 100 }, r: { a: 0, k: 0 },
          p: { a: 0, k: [cw / 2, ch / 2, 0] },
          a: { a: 0, k: [cw / 2, ch / 2, 0] },
          s: { a: 0, k: [100, 100, 100] },
        },
        ip: i, op: i + 1, st: 0, bm: 0,
      });

      setLottieProgress(Math.round(((i + 1) / totalFrames) * 100));
      await new Promise(r => setTimeout(r, 0));
    }

    const lottieJson = {
      v: '5.5.2', fr: fps, ip: 0, op: totalFrames,
      w: cw, h: ch, nm: '0TO1-halftone', ddd: 0,
      assets, layers,
    };

    const blob = new Blob([JSON.stringify(lottieJson)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `0TO1-halftone-${durationSec}s-${fps}fps.json`;
    a.click();
    URL.revokeObjectURL(url);
    setLottieProgress(null);
  }, [settings, dimensions, sourceImage, textLayers, cropRect]);

  // Crop drag handlers
  useEffect(() => {
    if (!cropMode) return;
    const onMove = (e: MouseEvent) => {
      const d = cropDragRef.current;
      if (!d || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const dx = (e.clientX - d.startX) / rect.width;
      const dy = (e.clientY - d.startY) / rect.height;
      const o = d.origRect;
      const MIN = 0.05;
      setCropRect(prev => {
        let { x, y, w, h } = o;
        if (d.type === 'move') {
          x = Math.max(0, Math.min(1 - w, o.x + dx));
          y = Math.max(0, Math.min(1 - h, o.y + dy));
        } else {
          if (d.type.includes('l')) { const nx = Math.min(o.x + o.w - MIN, o.x + dx); w = o.w - (nx - o.x); x = nx; }
          if (d.type.includes('r')) { w = Math.max(MIN, Math.min(1 - o.x, o.w + dx)); }
          if (d.type.includes('t')) { const ny = Math.min(o.y + o.h - MIN, o.y + dy); h = o.h - (ny - o.y); y = ny; }
          if (d.type.includes('b')) { h = Math.max(MIN, Math.min(1 - o.y, o.h + dy)); }
        }
        return { x, y, w, h };
      });
      void prev;
    };
    const onUp = () => { cropDragRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [cropMode]);

  const startCropDrag = (e: React.MouseEvent, type: typeof cropDragRef.current extends null ? never : NonNullable<typeof cropDragRef.current>['type']) => {
    e.preventDefault(); e.stopPropagation();
    cropDragRef.current = { type, startX: e.clientX, startY: e.clientY, origRect: { ...cropRect } };
  };

  // Text drag handlers
  const handleTextMouseDown = useCallback((e: React.MouseEvent, id: string, layer: TextLayer) => {
    if (editingTextId === id) return; // don't drag while editing
    e.preventDefault();
    e.stopPropagation();
    onSelectText(id);
    dragRef.current = {
      id,
      startX: e.clientX,
      startY: e.clientY,
      origX: layer.x,
      origY: layer.y,
    };
  }, [onSelectText, editingTextId]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const dx = (e.clientX - dragRef.current.startX) / rect.width;
      const dy = (e.clientY - dragRef.current.startY) / rect.height;
      onUpdateTextLayer(dragRef.current.id, {
        x: Math.max(0, Math.min(1, dragRef.current.origX + dx)),
        y: Math.max(0, Math.min(1, dragRef.current.origY + dy)),
      });
    };
    const handleMouseUp = () => {
      dragRef.current = null;
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [onUpdateTextLayer]);

  // Sync contentEditable text from external changes (panel input)
  useEffect(() => {
    for (const layer of textLayers) {
      const el = textEditRefs.current.get(layer.id);
      if (el && editingTextId !== layer.id && el.textContent !== layer.text) {
        el.textContent = layer.text;
      }
    }
  }, [textLayers, editingTextId]);

  const handleCanvasClick = useCallback(() => {
    if (editingTextId) {
      setEditingTextId(null);
    }
    onSelectText(null);
  }, [editingTextId, onSelectText]);

  return (
    <div ref={containerRef} className={`relative w-full h-full flex items-center justify-center ${className || ''}`}
      style={{ backgroundColor: settings.bgColor }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: dimensions.width, height: dimensions.height, cursor: showCursor ? 'default' : 'none' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchMove}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleCanvasClick}
      />

      {/* Inline editable text overlays */}
      {textLayers.map(layer => (
        <div
          key={layer.id}
          ref={(el) => {
            if (el) {
              textEditRefs.current.set(layer.id, el);
              if (el.textContent === '' && layer.text) {
                el.textContent = layer.text;
              }
            } else {
              textEditRefs.current.delete(layer.id);
            }
          }}
          contentEditable
          suppressContentEditableWarning
          spellCheck={false}
          onMouseDown={(e) => handleTextMouseDown(e, layer.id, layer)}
          onDoubleClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setEditingTextId(layer.id);
            onSelectText(layer.id);
            const el = textEditRefs.current.get(layer.id);
            if (el) {
              el.focus();
              // Place cursor at end
              const range = document.createRange();
              range.selectNodeContents(el);
              range.collapse(false);
              const sel = window.getSelection();
              sel?.removeAllRanges();
              sel?.addRange(range);
            }
          }}
          onFocus={() => setEditingTextId(layer.id)}
          onBlur={() => setEditingTextId(null)}
          onInput={(e) => {
            const text = (e.target as HTMLDivElement).textContent || '';
            onUpdateTextLayer(layer.id, { text });
          }}
          onClick={(e) => {
            if (editingTextId === layer.id) {
              e.stopPropagation();
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              (e.target as HTMLDivElement).blur();
              setEditingTextId(null);
            }
            e.stopPropagation(); // prevent '1' toggle while typing
          }}
          style={{
            position: 'absolute',
            left: `${layer.x * 100}%`,
            top: `${layer.y * 100}%`,
            transform: 'translate(-50%, -50%)',
            fontFamily: `"${layer.fontFamily}"`,
            fontSize: `${layer.fontSize}px`,
            color: editingTextId === layer.id ? 'rgba(255,255,255,0.35)' : 'transparent',
            caretColor: '#fff',
            outline: 'none',
            cursor: editingTextId === layer.id ? 'text' : 'move',
            userSelect: editingTextId === layer.id ? 'text' : 'none',
            WebkitUserSelect: editingTextId === layer.id ? 'text' : 'none',
            whiteSpace: 'nowrap',
            border: selectedTextId === layer.id ? '1px dashed rgba(255,255,255,0.4)' : '1px dashed transparent',
            padding: '4px 8px',
            pointerEvents: 'auto',
            lineHeight: 1.2,
            minWidth: '20px',
            minHeight: '1em',
          }}
        />
      ))}

      {/* Crop overlay */}
      {cropMode && (
        <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 40 }}>
          {/* Dark masks */}
          <div className="absolute bg-black/60" style={{ top: 0, left: 0, right: 0, height: `${cropRect.y * 100}%` }} />
          <div className="absolute bg-black/60" style={{ bottom: 0, left: 0, right: 0, height: `${(1 - cropRect.y - cropRect.h) * 100}%` }} />
          <div className="absolute bg-black/60" style={{ top: `${cropRect.y * 100}%`, left: 0, width: `${cropRect.x * 100}%`, height: `${cropRect.h * 100}%` }} />
          <div className="absolute bg-black/60" style={{ top: `${cropRect.y * 100}%`, right: 0, width: `${(1 - cropRect.x - cropRect.w) * 100}%`, height: `${cropRect.h * 100}%` }} />
          {/* Crop box */}
          <div
            className="absolute border border-white pointer-events-auto cursor-move"
            style={{ left: `${cropRect.x * 100}%`, top: `${cropRect.y * 100}%`, width: `${cropRect.w * 100}%`, height: `${cropRect.h * 100}%` }}
            onMouseDown={(e) => startCropDrag(e, 'move')}
          >
            {/* Size label */}
            <div className="absolute -top-6 left-0 text-white text-[10px] font-mono whitespace-nowrap bg-black/70 px-1">
              {Math.round(cropRect.w * 1920)} × {Math.round(cropRect.h * 1080)}
            </div>
            {/* Corner handles */}
            {(['tl','tr','bl','br'] as const).map(h => (
              <div key={h} className="absolute w-3 h-3 bg-white pointer-events-auto cursor-pointer"
                style={{
                  top: h.includes('t') ? -4 : undefined, bottom: h.includes('b') ? -4 : undefined,
                  left: h.includes('l') ? -4 : undefined, right: h.includes('r') ? -4 : undefined,
                }}
                onMouseDown={(e) => startCropDrag(e, h)}
              />
            ))}
            {/* Edge handles */}
            {(['t','b','l','r'] as const).map(h => (
              <div key={h} className="absolute bg-white pointer-events-auto"
                style={{
                  ...(h === 't' ? { top: -2, left: '50%', transform: 'translateX(-50%)', width: 24, height: 4, cursor: 'n-resize' } : {}),
                  ...(h === 'b' ? { bottom: -2, left: '50%', transform: 'translateX(-50%)', width: 24, height: 4, cursor: 's-resize' } : {}),
                  ...(h === 'l' ? { left: -2, top: '50%', transform: 'translateY(-50%)', width: 4, height: 24, cursor: 'w-resize' } : {}),
                  ...(h === 'r' ? { right: -2, top: '50%', transform: 'translateY(-50%)', width: 4, height: 24, cursor: 'e-resize' } : {}),
                }}
                onMouseDown={(e) => startCropDrag(e, h)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Show original indicator */}
      {showOriginal && sourceImage && (
        <div className="absolute top-4 right-4 px-3 py-1.5 bg-white/90 text-black text-[10px] font-mono
                        tracking-wider uppercase pointer-events-none z-50">
          Original — Press 1 to toggle
        </div>
      )}

      {!isFullscreen && (
        <div className="absolute bottom-4 right-4 flex gap-2">
          <button
            onClick={onToggleFullscreen}
            className="px-3 py-1.5 bg-black text-white text-xs font-mono
                       tracking-wider uppercase hover:bg-neutral-800 transition-colors cursor-pointer"
            title="Fullscreen"
          >
            Full
          </button>
          <button
            onClick={exportCanvas}
            className="px-3 py-1.5 bg-black text-white text-xs font-mono
                       tracking-wider uppercase hover:bg-neutral-800 transition-colors cursor-pointer"
            title="Export as PNG"
          >
            Export
          </button>
          <button
            onClick={toggleRecording}
            className={`px-3 py-1.5 text-xs font-mono tracking-wider uppercase transition-colors cursor-pointer ${
              isRecording
                ? 'bg-red-600 text-white hover:bg-red-700 animate-pulse'
                : 'bg-black text-white hover:bg-neutral-800'
            }`}
            title={isRecording ? 'Stop recording' : 'Record video'}
          >
            {isRecording ? `● ${String(Math.floor(recSeconds / 60)).padStart(2, '0')}:${String(recSeconds % 60).padStart(2, '0')}` : 'Rec'}
          </button>
          <button
            onClick={() => setCropMode(v => !v)}
            className={`px-3 py-1.5 text-xs font-mono tracking-wider uppercase transition-colors cursor-pointer ${cropMode ? 'bg-white text-black' : 'bg-black text-white hover:bg-neutral-800'}`}
            title="Toggle crop"
          >
            Crop
          </button>
          <button
            onClick={() => exportLottie(3, 24)}
            disabled={lottieProgress !== null}
            className={`px-3 py-1.5 text-xs font-mono tracking-wider uppercase transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${cropMode ? 'bg-white text-black hover:bg-neutral-200' : 'bg-black text-white hover:bg-neutral-800'}`}
            title="Export as Lottie JSON (3s 24fps transparent)"
          >
            {lottieProgress !== null ? `${lottieProgress}%` : 'Lottie'}
          </button>
        </div>
      )}
      {showFsToast && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 px-4 py-2 bg-black/80 text-white text-xs font-mono
                        tracking-wider uppercase rounded animate-pulse pointer-events-none z-50">
          Press ESC to exit fullscreen
        </div>
      )}
    </div>
  );
}
