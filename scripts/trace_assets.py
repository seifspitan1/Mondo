import cv2
import numpy as np
import os

os.makedirs('public/assets', exist_ok=True)

# -----------------------------------------------------------------------------
# 1. Trace MONDO Wordmark
# -----------------------------------------------------------------------------
def trace_wordmark():
    img_path = r'C:\Users\seife\.gemini\antigravity-ide\brain\85f62067-0265-4a02-b654-62944bb284ee\ref_wordmark_clean.png'
    img = cv2.imread(img_path, cv2.IMREAD_GRAYSCALE)
    _, thresh = cv2.threshold(img, 105, 255, cv2.THRESH_BINARY)
    contours, hier = cv2.findContours(thresh, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)

    all_pts = []
    for c in contours:
        if cv2.contourArea(c) > 30:
            all_pts.append(c.reshape(-1, 2))
    all_pts = np.vstack(all_pts)
    min_x, min_y = all_pts.min(axis=0)
    max_x, max_y = all_pts.max(axis=0)

    width = int(max_x - min_x + 6)
    height = int(max_y - min_y + 6)

    svg_paths = []
    for i, c in enumerate(contours):
        area = cv2.contourArea(c)
        if area > 35:
            peri = cv2.arcLength(c, True)
            approx = cv2.approxPolyDP(c, 0.007 * peri, True)
            pts = approx.reshape(-1, 2)
            d = f"M {pts[0][0] - min_x + 3},{pts[0][1] - min_y + 3} " + " ".join([f"L {p[0] - min_x + 3},{p[1] - min_y + 3}" for p in pts[1:]]) + " Z"
            svg_paths.append(d)

    combined_d = " ".join(svg_paths)
    svg_content = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" fill="none" role="img" aria-label="MONDO">
  <path fill-rule="evenodd" clip-rule="evenodd" d="{combined_d}" fill="#F5F7FA" />
