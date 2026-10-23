import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  ModuleId,
  CameraPreset,
  NetPreset,
  CubePoint,
  ConstructionRuleStep,
  TopographyPreset,
  StrataPreset,
  RockType,
} from '../types/learning';
import {
  computeCubeCrossSection,
  buildClippedCubeGeometryData,
  evaluateTerrainElevation,
  computeContourSegments,
  computeNetVertexMeetingMap,
  getStrataShiftAt,
} from '../utils/geometryMath';

interface ThreeStageProps {
  moduleId: ModuleId;
  cameraPreset: CameraPreset;
  cameraTriggerSeq?: number;
  onCameraManualMove: () => void;
  showLabels: boolean;
  showGuides: boolean;

  // Module 1: Net
  netPreset: NetPreset;
  foldProgress: number; // 0..1
  highlightedVertexLabel: string | null;
  showZipperGuide: boolean;
  onSelectVertexLabel: (label: string) => void;

  // Module 2: Cross-section
  cubePoints: CubePoint[];
  selectedPointIds: [string, string, string];
  onToggleCubePoint: (pointId: string) => void;
  splitOffset: number; // 0..1
  constructionStep: ConstructionRuleStep; // 1 | 2 | 3
  showExtensionHorns: boolean;

  // Module 3: Topography
  topoPreset: TopographyPreset;
  elevationScale: number; // 0..1
  sliceZNorm: number; // -0.8 .. 0.8
  rainActive: boolean;

  // Module 4: Strata
  strataPreset: StrataPreset;
  strataSliceProgress: number; // 0..1
  drillDRevealed: boolean;
  onTriggerDrillD: () => void;
}

interface ProjectedLabel {
  id: string;
  text: string;
  subtext?: string;
  accent?: 'amber' | 'emerald' | 'sky' | 'rose' | 'purple' | 'neutral';
  priority?: 'high' | 'normal';
  depthCue?: boolean;
  clickable?: boolean;
  onClick?: () => void;
}

const isSoftwareGl = (() => {
  if (typeof document === 'undefined') return false;
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) return true;
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
  const gpu = String(gl.getParameter(param));
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
})();

const _vec3 = new THREE.Vector3();
const _worldPt = new THREE.Vector3();

