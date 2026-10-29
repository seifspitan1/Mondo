# MONDO — Game Creative Studio

A fast, responsive, dark-themed studio website for game thumbnails and trailers. Built with vanilla HTML5, Plain CSS3, Vanilla JavaScript ES Modules, Node.js, Express, Vercel Serverless API Functions, and Supabase PostgreSQL & Storage.

---

## 1. Technology Stack

- **Frontend:**
  - Semantic HTML5 pages.
  - Plain CSS3 (no Tailwind, frameworks, or resets).
  - Vanilla JavaScript using ES Modules.
  - Pure SVG icons (replacing React-dependent icons).
  - Medium-ornament monochrome design system with icy-white highlights (`--color-bg: #08090B`, `--color-surface: #121417`, `--color-text: #F5F7FA`, `--color-muted: #A6ADB6`, `--color-ice: #EDF8FF`, `--color-glow: #D9F0FF`).
  - Face-logo-derived connected polygon geometry with negative-space joints on buttons, cards, and input leading edges.
  - Angular display typography with deliberate black seams, legible sans-serif UI typography, and responsive, accessible motion.
- **Backend:**
  - Node.js (v20+) with JavaScript ES Modules (`"type": "module"`).
  - Vercel Serverless Functions in `api/v1/` compatible with Node.js request/response.
  - Express development server in `server.js` adapting the same API endpoints locally.
- **Database & Storage:**
  - Supabase PostgreSQL for persistent data using `mondo_` prefixed tables (`mondo_projects`, `mondo_settings`, `mondo_enquiries`, `mondo_events`, `mondo_rate_limits`).
  - Supabase Storage (`mondo-media` bucket) for uploaded portfolio covers and trailer videos.
  - Privileged backend access using Supabase service-role key (client never receives secrets).
- **Authentication & Security:**
  - Custom admin authentication with JSON Web Tokens (`jsonwebtoken`) and HttpOnly cookies (`cookie`).
  - Secure in production, SameSite=Lax, 7-day token expiration.
  - Login rate limiting and brute-force throttling.
  - Same-origin CSRF verification on state-changing API endpoints.
  - Server-side input validation with Zod (`zod`).
  - Streaming multipart file upload validation with `busboy` (magic numbers/file signatures, size limits).
  - Enquiry retry protection and idempotency via client UUIDs.

---

## 2. Project Structure

```text
mondo-source/
├── public/
│   ├── index.html              # Homepage (Hero, Discipline Bar, Work, Services, Packages, Process, FAQ)
│   ├── work/
│   │   ├── index.html          # Portfolio collection & category filtering
│   │   └── project.html        # Individual project view (rewritten from /work/:slug)
│   ├── start/
│   │   └── index.html          # Project enquiry form with live validation and success state
│   ├── privacy/
│   │   └── index.html          # Privacy notice
│   ├── admin/
│   │   └── index.html          # Studio administration panel & login
│   ├── css/
│   │   └── style.css           # Vanilla CSS styles and responsive layout rules
│   ├── js/
│   │   ├── api.js              # Fetch client wrapper for all API endpoints
│   │   ├── icons.js            # Pure SVG icons generator
│   │   ├── site.js             # Shared navigation, skip-link, and utilities
│   │   ├── home.js             # Homepage interactions (package toggle, work filter, live data)
│   │   ├── work.js             # Portfolio category filtering and dynamic rendering
│   │   ├── project.js          # Individual project loader, trailer tracking, related cards
│   │   ├── start.js            # Enquiry form validation, UUID retry protection, submission
│   │   └── admin.js            # Complete studio admin dashboard (Projects, Inbox, Packages, Studio)
│   ├── assets/                 # Branding artwork and portfolio WebP assets
│   └── favicon.svg             # Website favicon
├── api/
│   └── v1/
│       ├── load.js             # GET: Public content (published projects and studio settings)
│       ├── login.js            # POST: Admin credential verification & HttpOnly cookie issuance
│       ├── session.js          # GET: Admin verification and private dashboard data
│       ├── logout.js           # POST: Admin cookie clearance
│       ├── save.js             # POST/PUT: Admin project and settings persistence
│       ├── upload.js           # POST: Admin multipart media upload with signature validation
│       ├── enquiries.js        # POST (public brief submission), GET/PATCH/DELETE (admin enquiry management)
│       ├── events.js           # POST: Public anonymous activity tracking
│       └── media.js            # GET: Media proxy / redirect for uploaded storage assets
├── lib/
│   ├── auth.js                 # JWT, cookie, credential check, and login throttling
│   ├── content.js              # Projects, settings, enquiries, and events operations
│   ├── defaults.js             # Default projects and settings
│   ├── supabase.js             # Supabase service-role client helper
│   ├── upload.js               # Busboy upload handler with magic number verification
│   └── validation.js           # Zod schemas, same-origin helper, and MIME type rules
├── supabase/
│   ├── schema.sql              # Supabase tables, indexes, RLS policies, and storage bucket
│   └── seed.sql                # Default creative projects and studio settings seed
├── test/
│   ├── verify-mondo.test.js    # Validation, schema, security, and auth unit tests
│   └── api-integration.test.js # Express server and API integration test suite
├── .env.example                # Environment variables template
├── .gitignore                  # Git ignore rules
├── package.json                # Project dependencies and scripts
├── server.js                   # Local Express server
└── vercel.json                 # Vercel deployment and routing configuration
```

