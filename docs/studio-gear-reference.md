# Home Studio: Gear Reference (v2)

Compiled 2026-10-04 from manufacturer and retailer spec sheets. This version adds dimensions, power, USB, and clock/sync documentation, and folds in your model confirmations.

**Confirmed by you:** RD-8 **MKII**, MixWizard **WZ3 16:2**, KeyStep **original 32-key**, Pyramid **MK3**, Behringer Composer **MDX2100**, SPL Vitalizer **SX 2**, iPad **Pro M4**, Ultrafex II (EX3100).

**Conventions**
- Dimensions are **W × D × H in mm**, including knobs, jacks and feet where the source says so.
- `⚠` marks an entry resting on an assumption or on conflicting sources.
- **"Not located"** means I searched and did not find a reliable figure; I did not guess. All such gaps are collected in section 7.
- TS = tip-sleeve (unbalanced); TRS = tip-ring-sleeve (balanced or stereo); imp-bal = impedance-balanced.

**Contents:** 1 Connectivity · 2 Dimensions and weight · 3 Power · 4 USB map and bus budget · 5 Clock and sync domains · 6 Planning notes · 7 Open items

---

## 1. Connectivity

### 1.1 Elektron

| # | Device | Main analog out | Aux / other out | Analog in | MIDI DIN (In / Out / Thru) | USB MIDI | USB audio |
|---|---|---|---|---|---|---|---|
| 1 | **Analog Heat MKII** | 2 × ¼" imp-bal (L/R) | 1 × ¼" stereo headphone | 2 × ¼" balanced; 2 × ¼" CV/expression | In / Out / Thru (DIN sync on Out and Thru) | Yes | Yes: 2 in / 2 out class-compliant; Overbridge |
| 2 | **Analog Four MKII** ⚠ | 2 × ¼" imp-bal (L/R) | 4 × ¼" separate voice outputs (Elektron: "separate stereo voice output jacks"; mono vs. stereo-pair wiring to verify); 4 × ¼" CV/Gate out; headphone out (not in retrieved spec) | 2 × ¼" unbalanced ext in; 2 × ¼" CV/expression | In / Out / Thru (DIN sync on Out) | Yes | Yes: class-compliant; Overbridge streams 4 voices, ext in and main to separate DAW tracks |
| 3 | **Digitone II** | 2 × ¼" imp-bal (L/R) | 1 × ¼" stereo headphone | 2 × ¼" balanced | In / Out / Thru (DIN sync on Out) | Yes (USB-B) | Yes: class-compliant; Overbridge multitrack |
| 4 | **Octatrack MKII** | 2 × ¼" imp-bal (main L/R) | 2 × ¼" imp-bal cue out; headphone out (jack size not stated) | 4 × ¼" balanced (two stereo pairs) | In / Out / Thru (no DIN sync listed) | Yes (also file transfer) | No (not listed by Elektron) |

### 1.2 Synths and modular-format units

The Neutron, Pro-800 and 2-XM are the three units mounted together on the separate stand.

