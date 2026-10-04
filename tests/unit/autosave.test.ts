import 'fake-indexeddb/auto';
import { createStore } from 'idb-keyval';
import { describe, expect, it } from 'vitest';
import { MAX_SNAPSHOTS, pushSnapshot, readSnapshots } from '@/store/autosave';

describe('autosave snapshots', () => {
  it('keeps a rolling window of 20, newest first, skipping duplicates', async () => {
    const store = createStore('test-db', 'kv');
    for (let i = 0; i < 25; i++) await pushSnapshot({ savedAt: String(i), projectName: 'p', text: `v${i}` }, store);
    await pushSnapshot({ savedAt: 'dup', projectName: 'p', text: 'v24' }, store);
    const list = await readSnapshots(store);
    expect(list).toHaveLength(MAX_SNAPSHOTS);
    expect(list[0]!.savedAt).toBe('24');
    expect(list.at(-1)!.text).toBe('v5');
  });
});
