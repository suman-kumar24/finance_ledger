import { DARK, LIGHT, type Palette } from '../theme';

/** WCAG relative luminance and contrast ratio. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Every text/background pairing the UI actually uses. Body text needs 4.5:1. */
const PAIRS: [keyof Palette, keyof Palette][] = [
  ['text', 'bg'],
  ['text', 'surface'],
  ['text', 'surfaceAlt'],
  ['textMuted', 'bg'],
  ['textMuted', 'surface'],
  ['textMuted', 'surfaceAlt'],
  ['accent', 'bg'],
  ['accent', 'surface'],
  ['accent', 'accentSoft'],
  ['onAccent', 'accent'],
  ['positive', 'surface'],
  ['positive', 'positiveSoft'],
  ['warning', 'surface'],
  ['warning', 'warningSoft'],
  ['danger', 'surface'],
  ['danger', 'dangerSoft'],
  ['text', 'warningSoft'],
  ['text', 'accentSoft'],
];

describe.each([
  ['light', LIGHT],
  ['dark', DARK],
])('%s theme contrast', (_name, palette) => {
  it.each(PAIRS)('%s on %s is at least 4.5:1', (fg, bg) => {
    expect(contrast(palette[fg] as string, palette[bg] as string)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps non-text graphics (progress fill, borders of controls) visible: 3:1 against the track/surface', () => {
    expect(contrast(palette.accent, palette.track)).toBeGreaterThanOrEqual(3);
    expect(contrast(palette.danger, palette.track)).toBeGreaterThanOrEqual(3);
    expect(contrast(palette.warning, palette.track)).toBeGreaterThanOrEqual(3);
  });
});
