import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useThreeScene } from '../../hooks/useThreeScene';
import { useAppStore } from '../../store/useAppStore';
import { computeGaussianCurvature, computeMeanCurvature, curvatureToColors } from '../../engine/curvature';
import type { Mesh3D } from '../../types';

export function ShapeViewer3D() {
  const { containerRef, scene } = useThreeScene();
  const meshRef = useRef<THREE.Mesh | null>(null);
  const wireframeRef = useRef<THREE.LineSegments | null>(null);

  const { targetMesh, meshDisplayMode } = useAppStore();

  // Update mesh when target changes
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
    }
    if (wireframeRef.current) {
      scene.current.remove(wireframeRef.current);
      wireframeRef.current.geometry.dispose();
      (wireframeRef.current.material as THREE.Material).dispose();
    }

    // Create geometry from Mesh3D
    const geometry = createGeometryFromMesh3D(targetMesh);

    // Create material based on display mode
    let material: THREE.Material;
    let needsVertexColors = false;

    if (meshDisplayMode === 'GaussianCurvature') {
      const curvature = computeGaussianCurvature(targetMesh);
      const colors = curvatureToColors(curvature, 'diverging');
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      material = new THREE.MeshBasicMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
      });
      needsVertexColors = true;
    } else if (meshDisplayMode === 'MeanCurvature') {
      const curvature = computeMeanCurvature(targetMesh);
      const colors = curvatureToColors(curvature, 'sequential');
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      material = new THREE.MeshBasicMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
      });
      needsVertexColors = true;
    } else {
      material = new THREE.MeshStandardMaterial({
        color: 0x4a90d9,
        metalness: 0.1,
        roughness: 0.7,
        side: THREE.DoubleSide,
      });
    }

    const mesh = new THREE.Mesh(geometry, material);
    scene.current.add(mesh);
    meshRef.current = mesh;

    // Add wireframe if needed
    if (meshDisplayMode === 'Wireframe' || needsVertexColors) {
      const wireframeGeom = new THREE.WireframeGeometry(geometry);
      const wireframeMat = new THREE.LineBasicMaterial({
        color: meshDisplayMode === 'Wireframe' ? 0x4a90d9 : 0x2a2e35,
        opacity: meshDisplayMode === 'Wireframe' ? 1 : 0.3,
        transparent: meshDisplayMode !== 'Wireframe',
      });
      const wireframe = new THREE.LineSegments(wireframeGeom, wireframeMat);
      scene.current.add(wireframe);
      wireframeRef.current = wireframe;

      // Hide solid mesh for pure wireframe mode
      if (meshDisplayMode === 'Wireframe') {
        mesh.visible = false;
      }
    }

    return () => {
      // Cleanup on unmount is handled by useThreeScene
    };
  }, [targetMesh, meshDisplayMode, scene]);

  return (
    <div ref={containerRef} className="w-full h-full" />
  );
}

function createGeometryFromMesh3D(mesh: Mesh3D): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();

  // Set vertices
  geometry.setAttribute('position', new THREE.BufferAttribute(mesh.vertices, 3));

  // Set faces
  geometry.setIndex(new THREE.BufferAttribute(mesh.faces, 1));

  // Set normals
  if (mesh.normals) {
    geometry.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
  } else {
    geometry.computeVertexNormals();
  }

  // Set UVs if available
  if (mesh.uvs) {
    geometry.setAttribute('uv', new THREE.BufferAttribute(mesh.uvs, 2));
  }

  return geometry;
}