| # | Device | Main analog out | Aux / other out | Analog in | MIDI DIN (In / Out / Thru) | USB MIDI | USB audio |
|---|---|---|---|---|---|---|---|
| 5 | **Behringer Neutron** *(stand)* | 1 × ¼" mono | 1 × ¼" headphone (own level knob); 24 × 3.5 mm patch outputs | 1 × ¼" mono ext in; 32 × 3.5 mm patch inputs | In / — / Thru (soft thru) | Yes (USB-B) | No |
| 6 | **Behringer Pro-800** *(stand)* | 1 × ¼" TS unbalanced (+5 dBu) | 1 × ⅛" TS "audio out" (+20 dBu); 1 × 3.5 mm stereo headphone | 3.5 mm sync in; 3.5 mm filter CV in; ¼" footswitch in | In / Out-Thru (2 × 5-pin DIN total; sources differ on labelling) | Yes (class-compliant USB-B) | No |
| 7 | **Behringer 2-XM** *(stand)* ⚠ | 2 × ¼" (rear, L/R; TS vs. TRS differs by source) + 1 × 3.5 mm TRS stereo (top panel) | Patch field: 32 × 3.5 mm points (16 in / 16 out) for CV, gate and per-stage audio | 2 × external audio in (patch field) | In / — / Thru | Yes (class-compliant USB-B) | ⚠ Disputed: Sweetwater says audio + MIDI, Thomann lists no digital output |
| 8 | **Clavia Nord Wave 2** | 2 × ¼" TS unbalanced (L/R) | 1 × ¼" headphone; sustain pedal ¼"; control pedal ¼" TRS | 1 × ⅛" monitor in (retailer-listed; absent from Nord's own spec page) | In / Out / — | Yes (USB-B) | No |
| 9 | **Arturia MatrixBrute** | 2 × ¼" line (L/R) | 12 × 3.5 mm CV out; gate out; sync out | 1 × ¼" line/instrument in; 12 × 3.5 mm CV in; gate in; sync in; 2 × expression pedal + sustain pedal | In / Out / Thru | Yes (USB-B) | No |

### 1.3 Drum machines, samplers and groove

| # | Device | Main analog out | Aux / other out | Analog in | MIDI DIN (In / Out / Thru) | USB MIDI | USB audio |
|---|---|---|---|---|---|---|---|
| 10 | **Behringer RD-8 MKII** | 1 × ¼" TRS main (mono) | 11 × ¼" TS individual voice outs; 1 × ¼" TRS phones; 3 × trigger out (+5 V, 1 ms); clock out | Clock in | In / Out / Thru | Yes (class-compliant USB-B; also sync) | No |
| 11 | **Nord Drum 3P** | 2 × ¼" unbalanced (L/R) | 1 × 3.5 mm headphone | 1 × ¼" trigger in (kick pad) | In / Out / — | No USB port listed | No |
| 12 | **Teenage Engineering EP-40 Riddim** | 1 × 3.5 mm stereo line out | Sync out (3.5 mm); built-in speaker | 1 × 3.5 mm stereo line in; built-in mic; sync in (3.5 mm) | **No DIN:** 3.5 mm TRS-A In / Out (adapters needed) | Yes (USB-C: MIDI, sample transfer, power) | No |

### 1.4 Effects and dynamics

