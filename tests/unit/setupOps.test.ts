import { readFileSync } from 'node:fs';
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { checkProject } from '@/domain/integrity';
import { loadProject } from '@/domain/serialize';
import {
  addStandToSetup, clampToRange, nextFreeX, nudgePlacement, placeOnSurface, removeFromSetup, removeStandFromSetup,
  rotatePlacement, setSurfaceState,
} from '@/domain/setupOps'; // prettier-ignore
import type { Project } from '@/domain/types';

const sample = (): Project => {
  const r = loadProject(readFileSync(new URL('../../seed/studio.sample.json', import.meta.url), 'utf8'));
  if (!r.ok) throw new Error(r.message);
  return r.project;
};

describe('setup operations', () => {
  it('clamps tier adjustments to the stand ranges and steps', () => {
    expect(clampToRange(1131, { min: 300, max: 1400, step: 5 })).toBe(1130);
    expect(clampToRange(1500, { min: 300, max: 1400, step: 5 })).toBe(1400);
    expect(clampToRange(-5, { min: 0, max: 30, step: 1 })).toBe(0);
    const p = sample();
    const jaspers = p.library.standModels.find((m) => m.id === 'stand-jaspers-3d-145b')!;
    const next = produce(p, (d) => {
      setSurfaceState(d.setups[0]!, 'stand-unit-jaspers', jaspers.surfaces[2]!, { z: 1147.4, tiltDeg: 45, y: 120 });
    });
    expect(next.setups[0]!.stands[0]!.surfaceStates['tier-top']).toEqual({ z: 1145, tiltDeg: 30, y: 120 });
    const cleared = produce(next, (d) =>
      setSurfaceState(d.setups[0]!, 'stand-unit-jaspers', jaspers.surfaces[2]!, { y: null }),
    );
    expect(cleared.setups[0]!.stands[0]!.surfaceStates['tier-top']).toEqual({ z: 1145, tiltDeg: 30 });
  });

  it('places, nudges, rotates and removes units; stacked children fall to the floor', () => {
    const p = produce(sample(), (d) => {
      const s = d.setups[0]!;
      placeOnSurface(s, 'unit-ep40', 'stand-unit-jaspers', 'tier-bottom', 1200, 10);
      nudgePlacement(s, 'unit-ep40', 5, -2);
      rotatePlacement(s, 'unit-ep40');
      removeFromSetup(s, 'unit-ep40');
    });
    const s = p.setups[0]!;
    expect(s.placements.find((x) => x.unitId === 'unit-ep40')).toBeUndefined();
    expect(s.placements.find((x) => x.unitId === 'unit-sidekick')?.mount.type).toBe('floor');
    expect(checkProject(p).filter((i) => i.level === 'error')).toEqual([]);
  });

  it('locked placements do not move or rotate', () => {
    const p = produce(sample(), (d) => {
      const pl = d.setups[0]!.placements.find((x) => x.unitId === 'unit-dt2')!;
      pl.locked = true;
      nudgePlacement(d.setups[0]!, 'unit-dt2', 50, 0);
      rotatePlacement(d.setups[0]!, 'unit-dt2');
    });
    const pl = p.setups[0]!.placements.find((x) => x.unitId === 'unit-dt2')!;
    expect(pl.mount).toMatchObject({ x: 935 });
    expect(pl.rotationDeg).toBe(0);
  });

  it('removing a stand moves its units to the floor and keeps the project valid', () => {
    const p = produce(sample(), (d) => removeStandFromSetup(d.setups[0]!, 'stand-unit-jaspers'));
    expect(p.setups[0]!.placements.find((x) => x.unitId === 'unit-dt2')?.mount.type).toBe('floor');
    expect(checkProject(p).filter((i) => i.level === 'error')).toEqual([]);
    const again = produce(p, (d) => addStandToSetup(d.setups[0]!, 'stand-unit-jaspers', 100, 200));
    expect(again.setups[0]!.stands.find((x) => x.standUnitId === 'stand-unit-jaspers')?.pos).toEqual({
      x: 100,
      y: 200,
    });
  });

  it('next free x on a row', () => {
    expect(nextFreeX([], 215, 1450)).toBe(10);
    expect(
      nextFreeX(
        [
          { x: 10, w: 340 },
          { x: 360, w: 385 },
        ],
        215,
        1450,
      ),
    ).toBe(755);
    expect(nextFreeX([{ x: 10, w: 1400 }], 215, 1450)).toBeNull();
  });
});
