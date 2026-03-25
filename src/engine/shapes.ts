/**
 * 3D Target Shape Generators
 * Creates parametric meshes for smocking targets
 */

import type { Mesh3D, ShapePreset, ShapeParams } from '../types';

/**
 * Generate a hemisphere mesh
 */
export function generateHemisphere(
  radius: number = 1,
  resolution: number = 32
): Mesh3D {
  const latSteps = Math.floor(resolution / 2);
  const lonSteps = resolution;

  const vertices: number[] = [];
  const faces: number[] = [];
  const normals: number[] = [];

  // Generate vertices
  for (let lat = 0; lat <= latSteps; lat++) {
    const theta = (lat / latSteps) * (Math.PI / 2); // 0 to PI/2
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);

    for (let lon = 0; lon <= lonSteps; lon++) {
      const phi = (lon / lonSteps) * 2 * Math.PI;
      const sinPhi = Math.sin(phi);
      const cosPhi = Math.cos(phi);

      const x = radius * sinTheta * cosPhi;
      const y = radius * cosTheta;
      const z = radius * sinTheta * sinPhi;

      vertices.push(x, y, z);
      normals.push(sinTheta * cosPhi, cosTheta, sinTheta * sinPhi);
    }
  }

  // Generate faces
  for (let lat = 0; lat < latSteps; lat++) {
    for (let lon = 0; lon < lonSteps; lon++) {
      const first = lat * (lonSteps + 1) + lon;
      const second = first + lonSteps + 1;

      faces.push(first, second, first + 1);
      faces.push(second, second + 1, first + 1);
    }
  }

  return {
    vertices: new Float32Array(vertices),
    faces: new Uint32Array(faces),
    normals: new Float32Array(normals),
  };
}

/**
 * Generate a full sphere mesh
 */
export function generateSphere(
  radius: number = 1,
  resolution: number = 32
): Mesh3D {
  const latSteps = resolution;
  const lonSteps = resolution;

  const vertices: number[] = [];
  const faces: number[] = [];
  const normals: number[] = [];

  // Generate vertices
  for (let lat = 0; lat <= latSteps; lat++) {
    const theta = (lat / latSteps) * Math.PI;
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);

    for (let lon = 0; lon <= lonSteps; lon++) {
      const phi = (lon / lonSteps) * 2 * Math.PI;
      const sinPhi = Math.sin(phi);
      const cosPhi = Math.cos(phi);

      const x = radius * sinTheta * cosPhi;
      const y = radius * cosTheta;
      const z = radius * sinTheta * sinPhi;

      vertices.push(x, y, z);
      normals.push(sinTheta * cosPhi, cosTheta, sinTheta * sinPhi);
    }
  }

  // Generate faces
  for (let lat = 0; lat < latSteps; lat++) {
    for (let lon = 0; lon < lonSteps; lon++) {
      const first = lat * (lonSteps + 1) + lon;
      const second = first + lonSteps + 1;

      if (lat !== 0) {
        faces.push(first, second, first + 1);
      }
      if (lat !== latSteps - 1) {
        faces.push(second, second + 1, first + 1);
      }
    }
  }

  return {
    vertices: new Float32Array(vertices),
    faces: new Uint32Array(faces),
    normals: new Float32Array(normals),
  };
}

/**
 * Generate a hyperboloid mesh (one-sheet)
 * x²/a² + y²/a² - z²/c² = 1
 */
export function generateHyperboloid(
  a: number = 0.5,
  c: number = 1,
  resolution: number = 32
): Mesh3D {
  const vSteps = resolution;
  const uSteps = resolution;

  const vertices: number[] = [];
  const faces: number[] = [];
  const normals: number[] = [];

  // v ranges from -1.5 to 1.5 (z coordinate essentially)
  for (let iv = 0; iv <= vSteps; iv++) {
    const v = (iv / vSteps) * 3 - 1.5;

    for (let iu = 0; iu <= uSteps; iu++) {
      const u = (iu / uSteps) * 2 * Math.PI;

      const r = a * Math.sqrt(1 + (v * v) / (c * c));
      const x = r * Math.cos(u);
      const y = r * Math.sin(u);
      const z = v;

      vertices.push(x, z, y); // Rotate so Y is up

      // Normal calculation
      const nx = Math.cos(u) / a;
      const ny = Math.sin(u) / a;
      const nz = -v / (c * c);
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      normals.push(nx / len, nz / len, ny / len);
    }
  }

  // Generate faces
  for (let iv = 0; iv < vSteps; iv++) {
    for (let iu = 0; iu < uSteps; iu++) {
      const first = iv * (uSteps + 1) + iu;
      const second = first + uSteps + 1;

      faces.push(first, second, first + 1);
      faces.push(second, second + 1, first + 1);
    }
  }

  return {
    vertices: new Float32Array(vertices),
    faces: new Uint32Array(faces),
    normals: new Float32Array(normals),
  };
}

/**
 * Generate a hyperbolic paraboloid (saddle surface)
 * z = (x² - y²) * curvature
 */
