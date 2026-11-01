// The maps you can play on. Each is built by tools/prep_map.py into public/maps/<id>.json, and
// one with wide set has a wider, simpler map round it too (tools/prep_wide.py, public/maps/<id>-wide.json).
// A test map (hidden) is left out of the menu and has its own page, public/<id>.html, which opens the
// game with ?map=<id>: the menu then offers that map alone.
export interface MapInfo { id: string; name: string; blurb: string; wide?: boolean; hidden?: boolean }

export const MAPS: MapInfo[] = [
  { id: "combe-down", name: "Bath", blurb: "The whole of Bath, from the Royal Crescent and the Abbey to Combe Down's quarry-stone terraces and the Foxhill estate", wide: true },
  { id: "pembury", name: "Hackney", blurb: "A test map outside Bath: a kilometre round the Pembury Tavern, with Hackney Downs and the Pembury Estate", wide: true, hidden: true },
  { id: "bradford-on-avon", name: "Bradford-on-Avon", blurb: "A town reached by train from Bath Spa: the Kennet and Avon, the Town Bridge and the Tithe Barn", wide: true, hidden: true },
  { id: "cape-town", name: "Cape Town", blurb: "The City Bowl under Table Mountain: the Bo-Kaap, the city centre, the V&A Waterfront and the mountain itself", wide: true, hidden: true },
];

/** Games from before there was a choice of map don't say which map they're on: it was this one. */
export const DEFAULT_MAP = "combe-down";

export const mapInfo = (id: string) => MAPS.find((m) => m.id === id);
export const mapName = (id: string) => mapInfo(id)?.name ?? id;
