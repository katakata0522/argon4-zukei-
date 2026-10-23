import React, { useMemo, useState } from 'react';
import {
  Sparkles,
  ChevronDown,
  ChevronUp,
  Hand,
  CloudRain,
  Compass,
  Pickaxe,
} from 'lucide-react';
import {
  ModuleId,
  NetPreset,
  CubePoint,
  CrossSectionPreset,
  ConstructionRuleStep,
  TopographyPreset,
  StrataPreset,
} from '../types/learning';
import {
  computeCubeCrossSection,
  computeContourSegments,
  evaluateTerrainElevation,
  computeNetVertexMeetingMap,
  getStrataShiftAt,
} from '../utils/geometryMath';

interface Diagram2DPanelProps {
  moduleId: ModuleId;

  // Module 1: Net
  netPresets: NetPreset[];
  netPreset: NetPreset;
  onSelectNetPreset: (id: string) => void;
  highlightedVertexLabel: string | null;
  onSelectVertexLabel: (label: string) => void;
  showZipperGuide: boolean;
  onToggleZipperGuide: () => void;

  // Module 2: Cross-section
  cubePoints: CubePoint[];
  csPresets: CrossSectionPreset[];
  selectedPointIds: [string, string, string];
  onSelectCsPreset: (preset: CrossSectionPreset) => void;
  onToggleCubePoint: (pointId: string) => void;
  constructionStep: ConstructionRuleStep;
  onChangeConstructionStep: (step: ConstructionRuleStep) => void;
  showExtensionHorns: boolean;
  onToggleExtensionHorns: () => void;

  // Module 3: Topography
  topoPresets: TopographyPreset[];
  topoPreset: TopographyPreset;
  onSelectTopoPreset: (id: string) => void;
  sliceZNorm: number;
  onSliceZChange: (val: number) => void;
  rainActive: boolean;
  onToggleRain: () => void;

  // Module 4: Strata
  strataPresets: StrataPreset[];
  strataPreset: StrataPreset;
  onSelectStrataPreset: (id: string) => void;
  alignByElevation: boolean;
  onToggleAlignByElevation: (align: boolean) => void;
  drillDRevealed: boolean;
  onToggleDrillD: (revealed: boolean) => void;
}

