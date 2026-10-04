import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { emptyHistory, HISTORY_LIMIT, record, redo, sealHistory, undo } from '@/store/history';
import { createProjectStore, isDirty } from '@/store/projectStore';
import { sampleProject } from '../fixtures/sampleProject';

describe('history', () => {
  it('records, undoes and redoes', () => {
    let s = { n: 0 };
    let h = emptyHistory();
    ({ state: s, history: h } = record(s, h, (d) => void (d.n = 1)));
    ({ state: s, history: h } = record(s, h, (d) => void (d.n = 2)));
    const u = undo(s, h)!;
    expect(u.state).toEqual({ n: 1 });
    expect(redo(u.state, u.history)!.state).toEqual({ n: 2 });
  });

  it('no-op recipes do not create entries', () => {
    const r = record({ n: 0 }, emptyHistory(), () => {});
    expect(r.changed).toBe(false);
    expect(r.history.past).toHaveLength(0);
  });

  it('coalesces drags into one undo step until sealed', () => {
    let s = { x: 0 };
    let h = emptyHistory();
    for (let i = 1; i <= 10; i++)
      ({ state: s, history: h } = record(s, h, (d) => void (d.x = i), { coalesceKey: 'drag' }));
    expect(h.past).toHaveLength(1);
    expect(undo(s, h)!.state).toEqual({ x: 0 });
    h = sealHistory(h);
    ({ history: h } = record(s, h, (d) => void (d.x = 99), { coalesceKey: 'drag' }));
    expect(h.past).toHaveLength(2);
  });

  it(`keeps at least 200 steps (limit ${HISTORY_LIMIT})`, () => {
    let s = { n: 0 };
    let h = emptyHistory();
    for (let i = 1; i <= 250; i++) ({ state: s, history: h } = record(s, h, (d) => void (d.n = i)));
    for (let i = 0; i < 250; i++) ({ state: s, history: h } = undo(s, h)!);
    expect(s).toEqual({ n: 0 });
  });

  it('undo all restores the initial state; redo all restores the final state (property)', () => {
    const op = fc.oneof(
      fc.record({ kind: fc.constant('rename' as const), name: fc.string() }),
      fc.record({ kind: fc.constant('move' as const), x: fc.integer({ min: -2000, max: 2000 }), drag: fc.boolean() }),
      fc.record({ kind: fc.constant('tag' as const), tag: fc.string() }),
      fc.record({ kind: fc.constant('removeConn' as const) }),
    );
    fc.assert(
      fc.property(fc.array(op, { maxLength: 40 }), (ops) => {
        const store = createProjectStore(sampleProject());
        const initial = structuredClone(store.getState().project);
        for (const o of ops) {
          const st = store.getState();
          if (o.kind === 'rename') st.change((p) => void (p.meta.name = o.name));
          else if (o.kind === 'tag') st.change((p) => void p.setups[0]!.tags.push(o.tag));
          else if (o.kind === 'removeConn') st.change((p) => void p.setups[0]!.connections.pop());
          else {
            st.change(
              (p) => {
                const m = p.setups[0]!.placements[0]!.mount;
                if (m.type === 'surface') m.x = o.x;
              },
              o.drag ? { coalesceKey: 'drag' } : {},
            );
            if (!o.drag) st.seal();
          }
        }
        const final = structuredClone(store.getState().project);
        while (store.getState().history.past.length) store.getState().undo();
        expect(store.getState().project).toEqual(initial);
        while (store.getState().history.future.length) store.getState().redo();
        expect(store.getState().project).toEqual(final);
      }),
      { numRuns: 60 },
    );
  });
});

describe('project store', () => {
  it('tracks dirty state and refuses edits when read-only', () => {
    const store = createProjectStore(sampleProject());
    expect(isDirty(store.getState())).toBe(false);
    store.getState().change((p) => void (p.meta.name = 'Edited'));
    expect(isDirty(store.getState())).toBe(true);
    store.getState().markSaved('a.json');
    expect(isDirty(store.getState())).toBe(false);

    store.getState().load(sampleProject(), { readOnly: true });
    store.getState().change((p) => void (p.meta.name = 'Nope'));
    expect(store.getState().project.meta.name).toBe('Golden fixture');
  });
});
