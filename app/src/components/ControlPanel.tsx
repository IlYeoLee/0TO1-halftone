import { useState, useEffect, useCallback } from 'react';
import { Camera, Upload, Grid3x3, Sun, Contrast, Zap, ZoomIn, Move, RotateCcw, Undo2, Plus, Trash2, Type } from 'lucide-react';
import type { HalftoneSettings } from '../utils/halftone';
import type { TextLayer } from '../App';

interface ControlPanelProps {
  settings: HalftoneSettings;
  onSettingsChange: (updates: Partial<HalftoneSettings>) => void;
  onFileSelect: (file: File) => void;
  onCameraCapture: () => void;
  onReset: () => void;
  onUndo: () => void;
  canUndo: boolean;
  hasCamera: boolean;
  textLayers: TextLayer[];
  selectedTextId: string | null;
  onSelectText: (id: string | null) => void;
  onAddText: () => void;
  onUpdateText: (id: string, updates: Partial<TextLayer>) => void;
  onDeleteText: (id: string) => void;
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  icon,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  icon?: React.ReactNode;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-[10px] uppercase tracking-[0.15em] text-neutral-500 flex items-center gap-1.5">
          {icon}
          {label}
        </label>
        <span className="text-[10px] tabular-nums text-neutral-400">{typeof value === 'number' ? value.toFixed(2) : value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full h-1 bg-neutral-200 rounded-none appearance-none cursor-pointer
                   [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3
                   [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-black
                   [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
      />
    </div>
  );
}

export function ControlPanel({
  settings,
  onSettingsChange,
  onFileSelect,
  onCameraCapture,
  onReset,
  onUndo,
  canUndo,
  hasCamera,
  textLayers,
  selectedTextId,
  onSelectText,
  onAddText,
  onUpdateText,
  onDeleteText,
}: ControlPanelProps) {
  const [fontList, setFontList] = useState<string[]>([]);
  const [fontSearch, setFontSearch] = useState('');
  const [fontsLoaded, setFontsLoaded] = useState(false);

  // Load system fonts
  const loadFonts = useCallback(async () => {
    try {
      if ('queryLocalFonts' in window) {
        const fonts = await (window as any).queryLocalFonts();
        const families = new Set<string>();
        for (const font of fonts) {
          families.add(font.family);
        }
        const sorted = [...families].sort((a, b) => a.localeCompare(b));
        setFontList(sorted);
        setFontsLoaded(true);
        return;
      }
    } catch {
      // permission denied or not supported
    }

    // Fallback: detect available fonts from a comprehensive list
    const candidates = [
      // System
      'Arial', 'Arial Black', 'Arial Narrow', 'Arial Rounded MT Bold',
      'Avenir', 'Avenir Next', 'Avenir Next Condensed',
      'Baskerville', 'Big Caslon', 'Bodoni 72',
      'Bradley Hand', 'Brush Script MT',
      'Chalkboard', 'Chalkboard SE', 'Chalkduster',
      'Charter', 'Cochin', 'Comic Sans MS', 'Copperplate',
      'Courier', 'Courier New',
      'DIN Alternate', 'DIN Condensed',
      'Didot',
      'Futura',
      'Geneva', 'Georgia', 'Gill Sans',
      'Helvetica', 'Helvetica Neue',
      'Herculanum', 'Hoefler Text',
      'Impact', 'Inter',
      'Kefa',
      'Lucida Console', 'Lucida Grande', 'Lucida Sans Unicode',
      'Luminari',
      'Marker Felt', 'Menlo', 'Monaco',
      'Noteworthy',
      'Optima', 'Osaka',
      'Palatino', 'Palatino Linotype', 'Papyrus', 'Phosphate',
      'Rockwell',
      'SF Pro', 'SF Pro Display', 'SF Pro Rounded', 'SF Pro Text', 'SF Mono', 'SF Compact',
      'SignPainter', 'Skia', 'Snell Roundhand',
      'Tahoma', 'Times', 'Times New Roman', 'Trattatello', 'Trebuchet MS',
      'Verdana',
      'Zapfino',
      // Korean
      'Apple SD Gothic Neo', 'AppleMyungjo',
      'Nanum Gothic', 'NanumGothic', 'Nanum Myeongjo', 'NanumMyeongjo',
      'Nanum Barun Gothic', 'NanumBarunGothic',
      'Nanum Pen Script', 'NanumPenScript',
      'Noto Sans KR', 'Noto Sans CJK KR', 'Noto Serif KR', 'Noto Serif CJK KR',
      'Malgun Gothic',
      'Pretendard', 'Pretendard Variable',
      'Spoqa Han Sans Neo', 'Spoqa Han Sans',
      'KoPubWorld Dotum', 'KoPubWorld Batang',
      'Gmarket Sans',
      'LINE Seed Sans',
      'Wanted Sans', 'Wanted Sans Variable',
      // Japanese
      'Hiragino Sans', 'Hiragino Kaku Gothic Pro', 'Hiragino Mincho Pro',
      'YuGothic', 'Yu Gothic',
      // Google Fonts commonly installed
      'Roboto', 'Roboto Mono', 'Roboto Slab', 'Roboto Condensed',
      'Open Sans', 'Lato', 'Montserrat', 'Oswald', 'Raleway',
      'Poppins', 'Nunito', 'Nunito Sans', 'Merriweather',
      'Playfair Display', 'Source Sans Pro', 'Source Code Pro',
      'Ubuntu', 'Ubuntu Mono', 'Fira Code', 'Fira Sans',
      'JetBrains Mono', 'IBM Plex Sans', 'IBM Plex Mono',
      'Work Sans', 'DM Sans', 'DM Serif Display',
      'Space Grotesk', 'Space Mono',
      'Inconsolata', 'Cascadia Code', 'Cascadia Mono',
    ];

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const testStr = 'abcdefghij가나다라마';
    ctx.font = '72px monospace';
    const baseWidth = ctx.measureText(testStr).width;

    const available = candidates.filter(f => {
      ctx.font = `72px "${f}", monospace`;
      return ctx.measureText(testStr).width !== baseWidth;
    });

    setFontList(available.sort((a, b) => a.localeCompare(b)));
    setFontsLoaded(true);
  }, []);

  useEffect(() => {
    loadFonts();
  }, [loadFonts]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFileSelect(file);
  };

  const selectedLayer = textLayers.find(l => l.id === selectedTextId);
  const filteredFonts = fontSearch
    ? fontList.filter(f => f.toLowerCase().includes(fontSearch.toLowerCase()))
    : fontList;

  return (
    <div className="w-full lg:w-80 bg-white/80 backdrop-blur-sm border-l border-neutral-200 overflow-y-auto h-full">
      <div className="p-5 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h2 className="text-[11px] uppercase tracking-[0.2em] font-medium">Controls</h2>
            <div className="h-px bg-black w-8" />
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={onUndo}
              disabled={!canUndo}
              className="flex items-center gap-1 px-2 py-1.5 text-[9px] uppercase tracking-[0.15em]
                        border border-neutral-200 hover:border-black hover:bg-neutral-50 transition-all cursor-pointer
                        disabled:opacity-30 disabled:cursor-default disabled:hover:border-neutral-200 disabled:hover:bg-transparent"
            >
              <Undo2 size={10} />
              Undo
            </button>
            <button
              onClick={onReset}
              className="flex items-center gap-1 px-2 py-1.5 text-[9px] uppercase tracking-[0.15em]
                        border border-neutral-200 hover:border-black hover:bg-neutral-50 transition-all cursor-pointer"
            >
              <RotateCcw size={10} />
              Reset
            </button>
          </div>
        </div>

        {/* Source Input */}
        <div className="space-y-3">
          <h3 className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">Source</h3>
          <div className="flex gap-2">
            <label className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 border border-neutral-200
                            hover:border-black hover:bg-neutral-50 transition-all cursor-pointer text-[10px]
                            uppercase tracking-[0.15em]">
              <Upload size={12} />
              Upload
              <input
                type="file"
                accept="image/*,.svg,video/*"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
            {hasCamera && (
              <button
                onClick={onCameraCapture}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 border border-neutral-200
                          hover:border-black hover:bg-neutral-50 transition-all cursor-pointer text-[10px]
                          uppercase tracking-[0.15em]"
              >
                <Camera size={12} />
                Camera
              </button>
            )}
          </div>
        </div>

        {/* Image Transform */}
        <div className="space-y-3">
          <h3 className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">Image</h3>
          <Slider
            label="Scale"
            value={settings.imageScale}
            min={0.1}
            max={3.0}
            step={0.05}
            icon={<ZoomIn size={10} />}
            onChange={v => onSettingsChange({ imageScale: v })}
          />
          <Slider
            label="Offset X"
            value={settings.imageOffsetX}
            min={-1}
            max={1}
            step={0.02}
            icon={<Move size={10} />}
            onChange={v => onSettingsChange({ imageOffsetX: v })}
          />
          <Slider
            label="Offset Y"
            value={settings.imageOffsetY}
            min={-1}
            max={1}
            step={0.02}
            icon={<Move size={10} />}
            onChange={v => onSettingsChange({ imageOffsetY: v })}
          />
        </div>

        {/* Grid Size */}
        <div className="space-y-3">
          <h3 className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">Halftone</h3>
          <Slider
            label="Grid Size"
            value={settings.gridSize}
            min={8}
            max={64}
            step={2}
            icon={<Grid3x3 size={10} />}
            onChange={v => onSettingsChange({ gridSize: v })}
          />
          <Slider
            label="Brightness"
            value={settings.brightness}
            min={-0.5}
            max={0.5}
            step={0.01}
            icon={<Sun size={10} />}
            onChange={v => onSettingsChange({ brightness: v })}
          />
          <Slider
            label="Contrast"
            value={settings.contrast}
            min={0.5}
            max={2.5}
            step={0.05}
            icon={<Contrast size={10} />}
            onChange={v => onSettingsChange({ contrast: v })}
          />
          <Slider
            label="Threshold"
            value={settings.threshold}
            min={0}
            max={0.5}
            step={0.01}
            onChange={v => onSettingsChange({ threshold: v })}
          />
        </div>

        {/* Animation */}
        <div className="space-y-3">
          <h3 className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">Animation</h3>
          <Slider
            label="Speed"
            value={settings.animSpeed}
            min={0}
            max={3}
            step={0.1}
            icon={<Zap size={10} />}
            onChange={v => onSettingsChange({ animSpeed: v })}
          />
        </div>

        {/* Colors */}
        <div className="space-y-3">
          <h3 className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">Colors</h3>
          <div className="flex gap-3">
            <div className="flex-1 space-y-1.5">
              <label className="text-[10px] uppercase tracking-[0.15em] text-neutral-400">Background</label>
              <input
                type="color"
                value={settings.bgColor}
                onChange={e => onSettingsChange({ bgColor: e.target.value })}
                className="w-full h-8 border border-neutral-200 cursor-pointer appearance-none bg-transparent
                          [&::-webkit-color-swatch-wrapper]:p-0.5 [&::-webkit-color-swatch]:border-0"
              />
            </div>
            <div className="flex-1 space-y-1.5">
              <label className="text-[10px] uppercase tracking-[0.15em] text-neutral-400">All Dots</label>
              <input
                type="color"
                value={settings.dotColor}
                onChange={e => {
                  const c = e.target.value;
                  onSettingsChange({ dotColor: c, dotColorV1: c, dotColorV2: c, dotColorV3: c, dotColorV4: c });
                }}
                className="w-full h-8 border border-neutral-200 cursor-pointer appearance-none bg-transparent
                          [&::-webkit-color-swatch-wrapper]:p-0.5 [&::-webkit-color-swatch]:border-0"
              />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {([
              { key: 'dotColorV1' as const, label: 'V1', src: '/logo-1.svg' },
              { key: 'dotColorV2' as const, label: 'V2', src: '/logo-2.svg' },
              { key: 'dotColorV3' as const, label: 'V3', src: '/logo-3.svg' },
              { key: 'dotColorV4' as const, label: 'V4', src: '/logo-4.svg' },
            ]).map(v => (
              <div key={v.key} className="space-y-1">
                <label className="text-[9px] uppercase tracking-[0.1em] text-neutral-400 flex items-center gap-1">
                  <img src={v.src} className="w-3 h-3" alt="" />
                  {v.label}
                </label>
                <input
                  type="color"
                  value={settings[v.key]}
                  onChange={e => onSettingsChange({ [v.key]: e.target.value })}
                  className="w-full h-6 border border-neutral-200 cursor-pointer appearance-none bg-transparent
                            [&::-webkit-color-swatch-wrapper]:p-0.5 [&::-webkit-color-swatch]:border-0"
                />
              </div>
            ))}
          </div>
          <div className="flex gap-1.5">
            {[
              { bg: '#f5f5f0', dot: '#0a0a0a', name: 'B/W' },
              { bg: '#0a0a0a', dot: '#f5f5f0', name: 'Inv' },
              { bg: '#001122', dot: '#0066ff', name: 'Blue' },
              { bg: '#f5f0e8', dot: '#8b4513', name: 'Sepia' },
              { bg: '#0f380f', dot: '#9bbc0f', name: 'GB' },
            ].map(preset => (
              <button
                key={preset.name}
                onClick={() => onSettingsChange({
                  bgColor: preset.bg, dotColor: preset.dot,
                  dotColorV1: preset.dot, dotColorV2: preset.dot, dotColorV3: preset.dot, dotColorV4: preset.dot,
                })}
                className="flex-1 py-1.5 text-[8px] uppercase tracking-[0.1em] border border-neutral-200
                          hover:border-black transition-colors"
                style={{ background: preset.bg, color: preset.dot }}
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>

        {/* Fill empty toggle */}
        <div className="flex items-center justify-between py-2 border-t border-neutral-100">
          <label className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">Fill Empty Areas</label>
          <button
            onClick={() => onSettingsChange({ fillEmpty: !settings.fillEmpty })}
            className={`w-8 h-4 rounded-full transition-colors relative ${
              settings.fillEmpty ? 'bg-black' : 'bg-neutral-300'
            }`}
          >
            <div
              className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                settings.fillEmpty ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        {/* Grid toggle */}
        <div className="flex items-center justify-between py-2 border-t border-neutral-100">
          <label className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">Show Grid</label>
          <button
            onClick={() => onSettingsChange({ showGrid: !settings.showGrid })}
            className={`w-8 h-4 rounded-full transition-colors relative ${
              settings.showGrid ? 'bg-black' : 'bg-neutral-300'
            }`}
          >
            <div
              className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                settings.showGrid ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        {/* Text Layers */}
        <div className="space-y-3 pt-2 border-t border-neutral-100">
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] uppercase tracking-[0.15em] text-neutral-500 flex items-center gap-1.5">
              <Type size={10} />
              Text
            </h3>
            <button
              onClick={onAddText}
              className="flex items-center gap-1 px-2 py-1 text-[9px] uppercase tracking-[0.15em]
                        border border-neutral-200 hover:border-black hover:bg-neutral-50 transition-all cursor-pointer"
            >
              <Plus size={10} />
              Add
            </button>
          </div>

          <p className="text-[9px] text-neutral-400">
            Double-click text on canvas to type directly. Drag to move.
          </p>

          {/* Text layer list */}
          {textLayers.map(layer => (
            <button
              key={layer.id}
              onClick={() => onSelectText(layer.id)}
              className={`w-full text-left px-2 py-1.5 text-[10px] border transition-all cursor-pointer truncate ${
                selectedTextId === layer.id
                  ? 'border-black bg-neutral-50'
                  : 'border-neutral-200 hover:border-neutral-400'
              }`}
            >
              <span style={{ fontFamily: `"${layer.fontFamily}"` }}>{layer.text || '(empty)'}</span>
            </button>
          ))}

          {/* Selected text controls */}
          {selectedLayer && (
            <div className="space-y-3 p-3 border border-neutral-200 bg-neutral-50/50">
              {/* Text input */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-[0.15em] text-neutral-400">Content</label>
                <input
                  type="text"
                  value={selectedLayer.text}
                  onChange={e => onUpdateText(selectedLayer.id, { text: e.target.value })}
                  className="w-full px-2 py-1.5 text-[11px] border border-neutral-200 bg-white
                            focus:border-black focus:outline-none transition-colors"
                  placeholder="Type here..."
                />
              </div>

              {/* Font family */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] uppercase tracking-[0.15em] text-neutral-400">
                    Font ({fontList.length})
                  </label>
                  {!fontsLoaded && (
                    <button
                      onClick={loadFonts}
                      className="text-[9px] uppercase tracking-[0.1em] text-blue-600 hover:text-blue-800 cursor-pointer"
                    >
                      Load fonts
                    </button>
                  )}
                  {'queryLocalFonts' in window && (
                    <button
                      onClick={loadFonts}
                      className="text-[9px] uppercase tracking-[0.1em] text-blue-600 hover:text-blue-800 cursor-pointer"
                    >
                      Reload all
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={fontSearch}
                  onChange={e => setFontSearch(e.target.value)}
                  className="w-full px-2 py-1 text-[10px] border border-neutral-200 bg-white
                            focus:border-black focus:outline-none transition-colors"
                  placeholder="Search fonts..."
                />
                <div className="max-h-40 overflow-y-auto border border-neutral-200 bg-white">
                  {filteredFonts.map(font => (
                    <button
                      key={font}
                      onClick={() => { onUpdateText(selectedLayer.id, { fontFamily: font }); setFontSearch(''); }}
                      className={`w-full text-left px-2 py-1.5 text-[11px] hover:bg-neutral-100 transition-colors cursor-pointer truncate ${
                        selectedLayer.fontFamily === font ? 'bg-neutral-100 font-medium' : ''
                      }`}
                      style={{ fontFamily: `"${font}"` }}
                    >
                      {font}
                    </button>
                  ))}
                  {filteredFonts.length === 0 && (
                    <div className="px-2 py-2 text-[10px] text-neutral-400">
                      {fontList.length === 0 ? 'Click "Reload all" to load system fonts' : 'No fonts found'}
                    </div>
                  )}
                </div>
              </div>

              {/* Font size */}
              <Slider
                label="Size"
                value={selectedLayer.fontSize}
                min={8}
                max={300}
                step={1}
                onChange={v => onUpdateText(selectedLayer.id, { fontSize: v })}
              />

              {/* Position X */}
              <Slider
                label="Position X"
                value={selectedLayer.x}
                min={0}
                max={1}
                step={0.005}
                onChange={v => onUpdateText(selectedLayer.id, { x: v })}
              />

              {/* Position Y */}
              <Slider
                label="Position Y"
                value={selectedLayer.y}
                min={0}
                max={1}
                step={0.005}
                onChange={v => onUpdateText(selectedLayer.id, { y: v })}
              />

              {/* Color */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-[0.15em] text-neutral-400">Text Color</label>
                <input
                  type="color"
                  value={selectedLayer.color}
                  onChange={e => onUpdateText(selectedLayer.id, { color: e.target.value })}
                  className="w-full h-6 border border-neutral-200 cursor-pointer appearance-none bg-transparent
                            [&::-webkit-color-swatch-wrapper]:p-0.5 [&::-webkit-color-swatch]:border-0"
                />
              </div>

              {/* Delete */}
              <button
                onClick={() => onDeleteText(selectedLayer.id)}
                className="flex items-center gap-1 px-2 py-1.5 text-[9px] uppercase tracking-[0.15em] text-red-600
                          border border-red-200 hover:border-red-400 hover:bg-red-50 transition-all cursor-pointer w-full justify-center"
              >
                <Trash2 size={10} />
                Delete Text
              </button>
            </div>
          )}
        </div>

        {/* Shortcuts hint */}
        <div className="space-y-1.5 pt-2 border-t border-neutral-100">
          <h3 className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">Shortcuts</h3>
          <div className="text-[10px] text-neutral-400 space-y-0.5">
            <div><kbd className="px-1 py-0.5 bg-neutral-100 border border-neutral-200 text-[9px]">1</kbd> Toggle original / halftone</div>
          </div>
        </div>

        {/* Logo legend */}
        <div className="space-y-2 pt-2 border-t border-neutral-100">
          <h3 className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">Logo Mapping</h3>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <img src="/logo-1.svg" className="w-4 h-4" alt="" />
              <span className="text-[10px] text-neutral-500">1 — Darkest / Solid</span>
            </div>
            <div className="flex items-center gap-2">
              <img src="/logo-2.svg" className="w-4 h-4" alt="" />
              <span className="text-[10px] text-neutral-500">2 — Dark / Shadows</span>
            </div>
            <div className="flex items-center gap-2">
              <img src="/logo-3.svg" className="w-4 h-4" alt="" />
              <span className="text-[10px] text-neutral-500">3 — Midtones</span>
            </div>
            <div className="flex items-center gap-2">
              <img src="/logo-4.svg" className="w-4 h-4" alt="" />
              <span className="text-[10px] text-neutral-500">4 — Highlights / Empty</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
