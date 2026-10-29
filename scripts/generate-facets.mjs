import fs from 'node:fs';
import path from 'node:path';

const assetsDir = path.resolve('public/assets');

// -----------------------------------------------------------------------------
// 1. Facet Button Left (Primary Button)
// Height 52, Width 32.
// Connects 3 distinct white polygons with crisp 2.5px black negative seams.
// -----------------------------------------------------------------------------
const facetButtonLeftSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 52" fill="none" aria-hidden="true">
  <!-- Top facet along top-left chamfer -->
  <polygon points="15,2 3,14 3,19 18,19 18,2" fill="#F5F7FA" />
  <!-- Middle chevron facet pointing inward to text -->
  <polygon points="3,22 22,26 3,30 7,26" fill="#F5F7FA" />
  <!-- Bottom facet along bottom-left chamfer -->
  <polygon points="3,33 3,38 15,50 18,50 18,33" fill="#F5F7FA" />
</svg>`;

// -----------------------------------------------------------------------------
// 2. Facet Button Right (Primary Button)
// Mirrored horizontally from left facet.
// -----------------------------------------------------------------------------
const facetButtonRightSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 52" fill="none" aria-hidden="true">
  <!-- Top facet along top-right chamfer -->
  <polygon points="17,2 29,14 29,19 14,19 14,2" fill="#F5F7FA" />
  <!-- Middle chevron facet pointing inward to text -->
  <polygon points="29,22 10,26 29,30 25,26" fill="#F5F7FA" />
  <!-- Bottom facet along bottom-right chamfer -->
  <polygon points="29,33 29,38 17,50 14,50 14,33" fill="#F5F7FA" />
</svg>`;

// -----------------------------------------------------------------------------
// 3. Facet Button Secondary
// Left-only smaller 2-facet cluster.
// -----------------------------------------------------------------------------
const facetButtonSecSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 52" fill="none" aria-hidden="true">
  <!-- Upper angled facet -->
  <polygon points="14,6 4,16 4,23 16,23 16,6" fill="#F5F7FA" />
  <!-- Lower pointing chevron facet -->
  <polygon points="4,26 18,33 4,40 8,33" fill="#F5F7FA" />
</svg>`;

// -----------------------------------------------------------------------------
// 4. Facet Card Top-Left (Cheek Module)
// Size 36x36. Hugs top-left corner of the card.
// 3 connected facets with black negative joints.
// -----------------------------------------------------------------------------
const facetCardTopLeftSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" fill="none" aria-hidden="true">
  <!-- Top facet along top edge -->
  <polygon points="0,0 26,0 20,7 0,7" fill="#F5F7FA" />
  <!-- Middle angled facet -->
  <polygon points="24,10 14,20 8,20 16,10" fill="#F5F7FA" />
  <!-- Left facet along left edge -->
  <polygon points="0,9 7,9 7,26 0,33" fill="#F5F7FA" />
</svg>`;

// -----------------------------------------------------------------------------
// 5. Facet Card Bottom-Right (Jaw Module)
// Size 36x36. Hugs bottom-right corner of the card.
// 3 connected facets with black negative joints.
// -----------------------------------------------------------------------------
const facetCardBottomRightSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" fill="none" aria-hidden="true">
  <!-- Bottom facet along bottom edge -->
  <polygon points="10,36 36,36 36,29 16,29" fill="#F5F7FA" />
  <!-- Middle angled facet -->
  <polygon points="12,26 22,16 28,16 20,26" fill="#F5F7FA" />
  <!-- Right facet along right edge -->
  <polygon points="36,27 29,27 29,10 36,3" fill="#F5F7FA" />
</svg>`;

// -----------------------------------------------------------------------------
// 6. Facet Input Leading (Jaw module paired facets)
// Size 18x28. Vertically centered inside input at left.
// -----------------------------------------------------------------------------
const facetInputLeadSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 28" fill="none" aria-hidden="true">
  <!-- Upper tapering facet -->
  <polygon points="2,2 14,2 16,10 5,12" fill="#F5F7FA" />
  <!-- Lower tapering facet -->
  <polygon points="4,15 15,13 11,26 2,26" fill="#F5F7FA" />
</svg>`;

// -----------------------------------------------------------------------------
// 7. MONDO Brand Wordmark Vector Lettering
// Precise angular display lettering with 7 deliberate cuts as shown on board.
// ViewBox 0 0 240 50.
// -----------------------------------------------------------------------------
const mondoWordmarkSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 50" fill="none" role="img" aria-label="MONDO">
  <!-- M (0 to 48) -->
  <polygon points="2,46 13,46 13,20 2,23" fill="#F5F7FA" />
  <polygon points="2,17 13,14 13,4 2,12" fill="#F5F7FA" />
  <polygon points="17,4 26,24 22,26 16,13" fill="#F5F7FA" />
  <polygon points="26,29 33,46 41,46 30,24" fill="#F5F7FA" />
  <polygon points="35,4 47,13 47,46 36,46 36,15" fill="#F5F7FA" />

  <!-- First O (54 to 96) -->
  <polygon points="69,4 82,4 96,18 96,28 85,28 85,19 78,12 69,12 66,15 62,11" fill="#F5F7FA" />
  <polygon points="54,16 63,16 63,33 70,40 79,40 82,37 86,41 81,46 68,46 54,32" fill="#F5F7FA" />

  <!-- N (102 to 144) -->
  <polygon points="102,4 113,4 113,46 102,46" fill="#F5F7FA" />
  <polygon points="113,4 126,24 120,27 113,15" fill="#F5F7FA" />
  <polygon points="125,29 133,42 133,46 144,46 144,4 133,4 133,36 128,29" fill="#F5F7FA" />

  <!-- D (150 to 192) -->
  <polygon points="150,4 177,4 192,19 192,30 180,30 180,18 171,12 161,12 161,46 150,46" fill="#F5F7FA" />
  <polygon points="163,46 177,46 192,34 186,29 177,37 165,37 163,41" fill="#F5F7FA" />

  <!-- Second O (198 to 240) -->
  <polygon points="213,4 226,4 240,18 240,28 229,28 229,19 222,12 213,12 210,15 206,11" fill="#F5F7FA" />
  <polygon points="198,16 207,16 207,33 214,40 223,40 226,37 230,41 225,46 212,46 198,32" fill="#F5F7FA" />
</svg>`;

// -----------------------------------------------------------------------------
// 8. Favicon SVG: Update from legacy lime to #F5F7FA
// -----------------------------------------------------------------------------
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="0" fill="#08090B"/><path d="M12 46V18h8l12 15 12-15h8v28h-9V32L32 45 21 32v14z" fill="#F5F7FA"/></svg>`;

fs.writeFileSync(path.join(assetsDir, 'facet-button-left.svg'), facetButtonLeftSvg);
fs.writeFileSync(path.join(assetsDir, 'facet-button-right.svg'), facetButtonRightSvg);
fs.writeFileSync(path.join(assetsDir, 'facet-button-sec.svg'), facetButtonSecSvg);
fs.writeFileSync(path.join(assetsDir, 'facet-card-topleft.svg'), facetCardTopLeftSvg);
fs.writeFileSync(path.join(assetsDir, 'facet-card-bottomright.svg'), facetCardBottomRightSvg);
fs.writeFileSync(path.join(assetsDir, 'facet-input-lead.svg'), facetInputLeadSvg);
fs.writeFileSync(path.join(assetsDir, 'mondo-wordmark.svg'), mondoWordmarkSvg);
fs.writeFileSync(path.join('public', 'favicon.svg'), faviconSvg);

console.log('SVGs regenerated successfully.');
