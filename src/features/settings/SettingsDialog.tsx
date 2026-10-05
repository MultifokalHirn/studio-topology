// Settings (spec §5.16): units, theme, palette, snap, animation, labels, ergonomic and cable defaults, mains, body
// profile, autosave. Settings live in the project file, so every change is undoable.
import type { Draft } from 'immer';
import { Button, Checkbox, ColorInput, Field, Modal, NumberInput, Select } from '@/components/ui';
import { DEFAULT_DOMAIN_PALETTE, DEFAULT_MIDI_CHANNEL_PALETTE } from '@/domain/defaults';
import type { Settings } from '@/domain/types';
import { t } from '@/i18n';
import { projectStore, uiStore, useProject } from '@/store';

const PALETTE_LABELS: Record<string, string> = {
  'audio.mono': 'Audio mono',
  'audio.L': 'Audio L',
  'audio.R': 'Audio R',
  midi: 'MIDI',
  usb: 'USB',
  cv: 'CV / gate',
  clock: 'Clock',
  digital: 'Digital audio',
  power: 'Power',
  expression: 'Expression / footswitch',
  error: 'Error',
  warning: 'Warning',
  info: 'Info',
};

function edit(label: string, recipe: (s: Draft<Settings>) => void, key?: string) {
  projectStore.getState().change((p) => recipe(p.settings), {
    label: `Settings: ${label}`,
    ...(key ? { coalesceKey: `settings:${key}` } : {}),
  });
}

function Num(props: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  hint?: string;
}) {
  return (
    <Field label={props.label} hint={props.hint && <span className="text-neutral-400">({props.hint})</span>}>
      {(id) => (
        <NumberInput
          id={id}
          value={props.value}
          onChange={(v) => {
            if (v === null) return;
            const clamped = Math.min(props.max ?? Infinity, Math.max(props.min ?? -Infinity, v));
            props.onChange(clamped);
          }}
        />
      )}
    </Field>
  );
}

function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded border border-neutral-200 p-3 dark:border-neutral-700">
      <legend className="px-1 text-xs font-semibold text-neutral-500 uppercase">{t(props.title)}</legend>
      <div className="grid grid-cols-3 gap-3">{props.children}</div>
    </fieldset>
  );
}

