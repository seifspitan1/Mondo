import os

os.makedirs('public/assets', exist_ok=True)

# -----------------------------------------------------------------------------
# 1. Primary Button Left Facet Module (32x52)
# -----------------------------------------------------------------------------
left_svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 52" fill="none" aria-hidden="true">
  <!-- Outer bracket facet conforming to 45-degree chamfer -->
  <polygon points="12,0 0,12 0,40 12,52 24,52 16,42 6,26 16,10 24,0" fill="#F5F7FA" />
  <!-- Inner chevron facet separated by negative joint -->
  <polygon points="10,26 22,14 28,19 19,26 28,33 22,38" fill="#F5F7FA" />
</svg>"""

# -----------------------------------------------------------------------------
# 2. Primary Button Right Facet Module (32x52, mirrored)
# -----------------------------------------------------------------------------
right_svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 52" fill="none" aria-hidden="true">
  <!-- Outer bracket facet conforming to 45-degree chamfer -->
  <polygon points="20,0 32,12 32,40 20,52 8,52 16,42 26,26 16,10 8,0" fill="#F5F7FA" />
  <!-- Inner chevron facet separated by negative joint -->
  <polygon points="22,26 10,14 4,19 13,26 4,33 10,38" fill="#F5F7FA" />
</svg>"""

# -----------------------------------------------------------------------------
# 3. Secondary Button Left Facet Module (32x52)
# -----------------------------------------------------------------------------
sec_svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 52" fill="none" aria-hidden="true">
  <!-- Outer bracket facet conforming to chamfer -->
  <polygon points="12,0 0,12 0,40 12,52 20,52 14,42 6,26 14,10 20,0" fill="#F5F7FA" />
  <!-- Inner chevron facet -->
  <polygon points="10,26 20,16 25,20 17,26 25,32 20,36" fill="#F5F7FA" />
</svg>"""

# -----------------------------------------------------------------------------
# 4. Card Top-Left Cheek Module (44x44)
# Sits in top-left 45-degree chamfer of the portfolio card
# -----------------------------------------------------------------------------
card_tl_svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 44" fill="none" aria-hidden="true">
  <!-- Outer border facet along top and left edge with 45-degree chamfer -->
  <polygon points="0,28 0,16 16,0 28,0 24,5 12,5 5,12 5,24" fill="#F5F7FA" />
  <!-- Cheek triangular facet cluster -->
  <polygon points="16,6 26,6 18,14 12,14" fill="#F5F7FA" />
  <polygon points="6,16 6,26 14,18 14,12" fill="#F5F7FA" />
  <polygon points="16,16 26,26 34,20 22,10" fill="#F5F7FA" />
</svg>"""

# -----------------------------------------------------------------------------
# 5. Card Bottom-Right Jaw Module (44x44)
# Sits in bottom-right 45-degree chamfer of the portfolio card
# -----------------------------------------------------------------------------
card_br_svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 44" fill="none" aria-hidden="true">
  <!-- Outer border facet along bottom and right edge with 45-degree chamfer -->
  <polygon points="44,16 44,28 28,44 16,44 20,39 32,39 39,32 39,20" fill="#F5F7FA" />
  <!-- Jaw tapering facets with negative slit -->
  <polygon points="38,12 28,26 23,23 32,10" fill="#F5F7FA" />
  <polygon points="26,28 12,38 10,32 23,23" fill="#F5F7FA" />
</svg>"""

# -----------------------------------------------------------------------------
# 6. Input Leading-Edge Jaw Module (24x36)
# Sits at the leading edge of inputs with crisp tapering polygon planes
# -----------------------------------------------------------------------------
inp_lead_svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" fill="none" aria-hidden="true">
  <!-- Upper tapering facet -->
  <polygon points="2,2 18,2 22,12 7,16 2,10" fill="#F5F7FA" />
  <!-- Lower tapering facet with diagonal negative slit -->
  <polygon points="6,20 21,17 14,34 2,34 2,24" fill="#F5F7FA" />
</svg>"""

with open('public/assets/facet-button-left.svg', 'w') as f:
    f.write(left_svg)
with open('public/assets/facet-button-right.svg', 'w') as f:
    f.write(right_svg)
with open('public/assets/facet-button-sec.svg', 'w') as f:
    f.write(sec_svg)
with open('public/assets/facet-card-topleft.svg', 'w') as f:
    f.write(card_tl_svg)
with open('public/assets/facet-card-bottomright.svg', 'w') as f:
    f.write(card_br_svg)
with open('public/assets/facet-input-lead.svg', 'w') as f:
    f.write(inp_lead_svg)

print('All facet SVGs generated cleanly.')