export function generateHyperbolicParaboloid(
  size: number = 2,
  curvature: number = 0.5,
  resolution: number = 32
): Mesh3D {
  const vertices: number[] = [];
  const faces: number[] = [];
  const normals: number[] = [];

  const half = size / 2;

  for (let iy = 0; iy <= resolution; iy++) {
    const y = (iy / resolution) * size - half;

    for (let ix = 0; ix <= resolution; ix++) {
      const x = (ix / resolution) * size - half;
      const z = curvature * (x * x - y * y);

      vertices.push(x, z, y);

      // Normal: gradient of z = c(x² - y²)
      // dz/dx = 2cx, dz/dy = -2cy
      // Normal = (-2cx, 1, 2cy) normalized
      const nx = -2 * curvature * x;
      const ny = 1;
      const nz = 2 * curvature * y;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      normals.push(nx / len, ny / len, nz / len);
    }
  }

  // Generate faces
  for (let iy = 0; iy < resolution; iy++) {
    for (let ix = 0; ix < resolution; ix++) {
      const first = iy * (resolution + 1) + ix;
      const second = first + resolution + 1;

      faces.push(first, second, first + 1);
      faces.push(second, second + 1, first + 1);
    }
  }

  return {
    vertices: new Float32Array(vertices),
    faces: new Uint32Array(faces),
    normals: new Float32Array(normals),
  };
}

/**
 * Generate a torus mesh
 */
export function generateTorus(
  R: number = 1,       // Major radius
  r: number = 0.3,     // Minor radius (tube)
  resolution: number = 32
): Mesh3D {
  const tubeSegments = resolution;
  const radialSegments = resolution;

  const vertices: number[] = [];
  const faces: number[] = [];
  const normals: number[] = [];

  for (let j = 0; j <= radialSegments; j++) {
    const v = (j / radialSegments) * 2 * Math.PI;

    for (let i = 0; i <= tubeSegments; i++) {
      const u = (i / tubeSegments) * 2 * Math.PI;

      const x = (R + r * Math.cos(v)) * Math.cos(u);
      const y = r * Math.sin(v);
      const z = (R + r * Math.cos(v)) * Math.sin(u);

      vertices.push(x, y, z);

      // Normal
      const nx = Math.cos(v) * Math.cos(u);
      const ny = Math.sin(v);
      const nz = Math.cos(v) * Math.sin(u);
      normals.push(nx, ny, nz);
    }
  }

  // Generate faces
  for (let j = 0; j < radialSegments; j++) {
    for (let i = 0; i < tubeSegments; i++) {
      const first = j * (tubeSegments + 1) + i;
      const second = first + tubeSegments + 1;

      faces.push(first, second, first + 1);
      faces.push(second, second + 1, first + 1);
    }
  }

  return {
    vertices: new Float32Array(vertices),
    faces: new Uint32Array(faces),
    normals: new Float32Array(normals),
  };
}

/**
 * Parse OBJ file format
 */
export function parseOBJ(text: string): Mesh3D {
  const vertices: number[] = [];
  const faces: number[] = [];

  const tempNormals: number[][] = [];

  const lines = text.split('\n');

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith('#') || line === '') continue;

    const parts = line.split(/\s+/);
    const cmd = parts[0];

    if (cmd === 'v') {
      vertices.push(
        parseFloat(parts[1]),
        parseFloat(parts[2]),
        parseFloat(parts[3])
      );
    } else if (cmd === 'vn') {
      tempNormals.push([
        parseFloat(parts[1]),
        parseFloat(parts[2]),
        parseFloat(parts[3]),
      ]);
    } else if (cmd === 'f') {
      // Parse face (can be v, v/vt, v/vt/vn, or v//vn)
      const faceVerts: number[] = [];

      for (let i = 1; i < parts.length; i++) {
        const indices = parts[i].split('/');
        const vIdx = parseInt(indices[0]) - 1; // OBJ is 1-indexed
        faceVerts.push(vIdx);
      }

      // Triangulate if needed (fan triangulation)
      for (let i = 1; i < faceVerts.length - 1; i++) {
        faces.push(faceVerts[0], faceVerts[i], faceVerts[i + 1]);
      }
    }
  }

  // Compute normals if not provided
  const numVerts = vertices.length / 3;
  const computedNormals = new Float32Array(numVerts * 3);

  if (tempNormals.length === 0) {
    // Compute normals from faces
    const normalAccum: number[][] = Array.from({ length: numVerts }, () => [0, 0, 0]);

    for (let i = 0; i < faces.length; i += 3) {
      const ia = faces[i] * 3;
      const ib = faces[i + 1] * 3;
      const ic = faces[i + 2] * 3;

      const ax = vertices[ia], ay = vertices[ia + 1], az = vertices[ia + 2];
      const bx = vertices[ib], by = vertices[ib + 1], bz = vertices[ib + 2];
      const cx = vertices[ic], cy = vertices[ic + 1], cz = vertices[ic + 2];

      // Edge vectors
      const abx = bx - ax, aby = by - ay, abz = bz - az;
      const acx = cx - ax, acy = cy - ay, acz = cz - az;

      // Cross product
      const nx = aby * acz - abz * acy;
      const ny = abz * acx - abx * acz;
      const nz = abx * acy - aby * acx;

      normalAccum[faces[i]][0] += nx;
      normalAccum[faces[i]][1] += ny;
      normalAccum[faces[i]][2] += nz;
      normalAccum[faces[i + 1]][0] += nx;
      normalAccum[faces[i + 1]][1] += ny;
      normalAccum[faces[i + 1]][2] += nz;
      normalAccum[faces[i + 2]][0] += nx;
      normalAccum[faces[i + 2]][1] += ny;
      normalAccum[faces[i + 2]][2] += nz;
    }

    // Normalize
    for (let i = 0; i < numVerts; i++) {
      const [nx, ny, nz] = normalAccum[i];
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      computedNormals[i * 3] = nx / len;
      computedNormals[i * 3 + 1] = ny / len;
      computedNormals[i * 3 + 2] = nz / len;
    }
  }

  return {
    vertices: new Float32Array(vertices),
    faces: new Uint32Array(faces),
    normals: tempNormals.length > 0 ? undefined : computedNormals,
  };
}

