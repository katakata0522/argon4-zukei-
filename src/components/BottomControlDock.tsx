import React, { useState, useEffect } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Play,
  Pause,
  Eye,
  RotateCcw,
} from 'lucide-react';
import { ModuleId, CameraPreset } from '../types/learning';

interface BottomControlDockProps {
  moduleId: ModuleId;
  primarySliderValue: number; // 0..1
  onPrimarySliderChange: (val: number) => void;
  secondarySliderValue?: number; // -0.8..0.8 for topography slice
  onSecondarySliderChange?: (val: number) => void;
  cameraPreset: CameraPreset;
  onCameraPresetChange: (preset: CameraPreset) => void;
  showLabels: boolean;
  onToggleLabels: () => void;
  showGuides: boolean;
  onToggleGuides: () => void;
  onReset: () => void;
}

export const BottomControlDock: React.FC<BottomControlDockProps> = ({
  moduleId,
  primarySliderValue,
  onPrimarySliderChange,
  cameraPreset,
  onCameraPresetChange,
  showLabels,
  onToggleLabels,
  onReset,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [playDirection, setPlayDirection] = useState<1 | -1>(1);
  const sliderValRef = React.useRef(primarySliderValue);
  sliderValRef.current = primarySliderValue;
  const onChangeRef = React.useRef(onPrimarySliderChange);
  onChangeRef.current = onPrimarySliderChange;

  // Stop auto-play when switching modules
  useEffect(() => {
    setIsAutoPlaying(false);
  }, [moduleId]);

  // Smooth auto-play animation loop without recreating interval on every tick
  useEffect(() => {
    if (!isAutoPlaying) return;
    const timer = window.setInterval(() => {
      let next = sliderValRef.current + playDirection * 0.025;
      if (next >= 1) {
        next = 1;
        setPlayDirection(-1);
        setIsAutoPlaying(false);
      } else if (next <= 0) {
        next = 0;
        setPlayDirection(1);
        setIsAutoPlaying(false);
      }
      sliderValRef.current = next;
      onChangeRef.current(Number(next.toFixed(2)));
    }, 32);
    return () => clearInterval(timer);
  }, [isAutoPlaying, playDirection]);

  const handleToggleAutoPlay = () => {
    if (!isAutoPlaying) {
      if (primarySliderValue >= 0.95) {
        setPlayDirection(-1);
      } else {
        setPlayDirection(1);
      }
      setIsAutoPlaying(true);
    } else {
      setIsAutoPlaying(false);
    }
  };

  const sliderConfig = {
    net: {
      title: '展開図を組み立てよう！',
      zeroBtn: 'ひらく (平面)',
      fullBtn: '組み立てる (立体)',
      autoBtn: primarySliderValue >= 0.95 ? '自動でひらく' : '自動で組み立てる',
    },
    'cross-section': {
      title: '切った立体をパカッと開こう！',
      zeroBtn: 'くっつける',
      fullBtn: 'パカッと開く',
      autoBtn: primarySliderValue >= 0.95 ? '自動で閉じる' : '自動で開く',
    },
    topography: {
      title: '地図から山を盛り上げよう！',
      zeroBtn: 'ぺたんこ地図',
      fullBtn: '3Dの山にする',
      autoBtn: primarySliderValue >= 0.95 ? '地図に戻す' : '山を盛り上げる',
    },
    strata: {
      title: '地面の中を透視しよう！',
      zeroBtn: '地面を表示',
      fullBtn: 'ボーリング柱を見る',
      autoBtn: primarySliderValue >= 0.95 ? '地面を戻す' : '中を透視する',
    },
  }[moduleId];

  const cameraButtons: { id: CameraPreset; label: string }[] = [
    { id: 'iso', label: 'ななめ' },
    { id: 'top', label: '真上' },
    { id: 'front', label: '正面' },
    { id: 'side', label: '真横' },
  ];

  return (
    <div
      style={{
        bottom: '16px',
        left: '50%',
        transform: 'translateX(-50%)',
        maxWidth: 'min(860px, 94vw)',
      }}
      className="absolute z-20 w-full pointer-events-auto"
    >
      {/* Collapse / Expand Toggle Tab */}
      <div className="flex justify-center">
        <button
          type="button"
          onClick={() => setCollapsed((prev) => !prev)}
          className="flex items-center gap-1.5 px-4 py-1 text-xs font-bold text-slate-700 bg-white border border-b-0 border-slate-300 rounded-t-xl hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
        >
          {collapsed ? (
            <>
              <ChevronUp className="w-4 h-4 text-amber-500" />
              <span>操作パネルをひらく</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-4 h-4 text-slate-400" />
              <span>パネルをかくす（画面を広く見る）</span>
            </>
          )}
        </button>
      </div>

      {/* Main Tactile White Control Dock */}
      {!collapsed && (
        <div className="bg-white border-2 border-slate-200 rounded-2xl p-4 shadow-xl">
          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4">
            {/* One-Click Auto Play Button */}
            <button
              type="button"
              onClick={handleToggleAutoPlay}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-extrabold text-sm transition-all whitespace-nowrap shrink-0 cursor-pointer shadow-sm"
            >
              {isAutoPlaying ? (
                <>
                  <Pause className="w-4 h-4 fill-current" />
                  <span>ストップ</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>{sliderConfig.autoBtn}</span>
                </>
              )}
            </button>

            {/* Primary Tactile Slider */}
            <div className="flex-1 min-w-[200px]">
              <div className="flex items-center justify-between mb-2">
                <label
                  htmlFor="primary-3d-slider"
                  className="text-xs font-extrabold text-slate-800 whitespace-nowrap"
                >
                  {sliderConfig.title}
                </label>
                <span className="text-xs font-mono font-bold text-amber-600 tabular-nums">
                  {Math.round(primarySliderValue * 100)}%
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setIsAutoPlaying(false);
                    onPrimarySliderChange(0);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {sliderConfig.zeroBtn}
                </button>
                <input
                  id="primary-3d-slider"
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={primarySliderValue}
                  onChange={(e) => {
                    setIsAutoPlaying(false);
                    onPrimarySliderChange(parseFloat(e.target.value));
                  }}
                  className="w-full studio-slider cursor-pointer"
                />
                <button
                  type="button"
                  onClick={() => {
                    setIsAutoPlaying(false);
                    onPrimarySliderChange(1);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {sliderConfig.fullBtn}
                </button>
              </div>
            </div>

            {/* Simplified Camera & Label Buttons */}
            <div className="flex flex-wrap items-center justify-between md:justify-end gap-2 pt-2 md:pt-0 border-t md:border-t-0 md:border-l border-slate-200 md:pl-4">
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                {cameraButtons.map((btn) => (
                  <button
                    key={btn.id}
                    type="button"
                    onClick={() => onCameraPresetChange(btn.id)}
                    className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      cameraPreset === btn.id
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                    }`}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={onToggleLabels}
                title="記号の表示・非表示"
                className={`flex items-center gap-1 px-3 py-2 text-xs font-bold rounded-xl border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  showLabels
                    ? 'bg-sky-50 text-sky-800 border-sky-300'
                    : 'bg-slate-100 text-slate-500 border-slate-200 hover:text-slate-800'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>記号</span>
              </button>

              <button
                type="button"
                onClick={onReset}
                title="さいしょに戻す"
                className="p-2 text-slate-600 bg-slate-100 border border-slate-200 rounded-xl hover:text-slate-900 hover:bg-slate-200 transition-colors shrink-0 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
