export type ColorPaletteId = 'aurora' | 'navy-teal' | 'charcoal-violet';

export const COLOR_PALETTE_STORAGE_KEY = 'careerAssistant_color_palette_v1';

export function loadColorPalette(): ColorPaletteId {
  try {
    const v = localStorage.getItem(COLOR_PALETTE_STORAGE_KEY);
    if (v === 'navy-teal' || v === 'charcoal-violet' || v === 'aurora') return v;
  } catch {
    /* ignore */
  }
  return 'aurora';
}

export function saveColorPalette(id: ColorPaletteId): void {
  try {
    localStorage.setItem(COLOR_PALETTE_STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}
