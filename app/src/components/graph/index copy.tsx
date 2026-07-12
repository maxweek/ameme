import { useEffect, useMemo, useRef, type FC } from 'react';
import { observer } from 'mobx-react-lite';
import { useFrame, useThree } from '@react-three/fiber';
import R3fForceGraph from 'r3f-forcegraph';
import * as THREE from 'three';
import SpriteText from 'three-spritetext';
import { Text } from 'troika-three-text';

import { useGraphData } from '../../hooks/useGraphData';
import { getNodeColor, ACTIVATED_COLOR, EDGE_COLOR, EDGE_ACTIVATED_COLOR } from './utils';

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

import { MemoryStore } from '../../store/store';

type GraphNode = Node & {
  x: number;
  y: number;
  z: number;
};


// ── Types ───────────────────────────────────────────

type Node = {
  id: string;
  name: string;
  type: string;
  summary: string;
  activated: boolean;
};

type Link = {
  source: string | Node;
  target: string | Node;
  name: string;
  fact: string;
  activated: boolean;
  _multiIndex?: number;  // index among parallel links
  _multiTotal?: number;  // total parallel links between same pair
};

type GraphData = {
  nodes: Node[];
  links: Link[];
};

type LabelEntry = {
  label: SpriteText;
  labelPivot: THREE.Object3D,
  object: THREE.Object3D,
  scale: {
    x: number; y: number; z: number
  }
};
type LinkLabelEntry = {
  label: Text;
  object: THREE.Object3D;
  pivot: THREE.Group;
  link: Link;
};

type NodeObjectEntry = { sphere: THREE.Mesh; glowSphere: THREE.Mesh; group: THREE.Object3D };

type Props = {
  displayMode?: DisplayMode;
  onNodeClick?: (node: Node) => void;
  onLinkClick?: (link: Link) => void;
};

// ── Component ───────────────────────────────────────

