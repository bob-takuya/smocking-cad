import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useThreeScene } from '../../hooks/useThreeScene';
import { useAppStore } from '../../store/useAppStore';
import { generate3DPreview, FACE_TYPE_UNDERLAY, type ColoredMesh3D } from '../../engine/arap';

// Colors matching the 2D tangram view
const UNDERLAY_COLOR = 0x4a90d9;  // Blue
const PLEAT_COLOR = 0xe8669a;     // Pink/rose

export function ResultViewer3D() {
  const { containerRef, scene } = useThreeScene();
  const meshGroupRef = useRef<THREE.Group | null>(null);

  const {
    targetMesh,
    tangramState,
    tiledPattern,
    resultDisplayMode,
    showFront,
    gary,
  } = useAppStore();

  // Update preview mesh when inputs change
  useEffect(() => {
    if (!scene.current || !tiledPattern || !tangramState) return;

    // Remove old mesh group
    if (meshGroupRef.current) {
      scene.current.remove(meshGroupRef.current);
      meshGroupRef.current.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach(m => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
      meshGroupRef.current = null;
    }

    // Generate preview mesh from tangram
    let previewMesh: ColoredMesh3D;

    try {
      previewMesh = generate3DPreview(tiledPattern, tangramState);
    } catch (e) {
      console.error('Failed to generate 3D preview:', e);
      return;
    }

    const numFaces = previewMesh.faces.length / 3;
    const numVerts = previewMesh.vertices.length / 3;

    // Create a group to hold underlay and pleat meshes
    const group = new THREE.Group();

    // Separate faces by type for different colored materials
    const underlayFaceIndices: number[] = [];
    const pleatFaceIndices: number[] = [];

    for (let f = 0; f < numFaces; f++) {
      const faceType = previewMesh.faceTypes[f];
      const i0 = previewMesh.faces[f * 3];
      const i1 = previewMesh.faces[f * 3 + 1];
      const i2 = previewMesh.faces[f * 3 + 2];

      if (faceType === FACE_TYPE_UNDERLAY) {
        underlayFaceIndices.push(i0, i1, i2);
      } else {
        pleatFaceIndices.push(i0, i1, i2);
      }
    }

    // Helper to create a mesh from face indices
    const createSubmesh = (faceIndices: number[], color: number, isPleat: boolean) => {
      if (faceIndices.length === 0) return null;

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(previewMesh.vertices.slice(), 3));
      geometry.setIndex(faceIndices);

      if (previewMesh.normals) {
        geometry.setAttribute('normal', new THREE.BufferAttribute(previewMesh.normals.slice(), 3));
      } else {
        geometry.computeVertexNormals();
      }

      let material: THREE.Material;

      switch (resultDisplayMode) {
        case 'Smocked':
          material = new THREE.MeshStandardMaterial({
            color,
            metalness: 0.1,
            roughness: 0.75,
            side: THREE.DoubleSide,
          });
          break;

        case 'Heatmap': {
          // Color vertices based on height
          const colors = new Float32Array(numVerts * 3);
          let minY = Infinity, maxY = -Infinity;
          for (let i = 0; i < numVerts; i++) {
            const y = previewMesh.vertices[i * 3 + 1];
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
          }
          const range = maxY - minY || 1;
          for (let i = 0; i < numVerts; i++) {
            const y = previewMesh.vertices[i * 3 + 1];
            const t = (y - minY) / range;
            colors[i * 3] = t;
            colors[i * 3 + 1] = 0.2;
            colors[i * 3 + 2] = 1 - t;
          }
          geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
          material = new THREE.MeshBasicMaterial({
            vertexColors: true,
            side: THREE.DoubleSide,
          });
          break;
        }

        case 'TangramOverlay':
          material = new THREE.MeshStandardMaterial({
            color,
            metalness: 0.1,
            roughness: 0.7,
            wireframe: true,
            side: THREE.DoubleSide,
          });
          break;

        case 'Transparent':
          material = new THREE.MeshStandardMaterial({
            color,
            metalness: 0.1,
            roughness: 0.7,
            transparent: true,
            opacity: isPleat ? 0.7 : 0.5,
            side: THREE.DoubleSide,
          });
          break;

        case 'PleatQuality':
        default:
          material = new THREE.MeshStandardMaterial({
            color,
            metalness: 0.1,
            roughness: 0.7,
            side: THREE.DoubleSide,
          });
      }

      return new THREE.Mesh(geometry, material);
    };

    // Create underlay mesh
    const underlayMesh = createSubmesh(underlayFaceIndices, UNDERLAY_COLOR, false);
    if (underlayMesh) group.add(underlayMesh);

    // Create pleat mesh
    const pleatMesh = createSubmesh(pleatFaceIndices, PLEAT_COLOR, true);
    if (pleatMesh) group.add(pleatMesh);

    // Center and scale the group
    const box = new THREE.Box3().setFromObject(group);
    const center = new THREE.Vector3();
    box.getCenter(center);
    group.position.sub(center);

    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0) {
      const scale = 2.5 / maxDim;
      group.scale.set(scale, scale, scale);
    }

    scene.current.add(group);
    meshGroupRef.current = group;

  }, [targetMesh, tangramState, tiledPattern, resultDisplayMode, showFront, gary, scene]);

  return (
    <div ref={containerRef} className="w-full h-full" />
  );
}
