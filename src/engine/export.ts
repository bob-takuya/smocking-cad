/**
 * Export Module
 * Handles export to various formats: SVG, DXF, PDF, OBJ, JSON
 */

import { jsPDF } from 'jspdf';
import type {
  TiledPattern,
  TangramState,
  Mesh3D,
  SVGExportOptions,
  PDFExportOptions,
  DXFExportOptions,
  OptimizationResult,
  AppState,
} from '../types';
import { getPatternBounds } from './tangram';

// Color constants matching the design system
const COLORS = {
  underlay: '#4A90D9',
  pleat: '#E8669A',
  underlayEdge: '#F5C518',
  stitch: '#1A1A1A',
  seam: '#FF7A00',
  singularity: '#E84040',
};

/**
 * Export pattern to SVG format
 */
export function exportSVG(
  pattern: TiledPattern,
  tangram: TangramState,
  options: SVGExportOptions
): string {
  const bounds = getPatternBounds(pattern);
  const padding = 20;
  const scale = options.scale || 50;

  const width = (bounds.width * scale) + padding * 2;
  const height = (bounds.height * scale) + padding * 2;

  const offsetX = padding - bounds.minX * scale;
  const offsetY = padding - bounds.minY * scale;

  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="${width}" height="${height}"
     viewBox="0 0 ${width} ${height}">
  <defs>
    <style>
      .underlay-face { fill: ${COLORS.underlay}; fill-opacity: 0.3; stroke: none; }
      .pleat-face { fill: ${COLORS.pleat}; fill-opacity: 0.3; stroke: none; }
      .underlay-edge { stroke: ${COLORS.underlayEdge}; stroke-width: 1.5; fill: none; }
      .stitch-line { stroke: ${COLORS.stitch}; stroke-width: 2; fill: none; }
      .seam-line { stroke: ${COLORS.seam}; stroke-width: 1.5; stroke-dasharray: 5,3; fill: none; }
      .singularity { fill: ${COLORS.singularity}; }
    </style>
  </defs>
  <g transform="translate(${offsetX}, ${offsetY})">
`;

  // Helper to get transformed coordinates
  const tx = (v: number) => v * scale;
  const ty = (v: number) => v * scale;
  const getPos = (idx: number): [number, number] => {
    const x = tangram.vertices2D[idx * 2];
    const y = tangram.vertices2D[idx * 2 + 1];
    return [tx(x), ty(y)];
  };

  // Draw faces
  if (options.showUnderlay || options.showPleat) {
    for (const face of pattern.faces) {
      if (face.type === 'underlay' && !options.showUnderlay) continue;
      if (face.type === 'pleat' && !options.showPleat) continue;

      const points = face.vertices
        .map(idx => getPos(idx))
        .map(([x, y]) => `${x},${y}`)
        .join(' ');

      const className = face.type === 'underlay' ? 'underlay-face' : 'pleat-face';
      svg += `    <polygon class="${className}" points="${points}" />\n`;
    }
  }

  // Draw edges
  for (const edge of pattern.edges) {
    const [ax, ay] = getPos(edge.a);
    const [bx, by] = getPos(edge.b);

    let className = '';
    let shouldDraw = false;

    switch (edge.type) {
      case 'underlay':
        className = 'underlay-edge';
        shouldDraw = options.showUnderlay;
        break;
      case 'stitch':
        className = 'stitch-line';
        shouldDraw = options.showStitch;
        break;
      case 'seam':
        className = 'seam-line';
        shouldDraw = options.showSeams;
        break;
      case 'pleat':
        className = 'underlay-edge';
        shouldDraw = options.showPleat;
        break;
    }

    if (shouldDraw) {
      svg += `    <line class="${className}" x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" />\n`;
    }
  }

  // Draw stitching lines
  if (options.showStitch) {
    for (const line of pattern.stitchingLines) {
      if (line.length < 2) continue;

      const points = line
        .map(idx => getPos(idx))
        .map(([x, y]) => `${x},${y}`)
        .join(' ');

      svg += `    <polyline class="stitch-line" points="${points}" />\n`;
    }
  }

  // Draw singularities
  if (options.showSingularities) {
    // Find vertices that are at stitch line intersections
    const stitchVertices = new Set<number>();
    for (const line of pattern.stitchingLines) {
      for (const idx of line) {
        stitchVertices.add(idx);
      }
    }

    // Vertices that appear in multiple stitch lines are singularities
    const vertexCount = new Map<number, number>();
    for (const line of pattern.stitchingLines) {
      for (const idx of line) {
        vertexCount.set(idx, (vertexCount.get(idx) || 0) + 1);
      }
    }

    for (const [idx, count] of vertexCount) {
      if (count > 1) {
        const [x, y] = getPos(idx);
        svg += `    <circle class="singularity" cx="${x}" cy="${y}" r="4" />\n`;
      }
    }
  }

  svg += `  </g>
</svg>`;

  return svg;
}