| # | Device | Main analog out | Aux / other out | Analog in | MIDI DIN (In / Out / Thru) | USB MIDI | USB audio |
|---|---|---|---|---|---|---|---|
| 13 | **Strymon NightSky** | 2 × ¼" TS low-Z (L/R) | EXP jack (¼" TRS) doubles as MIDI in via Strymon cable | 2 × ¼" TS high-Z (L; mono uses L only) | In / Out / — (Out can be set to pass-through) | Yes (also firmware updates) | No |
| 14 | **Eventide H90** | 4 × ¼" TS (outs 1–4: 2 stereo outs, or dual-path) | 2 × ¼" expression / aux-switch in | 4 × ¼" TS (ins 1–4: 2 stereo, or dual-path) | In / Out-Thru (switchable; 2 × DIN total) | Yes (USB-C: control, updates, MIDI; Bluetooth control on macOS/iPadOS) | No |
| 15 | **dbx 166XL** | 2 × XLR + 2 × ¼" TRS (balanced, parallel) | 2 × ¼" TRS sidechain insert (tip = return, ring = send) | 2 × XLR + 2 × ¼" TRS (balanced, parallel) | — | — | — |
| 16 | **Behringer Composer MDX2100** ⚠ | 2 × XLR + 2 × ¼" TRS (servo-balanced) | Key/sidechain jacks (type not verified on this model) | 2 × XLR + 2 × ¼" TRS (servo-balanced) | — | — | — |
| 17 | **SPL Vitalizer SX 2** ⚠ | XLR (confirmed by owner review; ¼" jacks not confirmed) | — | XLR (as left) | — | — | — |
| 18 | **Behringer Ultrafex II (EX3100)** | 2 × XLR + 2 × ¼" TRS (servo-balanced) | — | 2 × XLR + 2 × ¼" TRS (servo-balanced) | — | — | — |

### 1.5 Mixers, interfaces and routing

| # | Device | Main analog out | Aux / other out | Analog in | MIDI DIN (In / Out / Thru) | USB MIDI | USB audio |
|---|---|---|---|---|---|---|---|
| 19 | **SSL 12** | 4 × ¼" TRS balanced line outs (DC-coupled, usable for CV) | 2 × ¼" headphone (each re-assignable as a mono line out, giving 8 total outs); no ADAT out | 4 × XLR/¼" combo mic/line; 2 × ¼" Hi-Z instrument (inputs 1–2); 8 × ADAT optical in; talkback mic | In / Out / — (exposed to the host over USB) | Yes | **Yes:** 12 in / 8 out, loopback, up to 192 kHz (USB-C, USB 2.0 protocol) |
| 20 | **TE EP-136 K.O. Sidekick** | 1 × 3.5 mm stereo main out | 1 × 3.5 mm stereo cue out | 2 × 3.5 mm stereo channel in; 1 × 3.5 mm stereo aux in | — | Yes (bidirectional) | **Yes:** 8 in / 4 out, class-compliant (USB-C) |
| 21 | **Allen & Heath MixWizard WZ3 16:2** | 3 × XLR (L, R, mono master); 2 × ¼" TRS A/B out | 6 × ¼" TRS aux sends; 16 direct outs; channel + main L/R inserts; headphone and local monitor outs (front) | 16 × mic/line (XLR and ¼" TRS per channel); 2 × stereo returns (¼" TRS) | MIDI for FX editor/control (port type not confirmed) | — | — (USB option exists only on the WZ4) |
| 22 | **SPL Grapevine KeyMix 6** | 2 × ¼" TRS balanced (master L/R) | Monitor/phones L/R (¼"; headphones go in the right jack); mic insert ¼" TRS; 2 × main insert ¼" TRS | Ch 1 mic (front, balanced, 48 V); ch 2 mono/mic ¼" TRS; ch 3 mono ¼" TS; ch 4–6 stereo (6 × ¼" TS) | — | — | — |
| 23 | **Behringer Ultragain Digital ADA8200** | 8 × XLR balanced line out (rear) | 1 × ADAT optical out (8 ch, 24-bit, 44.1/48 kHz) | 8 × XLR/¼" TRS/TS combo mic/line (front); 1 × ADAT optical in; word clock in (BNC) | — | — | — (ADAT only) |
| 24 | **Behringer Ultrapatch Pro PX3000** | 48-point balanced patchbay, ¼" TRS; 3 modes per channel (Normal / Half-Normal / Thru) | — | (same jacks, front and rear) | — | — | — |

### 1.6 Controllers, sequencers and MIDI hubs

| # | Device | Main analog out | Aux / other out | Analog in | MIDI DIN (In / Out / Thru) | USB MIDI | USB audio |
|---|---|---|---|---|---|---|---|
| 25 | **Arturia KeyStep (original 32-key)** | — | 3 × 3.5 mm CV outs (pitch, gate, assignable mod/velocity/aftertouch); sync out (3.5 mm) | Sustain pedal ¼"; sync in (3.5 mm) | In / Out / — | Yes (micro-USB) | No |
| 26 | **Squarp Pyramid MK3** | — | 3.5 mm CV, Env and Gate out; DIN sync on MIDI Out B | CV/Gate in (4 × CV); 2 × pedal | In / **2 × Out (A, B)** / — | Yes (mini-USB; also power) | No |
| 27 | **iConnectivity mioXL** | — | — | — | **8 In / 12 Out** / — (merging done in software) | Yes: 10 × USB-A host ports; 1 USB to computer; Ethernet RTP-MIDI (22 virtual ports) | No |
| 28 | **cre8audio NiftyCASE** | 1 × ¼" mono master (sums the two 3.5 mm audio inputs) | 2 × CV/Gate out, mod out, clock out (3.5 mm) | 2 × 3.5 mm audio in | In / — / Thru | Yes (USB-B, MIDI input only) | No |
| 29 | **iPad Pro M4** | None (no headphone jack; analog needs a USB-C adapter or interface) | USB-C (Thunderbolt/USB 4) | None | — (Bluetooth LE MIDI, plus USB MIDI via USB-C) | Yes (class-compliant) | Yes (class-compliant) |

---

## 2. Dimensions and weight

### 2.1 Desktop and table-top units

| # | Device | W × D × H (mm) | Weight | Notes |
|---|---|---|---|---|
| 1 | Elektron Analog Heat MKII | 215 × 184 × 63 | 1.5 kg | Max operating temp 36 °C |
| 2 | Elektron Analog Four MKII | 385 × 225 × 82 | 2.4 kg | |
| 3 | Elektron Digitone II | 215 × 176 × 63 | 1.48 kg | 100 × 100 mm VESA mount holes |
| 4 | Elektron Octatrack MKII | 340 × 184–185 × 63 | 2.3 kg | CF-card storage |
| 5 | Behringer Neutron *(stand)* | 424 × 136 × 94 | 2.0 kg (4.4 lb) | 80 HP Eurorack width |
| 6 | Behringer Pro-800 *(stand)* | 424 × 136 × 97 | 1.65 kg | 80 HP Eurorack width |
| 7 | Behringer 2-XM *(stand)* | 424.4 × 135.6 × 94 | Not located | 80 HP Eurorack width |
| 8 | Nord Wave 2 | 990 × 295 × 100 | 8.75 kg | 61-key |
| 9 | Arturia MatrixBrute ⚠ | 860 × 432 × 107 | 23.0 kg (Thomann; may be packed weight) | 49-key |
| 10 | Behringer RD-8 MKII | 498 × 265 × 77 | 3.0 kg | |
| 11 | Nord Drum 3P | 299 × 281 × 48.5 | 1.85 kg | Integrated six-pad surface |
| 12 | TE EP-40 Riddim | Not located | Not located | Battery (4 × AAA) or USB-C |
| 13 | Strymon NightSky | 178 × 114 × 44 (body; ~63 with footswitches) | Not located | Footswitch pedal format |
| 14 | Eventide H90 | 170 × 136 × 68 | 0.84 kg | |
| 20 | TE EP-136 K.O. Sidekick | 240 × 88 × 16 | 0.30 kg | Clips onto EP-series units with pegs |
| 19 | SSL 12 | 286.7 × 154.9 × 58.7 | 1.4 kg | Bus-powered |
| 25 | Arturia KeyStep (original) | Not located | Not located | 32 slim keys |
| 26 | Squarp Pyramid MK3 | Not located (MK1/MK2 front panel 206 × 268) | Not located | |
| 28 | cre8audio NiftyCASE | Not located | Not located | 84 HP usable rail width, 55 mm module depth |
| 29 | iPad Pro M4 | 11": 249.7 × 177.5 × 5.3 · 13": 281.6 × 215.5 × 5.1 | 11": 444 g · 13": 579 g (Wi-Fi) | Apple figures from memory, not re-verified; which size do you have? |

### 2.2 Rack-format units

| # | Device | Rack height | Width | Depth (mm) | Weight | Notes |
|---|---|---|---|---|---|---|
| 15 | dbx 166XL | **1U** | 19" (482.6) | 172 | 2.29 kg | 6.75" depth |
| 16 | Behringer Composer MDX2100 | **1U** | 19" | Not located | Not located | |
| 17 | SPL Vitalizer SX 2 | Not located | 19" | Not located | Not located | Early-to-mid-1990s unit |
| 18 | Behringer Ultrafex II EX3100 | **1U** (retailers; verify) | 19" | Not located | Not located | |
| 22 | SPL Grapevine KeyMix 6 | **1U** | 19" | Not located | Not located | |
| 23 | Behringer Ultragain Digital ADA8200 | **1U** | 19" | Not located | Not located | |
| 24 | Behringer Ultrapatch Pro PX3000 | **1U** (44.5 mm) | 19" (482.6) | 93 | 1.8 kg | Passive |
| 27 | iConnectivity mioXL | **1U** (44.45 mm) | 19" (482.6) | ~145 (sources range 120–170) | ~1.9 kg | |
| 21 | Allen & Heath MixWizard WZ3 16:2 | **10U** (underside connectors) or **11.2U** (rear connectors) | 483 | 122 (under) / 193 (rear) | 10 kg | Rack-mount height 444 / 497 mm. Free-standing: 507 × 530 × 194 mm |

**Rack space:** the seven confirmed or likely 1U units (166XL, MDX2100, Ultrafex II, KeyMix 6, ADA8200, PX3000, mioXL) need **7U**. The SX 2 adds 1U if it is 1U like the other Vitalizers (not verified), which would make **8U**. The MixWizard is a desk unit in your setup, but would need 10U or more if racked.

**Stand footprint:** the Neutron, Pro-800 and 2-XM are each about 424 mm wide × 136 mm deep. Stacked, their heights add to about 285 mm (94 + 97 + 94).

---

## 3. Power

### 3.1 Per-device power

| # | Device | Power input | Rating / draw | Connector / polarity | Notes |
|---|---|---|---|---|---|
| 1 | Analog Heat MKII | External 12 V DC (PSU-3b/3c) | 12 W typical; 12 V 2 A | 5.5 × 2.5 mm, **center-positive** | |
| 2 | Analog Four MKII | External 12 V DC (PSU-3c) | 15 W typical, 20 W max; 12 V 2 A | 5.5 × 2.5 mm, center-positive | |
| 3 | Digitone II | External 12 V DC (PSU-3c) | ~1 A at 12 V (≈12 W) | 5.5 × 2.5 mm, center-positive | |
| 4 | Octatrack MKII | External 12 V DC (PSU-3c) | 7 W typical; 12 V 2 A | 5.5 × 2.5 mm, center-positive | |
| 5 | Neutron | External 12 V DC (included) | Not located | Center-positive (one source; plug size not located) | |
| 6 | Pro-800 | External 12 V DC (included) | 12 V 1.2 A | Not located | |
| 7 | 2-XM | External adapter (included) | Not located | Not located | |
| 8 | Nord Wave 2 | Not located | Not located | Not located | |
| 9 | MatrixBrute | Internal PSU, IEC | 45 W; 100–240 V, 50/60 Hz | IEC | |
| 10 | RD-8 MKII | External 18 V DC | 15 W typical; 18 V 1 A | Not located | **18 V, not 12 V** |
| 11 | Nord Drum 3P | External adapter (included) | Not located | Not located | |
| 12 | EP-40 Riddim | USB-C or 4 × AAA | Not located | USB-C | |
| 13 | NightSky | External 9 V DC (included) | ≥300 mA; **maximum 9 V** | 2.1 × 5.5 mm, **center-negative** | **Opposite polarity to Elektron/Eventide** |
| 14 | H90 | External 12 V DC (included) | 12 V 1 A supplied; accepts 9–12 V. Eventide: 600 mA at 12 V, 800 mA at 9 V, plus a startup spike | 5.5 × 2.5 mm, **center-positive** | |
| 15 | dbx 166XL | Internal PSU, IEC | 15 W max; **100–120 V 60 Hz or 230 V 50 Hz depending on the unit** | IEC | Check the rear-panel rating |
| 16 | MDX2100 | Internal transformer | Not located | IEC | US units are often fixed at 115 V; some are switchable 100/240 V. **Check before plugging into German mains** |
| 17 | SPL Vitalizer SX 2 | Internal ring transformer | Not located | IEC (likely) | Voltage selector unconfirmed on this early model. **Check before plugging in** |
| 18 | Ultrafex II | Internal PSU | Not located | Not located | |
| 19 | SSL 12 | USB bus power | Via USB 3.0 port | USB-C | No external PSU; power switch on the unit |
| 20 | Sidekick | USB-C or 2 × AAA | Not located | USB-C | |
| 21 | MixWizard WZ3 16:2 | Internal PSU, IEC | 45 W max; 100–240 V auto-sensing; T630 mA fuse | IEC | Input for the optional MPS12 backup PSU |
| 22 | KeyMix 6 | Internal PSU, IEC | Not located; fuse rating conflicts (63 mA vs. 125 mA across SPL documents) | IEC; ground-lift switch | |
| 23 | ADA8200 | Internal PSU, IEC | Not located | IEC | |
| 24 | PX3000 | None | Passive | — | |
| 25 | KeyStep | USB bus power or optional 9 V DC adapter | Not located | DC jack | |
| 26 | Pyramid MK3 | Mini-USB bus power | Not located | Mini-USB | |
| 27 | mioXL | External 12 V DC, 36 W (3 A) | 36 W supply | Interchangeable-blade wall adapter | Plug size not located |
| 28 | NiftyCASE | External PSU (included) → Eurorack bus | +12 V 1.5 A, −12 V 0.5 A, +5 V 0.5 A | | 84 HP usable |
| 29 | iPad Pro M4 | Internal battery; charges via USB-C | n/a | USB-C | |

### 3.2 Budget summary

- **Known draw, mixed typical and rated values:** about **225 W**.
  - DC-adapter units: Heat 12 + Analog Four 15 + Digitone II 12 + Octatrack 7 + RD-8 15 + Pro-800 ≤14.4 + NightSky ≤2.7 + H90 ≤7.2 ≈ 85 W.
  - Mains and large-PSU units: MixWizard 45 + MatrixBrute 45 + 166XL 15 + mioXL 36 = 141 W.
- **Unknown draw (nine units):** Neutron, 2-XM, Nord Wave 2, Nord Drum 3P, KeyMix 6, MDX2100, SX 2, Ultrafex II, ADA8200.
- **Wall-wart count:** at least eight external adapters (4 × Elektron, RD-8, Pro-800, Neutron, 2-XM, NightSky, H90, mioXL, Nord Drum). The rest are IEC or USB.
- **Hazard:** adapters are physically similar but electrically different. A 9 V center-negative NightSky supply, an 18 V RD-8 supply and the 12 V center-positive Elektron/Eventide supplies can all fit each other's sockets. **Label every adapter.** The NightSky cannot take the Elektron or Eventide supplies (wrong polarity and over-voltage), and the RD-8 at 18 V can damage the 12 V units.

---

## 4. USB map and bus budget

### 4.1 USB ports

| # | Device | USB port | Role | Audio? | Power role |
|---|---|---|---|---|---|
| 1 | Analog Heat MKII | USB 2.0 (isolated) | MIDI, Overbridge | Yes (2 in / 2 out) | Data only |
| 2 | Analog Four MKII | USB 2.0 (isolated) | MIDI, Overbridge | Yes | Data only |
| 3 | Digitone II | USB-B 2.0 | MIDI, Overbridge | Yes | Data only |
| 4 | Octatrack MKII | USB 2.0 | MIDI, transfer | No | Data only |
| 5 | Neutron | USB-B | MIDI | No | Data only |
| 6 | Pro-800 | USB-B | MIDI | No | Data only |
| 7 | 2-XM | USB-B | MIDI | ⚠ Disputed | Data only |
| 8 | Nord Wave 2 | USB-B | MIDI | No | Data only |
| 9 | MatrixBrute | USB-B | MIDI | No | Data only |
| 10 | RD-8 MKII | USB-B | MIDI, sync | No | Data only |
| 12 | EP-40 Riddim | USB-C | MIDI, transfer | No | Optional bus power |
| 13 | NightSky | USB (type not located) | MIDI, firmware | No | Data only |
| 14 | H90 | USB-C | MIDI, control, firmware | No | Data only |
| 19 | SSL 12 | USB-C | Audio, MIDI | **Yes** (12/8) | **Bus-powered** (USB 3.0 port) |
| 20 | Sidekick | USB-C | Audio, MIDI | **Yes** (8/4) | Optional bus power |
| 25 | KeyStep | micro-USB | MIDI | No | Bus-powered (optional DC) |
| 26 | Pyramid MK3 | mini-USB | MIDI | No | **Bus-powered** |
| 27 | mioXL | 10 × USB-A host + 1 to computer + Ethernet | MIDI hub | No | External PSU |
| 28 | NiftyCASE | USB-B | MIDI in | No | Data only |
| 29 | iPad Pro M4 | USB-C (Thunderbolt / USB 4) | Host | Yes | Needs a powered hub for several devices |

### 4.2 Bus budget

- **19 USB device ports** exist across the rig, excluding the iPad.
- **Audio-capable devices:** Heat, Analog Four, Digitone II, SSL 12 and Sidekick, five in total. Each shows up as its own audio device. Use macOS aggregate devices or Overbridge routing for multi-device work (Elektron notes Overbridge audio can be aggregated).
- **Bus-powered devices:** SSL 12, Pyramid and KeyStep (Riddim and Sidekick optionally). The SSL 12 is designed for a USB 3.0 port; the USB specification gives about 900 mA at 5 V on USB 3.x ports and 500 mA on USB 2.0. Keep it off an unpowered hub.
- **USB-MIDI devices** (Neutron, Pro-800, 2-XM, Nord Wave 2, MatrixBrute, RD-8, NiftyCASE) can sit on the mioXL's 10 host ports instead of the computer. They are class-compliant, but the mioXL cannot carry audio.
- **Elektron Overhub (7-port USB 3.0)** exists as a purpose-built hub for Overbridge devices.
- **iPad Pro M4:** a single USB-C port, so it needs a powered hub to run several class-compliant devices, and the SSL 12 needs bus power the iPad may not supply (not verified).

---

## 5. Clock and sync domains

### 5.1 Sync formats per device

| # | Device | MIDI clock | DIN sync / analog clock | CV/Gate | Notes |
|---|---|---|---|---|---|
| 1 | Analog Heat MKII | In / out; LFO syncs to MIDI clock | DIN sync out (MIDI Out + Thru) | CV/expression in | |
| 2 | Analog Four MKII | In / out; sequencer MIDI out | DIN sync out | 4 × CV/Gate out | Master-capable |
| 3 | Digitone II | In / out; sequencer MIDI out | DIN sync out | — | |
| 4 | Octatrack MKII | In / out; 8 MIDI tracks | No DIN sync listed | — | |
| 5 | Neutron | LFO syncs to MIDI clock | — | 56 patch points | Follower |
| 6 | Pro-800 | MIDI clock for arp/sequencer | 3.5 mm sync in (format not located) | Filter CV in | |
| 7 | 2-XM | — | — | 16 CV in / 16 out | No clock jacks |
| 8 | Nord Wave 2 | Master clock syncs to incoming MIDI clock | — | — | |
| 9 | MatrixBrute | MIDI clock | Sync in/out: Gate, Clock, 24 ppqn, 48 ppqn | 12 CV in / 12 out | |
| 10 | RD-8 MKII | Sync modes: Internal / MIDI / USB / Clock | Clock in/out (jack type and PPQN not located); 3 trigger outs | — | |
| 11 | Nord Drum 3P | Notes, PC, CC only (no clock documented) | — | — | |
| 12 | EP-40 Riddim | Via TRS-A MIDI and USB | Sync in/out, Pocket-Operator style (dual 8th note); a MIDI cable will not work | — | |
| 13 | NightSky | MIDI clock sync in | — | — | 8-step sequencer |
| 14 | H90 | MIDI clock / tap tempo | — | — | |
| 20 | Sidekick | Via USB MIDI | — | — | Beat-match per channel |
| 25 | KeyStep | Sources: internal, USB, MIDI or sync in | Sync in/out: 1 pulse/step, 2 PPQ (Volca), 24 PPQ DIN, 48 PPQ DIN | Pitch, gate, mod CV out | Clock converter |
| 26 | Pyramid MK3 | In; outs A and B; USB | DIN sync on MIDI Out B (Sync24/Sync48 etc.); can convert incoming MIDI clock to DIN sync | CV/Gate/Env out; CV/Gate in | Master-capable |
| 27 | mioXL | Routes, filters and merges | — | — | 8 in × 12 out hub |
| 28 | NiftyCASE | Converts MIDI clock to 1/8-note triggers | Clock out (3.5 mm) | 2 × CV/Gate, mod out | |
| 29 | iPad Pro M4 | Over USB / Bluetooth LE via apps | — | — | |

### 5.2 Digital audio clock

| Link | Clock facts |
|---|---|
| **ADA8200 → SSL 12 (ADAT)** | The ADA8200 offers sync from internal (44.1/48 kHz), ADAT input or word clock input. It runs ADAT at 44.1/48 kHz. The SSL 12 has ADAT **input** only (8 ch), so the ADA8200 feeds the SSL 12 but **cannot receive audio back** from it. Its eight line outputs would stay unused in this chain. |
| **USB audio devices** | Heat, Analog Four, Digitone II, SSL 12 and Sidekick each present as separate audio devices with their own clocks. |

### 5.3 Planning notes

- **Candidate clock masters:** the Pyramid (two DIN MIDI outs, USB MIDI, DIN sync, CV/Gate/Env) and the Analog Four (DIN sync out, four CV/Gate outs). This is my suggestion, not a spec.
- **Analog pulse devices:** the Riddim speaks Pocket-Operator sync, which a DIN sync or MIDI source cannot drive directly. The KeyStep can convert clock formats (1 pulse/step, 2 PPQ, 24 PPQ, 48 PPQ).
- **Fan-out:** the mioXL's 12 DIN outs distribute MIDI clock. It has no Thru, so fan-out is by routing.
- **No MIDI Out:** the Neutron, Pro-800, 2-XM, NiftyCASE and Nord Drum 3P receive clock but cannot pass it on.

---

## 6. Planning notes

- **Mains voltage:** check the MDX2100, SX 2, 166XL and any mains-powered import for 230 V compatibility before powering up. US-market units can be fixed at 115 V.
- **Adapter polarity:** see section 3.2. The NightSky uses a 9 V center-negative supply; the Elektron units and H90 use 12 V center-positive 5.5 × 2.5 mm.
- **Output counts:** the RD-8 MKII has 11 individual outs and the Analog Four has 4 voice outs. Their usable count depends on the SSL 12's 8 outs and the ADA8200's input-only role.
- **KeyMix 6 and Vitalizer:** the KeyMix 6 master inserts are intended for processors such as a Vitalizer (SPL's datasheet names one).
- **Total desk footprint** is not computed here because you haven't given me a layout.

---

## 7. Open items

1. **Dimensions not located:** EP-40 Riddim, KeyStep, Pyramid MK3, NiftyCASE exterior, all rack depths except 166XL / PX3000 / mioXL, SX 2 height, 2-XM weight.
2. **Power not located:** Neutron current, 2-XM, Nord Wave 2, Nord Drum 3P, KeyMix 6, MDX2100, SX 2, Ultrafex II, ADA8200, Riddim, Sidekick, KeyStep, Pyramid, mioXL plug size.
3. **Connector gaps:** MDX2100 key jacks, SX 2 ¼" jacks, Analog Four voice outputs (mono vs. stereo), 2-XM rear jack type, NightSky USB port type, WZ3 MIDI port type, H90 and Octatrack headphone jack size.
4. **2-XM USB audio:** disputed between sources.
5. **MatrixBrute weight:** the 23 kg figure may be a packed weight.
6. **iPad Pro M4 size:** 11" or 13"?
7. **The iPad figures** are recalled Apple specs, not re-verified in this pass.