export function SettingsDialog() {
  const s = useProject((x) => x.project.settings);
  const bodies = useProject((x) => x.project.bodyProfiles);
  const readOnly = useProject((x) => x.readOnly);
  return (
    <Modal
      title={t('Settings')}
      wide
      onClose={() => uiStore.getState().setDialog(null)}
      footer={<Button onClick={() => uiStore.getState().setDialog(null)}>{t('Close')}</Button>}
    >
      <div className={readOnly ? 'pointer-events-none space-y-3 opacity-60' : 'space-y-3'}>
        {readOnly && <p className="text-xs text-amber-700">{t('Read-only project: settings cannot be changed.')}</p>}
        <Section title="Display">
          <Field label={t('Length unit')}>
            {(id) => (
              <Select
                id={id}
                value={s.units.length}
                options={['mm', 'cm', 'in'] as const}
                onChange={(v) => edit('units', (x) => void (x.units.length = v))}
              />
            )}
          </Field>
          <Num
            label={t('Decimal places')}
            value={s.units.decimals}
            min={0}
            max={4}
            onChange={(v) => edit('decimals', (x) => void (x.units.decimals = Math.round(v)), 'decimals')}
          />
          <Field label={t('Theme')}>
            {(id) => (
              <Select
                id={id}
                value={s.theme}
                options={[
                  { value: 'system', label: t('System') },
                  { value: 'light', label: t('Light') },
                  { value: 'dark', label: t('Dark') },
                ]}
                onChange={(v) => edit('theme', (x) => void (x.theme = v))}
              />
            )}
          </Field>
          <Field label={t('Label density')}>
            {(id) => (
              <Select
                id={id}
                value={s.labelDensity}
                options={[
                  { value: 'off', label: t('Off') },
                  { value: 'minimal', label: t('Minimal') },
                  { value: 'full', label: t('Full') },
                ]}
                onChange={(v) => edit('labels', (x) => void (x.labelDensity = v))}
              />
            )}
          </Field>
        </Section>

        <Section title="Grid and snap">
          <div className="flex items-end pb-1">
            <Checkbox
              label={t('Snap to grid')}
              checked={s.snap.enabled}
              onChange={(v) => edit('snap', (x) => void (x.snap.enabled = v))}
            />
          </div>
          <Num
            label={t('Grid (mm)')}
            value={s.snap.gridMm}
            min={0.1}
            onChange={(v) => edit('grid', (x) => void (x.snap.gridMm = v), 'grid')}
          />
          <Num
            label={t('Fine grid, Shift (mm)')}
            value={s.snap.fineMm}
            min={0.1}
            onChange={(v) => edit('fine grid', (x) => void (x.snap.fineMm = v), 'fine')}
          />
        </Section>

        <Section title="Animation">
          <div className="flex items-end pb-1">
            <Checkbox
              label={t('Animate signal flow')}
              checked={s.animation.enabled}
              onChange={(v) => edit('animation', (x) => void (x.animation.enabled = v))}
            />
          </div>
          <Num
            label={t('Speed')}
            value={s.animation.speed}
            min={0.1}
            max={5}
            hint="×"
            onChange={(v) => edit('speed', (x) => void (x.animation.speed = v), 'speed')}
          />
          <Num
            label={t('Clock BPM')}
            value={s.animation.bpm}
            min={30}
            max={300}
            onChange={(v) => edit('bpm', (x) => void (x.animation.bpm = v), 'bpm')}
          />
          <Field label={t('Reduced motion')}>
            {(id) => (
              <Select
                id={id}
                value={s.animation.reducedMotion}
                options={[
                  { value: 'system', label: t('Follow system') },
                  { value: 'reduce', label: t('Always reduce') },
                  { value: 'allow', label: t('Always animate') },
                ]}
                onChange={(v) => edit('reduced motion', (x) => void (x.animation.reducedMotion = v))}
              />
            )}
          </Field>
        </Section>

        <Section title="Ergonomics defaults">
          <Num
            label={t('Hand clearance (mm)')}
            value={s.ergonomics.handClearanceMm}
            min={0}
            onChange={(v) => edit('hand clearance', (x) => void (x.ergonomics.handClearanceMm = v), 'hand')}
          />
          <Num
            label={t('Holder thickness (mm)')}
            value={s.ergonomics.holderThicknessMm}
            min={0}
            onChange={(v) => edit('holder', (x) => void (x.ergonomics.holderThicknessMm = v), 'holder')}
          />
          <Num
            label={t('View distance (mm)')}
            value={s.ergonomics.viewDistanceMm}
            min={100}
            onChange={(v) => edit('view distance', (x) => void (x.ergonomics.viewDistanceMm = v), 'view')}
          />
          <Num
            label={t('Comfort band ± (mm)')}
            value={s.ergonomics.comfortBandMm}
            min={0}
            onChange={(v) => edit('comfort band', (x) => void (x.ergonomics.comfortBandMm = v), 'band')}
          />
          <Num
            label={t('Acceptable below (mm)')}
            value={s.ergonomics.acceptableLowerMm}
            min={0}
            onChange={(v) => edit('acceptable', (x) => void (x.ergonomics.acceptableLowerMm = v), 'lower')}
          />
          <Field label={t('Default body profile')}>
            {(id) => (
              <Select
                id={id}
                allowEmpty
                value={s.defaultBodyProfileId ?? undefined}
                options={bodies.map((b) => ({ value: b.id, label: b.name }))}
                onChange={(v) => edit('body profile', (x) => void (x.defaultBodyProfileId = v || null))}
              />
            )}
          </Field>
        </Section>

        <Section title="Cables and power">
          <Num
            label={t('Cable slack (%)')}
            value={Math.round(s.cables.slack * 100)}
            min={0}
            max={200}
            onChange={(v) => edit('slack', (x) => void (x.cables.slack = v / 100), 'slack')}
          />
          <Num
            label={t('Service loop per end (mm)')}
            value={s.cables.serviceLoopMm}
            min={0}
            onChange={(v) => edit('loops', (x) => void (x.cables.serviceLoopMm = v), 'loops')}
          />
          <Num
            label={t('Via height (mm)')}
            value={s.cables.viaHeightMm}
            onChange={(v) => edit('via height', (x) => void (x.cables.viaHeightMm = v), 'via')}
          />
          <Field label={t('Mains voltage')}>
            {(id) => (
              <Select
                id={id}
                value={String(s.mainsVoltage) as '115' | '230'}
                options={[
                  { value: '230', label: '230 V' },
                  { value: '115', label: '115 V' },
                ]}
                onChange={(v) => edit('mains', (x) => void (x.mainsVoltage = v === '115' ? 115 : 230))}
              />
            )}
          </Field>
          <Num
            label={t('Autosave interval (s)')}
            value={s.autosaveIntervalS}
            min={1}
            max={600}
            onChange={(v) => edit('autosave', (x) => void (x.autosaveIntervalS = v), 'autosave')}
          />
        </Section>

        <fieldset className="rounded border border-neutral-200 p-3 dark:border-neutral-700">
          <legend className="px-1 text-xs font-semibold text-neutral-500 uppercase">{t('Palette')}</legend>
          <div className="grid grid-cols-3 gap-x-4 gap-y-1">
            {Object.keys(DEFAULT_DOMAIN_PALETTE).map((k) => (
              <label key={k} className="flex items-center justify-between gap-2 text-xs">
                {t(PALETTE_LABELS[k] ?? k)}
                <ColorInput
                  label={t('Colour for {what}', { what: PALETTE_LABELS[k] ?? k })}
                  value={s.palette.domains[k] === DEFAULT_DOMAIN_PALETTE[k] ? undefined : s.palette.domains[k]}
                  fallback={DEFAULT_DOMAIN_PALETTE[k]}
                  onChange={(v) =>
                    edit('palette', (x) => void (x.palette.domains[k] = v ?? DEFAULT_DOMAIN_PALETTE[k]!), `pal:${k}`)
                  }
                />
              </label>
            ))}
          </div>
          <div className="mt-3 text-xs text-neutral-500">{t('MIDI channels')}</div>
          <div className="mt-1 grid grid-cols-8 gap-1">
            {s.palette.midiChannels.map((c, i) => (
              <label key={i} className="flex items-center gap-1 text-xs">
                {i + 1}
                <ColorInput
                  label={t('Colour for MIDI channel {n}', { n: i + 1 })}
                  value={c === DEFAULT_MIDI_CHANNEL_PALETTE[i] ? undefined : c}
                  fallback={DEFAULT_MIDI_CHANNEL_PALETTE[i]}
                  onChange={(v) =>
                    edit(
                      'palette',
                      (x) => void (x.palette.midiChannels[i] = v ?? DEFAULT_MIDI_CHANNEL_PALETTE[i]!),
                      `midi:${i}`,
                    )
                  }
                />
              </label>
            ))}
          </div>
          <div className="mt-2">
            <Button
              onClick={() =>
                edit('reset palette', (x) => {
                  x.palette.domains = { ...DEFAULT_DOMAIN_PALETTE };
                  x.palette.midiChannels = [...DEFAULT_MIDI_CHANNEL_PALETTE];
                })
              }
            >
              {t('Reset palette')}
            </Button>
          </div>
        </fieldset>
      </div>
    </Modal>
  );
}
