# ADR 0002: Gear category is free text, not a fixed list

- Status: accepted
- Date: 2026-10-04

## Context
Spec §4.2 defines `GearCategory` as a closed union ('synth' … 'monitor-speaker' … 'other'). The owner wants monitors, headphones, monitor controllers and any other peripheral to be fully user-defined. A category should be a helpful label, not a fixed taxonomy built into the app. A closed list also invites behaviour to hang off categories (e.g. "power supplies are category power"), which breaks as soon as a user files a supply under something else.

## Decision
- `GearModel.category` is any non-empty string. `SUGGESTED_GEAR_CATEGORIES` (the spec's list plus monitor-controller, subwoofer, headphone-amp, power-strip and rack-accessory) only feeds the UI suggestions, together with every category already used in the project.
- No logic branches on category. Behaviour derives from data:
  - power supplies: any power output with a `psu` rating (`isPowerSupply`);
  - mains distribution: `power.distribution`;
  - rack fitting: `dimensions.rack` and `formFactor: 'rack'`;
  - terminal destinations for "Where does it end?" (§5.10): inputs with no onward internal path, not "category = monitor-speaker".
- `formFactor` stays an enum: it describes physical mounting (rack, eurorack, keyboard) that geometry depends on.

## Consequences
- Users can create "my nearfields", "IEM" or "Bluetooth speakers" freely. Filters and inventory grouping use whatever they typed.
- The JSON Schema publishes `category` as a string. Old files stay valid.
- Rule authors (M6+) must not use category; reviews should reject that.