export const Graph: FC<Props> = observer(({
  displayMode = 'simple',
  onNodeClick,
  onLinkClick,
}) => {
  const fgRef = useRef<any>(null);
  const rawData = useGraphData() as GraphData;
  const { camera, size, gl } = useThree();
  const prevNodeIds = useRef(new Set<string>());

  const lastHoverTime = useRef(0);

  // Annotate parallel links with offset index
  const myData = useMemo(() => {
    const pairCount = new Map<string, number>();
    const pairIndex = new Map<string, number>();

    // Count links per node pair
    for (const link of rawData.links) {
      const key = pairKey(link);
      pairCount.set(key, (pairCount.get(key) ?? 0) + 1);
    }

    // Assign index to each link in a pair
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

  const labels = useRef(new Map<string, LabelEntry>());
  const linkLabels = useRef(new Map<string, LinkLabelEntry>());
  const nodeObjects = useRef(new Map<string, NodeObjectEntry>());

  const hoveredNode = useRef<Node | null>(null);
  const hoveredLink = useRef<Link | null>(null);
  const highlightedNodes = useRef(new Set<string>());
  const highlightedLinks = useRef(new Set<string>());

  const mouse = useRef(new THREE.Vector2(-9999, -9999));
  const worldPos = useRef(new THREE.Vector3());
  const tempScale = useRef(new THREE.Vector3());

  const linkMid = useRef(new THREE.Vector3());
  const linkDir = useRef(new THREE.Vector3());
  const cameraDir = useRef(new THREE.Vector3());
  const sourcePos = useRef(new THREE.Vector3());
  const targetPos = useRef(new THREE.Vector3());
  const cameraUp = useRef(new THREE.Vector3());

  const quat = useRef(new THREE.Quaternion());
  const mat = useRef(new THREE.Matrix4());
  const up = useRef(new THREE.Vector3());

  const zAxis = useRef(new THREE.Vector3());
  const yAxis = useRef(new THREE.Vector3());
  const xAxis = useRef(new THREE.Vector3());
  const linkQuat = useRef(new THREE.Quaternion());
  const linkMatrix = useRef(new THREE.Matrix4());

  const activationPhase = useRef(new Map<string, number>());

  const sphereGeometry = useMemo(
    () => new THREE.SphereGeometry(NODE_SPHERE_RADIUS, NODE_SPHERE_SEGMENTS, NODE_SPHERE_SEGMENTS),
    []
  );
  const glowGeometry = useMemo(
    () => new THREE.SphereGeometry(GLOW_SPHERE_RADIUS, NODE_SPHERE_SEGMENTS, NODE_SPHERE_SEGMENTS),
    []
  );

  // ── Mouse tracking ────────────────────────────────

  useEffect(() => {
    const canvas = gl.domElement;

    const onMove = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.current.set(event.clientX - rect.left, event.clientY - rect.top);
    };

    const onLeave = () => {
      mouse.current.set(-9999, -9999);
      clearHover();
      canvas.style.cursor = 'default';
    };

    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', onLeave);
    return () => {
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseleave', onLeave);
    };
  }, [gl]);

  // ── Detect new/removed nodes ──────────────────────

  useEffect(() => {
    const currentIds = new Set(myData.nodes.map(n => n.id));

    // Cleanup stale
    for (const [id] of labels.current) {
      if (!currentIds.has(id)) labels.current.delete(id);
    }
    for (const [id] of nodeObjects.current) {
      if (!currentIds.has(id)) nodeObjects.current.delete(id);
    }

    const currentLinkKeys = new Set(myData.links.map(l => getLinkKey(l)));
    for (const [key] of linkLabels.current) {
      if (!currentLinkKeys.has(key)) linkLabels.current.delete(key);
    }

    // Spawn animation for new nodes
    for (const node of myData.nodes) {
      if (!prevNodeIds.current.has(node.id)) {
        activationPhase.current.set(node.id, 0);
      }
    }

    prevNodeIds.current = currentIds;
  }, [myData]);

  const getNodePosition = (
    node: string | Node
  ): GraphNode | Node => {
    if (typeof node === 'string') {
      return myData.nodes.find(
        n => n.id === node
      ) as GraphNode;
    }

    return node;
  };

  // ── Display mode: forces ──────────────────────────

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;

    // Reset custom forces
    fg.d3Force('cluster', null);
    fg.d3Force('typeGroup', null);

    if (displayMode === 'clusters') {
      // Soft clustering: nodes of same type attracted to each other
      fg.d3Force('cluster', (alpha: number) => {
        const centroids = computeCentroids(myData.nodes as any[]);
        (myData.nodes as any[]).forEach((node: any) => {
          const centroid = centroids.get(node.type);
          if (!centroid) return;
          node.vx += (centroid.x - (node.x ?? 0)) * alpha * GROUP_CLUSTER_STRENGTH;
          node.vy += (centroid.y - (node.y ?? 0)) * alpha * GROUP_CLUSTER_STRENGTH;
          node.vz += (centroid.z - (node.z ?? 0)) * alpha * GROUP_CLUSTER_STRENGTH;
        });
      });
    } else if (displayMode === 'groups') {
      // Hard grouping: each type has a fixed anchor point
      const types = [...new Set(myData.nodes.map(n => n.type))];
      const anchors = new Map<string, { x: number; y: number; z: number }>();
      types.forEach((type, i) => {
        const angle = (i / types.length) * Math.PI * 2;
        const radius = types.length * GROUP_RADIUS_MULTIPLIER;
        anchors.set(type, {
          x: Math.cos(angle) * radius,
          y: 0,
          z: Math.sin(angle) * radius,
        });
      });

      fg.d3Force('typeGroup', (alpha: number) => {
        (myData.nodes as any[]).forEach((node: any) => {
          const anchor = anchors.get(node.type);
          if (!anchor) return;
          node.vx += (anchor.x - (node.x ?? 0)) * alpha * 0.3;
          node.vy += (anchor.y - (node.y ?? 0)) * alpha * 0.1;
          node.vz += (anchor.z - (node.z ?? 0)) * alpha * 0.3;
        });
      });
    }

    // Reheat simulation
    fg.d3ReheatSimulation?.();
  }, [displayMode, myData]);

  // ── Hover helpers ─────────────────────────────────

  function clearHover() {
    hoveredNode.current = null;
    hoveredLink.current = null;
    highlightedNodes.current.clear();
    highlightedLinks.current.clear();
  }

  function updateHighlightTree(node: Node | null) {
    highlightedNodes.current.clear();
    highlightedLinks.current.clear();
    if (!node) return;

    const visited = new Set<string>();
    const queue = [node.id];

    while (queue.length) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      highlightedNodes.current.add(id);

      myData.links.forEach((link) => {
        const source = typeof link.source === 'object' ? link.source.id : link.source;
        const target = typeof link.target === 'object' ? link.target.id : link.target;
        if (source === id || target === id) {
          highlightedLinks.current.add(getLinkKey(link));
        }
        if (source === id && !visited.has(target)) queue.push(target);
        if (target === id && !visited.has(source)) queue.push(source);
      });
    }
  }

  function updateHighlightLink(link: Link | null) {
    highlightedNodes.current.clear();
    highlightedLinks.current.clear();
    if (!link) return;

    const source = typeof link.source === 'object' ? link.source.id : link.source;
    const target = typeof link.target === 'object' ? link.target.id : link.target;
    highlightedNodes.current.add(source);
    highlightedNodes.current.add(target);
    highlightedLinks.current.add(getLinkKey(link));
  }

  // ── Animation loop ────────────────────────────────
  const down = new THREE.Vector3();

  useFrame((_, delta) => {
    fgRef.current?.tickFrame();
    const pos = worldPos.current;

    down
      .set(0, -1, 0)
      .applyQuaternion(camera.quaternion)
      .multiplyScalar(NODE_LABEL_OFFSET_Y);


    if (
      highlightedNodes.current.size > 0 &&
      performance.now() - lastHoverTime.current > 300 // было 100
    ) {
      // Check if mouse is far from last hovered node
      const hNode = hoveredNode.current;
      if (hNode) {
        const nodeObj = nodeObjects.current.get(hNode.id);
        if (nodeObj) {
          nodeObj.group.getWorldPosition(pos);
          pos.project(camera);
          const x = (pos.x * 0.5 + 0.5) * size.width;
          const y = (-pos.y * 0.5 + 0.5) * size.height;
          const dist = Math.hypot(mouse.current.x - x, mouse.current.y - y);
          if (dist > 120) {
            clearHover();
            gl.domElement.style.cursor = 'default';
          }
        }
      }
    }


    // ── Node labels ─────────────────────────────────
    labels.current.forEach(({ label, object, labelPivot, scale }) => {
      if (!object.parent) return;
      object.getWorldPosition(pos);
      pos.project(camera);

      const x = (pos.x * 0.5 + 0.5) * size.width;
      const y = (-pos.y * 0.5 + 0.5) * size.height;
      const distance = Math.hypot(mouse.current.x - x, mouse.current.y - y);
      const opacity = THREE.MathUtils.smoothstep(NODE_LABEL_PROXIMITY, 0, distance);
      label.visible = opacity > 0.01;
      label.material.opacity = opacity;

      const distanceToCamera = camera.position.distanceTo(object.getWorldPosition(pos));

      // коэффициент подбираешь экспериментально
      const coef = THREE.MathUtils.clamp(distanceToCamera * 0.001, 0.3, 1);

      down.set(0, -NODE_LABEL_OFFSET_Y * coef, 0)
        .applyQuaternion(camera.quaternion);

      labelPivot.position.copy(down);
      labelPivot.quaternion.copy(camera.quaternion);

      label.scale.setX(scale.x * (distanceToCamera * 0.002));
      label.scale.setY(scale.y * (distanceToCamera * 0.002));
      // label.position.y = NODE_LABEL_OFFSET_Y * (coef * .5);
      // label.offsetY = NODE_LABEL_OFFSET_Y + (1 / coef) * .5;
      // label.textHeight = NODE_LABEL_HEIGHT * ( coef * .5);
      // label.scale.y = opacity * 100
    });

    // ── Link labels ─────────────────────────────────
    linkLabels.current.forEach(({ object, pivot, link }) => {
      const source = link.source as any;
      const target = link.target as any;

      if (!source?.x || !target?.x) return;


      const a = sourcePos.current.set(
        source.x,
        source.y,
        source.z
      );

      const b = targetPos.current.set(
        target.x,
        target.y,
        target.z
      );


      // центр линии
      linkMid.current
        .addVectors(a, b)
        .multiplyScalar(0.5);


      pivot.position.copy(
        linkMid.current
      );


      // ось линии
      xAxis.current
        .subVectors(b, a)
        .normalize();


      // направление от текста к камере
      zAxis.current
        .subVectors(
          camera.position,
          linkMid.current
        )
        .normalize();


      // вверх текста в плоскости связи
      yAxis.current
        .crossVectors(
          zAxis.current,
          xAxis.current
        )
        .normalize();

      // Не даём тексту переворачиваться вверх ногами
      cameraUp.current
        .set(0, 1, 0)
        .applyQuaternion(camera.quaternion);


      if (
        yAxis.current.dot(cameraUp.current) < 0
      ) {
        xAxis.current.negate();
        yAxis.current.negate();
        zAxis.current.negate();
      }


      // пересобираем Z чтобы базис был ортогональный
      zAxis.current
        .crossVectors(
          xAxis.current,
          yAxis.current
        )
        .normalize();


      linkMatrix.current.makeBasis(
        xAxis.current,
        yAxis.current,
        zAxis.current
      );


      linkQuat.current.setFromRotationMatrix(
        linkMatrix.current
      );


      pivot.quaternion.copy(
        linkQuat.current
      );
      const distanceToCamera = camera.position.distanceTo(pivot.getWorldPosition(pos));
      const coef = distanceToCamera * 0.005


      pivot.scale.setScalar(coef)
      // object.material.opacity = opacity;

      if (!object.parent) return;
      object.getWorldPosition(pos);
      pos.project(camera);
      const x = (pos.x * 0.5 + 0.5) * size.width;
      const y = (-pos.y * 0.5 + 0.5) * size.height;
      const distance = Math.hypot(mouse.current.x - x, mouse.current.y - y);
      let opacity = THREE.MathUtils.smoothstep(LINK_LABEL_PROXIMITY, 0, distance) * LINK_LABEL_MAX_OPACITY;

      if (distanceToCamera > 300) {
        opacity = 0;
      }
      // troika Text uses material.opacity directly
      const mat = (object as any).material;
      if (mat) {
        mat.opacity = opacity;
        mat.visible = opacity > 0.01;
      }
    });


    // ── Node animations ─────────────────────────────
    nodeObjects.current.forEach(({ sphere, glowSphere }, id) => {
      const hovered = hoveredNode.current?.id === id;
      const inTree = highlightedNodes.current.has(id);
      const isActivated = MemoryStore.isNodeActivated(id);
      const hasHighlight = highlightedNodes.current.size > 0;

      // Opacity
      const targetOpacity = !hasHighlight ? 1 : inTree ? 1 : DIM_OPACITY;
      const mat = sphere.material as THREE.MeshBasicMaterial;
      mat.opacity = THREE.MathUtils.lerp(mat.opacity, targetOpacity, delta * OPACITY_LERP_SPEED);
      mat.transparent = true;

      // Scale
      const baseScale = hovered ? HOVER_SCALE : 1;
      tempScale.current.set(baseScale, baseScale, baseScale);
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
  });

  // ── Render ────────────────────────────────────────

  return (
    <R3fForceGraph
      ref={fgRef}
      graphData={myData}
      nodeId="id"

      onNodeHover={(node: Node | null) => {
        hoveredNode.current = node ?? null;
        hoveredLink.current = null;
        gl.domElement.style.cursor = node ? 'pointer' : 'default';
        updateHighlightTree(node);
        if (node) lastHoverTime.current = performance.now();
      }}

      onNodeClick={(node: Node) => onNodeClick?.(node)}

      onLinkHover={(link: Link | null) => {
        hoveredLink.current = link ?? null;
        if (!hoveredNode.current) {
          gl.domElement.style.cursor = link ? 'pointer' : 'default';
          updateHighlightLink(link);
          if (link) lastHoverTime.current = performance.now();
        }
      }}

      onLinkClick={(link: Link) => onLinkClick?.(link)}


      linkColor={(link: Link) => {
        const key = getLinkKey(link);
        const isActivated = MemoryStore.activatedEdgeKeys.has(key);
        if (isActivated) return EDGE_ACTIVATED_COLOR;
        if (highlightedLinks.current.has(key)) return '#ffffff';
        if (highlightedNodes.current.size > 0) return 'rgba(124, 124, 124, 0.2)';
        return EDGE_COLOR;
      }}

      linkWidth={(link: Link) => {
        const key = getLinkKey(link);
        const isActivated = MemoryStore.activatedEdgeKeys.has(key);
        if (isActivated) return LINK_WIDTH_ACTIVATED;
        if (highlightedLinks.current.has(key)) return LINK_WIDTH_HIGHLIGHTED;
        return LINK_WIDTH_DEFAULT;
      }}

      linkDirectionalArrowLength={LINK_ARROW_LENGTH}
      linkDirectionalArrowColor={(link: Link) => {
        const key = getLinkKey(link);
        const isActivated = MemoryStore.activatedEdgeKeys.has(key);
        if (isActivated) return EDGE_ACTIVATED_COLOR;
        if (highlightedLinks.current.has(key)) return '#ffffff';
        return EDGE_COLOR;
      }}
      linkDirectionalArrowRelPos={1}
      linkOpacity={LINK_OPACITY}

      linkCurvature={(link: Link) => {
        const total = link._multiTotal ?? 1;
        if (total <= 1) return 0;
        const index = link._multiIndex ?? 0;
        const centered = index - (total - 1) / 2;
        return centered * 0.3;
      }}
      linkCurveRotation={(link: Link) => {
        // const total = link._multiTotal ?? 1;
        // if (total <= 1) return 0;
        // return Math.PI * 0.5;
        return 0;
      }}

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

        const linkPivot = new THREE.Group();

        linkPivot.add(text);



        linkLabels.current.set(
          getLinkKey(link),
          {
            label: text,
            object: text,
            pivot: linkPivot,
            link,
          }
        );


        return linkPivot;
      }}

      linkPositionUpdate={(obj: THREE.Object3D, coords: any, link: Link) => {
        const { start, end } = coords;
        if (!start || !end) return false;

        const total = link._multiTotal ?? 1;
        const index = link._multiIndex ?? 0;

        // Midpoint
        let midX = (start.x + end.x) / 2;
        let midY = (start.y + end.y) / 2;
        let midZ = (start.z + end.z) / 2;

        // For curved links: offset midpoint perpendicular to link direction
        if (total > 1) {
          const centered = index - (total - 1) / 2;
          const dx = end.x - start.x;
          const dy = end.y - start.y;
          const dz = end.z - start.z;
          const len = Math.sqrt(dx * dx + dz * dz) || 1;

          // Perpendicular offset (matches linkCurvature direction)
          const curvature = centered * 0.3;
          const perpX = -dz / len;
          const perpZ = dx / len;

          midX += perpX * curvature * len * 0.5;
          midY += dy * 0.5;
          midZ += perpZ * curvature * len * 0.5;
        }

        obj.position.set(midX, midY + LINK_LABEL_OFFSET_Y, midZ);

        // Rotate along link direction
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const dz = end.z - start.z;
        obj.lookAt(obj.position.x + dx, obj.position.y + dy, obj.position.z + dz);

        return true;
      }}

      // linkPositionUpdate={(obj: THREE.Object3D, coords: any) => {

      // }}

      // linkPositionUpdate={(obj: THREE.Object3D, coords: any, link: Link) => {
      //   const { start, end } = coords;
      //   if (!start || !end) return false;

      //   const mid = {
      //     x: (start.x + end.x) / 2,
      //     y: (start.y + end.y) / 2,
      //     z: (start.z + end.z) / 2,
      //   };

      //   // Offset for parallel links
      //   const total = link._multiTotal ?? 1;
      //   const index = link._multiIndex ?? 0;
      //   let offsetX = 0, offsetZ = 0;
      //   if (total > 1) {
      //     const centered = index - (total - 1) / 2;
      //     const dx = end.x - start.x;
      //     const dz = end.z - start.z;
      //     const len = Math.sqrt(dx * dx + dz * dz) || 1;
      //     offsetX = (-dz / len) * centered * LINK_MULTI_OFFSET;
      //     offsetZ = (dx / len) * centered * LINK_MULTI_OFFSET;
      //   }

      //   obj.position.set(
      //     mid.x + offsetX,
      //     mid.y + LINK_LABEL_OFFSET_Y,
      //     mid.z + offsetZ,
      //   );

      //   // Rotate text along link direction
      //   const dx = end.x - start.x;
      //   const dy = end.y - start.y;
      //   const dz = end.z - start.z;
      //   obj.lookAt(
      //     obj.position.x + dx,
      //     obj.position.y + dy,
      //     obj.position.z + dz,
      //   );
      //   obj.rotateY(Math.PI * 0.5); // Adjust for text orientation


      //   return true;
      // }}


      nodeThreeObject={(node: Node) => {
        const group = new THREE.Group();
        const labelPivot = new THREE.Group();

        const sphere = new THREE.Mesh(
          sphereGeometry,
          new THREE.MeshBasicMaterial({
            color: getNodeColor(node.type, false),
            transparent: true,
          })
        );

        const glowSphere = new THREE.Mesh(
          glowGeometry,
          new THREE.MeshBasicMaterial({
            color: getNodeColor(node.type, false), // цвет типа, не белый
            transparent: true,
            opacity: 0,
            side: THREE.BackSide,
          })
        );
        glowSphere.visible = false;

        const label = new SpriteText(node.name);
        label.textHeight = NODE_LABEL_HEIGHT;
        label.color = '#ffffff';
        // label.offsetY = NODE_LABEL_HEIGHT / 2;
        label.material.transparent = true;
        // label.alig

        // label.material.depthTest = false;
        label.material.depthWrite = false;
        // label.renderOrder = 10;

        // labelPivot.add(label);
        // labelPivot.position.set(0, NODE_LABEL_OFFSET_Y, 0);

        // const test = new THREE.Mesh(
        //   new THREE.BoxGeometry(1, NODE_LABEL_OFFSET_Y / 2, 4),
        //   new THREE.MeshBasicMaterial({ color: 0xff0000 })
        // )

        // test.position.set(0, NODE_LABEL_OFFSET_Y / 2, 0);

        labelPivot.add(label)

        group.add(sphere);
        group.add(glowSphere);
        group.add(labelPivot);


        labels.current.set(node.id, {
          label, object: group, labelPivot, scale: {
            x: label.scale.x,
            y: label.scale.y,
            z: label.scale.z,
          }
        });
        nodeObjects.current.set(node.id, { sphere, glowSphere, group });

        if (activationPhase.current.has(node.id)) {
          sphere.scale.setScalar(0.01);
        }

        return group;
      }}
    />
  );
});

