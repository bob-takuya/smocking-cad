import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { useAppStore } from '../../store/useAppStore';
import { normalizePattern } from '../../engine/tangram';

// Colors from design system
const COLORS = {
  underlay: '#4A90D9',
  pleat: '#E8669A',
  underlayEdge: '#F5C518',
  stitch: '#1A1A1A',
  seam: '#FF7A00',
  singularity: '#E84040',
  background: '#1E2126',
};

interface TangramSVGProps {
  mode: 'open' | 'closed' | 'current';
}

export function TangramSVG({ mode }: TangramSVGProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const { tiledPattern, tangramState, eta } = useAppStore();

  useEffect(() => {
    if (!svgRef.current || !tiledPattern || !tangramState) return;

    const svg = d3.select(svgRef.current);
    const container = svgRef.current.parentElement;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    svg.attr('width', width).attr('height', height);
    svg.selectAll('*').remove();

    // Determine which vertex positions to use
    let vertices: [number, number][];
    if (mode === 'open') {
      vertices = tangramState.openVertices;
    } else if (mode === 'closed') {
      vertices = tangramState.closedVertices;
    } else {
      vertices = tangramState.vertices2D;
    }

    // Calculate scale and offset
    const { scale, offsetX, offsetY } = normalizePattern(tiledPattern, width, height, 30);

    // Transform function
    const tx = (idx: number) => vertices[idx][0] * scale + offsetX;
    const ty = (idx: number) => vertices[idx][1] * scale + offsetY;

    // Create main group
    const g = svg.append('g');

    // Draw faces
    const faceGroup = g.append('g').attr('class', 'faces');

    for (const face of tiledPattern.faces) {
      const points = face.vertices
        .map((idx) => `${tx(idx)},${ty(idx)}`)
        .join(' ');

      const fillColor = face.type === 'underlay' ? COLORS.underlay : COLORS.pleat;
      const opacity = face.type === 'pleat' ? 0.3 * (1 - eta) : 0.25;

      faceGroup
        .append('polygon')
        .attr('points', points)
        .attr('fill', fillColor)
        .attr('fill-opacity', opacity)
        .attr('stroke', 'none');
    }

    // Draw edges
    const edgeGroup = g.append('g').attr('class', 'edges');

    for (const edge of tiledPattern.edges) {
      let strokeColor = COLORS.underlayEdge;
      let strokeWidth = 1;
      let dashArray = '';
      let opacity = 1;

      switch (edge.type) {
        case 'underlay':
          strokeColor = COLORS.underlayEdge;
          strokeWidth = 1.5;
          break;
        case 'stitch':
          strokeColor = COLORS.stitch;
          strokeWidth = 2;
          break;
        case 'seam':
          strokeColor = COLORS.seam;
          strokeWidth = 1.5;
          dashArray = '5,3';
          break;
        case 'pleat':
          strokeColor = COLORS.pleat;
          strokeWidth = 1;
          opacity = 0.6;
          break;
      }

      edgeGroup
        .append('line')
        .attr('x1', tx(edge.a))
        .attr('y1', ty(edge.a))
        .attr('x2', tx(edge.b))
        .attr('y2', ty(edge.b))
        .attr('stroke', strokeColor)
        .attr('stroke-width', strokeWidth)
        .attr('stroke-dasharray', dashArray)
        .attr('stroke-opacity', opacity);
    }

    // Draw stitching lines
    const stitchGroup = g.append('g').attr('class', 'stitch-lines');

    for (const line of tiledPattern.stitchingLines) {
      if (line.length < 2) continue;

      const lineGenerator = d3.line<number>()
        .x((idx) => tx(idx))
        .y((idx) => ty(idx));

      stitchGroup
        .append('path')
        .datum(line)
        .attr('d', lineGenerator)
        .attr('fill', 'none')
        .attr('stroke', COLORS.stitch)
        .attr('stroke-width', 2.5)
        .attr('stroke-linecap', 'round')
        .attr('stroke-linejoin', 'round');
    }

    // Draw vertices as small circles
    const vertexGroup = g.append('g').attr('class', 'vertices');

    for (let i = 0; i < tiledPattern.vertices.length; i++) {
      const v = tiledPattern.vertices[i];
      const isStitchVertex = tiledPattern.stitchingLines.some((line) => line.includes(i));

      vertexGroup
        .append('circle')
        .attr('cx', tx(i))
        .attr('cy', ty(i))
        .attr('r', isStitchVertex ? 3 : 2)
        .attr('fill', v.type === 'pleat' ? COLORS.pleat : COLORS.underlay)
        .attr('stroke', isStitchVertex ? COLORS.stitch : 'none')
        .attr('stroke-width', 1);
    }

    // Find and mark singularities (vertices appearing in multiple stitch lines)
    const vertexStitchCount = new Map<number, number>();
    for (const line of tiledPattern.stitchingLines) {
      for (const idx of line) {
        vertexStitchCount.set(idx, (vertexStitchCount.get(idx) || 0) + 1);
      }
    }

    const singularityGroup = g.append('g').attr('class', 'singularities');

    for (const [idx, count] of vertexStitchCount) {
      if (count >= 2) {
        singularityGroup
          .append('circle')
          .attr('cx', tx(idx))
          .attr('cy', ty(idx))
          .attr('r', 5)
          .attr('fill', COLORS.singularity)
          .attr('stroke', 'white')
          .attr('stroke-width', 1.5);
      }
    }

  }, [tiledPattern, tangramState, mode, eta]);

  return (
    <svg
      ref={svgRef}
      className="w-full h-full"
      style={{ background: COLORS.background }}
    />
  );
}
