// Placeholder mains distribution for the sample studio (not part of the gear reference): replace with your own.
import { instantiateGearTemplate } from '../../src/domain/templates.ts';
import type { GearModel } from '../../src/domain/types.ts';
import { templates } from './catalog.ts';
import { p } from './helpers.ts';

function fromTemplate(tplId: string, id: string, name: string, outlets: number): GearModel {
  const tpl = templates.find((t) => t.id === tplId);
  if (!tpl) throw new Error(`missing template ${tplId}`);
  const m = instantiateGearTemplate(tpl, { outlets, u: 1 }, id);
  m.manufacturer = 'Generic';
  m.name = name;
  m.tags = [...m.tags, 'placeholder'];
  m.notes = 'Placeholder, not from the gear reference: replace with your own strip and its real rating.';
  m.provenance['power.distribution'] = p('estimated', 'Typical 230 V / 16 A Schuko strip rating; check the label.');
  delete m.createdFromTemplateId;
  return m;
}

export const powerDistributionModels = [
  fromTemplate('tpl-power-strip', 'gear-generic-power-strip-8', 'Power strip 8×', 8),
  fromTemplate('tpl-rack-pdu', 'gear-generic-rack-pdu-8', 'Rack power distributor 1U 8×', 8),
];