export const Diagram2DPanel: React.FC<Diagram2DPanelProps> = (props) => {
  const { moduleId } = props;
  const [showCustomPointPicker, setShowCustomPointPicker] = useState(false);

  const netMeetingMap = useMemo(
    () => computeNetVertexMeetingMap(props.netPreset),
    [props.netPreset]
  );

  const csComputed = useMemo(() => {
    const map = new Map(props.cubePoints.map((cp) => [cp.id, cp]));
    const p1 = map.get(props.selectedPointIds[0]) || props.cubePoints[0];
    const p2 = map.get(props.selectedPointIds[1]) || props.cubePoints[1];
    const p3 = map.get(props.selectedPointIds[2]) || props.cubePoints[2];
    return computeCubeCrossSection(p1, p2, p3, props.cubePoints);
  }, [props.cubePoints, props.selectedPointIds]);

  const topoContours = useMemo(() => {
    const levels: { elev: number; segments: [number, number, number, number][] }[] = [];
    for (let elev = 150; elev <= 550; elev += 50) {
      levels.push({
        elev,
        segments: computeContourSegments(props.topoPreset.id, elev, 36),
      });
    }
    return levels;
  }, [props.topoPreset.id]);

  const topoProfilePoints = useMemo(() => {
    const pts: { xNorm: number; elev: number }[] = [];
    const steps = 48;
    for (let i = 0; i <= steps; i++) {
      const xNorm = -1 + (i / steps) * 2;
      const elev = evaluateTerrainElevation(props.topoPreset.id, xNorm, props.sliceZNorm);
      pts.push({ xNorm, elev });
    }
    return pts;
  }, [props.topoPreset.id, props.sliceZNorm]);

  // ============================================================================
  // MODULE 1: 展開図 (NET FOLDING)
  // ============================================================================
  if (moduleId === 'net') {
    const activeLabel = props.highlightedVertexLabel;
    const meetGroup =
      activeLabel && netMeetingMap[activeLabel]
        ? netMeetingMap[activeLabel].meetsWith
        : [];
    const otherMeeting = meetGroup.filter((l) => l !== activeLabel);

    const cellSize = 58;
    const padX = 42;
    const padY = 34;

    // Collect 2D coordinates of each vertex label for drawing 2D Zipper Arcs
    const corner2DMap: Record<string, { x: number; y: number }> = {};
    for (const face of props.netPreset.faces) {
      const x = padX + face.gridX * cellSize;
      const y = padY + face.gridY * cellSize;
      if (face.shape === 'square') {
        const pts = [
          { x: x + 9, y: y + 10 },
          { x: x + cellSize - 9, y: y + 10 },
          { x: x + cellSize - 9, y: y + cellSize - 9 },
          { x: x + 9, y: y + cellSize - 9 },
        ];
        face.cornerLabels.forEach((lbl, idx) => {
          if (!corner2DMap[lbl] && pts[idx]) {
            corner2DMap[lbl] = pts[idx];
          }
        });
      } else {
        let apexPt = { x: x + cellSize / 2, y: y + 11 };
        if (face.gridY < 1) {
          apexPt = { x: x + cellSize / 2, y: y + 11 };
        } else if (face.gridY > 1) {
          apexPt = { x: x + cellSize / 2, y: y + cellSize - 11 };
        } else if (face.gridX < 1) {
          apexPt = { x: x + 11, y: y + cellSize / 2 };
        } else {
          apexPt = { x: x + cellSize - 11, y: y + cellSize / 2 };
        }
        const apexLbl = face.cornerLabels[0];
        if (apexLbl && !corner2DMap[apexLbl]) {
          corner2DMap[apexLbl] = apexPt;
        }
      }
    }

    return (
      <div className="flex flex-col gap-4">
        <div className="bg-white border-2 border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <span className="text-xs font-bold text-slate-500 block">
                平面の展開図（紙の上での解き方）
              </span>
              <h3 className="text-base font-extrabold text-slate-900">
                頂点の丸ポチを押して重なりを予想！
              </h3>
            </div>

            <button
              type="button"
              onClick={props.onToggleZipperGuide}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold border-2 transition-all cursor-pointer ${
                props.showZipperGuide
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                  : 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
              }`}
            >
              {props.showZipperGuide
                ? '✓ ファスナー解法 ON'
                : '🔗 ファスナー解法を見る'}
            </button>
          </div>

          <svg
            viewBox="0 0 320 245"
            className="w-full h-56 bg-slate-50 rounded-xl border border-slate-200"
          >
            {/* Faces */}
            {props.netPreset.faces.map((face) => {
              const x = padX + face.gridX * cellSize;
              const y = padY + face.gridY * cellSize;

              if (face.shape === 'square') {
                const corners = [
                  { cx: x + 9, cy: y + 10, lbl: face.cornerLabels[0] },
                  { cx: x + cellSize - 9, cy: y + 10, lbl: face.cornerLabels[1] },
                  { cx: x + cellSize - 9, cy: y + cellSize - 9, lbl: face.cornerLabels[2] },
                  { cx: x + 9, cy: y + cellSize - 9, lbl: face.cornerLabels[3] },
                ];

                return (
                  <g key={face.id}>
                    <rect
                      x={x}
                      y={y}
                      width={cellSize}
                      height={cellSize}
                      fill={face.color}
                      fillOpacity={0.22}
                      stroke={face.color}
                      strokeWidth={2.5}
                      rx={4}
                    />
                    <text
                      x={x + cellSize / 2}
                      y={y + cellSize / 2 + 4}
                      textAnchor="middle"
                      className="fill-slate-800 text-xs font-extrabold select-none"
                    >
                      {face.label}
                    </text>
                    {corners.map((c, idx) => {
                      const isMeet = meetGroup.includes(c.lbl);
                      return (
                        <g
                          key={`${face.id}-c-${idx}`}
                          onClick={() => props.onSelectVertexLabel(c.lbl)}
                          className="cursor-pointer"
                        >
                          <circle
                            cx={c.cx}
                            cy={c.cy}
                            r={isMeet ? 8.5 : 6.5}
                            fill={isMeet ? '#F59E0B' : '#FFFFFF'}
                            stroke={isMeet ? '#B45309' : '#64748B'}
                            strokeWidth={2}
                          />
                          <text
                            x={c.cx}
                            y={c.cy + 3.5}
                            textAnchor="middle"
                            className={`text-[10px] font-mono font-extrabold select-none ${
                              isMeet ? 'fill-white' : 'fill-slate-800'
                            }`}
                          >
                            {c.lbl}
                          </text>
                        </g>
                      );
                    })}
                  </g>
                );
              }

              // Pyramid Triangles
              let polyPoints = '';
              let apex = { cx: x + cellSize / 2, cy: y + 6 };
              if (face.gridY < 1) {
                polyPoints = `${x},${y + cellSize} ${x + cellSize},${y + cellSize} ${x + cellSize / 2},${y + 4}`;
                apex = { cx: x + cellSize / 2, cy: y + 11 };
              } else if (face.gridY > 1) {
                polyPoints = `${x},${y} ${x + cellSize},${y} ${x + cellSize / 2},${y + cellSize - 4}`;
                apex = { cx: x + cellSize / 2, cy: y + cellSize - 11 };
              } else if (face.gridX < 1) {
                polyPoints = `${x + cellSize},${y} ${x + cellSize},${y + cellSize} ${x + 4},${y + cellSize / 2}`;
                apex = { cx: x + 11, cy: y + cellSize / 2 };
              } else {
                polyPoints = `${x},${y} ${x},${y + cellSize} ${x + cellSize - 4},${y + cellSize / 2}`;
                apex = { cx: x + cellSize - 11, cy: y + cellSize / 2 };
              }
              const apexLbl = face.cornerLabels[0];
              const isMeet = meetGroup.includes(apexLbl);

              return (
                <g key={face.id}>
                  <polygon
                    points={polyPoints}
                    fill={face.color}
                    fillOpacity={0.22}
                    stroke={face.color}
                    strokeWidth={2.5}
                  />
                  <g
                    onClick={() => props.onSelectVertexLabel(apexLbl)}
                    className="cursor-pointer"
                  >
                    <circle
                      cx={apex.cx}
                      cy={apex.cy}
                      r={isMeet ? 8.5 : 6.5}
                      fill={isMeet ? '#F59E0B' : '#FFFFFF'}
                      stroke={isMeet ? '#B45309' : '#64748B'}
                      strokeWidth={2}
                    />
                    <text
                      x={apex.cx}
                      y={apex.cy + 3.5}
                      textAnchor="middle"
                      className={`text-[10px] font-mono font-extrabold select-none ${
                        isMeet ? 'fill-white' : 'fill-slate-800'
                      }`}
                    >
                      {apexLbl}
                    </text>
                  </g>
                </g>
              );
            })}

            {/* 2D Zipper Stitch Arcs (Paper Solving Technique OR Selected Vertex Arcs!) */}
            {(props.showZipperGuide
              ? props.netPreset.zipperArcs || []
              : activeLabel && otherMeeting.length > 0
              ? otherMeeting.map((mLbl) => ({
                  fromLabel: activeLabel,
                  toLabel: mLbl,
                  stepOrder: 1,
                  color: '#D97706',
                }))
              : []
            ).map((za, idx) => {
              const pA = corner2DMap[za.fromLabel];
              const pB = corner2DMap[za.toLabel];
              if (!pA || !pB) return null;
              const midX = (pA.x + pB.x) / 2;
              const midY = (pA.y + pB.y) / 2;
              const dx = pB.x - pA.x;
              const dy = pB.y - pA.y;
              const len = Math.hypot(dx, dy) || 1;
              let nx = -dy / len;
              let ny = dx / len;
              // Bow outward away from the center of the SVG (150, 120)
              if (nx * (midX - 150) + ny * (midY - 120) < 0) {
                nx = -nx;
                ny = -ny;
              }
              const bow = Math.min(24, Math.max(14, len * 0.22));
              const cx = midX + nx * bow;
              const cy = midY + ny * bow;
              return (
                <g key={`zip-${idx}`} className="pointer-events-none">
                  <path
                    d={`M${pA.x.toFixed(1)},${pA.y.toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${pB.x.toFixed(1)},${pB.y.toFixed(1)}`}
                    fill="none"
                    stroke={za.color}
                    strokeWidth={2.5}
                    strokeDasharray="4 2"
                  />
                </g>
              );
            })}
          </svg>

          {/* Invalid Net Warning or Meeting Result Box */}
          {props.netPreset.isInvalidNet ? (
            <div className="mt-3 p-3.5 rounded-xl bg-rose-50 border-2 border-rose-300 text-xs text-rose-950 font-bold leading-relaxed">
              ⚠️ {props.netPreset.invalidReason}
            </div>
          ) : (
            <div className="mt-3 p-3.5 rounded-xl bg-amber-50 border border-amber-200">
              {activeLabel && meetGroup.length > 0 ? (
                <div className="flex flex-col gap-1">
                  <div className="text-xs font-bold text-amber-900">
                    組み立てたときに重なる頂点（2D・3Dに軌道を表示中）：
                  </div>
                  <div className="text-sm font-extrabold text-slate-900">
                    頂点{' '}
                    <span className="inline-block px-2 py-0.5 rounded bg-amber-500 text-white font-mono">
                      {activeLabel}
                    </span>{' '}
                    {otherMeeting.length > 0 ? (
                      <>
                        は、頂点{' '}
                        <span className="font-mono text-amber-700 underline decoration-2">
                          {otherMeeting.join(' ・ ')}
                        </span>{' '}
                        とピタッと重なる！
                      </>
                    ) : (
                      'は、展開図の折り目で最初からつながっている角です。'
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
                  <Hand className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    まずは自分で予想してから、丸ポチ（A〜N）を押して答え合わせしよう！
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4">
          <div className="flex items-center gap-1.5 text-xs font-extrabold text-sky-800 mb-1">
            <Sparkles className="w-4 h-4 text-sky-600 shrink-0" />
            <span>紙のテストで解くときのコツ（ファスナー法）</span>
          </div>
          <p className="text-xs text-slate-700 leading-relaxed font-medium">
            {props.netPreset.stumblingPoint}
          </p>
        </div>
      </div>
    );
  }

  // ============================================================================
  // MODULE 2: 立体の切断 (CROSS-SECTION)
  // ============================================================================
  if (moduleId === 'cross-section') {
    const vertices = props.cubePoints.filter((cp) => cp.type === 'vertex');
    const midpoints = props.cubePoints.filter((cp) => cp.type === 'midpoint');

    const svgSize = 230;
    const center = svgSize / 2;
    const scalePx = 14.5;

    const polyPointsAttr = csComputed.polygon2D
      .map(
        (pt) =>
          `${(center + pt.x * scalePx).toFixed(1)},${(center - pt.y * scalePx).toFixed(1)}`
      )
      .join(' ');

    const visibleStepEdges = csComputed.classifiedEdges.filter(
      (ce) => ce.ruleStep <= props.constructionStep
    );

    const stepDescriptions: Record<ConstructionRuleStep, { title: string; desc: string }> = {
      1: {
        title: 'ルール①：同じ面にある2点をまっすぐ結ぶ（緑の線）',
        desc: 'まずは、立方体の「同じ面の上」にある点同士を定規でまっすぐ結びます。違う面にある点同士はまだ結べません！',
      },
      2: {
        title: 'ルール②：向かい合う平行な面に「平行な線」を引く（青い線）',
        desc: '上面と底面、左面と右面、前面と後面は平行です。すでに引いた緑の線と「平行な切り口」を反対側の面に引きます！',
      },
      3: {
        title: 'ルール③：辺を延長して「外の交点（ツノ）」を作り、残りを結んで完成！',
        desc: '同じ面にない点は、切り口の線を外へ伸ばして「延長線のツノ（紫の線）」を作ると、新しい交点が見つかってすべての辺がつながります！',
      },
    };

    return (
      <div className="flex flex-col gap-4">
        {/* Step-by-Step 3-Rule Construction Switcher */}
        <div className="bg-white border-2 border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-slate-800">
              📐 切り口の作図「3大ルール」を順番に見る
            </span>
            {csComputed.extensionHorns.length > 0 && (
              <button
                type="button"
                onClick={props.onToggleExtensionHorns}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold border transition-all cursor-pointer ${
                  props.showExtensionHorns
                    ? 'bg-purple-600 text-white border-purple-600'
                    : 'bg-purple-50 text-purple-800 border-purple-300 hover:bg-purple-100'
                }`}
              >
                {props.showExtensionHorns ? '✓ 延長のツノ表示中' : '＋ 延長のツノを表示'}
              </button>
            )}
          </div>

          <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200">
            {([1, 2, 3] as ConstructionRuleStep[]).map((st) => {
              const active = props.constructionStep === st;
              const labels = {
                1: '① 同じ面を結ぶ',
                2: '② 平行線を引く',
                3: '③ 延長して完成',
              };
              return (
                <button
                  key={st}
                  type="button"
                  onClick={() => props.onChangeConstructionStep(st)}
                  className={`py-2 px-2 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                    active
                      ? st === 1
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : st === 2
                        ? 'bg-sky-600 text-white shadow-xs'
                        : 'bg-amber-500 text-slate-950 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {labels[st]}
                </button>
              );
            })}
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
            <div className="font-extrabold text-slate-900 mb-0.5">
              {stepDescriptions[props.constructionStep].title}
            </div>
            <p className="text-slate-600 leading-relaxed">
              {stepDescriptions[props.constructionStep].desc}
            </p>
          </div>
        </div>

        {/* True-Scale 2D Cross-Section Projection */}
        <div className="bg-white border-2 border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <div>
              <span className="text-xs font-bold text-slate-500 block">
                切り口を真正面から見た「ほんとうの形」
              </span>
              <h3 className="text-xl font-extrabold text-amber-600">
                {csComputed.shapeName}
              </h3>
            </div>
            <div className="text-right">
              <span className="text-[11px] font-bold text-slate-400 block">
                えらんだ3つの点
              </span>
              <span className="font-mono text-xs font-extrabold text-rose-600 tabular-nums">
                {props.selectedPointIds.map((id) => id.replace('M_', '')).join(' ・ ')}
              </span>
            </div>
          </div>

          <div className="flex flex-col items-center gap-3">
            <svg
              viewBox={`0 0 ${svgSize} ${svgSize}`}
              className="w-48 h-48 bg-slate-50 rounded-xl border border-slate-200"
            >
              {csComputed.valid && csComputed.polygon2D.length >= 3 && (
                <>
                  {props.constructionStep === 3 && (
                    <polygon
                      points={polyPointsAttr}
                      fill="#F59E0B"
                      fillOpacity={0.22}
                      stroke="none"
                    />
                  )}
                  {visibleStepEdges.length === 0 && (
                    <text
                      x={center}
                      y={center}
                      textAnchor="middle"
                      className="fill-slate-500 text-[10px] font-bold select-none"
                    >
                      このステップで引ける線はありません（③へ）
                    </text>
                  )}
                  {/* Step-filtered edges */}
                  {csComputed.classifiedEdges.map((ce, i) => {
                    if (ce.ruleStep > props.constructionStep) return null;
                    const x1 = center + ce.from2D.x * scalePx;
                    const y1 = center - ce.from2D.y * scalePx;
                    const x2 = center + ce.to2D.x * scalePx;
                    const y2 = center - ce.to2D.y * scalePx;
                    const mx = (x1 + x2) / 2;
                    const my = (y1 + y2) / 2;
                    const strokeColor =
                      ce.ruleStep === 1
                        ? '#059669'
                        : ce.ruleStep === 2
                        ? '#0284C7'
                        : '#D97706';

                    return (
                      <g key={`ce-${i}`}>
                        <line
                          x1={x1}
                          y1={y1}
                          x2={x2}
                          y2={y2}
                          stroke={strokeColor}
                          strokeWidth={3.5}
                          strokeLinecap="round"
                        />
                        <text
                          x={mx}
                          y={my + 3}
                          textAnchor="middle"
                          paintOrder="stroke"
                          stroke="#F8FAFC"
                          strokeWidth={4}
                          strokeLinejoin="round"
                          className="fill-slate-800 text-[10px] font-mono font-extrabold tabular-nums select-none"
                        >
                          {ce.lengthCm.toFixed(1)}cm
                        </text>
                      </g>
                    );
                  })}
                  {/* Vertices */}
                  {csComputed.polygon2D.map((pt, i) => {
                    const vx = center + pt.x * scalePx;
                    const vy = center - pt.y * scalePx;
                    const dx = vx - center;
                    const dy = vy - center;
                    const dist = Math.hypot(dx, dy) || 1;
                    const lx = vx + (dx / dist) * 16;
                    const ly = vy + (dy / dist) * 16;
                    return (
                      <g key={`v2d-${i}`}>
                        <circle
                          cx={vx}
                          cy={vy}
                          r={5}
                          fill="#F43F5E"
                          stroke="#FFFFFF"
                          strokeWidth={2}
                        />
                        <text
                          x={lx}
                          y={ly + 3.5}
                          textAnchor="middle"
                          paintOrder="stroke"
                          stroke="#F8FAFC"
                          strokeWidth={3.5}
                          strokeLinejoin="round"
                          className="fill-slate-900 text-[11px] font-mono font-extrabold select-none"
                        >
                          {pt.label.replace(/\(.*\)/, '')}
                        </text>
                      </g>
                    );
                  })}
                </>
              )}
            </svg>

            <div className="w-full p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-slate-800 leading-relaxed font-medium">
              {csComputed.shapeDescription}
            </div>
          </div>
        </div>

        {/* Collapsible Custom Point Picker */}
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <button
            type="button"
            onClick={() => setShowCustomPointPicker((prev) => !prev)}
            className="w-full flex items-center justify-between px-4 py-3 text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <span>＋ じぶんで3つの点をえらんで切る（3Dの丸ポチも押せます）</span>
            {showCustomPointPicker ? (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            )}
          </button>

          {showCustomPointPicker && (
            <div className="p-4 pt-1 border-t border-slate-100 space-y-3">
              <div>
                <span className="text-[11px] font-bold text-slate-500 block mb-1.5">
                  カドの頂点（A〜H）:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {vertices.map((cp) => {
                    const active = props.selectedPointIds.includes(cp.id);
                    return (
                      <button
                        key={cp.id}
                        type="button"
                        onClick={() => props.onToggleCubePoint(cp.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-colors cursor-pointer ${
                          active
                            ? 'bg-rose-500 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {cp.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <span className="text-[11px] font-bold text-slate-500 block mb-1.5">
                  辺のまん中の点（ア〜シ）:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {midpoints.map((cp) => {
                    const active = props.selectedPointIds.includes(cp.id);
                    return (
                      <button
                        key={cp.id}
                        type="button"
                        onClick={() => props.onToggleCubePoint(cp.id)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-colors cursor-pointer ${
                          active
                            ? 'bg-rose-500 text-white shadow-xs'
                            : 'bg-sky-50 text-sky-800 border border-sky-200 hover:bg-sky-100'
                        }`}
                      >
                        {cp.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ============================================================================
  // MODULE 3: 等高線と地形 (TOPOGRAPHY)
  // ============================================================================
  if (moduleId === 'topography') {
    const mapSize = 175;
    const sliceY = ((props.sliceZNorm + 1) / 2) * mapSize;

    const profW = 280;
    const profH = 125;
    const profPath = topoProfilePoints
      .map((pt, idx) => {
        const px = ((pt.xNorm + 1) / 2) * profW;
        const py = profH - ((pt.elev - 100) / 480) * (profH - 20) - 8;
        return `${idx === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`;
      })
      .join(' ');

    const areaPath = `${profPath} L${profW},${profH} L0,${profH} Z`;

    return (
      <div className="flex flex-col gap-4">
        <div className="bg-white border-2 border-slate-200 rounded-2xl p-4 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-xs font-bold text-slate-500 block">
                等高線と水の流れシミュレーター
              </span>
              <h3 className="text-sm font-extrabold text-slate-900">
                雨を降らせて「谷（川）」を見つけよう！
              </h3>
            </div>

            <button
              type="button"
              onClick={props.onToggleRain}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-extrabold border-2 transition-all cursor-pointer ${
                props.rainActive
                  ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                  : 'bg-sky-50 text-sky-800 border-sky-300 hover:bg-sky-100'
              }`}
            >
              <CloudRain className="w-4 h-4 shrink-0" />
              <span>{props.rainActive ? '☔ 雨・川の流れ ON' : '☔ 雨を降らせる'}</span>
            </button>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="shrink-0 flex flex-col items-center">
              <div className="text-xs font-extrabold text-slate-700 mb-1.5">
                真上から見た「等高線地図」
              </div>
              <svg
                viewBox={`0 0 ${mapSize} ${mapSize}`}
                onPointerDown={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const zNorm = ((e.clientY - rect.top) / rect.height) * 2 - 1;
                  props.onSliceZChange(
                    Number(Math.max(-0.75, Math.min(0.75, zNorm)).toFixed(2))
                  );
                }}
                onPointerMove={(e) => {
                  if (e.buttons !== 1) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const zNorm = ((e.clientY - rect.top) / rect.height) * 2 - 1;
                  props.onSliceZChange(
                    Number(Math.max(-0.75, Math.min(0.75, zNorm)).toFixed(2))
                  );
                }}
                className="w-40 h-40 bg-emerald-50/60 rounded-xl border border-slate-200 cursor-ns-resize touch-none select-none"
              >
                {topoContours.map(({ elev, segments }) => {
                  const isIndex = elev % 200 === 0;
                  const d = segments
                    .map(
                      ([x1, z1, x2, z2]) =>
                        `M${(((x1 + 1) / 2) * mapSize).toFixed(1)},${(((z1 + 1) / 2) * mapSize).toFixed(1)} L${(((x2 + 1) / 2) * mapSize).toFixed(1)},${(((z2 + 1) / 2) * mapSize).toFixed(1)}`
                    )
                    .join(' ');
                  return (
                    <path
                      key={elev}
                      d={d}
                      stroke={isIndex ? '#B45309' : '#475569'}
                      strokeWidth={isIndex ? 1.8 : 1}
                      fill="none"
                    />
                  );
                })}

                {/* Valley River Paths on 2D Map when Rain is Active */}
                {props.rainActive &&
                  props.topoPreset.valleyStreams?.map((stream, sIdx) => {
                    const d = stream
                      .map(
                        ([nx, nz], idx) =>
                          `${idx === 0 ? 'M' : 'L'}${(((nx + 1) / 2) * mapSize).toFixed(1)},${(((nz + 1) / 2) * mapSize).toFixed(1)}`
                      )
                      .join(' ');
                    return (
                      <path
                        key={`rv-${sIdx}`}
                        d={d}
                        stroke="#0284C7"
                        strokeWidth={3}
                        strokeDasharray="3 2"
                        fill="none"
                      />
                    );
                  })}

                <line
                  x1={0}
                  y1={sliceY}
                  x2={mapSize}
                  y2={sliceY}
                  stroke="#E11D48"
                  strokeWidth={2.5}
                  strokeDasharray="4 2"
                />
                <text
                  x={6}
                  y={Math.max(12, sliceY - 5)}
                  className="fill-rose-600 text-[10px] font-mono font-extrabold"
                >
                  A(西)
                </text>
                <text
                  x={mapSize - 28}
                  y={Math.max(12, sliceY - 5)}
                  className="fill-rose-600 text-[10px] font-mono font-extrabold"
                >
                  B(東)
                </text>
              </svg>
            </div>

            {/* Live Elevation Profile Graph */}
            <div className="flex-1 w-full">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-extrabold text-rose-600">
                  A–B で切った「山の断面図」
                </span>
                <span className="text-[11px] font-mono font-bold text-slate-500 tabular-nums">
                  50mごと
                </span>
              </div>
              <svg
                viewBox={`0 0 ${profW} ${profH}`}
                className="w-full h-36 bg-slate-50 rounded-xl border border-slate-200"
              >
                {[200, 300, 400, 500].map((elev) => {
                  const gy = profH - ((elev - 100) / 480) * (profH - 20) - 8;
                  return (
                    <g key={elev}>
                      <line
                        x1={0}
                        y1={gy}
                        x2={profW}
                        y2={gy}
                        stroke="#E2E8F0"
                        strokeWidth={1}
                      />
                      <text
                        x={4}
                        y={gy - 2}
                        className="fill-slate-400 text-[9px] font-mono font-bold tabular-nums"
                      >
                        {elev}m
                      </text>
                    </g>
                  );
                })}
                <path d={areaPath} fill="#F43F5E" fillOpacity={0.2} />
                <path d={profPath} fill="none" stroke="#E11D48" strokeWidth={3} />
              </svg>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-extrabold text-rose-900">
                赤い切断ライン（A–B）を前後に動かそう！
              </span>
              <span className="text-xs font-mono font-bold text-rose-600 tabular-nums">
                {props.sliceZNorm >= 0
                  ? `南側 +${Math.round(props.sliceZNorm * 100)}`
                  : `北側 ${Math.round(props.sliceZNorm * 100)}`}
              </span>
            </div>
            <input
              type="range"
              min={-0.75}
              max={0.75}
              step={0.01}
              value={props.sliceZNorm}
              onChange={(e) => props.onSliceZChange(parseFloat(e.target.value))}
              className="w-full studio-slider cursor-pointer"
            />
          </div>
        </div>

        <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4">
          <div className="flex items-center gap-1.5 text-xs font-extrabold text-sky-800 mb-1">
            <Sparkles className="w-4 h-4 text-sky-600 shrink-0" />
            <span>ハカセのひらめきポイント</span>
          </div>
          <p className="text-xs text-slate-700 leading-relaxed font-medium">
            {props.topoPreset.examPoint}
          </p>
        </div>
      </div>
    );
  }

  // ============================================================================
  // MODULE 4: 地層と柱状図 (STRATA & BOREHOLES)
  // ============================================================================
  const preset = props.strataPreset;
  const visibleSites = preset.boreholes.filter(
    (b) => !b.isMysterySite || props.drillDRevealed
  );
  const mysterySite = preset.boreholes.find((b) => b.isMysterySite);

  const svgW = 330;
  const svgH = 220;
  const colPositions =
    visibleSites.length === 4 ? [55, 132, 208, 284] : [72, 168, 264];

  const boreholeColumns = visibleSites.map((site, idx) => {
    const shift = getStrataShiftAt(preset, site.x, site.z);
    const refSurface = 50 + shift;
    let curTopElev = refSurface;

    const segments: {
      id: string;
      name: string;
      color: string;
      rockType: string;
      topDepth: number;
      botDepth: number;
      topElev: number;
      botElev: number;
    }[] = [];

    for (const layer of preset.layers) {
      const lTop = curTopElev;
      const lBot = curTopElev - layer.thickness;
      curTopElev = lBot;

      const cTop = Math.min(site.surfaceElevation, lTop);
      const cBot = Math.max(0, lBot);
      if (cTop <= cBot) continue;

      segments.push({
        id: layer.id,
        name: layer.name,
        color: layer.color,
        rockType: layer.rockType,
        topDepth: site.surfaceElevation - cTop,
        botDepth: site.surfaceElevation - cBot,
        topElev: cTop,
        botElev: cBot,
      });
    }

    return {
      site,
      cx: colPositions[idx] || 55 + idx * 75,
      segments,
    };
  });

  const toSvgY = (siteElev: number, depth: number) => {
    if (props.alignByElevation) {
      const elev = siteElev - depth;
      return 28 + (55 - elev) * 3.1;
    }
    return 34 + depth * 3.1;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white border-2 border-slate-200 rounded-2xl p-4 shadow-xs">
        <div className="mb-3">
          <span className="text-xs font-bold text-slate-500 block">
            ボーリング柱状図（赤い層＝火山灰の鍵層）
          </span>
          <h3 className="text-sm font-extrabold text-slate-900 mt-0.5">
            「深さ」と「標高」を切り替えて地層の傾きを見抜こう！
          </h3>
        </div>

        {/* Big 2-Mode Switch */}
        <div className="grid grid-cols-2 gap-2 mb-3 p-1 bg-slate-100 rounded-xl border border-slate-200">
          <button
            type="button"
            onClick={() => props.onToggleAlignByElevation(false)}
            className={`py-2 px-2 text-xs font-extrabold rounded-lg transition-colors cursor-pointer ${
              !props.alignByElevation
                ? 'bg-amber-500 text-slate-950 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            ① 地面からの深さ (問題図)
          </button>
          <button
            type="button"
            onClick={() => props.onToggleAlignByElevation(true)}
            className={`py-2 px-2 text-xs font-extrabold rounded-lg transition-colors cursor-pointer ${
              props.alignByElevation
                ? 'bg-emerald-500 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            ② 標高でそろえる (タネあかし)
          </button>
        </div>

        <svg
          viewBox={`0 0 ${svgW} ${svgH}`}
          className="w-full h-56 bg-slate-50 rounded-xl border border-slate-200"
        >
          {[0, 10, 20, 30, 40, 50].map((val) => {
            const y = props.alignByElevation
              ? 28 + (55 - val) * 3.1
              : 34 + val * 3.1;
            if (y > svgH - 8 || y < 18) return null;
            return (
              <g key={val}>
                <line
                  x1={36}
                  y1={y}
                  x2={svgW - 8}
                  y2={y}
                  stroke="#E2E8F0"
                  strokeWidth={1}
                />
                <text
                  x={32}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-slate-500 text-[9px] font-mono font-bold tabular-nums"
                >
                  {props.alignByElevation ? `標高${val}m` : `深さ${val}m`}
                </text>
              </g>
            );
          })}

          {/* Correlation lines connecting Tuff key bed */}
          {boreholeColumns.map((col, idx) => {
            if (idx === boreholeColumns.length - 1) return null;
            const nextCol = boreholeColumns[idx + 1];
            const tuffCur = col.segments.find((s) => s.rockType === 'tuff');
            const tuffNext = nextCol.segments.find((s) => s.rockType === 'tuff');
            if (!tuffCur || !tuffNext) return null;

            const y1 = toSvgY(col.site.surfaceElevation, tuffCur.topDepth);
            const y2 = toSvgY(nextCol.site.surfaceElevation, tuffNext.topDepth);

            // If preset has fault offset between B (x <= 15) and C (x > 15), draw a fault line instead of continuous correlation
            const hasFaultBetween =
              preset.faultOffsetEast !== 0 &&
              col.site.x <= 15 &&
              nextCol.site.x > 15;
            const midX = (col.cx + nextCol.cx) / 2;

            return (
              <g key={`corr-${idx}`}>
                <line
                  x1={col.cx + 14}
                  y1={y1}
                  x2={nextCol.cx - 14}
                  y2={y2}
                  stroke="#E11D48"
                  strokeWidth={2.5}
                  strokeDasharray="4 2"
                />
                {hasFaultBetween && (
                  <g>
                    <line
                      x1={midX + 4}
                      y1={24}
                      x2={midX - 4}
                      y2={svgH - 12}
                      stroke="#7C3AED"
                      strokeWidth={2.5}
                      strokeDasharray="3 2"
                    />
                    <text
                      x={midX}
                      y={20}
                      textAnchor="middle"
                      className="fill-purple-700 text-[9px] font-mono font-extrabold"
                    >
                      ⚡断層
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Borehole Columns */}
          {boreholeColumns.map((col) => {
            const topY = toSvgY(col.site.surfaceElevation, 0);
            const isD = col.site.isMysterySite;
            return (
              <g key={col.site.id}>
                <text
                  x={col.cx}
                  y={topY - 6}
                  textAnchor="middle"
                  className={`text-[10px] font-mono font-extrabold ${
                    isD ? 'fill-purple-700' : 'fill-slate-800'
                  }`}
                >
                  {col.site.id}({col.site.surfaceElevation}m)
                </text>

                {col.segments.map((seg) => {
                  const sy1 = toSvgY(col.site.surfaceElevation, seg.topDepth);
                  const sy2 = toSvgY(col.site.surfaceElevation, seg.botDepth);
                  const sh = Math.max(2, sy2 - sy1);
                  const isKey = seg.rockType === 'tuff';
                  return (
                    <g key={seg.id}>
                      <rect
                        x={col.cx - 14}
                        y={sy1}
                        width={28}
                        height={sh}
                        fill={seg.color}
                        stroke={isKey ? '#E11D48' : isD ? '#9333EA' : '#334155'}
                        strokeWidth={isKey || isD ? 2 : 1}
                      />
                      {isKey && (
                        <text
                          x={col.cx + 16}
                          y={sy1 + sh / 2 + 3}
                          paintOrder="stroke"
                          stroke="#F8FAFC"
                          strokeWidth={3}
                          strokeLinejoin="round"
                          className="fill-rose-600 text-[9px] font-mono font-extrabold"
                        >
                          {props.alignByElevation
                            ? `${seg.topElev}m`
                            : `深${seg.topDepth}m`}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>

        {/* Mystery Point D Excavation Interactive Card */}
        {mysterySite && (
          <div className="mt-3 p-3.5 rounded-xl bg-purple-50 border-2 border-purple-200 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-extrabold text-purple-900">
                ⛏️ 4地点目「D地点（標高{mysterySite.surfaceElevation}m）」の予測ミッション
              </span>
              <button
                type="button"
                onClick={() => props.onToggleDrillD(!props.drillDRevealed)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer shrink-0 ${
                  props.drillDRevealed
                    ? 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                    : 'bg-purple-600 text-white hover:bg-purple-500 shadow-xs'
                }`}
              >
                <Pickaxe className="w-3.5 h-3.5" />
                <span>
                  {props.drillDRevealed ? 'D地点を隠す' : 'D地点を掘って確かめる！'}
                </span>
              </button>
            </div>
            <p className="text-xs text-slate-700 leading-relaxed font-medium">
              {props.drillDRevealed ? (
                <>
                  <strong>掘削結果：</strong> D地点（標高{mysterySite.surfaceElevation}m）では、地面から
                  <span className="font-mono font-extrabold text-rose-600 mx-1">
                    深さ {mysterySite.expectedTuffTopDepth}m（標高
                    {mysterySite.surfaceElevation - (mysterySite.expectedTuffTopDepth || 0)}m）
                  </span>
                  で赤い凝灰岩層（鍵層）が出てきました！
                </>
              ) : (
                mysterySite.questionPrompt
              )}
            </p>
          </div>
        )}
      </div>

      <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4">
        <div className="flex items-center gap-1.5 text-xs font-extrabold text-sky-800 mb-1">
          <Compass className="w-4 h-4 text-sky-600 shrink-0" />
          <span>ハカセのひらめきポイント</span>
        </div>
        <p className="text-xs text-slate-700 leading-relaxed font-medium">
          {preset.examTrap}
        </p>
      </div>
    </div>
  );
};