/**
 * Export pattern to DXF format
 */
export function exportDXF(
  pattern: TiledPattern,
  tangram: TangramState,
  options: DXFExportOptions
): string {
  const scale = options.units === 'inch' ? 25.4 : options.units === 'cm' ? 10 : 1;

  let dxf = `0
SECTION
2
HEADER
0
ENDSEC
0
SECTION
2
TABLES
0
ENDSEC
0
SECTION
2
ENTITIES
`;

  // Helper to get coordinates
  const getPos = (idx: number): [number, number] => {
    const x = tangram.vertices2D[idx * 2];
    const y = tangram.vertices2D[idx * 2 + 1];
    return [x * scale, y * scale];
  };

  // Export edges as LINE entities
  for (const edge of pattern.edges) {
    const [ax, ay] = getPos(edge.a);
    const [bx, by] = getPos(edge.b);

    // Set layer based on edge type
    let layer = 'UNDERLAY';
    if (edge.type === 'stitch') layer = 'STITCH';
    else if (edge.type === 'seam') layer = 'SEAM';
    else if (edge.type === 'pleat') layer = 'PLEAT';

    dxf += `0
LINE
8
${layer}
10
${ax.toFixed(4)}
20
${ay.toFixed(4)}
30
0.0
11
${bx.toFixed(4)}
21
${by.toFixed(4)}
31
0.0
`;
  }

  // Export stitching lines as POLYLINE
  for (const line of pattern.stitchingLines) {
    if (line.length < 2) continue;

    dxf += `0
POLYLINE
8
STITCH
66
1
10
0.0
20
0.0
30
0.0
`;

    for (const idx of line) {
      const [x, y] = getPos(idx);
      dxf += `0
VERTEX
8
STITCH
10
${x.toFixed(4)}
20
${y.toFixed(4)}
30
0.0
`;
    }

    dxf += `0
SEQEND
`;
  }

  dxf += `0
ENDSEC
0
EOF
`;

  return dxf;
}

/**
 * Export pattern to PDF format
 */
