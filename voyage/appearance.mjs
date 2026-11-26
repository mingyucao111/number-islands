function field(id, label, options) {
  const swatches = options[0] instanceof Array ? Object.freeze(options.map(([, color]) => color)) : undefined;
  return Object.freeze({ id, label, options: Object.freeze(swatches ? options.map(([name]) => name) : options), ...(swatches && { swatches }) });
}

const skin = field("skin", "Skin tone", [
  ["Ivory", "#f1c9a8"], ["Peach", "#e6ae8b"], ["Honey", "#cd9168"], ["Sienna", "#b47452"],
  ["Copper", "#9c6148"], ["Umber", "#7e4d3e"], ["Deep bronze", "#674034"], ["Rose", "#d99c82"],
]);
const hairColor = field("hairColor", "Hair colour", [
  ["Midnight", "#292331"], ["Chestnut", "#644030"], ["Honey", "#b68144"], ["Copper", "#b7573e"],
  ["Silver", "#b6c4d6"], ["Sea glass", "#347b78"], ["Plum", "#694968"], ["Snow", "#e4e8f4"],
]);
const eyeColor = field("eyeColor", "Eye colour", [
  ["Cocoa", "#734637"], ["Amber", "#b18140"], ["Hazel", "#8b7748"], ["Olive", "#70804d"],
  ["Pond", "#468d8d"], ["Sky", "#588cc1"], ["Orchid", "#8468a8"], ["Storm", "#565a70"],
]);

export const APPEARANCE_FIELDS = Object.freeze([
  field("face", "Face shape", ["Round", "Oval", "Heart", "Square", "Diamond"]), skin,
  field("hair", "Hairstyle", ["Wind sweep", "Crown knot", "Lantern bob", "Waterfall", "Braids", "Cloud curls", "Snow crest"]), hairColor,
  field("eyes", "Eye shape", ["Round", "Almond", "Relaxed", "Bright", "Soft"]), eyeColor,
  field("brows", "Brows", ["Soft", "Arched", "Bold", "Straight", "Curved"]),
  field("mark", "Cheek mark", ["None", "Freckles", "Star", "Wave", "Leaf", "Frost", "Sun"]),
  field("mouth", "Expression", ["Smile", "Quiet", "Grin", "Wonder"]),
]);

export const SKIN_TONES = skin.swatches;
export const HAIR_COLORS = hairColor.swatches;
export const EYE_COLORS = eyeColor.swatches;

const look = (options) => Object.freeze(Object.fromEntries(APPEARANCE_FIELDS.map(({ id }, index) => [id, options[index]])));
const defaults = Object.freeze({
  gale: look([0, 2, 0, 1, 1, 3, 0, 0, 0]),
  warden: look([3, 6, 1, 0, 2, 1, 2, 6, 1]),
  ember: look([2, 1, 2, 3, 3, 1, 1, 1, 2]),
  tide: look([1, 4, 3, 5, 1, 4, 4, 3, 0]),
  thorn: look([4, 5, 4, 1, 4, 3, 3, 4, 1]),
  echo: look([0, 7, 5, 6, 0, 6, 1, 2, 3]),
  frost: look([1, 0, 6, 7, 4, 5, 3, 5, 0]),
});

const palette = (body, hood, scarf, trim, cloth) => Object.freeze({ body, hood, scarf, trim, cloth });
export const HERO_PALETTES = Object.freeze({
  gale: palette(0x285951, 0x5a9284, 0xcfe8b8, 0xdceda8, 0x538a7c),
  warden: palette(0x695733, 0xaa854a, 0xffd177, 0xffd177, 0x8c713d),
  ember: palette(0x8e403c, 0xc97055, 0xffd6b6, 0xffae81, 0xaa5a52),
  tide: palette(0x285875, 0x5aa9b6, 0xc8f5ec, 0x8de7df, 0x347e97),
  thorn: palette(0x4b633e, 0x7b9544, 0xf1e5a3, 0xcce27b, 0x6e8247),
  echo: palette(0x5c416f, 0x8e6ba4, 0xecd7fa, 0xe1adf1, 0x80528e),
  frost: palette(0x465f8d, 0x8eaada, 0xf1f7ff, 0xcaf1fd, 0x6d8bbd),
});

export function defaultAppearance(id) {
  return { ...(Object.hasOwn(defaults, id) ? defaults[id] : defaults.gale) };
}

export function normalizeAppearance(id, raw) {
  const appearance = defaultAppearance(id);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return appearance;
  for (const { id: fieldId, options } of APPEARANCE_FIELDS) {
    if (!Object.hasOwn(raw, fieldId)) continue;
    const value = raw[fieldId];
    if (Number.isInteger(value) && value >= 0 && value < options.length) appearance[fieldId] = value;
  }
  return appearance;
}