---

## 3. Local Development (Windows / PowerShell)

### Prerequisites

- Node.js v20 or later (Node 22 LTS recommended).
- npm (included with Node.js).

### Setup Steps

1. Open PowerShell in the project directory:
   ```powershell
   cd d:\Mondo\MONDO_Source\mondo-source
   ```

2. Install dependencies:
   ```powershell
   npm install
   ```

3. Create your `.env` file from `.env.example`:
   ```powershell
   Copy-Item .env.example .env
   ```

4. Edit `.env` to configure your admin credentials and Supabase credentials:
   ```env
   PORT=3000
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD=choose_a_strong_password_here
   JWT_SECRET=choose_a_random_32_character_secret_key_here
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
   SUPABASE_STORAGE_BUCKET=mondo-media
   ```

5. Run test suite:
   ```powershell
   npm test
   ```

6. Start local development server:
   ```powershell
   npm run dev
   ```

   Open your browser at `http://localhost:3000`.

---

## 4. Supabase Database & Storage Setup

1. Log in to [Supabase](https://supabase.com) and create a new project.
2. Go to the **SQL Editor** in the Supabase Dashboard.
3. Open `supabase/schema.sql`, paste its contents into the SQL Editor, and run it. This creates:
   - `mondo_projects` table and indexes.
   - `mondo_settings` table.
   - `mondo_enquiries` table and indexes.
   - `mondo_events` table and indexes.
   - `mondo_rate_limits` table.
   - Row Level Security (RLS) policies.
   - `mondo-media` public storage bucket.
4. Open `supabase/seed.sql`, paste its contents into the SQL Editor, and run it to seed default projects and packages.
5. In Supabase Dashboard, go to **Project Settings > API**:
   - Copy **Project URL** into `SUPABASE_URL`.
   - Copy **service_role (secret)** into `SUPABASE_SERVICE_ROLE_KEY`.

---

## 5. Studio Administration

1. Open `http://localhost:3000/admin`.
2. Sign in using the `ADMIN_USERNAME` and `ADMIN_PASSWORD` configured in your `.env`.
3. The Studio Workspace includes:
   - **Projects:** Add new projects, edit copy and objectives, upload cover images (up to 12 MB) and trailer videos (up to 80 MB), toggle published status, feature in home hero, and label as concept projects.
   - **Inbox:** Review incoming project briefs, search by text or filter by status (`New`, `Contacted`, `Quoted`, `Won`, `Closed`), update statuses, open email drafts to clients, and delete entries.
   - **Packages:** Edit package titles, subtitles, prices, billing cadence, and included deliverables.
   - **Studio:** Edit tagline, public studio email, Discord link, X/Twitter link, services list, and FAQ items.

---

## 6. GitHub to Vercel Deployment

1. Initialize a git repository and commit the project:
   ```powershell
   git init
   git add .
   git commit -m "Initial MONDO technology migration"
   ```
2. Push your repository to GitHub.
3. In [Vercel](https://vercel.com):
   - Click **Add New... > Project** and import the GitHub repository.
   - Set **Framework Preset** to **Other**.
   - In **Environment Variables**, add:
     - `ADMIN_USERNAME`: your admin username
     - `ADMIN_PASSWORD`: your secure admin password
     - `JWT_SECRET`: 32+ character random secret
     - `SUPABASE_URL`: Supabase project URL
     - `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key
     - `SUPABASE_STORAGE_BUCKET`: `mondo-media`
   - Click **Deploy**.
4. Vercel automatically deploys the frontend static pages, configures rewrites via `vercel.json`, and hosts the serverless API handlers in `api/v1/`.

---

## 7. Available Scripts

| Command | Description |
| --- | --- |
| `npm install` | Installs project dependencies |
| `npm test` | Runs the automated test suite (`verify-mondo.test.js` & `api-integration.test.js`) |
| `npm run dev` | Runs the local Express development server at `http://localhost:3000` |
| `npm start` | Runs the production Node.js server |

---

## 8. MONDO Medium-Ornament Design System Reference

### 8.1 Centralized Tokens

| CSS Variable | Hex / RGBA Value | Purpose |
| --- | --- | --- |
| `--color-bg` | `#08090B` | Main page background (deep calm black) |
| `--color-surface` | `#121417` | Card backgrounds, control panels, enquiry forms |
| `--color-surface-subtle` | `#16191D` | Secondary panels, elevated surfaces, nav headers |
| `--color-surface-elevated`| `#1B1E24` | Toolbars, modals, floating overlays |
| `--color-text` | `#F5F7FA` | Primary reading text, bold headlines, white facets |
| `--color-muted` | `#A6ADB6` | Secondary labels, descriptions, subtitles |
| `--color-ice` | `#EDF8FF` | Interaction highlights, active states, focus rings |
| `--color-glow` | `#D9F0FF` | Restrained low-opacity icy light (`rgba(217, 240, 255, 0.22)`) |
| `--color-border` | `rgba(245, 247, 250, 0.20)` | Quiet default borders (1px) |
| `--color-border-hover` | `rgba(245, 247, 250, 0.55)` | Clearer hover borders |
| `--color-border-focus` | `var(--color-ice)` | High-contrast accessible focus indicator (2px outline) |

- **Spacing scale:** 4, 8, 12, 16, 24, 32, 48, 64, 96 CSS pixels.
- **Main content max width:** 1280px (`.container`).
- **Page gutters:** 48px desktop (`calc(100% - 96px)`), 24px tablet (`calc(100% - 48px)`), 20px mobile (`calc(100% - 40px)`).
- **Corner radius:** 0px for all interface components (buttons, cards, inputs, dialogs).

### 8.2 Typography Implementation

- **Display Typography:** `Space Grotesk` (700/800 weights) with system grotesque fallbacks. Uppercase for brand wordmark, hero headline, section headings, and primary CTA labels. Deliberate logo-inspired angular seams across prominent headlines.
- **Reading & UI Typography:** `Inter` (400 regular, 500 medium, 600 semibold, 700 bold weights) with system sans-serif fallbacks. Kept solid without decorative cuts for maximum legibility in body copy, forms, FAQs, prices, and admin content.
- **Fluid Type Scale:**
  - Hero: fluid `clamp(44px, 6.2vw, 84px)`, line-height 1.04.
  - Section heading: `clamp(32px, 3.8vw, 54px)`, line-height 1.12.
  - Card heading: 24px desktop, 20px mobile, line-height 1.22.
  - Body: 17px desktop, 15px mobile, line-height 1.65.
  - Button text: 16px desktop, 14–15px mobile, uppercase, tracking 0.05em.
  - Navigation & labels: 13–15px, line-height 1.5.
  - Secondary metadata: 11–13px.

### 8.3 Logo-Derived Geometric Facet Modules

The decorative language is derived directly from the original white geometric face logo:
1. **Brow Module (`/assets/facet-button-left.svg`, `/assets/facet-button-right.svg`):**
   - Localized clusters of 3 connected white polygons separated by 2.5px black negative-space joints.
   - Anchored at the left and right ends of Primary Buttons.
2. **Cheek Module (`/assets/facet-card-topleft.svg`):**
   - 3 connected angular white facets forming a corner bracket with negative-space seams.
   - Anchored at the top-left corner of Portfolio Cards (~30–32px extent).
3. **Jaw Module (`/assets/facet-card-bottomright.svg`, `/assets/facet-input-lead.svg`):**
   - Tapering angular white facets separated by a sharp diagonal black slit.
   - Anchored at the bottom-right corner of Portfolio Cards, and at the leading edge of public text inputs (`padding-left: 40px` reserved strip).

### 8.4 Component Anatomy & States

- **Primary Button (`.button`):**
  - Dark interior (`#08090B`), solid white text, 1px thin connecting border.
  - Localized 3-facet modules at left and right ends.
  - Default: quiet outline, no ambient glow.
  - Hover: brighter fine edge (`rgba(245, 247, 250, 0.55)`), tight 12px icy glow (`rgba(217, 240, 255, 0.22)`), -1px translateY.
  - Focus-visible: 2px solid `--color-ice` outline with 3px separation offset.
  - Active: 1px translateY.
- **Secondary Button (`.button-outline`):**
  - Transparent/dark surface, quiet border, smaller 2-facet module at left end only.
- **Portfolio Cards (`.project-card`):**
  - 16:9 media area with dark caption bar below.
  - Opposing corner facets: Cheek module top-left, Jaw module bottom-right; remaining 75% perimeter quiet thin border.
  - Hover: border brightens, subtle image scale (1.025), tight faint shadow.
  - Accessible single-link card.
- **Form Controls (`input`, `textarea`, `select`, `checkbox`):**
  - Zero radius rectangular dark surface (`#08090B`), thin border.
  - Public text inputs include leading-edge jaw facet module with 40px reserved padding.
  - Checkbox is sharp square with crisp white/ice checkmark.
- **Motion & Accessibility:**
  - Transitions 140–180ms ease-out; no endless pulsing, floating shards, or cursor followers.
  - `prefers-reduced-motion` strips all transforms and animation durations.
  - 0 horizontal overflow across all viewports down to 320px.