/**
 * Parse binary STL file format
 */
export function parseSTL(buffer: ArrayBuffer): Mesh3D {
  const view = new DataView(buffer);

  // Skip 80 byte header
  const numTriangles = view.getUint32(80, true);

  const vertices: number[] = [];
  const faces: number[] = [];
  const normals: number[] = [];

  let offset = 84;
  const vertexMap = new Map<string, number>();

  for (let t = 0; t < numTriangles; t++) {
    // Normal (skip, we'll compute our own)
    const nx = view.getFloat32(offset, true);
    const ny = view.getFloat32(offset + 4, true);
    const nz = view.getFloat32(offset + 8, true);
    offset += 12;

    const faceIndices: number[] = [];

    // Three vertices
    for (let v = 0; v < 3; v++) {
      const x = view.getFloat32(offset, true);
      const y = view.getFloat32(offset + 4, true);
      const z = view.getFloat32(offset + 8, true);
      offset += 12;

      // Deduplicate vertices
      const key = `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`;
      let idx: number;

      if (vertexMap.has(key)) {
        idx = vertexMap.get(key)!;
      } else {
        idx = vertices.length / 3;
        vertices.push(x, y, z);
        normals.push(nx, ny, nz);
        vertexMap.set(key, idx);
      }

      faceIndices.push(idx);
    }

    faces.push(faceIndices[0], faceIndices[1], faceIndices[2]);

    // Skip attribute byte count
    offset += 2;
  }

  return {
    vertices: new Float32Array(vertices),
    faces: new Uint32Array(faces),
    normals: new Float32Array(normals),
  };
}

/**
 * Generate mesh based on preset and parameters
 */
export function generateMesh(shape: ShapePreset, params: ShapeParams): Mesh3D | null {
  const resolution = params.resolution ?? 32;

  switch (shape) {
    case 'Hemisphere':
      return generateHemisphere(params.radius ?? 1, resolution);
    case 'Sphere':
      return generateSphere(params.radius ?? 1, resolution);
    case 'Hyperboloid':
      return generateHyperboloid(params.a ?? 0.5, params.c ?? 1, resolution);
    case 'HyperbolicParaboloid':
      return generateHyperbolicParaboloid(2, params.curvature ?? 0.5, resolution);
    case 'Torus':
      return generateTorus(params.radius ?? 1, params.radius2 ?? 0.3, resolution);
    case 'Custom':
      return null;
    default:
      return null;
  }
}

/**
 * Get default parameters for each shape
 */
export function getDefaultShapeParams(shape: ShapePreset): ShapeParams {
  switch (shape) {
    case 'Hemisphere':
      return { radius: 1, resolution: 32 };
    case 'Sphere':
      return { radius: 1, resolution: 32 };
    case 'Hyperboloid':
      return { a: 0.5, c: 1, resolution: 32 };
    case 'HyperbolicParaboloid':
      return { curvature: 0.5, resolution: 32 };
    case 'Torus':
      return { radius: 1, radius2: 0.3, resolution: 32 };
    case 'Custom':
      return { resolution: 32 };
    default:
      return { radius: 1, resolution: 32 };
  }
}

/**
 * Get bounding box of mesh
 */
export function getMeshBounds(mesh: Mesh3D): {
  min: [number, number, number];
  max: [number, number, number];
  center: [number, number, number];
  size: number;
} {
  const verts = mesh.vertices;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (let i = 0; i < verts.length; i += 3) {
    minX = Math.min(minX, verts[i]);
    maxX = Math.max(maxX, verts[i]);
    minY = Math.min(minY, verts[i + 1]);
    maxY = Math.max(maxY, verts[i + 1]);
    minZ = Math.min(minZ, verts[i + 2]);
    maxZ = Math.max(maxZ, verts[i + 2]);
  }

  const center: [number, number, number] = [
    (minX + maxX) / 2,
    (minY + maxY) / 2,
    (minZ + maxZ) / 2,
  ];

  const size = Math.max(maxX - minX, maxY - minY, maxZ - minZ);

  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
    center,
    size,
  };
}
