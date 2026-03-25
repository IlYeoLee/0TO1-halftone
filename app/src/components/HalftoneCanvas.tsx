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
  const rafRef = useRef<number>(0);
  const shapesRef = useRef<Awaited<ReturnType<typeof loadLogoShapes>> | null>(null);
  const imageDataRef = useRef<ImageData | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mouseRef = useRef<MouseState>({ x: 0, y: 0, active: false });
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [showFsToast, setShowFsToast] = useState(false);
  const fsToastTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

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
      setDimensions({ width: Math.floor(rect.width), height: Math.floor(rect.height) });
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
      const scaledSettings = { ...settings, gridSize: Math.round(settings.gridSize * dpr) };
      renderHalftone(ctx, imageData, w, h, shapes, scaledSettings, animRef.current, mouseRef.current, overlay ?? undefined, bgMedia);
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
    <div ref={containerRef} className={`relative w-full h-full ${className || ''}`}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: dimensions.width, height: dimensions.height, cursor: showCursor ? 'default' : 'none' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
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
