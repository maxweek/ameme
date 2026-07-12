import { useEffect, useMemo, useRef, useCallback, type FC, memo } from 'react';
import { observer } from 'mobx-react-lite';
import { useFrame, useThree } from '@react-three/fiber';
import R3fForceGraph from 'r3f-forcegraph';
import * as THREE from 'three';
import SpriteText from 'three-spritetext';
import { Text } from 'troika-three-text';

import { useGraphData } from '../../hooks/useGraphData';
import { getNodeColor, EDGE_COLOR, EDGE_ACTIVATED_COLOR } from './utils';
import { MemoryStore } from '../../store/store';
import {
  ACTIVATION_PULSE_SPEED, ACTIVATION_GLOW_MIN, ACTIVATION_GLOW_MAX,
  ACTIVATION_SCALE_MIN, ACTIVATION_SCALE_MAX, ACTIVATION_FADEOUT_SPEED,
  HOVER_SCALE, HOVER_LERP_SPEED, OPACITY_LERP_SPEED, DIM_OPACITY,
  NODE_SPHERE_RADIUS, NODE_SPHERE_SEGMENTS, GLOW_SPHERE_RADIUS,
  NODE_LABEL_HEIGHT, NODE_LABEL_OFFSET_Y, NODE_LABEL_PROXIMITY,
  LINK_LABEL_HEIGHT, LINK_LABEL_PROXIMITY, LINK_LABEL_MAX_OPACITY, LINK_LABEL_OFFSET_Y,
  LINK_ARROW_LENGTH, LINK_WIDTH_DEFAULT, LINK_WIDTH_HIGHLIGHTED, LINK_WIDTH_ACTIVATED,
  LINK_OPACITY, LINK_MULTI_OFFSET,
  GROUP_CLUSTER_STRENGTH, GROUP_RADIUS_MULTIPLIER,
  type DisplayMode,
} from './constants';
import type { GraphEdge, GraphNode } from '../../api/memory';

// ── Types ───────────────────────────────────────────

export interface Node extends GraphNode {
  id: string;
  name: string;
  type: string;
  summary: string;
  links?: Link[]
};

export interface Link extends GraphEdge {
  source: string | Node;
  target: string | Node;
  name: string;
  fact: string;
  _multiIndex?: number;
  _multiTotal?: number;
};

type GraphData = {
  nodes: Node[];
  links: Link[]
};
type NodeEntry = {
  sphere: THREE.Mesh;
  glowSphere: THREE.Mesh;
  group: THREE.Group
};
type LabelEntry = {
  label: SpriteText;
  object: THREE.Object3D,
  anchor: THREE.Object3D,
  scale: THREE.Vector3Like
};
type LinkLabelEntry = {
  object: Text;
  anchor: THREE.Object3D,
  link: Link
};

type Props = {
  displayMode?: DisplayMode;
  onNodeClick?: (node: Node) => void;
  onLinkClick?: (link: Link) => void;
};

// ── Component ───────────────────────────────────────

