// Halftone engine using 0TO1 logo SVGs as dot shapes
// 4 levels: 1 (darkest/filled) → 2 → 3 → 4 (lightest/outline)

export interface HalftoneSettings {
  gridSize: number;
  contrast: number;
  brightness: number;
  threshold: number;
  animSpeed: number;
  bgColor: string;
  dotColor: string;
  dotColorV1: string;
  dotColorV2: string;
  dotColorV3: string;
  dotColorV4: string;
  showGrid: boolean;
  imageScale: number;
  imageOffsetX: number;
  imageOffsetY: number;
  fillEmpty: boolean;
}

export const DEFAULT_SETTINGS: HalftoneSettings = {
  gridSize: 20,
  contrast: 0.70,
  brightness: 0.02,
  threshold: 0.31,
  animSpeed: 0.3,
  bgColor: '#000000',
  dotColor: '#0A0A0A',
  dotColorV1: '#FF32C6',
  dotColorV2: '#F25A06',
  dotColorV3: '#0AC32A',
  dotColorV4: '#039BEA',
  showGrid: false,
  imageScale: 0.90,
  imageOffsetX: 0.0,
  imageOffsetY: 0.0,
  fillEmpty: false,
};

// Mouse interaction state
export interface MouseState {
  x: number;  // canvas pixel x
  y: number;  // canvas pixel y
  active: boolean;
}

type VariantKey = 'v0' | 'v1' | 'v2' | 'v3' | 'v4';

export interface LogoShapes {
  v0: Path2D[];
  v1: Path2D[];
  v2: Path2D[];
  v3: Path2D[];
  v4: Path2D[];
  v0Bounds: { width: number; height: number };
  v1Bounds: { width: number; height: number };
  v2Bounds: { width: number; height: number };
  v3Bounds: { width: number; height: number };
  v4Bounds: { width: number; height: number };
}

let cachedShapes: LogoShapes | null = null;

function parseSVGPaths(svgText: string): { paths: Path2D[]; width: number; height: number } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  const pathElements = doc.querySelectorAll('path');

  const width = parseFloat(svg?.getAttribute('width') || '1336');
  const height = parseFloat(svg?.getAttribute('height') || '1728');

  const paths: Path2D[] = [];
  pathElements.forEach(el => {
    const d = el.getAttribute('d');
    if (d) {
      paths.push(new Path2D(d));
    }
  });

  return { paths, width, height };
}

export async function loadLogoShapes(): Promise<LogoShapes> {
  if (cachedShapes) return cachedShapes;

  const [r0, r1, r2, r3, r4] = await Promise.all([
    fetch('/logo-0.svg').then(r => r.text()),
    fetch('/logo-1.svg').then(r => r.text()),
    fetch('/logo-2.svg').then(r => r.text()),
    fetch('/logo-3.svg').then(r => r.text()),
    fetch('/logo-4.svg').then(r => r.text()),
  ]);

  const p0 = parseSVGPaths(r0);
  const p1 = parseSVGPaths(r1);
  const p2 = parseSVGPaths(r2);
  const p3 = parseSVGPaths(r3);
  const p4 = parseSVGPaths(r4);

  cachedShapes = {
    v0: p0.paths, v0Bounds: { width: p0.width, height: p0.height },
    v1: p1.paths, v1Bounds: { width: p1.width, height: p1.height },
    v2: p2.paths, v2Bounds: { width: p2.width, height: p2.height },
    v3: p3.paths, v3Bounds: { width: p3.width, height: p3.height },
    v4: p4.paths, v4Bounds: { width: p4.width, height: p4.height },
  };

  return cachedShapes;
}

// Pre-render logo shapes to offscreen canvases for performance
type RenderedLogos = Record<VariantKey, HTMLCanvasElement>;

let renderedLogosCache: Map<string, RenderedLogos> = new Map();

// Logo aspect ratio (width / height) — all 4 SVGs share ~1336/1728
const LOGO_ASPECT = 1336 / 1728;

