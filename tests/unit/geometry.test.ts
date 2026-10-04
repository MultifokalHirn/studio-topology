import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  aabbOverlap, controlPlaneZ, convexOverlap, elevationX, faceLocalToBody, faceSizeFromBody, intervalOverlap,
  rectCorners, rotatePoint, rotatedFootprint, surfaceFrame, surfaceToWorld, trayZForPlane,
} from '@/domain/geometry'; // prettier-ignore
import type { FaceId, StandState, SurfaceDef } from '@/domain/types';

const body = { w: 200, d: 150, h: 60 };

describe('face-local coordinates (spec §3.2)', () => {
  it('a connector at the left edge of the back face appears on the right when viewed from the front', () => {
    const p = faceLocalToBody('back', { x: 0, y: 10 }, body);
    expect(p).toEqual({ x: 200, y: 150, z: 50 });
    expect(elevationX(p, 'front', body)).toBe(200);
    // In a rear view the stored coordinate is already what the viewer sees: no extra mirroring.
    expect(elevationX(p, 'rear', body)).toBe(0);
  });

  it('front face is not mirrored', () => {
    const p = faceLocalToBody('front', { x: 30, y: 0 }, body);
    expect(p).toEqual({ x: 30, y: 0, z: 60 });
    expect(elevationX(p, 'front', body)).toBe(30);
    expect(elevationX(p, 'rear', body)).toBe(170);
  });

  it('side and top faces map onto the correct body planes', () => {
    expect(faceLocalToBody('left', { x: 0, y: 0 }, body)).toEqual({ x: 0, y: 150, z: 60 });
    expect(faceLocalToBody('right', { x: 0, y: 0 }, body)).toEqual({ x: 200, y: 0, z: 60 });
    expect(faceLocalToBody('top', { x: 0, y: 0 }, body)).toEqual({ x: 0, y: 150, z: 60 });
    expect(faceLocalToBody('bottom', { x: 0, y: 0 }, body)).toEqual({ x: 200, y: 150, z: 0 });
  });

  it('face sizes derive from body dimensions', () => {
    expect(faceSizeFromBody('back', body)).toEqual({ widthMm: 200, heightMm: 60 });
    expect(faceSizeFromBody('left', body)).toEqual({ widthMm: 150, heightMm: 60 });
    expect(faceSizeFromBody('top', body)).toEqual({ widthMm: 200, heightMm: 150 });
  });

  it('every face point lands on the body surface (property)', () => {
    const faces: FaceId[] = ['top', 'front', 'back', 'left', 'right', 'bottom'];
    fc.assert(
      fc.property(
        fc.constantFrom(...faces),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (face, u, v) => {
          const size = faceSizeFromBody(face, body);
          const p = faceLocalToBody(face, { x: u * size.widthMm, y: v * size.heightMm }, body);
          for (const [val, max] of [
            [p.x, body.w],
            [p.y, body.d],
            [p.z, body.h],
          ] as const) {
            expect(Number.isNaN(val)).toBe(false);
            expect(val).toBeGreaterThanOrEqual(-1e-9);
            expect(val).toBeLessThanOrEqual(max + 1e-9);
          }
        },
      ),
    );
  });
});

describe('2D overlap', () => {
  it('AABB: flush units do not overlap, intersecting ones do', () => {
    const a = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
    expect(aabbOverlap(a, { minX: 100, minY: 0, maxX: 200, maxY: 100 })).toBe(false);
    expect(aabbOverlap(a, { minX: 99, minY: 0, maxX: 200, maxY: 100 })).toBe(true);
  });

  it('SAT handles rotated rectangles', () => {
    const a = rectCorners(0, 0, 100, 100);
    const diamond = rectCorners(0, 0, 100, 100).map((p) => rotatePoint(p, 45, { x: 50, y: 50 }));
    const shifted = diamond.map((p) => ({ x: p.x + 115, y: p.y }));
    expect(convexOverlap(a, diamond)).toBe(true);
    // Diamond half-diagonal is ~70.7; at +115 its left tip is at x≈94 → overlaps; at +125 → clear.
    expect(convexOverlap(a, shifted)).toBe(true);
    expect(
      convexOverlap(
        a,
        diamond.map((p) => ({ x: p.x + 125, y: p.y })),
      ),
    ).toBe(false);
  });

  it('interval overlap', () => {
    expect(intervalOverlap(0, 10, 5, 20)).toBe(5);
    expect(intervalOverlap(0, 10, 10, 20)).toBe(0);
    expect(intervalOverlap(10, 0, 20, 5)).toBe(5);
  });

  it('90° rotation swaps footprint width and depth', () => {
    expect(rotatedFootprint(215, 176, 90)).toEqual({ w: 176, d: 215 });
    expect(rotatedFootprint(215, 176, 180)).toEqual({ w: 215, d: 176 });
  });
});

describe('surfaces and control plane (Appendix C)', () => {
  it('tray height for a 63 mm unit at plane 1000 is 937 mm', () => {
    expect(trayZForPlane(1000, 63)).toBe(937);
    expect(controlPlaneZ(937, { d: 176, h: 63 }, 0)).toBe(1000);
  });

  it('tilt raises the mid-depth plane', () => {
    const z = controlPlaneZ(937, { d: 176, h: 63 }, 10);
    expect(z).toBeCloseTo(937 + 63 * Math.cos(Math.PI / 18) + 88 * Math.sin(Math.PI / 18), 9);
  });

  const tier: SurfaceDef = {
    id: 'tier', label: 'Tier', kind: 'tier', usable: { w: 1450, d: 400 }, anchor: { x: 0, y: 0, z: 800 },
    adjustable: {}, loadKg: 15,
  }; // prettier-ignore

  it('surface frame uses setup state over the model anchor', () => {
    const stand: StandState = { standUnitId: 's', pos: { x: 100, y: 50 }, rotationDeg: 0,
      surfaceStates: { tier: { z: 937, y: 20 } } }; // prettier-ignore
    const f = surfaceFrame(tier, stand);
    expect(f.origin).toEqual({ x: 100, y: 70, z: 937 });
    expect(surfaceToWorld(f, { x: 10, y: 0, z: 0 })).toEqual({ x: 110, y: 70, z: 937 });
  });

  it('tilt rotates about the front edge, raising the back', () => {
    const stand: StandState = {
      standUnitId: 's',
      pos: { x: 0, y: 0 },
      rotationDeg: 0,
      surfaceStates: { tier: { tiltDeg: 30 } },
    };
    const p = surfaceToWorld(surfaceFrame(tier, stand), { x: 0, y: 400, z: 0 });
    expect(p.y).toBeCloseTo(400 * Math.cos(Math.PI / 6));
    expect(p.z).toBeCloseTo(800 + 200);
  });

  it('stand rotation pivots around the stand position', () => {
    const stand: StandState = { standUnitId: 's', pos: { x: 0, y: 0 }, rotationDeg: 90, surfaceStates: {} };
    const p = surfaceToWorld(surfaceFrame(tier, stand), { x: 100, y: 0, z: 0 });
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(100);
  });
});