export function exportPDF(
  pattern: TiledPattern,
  tangram: TangramState,
  options: PDFExportOptions
): Blob {
  const orientation = options.orientation === 'landscape' ? 'l' : 'p';
  const doc = new jsPDF({
    orientation,
    unit: 'mm',
    format: options.paperSize.toLowerCase() as 'a4' | 'a3' | 'letter',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = options.margin;

  const bounds = getPatternBounds(pattern);
  const availableWidth = pageWidth - margin * 2;
  const availableHeight = pageHeight - margin * 2;

  // Calculate scale to fit pattern on page
  const scaleX = availableWidth / bounds.width;
  const scaleY = availableHeight / bounds.height;
  const scale = Math.min(scaleX, scaleY);

  const offsetX = margin + (availableWidth - bounds.width * scale) / 2 - bounds.minX * scale;
  const offsetY = margin + (availableHeight - bounds.height * scale) / 2 - bounds.minY * scale;

  // Helper to get transformed coordinates
  const getPos = (idx: number): [number, number] => {
    const x = tangram.vertices2D[idx * 2];
    const y = tangram.vertices2D[idx * 2 + 1];
    return [x * scale + offsetX, y * scale + offsetY];
  };

  // Draw faces (simplified - using triangles for polygons)
  for (const face of pattern.faces) {
    const points = face.vertices.map(idx => getPos(idx));

    if (face.type === 'underlay') {
      doc.setFillColor(74, 144, 217);
    } else {
      doc.setFillColor(232, 102, 154);
    }

    // Draw as filled polygon using triangle fan
    if (points.length >= 3) {
      doc.triangle(
        points[0][0], points[0][1],
        points[1][0], points[1][1],
        points[2][0], points[2][1],
        'F'
      );
      // For quads, draw second triangle
      if (points.length >= 4) {
        doc.triangle(
          points[0][0], points[0][1],
          points[2][0], points[2][1],
          points[3][0], points[3][1],
          'F'
        );
      }
    }
  }

  // Draw edges
  for (const edge of pattern.edges) {
    const [ax, ay] = getPos(edge.a);
    const [bx, by] = getPos(edge.b);

    switch (edge.type) {
      case 'underlay':
        doc.setDrawColor(245, 197, 24);
        doc.setLineWidth(0.3);
        break;
      case 'stitch':
        doc.setDrawColor(26, 26, 26);
        doc.setLineWidth(0.5);
        break;
      case 'seam':
        doc.setDrawColor(255, 122, 0);
        doc.setLineWidth(0.3);
        doc.setLineDashPattern([2, 1], 0);
        break;
      default:
        doc.setDrawColor(74, 144, 217);
        doc.setLineWidth(0.2);
    }

    doc.line(ax, ay, bx, by);
    doc.setLineDashPattern([], 0);
  }

  // Add title
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text(`SmockingCAD Pattern - ${pattern.pattern.name}`, margin, margin - 5);

  return doc.output('blob');
}

/**
 * Export mesh to OBJ format
 */
export function exportOBJ(mesh: Mesh3D, name: string = 'smocked_mesh'): string {
  const { vertices, faces, normals } = mesh;
  let obj = `# SmockingCAD OBJ Export
# ${name}
o ${name}
`;

  // Vertices
  const numVerts = vertices.length / 3;
  for (let i = 0; i < numVerts; i++) {
    obj += `v ${vertices[i * 3].toFixed(6)} ${vertices[i * 3 + 1].toFixed(6)} ${vertices[i * 3 + 2].toFixed(6)}\n`;
  }

  // Normals
  if (normals) {
    for (let i = 0; i < numVerts; i++) {
      obj += `vn ${normals[i * 3].toFixed(6)} ${normals[i * 3 + 1].toFixed(6)} ${normals[i * 3 + 2].toFixed(6)}\n`;
    }
  }

  // Faces (OBJ uses 1-based indexing)
  const numFaces = faces.length / 3;
  for (let i = 0; i < numFaces; i++) {
    const a = faces[i * 3] + 1;
    const b = faces[i * 3 + 1] + 1;
    const c = faces[i * 3 + 2] + 1;

    if (normals) {
      obj += `f ${a}//${a} ${b}//${b} ${c}//${c}\n`;
    } else {
      obj += `f ${a} ${b} ${c}\n`;
    }
  }

  return obj;
}

/**
 * Export mesh to STL format (binary)
 */
export function exportSTL(mesh: Mesh3D): ArrayBuffer {
  const { vertices, faces } = mesh;
  const numFaces = faces.length / 3;

  // STL binary format: 80 byte header + 4 byte triangle count + 50 bytes per triangle
  const bufferSize = 84 + numFaces * 50;
  const buffer = new ArrayBuffer(bufferSize);
  const view = new DataView(buffer);

  // Header (80 bytes)
  const header = 'SmockingCAD STL Export';
  for (let i = 0; i < 80; i++) {
    view.setUint8(i, i < header.length ? header.charCodeAt(i) : 0);
  }

  // Triangle count
  view.setUint32(80, numFaces, true);

  let offset = 84;

  // Triangles
  for (let f = 0; f < numFaces; f++) {
    const ia = faces[f * 3];
    const ib = faces[f * 3 + 1];
    const ic = faces[f * 3 + 2];

    const ax = vertices[ia * 3], ay = vertices[ia * 3 + 1], az = vertices[ia * 3 + 2];
    const bx = vertices[ib * 3], by = vertices[ib * 3 + 1], bz = vertices[ib * 3 + 2];
    const cx = vertices[ic * 3], cy = vertices[ic * 3 + 1], cz = vertices[ic * 3 + 2];

    // Compute normal
    const abx = bx - ax, aby = by - ay, abz = bz - az;
    const acx = cx - ax, acy = cy - ay, acz = cz - az;
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;

    // Normal (12 bytes)
    view.setFloat32(offset, nx / len, true); offset += 4;
    view.setFloat32(offset, ny / len, true); offset += 4;
    view.setFloat32(offset, nz / len, true); offset += 4;

    // Vertex 1 (12 bytes)
    view.setFloat32(offset, ax, true); offset += 4;
    view.setFloat32(offset, ay, true); offset += 4;
    view.setFloat32(offset, az, true); offset += 4;

    // Vertex 2 (12 bytes)
    view.setFloat32(offset, bx, true); offset += 4;
    view.setFloat32(offset, by, true); offset += 4;
    view.setFloat32(offset, bz, true); offset += 4;

    // Vertex 3 (12 bytes)
    view.setFloat32(offset, cx, true); offset += 4;
    view.setFloat32(offset, cy, true); offset += 4;
    view.setFloat32(offset, cz, true); offset += 4;

    // Attribute byte count (2 bytes)
    view.setUint16(offset, 0, true); offset += 2;
  }

  return buffer;
}

/**
 * Export optimization result to JSON
 */
export function exportJSON(result: OptimizationResult): string {
  // Convert Float64Array to regular array for JSON serialization
  const vertices2D = Array.from(result.tangramState.vertices2D);

  return JSON.stringify({
    pattern: result.tiledPattern.pattern.name,
    tiling: {
      uRepeat: result.tiledPattern.uRepeat,
      vRepeat: result.tiledPattern.vRepeat,
    },
    vertices: vertices2D,
    gary: result.tangramState.gary,
    energy: {
      Eshape: result.Eshape,
      Epleat: result.Epleat,
      Eseam: result.Eseam,
    },
    iterations: result.iterations,
    converged: result.converged,
  }, null, 2);
}

/**
 * Export full project state to .smock format (JSON)
 */
export function exportSmockProject(state: Partial<AppState>): string {
  return JSON.stringify({
    version: '1.0.0',
    exported: new Date().toISOString(),
    shape: state.selectedShape,
    shapeParams: state.shapeParams,
    pattern: state.selectedPattern,
    tiling: { u: state.tilingU, v: state.tilingV },
    gary: state.gary,
    optimizationParams: state.optimizationParams,
    singularityMode: state.singularityMode,
    singularities: state.singularities,
    savedDesigns: state.savedDesigns,
  }, null, 2);
}

/**
 * Import project from .smock format
 */
export function importSmockProject(json: string): Partial<AppState> {
  const data = JSON.parse(json);

  return {
    selectedShape: data.shape,
    shapeParams: data.shapeParams,
    selectedPattern: data.pattern,
    tilingU: data.tiling?.u ?? 4,
    tilingV: data.tiling?.v ?? 4,
    gary: data.gary ?? 1,
    optimizationParams: data.optimizationParams,
    singularityMode: data.singularityMode,
    singularities: data.singularities,
    savedDesigns: data.savedDesigns,
  };
}

/**
 * Trigger file download in browser
 */
export function downloadFile(content: string | Blob | ArrayBuffer, filename: string, mimeType: string): void {
  let blob: Blob;

  if (content instanceof Blob) {
    blob = content;
  } else if (content instanceof ArrayBuffer) {
    blob = new Blob([content], { type: mimeType });
  } else {
    blob = new Blob([content], { type: mimeType });
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
