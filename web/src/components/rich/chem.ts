/**
 * Skeletal structures drawn from SMILES with smiles-drawer, fetched only when a slide contains chemistry.
 * The library builds its SVG with DOM calls and text nodes (never HTML), and bonds behind atom labels are cut out with
 * masks, so a structure sits on any background: slide, option tile, light or dark.
 */
type SD = typeof import('smiles-drawer').default;
let sdP: Promise<SD> | null = null;
const load = () => (sdP ??= import('smiles-drawer').then((m) => m.default).catch((e) => { sdP = null; throw e; }));

const luminance = (rgb: string) => {
  const [r, g, b] = (rgb.match(/[\d.]+/g) ?? ['0', '0', '0']).slice(0, 3).map((v) => Number(v) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** Atom colours readable on light and on dark backgrounds; carbon and bonds use the surrounding text colour. */
function theme(ink: string) {
  const dark = luminance(ink) > 0.5; // light text means a dark background
  const c = dark
    ? { O: '#ff8a80', N: '#8ab4ff', S: '#ffd54f', P: '#ffb74d', F: '#81e6a8', CL: '#5fd3b0', BR: '#ffab76', I: '#d0a6ff', B: '#ffb74d', SI: '#ffb74d', H: '#c5cae0' }
    : { O: '#c62828', N: '#1d4ed8', S: '#8a6100', P: '#b45309', F: '#15803d', CL: '#0f766e', BR: '#b4410a', I: '#7e22ce', B: '#b45309', SI: '#b45309', H: '#4b5068' };
  return { FOREGROUND: ink, BACKGROUND: 'transparent', C: ink, ...c, BACKGROUND_TRANSPARENT: true };
}

const BOND = 30; // drawing units per bond

/**
 * Draws `smiles` into `svg` and returns its size in bond lengths, so the page can give every molecule the same bond
 * length (a lone benzene ring is not blown up to the height of a larger molecule). Rejects when the SMILES cannot be read.
 */
export async function drawMolecule(svg: SVGSVGElement, smiles: string): Promise<{ w: number; h: number }> {
  const SmilesDrawer = await load();
  const ink = getComputedStyle(svg).color || 'rgb(20,24,40)';
  return new Promise<{ w: number; h: number }>((resolve, reject) => {
    SmilesDrawer.parse(
      smiles,
      (tree) => {
        try {
          while (svg.firstChild) svg.removeChild(svg.firstChild);
          const drawer = new SmilesDrawer.SvgDrawer({ themes: { ci: theme(ink) }, bondLength: BOND, bondThickness: 2.2, fontSizeLarge: 12, fontSizeSmall: 8, padding: 3, compactDrawing: false });
          drawer.draw(tree, svg, 'ci');
          // the drawer sizes the element in px; the page sizes it in em instead, keeping the viewBox's proportions
          svg.style.width = '';
          svg.style.height = '';
          const [, , w, h] = (svg.getAttribute('viewBox') ?? '0 0 30 30').split(/\s+/).map(Number);
          resolve({ w: w / BOND, h: h / BOND });
        } catch (e) {
          reject(e);
        }
      },
      () => reject(new Error('not a valid SMILES string')),
    );
  });
}
