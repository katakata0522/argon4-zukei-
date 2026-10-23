import React, { useState, useEffect } from 'react';
import { Award, X, CheckCircle2, RotateCcw } from 'lucide-react';
import {
  ModuleId,
  WorkspaceMode,
  CameraPreset,
  CrossSectionPreset,
  QuizQuestion,
  ConstructionRuleStep,
} from './types/learning';
import {
  NET_PRESETS,
  CUBE_POINTS,
  CROSS_SECTION_PRESETS,
  TOPOGRAPHY_PRESETS,
  STRATA_PRESETS,
  QUIZ_QUESTIONS,
} from './data/modulePresets';
import { ThreeStage } from './components/ThreeStage';
import { BottomControlDock } from './components/BottomControlDock';
import { Diagram2DPanel } from './components/Diagram2DPanel';
import { QuizDeck } from './components/QuizDeck';

const STORAGE_KEY = 'kukan_lab_3d_solved_quizzes_v1';

export default function App() {
  const [moduleId, setModuleId] = useState<ModuleId>('net');
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('sandbox');
  const [requestedQuestionId, setRequestedQuestionId] = useState<string | null>(null);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('iso');
  const [cameraTriggerSeq, setCameraTriggerSeq] = useState<number>(0);
  const [showLabels, setShowLabels] = useState(true);
  const [showGuides, setShowGuides] = useState(true);
  const [progressModalOpen, setProgressModalOpen] = useState(false);

  // Module 1: Net Folding state (Spoiler-free initial state: highlightedVertexLabel = null)
  const [netPresetId, setNetPresetId] = useState<string>(NET_PRESETS[0].id);
  const [foldProgress, setFoldProgress] = useState<number>(0.25);
  const [highlightedVertexLabel, setHighlightedVertexLabel] = useState<string | null>(null);
  const [showZipperGuide, setShowZipperGuide] = useState<boolean>(false);

  // Module 2: Solid Cross-Section state + 3-Rule Step Construction & Extension Horns
  const [selectedPointIds, setSelectedPointIds] = useState<[string, string, string]>([
    'M_AB',
    'M_BC',
    'M_HE',
  ]);
  const [splitOffset, setSplitOffset] = useState<number>(0.45);
  const [constructionStep, setConstructionStep] = useState<ConstructionRuleStep>(3);
  const [showExtensionHorns, setShowExtensionHorns] = useState<boolean>(true);

  // Module 3: Topography & Contours state + Rain & Valley Water Flow simulation
  const [topoPresetId, setTopoPresetId] = useState<string>(TOPOGRAPHY_PRESETS[0].id);
  const [elevationScale, setElevationScale] = useState<number>(0.85);
  const [sliceZNorm, setSliceZNorm] = useState<number>(0.05);
  const [rainActive, setRainActive] = useState<boolean>(false);

  // Module 4: Geological Strata & Boreholes state + Mystery Borehole D excavation
  const [strataPresetId, setStrataPresetId] = useState<string>(STRATA_PRESETS[0].id);
  const [strataSliceProgress, setStrataSliceProgress] = useState<number>(0.35);
  const [alignByElevation, setAlignByElevation] = useState<boolean>(false);
  const [drillDRevealed, setDrillDRevealed] = useState<boolean>(false);

  const [solvedQuizIds, setSolvedQuizIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(solvedQuizIds));
    } catch {
      // Ignore storage errors
    }
  }, [solvedQuizIds]);

  const activeNetPreset =
    NET_PRESETS.find((p) => p.id === netPresetId) || NET_PRESETS[0];
  const activeTopoPreset =
    TOPOGRAPHY_PRESETS.find((p) => p.id === topoPresetId) || TOPOGRAPHY_PRESETS[0];
  const activeStrataPreset =
    STRATA_PRESETS.find((p) => p.id === strataPresetId) || STRATA_PRESETS[0];

  const handleToggleCubePoint = (pointId: string) => {
    setSelectedPointIds((prev) => {
      if (prev.includes(pointId)) {
        return prev;
      }
      return [prev[1], prev[2], pointId];
    });
  };

  const handleSelectCsPreset = (preset: CrossSectionPreset) => {
    setSelectedPointIds([...preset.points]);
    setSplitOffset(0.45);
    setConstructionStep(3);
  };

  const handleMarkQuizSolved = (questionId: string) => {
    setSolvedQuizIds((prev) =>
      prev.includes(questionId) ? prev : [...prev, questionId]
    );
  };

  const handlePrepareQuestionPreset = (
    targetModuleId: ModuleId,
    presetId: string,
    selectedPoints?: [string, string, string]
  ) => {
    if (targetModuleId === 'net') {
      setNetPresetId(presetId);
      setFoldProgress(0.15);
      setHighlightedVertexLabel(null);
      setShowZipperGuide(false);
    } else if (targetModuleId === 'cross-section') {
      if (selectedPoints) {
        setSelectedPointIds([...selectedPoints]);
      } else {
        const found = CROSS_SECTION_PRESETS.find((p) => p.id === presetId);
        if (found) setSelectedPointIds([...found.points]);
      }
      setSplitOffset(0.35);
      setConstructionStep(3);
    } else if (targetModuleId === 'topography') {
      setTopoPresetId(presetId);
      setRainActive(false);
    } else if (targetModuleId === 'strata') {
      setStrataPresetId(presetId);
      setDrillDRevealed(false);
      setAlignByElevation(false);
    }
  };

  const handleApplyVerifyState = (verify: QuizQuestion['verifyState']) => {
    if (verify.cameraPreset) {
      setCameraPreset(verify.cameraPreset);
      setCameraTriggerSeq((s) => s + 1);
    }
    if (moduleId === 'net') {
      setNetPresetId(verify.presetId);
      setFoldProgress(verify.sliderValue);
      setShowZipperGuide(true);
      if (verify.highlightVertexId) {
        setHighlightedVertexLabel(verify.highlightVertexId);
      }
    } else if (moduleId === 'cross-section') {
      if (verify.selectedPoints) {
        setSelectedPointIds(verify.selectedPoints);
      }
      setSplitOffset(verify.sliderValue);
      setConstructionStep(3);
      setShowExtensionHorns(true);
    } else if (moduleId === 'topography') {
      setTopoPresetId(verify.presetId);
      setElevationScale(verify.sliderValue);
      if (typeof verify.secondaryValue === 'number') {
        setSliceZNorm(verify.secondaryValue);
      }
      if (verify.presetId === 'ridge-valley' || verify.presetId === 'alluvial-fan') {
        setRainActive(true);
      }
    } else if (moduleId === 'strata') {
      setStrataPresetId(verify.presetId);
      setStrataSliceProgress(verify.sliderValue);
      setDrillDRevealed(true);
      if (typeof verify.secondaryValue === 'number') {
        setAlignByElevation(verify.secondaryValue === 1);
      }
    }
  };

  const handleResetCurrentModule = () => {
    setCameraPreset('iso');
    setCameraTriggerSeq((s) => s + 1);
    setShowLabels(true);
    setShowGuides(true);
    if (moduleId === 'net') {
      setFoldProgress(0.25);
      setHighlightedVertexLabel(null);
      setShowZipperGuide(false);
    } else if (moduleId === 'cross-section') {
      setSelectedPointIds(['M_AB', 'M_BC', 'M_HE']);
      setSplitOffset(0.45);
      setConstructionStep(3);
      setShowExtensionHorns(true);
    } else if (moduleId === 'topography') {
      setElevationScale(0.85);
      setSliceZNorm(0.05);
      setRainActive(false);
    } else if (moduleId === 'strata') {
      setStrataSliceProgress(0.35);
      setAlignByElevation(false);
      setDrillDRevealed(false);
    }
  };

  const primarySliderValue =
    moduleId === 'net'
      ? foldProgress
      : moduleId === 'cross-section'
      ? splitOffset
      : moduleId === 'topography'
      ? elevationScale
      : strataSliceProgress;

  const handlePrimarySliderChange = (val: number) => {
    if (moduleId === 'net') setFoldProgress(val);
    else if (moduleId === 'cross-section') setSplitOffset(val);
    else if (moduleId === 'topography') setElevationScale(val);
    else setStrataSliceProgress(val);
  };

  const moduleMeta: Record<
    ModuleId,
    { navLabel: string; stepBadge: string; title: string; guideText: string }
  > = {
    net: {
      navLabel: '① 展開図',
      stepBadge: '算数・空間図形',
      title: '展開図をパタパタ組み立てよう',
      guideText: '頂点をクリックして予想し、ファスナー解法と3Dの軌道でどの頂点が重なるか確かめよう！',
    },
    'cross-section': {
      navLabel: '② 立体の切断',
      stepBadge: '算数・立体切断',
      title: '立方体をスパッと切ってみよう',
      guideText: '作図の3ルール（同じ面・平行な面・延長のツノ）をステップごとに追いかけよう！',
    },
    topography: {
      navLabel: '③ 等高線と山',
      stepBadge: '社会・理科（地形）',
      title: '等高線から3Dの山を盛り上げよう',
      guideText: '山に雨を降らせて、水が「谷」に集まるしくみと断面図をくらべよう！',
    },
    strata: {
      navLabel: '④ 地層と柱状図',
      stepBadge: '理科・大地',
      title: '地面の下の地層をスパッと透視しよう',
      guideText: 'A・B・C地点から地層の傾きを読み解き、「？のD地点」を掘って確かめよう！',
    },
  };

  const currentMeta = moduleMeta[moduleId];

  // Top Stage Preset Bar items for active module
  const renderPresetBar = () => {
    if (moduleId === 'net') {
      const shortNames: Record<string, string> = {
        'cube-cross-141': '① 十字型 (基本)',
        'cube-t-141': '② T字変形',
        'cube-231-zigzag': '③ ジグザグ型',
        'cube-33-stairs': '④ 階段型 (難関)',
        'square-pyramid': '⑤ ピラミッド型',
        'cube-invalid-overlap': '⑥ × ダメな展開図 (重なり)',
      };
      return NET_PRESETS.map((p) => {
        const active = p.id === netPresetId;
        const isInvalid = Boolean(p.isInvalidNet);
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              setNetPresetId(p.id);
              setHighlightedVertexLabel(null);
              setWorkspaceMode('sandbox');
            }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
              active
                ? isInvalid
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-amber-500 text-slate-950 shadow-xs'
                : isInvalid
                ? 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {shortNames[p.id] || p.name}
          </button>
        );
      });
    }

    if (moduleId === 'cross-section') {
      return CROSS_SECTION_PRESETS.map((p) => {
        const active = p.points.every((ptId) => selectedPointIds.includes(ptId));
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              handleSelectCsPreset(p);
              setWorkspaceMode('sandbox');
            }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
              active
                ? 'bg-amber-500 text-slate-950 shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {p.shapeName}をつくる
          </button>
        );
      });
    }

    if (moduleId === 'topography') {
      const shortNames: Record<string, string> = {
        'twin-peaks': '① 急な坂とゆるい坂',
        'ridge-valley': '② 尾根と谷の見分け方',
        'alluvial-fan': '③ 扇状地 (せんじょうち)',
        caldera: '④ カルデラと火口丘',
      };
      return TOPOGRAPHY_PRESETS.map((p) => {
        const active = p.id === topoPresetId;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              setTopoPresetId(p.id);
              setWorkspaceMode('sandbox');
            }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
              active
                ? 'bg-amber-500 text-slate-950 shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {shortNames[p.id] || p.name}
          </button>
        );
      });
    }

    const shortStrata: Record<string, string> = {
      'horizontal-slope-trap': '① 斜面のひっかけ (水平な地層)',
      'east-dipping': '② 東へ傾く地層',
      'three-point-dip': '③ 南へ傾く地層 (3地点調査)',
      'fault-offset': '④ 断層でズレた地層',
    };
    return STRATA_PRESETS.map((p) => {
      const active = p.id === strataPresetId;
      return (
        <button
          key={p.id}
          type="button"
          onClick={() => {
            setStrataPresetId(p.id);
            setDrillDRevealed(false);
            setWorkspaceMode('sandbox');
          }}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
            active
              ? 'bg-amber-500 text-slate-950 shadow-xs'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          {shortStrata[p.id] || p.name}
        </button>
      );
    });
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-slate-900">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="flex items-center justify-between gap-8 px-6 py-3.5 border-b border-slate-200 bg-white z-30">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setModuleId('net');
          }}
          className="text-lg font-extrabold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          空間ラボ 3D
        </a>

        {/* Zone 2: 4 concise single-line navigation links */}
        <nav className="flex items-center gap-6 overflow-x-auto text-sm font-extrabold text-slate-600">
          {(Object.keys(moduleMeta) as ModuleId[]).map((id) => {
            const active = moduleId === id;
            return (
              <a
                key={id}
                href={`#${id}`}
                onClick={(e) => {
                  e.preventDefault();
                  setModuleId(id);
                }}
                className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                  active
                    ? 'text-amber-600 border-amber-500'
                    : 'text-slate-500 border-transparent hover:text-slate-900 hover:border-slate-300'
                }`}
              >
                {moduleMeta[id].navLabel}
              </a>
            );
          })}
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={() => setProgressModalOpen(true)}
            className="px-4 py-2 text-xs font-extrabold text-slate-950 bg-amber-400 rounded-xl hover:bg-amber-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
          >
            クリア記録 ({solvedQuizIds.length}/{QUIZ_QUESTIONS.length})
          </button>
        </div>
      </header>

      {/* Sub-Bar: Clean Horizontal Shape / Preset Switcher */}
      <div className="bg-white border-b border-slate-200 px-6 py-2.5 flex items-center gap-2 overflow-x-auto">
        <span className="text-xs font-extrabold text-slate-500 whitespace-nowrap shrink-0 mr-1">
          お手本をえらぶ：
        </span>
        <div className="flex items-center gap-2">{renderPresetBar()}</div>
      </div>

      {/* Main Two-Zone Workspace */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-[calc(100vh-112px)]">
        {/* Left Zone: Big Unobstructed 3D Stage */}
        <section className="relative lg:col-span-7 xl:col-span-8 min-h-[460px] lg:min-h-full flex flex-col border-b lg:border-b-0 lg:border-r border-slate-200">
          {/* Friendly Floating Stage Title Card */}
          <div className="absolute top-4 left-4 z-20 pointer-events-none max-w-md">
            <div className="bg-white/95 border-2 border-slate-200 rounded-2xl px-4 py-3 shadow-md pointer-events-auto">
              <div className="text-xs font-bold text-amber-600 mb-0.5">
                {currentMeta.stepBadge} · マウスで自由にぐるぐる回せるよ
              </div>
              <h1 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight">
                {currentMeta.title}
              </h1>
              <p className="text-xs text-slate-600 mt-0.5 leading-snug">
                {currentMeta.guideText}
              </p>
            </div>
          </div>

          <div className="flex-1 w-full h-full relative">
            <ThreeStage
              moduleId={moduleId}
              cameraPreset={cameraPreset}
              cameraTriggerSeq={cameraTriggerSeq}
              onCameraManualMove={() => {}}
              showLabels={showLabels}
              showGuides={showGuides}
              netPreset={activeNetPreset}
              foldProgress={foldProgress}
              highlightedVertexLabel={highlightedVertexLabel}
              onSelectVertexLabel={(lbl) =>
                setHighlightedVertexLabel((prev) =>
                  workspaceMode === 'sandbox' && prev === lbl ? null : lbl
                )
              }
              showZipperGuide={showZipperGuide}
              cubePoints={CUBE_POINTS}
              selectedPointIds={selectedPointIds}
              onToggleCubePoint={handleToggleCubePoint}
              splitOffset={splitOffset}
              constructionStep={constructionStep}
              showExtensionHorns={showExtensionHorns}
              topoPreset={activeTopoPreset}
              elevationScale={elevationScale}
              sliceZNorm={sliceZNorm}
              rainActive={rainActive}
              strataPreset={activeStrataPreset}
              strataSliceProgress={strataSliceProgress}
              drillDRevealed={drillDRevealed}
              onTriggerDrillD={() => setDrillDRevealed(true)}
            />

            <BottomControlDock
              moduleId={moduleId}
              primarySliderValue={primarySliderValue}
              onPrimarySliderChange={handlePrimarySliderChange}
              secondarySliderValue={sliceZNorm}
              onSecondarySliderChange={(val) => setSliceZNorm(val)}
              cameraPreset={cameraPreset}
              onCameraPresetChange={(preset) => {
                setCameraPreset(preset);
                setCameraTriggerSeq((s) => s + 1);
              }}
              showLabels={showLabels}
              onToggleLabels={() => setShowLabels((prev) => !prev)}
              showGuides={showGuides}
              onToggleGuides={() => setShowGuides((prev) => !prev)}
              onReset={handleResetCurrentModule}
            />
          </div>
        </section>

        {/* Right Zone: Clean, Focused 2D Board OR Quiz Deck */}
        <aside className="lg:col-span-5 xl:col-span-4 bg-[#F8FAFC] p-5 overflow-y-auto max-h-[calc(100vh-112px)] flex flex-col gap-4">
          {/* Big 2-Tab Mode Switcher */}
          <div className="grid grid-cols-2 gap-1.5 p-1.5 bg-slate-200/80 rounded-2xl">
            <button
              type="button"
              onClick={() => setWorkspaceMode('sandbox')}
              className={`py-2.5 px-3 text-xs sm:text-sm font-extrabold rounded-xl transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                workspaceMode === 'sandbox'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              🔍 図面とくらべて実験
            </button>
            <button
              type="button"
              onClick={() => {
                setRequestedQuestionId(null);
                setWorkspaceMode('quiz');
                setHighlightedVertexLabel(null);
              }}
              className={`py-2.5 px-3 text-xs sm:text-sm font-extrabold rounded-xl transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                workspaceMode === 'quiz'
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              💡 ひらめきクイズ (3問)
            </button>
          </div>

          {/* Show either QuizDeck OR Diagram2DPanel as primary focus so it's never cluttered */}
          {workspaceMode === 'quiz' ? (
            <QuizDeck
              moduleId={moduleId}
              questions={QUIZ_QUESTIONS}
              solvedIds={solvedQuizIds}
              requestedQuestionId={requestedQuestionId}
              onMarkSolved={handleMarkQuizSolved}
              onApplyVerifyState={handleApplyVerifyState}
              onPrepareQuestionPreset={handlePrepareQuestionPreset}
              highlightedVertexLabel={highlightedVertexLabel}
            />
          ) : (
            <Diagram2DPanel
              moduleId={moduleId}
              netPresets={NET_PRESETS}
              netPreset={activeNetPreset}
              onSelectNetPreset={(id) => {
                setNetPresetId(id);
                setHighlightedVertexLabel(null);
              }}
              highlightedVertexLabel={highlightedVertexLabel}
              onSelectVertexLabel={(lbl) =>
                setHighlightedVertexLabel((prev) => (prev === lbl ? null : lbl))
              }
              showZipperGuide={showZipperGuide}
              onToggleZipperGuide={() => setShowZipperGuide((prev) => !prev)}
              cubePoints={CUBE_POINTS}
              csPresets={CROSS_SECTION_PRESETS}
              selectedPointIds={selectedPointIds}
              onSelectCsPreset={handleSelectCsPreset}
              onToggleCubePoint={handleToggleCubePoint}
              constructionStep={constructionStep}
              onChangeConstructionStep={(step) => setConstructionStep(step)}
              showExtensionHorns={showExtensionHorns}
              onToggleExtensionHorns={() => setShowExtensionHorns((prev) => !prev)}
              topoPresets={TOPOGRAPHY_PRESETS}
              topoPreset={activeTopoPreset}
              onSelectTopoPreset={(id) => setTopoPresetId(id)}
              sliceZNorm={sliceZNorm}
              onSliceZChange={(val) => setSliceZNorm(val)}
              rainActive={rainActive}
              onToggleRain={() => setRainActive((prev) => !prev)}
              strataPresets={STRATA_PRESETS}
              strataPreset={activeStrataPreset}
              onSelectStrataPreset={(id) => {
                setStrataPresetId(id);
                setDrillDRevealed(false);
              }}
              alignByElevation={alignByElevation}
              onToggleAlignByElevation={(align) => setAlignByElevation(align)}
              drillDRevealed={drillDRevealed}
              onToggleDrillD={(revealed) => setDrillDRevealed(revealed)}
            />
          )}
        </aside>
      </main>

      {/* Learning Progress Modal */}
      {progressModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border-2 border-slate-200 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <Award className="w-6 h-6 text-amber-500" />
                <h2 className="text-lg font-extrabold text-slate-900">
                  ひらめきクイズ 達成きろく
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setProgressModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-800 rounded-xl cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <div>
                <div className="text-xs font-bold text-amber-800">クリアした問題</div>
                <div className="text-2xl font-extrabold font-mono text-amber-600 tabular-nums">
                  {solvedQuizIds.length} / {QUIZ_QUESTIONS.length} 問クリア！
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSolvedQuizIds([])}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>リセット</span>
              </button>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {QUIZ_QUESTIONS.map((q) => {
                const solved = solvedQuizIds.includes(q.id);
                return (
                  <div
                    key={q.id}
                    onClick={() => {
                      setModuleId(q.moduleId);
                      setRequestedQuestionId(q.id);
                      setWorkspaceMode('quiz');
                      setProgressModalOpen(false);
                    }}
                    className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 border border-slate-200 hover:border-amber-400 cursor-pointer transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold text-slate-500">
                        {moduleMeta[q.moduleId].navLabel} · {q.difficulty}
                      </div>
                      <div className="text-xs font-extrabold text-slate-900 truncate">
                        {q.title}
                      </div>
                    </div>
                    <div className="shrink-0 ml-3">
                      {solved ? (
                        <span className="flex items-center gap-1 text-xs font-extrabold text-emerald-600">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>クリア！</span>
                        </span>
                      ) : (
                        <span className="text-xs font-bold text-slate-400">挑戦する →</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setProgressModalOpen(false)}
                className="px-5 py-2.5 text-xs font-extrabold bg-slate-900 text-white rounded-xl hover:bg-slate-800 cursor-pointer"
              >
                とじる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