function renderLogoToCanvas(
  paths: Path2D[],
  bounds: { width: number; height: number },
  cellWidth: number,
  cellHeight: number,
  color: string
): HTMLCanvasElement {
  const superScale = Math.max(8, Math.ceil(512 / Math.max(cellWidth, cellHeight)));
  const rw = cellWidth * superScale;
  const rh = cellHeight * superScale;

  const canvas = document.createElement('canvas');
  canvas.width = rw;
  canvas.height = rh;
  const ctx = canvas.getContext('2d')!;

  const uniformScale = Math.min(rw / bounds.width, rh / bounds.height);
  const offsetX = (rw - bounds.width * uniformScale) / 2;
  const offsetY = (rh - bounds.height * uniformScale) / 2;

  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(uniformScale, uniformScale);
  ctx.fillStyle = color;
  paths.forEach(path => ctx.fill(path));
  ctx.restore();

  return canvas;
}

export interface VariantColors {
  v0: string;
  v1: string;
  v2: string;
  v3: string;
  v4: string;
}

function getRenderedLogos(shapes: LogoShapes, cellWidth: number, cellHeight: number, colors: VariantColors): RenderedLogos {
  const key = `${cellWidth}_${cellHeight}_${colors.v0}_${colors.v1}_${colors.v2}_${colors.v3}_${colors.v4}`;
  if (renderedLogosCache.has(key)) return renderedLogosCache.get(key)!;

  const logos: RenderedLogos = {
    v0: renderLogoToCanvas(shapes.v0, shapes.v0Bounds, cellWidth, cellHeight, colors.v0),
    v1: renderLogoToCanvas(shapes.v1, shapes.v1Bounds, cellWidth, cellHeight, colors.v1),
    v2: renderLogoToCanvas(shapes.v2, shapes.v2Bounds, cellWidth, cellHeight, colors.v2),
    v3: renderLogoToCanvas(shapes.v3, shapes.v3Bounds, cellWidth, cellHeight, colors.v3),
    v4: renderLogoToCanvas(shapes.v4, shapes.v4Bounds, cellWidth, cellHeight, colors.v4),
  };

  renderedLogosCache.set(key, logos);

  if (renderedLogosCache.size > 10) {
    const firstKey = renderedLogosCache.keys().next().value;
    if (firstKey) renderedLogosCache.delete(firstKey);
  }

  return logos;
}

export function clearLogoCache() {
  renderedLogosCache.clear();
}

function getRegionBrightness(
  imageData: ImageData,
  x: number,
  y: number,
  cellSize: number,
  settings: HalftoneSettings
): number {
  const { data, width, height } = imageData;
  let totalR = 0, totalG = 0, totalB = 0, count = 0;

  const startX = Math.max(0, Math.floor(x));
  const startY = Math.max(0, Math.floor(y));
  const endX = Math.min(width, Math.floor(x + cellSize));
  const endY = Math.min(height, Math.floor(y + cellSize));

  const step = cellSize > 16 ? 2 : 1;

  for (let py = startY; py < endY; py += step) {
    for (let px = startX; px < endX; px += step) {
      const idx = (py * width + px) * 4;
      totalR += data[idx];
      totalG += data[idx + 1];
      totalB += data[idx + 2];
      count++;
    }
  }

  if (count === 0) return 1;

  let brightness = (0.2126 * totalR / count + 0.7152 * totalG / count + 0.0722 * totalB / count) / 255;
  brightness += settings.brightness;
  brightness = (brightness - 0.5) * settings.contrast + 0.5;
  return Math.max(0, Math.min(1, brightness));
}

// 5-level variant: v1=darkest → v2 → v3 → v4 → v0=empty (lightest/highlight)
const VARIANTS: VariantKey[] = ['v1', 'v2', 'v3', 'v4', 'v0'];
const HOVER_VARIANTS: VariantKey[] = ['v2', 'v3', 'v4', 'v0'];

function getLogoVariant(darkness: number): VariantKey {
  if (darkness > 0.80) return 'v1';
  if (darkness > 0.60) return 'v2';
  if (darkness > 0.40) return 'v3';
  if (darkness > 0.20) return 'v4';
  return 'v0';
}