</svg>"""

    with open('public/assets/mondo-wordmark.svg', 'w') as f:
        f.write(svg_content)
    print(f"Generated mondo-wordmark.svg: {width}x{height}, {len(svg_paths)} paths")

# -----------------------------------------------------------------------------
# 2. Trace Primary Button Facets (Left and Right)
# -----------------------------------------------------------------------------
def trace_button_facets():
    img_path = r'C:\Users\seife\.gemini\antigravity-ide\brain\85f62067-0265-4a02-b654-62944bb284ee\ref_btn_pri.png'
    img = cv2.imread(img_path, cv2.IMREAD_GRAYSCALE)
    _, thresh = cv2.threshold(img, 110, 255, cv2.THRESH_BINARY)
    
    # Left cluster is roughly x: 8 to 40, y: 15 to 55
    # Let's crop the left cluster:
    left_cluster = thresh[15:55, 8:40]
    c_left, _ = cv2.findContours(left_cluster, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
    
    # Build left facet SVG
    left_paths = []
    for c in c_left:
        area = cv2.contourArea(c)
        if area > 10:
            peri = cv2.arcLength(c, True)
            approx = cv2.approxPolyDP(c, 0.015 * peri, True)
            pts = approx.reshape(-1, 2)
            d = f"M {pts[0][0]},{pts[0][1]} " + " ".join([f"L {p[0]},{p[1]}" for p in pts[1:]]) + " Z"
            left_paths.append(d)
            
    lh, lw = left_cluster.shape
    svg_left = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {lw} {lh}" fill="none" aria-hidden="true">
  <path fill-rule="evenodd" d="{' '.join(left_paths)}" fill="#F5F7FA" />
</svg>"""
    with open('public/assets/facet-button-left.svg', 'w') as f:
        f.write(svg_left)
    print(f"Generated facet-button-left.svg: {lw}x{lh}")

    # Right cluster is roughly x: 175 to 208, y: 15 to 55
    right_cluster = thresh[15:55, 175:208]
    c_right, _ = cv2.findContours(right_cluster, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
    right_paths = []
    for c in c_right:
        area = cv2.contourArea(c)
        if area > 10:
            peri = cv2.arcLength(c, True)
            approx = cv2.approxPolyDP(c, 0.015 * peri, True)
            pts = approx.reshape(-1, 2)
            d = f"M {pts[0][0]},{pts[0][1]} " + " ".join([f"L {p[0]},{p[1]}" for p in pts[1:]]) + " Z"
            right_paths.append(d)
            
    rh, rw = right_cluster.shape
    svg_right = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {rw} {rh}" fill="none" aria-hidden="true">
  <path fill-rule="evenodd" d="{' '.join(right_paths)}" fill="#F5F7FA" />
</svg>"""
    with open('public/assets/facet-button-right.svg', 'w') as f:
        f.write(svg_right)
    print(f"Generated facet-button-right.svg: {rw}x{rh}")

# -----------------------------------------------------------------------------
# 3. Trace Secondary Button Facet (Left only)
# -----------------------------------------------------------------------------
def trace_secondary_facet():
    img_path = r'C:\Users\seife\.gemini\antigravity-ide\brain\85f62067-0265-4a02-b654-62944bb284ee\ref_btn_sec.png'
    img = cv2.imread(img_path, cv2.IMREAD_GRAYSCALE)
    _, thresh = cv2.threshold(img, 110, 255, cv2.THRESH_BINARY)
    
    # Left cluster:
    left_cluster = thresh[10:48, 8:38]
    contours, _ = cv2.findContours(left_cluster, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
    paths = []
    for c in contours:
        area = cv2.contourArea(c)
        if area > 10:
            peri = cv2.arcLength(c, True)
            approx = cv2.approxPolyDP(c, 0.015 * peri, True)
            pts = approx.reshape(-1, 2)
            d = f"M {pts[0][0]},{pts[0][1]} " + " ".join([f"L {p[0]},{p[1]}" for p in pts[1:]]) + " Z"
            paths.append(d)
    h, w = left_cluster.shape
    svg_sec = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" fill="none" aria-hidden="true">
  <path fill-rule="evenodd" d="{' '.join(paths)}" fill="#F5F7FA" />
</svg>"""
    with open('public/assets/facet-button-sec.svg', 'w') as f:
        f.write(svg_sec)
    print(f"Generated facet-button-sec.svg: {w}x{h}")

# -----------------------------------------------------------------------------
# 4. Trace Card Corner Facets (Cheek Top-Left and Jaw Bottom-Right)
# -----------------------------------------------------------------------------
def trace_card_facets():
    img_path = r'C:\Users\seife\.gemini\antigravity-ide\brain\85f62067-0265-4a02-b654-62944bb284ee\ref_card_crop.png'
    img = cv2.imread(img_path, cv2.IMREAD_GRAYSCALE)
    _, thresh = cv2.threshold(img, 110, 255, cv2.THRESH_BINARY)
    
    # Top-left cheek module: x: 0 to 45, y: 15 to 60
    tl_cluster = thresh[15:60, 2:45]
    c_tl, _ = cv2.findContours(tl_cluster, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
    tl_paths = []
    for c in c_tl:
        area = cv2.contourArea(c)
        if area > 8:
            peri = cv2.arcLength(c, True)
            approx = cv2.approxPolyDP(c, 0.015 * peri, True)
            pts = approx.reshape(-1, 2)
            d = f"M {pts[0][0]},{pts[0][1]} " + " ".join([f"L {p[0]},{p[1]}" for p in pts[1:]]) + " Z"
            tl_paths.append(d)
    tl_h, tl_w = tl_cluster.shape
    svg_tl = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {tl_w} {tl_h}" fill="none" aria-hidden="true">
  <path fill-rule="evenodd" d="{' '.join(tl_paths)}" fill="#F5F7FA" />
</svg>"""
    with open('public/assets/facet-card-topleft.svg', 'w') as f:
        f.write(svg_tl)
    print(f"Generated facet-card-topleft.svg: {tl_w}x{tl_h}")

    # Bottom-right jaw module: x: 180 to 230, y: 130 to 175
    h_total, w_total = thresh.shape
    br_cluster = thresh[h_total - 48:h_total, w_total - 40:w_total]
    c_br, _ = cv2.findContours(br_cluster, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
    br_paths = []
    for c in c_br:
        area = cv2.contourArea(c)
        if area > 8:
            peri = cv2.arcLength(c, True)
            approx = cv2.approxPolyDP(c, 0.015 * peri, True)
            pts = approx.reshape(-1, 2)
            d = f"M {pts[0][0]},{pts[0][1]} " + " ".join([f"L {p[0]},{p[1]}" for p in pts[1:]]) + " Z"
            br_paths.append(d)
    br_h, br_w = br_cluster.shape
    svg_br = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {br_w} {br_h}" fill="none" aria-hidden="true">
  <path fill-rule="evenodd" d="{' '.join(br_paths)}" fill="#F5F7FA" />
</svg>"""
    with open('public/assets/facet-card-bottomright.svg', 'w') as f:
        f.write(svg_br)
    print(f"Generated facet-card-bottomright.svg: {br_w}x{br_h}")

# -----------------------------------------------------------------------------
# 5. Trace Input Leading-Edge Facet (Jaw Module)
# -----------------------------------------------------------------------------
def trace_input_facet():
    img_path = r'C:\Users\seife\.gemini\antigravity-ide\brain\85f62067-0265-4a02-b654-62944bb284ee\ref_inp_crop.png'
    img = cv2.imread(img_path, cv2.IMREAD_GRAYSCALE)
    _, thresh = cv2.threshold(img, 110, 255, cv2.THRESH_BINARY)
    
    # Input facet is on the left: x: 0 to 30, y: 20 to 65
    inp_cluster = thresh[20:64, 2:32]
    c_inp, _ = cv2.findContours(inp_cluster, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
    inp_paths = []
    for c in c_inp:
        area = cv2.contourArea(c)
        if area > 10:
            peri = cv2.arcLength(c, True)
            approx = cv2.approxPolyDP(c, 0.015 * peri, True)
            pts = approx.reshape(-1, 2)
            d = f"M {pts[0][0]},{pts[0][1]} " + " ".join([f"L {p[0]},{p[1]}" for p in pts[1:]]) + " Z"
            inp_paths.append(d)
    ih, iw = inp_cluster.shape
    svg_inp = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {iw} {ih}" fill="none" aria-hidden="true">
  <path fill-rule="evenodd" d="{' '.join(inp_paths)}" fill="#F5F7FA" />
</svg>"""
    with open('public/assets/facet-input-lead.svg', 'w') as f:
        f.write(svg_inp)
    print(f"Generated facet-input-lead.svg: {iw}x{ih}")

if __name__ == '__main__':
    trace_wordmark()
    trace_button_facets()
    trace_secondary_facet()
    trace_card_facets()
    trace_input_facet()
