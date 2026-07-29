# Milton Estates production art contract

This contract keeps Chapter 1 assets coherent while the game grows. The supplied aerial and street references guide broad suburban character only; maps remain fictionalized and contain no addresses or traceable parcel details.

## Scale and pixel rules

- **World grid:** 32 x 32 px logical tiles. Curves may use stepped 8 px sub-grid detail.
- **Player:** 32 x 42 px source frame, roughly 1.3 tiles tall. Interaction reach stays 62 px.
- **Houses:** 10-13 tiles wide and 7-9 tiles deep, with attached forms used to differentiate garages, porches, and rooflines.
- **Pixel density:** author detail on a 2 px base unit. Avoid single-pixel noise at the 960 x 540 presentation size.
- **Outlines:** dark desaturated green/brown, 2-3 px on actors and pickup silhouettes; environment edges use contrast rather than universal black outlines.

## Palette and lighting

| Role | Core colors |
| --- | --- |
| Summer lawn | `#78b85f`, `#8dc66b`, `#5c984d` |
| Deep foliage | `#204f39`, `#2e6841`, `#477f47` |
| Dry grass / soil | `#b99a63`, `#8e6f45`, `#624a31` |
| Asphalt / curb | `#505a60`, `#69747a`, `#d6d1ba` |
| Creek | `#2f758f`, `#438fa5`, `#86c4cc` |
| Paper UI | `#f3e7c5`, `#e6d9b7`, `#cdbf98` |
| Ink accents | `#275c73`, `#a34237`, `#50675b` |

- **Lighting direction:** bright afternoon sun from northwest (upper-left).
- **Shadows:** short, cool, semi-transparent shapes cast southeast; trees may use layered canopy shade.
- **Mood:** warm, clear, green Pennsylvania summer. Keep landmarks readable beneath detail.

## Animation convention

- Player movement targets four directional rows with four frames per direction: contact, passing, opposite contact, passing.
- Environmental loops use 3-4 frames at deliberately different cadences so water, grass, and leaves do not pulse together.
- Animation is cosmetic only and never advances quest state.

## Authored-map rules

- Runtime map IDs remain `neighborhood` and `creek`; stable interaction, spawn, transition, item, and quest-region IDs never depend on art.
- Decorative scenery may change per quest through a shallow map variant: palette/light preset plus visible, hidden, and added overlay IDs.
- Readable physical blockers replace apparently open invisible walls.
- Large map labels are prohibited. Use small diegetic signs, recognizable silhouettes, paths, road shapes, and landmarks.
- The three homes must read structurally, not only by siding color: Andrew white and compact; Billy blue with white trim, garage, broad drive; Jeremy baby-blue with red shutters and distinct landscaping.

## Asset status

The original production pass and its temporary-asset decisions are recorded in the [archived checkpoint manifest](archive/production-polish-manifest.md). Generated concept art may guide composition and chapter-cover mood, but gameplay art should remain consistent with this scale and palette.
