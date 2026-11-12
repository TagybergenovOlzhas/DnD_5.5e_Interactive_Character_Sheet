import React, { useEffect, useRef, useState } from 'react';
import { Eraser, Hand, Pencil, RotateCcw, Trash2, X, ZoomIn, ZoomOut } from 'lucide-react';
import type { NoteDrawingStroke } from '@shared/types';

type Tool = 'draw' | 'erase' | 'pan';

const COLORS = ['#ff4d4f', '#1677ff', '#52c41a', '#faad14', '#000000', '#ffffff'];
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 8;
/** Minimum normalized distance (fraction of image size) between recorded points, to avoid bloating stroke data. */
const MIN_POINT_DISTANCE = 0.0025;

interface Props {
  imageSrc: string;
  alt: string;
  strokes: NoteDrawingStroke[];
  onStrokesChange: (strokes: NoteDrawingStroke[]) => void;
  onClose: () => void;
}

function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  const projX = ax + t * dx;
  const projY = ay + t * dy;
  return Math.hypot(px - projX, py - projY);
}

export function ImageNoteLightbox({
  imageSrc,
  alt,
  strokes,
  onStrokesChange,
  onClose,
}: Props): React.JSX.Element {
  const [tool, setTool] = useState<Tool>('draw');
  const [color, setColor] = useState<string>(COLORS[0] ?? '#ff4d4f');
  const [brushWidth, setBrushWidth] = useState(4);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(
    null
  );
  const [currentStroke, setCurrentStroke] = useState<{ x: number; y: number }[] | null>(
    null
  );

  const contentRef = useRef<HTMLDivElement>(null);
  const isPointerDownRef = useRef(false);
  const isMiddlePanRef = useRef(false);
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(
    null
  );
  const erasedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const toNormalizedPoint = (clientX: number, clientY: number) => {
    const rect = contentRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    return {
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top) / rect.height,
    };
  };

  const eraseAt = (point: { x: number; y: number }) => {
    if (!naturalSize) return;
    const hitRadius = Math.max(brushWidth, 10) / naturalSize.width;
    const hit = strokes.find((stroke) => {
      if (erasedIdsRef.current.has(stroke.id)) return false;
      const first = stroke.points[0];
      if (stroke.points.length === 1 && first) {
        return Math.hypot(first.x - point.x, first.y - point.y) <= hitRadius;
      }
      for (let i = 0; i < stroke.points.length - 1; i++) {
        const a = stroke.points[i];
        const b = stroke.points[i + 1];
        if (!a || !b) continue;
        if (distanceToSegment(point.x, point.y, a.x, a.y, b.x, b.y) <= hitRadius) {
          return true;
        }
      }
      return false;
    });
    if (hit) {
      erasedIdsRef.current.add(hit.id);
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    isPointerDownRef.current = true;

    if (tool === 'pan' || e.button === 1) {
      isMiddlePanRef.current = e.button === 1;
      panStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
      return;
    }

    const point = toNormalizedPoint(e.clientX, e.clientY);
    if (!point) return;

    if (tool === 'draw') {
      setCurrentStroke([point]);
    } else if (tool === 'erase') {
      erasedIdsRef.current = new Set();
      eraseAt(point);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isPointerDownRef.current) return;

    if ((tool === 'pan' || isMiddlePanRef.current) && panStartRef.current) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      setPan({ x: panStartRef.current.panX + dx, y: panStartRef.current.panY + dy });
      return;
    }

    const point = toNormalizedPoint(e.clientX, e.clientY);
    if (!point) return;

    if (tool === 'draw') {
      setCurrentStroke((prev) => {
        if (!prev) return prev;
        const last = prev[prev.length - 1];
        if (last && Math.hypot(point.x - last.x, point.y - last.y) < MIN_POINT_DISTANCE) {
          return prev;
        }
        return [...prev, point];
      });
    } else if (tool === 'erase') {
      eraseAt(point);
      if (erasedIdsRef.current.size > 0) {
        onStrokesChange(strokes.filter((s) => !erasedIdsRef.current.has(s.id)));
      }
    }
  };

  const handlePointerUp = () => {
    isPointerDownRef.current = false;
    isMiddlePanRef.current = false;
    panStartRef.current = null;

    if (tool === 'draw' && currentStroke && currentStroke.length >= 1) {
      onStrokesChange([
        ...strokes,
        {
          id: crypto.randomUUID(),
          color,
          width: brushWidth,
          points: currentStroke,
        },
      ]);
    }
    setCurrentStroke(null);

    if (tool === 'erase') {
      erasedIdsRef.current = new Set();
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => {
      const next = e.deltaY < 0 ? z * 1.12 : z / 1.12;
      return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    });
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const width = naturalSize?.width ?? 0;
  const height = naturalSize?.height ?? 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-black/85 flex flex-col select-none"
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-black/60 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-1 bg-white/10 rounded-full p-1">
          <button
            type="button"
            title="Карандаш"
            aria-label="Инструмент: карандаш"
            onClick={() => setTool('draw')}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
              tool === 'draw' ? 'bg-white text-black' : 'text-white hover:bg-white/20'
            }`}
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            type="button"
            title="Ластик"
            aria-label="Инструмент: ластик"
            onClick={() => setTool('erase')}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
              tool === 'erase' ? 'bg-white text-black' : 'text-white hover:bg-white/20'
            }`}
          >
            <Eraser className="w-4 h-4" />
          </button>
          <button
            type="button"
            title="Рука (перемещение)"
            aria-label="Инструмент: перемещение"
            onClick={() => setTool('pan')}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
              tool === 'pan' ? 'bg-white text-black' : 'text-white hover:bg-white/20'
            }`}
          >
            <Hand className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-1">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Цвет ${c}`}
              onClick={() => setColor(c)}
              style={{ backgroundColor: c }}
              className={`w-6 h-6 rounded-full border-2 cursor-pointer ${
                color === c ? 'border-white' : 'border-white/30'
              }`}
            />
          ))}
        </div>

        <input
          type="range"
          min={1}
          max={24}
          value={brushWidth}
          aria-label="Толщина кисти"
          title="Толщина кисти"
          onChange={(e) => setBrushWidth(Number(e.target.value))}
          className="w-24 cursor-pointer"
        />

        <div className="flex items-center gap-1 ml-auto">
          <button
            type="button"
            title="Уменьшить"
            aria-label="Уменьшить масштаб"
            onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z / 1.2))}
            className="w-8 h-8 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-colors cursor-pointer"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-white text-xs w-10 text-center tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            title="Увеличить"
            aria-label="Увеличить масштаб"
            onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z * 1.2))}
            className="w-8 h-8 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-colors cursor-pointer"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            title="Сбросить вид"
            aria-label="Сбросить масштаб и положение"
            onClick={resetView}
            className="w-8 h-8 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            type="button"
            title="Очистить рисунок"
            aria-label="Очистить весь рисунок"
            onClick={() => onStrokesChange([])}
            className="w-8 h-8 rounded-full flex items-center justify-center text-white hover:bg-red-500/60 transition-colors cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            title="Закрыть"
            aria-label="Закрыть"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Canvas viewport */}
      <div
        className="flex-1 overflow-hidden relative flex items-center justify-center"
        onWheel={handleWheel}
      >
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        >
          <div
            ref={contentRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            style={{
              position: 'relative',
              width: width || undefined,
              height: height || undefined,
              touchAction: 'none',
              cursor:
                tool === 'pan' ? 'grab' : tool === 'erase' ? 'cell' : 'crosshair',
            }}
          >
            <img
              src={imageSrc}
              alt={alt}
              draggable={false}
              onLoad={(e) => {
                const img = e.currentTarget;
                setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
              }}
              className="block max-w-none select-none pointer-events-none"
              style={{ width: width || 'auto', height: height || 'auto' }}
            />
            {width > 0 && height > 0 && (
              <svg
                width={width}
                height={height}
                viewBox={`0 0 ${width} ${height}`}
                className="absolute inset-0 pointer-events-none"
              >
                {strokes.map((stroke) =>
                  stroke.points.length === 1 && stroke.points[0] ? (
                    <circle
                      key={stroke.id}
                      cx={stroke.points[0].x * width}
                      cy={stroke.points[0].y * height}
                      r={stroke.width / 2}
                      fill={stroke.color}
                    />
                  ) : (
                    <polyline
                      key={stroke.id}
                      points={stroke.points
                        .map((p) => `${p.x * width},${p.y * height}`)
                        .join(' ')}
                      fill="none"
                      stroke={stroke.color}
                      strokeWidth={stroke.width}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )
                )}
                {currentStroke &&
                  (currentStroke.length === 1 && currentStroke[0] ? (
                    <circle
                      cx={currentStroke[0].x * width}
                      cy={currentStroke[0].y * height}
                      r={brushWidth / 2}
                      fill={color}
                    />
                  ) : (
                    <polyline
                      points={currentStroke
                        .map((p) => `${p.x * width},${p.y * height}`)
                        .join(' ')}
                      fill="none"
                      stroke={color}
                      strokeWidth={brushWidth}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ))}
              </svg>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