function adjacentVariant(v: VariantKey, direction: 1 | -1, useHoverSet: boolean): VariantKey {
  const set = useHoverSet ? HOVER_VARIANTS : VARIANTS;
  let idx = set.indexOf(v);
  if (idx === -1) idx = 0;
  const next = Math.max(0, Math.min(set.length - 1, idx + direction));
  return set[next];
}

export interface AnimationState {
  time: number;
  phase: Float32Array | null;
}

export function createAnimationState(): AnimationState {
  return { time: 0, phase: null };
}

function hexToBrightness(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) || 0;
  const g = parseInt(hex.slice(3, 5), 16) || 0;
  const b = parseInt(hex.slice(5, 7), 16) || 0;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

export function renderHalftone(
  ctx: CanvasRenderingContext2D,
  imageData: ImageData | null,
  canvasWidth: number,
  canvasHeight: number,
  shapes: LogoShapes,
  settings: HalftoneSettings,
  animState: AnimationState,
  mouse?: MouseState,
  textOverlay?: ImageData,
  bgSource?: HTMLImageElement | HTMLVideoElement | null
) {
  const { gridSize, threshold, bgColor, dotColorV1, dotColorV2, dotColorV3, dotColorV4, imageScale, imageOffsetX, imageOffsetY, fillEmpty } = settings;

  // Draw background: image/video (full quality, cover mode) or solid color
  if (bgSource) {
    const bw = bgSource instanceof HTMLVideoElement ? bgSource.videoWidth : bgSource.naturalWidth;
    const bh = bgSource instanceof HTMLVideoElement ? bgSource.videoHeight : bgSource.naturalHeight;
    if (bw > 0 && bh > 0) {
      const scale = Math.max(canvasWidth / bw, canvasHeight / bh);
      const dw = bw * scale;
      const dh = bh * scale;
      const dx = (canvasWidth - dw) / 2;
      const dy = (canvasHeight - dh) / 2;
      ctx.drawImage(bgSource, dx, dy, dw, dh);
    } else {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    }
  } else {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  }

  // If no source and no text overlay, just show background
  if (!imageData && !textOverlay) return;

  const cellH = gridSize;
  const cellW = Math.round(gridSize * LOGO_ASPECT);

  const cols = Math.ceil(canvasWidth / cellW);
  const rows = Math.ceil(canvasHeight / cellH);

  if (!animState.phase || animState.phase.length !== cols * rows) {
    animState.phase = new Float32Array(cols * rows);
    for (let i = 0; i < cols * rows; i++) {
      animState.phase[i] = Math.random() * Math.PI * 2;
    }
  }

  // Image transform (only relevant when imageData exists)
  // Use uniform scale to preserve aspect ratio (cover mode: fill canvas, crop excess)
  const baseScale = imageData ? Math.min(imageData.width / canvasWidth, imageData.height / canvasHeight) : 1;
  const imgPadX = imageData ? (imageData.width - canvasWidth * baseScale) / 2 : 0;
  const imgPadY = imageData ? (imageData.height - canvasHeight * baseScale) / 2 : 0;
  const invScale = 1 / imageScale;
  const offsetPxX = imageOffsetX * canvasWidth * 0.5;
  const offsetPxY = imageOffsetY * canvasHeight * 0.5;

  // Fallback brightness from bgColor (when no source image)
  let bgBright = hexToBrightness(bgColor);
  bgBright += settings.brightness;
  bgBright = (bgBright - 0.5) * settings.contrast + 0.5;
  bgBright = Math.max(0, Math.min(1, bgBright));

  const variantColors: VariantColors = {
    v0: dotColorV4,
    v1: dotColorV1,
    v2: dotColorV2,
    v3: dotColorV3,
    v4: dotColorV4,
  };
  const logos = getRenderedLogos(shapes, cellW, cellH, variantColors);

  const hoverRadius = Math.max(canvasWidth, canvasHeight) * 0.18;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cellX = col * cellW;
      const cellY = row * cellH;

      // Get base brightness from source image or bg color
      let brightness: number;
      if (imageData) {
        const centeredX = (cellX - canvasWidth / 2 + offsetPxX) * invScale + canvasWidth / 2;
        const centeredY = (cellY - canvasHeight / 2 + offsetPxY) * invScale + canvasHeight / 2;
        const srcX = centeredX * baseScale + imgPadX;
        const srcY = centeredY * baseScale + imgPadY;
        const srcCellW = cellW * baseScale * invScale;
        const srcCellH = cellH * baseScale * invScale;
        brightness = getRegionBrightness(imageData, srcX, srcY, Math.max(srcCellW, srcCellH), settings);
      } else {
        brightness = bgBright;
      }

      // Blend with text overlay
      if (textOverlay) {
        const ocx = Math.min(Math.max(0, Math.floor(cellX + cellW / 2)), textOverlay.width - 1);
        const ocy = Math.min(Math.max(0, Math.floor(cellY + cellH / 2)), textOverlay.height - 1);
        const oIdx = (ocy * textOverlay.width + ocx) * 4;
        const alpha = textOverlay.data[oIdx + 3] / 255;
        if (alpha > 0.01) {
          let tB = (0.2126 * textOverlay.data[oIdx] + 0.7152 * textOverlay.data[oIdx + 1] + 0.0722 * textOverlay.data[oIdx + 2]) / 255;
          tB += settings.brightness;
          tB = (tB - 0.5) * settings.contrast + 0.5;
          tB = Math.max(0, Math.min(1, tB));
          brightness = brightness * (1 - alpha) + tB * alpha;
        }
      }

      const darkness = 1 - brightness;

      if (darkness < threshold) {
        if (fillEmpty) {
          ctx.drawImage(logos['v0'], cellX, cellY, cellW, cellH);
        }
        continue;
      }

      let variant = getLogoVariant(darkness);

      const cellIdx = row * cols + col;
      const phase = animState.phase[cellIdx];
      const t = animState.time * settings.animSpeed;

      let hoverInfluence = 0;
      if (mouse?.active) {
        const cellCenterX = cellX + cellW / 2;
        const cellCenterY = cellY + cellH / 2;
        const dx = cellCenterX - mouse.x;
        const dy = cellCenterY - mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        hoverInfluence = Math.max(0, 1 - dist / hoverRadius);
      }

      const isHovering = hoverInfluence > 0;
      const flickerSpeed = 3.7 + hoverInfluence * 12;
      const flickerThreshold = 0.92 - hoverInfluence * 0.6;
      const flicker = Math.sin(t * flickerSpeed + phase * 2.1);
      if (Math.abs(flicker) > flickerThreshold) {
        const steps = hoverInfluence > 0.5 ? 2 : 1;
        const dir = flicker > 0 ? 1 : -1;
        for (let s = 0; s < steps; s++) {
          variant = adjacentVariant(variant, dir as 1 | -1, isHovering);
        }
      }

      ctx.drawImage(logos[variant], cellX, cellY, cellW, cellH);
    }
  }

  if (settings.showGrid) {
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 0.5;
    for (let col = 0; col <= cols; col++) {
      ctx.beginPath();
      ctx.moveTo(col * cellW, 0);
      ctx.lineTo(col * cellW, canvasHeight);
      ctx.stroke();
    }
    for (let row = 0; row <= rows; row++) {
      ctx.beginPath();
      ctx.moveTo(0, row * cellH);
      ctx.lineTo(canvasWidth, row * cellH);
      ctx.stroke();
    }
  }
}

export function imageToImageData(
  source: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
  maxDim: number = 800
): ImageData {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  let sw: number, sh: number;
  if (source instanceof HTMLVideoElement) {
    sw = source.videoWidth;
    sh = source.videoHeight;
  } else if (source instanceof HTMLImageElement) {
    sw = source.naturalWidth;
    sh = source.naturalHeight;
  } else {
    sw = source.width;
    sh = source.height;
  }

  const ratio = Math.min(1, maxDim / Math.max(sw, sh));
  canvas.width = Math.floor(sw * ratio);
  canvas.height = Math.floor(sh * ratio);

  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}