// ── Helpers ─────────────────────────────────────────

function getLinkKey(link: Link): string {
  const source = typeof link.source === 'object' ? link.source.id : link.source;
  const target = typeof link.target === 'object' ? link.target.id : link.target;
  return `${source}→${target}:${link.name}`;
}

function pairKey(link: Link): string {
  const source = typeof link.source === 'object' ? link.source.id : link.source;
  const target = typeof link.target === 'object' ? link.target.id : link.target;
  return [source, target].sort().join('↔');
}

function computeCentroids(nodes: any[]): Map<string, { x: number; y: number; z: number }> {
  const sums = new Map<string, { x: number; y: number; z: number; count: number }>();

  for (const node of nodes) {
    if (!node.x && !node.y && !node.z) continue;
    const existing = sums.get(node.type) ?? { x: 0, y: 0, z: 0, count: 0 };
    existing.x += node.x ?? 0;
    existing.y += node.y ?? 0;
    existing.z += node.z ?? 0;
    existing.count++;
    sums.set(node.type, existing);
  }

  const result = new Map<string, { x: number; y: number; z: number }>();
  for (const [type, sum] of sums) {
    result.set(type, {
      x: sum.x / sum.count,
      y: sum.y / sum.count,
      z: sum.z / sum.count,
    });
  }
  return result;
}