export const Graph: FC<Props> = memo(observer(({
  displayMode = 'simple',
  onNodeClick,
  onLinkClick,
}) => {
  const fgRef = useRef<any>(null);
  const rawData = useGraphData() as GraphData;
  const { camera, size, gl } = useThree();

  // ── Annotate parallel links ───────────────────────

  const myData = useMemo(() => {
    const pairCount = new Map<string, number>();
    const pairIndex = new Map<string, number>();

    for (const link of rawData.links) {
      const key = pairKey(link);
      pairCount.set(key, (pairCount.get(key) ?? 0) + 1);
    }

    return {
      nodes: rawData.nodes,
      links: rawData.links.map(link => {
        const key = pairKey(link);
        const total = pairCount.get(key) ?? 1;
        const index = pairIndex.get(key) ?? 0;
        pairIndex.set(key, index + 1);
        return { ...link, _multiIndex: index, _multiTotal: total };
      }),
    };
  }, [rawData]);

  // ── Refs ──────────────────────────────────────────

  const nodeEntries = useRef(new Map<string, NodeEntry>());
  const nodeLabels = useRef(new Map<string, LabelEntry>());
  const linkLabels = useRef(new Map<string, LinkLabelEntry>());
  const prevNodeIds = useRef(new Set<string>());
  const activationPhase = useRef(new Map<string, number>());

  // Hover state (refs, not state — no re-render needed)
  const hoveredNodeId = useRef<string | null>(null);
  const highlightedNodes = useRef(new Set<string>());
  const highlightedLinks = useRef(new Set<string>());
  const hoverDirty = useRef(false);

  // Raycaster
  const raycaster = useRef(new THREE.Raycaster());
  const mouseNDC = useRef(new THREE.Vector2(-9999, -9999));
  const mouseScreen = useRef(new THREE.Vector2(-9999, -9999));
  const worldPos = useRef(new THREE.Vector3());
  const tempScale = useRef(new THREE.Vector3());

  const linkMeshRefs = useRef(new Map<THREE.Object3D, string>()); // mesh → linkKey
  const hoveredLinkKey = useRef<string | null>(null);


  // Shared geometries
  const sphereGeo = useMemo(
    () => new THREE.SphereGeometry(NODE_SPHERE_RADIUS, NODE_SPHERE_SEGMENTS, NODE_SPHERE_SEGMENTS), []
  );
  const glowGeo = useMemo(
    () => new THREE.SphereGeometry(GLOW_SPHERE_RADIUS, NODE_SPHERE_SEGMENTS, NODE_SPHERE_SEGMENTS), []
  );

  const debugDone = useRef(false);

  // ── Mouse tracking ────────────────────────────────

  useEffect(() => {
    const canvas = gl.domElement;
    const onMove = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      mouseScreen.current.set(e.clientX - r.left, e.clientY - r.top);
      mouseNDC.current.set(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        -((e.clientY - r.top) / r.height) * 2 + 1,
      );
    };

    const onLeave = () => {
      mouseScreen.current.set(-9999, -9999);
      mouseNDC.current.set(-9999, -9999);

      canvas.style.cursor = 'default';
    };
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', onLeave);
    return () => {
      canvas.removeEventListener('mousemove', onMove);

      canvas.removeEventListener('mouseleave', onLeave);
    }
  }, [gl]);


  useEffect(() => {
    const canvas = gl.domElement;

    const onClick = () => {
      // Node click
      if (hoveredNodeId.current) {
        const node = myData.nodes.find(n => n.id === hoveredNodeId.current);
        node.links = [];
        myData.links.forEach((link) => {
          if(link.sourceUuid === node.uuid){
            node.links.push(link)
          }
        })
        if (node) onNodeClick?.(node);
        return;
      }

      // Link click
      if (hoveredLinkKey.current) {
        const link = myData.links.find(l => getLinkKey(l) === hoveredLinkKey.current);
        if (link) onLinkClick?.(link);
        return;
      }
    };

    canvas.addEventListener('click', onClick);
    return () => canvas.removeEventListener('click', onClick);
  }, [gl, myData, onNodeClick, onLinkClick]);

  // ── Cleanup stale entries on data change ──────────

  useEffect(() => {
    const ids = new Set(myData.nodes.map(n => n.id));
    const lkeys = new Set(myData.links.map(l => getLinkKey(l)));

    for (const [id] of nodeEntries.current) {
      if (!ids.has(id)) nodeEntries.current.delete(id);
    }
    for (const [id] of nodeLabels.current) {
      if (!ids.has(id)) nodeLabels.current.delete(id);
    }
    for (const [key] of linkLabels.current) {
      if (!lkeys.has(key)) linkLabels.current.delete(key);
    }

    for (const [mesh, key] of linkMeshRefs.current) {
      if (!lkeys.has(key)) linkMeshRefs.current.delete(mesh);
    }

    // New nodes → spawn animation
    for (const node of myData.nodes) {
      if (!prevNodeIds.current.has(node.id)) {
        activationPhase.current.set(node.id, 0);
      }
    }
    prevNodeIds.current = ids;
  }, [myData]);

  // ── Display mode forces ───────────────────────────

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;

    fg.d3Force('cluster', null);
    fg.d3Force('typeGroup', null);

    if (displayMode === 'clusters') {
      fg.d3Force('cluster', (alpha: number) => {
        const centroids = computeCentroids(myData.nodes as any[]);
        (myData.nodes as any[]).forEach((node: any) => {
          const c = centroids.get(node.type);
          if (!c) return;
          node.vx += (c.x - (node.x ?? 0)) * alpha * GROUP_CLUSTER_STRENGTH;
          node.vy += (c.y - (node.y ?? 0)) * alpha * GROUP_CLUSTER_STRENGTH;
          node.vz += (c.z - (node.z ?? 0)) * alpha * GROUP_CLUSTER_STRENGTH;
        });
      });
    } else if (displayMode === 'groups') {
      const types = [...new Set(myData.nodes.map(n => n.type))];
      const anchors = new Map<string, { x: number; z: number }>();
      types.forEach((t, i) => {
        const angle = (i / types.length) * Math.PI * 2;
        const r = types.length * GROUP_RADIUS_MULTIPLIER;
        anchors.set(t, { x: Math.cos(angle) * r, z: Math.sin(angle) * r });
      });

      fg.d3Force('typeGroup', (alpha: number) => {
        (myData.nodes as any[]).forEach((node: any) => {
          const a = anchors.get(node.type);
          if (!a) return;
          node.vx += (a.x - (node.x ?? 0)) * alpha * 0.3;
          node.vz += (a.z - (node.z ?? 0)) * alpha * 0.3;
        });
      });
    }

    fg.d3ReheatSimulation?.();
  }, [displayMode, myData]);

  // ── Hover helpers ─────────────────────────────────

  const setHoveredNode = useCallback((nodeId: string | null) => {
    if (hoveredNodeId.current === nodeId) return;

    hoveredNodeId.current = nodeId;
    highlightedNodes.current.clear();
    highlightedLinks.current.clear();

    if (nodeId) {
      // BFS: find connected tree
      const visited = new Set<string>();
      const queue = [nodeId];
      while (queue.length) {
        const id = queue.shift()!;
        if (visited.has(id)) continue;
        visited.add(id);
        highlightedNodes.current.add(id);
        for (const link of myData.links) {
          const src = getSourceId(link);
          const tgt = getTargetId(link);
          if (src === id || tgt === id) {
            highlightedLinks.current.add(getLinkKey(link));
            if (src === id && !visited.has(tgt)) queue.push(tgt);
            if (tgt === id && !visited.has(src)) queue.push(src);
          }
        }
      }
    }

    hoverDirty.current = true;
    gl.domElement.style.cursor = nodeId ? 'pointer' : 'default';
  }, [myData, gl]);

  const setHoveredLink = useCallback((linkKey: string | null) => {
    if (hoveredLinkKey.current === linkKey) return;

    hoveredLinkKey.current = linkKey;
    highlightedNodes.current.clear();
    highlightedLinks.current.clear();

    if (linkKey) {
      const link = myData.links.find(l => getLinkKey(l) === linkKey);
      if (link) {
        const src = getSourceId(link);
        const tgt = getTargetId(link);
        highlightedNodes.current.add(src);
        highlightedNodes.current.add(tgt);
        highlightedLinks.current.add(linkKey);
      }
    }

    gl.domElement.style.cursor = linkKey ? 'pointer' : 'default';
  }, [myData, gl]);


  // ── Link color/width functions ────────────────────
  // Stored as refs so we can re-set them on fgRef to force refresh


  // ── Animation loop ────────────────────────────────


  const down = new THREE.Vector3();
  const sourcePos = useRef(new THREE.Vector3());
  const targetPos = useRef(new THREE.Vector3());
  const cameraUp = useRef(new THREE.Vector3());

  const zAxis = useRef(new THREE.Vector3());
  const yAxis = useRef(new THREE.Vector3());
  const xAxis = useRef(new THREE.Vector3());
  const linkMid = useRef(new THREE.Vector3());
  const linkQuat = useRef(new THREE.Quaternion());
  const linkMatrix = useRef(new THREE.Matrix4());
  const linkMeshes = useRef(new Map<THREE.Object3D, string>()); // mesh → linkKey


  useFrame((_, delta) => {
    const fg = fgRef.current;
    if (!fg) return;
    fg.tickFrame();

    const pos = worldPos.current;


    down
      .set(0, -1, 0)
      .applyQuaternion(camera.quaternion)
      .multiplyScalar(NODE_LABEL_OFFSET_Y);

    // ── 1. Raycaster hover ──────────────────────────

    raycaster.current.setFromCamera(mouseNDC.current, camera);

    // 1a. Nodes
    const spheres: THREE.Object3D[] = [];
    const sphereToId = new Map<THREE.Object3D, string>();
    nodeEntries.current.forEach(({ sphere }, id) => {
      if (sphere.parent) {
        spheres.push(sphere);
        sphereToId.set(sphere, id);
      }
    });

    const nodeHits = raycaster.current.intersectObjects(spheres, false);
    const hitNodeId = nodeHits.length > 0 ? (sphereToId.get(nodeHits[0].object) ?? null) : null;

    if (hitNodeId) {
      // Node hover — приоритет над link
      if (hoveredLinkKey.current) setHoveredLink(null);
      setHoveredNode(hitNodeId);
    } else {
      // 1b. Links (только если не на ноде)
      const linkObjs = Array.from(linkMeshRefs.current.keys()).filter(m => m.parent);
      const linkHits = raycaster.current.intersectObjects(linkObjs, false);
      const hitKey = linkHits.length > 0 ? (linkMeshRefs.current.get(linkHits[0].object) ?? null) : null;

      if (hitKey) {
        if (hoveredNodeId.current) setHoveredNode(null);
        setHoveredLink(hitKey);
      } else {
        // Ничего не наведено
        if (hoveredNodeId.current) setHoveredNode(null);
        if (hoveredLinkKey.current) setHoveredLink(null);
      }
    }

    // ── 2. Force link visual refresh on hover ───────


    // ── 3. Node labels (proximity to mouse) ─────────

    nodeLabels.current.forEach(({ label, object, anchor, scale }) => {
      if (!object.parent) return;
      object.getWorldPosition(pos);
      pos.project(camera);
      const sx = (pos.x * 0.5 + 0.5) * size.width;
      const sy = (-pos.y * 0.5 + 0.5) * size.height;
      const dist = Math.hypot(mouseScreen.current.x - sx, mouseScreen.current.y - sy);
      const opacity = THREE.MathUtils.smoothstep(NODE_LABEL_PROXIMITY, 0, dist);
      const distanceToCamera = camera.position.distanceTo(object.getWorldPosition(pos));
      const distanceFade = THREE.MathUtils.smoothstep(400, 100, distanceToCamera);
      const finalOpacity = opacity * distanceFade;

      label.visible = finalOpacity > 0.01;
      label.material.opacity = finalOpacity;

      // коэффициент подбираешь экспериментально
      const coef = THREE.MathUtils.clamp(distanceToCamera * 0.001, 0.3, 1);

      down.set(0, -NODE_LABEL_OFFSET_Y * coef, 0)
        .applyQuaternion(camera.quaternion);

      anchor.position.copy(down);
      anchor.quaternion.copy(camera.quaternion);
      // console.log(scale, distanceToCamera)

      label.scale.setX(scale.x * (distanceToCamera * 0.002));
      label.scale.setY(scale.y * (distanceToCamera * 0.002));
    });


    // ── 5. Node animations ──────────────────────────

    const hasHighlight = highlightedNodes.current.size > 0;

    nodeEntries.current.forEach(({ sphere, glowSphere }, id) => {
      const isHovered = hoveredNodeId.current === id;
      const inTree = highlightedNodes.current.has(id);
      const isActivated = MemoryStore.isNodeActivated(id);

      // Opacity
      const targetOpacity = !hasHighlight ? 1 : inTree ? 1 : DIM_OPACITY;
      const mat = sphere.material as THREE.MeshBasicMaterial;
      mat.opacity = THREE.MathUtils.lerp(mat.opacity, targetOpacity, delta * OPACITY_LERP_SPEED);
      mat.transparent = true;

      // Scale (hover bounce + spawn)
      const baseScale = isHovered ? HOVER_SCALE : 1;
      tempScale.current.setScalar(baseScale);
      sphere.scale.lerp(tempScale.current, delta * HOVER_LERP_SPEED);

      // Activation glow
      const glowMat = glowSphere.material as THREE.MeshBasicMaterial;
      if (isActivated) {
        let phase = activationPhase.current.get(id) ?? 0;
        phase += delta * ACTIVATION_PULSE_SPEED;
        activationPhase.current.set(id, phase);
        const pulse = (Math.sin(phase * Math.PI * 2) + 1) * 0.5;
        glowSphere.visible = true;
        glowMat.opacity = ACTIVATION_GLOW_MIN + pulse * (ACTIVATION_GLOW_MAX - ACTIVATION_GLOW_MIN);
        glowSphere.scale.setScalar(ACTIVATION_SCALE_MIN + pulse * (ACTIVATION_SCALE_MAX - ACTIVATION_SCALE_MIN));
      } else if (glowSphere.visible) {
        glowMat.opacity = THREE.MathUtils.lerp(glowMat.opacity, 0, delta * ACTIVATION_FADEOUT_SPEED);
        if (glowMat.opacity < 0.01) {
          glowSphere.visible = false;
          activationPhase.current.delete(id);
        }
      }
    });

    // ── 6. Link colors + arrows ─────────────────────────

    // 6a. Link lines — через parent наших labels
    linkLabels.current.forEach(({ object, anchor, link }, key) => {
      const source = link.source as any;
      const target = link.target as any;

      // console.log(link, source, object)
      // debugger

      if (!source?.x || !target?.x) return;

      const a = sourcePos.current.set(source.x, source.y, source.z);
      const b = targetPos.current.set(target.x, target.y, target.z);

      // центр линии
      linkMid.current.addVectors(a, b).multiplyScalar(0.5);

      // Offset для curved links
      const total = link._multiTotal ?? 1;
      const index = link._multiIndex ?? 0;
      if (total > 1) {
        const curvature = (index - (total - 1) / 2) * 0.3;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const len = Math.sqrt(dx * dx + dz * dz) || 1;

        // Перпендикуляр в горизонтальной плоскости
        const perpX = -dz / len;
        const perpZ = dx / len;

        // Bezier midpoint offset = curvature * distance * 0.5
        linkMid.current.x += perpX * curvature * len * 0.5;
        linkMid.current.z += perpZ * curvature * len * 0.5;
      }

      anchor.position.copy(linkMid.current);

      // ось линии
      xAxis.current.subVectors(b, a).normalize();

      // направление от текста к камере
      zAxis.current.subVectors(camera.position, linkMid.current).normalize();

      // вверх текста в плоскости связи
      yAxis.current.crossVectors(zAxis.current, xAxis.current).normalize();

      // Не даём тексту переворачиваться вверх ногами
      cameraUp.current.set(0, 1, 0).applyQuaternion(camera.quaternion);

      if (yAxis.current.dot(cameraUp.current) < 0) {
        xAxis.current.negate();
        yAxis.current.negate();
        zAxis.current.negate();
      }

      // пересобираем Z чтобы базис был ортогональный
      zAxis.current.crossVectors(xAxis.current, yAxis.current).normalize();
      linkMatrix.current.makeBasis(xAxis.current, yAxis.current, zAxis.current);
      linkQuat.current.setFromRotationMatrix(linkMatrix.current);

      anchor.quaternion.copy(linkQuat.current);
      const distanceToCamera = camera.position.distanceTo(anchor.getWorldPosition(pos));
      const coef = distanceToCamera * 0.005

      anchor.scale.setScalar(coef)


      if (!object.parent) return;
      object.getWorldPosition(pos);
      pos.project(camera);
      const x = (pos.x * 0.5 + 0.5) * size.width;
      const y = (-pos.y * 0.5 + 0.5) * size.height;
      const distance = Math.hypot(mouseScreen.current.x - x, mouseScreen.current.y - y);
      // let op = THREE.MathUtils.smoothstep(LINK_LABEL_PROXIMITY, 0, distance) * LINK_LABEL_MAX_OPACITY;
      let op = THREE.MathUtils.smoothstep(NODE_LABEL_PROXIMITY, 0, distance);
      const distanceFade = THREE.MathUtils.smoothstep(400, 100, distanceToCamera);
      const finalOpacity = op * distanceFade;

      op = finalOpacity


      if (distanceToCamera > 300) {
        op = 0;
      }

      const mat = (object as any).material;
      if (mat) {
        mat.opacity = op;
        mat.visible = op > 0.01;
      }


      const isActivated = MemoryStore.activatedEdgeKeys.has(key);
      const isHighlighted = highlightedLinks.current.has(key);
      const hasDim = highlightedNodes.current.size > 0;

      let color: string;
      let opacity: number;

      if (isActivated) {
        color = EDGE_ACTIVATED_COLOR; opacity = 1;
      } else if (isHighlighted) {
        color = '#ffffff'; opacity = 1;
      } else if (hasDim) {
        color = EDGE_COLOR; opacity = 0.08;
      } else {
        color = EDGE_COLOR; opacity = LINK_OPACITY;
      }

      const linkGroup = anchor.parent;
      if (!linkGroup) return;
      for (const child of linkGroup.children) {
        if (child === anchor) continue;

        const mesh = child as THREE.Mesh;
        if (!mesh.material) continue;


        linkMeshRefs.current.set(mesh, key);


        // Заменить LambertMaterial на BasicMaterial (один раз)
        if ((mesh.material as any).type === 'MeshLambertMaterial') {
          mesh.material = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity,
          });
        } else {
          const mat = mesh.material as THREE.MeshBasicMaterial;
          mat.color.set(color);
          mat.opacity = opacity;
          mat.transparent = true;
        }
      }
    });


    // 6b. Arrows — ConeGeometry, отдельные объекты
    const firstLabel = linkLabels.current.values().next().value;
    const container = firstLabel?.anchor?.parent?.parent;

    if (container) {
      for (const child of container.children as THREE.Object3D[]) {
        if (child.children.length > 0) continue;

        const mesh = child as THREE.Mesh;
        if (!mesh.geometry || mesh.geometry.type !== 'ConeGeometry') continue;

        // Заменить LambertMaterial на BasicMaterial (один раз)
        if ((mesh.material as any).type === 'MeshLambertMaterial') {
          mesh.material = new THREE.MeshBasicMaterial({
            color: EDGE_COLOR,
            transparent: true,
            opacity: LINK_OPACITY,
          });
        }

        const mat = mesh.material as THREE.MeshBasicMaterial;
        const linkData = (child as any).__data as Link | undefined;

        if (linkData) {
          const key = getLinkKey(linkData);
          linkMeshRefs.current.set(mesh, key);

          const isActivated = MemoryStore.activatedEdgeKeys.has(key);
          const isHighlighted = highlightedLinks.current.has(key);
          const hasDim = highlightedNodes.current.size > 0;

          if (isActivated) {
            mat.color.set(EDGE_ACTIVATED_COLOR); mat.opacity = 1;
          } else if (isHighlighted) {
            mat.color.set('#ffffff'); mat.opacity = 1;
          } else if (hasDim) {
            mat.color.set(EDGE_COLOR); mat.opacity = 0.08;
          } else {
            mat.color.set(EDGE_COLOR); mat.opacity = LINK_OPACITY;
          }
        } else {
          if (highlightedNodes.current.size > 0) {
            mat.color.set(EDGE_COLOR); mat.opacity = 0.08;
          } else {
            mat.color.set(EDGE_COLOR); mat.opacity = LINK_OPACITY;
          }
        }

        mat.transparent = true;
      }
    }

  });

  // ── Render ────────────────────────────────────────

  return (
    <R3fForceGraph
      ref={fgRef}
      graphData={myData}
      nodeId="id"

      // Node click (hover handled by raycaster)
      // onNodeClick={(node: Node) => onNodeClick?.(node)}
      // onLinkClick={(link: Link) => onLinkClick?.(link)}

      // ── Link appearance (initial + refreshed via fgRef setters) ──

      linkColor={'#888888'}
      linkWidth={LINK_WIDTH_DEFAULT}
      linkOpacity={LINK_OPACITY}
      linkDirectionalArrowLength={LINK_ARROW_LENGTH}
      linkDirectionalArrowRelPos={1}
      linkDirectionalArrowColor={'#888888'}


      // ── Parallel link curvature ───────────────────
      linkCurvature={(link: Link) => {
        const total = link._multiTotal ?? 1;
        if (total <= 1) return 0;
        const index = link._multiIndex ?? 0;
        return (index - (total - 1) / 2) * 0.3;
      }}
      linkCurveRotation={0}

      // ── Link labels ───────────────────────────────
      linkThreeObjectExtend={true}
      linkThreeObject={(link: Link) => {
        const text = new Text();

        text.text = link.name;
        text.fontSize = LINK_LABEL_HEIGHT / 1.5;
        text.color = '#ffffff';
        text.anchorX = 'center';
        text.anchorY = 'bottom';

        text.material.transparent = true;

        text.sync();
        text.position.y = 2;

        const anchor = new THREE.Group();

        anchor.add(text);


        linkLabels.current.set(getLinkKey(link), {
          object: text,
          anchor,
          link
        });
        return anchor;
      }}
      linkPositionUpdate={(obj: THREE.Object3D, coords: any, link: Link) => {
        const { start, end } = coords;
        if (!start || !end) return false;

        const total = link._multiTotal ?? 1;
        const index = link._multiIndex ?? 0;

        if (total <= 1) {
          // Straight link
          obj.position.set(
            (start.x + end.x) / 2,
            (start.y + end.y) / 2 + LINK_LABEL_OFFSET_Y,
            (start.z + end.z) / 2,
          );
        } else {
          // Curved link — quadratic bezier midpoint
          const curvature = (index - (total - 1) / 2) * 0.3;
          const dx = end.x - start.x;
          const dz = end.z - start.z;
          const len = Math.sqrt(dx * dx + dz * dz) || 1;

          // Control point
          const cpX = (start.x + end.x) / 2 + (-dz / len) * curvature * len;
          const cpY = (start.y + end.y) / 2;
          const cpZ = (start.z + end.z) / 2 + (dx / len) * curvature * len;

          // Bezier t=0.5
          obj.position.set(
            0.25 * start.x + 0.5 * cpX + 0.25 * end.x,
            0.25 * start.y + 0.5 * cpY + 0.25 * end.y + LINK_LABEL_OFFSET_Y,
            0.25 * start.z + 0.5 * cpZ + 0.25 * end.z,
          );
        }

        return true;
      }}

      // ── Node objects ──────────────────────────────
      nodeThreeObject={(node: Node) => {
        const group = new THREE.Group();
        const anchor = new THREE.Group();

        // Main sphere
        const sphere = new THREE.Mesh(
          sphereGeo,
          new THREE.MeshBasicMaterial({
            color: getNodeColor(node.type, false),
            transparent: true,
            opacity: 1,
          })
        );

        // Glow sphere (activation pulse)
        const glowSphere = new THREE.Mesh(
          glowGeo,
          new THREE.MeshBasicMaterial({
            color: getNodeColor(node.type, false),
            transparent: true,
            opacity: 0,
            side: THREE.BackSide,
          })
        );
        glowSphere.visible = false;

        // Name label
        const label = new SpriteText(node.name);
        label.textHeight = NODE_LABEL_HEIGHT;
        label.color = '#ffffff';
        label.material.transparent = true;
        // label.material.depthTest = false;
        label.material.depthWrite = false;
        // label.renderOrder = 10;
        // label.visible = false;


        anchor.add(label)

        group.add(sphere);
        group.add(glowSphere);
        group.add(anchor);


        nodeLabels.current.set(node.id, {
          label,
          object: group,
          anchor,
          scale: { ...label.scale }
        });
        nodeEntries.current.set(node.id, { sphere, glowSphere, group });

        // Spawn animation
        if (activationPhase.current.has(node.id)) {
          sphere.scale.setScalar(0.01);
        }

        return group;
      }}
    />
  );
}));

// ── Helpers ─────────────────────────────────────────

function getLinkKey(link: Link): string {
  return `${getSourceId(link)}→${getTargetId(link)}:${link.name}`;
}

function getSourceId(link: Link): string {
  return typeof link.source === 'object' ? link.source.id : link.source;
}

function getTargetId(link: Link): string {
  return typeof link.target === 'object' ? link.target.id : link.target;
}

function pairKey(link: Link): string {
  return [getSourceId(link), getTargetId(link)].sort().join('↔');
}

function computeCentroids(nodes: any[]): Map<string, { x: number; y: number; z: number }> {
  const sums = new Map<string, { x: number; y: number; z: number; count: number }>();
  for (const n of nodes) {
    if (!n.x && !n.y && !n.z) continue;
    const s = sums.get(n.type) ?? { x: 0, y: 0, z: 0, count: 0 };
    s.x += n.x ?? 0;
    s.y += n.y ?? 0;
    s.z += n.z ?? 0;
    s.count++;
    sums.set(n.type, s);
  }
  const result = new Map<string, { x: number; y: number; z: number }>();
  for (const [type, s] of sums) {
    result.set(type, { x: s.x / s.count, y: s.y / s.count, z: s.z / s.count });
  }
  return result;
}
