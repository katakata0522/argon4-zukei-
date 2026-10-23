import {
  CubePoint,
  ComputedCrossSection,
  ClassifiedCrossSectionEdge,
  ExtensionHorn,
  NetPreset,
  StrataPreset,
} from '../types/learning';

type Vec3 = [number, number, number];

function sub3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function add3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scale3(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross3(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function len3(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

function norm3(a: Vec3): Vec3 {
  const l = len3(a);
  if (l < 1e-8) return [0, 1, 0];
  return [a[0] / l, a[1] / l, a[2] / l];
}

function dist3(a: Vec3, b: Vec3): number {
  return len3(sub3(a, b));
}

const CUBE_VERTICES: Vec3[] = [
  [-1, 1, 1],   // 0: A
  [1, 1, 1],    // 1: B
  [1, 1, -1],   // 2: C
  [-1, 1, -1],  // 3: D
  [-1, -1, 1],  // 4: E
  [1, -1, 1],   // 5: F
  [1, -1, -1],  // 6: G
  [-1, -1, -1], // 7: H
];

const CUBE_EDGES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 0], // Top
  [4, 5], [5, 6], [6, 7], [7, 4], // Bottom
  [0, 4], [1, 5], [2, 6], [3, 7], // Verticals
];

/**
 * Checks if two 3D points on the cube surface share at least one of the 6 cube faces
 */
function getSharedCubeFaceAxis(a: Vec3, b: Vec3): { axis: 0 | 1 | 2; sign: number } | null {
  const eps = 1e-4;
  for (const axis of [0, 1, 2] as const) {
    if (Math.abs(a[axis] - 1) < eps && Math.abs(b[axis] - 1) < eps) {
      return { axis, sign: 1 };
    }
    if (Math.abs(a[axis] + 1) < eps && Math.abs(b[axis] + 1) < eps) {
      return { axis, sign: -1 };
    }
  }
  return null;
}

/**
 * Computes the exact intersection polygon of the plane passing through 3 CubePoints,
 * classifies each polygon edge into Construction Rule 1, 2, or 3, and computes
 * any external Extension Horns ("ツノ") where extended cube edges intersect the cutting plane!
 */
export function computeCubeCrossSection(
  p1: CubePoint,
  p2: CubePoint,
  p3: CubePoint,
  allPoints: CubePoint[]
): ComputedCrossSection {
  const v1 = p1.position;
  const v2 = p2.position;
  const v3 = p3.position;

  const u = sub3(v2, v1);
  const v = sub3(v3, v1);
  const rawNormal = cross3(u, v);
  const normalLen = len3(rawNormal);

  if (normalLen < 1e-5) {
    return {
      valid: false,
      polygon3D: [],
      polygon2D: [],
      edgeLengths: [],
      classifiedEdges: [],
      extensionHorns: [],
      shapeName: '一直線（平面が決まりません）',
      shapeDescription: '異なる直線上にある3点を選んでください。',
      planeNormal: [0, 1, 0],
      planeConstant: 0,
    };
  }

  let normal = norm3(rawNormal);
  if (normal[1] < -0.01 || (Math.abs(normal[1]) <= 0.01 && normal[2] < 0)) {
    normal = scale3(normal, -1);
  }
  const d = -dot3(normal, v1);

  const rawIntersections: Vec3[] = [];
  const EPS = 1e-5;

  for (const [iA, iB] of CUBE_EDGES) {
    const A = CUBE_VERTICES[iA];
    const B = CUBE_VERTICES[iB];
    const fA = dot3(normal, A) + d;
    const fB = dot3(normal, B) + d;

    if (Math.abs(fA) <= EPS && Math.abs(fB) <= EPS) {
      rawIntersections.push(A, B);
    } else if (Math.abs(fA) <= EPS) {
      rawIntersections.push(A);
    } else if (Math.abs(fB) <= EPS) {
      rawIntersections.push(B);
    } else if ((fA < 0 && fB > 0) || (fA > 0 && fB < 0)) {
      const t = fA / (fA - fB);
      const pt: Vec3 = [
        A[0] + t * (B[0] - A[0]),
        A[1] + t * (B[1] - A[1]),
        A[2] + t * (B[2] - A[2]),
      ];
      rawIntersections.push(pt);
    }
  }

  const uniquePts: Vec3[] = [];
  for (const pt of rawIntersections) {
    if (!uniquePts.some((uPt) => dist3(uPt, pt) < 1e-4)) {
      uniquePts.push(pt);
    }
  }

  if (uniquePts.length < 3) {
    return {
      valid: false,
      polygon3D: [],
      polygon2D: [],
      edgeLengths: [],
      classifiedEdges: [],
      extensionHorns: [],
      shapeName: '断面なし',
      shapeDescription: '平面が立方体の内部を通っていません。',
      planeNormal: normal,
      planeConstant: d,
    };
  }

  const centroid: Vec3 = [0, 0, 0];
  for (const pt of uniquePts) {
    centroid[0] += pt[0] / uniquePts.length;
    centroid[1] += pt[1] / uniquePts.length;
    centroid[2] += pt[2] / uniquePts.length;
  }

  const basisU = norm3(sub3(uniquePts[0], centroid));
  const basisV = norm3(cross3(normal, basisU));

  const sortedPts = uniquePts
    .map((pt) => {
      const rel = sub3(pt, centroid);
      const x = dot3(rel, basisU);
      const y = dot3(rel, basisV);
      const angle = Math.atan2(y, x);
      return { pt, x, y, angle };
    })
    .sort((a, b) => a.angle - b.angle);

  const polygon3D = sortedPts.map((item) => item.pt);

  let extraIdx = 1;
  const polygon2D = sortedPts.map((item) => {
    const matched = allPoints.find((cp) => dist3(cp.position, item.pt) < 0.05);
    const label = matched ? matched.label : `交点P${extraIdx++}`;
    return {
      x: item.x * 3,
      y: item.y * 3,
      label,
    };
  });

  const n = polygon3D.length;
  const edgeLengths: number[] = [];
  for (let i = 0; i < n; i++) {
    const cur = polygon3D[i];
    const next = polygon3D[(i + 1) % n];
    edgeLengths.push(dist3(cur, next) * 3);
  }

  // Classify each edge of the cross-section into Construction Step 1, 2, or 3
  const selectedPositions = [v1, v2, v3];
  const isSelectedPt = (pt: Vec3) =>
    selectedPositions.some((sp) => dist3(sp, pt) < 0.05);

  const rawEdgeMeta = polygon3D.map((cur, i) => {
    const next = polygon3D[(i + 1) % n];
    const sharedFace = getSharedCubeFaceAxis(cur, next);
    const bothSelected = isSelectedPt(cur) && isSelectedPt(next);
    return {
      i,
      cur,
      next,
      sharedFace,
      isStep1: bothSelected && sharedFace !== null,
    };
  });

  // Step 1 faces & directions: edges whose endpoints are both in the 3 selected points
  const step1Edges = rawEdgeMeta.filter((e) => e.isStep1 && e.sharedFace);
  const step1Axes = new Set<number>(step1Edges.map((e) => e.sharedFace!.axis));

  const classifiedEdges: ClassifiedCrossSectionEdge[] = rawEdgeMeta.map((e) => {
    let ruleStep: 1 | 2 | 3 = 3;
    let ruleLabel = '③ 延長線と交点から結ぶ線';

    if (e.isStep1) {
      ruleStep = 1;
      ruleLabel = '① 同じ面にある2点をまっすぐ結ぶ';
    } else if (e.sharedFace && step1Axes.has(e.sharedFace.axis)) {
      // Opposite parallel face to a Step 1 line
      const dirE = norm3(sub3(e.next, e.cur));
      const isParallelToStep1 = step1Edges.some((s1) => {
        const dirS1 = norm3(sub3(s1.next, s1.cur));
        return Math.abs(Math.abs(dot3(dirE, dirS1)) - 1) < 0.03;
      });
      if (isParallelToStep1) {
        ruleStep = 2;
        ruleLabel = '② 向かい合う平行な面に平行線を引く';
      }
    } else if (e.sharedFace) {
      // Also check if another edge on the opposite parallel face exists and is parallel
      const dirE = norm3(sub3(e.next, e.cur));
      const oppParallelExists = rawEdgeMeta.some((other) => {
        if (other.i === e.i || !other.sharedFace) return false;
        if (
          other.sharedFace.axis !== e.sharedFace!.axis ||
          other.sharedFace.sign !== -e.sharedFace!.sign
        ) {
          return false;
        }
        const dirOther = norm3(sub3(other.next, other.cur));
        return Math.abs(Math.abs(dot3(dirE, dirOther)) - 1) < 0.03;
      });
      if (oppParallelExists && (isSelectedPt(e.cur) || isSelectedPt(e.next))) {
        ruleStep = 2;
        ruleLabel = '② 向かい合う平行な面に平行線を引く';
      }
    }

    return {
      from3D: e.cur,
      to3D: e.next,
      from2D: polygon2D[e.i],
      to2D: polygon2D[(e.i + 1) % n],
      lengthCm: edgeLengths[e.i],
      ruleStep,
      ruleLabel,
    };
  });

  // Compute external "Extension Horns" (ツノ) where the plane intersects the infinite extensions
  // of the cube's 3 principal axis line bundles outside [-1, 1]^3 (within [-3.0, 3.0]^3)
  const extensionHorns: ExtensionHorn[] = [];
  for (const [iA, iB] of CUBE_EDGES) {
    const A = CUBE_VERTICES[iA];
    const B = CUBE_VERTICES[iB];
    const dir = sub3(B, A); // length 2 along one axis
    const denom = dot3(normal, dir);
    if (Math.abs(denom) < 1e-4) continue;
    // A + t * (B - A) on plane -> t = -(dot(n, A) + d) / dot(n, B - A)
    const t = -(dot3(normal, A) + d) / denom;
    // External intersection up to 1 full edge length outside the cube (t in [-1.05, -0.05] or [1.05, 2.05])
    if ((t < -0.05 && t >= -1.05) || (t > 1.05 && t <= 2.05)) {
      const apex: Vec3 = [
        A[0] + t * dir[0],
        A[1] + t * dir[1],
        A[2] + t * dir[2],
      ];
      // Deduplicate if multiple collinear or meeting edges produce the same apex
      if (extensionHorns.some((h) => dist3(h.apex, apex) < 0.08)) {
        continue;
      }
      const nearCubeCorner = t < 0 ? A : B;
      // Find the polygon vertices that lie on the two cube faces sharing this extended edge
      const adjacentPolyPts = polygon3D.filter((pt) => {
        const f1 = getSharedCubeFaceAxis(pt, A);
        const f2 = getSharedCubeFaceAxis(pt, B);
        return (f1 !== null || f2 !== null) && dist3(pt, nearCubeCorner) < 2.2;
      });

      const segments: [Vec3, Vec3][] = [[nearCubeCorner, apex]];
      for (const pPt of adjacentPolyPts) {
        if (dist3(pPt, nearCubeCorner) > 0.08) {
          segments.push([pPt, apex]);
        }
      }
      extensionHorns.push({ apex, segments });
    }
  }

  const { shapeName, shapeDescription } = classifyPolygon(polygon3D, edgeLengths);

  return {
    valid: true,
    polygon3D,
    polygon2D,
    edgeLengths,
    classifiedEdges,
    extensionHorns,
    shapeName,
    shapeDescription,
    planeNormal: normal,
    planeConstant: d,
  };
}

function classifyPolygon(
  pts: Vec3[],
  lengths: number[]
): { shapeName: string; shapeDescription: string } {
  const n = pts.length;
  const tol = 0.05;
  const allSidesEqual = lengths.every((l) => Math.abs(l - lengths[0]) < tol);

  if (n === 3) {
    if (allSidesEqual) {
      return {
        shapeName: '正三角形',
        shapeDescription:
          '3つの辺がすべて「立方体の面の対角線」になるため、3辺の長さが等しい正三角形になります。',
      };
    }
    const [a, b, c] = lengths;
    const isIso =
      Math.abs(a - b) < tol || Math.abs(b - c) < tol || Math.abs(c - a) < tol;
    if (isIso) {
      return {
        shapeName: '二等辺三角形',
        shapeDescription: '2つの辺の長さが等しい二等辺三角形です。',
      };
    }
    return {
      shapeName: '三角形',
      shapeDescription: '3つの辺の長さがそれぞれ異なる三角形です。',
    };
  }

  if (n === 4) {
    const e0 = norm3(sub3(pts[1], pts[0]));
    const e1 = norm3(sub3(pts[2], pts[1]));
    const e2 = norm3(sub3(pts[3], pts[2]));
    const e3 = norm3(sub3(pts[0], pts[3]));

    const p02 = Math.abs(Math.abs(dot3(e0, e2)) - 1) < 0.02;
    const p13 = Math.abs(Math.abs(dot3(e1, e3)) - 1) < 0.02;
    const rightAngle = Math.abs(dot3(e0, e1)) < 0.02;

    if (p02 && p13) {
      if (allSidesEqual && rightAngle) {
        return {
          shapeName: '正方形',
          shapeDescription: '4辺がすべて等しく、角が90°の正方形です。',
        };
      }
      if (rightAngle) {
        return {
          shapeName: '長方形',
          shapeDescription:
            '向かい合う辺が平行で等しく、4つの角がすべて直角（90°）の長方形です。',
        };
      }
      if (allSidesEqual) {
        return {
          shapeName: 'ひし形',
          shapeDescription:
            '4つの辺の長さはすべて同じ（約6.7cm）ですが、縦と横の対角線の長さが違うため、正方形ではなく「ひし形」になります！',
        };
      }
      return {
        shapeName: '平行四辺形',
        shapeDescription: '2組の向かい合う辺がそれぞれ平行な平行四辺形です。',
      };
    }

    if (p02 || p13) {
      const legEqual = p02
        ? Math.abs(lengths[1] - lengths[3]) < tol
        : Math.abs(lengths[0] - lengths[2]) < tol;
      return {
        shapeName: legEqual ? '等脚台形' : '台形',
        shapeDescription:
          '上面と底面（平行な面）につく切り口が平行で長さが1：2になり、左右の辺の長さが等しい「等脚台形」になります。',
      };
    }

    return {
      shapeName: '四角形',
      shapeDescription: '4つの面を横切る四角形の切り口です。',
    };
  }

  if (n === 5) {
    return {
      shapeName: '五角形',
      shapeDescription:
        '6つの面のうち5つの面を平面が横切るため「五角形」になります。STEP3の「延長線のツノ」を表示すると、なぜ辺の中点を通るのかがひと目で分かります！',
    };
  }

  if (n === 6) {
    if (allSidesEqual) {
      return {
        shapeName: '正六角形',
        shapeDescription:
          '6つの面すべての辺の中点を通るため、6辺の長さがすべて等しい（約4.2cm）「正六角形」になります。STEP1→2→3の順で作図ルールを確かめましょう！',
      };
    }
    return {
      shapeName: '六角形',
      shapeDescription: '6つの面すべてを横切る六角形の切り口です。',
    };
  }

  return {
    shapeName: `${n}角形`,
    shapeDescription: `${n}個の面を横切る断面です。`,
  };
}

export function buildClippedCubeGeometryData(
  normal: Vec3,
  d: number,
  side: 'positive' | 'negative'
): {
  bodyVertices: number[];
  capVertices: number[];
} {
  const sign = side === 'positive' ? 1 : -1;

  const faces: { n: Vec3; corners: Vec3[] }[] = [
    {
      n: [0, 1, 0],
      corners: [
        [-1, 1, 1],
        [1, 1, 1],
        [1, 1, -1],
        [-1, 1, -1],
      ],
    },
    {
      n: [0, -1, 0],
      corners: [
        [-1, -1, -1],
        [1, -1, -1],
        [1, -1, 1],
        [-1, -1, 1],
      ],
    },
    {
      n: [0, 0, 1],
      corners: [
        [-1, -1, 1],
        [1, -1, 1],
        [1, 1, 1],
        [-1, 1, 1],
      ],
    },
    {
      n: [0, 0, -1],
      corners: [
        [1, -1, -1],
        [-1, -1, -1],
        [-1, 1, -1],
        [1, 1, -1],
      ],
    },
    {
      n: [1, 0, 0],
      corners: [
        [1, -1, 1],
        [1, -1, -1],
        [1, 1, -1],
        [1, 1, 1],
      ],
    },
    {
      n: [-1, 0, 0],
      corners: [
        [-1, -1, -1],
        [-1, -1, 1],
        [-1, 1, 1],
        [-1, 1, -1],
      ],
    },
  ];

  const bodyVertices: number[] = [];

  for (const face of faces) {
    const poly = face.corners;
    const clipped: Vec3[] = [];
    for (let i = 0; i < poly.length; i++) {
      const cur = poly[i];
      const next = poly[(i + 1) % poly.length];
      const fCur = sign * (dot3(normal, cur) + d);
      const fNext = sign * (dot3(normal, next) + d);

      if (fCur >= -1e-5) {
        clipped.push(cur);
      }
      if ((fCur > 1e-5 && fNext < -1e-5) || (fCur < -1e-5 && fNext > 1e-5)) {
        const t = fCur / (fCur - fNext);
        clipped.push([
          cur[0] + t * (next[0] - cur[0]),
          cur[1] + t * (next[1] - cur[1]),
          cur[2] + t * (next[2] - cur[2]),
        ]);
      }
    }

    if (clipped.length >= 3) {
      for (let i = 1; i < clipped.length - 1; i++) {
        bodyVertices.push(...clipped[0], ...clipped[i], ...clipped[i + 1]);
      }
    }
  }

  return { bodyVertices, capVertices: [] };
}

export function evaluateTerrainElevation(
  presetId: string,
  x: number,
  z: number
): number {
  if (presetId === 'twin-peaks') {
    const peakWest =
      480 * Math.exp(-((x + 0.42) ** 2 / 0.16 + (z - 0.05) ** 2 / 0.22));
    const peakEast =
      360 * Math.exp(-((x - 0.45) ** 2 / 0.34 + (z + 0.08) ** 2 / 0.28));
    const southValley =
      -95 *
      Math.exp(-((x + 0.1) ** 2 / 0.045)) *
      Math.exp(-((z - 0.35) ** 2 / 0.22));
    return Math.max(100, 100 + peakWest + peakEast + southValley);
  }

  if (presetId === 'ridge-valley') {
    const distCenter = Math.hypot(x, z + 0.15);
    const angle = Math.atan2(z + 0.15, x);
    const baseMountain = 460 * Math.exp(-(distCenter * distCenter) / 0.48);
    const undulation =
      75 *
      Math.cos(angle * 3) *
      Math.pow(Math.min(distCenter / 0.7, 1.0), 1.3) *
      Math.exp(-(distCenter * distCenter) / 0.65);
    return Math.max(100, 100 + baseMountain + undulation);
  }

  if (presetId === 'alluvial-fan') {
    const mountainNorth = 420 * (1 / (1 + Math.exp((z + 0.22) * 8.5)));
    const gorgeCut =
      -165 *
      Math.exp(-(x * x) / 0.035) *
      (1 / (1 + Math.exp((z + 0.16) * 10)));
    const fanDist = Math.hypot(x, z + 0.2);
    const fan =
      z > -0.25
        ? 215 *
          Math.exp(-(fanDist * fanDist) / 0.45) *
          Math.max(0, 1 - Math.abs(x) * 0.65)
        : 0;
    return Math.max(100, 100 + mountainNorth + gorgeCut + fan);
  }

  const r = Math.hypot(x, z);
  const outerRing = 420 * Math.exp(-((r - 0.48) ** 2) / 0.045);
  const centralCone = 280 * Math.exp(-(r * r) / 0.035);
  const rimFloor =
    r < 0.48 ? 140 : 420 * Math.exp(-((r - 0.48) ** 2) / 0.18);
  return Math.max(100, 100 + Math.max(outerRing, centralCone, rimFloor * 0.5));
}

export function computeContourSegments(
  presetId: string,
  elevationLevel: number,
  gridSize = 48
): [number, number, number, number][] {
  const segments: [number, number, number, number][] = [];
  const step = 2 / gridSize;

  const grid: number[][] = [];
  for (let iz = 0; iz <= gridSize; iz++) {
    const row: number[] = [];
    const z = -1 + iz * step;
    for (let ix = 0; ix <= gridSize; ix++) {
      const x = -1 + ix * step;
      row.push(evaluateTerrainElevation(presetId, x, z));
    }
    grid.push(row);
  }

  const interp = (v1: number, v2: number) => {
    if (Math.abs(v2 - v1) < 1e-5) return 0.5;
    return (elevationLevel - v1) / (v2 - v1);
  };

  for (let iz = 0; iz < gridSize; iz++) {
    const z0 = -1 + iz * step;
    const z1 = z0 + step;
    for (let ix = 0; ix < gridSize; ix++) {
      const x0 = -1 + ix * step;
      const x1 = x0 + step;

      const v0 = grid[iz][ix];
      const v1 = grid[iz][ix + 1];
      const v2 = grid[iz + 1][ix + 1];
      const v3 = grid[iz + 1][ix];

      const idx =
        (v0 >= elevationLevel ? 1 : 0) |
        (v1 >= elevationLevel ? 2 : 0) |
        (v2 >= elevationLevel ? 4 : 0) |
        (v3 >= elevationLevel ? 8 : 0);

      if (idx === 0 || idx === 15) continue;

      const top: [number, number] = [x0 + interp(v0, v1) * step, z0];
      const right: [number, number] = [x1, z0 + interp(v1, v2) * step];
      const bottom: [number, number] = [x0 + interp(v3, v2) * step, z1];
      const left: [number, number] = [x0, z0 + interp(v0, v3) * step];

      switch (idx) {
        case 1:
        case 14:
          segments.push([left[0], left[1], top[0], top[1]]);
          break;
        case 2:
        case 13:
          segments.push([top[0], top[1], right[0], right[1]]);
          break;
        case 3:
        case 12:
          segments.push([left[0], left[1], right[0], right[1]]);
          break;
        case 4:
        case 11:
          segments.push([right[0], right[1], bottom[0], bottom[1]]);
          break;
        case 5:
          segments.push([left[0], left[1], bottom[0], bottom[1]]);
          segments.push([top[0], top[1], right[0], right[1]]);
          break;
        case 6:
        case 9:
          segments.push([top[0], top[1], bottom[0], bottom[1]]);
          break;
        case 7:
        case 8:
          segments.push([left[0], left[1], bottom[0], bottom[1]]);
          break;
        case 10:
          segments.push([left[0], left[1], top[0], top[1]]);
          segments.push([right[0], right[1], bottom[0], bottom[1]]);
          break;
      }
    }
  }

  return segments;
}

export function computeNetVertexMeetingMap(
  preset: NetPreset
): Record<string, { pos3D: [number, number, number]; meetsWith: string[] }> {
  const squareCorners: Vec3[] = [
    [-1, 0, -1],
    [1, 0, -1],
    [1, 0, 1],
    [-1, 0, 1],
  ];

  const getTriangleCorners = (hingePos: Vec3): Vec3[] => {
    if (hingePos[2] < -0.5) {
      return [
        [0, 0, -1],
        [1, 0, 1],
        [-1, 0, 1],
      ];
    }
    if (hingePos[2] > 0.5) {
      return [
        [0, 0, 1],
        [-1, 0, -1],
        [1, 0, -1],
      ];
    }
    if (hingePos[0] < -0.5) {
      return [
        [-1, 0, 0],
        [1, 0, -1],
        [1, 0, 1],
      ];
    }
    return [
      [1, 0, 0],
      [-1, 0, 1],
      [-1, 0, -1],
    ];
  };

  const rotateAroundAxis = (v: Vec3, k: Vec3, theta: number): Vec3 => {
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    const crossKV = cross3(k, v);
    const dotKV = dot3(k, v);
    return [
      v[0] * cosT + crossKV[0] * sinT + k[0] * dotKV * (1 - cosT),
      v[1] * cosT + crossKV[1] * sinT + k[1] * dotKV * (1 - cosT),
      v[2] * cosT + crossKV[2] * sinT + k[2] * dotKV * (1 - cosT),
    ];
  };

  const faceById = new Map(preset.faces.map((f) => [f.id, f]));

  const transformToRoot = (faceId: string, localPt: Vec3): Vec3 => {
    let pt = [...localPt] as Vec3;
    let cur = faceById.get(faceId);
    while (cur) {
      pt = add3(pt, cur.faceOffset);
      if (cur.parentId && Math.abs(cur.foldAngle) > 1e-5) {
        pt = rotateAroundAxis(pt, norm3(cur.hingeAxis), cur.foldAngle);
      }
      pt = add3(pt, cur.hingePos);
      cur = cur.parentId ? faceById.get(cur.parentId) : undefined;
    }
    return pt;
  };

  const labelPositions: { label: string; pos: Vec3 }[] = [];

  for (const face of preset.faces) {
    const localPts =
      face.shape === 'square'
        ? squareCorners
        : getTriangleCorners(face.hingePos);

    face.cornerLabels.forEach((lbl, idx) => {
      const worldPt = transformToRoot(face.id, localPts[idx] || [0, 0, 0]);
      if (!labelPositions.some((item) => item.label === lbl)) {
        labelPositions.push({ label: lbl, pos: worldPt });
      }
    });
  }

  const result: Record<string, { pos3D: Vec3; meetsWith: string[] }> = {};
  for (const item of labelPositions) {
    const matching = labelPositions
      .filter((other) => dist3(item.pos, other.pos) < 0.15)
      .map((other) => other.label);
    result[item.label] = {
      pos3D: item.pos,
      meetsWith: matching,
    };
  }
  return result;
}

export function getStrataShiftAt(
  preset: StrataPreset,
  x: number,
  z: number
): number {
  const dipShift =
    (x / 100) * preset.dipEastPer100m + (z / 100) * preset.dipSouthPer100m;
  const faultShift =
    preset.faultOffsetEast !== 0 && x > 15 ? preset.faultOffsetEast : 0;
  return dipShift + faultShift;
}
