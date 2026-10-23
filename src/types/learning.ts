export type ModuleId = 'net' | 'cross-section' | 'topography' | 'strata';

export type WorkspaceMode = 'sandbox' | 'quiz';

export type CameraPreset = 'iso' | 'top' | 'front' | 'side';

// --- Module 1: 展開図 (Net Folding) ---
export interface NetFaceNode {
  id: string;
  label: string;
  oppositeId?: string;
  color: string;
  parentId: string | null;
  hingePos: [number, number, number];
  hingeAxis: [number, number, number];
  foldAngle: number;
  faceOffset: [number, number, number];
  shape: 'square' | 'equilateral-triangle' | 'isosceles-triangle';
  gridX: number;
  gridY: number;
  cornerLabels: string[];
  assembledCornerIds: string[];
}

export interface NetZipperArc {
  fromLabel: string;
  toLabel: string;
  stepOrder: number; // 1 = closest to 90-deg corner, 2 = next, etc.
  color: string;
}

export interface NetPreset {
  id: string;
  name: string;
  category: string;
  isInvalidNet?: boolean;
  invalidReason?: string;
  description: string;
  stumblingPoint: string;
  faces: NetFaceNode[];
  zipperArcs?: NetZipperArc[];
}

// --- Module 2: 立体の切断 (Solid Cross-Section) ---
export interface CubePoint {
  id: string;
  label: string;
  type: 'vertex' | 'midpoint';
  position: [number, number, number]; // In [-1, 1]^3 coordinates
  edgeLabel?: string;
}

export interface CrossSectionPreset {
  id: string;
  name: string;
  points: [string, string, string];
  shapeName: string;
  summary: string;
  examTip: string;
}

export type ConstructionRuleStep = 1 | 2 | 3; // 1: 同じ面を結ぶ, 2: 平行な面に平行線, 3: 延長してツノを作る(完成)

export interface ClassifiedCrossSectionEdge {
  from3D: [number, number, number];
  to3D: [number, number, number];
  from2D: { x: number; y: number; label: string };
  to2D: { x: number; y: number; label: string };
  lengthCm: number;
  ruleStep: 1 | 2 | 3;
  ruleLabel: string;
}

export interface ExtensionHorn {
  apex: [number, number, number];
  segments: [[number, number, number], [number, number, number]][];
}

export interface ComputedCrossSection {
  valid: boolean;
  polygon3D: [number, number, number][];
  polygon2D: { x: number; y: number; label: string }[];
  edgeLengths: number[];
  classifiedEdges: ClassifiedCrossSectionEdge[];
  extensionHorns: ExtensionHorn[];
  shapeName: string;
  shapeDescription: string;
  planeNormal: [number, number, number];
  planeConstant: number;
}

// --- Module 3: 等高線と地形 (Topography & Contours) ---
export interface TopographyPreset {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  examPoint: string;
  contourInterval: number;
  baseElevation: number;
  maxElevation: number;
  ridgeValleyAnnotations: {
    label: string;
    type: 'ridge' | 'valley' | 'peak' | 'saddle';
    x: number;
    z: number;
  }[];
  /** Normalized paths for rain water flowing down valleys */
  valleyStreams?: [number, number][][];
}

// --- Module 4: 地層と柱状図 (Geological Strata & Boreholes) ---
export type RockType = 'topsoil' | 'mudstone' | 'sandstone' | 'conglomerate' | 'tuff' | 'limestone';

export interface StrataLayerDef {
  id: string;
  name: string;
  rockType: RockType;
  thickness: number;
  color: string;
  description: string;
}

export interface BoreholeSite {
  id: string; // 'A' | 'B' | 'C' | 'D'
  label: string;
  x: number;
  z: number;
  surfaceElevation: number;
  isMysterySite?: boolean;
  questionPrompt?: string;
  expectedTuffTopDepth?: number;
}

export interface StrataPreset {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  examTrap: string;
  dipEastPer100m: number;
  dipSouthPer100m: number;
  faultOffsetEast: number;
  boreholes: BoreholeSite[];
  layers: StrataLayerDef[];
}

// --- Quiz System ---
export interface QuizQuestion {
  id: string;
  moduleId: ModuleId;
  title: string;
  difficulty: '基本' | '標準（入試頻出）' | '発展（難関突破）';
  questionText: string;
  /** Optional interactive 3D/2D mission prompt */
  interactiveHint?: string;
  /** If set, clicking one of these vertex labels in 3D/2D automatically answers the question! */
  targetVertexLabels?: string[];
  options: string[];
  correctIndex: number;
  explanation: string;
  verifyState: {
    presetId: string;
    sliderValue: number;
    secondaryValue?: number;
    selectedPoints?: [string, string, string];
    highlightVertexId?: string;
    cameraPreset?: CameraPreset;
  };
}