function createProceduralContactShadow(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(128, 128, 16, 128, 128, 122);
  grad.addColorStop(0, 'rgba(15, 23, 42, 0.22)');
  grad.addColorStop(0.55, 'rgba(15, 23, 42, 0.08)');
  grad.addColorStop(1, 'rgba(15, 23, 42, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createFaceTileTexture(
  label: string,
  hexColor: string,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, 256, 256);

  ctx.fillStyle = hexColor;
  ctx.beginPath();
  ctx.roundRect(14, 14, 228, 228, 24);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.beginPath();
  ctx.arc(128, 128, 56, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 26px "Plus Jakarta Sans", "Noto Sans JP", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 128, 128);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createRockTexture(
  rockType: RockType,
  baseHex: string,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 256, 256);

  if (rockType === 'mudstone') {
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 3;
    for (let y = 10; y < 256; y += 18) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y);
      ctx.stroke();
    }
  } else if (rockType === 'sandstone') {
    for (let i = 0; i < 650; i++) {
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.28)' : 'rgba(15,23,42,0.14)';
      const rx = (i * 73) % 256;
      const ry = (i * 137) % 256;
      ctx.fillRect(rx, ry, 4, 4);
    }
  } else if (rockType === 'conglomerate') {
    for (let i = 0; i < 42; i++) {
      const rx = ((i * 53) % 224) + 16;
      const ry = ((i * 97) % 224) + 16;
      const r = 7 + (i % 6);
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.38)' : 'rgba(15,23,42,0.22)';
      ctx.beginPath();
      ctx.arc(rx, ry, r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (rockType === 'tuff') {
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 36; i++) {
      const rx = ((i * 61) % 220) + 18;
      const ry = ((i * 89) % 220) + 18;
      ctx.beginPath();
      ctx.moveTo(rx - 7, ry - 4);
      ctx.lineTo(rx, ry + 6);
      ctx.lineTo(rx + 7, ry - 4);
      ctx.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export const ThreeStage: React.FC<ThreeStageProps> = (props) => {
  const canvasMountRef = useRef<HTMLDivElement>(null);
  const labelNodesRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const [labelDescriptors, setLabelDescriptors] = useState<ProjectedLabel[]>([]);

  const propsRef = useRef(props);
  propsRef.current = props;

  const labelWorldAnchorsRef = useRef<
    {
      id: string;
      text: string;
      subtext?: string;
      worldPos: THREE.Vector3;
      localObj?: THREE.Object3D;
      localOffset?: THREE.Vector3;
      accent?: ProjectedLabel['accent'];
      priority?: 'high' | 'normal';
      depthCue?: boolean;
      clickable?: boolean;
      onClick?: () => void;
    }[]
  >([]);

  const sceneControlRef = useRef<{
    rebuildModuleScene: () => void;
    updateDynamicParams: () => void;
    setCameraGoal: (preset: CameraPreset) => void;
    requestRender: () => void;
  } | null>(null);

  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const width = mount.clientWidth || 800;
    const height = mount.clientHeight || 600;

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.localClippingEnabled = true;
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xeef2f6);
    scene.fog = new THREE.FogExp2(0xeef2f6, 0.024);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(5.4, 4.5, 6.2);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.minDistance = 2.8;
    controls.maxDistance = 18;
    controls.maxPolarAngle = Math.PI / 2 + 0.15;
    controls.target.set(0, 0.1, 0);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0xcbd5e1, 1.15);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfffbeb, 1.65);
    keyLight.position.set(6, 11, 7);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -6;
    keyLight.shadow.camera.right = 6;
    keyLight.shadow.camera.top = 6;
    keyLight.shadow.camera.bottom = -6;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xe0f2fe, 0.7);
    fillLight.position.set(-6, 5, -5);
    scene.add(fillLight);

    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const contactShadowTex = createProceduralContactShadow(maxAniso);

    // Domain-Specific Stage Base (Switches appearance between Math Acrylic Lab vs Geography/Science Wooden Diorama)
    const pedestalGroup = new THREE.Group();
    const mathBaseDisc = new THREE.Mesh(
      new THREE.CylinderGeometry(4.5, 4.65, 0.16, 48),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.65,
        metalness: 0.05,
      })
    );
    mathBaseDisc.position.y = -0.1;
    mathBaseDisc.receiveShadow = !isSoftwareGl;
    pedestalGroup.add(mathBaseDisc);

    // Wooden Diorama Frame for Topography & Strata
    const dioramaFrame = new THREE.Mesh(
      new THREE.BoxGeometry(5.1, 0.24, 5.1),
      new THREE.MeshStandardMaterial({
        color: 0xb45309,
        roughness: 0.55,
        metalness: 0.1,
      })
    );
    dioramaFrame.position.y = -0.12;
    dioramaFrame.receiveShadow = !isSoftwareGl;
    pedestalGroup.add(dioramaFrame);

    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(7.5, 7.5),
      new THREE.MeshBasicMaterial({
        map: contactShadowTex,
        transparent: true,
        depthWrite: false,
        opacity: 0.75,
      })
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = 0.01;
    pedestalGroup.add(shadowPlane);

    const gridHelper = new THREE.GridHelper(6.4, 8, 0x94a3b8, 0xe2e8f0);
    gridHelper.position.y = 0.005;
    pedestalGroup.add(gridHelper);

    pedestalGroup.position.y = -1.55;
    scene.add(pedestalGroup);

    const moduleRoot = new THREE.Group();
    scene.add(moduleRoot);

    const rockTextures: Record<RockType, THREE.CanvasTexture> = {
      mudstone: createRockTexture('mudstone', '#64748B', maxAniso),
      sandstone: createRockTexture('sandstone', '#F59E0B', maxAniso),
      conglomerate: createRockTexture('conglomerate', '#10B981', maxAniso),
      tuff: createRockTexture('tuff', '#F43F5E', maxAniso),
      topsoil: createRockTexture('mudstone', '#475569', maxAniso),
      limestone: createRockTexture('sandstone', '#94A3B8', maxAniso),
    };

    let currentSlider = propsRef.current.foldProgress;
    let targetSlider = propsRef.current.foldProgress;
    let currentSecondary = propsRef.current.sliceZNorm;
    let targetSecondary = propsRef.current.sliceZNorm;

    let cameraTransitionActive = false;
    const desiredCamPos = new THREE.Vector3(5.4, 4.5, 6.2);
    const desiredCamLook = new THREE.Vector3(0, 0.1, 0);

    controls.addEventListener('start', () => {
      cameraTransitionActive = false;
      propsRef.current.onCameraManualMove();
    });

    let netPivotMap = new Map<
      string,
      { pivot: THREE.Group; axis: THREE.Vector3; maxAngle: number }
    >();
    let netKnobWorldGetters = new Map<string, () => THREE.Vector3>();
    let netArcLines: {
      line: THREE.Line;
      fromLabel: string;
      toLabel: string;
    }[] = [];

    let crossSectionParts: {
      topHalf: THREE.Group;
      bottomHalf: THREE.Group;
      planeNormal: THREE.Vector3;
    } | null = null;

    let topoParts: {
      terrainMesh: THREE.Mesh;
      basePositions: Float32Array;
      elevations: Float32Array;
      contourGroup: THREE.Group;
      sliceGroup: THREE.Group;
      sliceLineMesh: THREE.Line;
      guideGroup: THREE.Group;
      streamLines: { line: THREE.Line; ptsNorm: [number, number][] }[];
      rainDroplets: {
        mesh: THREE.Mesh;
        streamIdx: number;
        t: number;
        speed: number;
      }[];
    } | null = null;

    let strataParts: {
      blockGroup: THREE.Group;
      layerMaterials: THREE.MeshStandardMaterial[];
      clipPlane: THREE.Plane;
      slicePlaneIndicator: THREE.Mesh;
    } | null = null;

    const clickableMeshes: THREE.Object3D[] = [];
    const disposableTextures: THREE.Texture[] = [];

    function clearModuleRoot() {
      clickableMeshes.length = 0;
      netPivotMap.clear();
      netKnobWorldGetters.clear();
      netArcLines = [];
      crossSectionParts = null;
      topoParts = null;
      strataParts = null;

      while (disposableTextures.length > 0) {
        disposableTextures.pop()?.dispose();
      }

      while (moduleRoot.children.length > 0) {
        const child = moduleRoot.children[0];
        child.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const m = obj as THREE.Mesh;
            m.geometry?.dispose();
            if (Array.isArray(m.material)) {
              m.material.forEach((mat) => mat.dispose());
            } else if (m.material) {
              m.material.dispose();
            }
          }
        });
        moduleRoot.remove(child);
      }
    }

    function updateProjectedLabelsDOM() {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const anchors = labelWorldAnchorsRef.current;
      const show = propsRef.current.showLabels;
      const centerDist = camera.position.distanceTo(controls.target);

      for (const anchor of anchors) {
        const el = labelNodesRef.current.get(anchor.id);
        if (!el) continue;
        if (!show && anchor.priority !== 'high') {
          el.style.opacity = '0';
          el.style.pointerEvents = 'none';
          continue;
        }

        if (anchor.localObj && anchor.localOffset) {
          _worldPt.copy(anchor.localOffset);
          anchor.localObj.localToWorld(_worldPt);
        } else {
          _worldPt.copy(anchor.worldPos);
        }

        const ptDist = camera.position.distanceTo(_worldPt);
        _vec3.copy(_worldPt).project(camera);
        if (_vec3.z > 1.0 || _vec3.z < -1.0) {
          el.style.opacity = '0';
          el.style.pointerEvents = 'none';
          continue;
        }

        // Depth cue: fade and slightly shrink labels on the back side of the 3D object
        const isBehind = anchor.depthCue && ptDist > centerDist + 0.45 && anchor.priority !== 'high';
        const scale = isBehind ? 0.85 : 1.0;
        const opacity = isBehind ? '0.42' : '1';

        const x = (_vec3.x * 0.5 + 0.5) * rect.width;
        const y = (-(_vec3.y * 0.5) + 0.5) * rect.height;
        el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%) scale(${scale})`;
        el.style.opacity = opacity;
        el.style.pointerEvents = anchor.clickable ? 'auto' : 'none';
      }
    }

    function buildModuleScene() {
      clearModuleRoot();
      const p = propsRef.current;
      const newAnchors: typeof labelWorldAnchorsRef.current = [];

      const isMathModule = p.moduleId === 'net' || p.moduleId === 'cross-section';
      mathBaseDisc.visible = isMathModule;
      gridHelper.visible = isMathModule;
      dioramaFrame.visible = !isMathModule;

      if (p.moduleId === 'net') {
        pedestalGroup.position.y = -1.15;
        const preset = p.netPreset;
        const meetingMap = computeNetVertexMeetingMap(preset);
        const targetMeetGroup =
          p.highlightedVertexLabel && meetingMap[p.highlightedVertexLabel]
            ? meetingMap[p.highlightedVertexLabel].meetsWith
            : [];

        const netRoot = new THREE.Group();
        netRoot.position.y = -0.95;
        moduleRoot.add(netRoot);

        const faceCenterGroups = new Map<string, THREE.Group>();

        for (const face of preset.faces) {
          const pivotGroup = new THREE.Group();
          pivotGroup.position.set(...face.hingePos);

          const faceCenter = new THREE.Group();
          faceCenter.position.set(...face.faceOffset);
          pivotGroup.add(faceCenter);
          faceCenterGroups.set(face.id, faceCenter);

          if (face.parentId && faceCenterGroups.has(face.parentId)) {
            faceCenterGroups.get(face.parentId)!.add(pivotGroup);
          } else {
            netRoot.add(pivotGroup);
          }

          netPivotMap.set(face.id, {
            pivot: pivotGroup,
            axis: new THREE.Vector3(...face.hingeAxis).normalize(),
            maxAngle: face.foldAngle,
          });

          const tileTex = createFaceTileTexture(face.label, face.color, maxAniso);
          disposableTextures.push(tileTex);

          if (face.shape === 'square') {
            const sideMat = new THREE.MeshStandardMaterial({
              color: 0xffffff,
              roughness: 0.3,
              metalness: 0.05,
            });
            const faceMat = new THREE.MeshPhysicalMaterial({
              map: tileTex,
              roughness: 0.25,
              metalness: 0.05,
              clearcoat: 0.35,
            });
            const boxGeo = new THREE.BoxGeometry(1.94, 0.09, 1.94);
            const plateMesh = new THREE.Mesh(boxGeo, [
              sideMat,
              sideMat,
              faceMat,
              faceMat,
              sideMat,
              sideMat,
            ]);
            plateMesh.castShadow = !isSoftwareGl;
            plateMesh.receiveShadow = !isSoftwareGl;
            faceCenter.add(plateMesh);
          } else {
            const triShape = new THREE.Shape();
            if (face.hingePos[2] < -0.5) {
              triShape.moveTo(-0.96, -1);
              triShape.lineTo(0.96, -1);
              triShape.lineTo(0, 0.96);
            } else if (face.hingePos[2] > 0.5) {
              triShape.moveTo(-0.96, 1);
              triShape.lineTo(0.96, 1);
              triShape.lineTo(0, -0.96);
            } else if (face.hingePos[0] < -0.5) {
              triShape.moveTo(-0.96, 0);
              triShape.lineTo(1, -0.96);
              triShape.lineTo(1, 0.96);
            } else {
              triShape.moveTo(0.96, 0);
              triShape.lineTo(-1, -0.96);
              triShape.lineTo(-1, 0.96);
            }
            triShape.closePath();
            const extrudeGeo = new THREE.ExtrudeGeometry(triShape, {
              depth: 0.07,
              bevelEnabled: true,
              bevelSize: 0.02,
              bevelThickness: 0.02,
              bevelSegments: 2,
            });
            extrudeGeo.rotateX(Math.PI / 2);
            const plateMesh = new THREE.Mesh(
              extrudeGeo,
              new THREE.MeshPhysicalMaterial({
                color: new THREE.Color(face.color),
                roughness: 0.3,
                metalness: 0.05,
                clearcoat: 0.3,
              })
            );
            plateMesh.castShadow = !isSoftwareGl;
            faceCenter.add(plateMesh);
          }

          if (face.parentId) {
            const hingeGeo = new THREE.CylinderGeometry(0.055, 0.055, 1.4, 14);
            if (Math.abs(face.hingeAxis[0]) > 0.5) {
              hingeGeo.rotateZ(Math.PI / 2);
            } else {
              hingeGeo.rotateX(Math.PI / 2);
            }
            const hingeMesh = new THREE.Mesh(
              hingeGeo,
              new THREE.MeshStandardMaterial({
                color: 0x475569,
                metalness: 0.7,
                roughness: 0.25,
              })
            );
            pivotGroup.add(hingeMesh);
          }

          const localCorners: [number, number, number][] =
            face.shape === 'square'
              ? [
                  [-0.92, 0.07, -0.92],
                  [0.92, 0.07, -0.92],
                  [0.92, 0.07, 0.92],
                  [-0.92, 0.07, 0.92],
                ]
              : face.hingePos[2] < -0.5
              ? [
                  [0, 0.07, -0.94],
                  [0.92, 0.07, 0.92],
                  [-0.92, 0.07, 0.92],
                ]
              : face.hingePos[2] > 0.5
              ? [
                  [0, 0.07, 0.94],
                  [-0.92, 0.07, -0.92],
                  [0.92, 0.07, -0.92],
                ]
              : face.hingePos[0] < -0.5
              ? [
                  [-0.94, 0.07, 0],
                  [0.92, 0.07, -0.92],
                  [0.92, 0.07, 0.92],
                ]
              : [
                  [0.94, 0.07, 0],
                  [-0.92, 0.07, 0.92],
                  [-0.92, 0.07, -0.92],
                ];

          face.cornerLabels.forEach((lbl, idx) => {
            const isHighlighted = targetMeetGroup.includes(lbl);
            const cornerOffset = new THREE.Vector3(...(localCorners[idx] || [0, 0, 0]));
            const knobMesh = new THREE.Mesh(
              new THREE.SphereGeometry(isHighlighted ? 0.16 : 0.09, 20, 20),
              new THREE.MeshStandardMaterial({
                color: isHighlighted ? 0xf59e0b : 0x334155,
                emissive: isHighlighted ? 0xf59e0b : 0x000000,
                emissiveIntensity: isHighlighted ? 0.45 : 0,
                roughness: 0.2,
                metalness: 0.2,
              })
            );
            knobMesh.position.copy(cornerOffset);
            knobMesh.userData = { vertexLabel: lbl };
            clickableMeshes.push(knobMesh);
            faceCenter.add(knobMesh);

            if (!netKnobWorldGetters.has(lbl)) {
              netKnobWorldGetters.set(lbl, () => {
                const v = cornerOffset.clone();
                faceCenter.localToWorld(v);
                return v;
              });
            }

            if (isHighlighted) {
              const ringMesh = new THREE.Mesh(
                new THREE.TorusGeometry(0.23, 0.03, 12, 24),
                new THREE.MeshBasicMaterial({ color: 0xd97706 })
              );
              ringMesh.rotation.x = Math.PI / 2;
              ringMesh.position.copy(cornerOffset);
              faceCenter.add(ringMesh);
            }

            if (!newAnchors.some((a) => a.id === `v-${lbl}`)) {
              newAnchors.push({
                id: `v-${lbl}`,
                text: lbl,
                worldPos: new THREE.Vector3(),
                localObj: faceCenter,
                localOffset: cornerOffset.clone().add(new THREE.Vector3(0, 0.22, 0)),
                accent: isHighlighted ? 'amber' : 'neutral',
                priority: isHighlighted ? 'high' : 'normal',
                depthCue: true,
                clickable: true,
                onClick: () => propsRef.current.onSelectVertexLabel(lbl),
              });
            }
          });
        }

        // Build 3D Zipper Trajectory Arcs connecting meeting vertices!
        const arcsToRender: { fromLabel: string; toLabel: string; color: string }[] = [];
        if (p.showZipperGuide && preset.zipperArcs) {
          for (const za of preset.zipperArcs) {
            arcsToRender.push({
              fromLabel: za.fromLabel,
              toLabel: za.toLabel,
              color: za.color,
            });
          }
        } else if (p.highlightedVertexLabel && targetMeetGroup.length > 1) {
          for (const otherLbl of targetMeetGroup) {
            if (otherLbl !== p.highlightedVertexLabel) {
              arcsToRender.push({
                fromLabel: p.highlightedVertexLabel,
                toLabel: otherLbl,
                color: '#F59E0B',
              });
            }
          }
        }

        for (const arcDef of arcsToRender) {
          const arcGeo = new THREE.BufferGeometry();
          arcGeo.setAttribute(
            'position',
            new THREE.BufferAttribute(new Float32Array(21 * 3), 3)
          );
          const arcLine = new THREE.Line(
            arcGeo,
            new THREE.LineBasicMaterial({ color: new THREE.Color(arcDef.color) })
          );
          moduleRoot.add(arcLine);
          netArcLines.push({
            line: arcLine,
            fromLabel: arcDef.fromLabel,
            toLabel: arcDef.toLabel,
          });
        }
      } else if (p.moduleId === 'cross-section') {
        pedestalGroup.position.y = -1.55;

        const scale = 1.35;
        const ptsMap = new Map(p.cubePoints.map((cp) => [cp.id, cp]));
        const p1 = ptsMap.get(p.selectedPointIds[0]) || p.cubePoints[0];
        const p2 = ptsMap.get(p.selectedPointIds[1]) || p.cubePoints[1];
        const p3 = ptsMap.get(p.selectedPointIds[2]) || p.cubePoints[2];

        const csResult = computeCubeCrossSection(p1, p2, p3, p.cubePoints);

        const refFrameGeo = new THREE.EdgesGeometry(
          new THREE.BoxGeometry(2 * scale, 2 * scale, 2 * scale)
        );
        const refFrame = new THREE.LineSegments(
          refFrameGeo,
          new THREE.LineBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.55 })
        );
        moduleRoot.add(refFrame);

        const topHalf = new THREE.Group();
        const bottomHalf = new THREE.Group();
        moduleRoot.add(topHalf, bottomHalf);

        if (csResult.valid && csResult.polygon3D.length >= 3) {
          const posData = buildClippedCubeGeometryData(
            csResult.planeNormal,
            csResult.planeConstant,
            'positive'
          );
          const negData = buildClippedCubeGeometryData(
            csResult.planeNormal,
            csResult.planeConstant,
            'negative'
          );

          const createHalfMesh = (verts: number[], opacity: number, color: number) => {
            const geo = new THREE.BufferGeometry();
            const scaled = new Float32Array(verts.map((v) => v * scale));
            geo.setAttribute('position', new THREE.BufferAttribute(scaled, 3));
            geo.computeVertexNormals();
            const mat = new THREE.MeshPhysicalMaterial({
              color,
              roughness: 0.18,
              metalness: 0.05,
              clearcoat: 0.6,
              transparent: true,
              opacity,
              side: THREE.DoubleSide,
              depthWrite: opacity > 0.5,
            });
            return new THREE.Mesh(geo, mat);
          };

          const negMesh = createHalfMesh(negData.bodyVertices, 0.72, 0x38bdf8);
          const negEdges = new THREE.LineSegments(
            new THREE.EdgesGeometry(negMesh.geometry, 15),
            new THREE.LineBasicMaterial({ color: 0x0284c7 })
          );
          bottomHalf.add(negMesh, negEdges);

          if (p.showGuides) {
            const posMesh = createHalfMesh(posData.bodyVertices, 0.16, 0x94a3b8);
            const posEdges = new THREE.LineSegments(
              new THREE.EdgesGeometry(posMesh.geometry, 15),
              new THREE.LineBasicMaterial({ color: 0x64748b, transparent: true, opacity: 0.4 })
            );
            topHalf.add(posMesh, posEdges);
          }

          // Only fill the interior polygon cap when on Step 3 (Full completion)
          if (p.constructionStep === 3) {
            const capTris: number[] = [];
            const poly = csResult.polygon3D;
            for (let i = 1; i < poly.length - 1; i++) {
              capTris.push(
                poly[0][0] * scale,
                poly[0][1] * scale,
                poly[0][2] * scale,
                poly[i][0] * scale,
                poly[i][1] * scale,
                poly[i][2] * scale,
                poly[i + 1][0] * scale,
                poly[i + 1][1] * scale,
                poly[i + 1][2] * scale
              );
            }
            const capGeo = new THREE.BufferGeometry();
            capGeo.setAttribute(
              'position',
              new THREE.BufferAttribute(new Float32Array(capTris), 3)
            );
            capGeo.computeVertexNormals();

            const capMat = new THREE.MeshStandardMaterial({
              color: 0xf59e0b,
              emissive: 0xf59e0b,
              emissiveIntensity: 0.25,
              roughness: 0.25,
              metalness: 0.1,
              side: THREE.DoubleSide,
              polygonOffset: true,
              polygonOffsetFactor: -1,
              polygonOffsetUnits: -1,
            });
            const capMeshBottom = new THREE.Mesh(capGeo, capMat);
            bottomHalf.add(capMeshBottom);
          }

          // Render Cross-Section Edges colored by Construction Rule Step (1: Emerald, 2: Sky, 3: Amber)
          for (const ce of csResult.classifiedEdges) {
            if (ce.ruleStep > p.constructionStep) continue;
            const va = new THREE.Vector3(
              ce.from3D[0] * scale,
              ce.from3D[1] * scale,
              ce.from3D[2] * scale
            );
            const vb = new THREE.Vector3(
              ce.to3D[0] * scale,
              ce.to3D[1] * scale,
              ce.to3D[2] * scale
            );
            const curve = new THREE.LineCurve3(va, vb);
            const tubeColor =
              ce.ruleStep === 1
                ? 0x10b981 // Rule 1: Same face (Emerald)
                : ce.ruleStep === 2
                ? 0x0284c7 // Rule 2: Parallel face (Sky Blue)
                : 0xd97706; // Rule 3: Extended horn intersection (Amber)
            const tubeGeo = new THREE.TubeGeometry(curve, 4, 0.042, 10, false);
            const tubeMesh = new THREE.Mesh(
              tubeGeo,
              new THREE.MeshBasicMaterial({ color: tubeColor })
            );
            bottomHalf.add(tubeMesh);
          }

          // Render 3D External Extension Horns ("延長線のツノ") when enabled or on Step 3!
          if (p.showExtensionHorns && csResult.extensionHorns.length > 0) {
            csResult.extensionHorns.forEach((horn, hIdx) => {
              const apexVec = new THREE.Vector3(
                horn.apex[0] * scale,
                horn.apex[1] * scale,
                horn.apex[2] * scale
              );
              const apexSphere = new THREE.Mesh(
                new THREE.SphereGeometry(0.11, 16, 16),
                new THREE.MeshBasicMaterial({ color: 0x9333ea })
              );
              apexSphere.position.copy(apexVec);
              bottomHalf.add(apexSphere);

              for (const [segA, segB] of horn.segments) {
                const pA = new THREE.Vector3(
                  segA[0] * scale,
                  segA[1] * scale,
                  segA[2] * scale
                );
                const pB = new THREE.Vector3(
                  segB[0] * scale,
                  segB[1] * scale,
                  segB[2] * scale
                );
                const hCurve = new THREE.LineCurve3(pA, pB);
                const hTube = new THREE.Mesh(
                  new THREE.TubeGeometry(hCurve, 4, 0.022, 8, false),
                  new THREE.MeshBasicMaterial({
                    color: 0x9333ea,
                    transparent: true,
                    opacity: 0.85,
                  })
                );
                bottomHalf.add(hTube);
              }

              if (hIdx < 2) {
                newAnchors.push({
                  id: `horn-${hIdx}`,
                  text: `延長の交点(ツノ)`,
                  worldPos: apexVec.clone().multiplyScalar(1.08),
                  accent: 'purple',
                  priority: 'high',
                });
              }
            });
          }
        }

        crossSectionParts = {
          topHalf,
          bottomHalf,
          planeNormal: new THREE.Vector3(...csResult.planeNormal),
        };

        for (const cp of p.cubePoints) {
          const isSelected = p.selectedPointIds.includes(cp.id);
          const isVertex = cp.type === 'vertex';
          const sphereRadius = isSelected ? 0.16 : isVertex ? 0.085 : 0.075;
          const sphereMat = new THREE.MeshStandardMaterial({
            color: isSelected ? 0xf43f5e : isVertex ? 0x1e293b : 0x0284c7,
            emissive: isSelected ? 0xf43f5e : 0x000000,
            emissiveIntensity: isSelected ? 0.45 : 0,
            roughness: 0.2,
            metalness: 0.2,
          });
          const sphere = new THREE.Mesh(
            new THREE.SphereGeometry(sphereRadius, 20, 20),
            sphereMat
          );
          sphere.position.set(
            cp.position[0] * scale,
            cp.position[1] * scale,
            cp.position[2] * scale
          );
          sphere.userData = { cubePointId: cp.id };
          clickableMeshes.push(sphere);
          moduleRoot.add(sphere);

          if (isSelected) {
            const ring = new THREE.Mesh(
              new THREE.TorusGeometry(0.22, 0.028, 12, 24),
              new THREE.MeshBasicMaterial({ color: 0xe11d48 })
            );
            ring.position.copy(sphere.position);
            ring.lookAt(camera.position);
            moduleRoot.add(ring);
          }

          if (isSelected || isVertex) {
            newAnchors.push({
              id: `cp-${cp.id}`,
              text: cp.label.replace(/\(.*\)/, ''),
              worldPos: sphere.position.clone().multiplyScalar(1.15),
              accent: isSelected ? 'rose' : 'neutral',
              priority: isSelected ? 'high' : 'normal',
              depthCue: true,
              clickable: true,
              onClick: () => propsRef.current.onToggleCubePoint(cp.id),
            });
          }
        }
      } else if (p.moduleId === 'topography') {
        pedestalGroup.position.y = -1.15;

        const preset = p.topoPreset;
        const size = 4.6;
        const segs = 76;
        const geo = new THREE.PlaneGeometry(size, size, segs, segs);
        geo.rotateX(-Math.PI / 2);

        const posAttr = geo.attributes.position;
        const basePositions = new Float32Array(posAttr.array.length);
        const elevations = new Float32Array(posAttr.count);
        const colors = new Float32Array(posAttr.count * 3);

        const cLow = new THREE.Color(0x22c55e);
        const cMid = new THREE.Color(0xfacc15);
        const cHigh = new THREE.Color(0xea580c);
        const cTop = new THREE.Color(0xffffff);
        const tmpColor = new THREE.Color();

        for (let i = 0; i < posAttr.count; i++) {
          const vx = posAttr.getX(i);
          const vz = posAttr.getZ(i);
          basePositions[i * 3] = vx;
          basePositions[i * 3 + 1] = -1.0;
          basePositions[i * 3 + 2] = vz;

          const nx = vx / (size / 2);
          const nz = vz / (size / 2);
          const elev = evaluateTerrainElevation(preset.id, nx, nz);
          elevations[i] = elev;

          const t = THREE.MathUtils.clamp((elev - 100) / 450, 0, 1);
          if (t < 0.38) {
            tmpColor.lerpColors(cLow, cMid, t / 0.38);
          } else if (t < 0.78) {
            tmpColor.lerpColors(cMid, cHigh, (t - 0.38) / 0.4);
          } else {
            tmpColor.lerpColors(cHigh, cTop, (t - 0.78) / 0.22);
          }
          colors[i * 3] = tmpColor.r;
          colors[i * 3 + 1] = tmpColor.g;
          colors[i * 3 + 2] = tmpColor.b;
        }

        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const terrainMat = new THREE.MeshStandardMaterial({
          vertexColors: true,
          roughness: 0.55,
          metalness: 0.05,
          side: THREE.DoubleSide,
        });

        const terrainMesh = new THREE.Mesh(geo, terrainMat);
        terrainMesh.castShadow = !isSoftwareGl;
        terrainMesh.receiveShadow = !isSoftwareGl;
        moduleRoot.add(terrainMesh);

        const contourGroup = new THREE.Group();
        moduleRoot.add(contourGroup);

        for (let elev = 150; elev <= 550; elev += 50) {
          const isIndexContour = elev % 200 === 0;
          const segList = computeContourSegments(preset.id, elev, 44);
          if (segList.length === 0) continue;

          const lineVerts: number[] = [];
          for (const [x1, z1, x2, z2] of segList) {
            lineVerts.push(
              x1 * (size / 2),
              0,
              z1 * (size / 2),
              x2 * (size / 2),
              0,
              z2 * (size / 2)
            );
          }
          const lineGeo = new THREE.BufferGeometry();
          lineGeo.setAttribute(
            'position',
            new THREE.BufferAttribute(new Float32Array(lineVerts), 3)
          );
          const lineMat = new THREE.LineBasicMaterial({
            color: isIndexContour ? 0x7c2d12 : 0x1e293b,
            transparent: true,
            opacity: isIndexContour ? 0.95 : 0.55,
          });
          const lineSegs = new THREE.LineSegments(lineGeo, lineMat);
          lineSegs.userData = { elevation: elev };
          contourGroup.add(lineSegs);
        }

        const sliceGroup = new THREE.Group();
        const slicePlaneMesh = new THREE.Mesh(
          new THREE.PlaneGeometry(size + 0.3, 2.8),
          new THREE.MeshBasicMaterial({
            color: 0xf43f5e,
            transparent: true,
            opacity: 0.18,
            side: THREE.DoubleSide,
            depthWrite: false,
          })
        );
        slicePlaneMesh.position.y = 0.1;
        sliceGroup.add(slicePlaneMesh);

        const sliceLineGeo = new THREE.BufferGeometry();
        const slicePts = new Float32Array((segs + 1) * 3);
        sliceLineGeo.setAttribute('position', new THREE.BufferAttribute(slicePts, 3));
        const sliceLineMesh = new THREE.Line(
          sliceLineGeo,
          new THREE.LineBasicMaterial({ color: 0xe11d48 })
        );
        moduleRoot.add(sliceGroup, sliceLineMesh);

        const guideGroup = new THREE.Group();
        guideGroup.visible = p.showGuides;
        moduleRoot.add(guideGroup);

        for (const ann of preset.ridgeValleyAnnotations) {
          const wx = ann.x * (size / 2);
          const wz = ann.z * (size / 2);
          const elev = evaluateTerrainElevation(preset.id, ann.x, ann.z);
          const wy = -1.0 + ((elev - 100) / 450) * 2.2 * p.elevationScale;

          const pinGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.35, 10);
          const pinMat = new THREE.MeshBasicMaterial({
            color:
              ann.type === 'valley'
                ? 0x0284c7
                : ann.type === 'ridge'
                ? 0xd97706
                : 0x059669,
          });
          const pin = new THREE.Mesh(pinGeo, pinMat);
          pin.position.set(wx, wy + 0.18, wz);
          pin.userData = { baseElev: elev, wx, wz };
          guideGroup.add(pin);

          newAnchors.push({
            id: `topo-${ann.label}`,
            text: ann.label,
            subtext: `${Math.round(elev)}m`,
            worldPos: new THREE.Vector3(wx, wy + 0.42, wz),
            accent:
              ann.type === 'valley'
                ? 'sky'
                : ann.type === 'ridge'
                ? 'amber'
                : 'emerald',
            priority: 'high',
          });
        }

        // Rain & Valley River Streams
        const streamLines: { line: THREE.Line; ptsNorm: [number, number][] }[] = [];
        const rainDroplets: {
          mesh: THREE.Mesh;
          streamIdx: number;
          t: number;
          speed: number;
        }[] = [];

        if (p.rainActive && preset.valleyStreams) {
          const dropletGeo = new THREE.SphereGeometry(0.075, 12, 12);
          const dropletMat = new THREE.MeshBasicMaterial({ color: 0x0284c7 });

          preset.valleyStreams.forEach((ptsNorm, sIdx) => {
            const sGeo = new THREE.BufferGeometry();
            sGeo.setAttribute(
              'position',
              new THREE.BufferAttribute(new Float32Array(ptsNorm.length * 3), 3)
            );
            const sLine = new THREE.Line(
              sGeo,
              new THREE.LineBasicMaterial({ color: 0x0284c7 })
            );
            moduleRoot.add(sLine);
            streamLines.push({ line: sLine, ptsNorm });

            for (let dIdx = 0; dIdx < 5; dIdx++) {
              const dropMesh = new THREE.Mesh(dropletGeo, dropletMat);
              moduleRoot.add(dropMesh);
              rainDroplets.push({
                mesh: dropMesh,
                streamIdx: sIdx,
                t: dIdx / 5,
                speed: 0.42,
              });
            }
          });
        }

        topoParts = {
          terrainMesh,
          basePositions,
          elevations,
          contourGroup,
          sliceGroup,
          sliceLineMesh,
          guideGroup,
          streamLines,
          rainDroplets,
        };
      } else if (p.moduleId === 'strata') {
        pedestalGroup.position.y = -1.45;

        const preset = p.strataPreset;
        const blockGroup = new THREE.Group();
        moduleRoot.add(blockGroup);

        const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 1.8);
        const layerMaterials: THREE.MeshStandardMaterial[] = [];

        const elevToY = (elevM: number) => -1.35 + elevM * 0.05;
        const coordToWorld = (m: number) => (m / 100) * 2.2;

        for (const site of preset.boreholes) {
          const wx = coordToWorld(site.x);
          const wz = coordToWorld(site.z);
          const shift = getStrataShiftAt(preset, site.x, site.z);
          const refSurface = 50 + shift;

          // If this is Mystery Site D and not drilled yet, render a surface drill target instead of the underground core!
          if (site.isMysterySite && !p.drillDRevealed) {
            const surfY = elevToY(site.surfaceElevation);
            const targetRing = new THREE.Mesh(
              new THREE.TorusGeometry(0.24, 0.035, 12, 24),
              new THREE.MeshBasicMaterial({ color: 0x9333ea })
            );
            targetRing.rotation.x = Math.PI / 2;
            targetRing.position.set(wx, surfY + 0.04, wz);
            moduleRoot.add(targetRing);

            newAnchors.push({
              id: `bh-${site.id}`,
              text: `⛏️ ？ D地点を掘る`,
              subtext: `標高${site.surfaceElevation}m`,
              worldPos: new THREE.Vector3(wx, surfY + 0.45, wz),
              accent: 'purple',
              priority: 'high',
              clickable: true,
              onClick: () => propsRef.current.onTriggerDrillD(),
            });
            continue;
          }

          let currentTopM = refSurface;
          for (const layer of preset.layers) {
            const layerTopM = currentTopM;
            const layerBotM = currentTopM - layer.thickness;
            currentTopM = layerBotM;

            const clampedTop = Math.min(site.surfaceElevation, layerTopM);
            const clampedBot = Math.max(0, layerBotM);
            if (clampedTop <= clampedBot) continue;

            const hUnits = (clampedTop - clampedBot) * 0.05;
            const midY = elevToY((clampedTop + clampedBot) / 2);

            const coreGeo = new THREE.CylinderGeometry(0.22, 0.22, hUnits, 24);
            const coreMat = new THREE.MeshStandardMaterial({
              map: rockTextures[layer.rockType],
              roughness: 0.4,
              metalness: 0.08,
            });
            const coreMesh = new THREE.Mesh(coreGeo, coreMat);
            coreMesh.position.set(wx, midY, wz);
            coreMesh.castShadow = !isSoftwareGl;
            moduleRoot.add(coreMesh);

            if (layer.rockType === 'tuff') {
              const ring = new THREE.Mesh(
                new THREE.TorusGeometry(0.24, 0.032, 12, 24),
                new THREE.MeshBasicMaterial({
                  color: site.isMysterySite ? 0x9333ea : 0xe11d48,
                })
              );
              ring.rotation.x = Math.PI / 2;
              ring.position.set(wx, midY, wz);
              moduleRoot.add(ring);
            }
          }

          const surfY = elevToY(site.surfaceElevation);
          const rigPole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.03, 0.03, 0.45, 10),
            new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.5, roughness: 0.2 })
          );
          rigPole.position.set(wx, surfY + 0.22, wz);
          moduleRoot.add(rigPole);

          newAnchors.push({
            id: `bh-${site.id}`,
            text: `${site.id}地点`,
            subtext: `標高${site.surfaceElevation}m`,
            worldPos: new THREE.Vector3(wx, surfY + 0.55, wz),
            accent: site.isMysterySite ? 'purple' : 'amber',
            priority: 'high',
          });
        }

        const gridN = 28;
        const halfSpan = 2.0;
        let cumDepth = 0;

        for (const layer of preset.layers) {
          const topDepthFromRef = cumDepth;
          const botDepthFromRef = cumDepth + layer.thickness;
          cumDepth = botDepthFromRef;

          const boxGeo = new THREE.BoxGeometry(
            halfSpan * 2,
            layer.thickness * 0.05,
            halfSpan * 2,
            gridN,
            1,
            gridN
          );
          const pos = boxGeo.attributes.position;
          for (let i = 0; i < pos.count; i++) {
            const vx = pos.getX(i);
            const vy = pos.getY(i);
            const vz = pos.getZ(i);
            const mx = (vx / 2.2) * 100;
            const mz = (vz / 2.2) * 100;

            const surfElev =
              preset.id === 'horizontal-slope-trap'
                ? 40 - (mx / 60) * 10
                : preset.id === 'three-point-dip'
                ? 42.5 - (mz / 40) * 2.5
                : 45;

            const shift = getStrataShiftAt(preset, mx, mz);
            const isTopVert = vy > 0;
            const rawElev = 50 + shift - (isTopVert ? topDepthFromRef : botDepthFromRef);
            const clampedElev = THREE.MathUtils.clamp(rawElev, 0, surfElev);
            pos.setY(i, elevToY(clampedElev));
          }
          boxGeo.computeVertexNormals();

          const mat = new THREE.MeshStandardMaterial({
            map: rockTextures[layer.rockType],
            roughness: 0.6,
            metalness: 0.05,
            transparent: true,
            opacity: 0.84,
            side: THREE.DoubleSide,
            clippingPlanes: [clipPlane],
          });
          layerMaterials.push(mat);

          const layerMesh = new THREE.Mesh(boxGeo, mat);
          blockGroup.add(layerMesh);
        }

        // If preset has a fault offset, render a clear 3D fault plane sheet & label
        if (preset.faultOffsetEast !== 0) {
          const faultX = coordToWorld(15);
          const faultPlaneMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(4.05, 2.35),
            new THREE.MeshBasicMaterial({
              color: 0xe11d48,
              transparent: true,
              opacity: 0.22,
              side: THREE.DoubleSide,
              depthWrite: false,
            })
          );
          faultPlaneMesh.rotation.y = Math.PI / 2;
          faultPlaneMesh.position.set(faultX, -0.2, 0);
          blockGroup.add(faultPlaneMesh);

          newAnchors.push({
            id: 'fault-line-label',
            text: '⚡ 断層（8mのズレ）',
            worldPos: new THREE.Vector3(faultX, elevToY(45) + 0.25, 0),
            accent: 'rose',
            priority: 'high',
          });
        }

        const slicePlaneIndicator = new THREE.Mesh(
          new THREE.PlaneGeometry(4.1, 2.7),
          new THREE.MeshBasicMaterial({
            color: 0x0284c7,
            transparent: true,
            opacity: 0.14,
            side: THREE.DoubleSide,
            depthWrite: false,
          })
        );
        slicePlaneIndicator.position.set(0, -0.1, 0);
        moduleRoot.add(slicePlaneIndicator);

        newAnchors.push(
          {
            id: 'compass-W',
            text: '西',
            worldPos: new THREE.Vector3(-2.35, -1.3, 0),
            accent: 'neutral',
          },
          {
            id: 'compass-E',
            text: '東',
            worldPos: new THREE.Vector3(2.35, -1.3, 0),
            accent: 'neutral',
          },
          {
            id: 'compass-N',
            text: '北',
            worldPos: new THREE.Vector3(0, -1.3, -2.35),
            accent: 'neutral',
          },
          {
            id: 'compass-S',
            text: '南',
            worldPos: new THREE.Vector3(0, -1.3, 2.35),
            accent: 'neutral',
          }
        );

        strataParts = {
          blockGroup,
          layerMaterials,
          clipPlane,
          slicePlaneIndicator,
        };
      }

      labelWorldAnchorsRef.current = newAnchors;
      setLabelDescriptors(
        newAnchors.map((a) => ({
          id: a.id,
          text: a.text,
          subtext: a.subtext,
          accent: a.accent,
          priority: a.priority,
          depthCue: a.depthCue,
          clickable: a.clickable,
          onClick: a.onClick,
        }))
      );
    }

    function applyDynamicParameters(sliderVal: number, secondaryVal: number, dt = 0.016) {
      const p = propsRef.current;

      if (p.moduleId === 'net') {
        netPivotMap.forEach(({ pivot, axis, maxAngle }) => {
          pivot.setRotationFromAxisAngle(axis, maxAngle * sliderVal);
        });
        moduleRoot.updateMatrixWorld(true);

        // Update 3D Zipper Arcs connecting meeting vertices as they fold!
        for (const arcItem of netArcLines) {
          const getA = netKnobWorldGetters.get(arcItem.fromLabel);
          const getB = netKnobWorldGetters.get(arcItem.toLabel);
          if (!getA || !getB) continue;
          const ptA = getA();
          const ptB = getB();
          const dist = ptA.distanceTo(ptB);
          const posAttr = arcItem.line.geometry.attributes.position;
          const arcHeight = Math.min(1.2, dist * 0.45);
          for (let i = 0; i <= 20; i++) {
            const u = i / 20;
            const x = THREE.MathUtils.lerp(ptA.x, ptB.x, u);
            const z = THREE.MathUtils.lerp(ptA.z, ptB.z, u);
            const y =
              THREE.MathUtils.lerp(ptA.y, ptB.y, u) +
              Math.sin(u * Math.PI) * arcHeight;
            posAttr.setXYZ(i, x, y, z);
          }
          posAttr.needsUpdate = true;
        }
      } else if (p.moduleId === 'cross-section' && crossSectionParts) {
        const sep = sliderVal * 1.35;
        crossSectionParts.topHalf.position
          .copy(crossSectionParts.planeNormal)
          .multiplyScalar(sep);
        crossSectionParts.bottomHalf.position.set(0, 0, 0);
      } else if (p.moduleId === 'topography' && topoParts) {
        const {
          terrainMesh,
          basePositions,
          elevations,
          contourGroup,
          sliceGroup,
          sliceLineMesh,
          guideGroup,
          streamLines,
          rainDroplets,
        } = topoParts;
        const posAttr = terrainMesh.geometry.attributes.position;
        for (let i = 0; i < posAttr.count; i++) {
          const h = ((elevations[i] - 100) / 450) * 2.2 * sliderVal;
          posAttr.setY(i, basePositions[i * 3 + 1] + h);
        }
        posAttr.needsUpdate = true;
        terrainMesh.geometry.computeVertexNormals();

        contourGroup.children.forEach((child) => {
          const elev = child.userData.elevation || 100;
          child.position.y = -0.99 + ((elev - 100) / 450) * 2.2 * sliderVal;
        });

        const size = 4.6;
        const wz = secondaryVal * (size / 2);
        sliceGroup.position.z = wz;

        const linePos = sliceLineMesh.geometry.attributes.position;
        const segs = linePos.count - 1;
        for (let i = 0; i <= segs; i++) {
          const nx = -1 + (i / segs) * 2;
          const wx = nx * (size / 2);
          const elev = evaluateTerrainElevation(p.topoPreset.id, nx, secondaryVal);
          const wy = -0.98 + ((elev - 100) / 450) * 2.2 * sliderVal;
          linePos.setXYZ(i, wx, wy, wz);
        }
        linePos.needsUpdate = true;

        guideGroup.visible = p.showGuides;
        guideGroup.children.forEach((pin) => {
          const { baseElev } = pin.userData;
          const wy = -1.0 + ((baseElev - 100) / 450) * 2.2 * sliderVal;
          pin.position.y = wy + 0.18;
        });
        labelWorldAnchorsRef.current.forEach((anc) => {
          if (anc.id.startsWith('topo-')) {
            const elevNum = parseFloat(anc.subtext || '200');
            anc.worldPos.y = -1.0 + ((elevNum - 100) / 450) * 2.2 * sliderVal + 0.42;
          }
        });

        // Update Valley River Streams & Animated Droplets
        streamLines.forEach(({ line, ptsNorm }) => {
          const sPos = line.geometry.attributes.position;
          ptsNorm.forEach(([nx, nz], idx) => {
            const elev = evaluateTerrainElevation(p.topoPreset.id, nx, nz);
            const wy = -0.96 + ((elev - 100) / 450) * 2.2 * sliderVal;
            sPos.setXYZ(idx, nx * (size / 2), wy, nz * (size / 2));
          });
          sPos.needsUpdate = true;
        });

        rainDroplets.forEach((drop) => {
          drop.t = (drop.t + drop.speed * dt) % 1.0;
          const stream = streamLines[drop.streamIdx];
          if (!stream) return;
          const pts = stream.ptsNorm;
          const scaledIdx = drop.t * (pts.length - 1);
          const i0 = Math.floor(scaledIdx);
          const i1 = Math.min(pts.length - 1, i0 + 1);
          const frac = scaledIdx - i0;
          const nx = THREE.MathUtils.lerp(pts[i0][0], pts[i1][0], frac);
          const nz = THREE.MathUtils.lerp(pts[i0][1], pts[i1][1], frac);
          const elev = evaluateTerrainElevation(p.topoPreset.id, nx, nz);
          const wy = -0.92 + ((elev - 100) / 450) * 2.2 * sliderVal;
          drop.mesh.position.set(nx * (size / 2), wy, nz * (size / 2));
        });
      } else if (p.moduleId === 'strata' && strataParts) {
        // True 3D Cross-Section Slicing + Gentle Transparency
        const sliceZ = THREE.MathUtils.lerp(2.05, -1.4, sliderVal);
        strataParts.clipPlane.constant = sliceZ;
        const opacity = THREE.MathUtils.lerp(0.92, 0.25, Math.max(0, (sliderVal - 0.5) * 2));
        strataParts.layerMaterials.forEach((mat) => {
          mat.opacity = opacity;
          mat.depthWrite = opacity > 0.5;
        });
        strataParts.slicePlaneIndicator.position.z = sliceZ;
        strataParts.slicePlaneIndicator.visible = p.showGuides && sliderVal > 0.03 && sliderVal < 0.96;
      }
    }

    function setCameraGoal(preset: CameraPreset) {
      cameraTransitionActive = true;
      if (preset === 'iso') {
        desiredCamPos.set(5.4, 4.5, 6.2);
      } else if (preset === 'top') {
        desiredCamPos.set(0.0, 8.4, 0.01);
      } else if (preset === 'front') {
        desiredCamPos.set(0.0, 0.6, 7.6);
      } else if (preset === 'side') {
        desiredCamPos.set(7.6, 0.6, 0.0);
      }
      desiredCamLook.set(0, -0.1, 0);
    }

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downX = 0;
    let downY = 0;

    const handlePointerDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return;
      if (clickableMeshes.length === 0) return;

      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(clickableMeshes, false);
      if (hits.length > 0) {
        const hitObj = hits[0].object;
        if (hitObj.userData.cubePointId) {
          propsRef.current.onToggleCubePoint(hitObj.userData.cubePointId);
        } else if (hitObj.userData.vertexLabel) {
          propsRef.current.onSelectVertexLabel(hitObj.userData.vertexLabel);
        }
      }
    };

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);

    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let lastTime = performance.now();

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
      gl.flush();
      if (!sync) {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const poll = () => {
        const state = gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function requestRender() {
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame((now) => {
        renderDirty = false;
        const dt = Math.min((now - lastTime) / 1000, 0.1);
        lastTime = now;

        let needsMoreFrames =
          propsRef.current.moduleId === 'topography' && propsRef.current.rainActive;

        if (
          Math.abs(currentSlider - targetSlider) > 0.001 ||
          Math.abs(currentSecondary - targetSecondary) > 0.001 ||
          needsMoreFrames
        ) {
          currentSlider = isSoftwareGl
            ? targetSlider
            : THREE.MathUtils.damp(currentSlider, targetSlider, 10, dt);
          currentSecondary = isSoftwareGl
            ? targetSecondary
            : THREE.MathUtils.damp(currentSecondary, targetSecondary, 10, dt);
          applyDynamicParameters(currentSlider, currentSecondary, dt);
          if (
            Math.abs(currentSlider - targetSlider) > 0.002 ||
            Math.abs(currentSecondary - targetSecondary) > 0.002
          ) {
            needsMoreFrames = true;
          }
        }

        if (cameraTransitionActive) {
          if (isSoftwareGl) {
            camera.position.copy(desiredCamPos);
            controls.target.copy(desiredCamLook);
            cameraTransitionActive = false;
          } else {
            camera.position.lerp(desiredCamPos, 1 - Math.exp(-8 * dt));
            controls.target.lerp(desiredCamLook, 1 - Math.exp(-8 * dt));
            if (camera.position.distanceTo(desiredCamPos) < 0.03) {
              cameraTransitionActive = false;
            } else {
              needsMoreFrames = true;
            }
          }
        }

        controls.update();
        renderer.render(scene, camera);
        updateProjectedLabelsDOM();

        const done = () => {
          renderBusy = false;
          if (renderDirty || needsMoreFrames) {
            requestRender();
          }
        };
        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    }

    controls.addEventListener('change', () => {
      requestRender();
    });

    const handleResize = () => {
      if (!mount) return;
      const w = mount.clientWidth || 800;
      const h = mount.clientHeight || 600;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    };
    window.addEventListener('resize', handleResize);
    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => handleResize())
        : null;
    resizeObserver?.observe(mount);

    buildModuleScene();
    applyDynamicParameters(currentSlider, currentSecondary, 0.016);
    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }
    requestRender();

    sceneControlRef.current = {
      rebuildModuleScene: () => {
        buildModuleScene();
        const p = propsRef.current;
        targetSlider =
          p.moduleId === 'net'
            ? p.foldProgress
            : p.moduleId === 'cross-section'
            ? p.splitOffset
            : p.moduleId === 'topography'
            ? p.elevationScale
            : p.strataSliceProgress;
        currentSlider = targetSlider;
        targetSecondary = p.sliceZNorm;
        currentSecondary = targetSecondary;
        applyDynamicParameters(currentSlider, currentSecondary, 0.016);
        requestRender();
      },
      updateDynamicParams: () => {
        const p = propsRef.current;
        targetSlider =
          p.moduleId === 'net'
            ? p.foldProgress
            : p.moduleId === 'cross-section'
            ? p.splitOffset
            : p.moduleId === 'topography'
            ? p.elevationScale
            : p.strataSliceProgress;
        targetSecondary = p.sliceZNorm;
        requestRender();
      },
      setCameraGoal: (preset: CameraPreset) => {
        setCameraGoal(preset);
        requestRender();
      },
      requestRender,
    };

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      clearModuleRoot();
      pedestalGroup.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const m = obj as THREE.Mesh;
          m.geometry?.dispose();
          if (Array.isArray(m.material)) {
            m.material.forEach((mat) => mat.dispose());
          } else if (m.material) {
            m.material.dispose();
          }
        }
      });
      contactShadowTex.dispose();
      Object.values(rockTextures).forEach((t) => t.dispose());
      controls.dispose();
      renderer.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  useEffect(() => {
    sceneControlRef.current?.rebuildModuleScene();
  }, [
    props.moduleId,
    props.netPreset.id,
    props.highlightedVertexLabel,
    props.showZipperGuide,
    props.selectedPointIds[0],
    props.selectedPointIds[1],
    props.selectedPointIds[2],
    props.constructionStep,
    props.showExtensionHorns,
    props.topoPreset.id,
    props.rainActive,
    props.strataPreset.id,
    props.drillDRevealed,
    props.showGuides,
  ]);

  useEffect(() => {
    sceneControlRef.current?.updateDynamicParams();
  }, [
    props.foldProgress,
    props.splitOffset,
    props.elevationScale,
    props.sliceZNorm,
    props.strataSliceProgress,
    props.showLabels,
  ]);

  useEffect(() => {
    sceneControlRef.current?.setCameraGoal(props.cameraPreset);
  }, [props.cameraPreset, props.cameraTriggerSeq]);

  const isNetAssembled = props.moduleId === 'net' && props.foldProgress >= 0.96;

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#EEF2F6] select-none">
      {/* Isolated WebGL Canvas Mount */}
      <div ref={canvasMountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Completion / Invalid Net Feedback Banner in Top-Right of 3D Stage */}
      {isNetAssembled && (
        <div className="absolute top-4 right-4 z-20 pointer-events-none">
          {props.netPreset.isInvalidNet ? (
            <div className="bg-rose-600 text-white border-2 border-white px-4 py-2.5 rounded-2xl shadow-lg text-xs font-extrabold max-w-xs">
              ⚠️ 面②と面③が重なり、箱になりません！
            </div>
          ) : (
            <div className="bg-emerald-600 text-white border-2 border-white px-4 py-2.5 rounded-2xl shadow-lg text-xs font-extrabold">
              ✨ パチッ！立体が完成しました！
            </div>
          )}
        </div>
      )}

      {/* Projected 3D Badges Layer with Depth Attenuation */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
        {labelDescriptors.map((lbl) => {
          const isHigh = lbl.priority === 'high';
          const colorClasses =
            lbl.accent === 'amber'
              ? 'bg-amber-500 text-white border-white font-extrabold shadow-md'
              : lbl.accent === 'rose'
              ? 'bg-rose-500 text-white border-white font-extrabold shadow-md'
              : lbl.accent === 'purple'
              ? 'bg-purple-600 text-white border-white font-extrabold shadow-md'
              : lbl.accent === 'emerald'
              ? 'bg-emerald-600 text-white border-white font-bold shadow-sm'
              : lbl.accent === 'sky'
              ? 'bg-sky-600 text-white border-white font-bold shadow-sm'
              : 'bg-white/95 text-slate-800 border-slate-300 font-bold shadow-xs';

          return (
            <div
              key={lbl.id}
              ref={(el) => {
                if (el) labelNodesRef.current.set(lbl.id, el);
                else labelNodesRef.current.delete(lbl.id);
              }}
              onClick={lbl.onClick}
              style={{ opacity: 0, transform: 'translate3d(-9999px, -9999px, 0)' }}
              className={`absolute top-0 left-0 px-2.5 py-0.5 rounded-lg border-2 text-xs font-mono tabular-nums whitespace-nowrap transition-opacity duration-75 ${colorClasses} ${
                isHigh ? 'z-20' : 'z-10'
              } ${
                lbl.clickable ? 'cursor-pointer hover:scale-125 active:scale-95' : ''
              }`}
            >
              <span>{lbl.text}</span>
              {lbl.subtext && (
                <span className="ml-1 opacity-90 text-[10px] font-sans">
                  {lbl.subtext}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
