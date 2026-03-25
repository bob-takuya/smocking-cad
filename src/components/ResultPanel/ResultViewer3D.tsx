import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useThreeScene } from '../../hooks/useThreeScene';
import { useAppStore } from '../../store/useAppStore';
import { generateSmockedPreview } from '../../engine/arap';
import type { Mesh3D } from '../../types';

export function ResultViewer3D() {
  const { containerRef, scene } = useThreeScene();
  const meshRef = useRef<THREE.Mesh | null>(null);

  const {
    targetMesh,
    tangramState,
    tiledPattern,
    resultDisplayMode,
    showFront,
    eta,
  } = useAppStore();

  // Update preview mesh when inputs change
  useEffect(() => {
    if (!scene.current || !targetMesh) return;

    // Remove old mesh
    if (meshRef.current) {
      scene.current.remove(meshRef.current);
      meshRef.current.geometry.dispose();
      if (Array.isArray(meshRef.current.material)) {
        meshRef.current.material.forEach(m => m.dispose());
      } else {
        meshRef.current.material.dispose();
      }
      meshRef.current = null;
    }

    // Generate preview mesh
    let previewMesh: Mesh3D;

    if (tangramState && tiledPattern) {
      previewMesh = generateSmockedPreview(
        targetMesh,
        tangramState,
        tiledPattern,
        0.05 * (1 - eta)
      );
    } else {
      previewMesh = targetMesh;
    }

    // Create geometry
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(previewMesh.vertices, 3));
    geometry.setIndex(new THREE.BufferAttribute(previewMesh.faces, 1));

    if (previewMesh.normals) {
      geometry.setAttribute('normal', new THREE.BufferAttribute(previewMesh.normals, 3));
    } else {
      geometry.computeVertexNormals();
    }

    // Create material based on display mode
    let material: THREE.Material;

    switch (resultDisplayMode) {
      case 'Smocked':
        material = new THREE.MeshStandardMaterial({
          color: 0x4a90d9,
          metalness: 0.1,
          roughness: 0.8,
          side: showFront ? THREE.FrontSide : THREE.BackSide,
        });
        break;

      case 'Heatmap':
        // Color vertices based on displacement
        const numVerts = previewMesh.vertices.length / 3;
        const colors = new Float32Array(numVerts * 3);
        for (let i = 0; i < numVerts; i++) {
          const y = previewMesh.vertices[i * 3 + 1];
          const t = Math.max(0, Math.min(1, (y + 1) / 2));
          // Blue to red gradient
          colors[i * 3] = t;
          colors[i * 3 + 1] = 0.2;
          colors[i * 3 + 2] = 1 - t;
        }
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        material = new THREE.MeshBasicMaterial({
          vertexColors: true,
          side: showFront ? THREE.FrontSide : THREE.BackSide,
        });
        break;

      case 'PleatQuality':
        material = new THREE.MeshStandardMaterial({
          color: 0xe8669a,
          metalness: 0.1,
          roughness: 0.7,
          side: showFront ? THREE.FrontSide : THREE.BackSide,
        });
        break;

      case 'TangramOverlay':
        material = new THREE.MeshStandardMaterial({
          color: 0x4a90d9,
          metalness: 0.1,
          roughness: 0.7,
          wireframe: true,
          side: THREE.DoubleSide,
        });
        break;

      case 'Transparent':
        material = new THREE.MeshStandardMaterial({
          color: 0x4a90d9,
          metalness: 0.1,
          roughness: 0.7,
          transparent: true,
          opacity: 0.5,
          side: THREE.DoubleSide,
        });
        break;

      default:
        material = new THREE.MeshStandardMaterial({
          color: 0x4a90d9,
          metalness: 0.1,
          roughness: 0.7,
          side: showFront ? THREE.FrontSide : THREE.BackSide,
        });
    }

    const mesh = new THREE.Mesh(geometry, material);
    scene.current.add(mesh);
    meshRef.current = mesh;

  }, [targetMesh, tangramState, tiledPattern, resultDisplayMode, showFront, eta, scene]);

  return (
    <div ref={containerRef} className="w-full h-full" />
  );
}
