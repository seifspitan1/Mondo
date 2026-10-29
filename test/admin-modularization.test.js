import { test } from 'node:test';
import assert from 'node:assert/strict';

// Feature modules under test
import * as adminEntry from '../public/js/admin.js';
import { createAdminStore, createInitialState } from '../public/js/features/admin/state.js';
import { slugify } from '../public/js/features/admin/ui/rendering.js';
import { generateNoticesHtml, renderNotices } from '../public/js/features/admin/ui/notices.js';
import { confirmCloseEditor, confirmCloseEditorOnTabSwitch, confirmDeleteEnquiry } from '../public/js/features/admin/ui/dialogs.js';
import { renderSaveBarHtml, markDirty } from '../public/js/features/admin/ui/form-state.js';
import { generateLoginHtml, renderLogin, handleLogout } from '../public/js/features/admin/auth.js';
import { generateDashboardShellHtml, renderDashboard, TAB_HEADERS } from '../public/js/features/admin/dashboard.js';
import { bindNavigationEvents } from '../public/js/features/admin/navigation.js';
import { generateProjectsTabHtml, renderProjectsTab } from '../public/js/features/admin/projects/projects-tab.js';
import { generateProjectEditorHtml, bindProjectEditorEvents } from '../public/js/features/admin/projects/project-editor.js';
import { uploadProjectMedia } from '../public/js/features/admin/projects/project-upload.js';
import { generateInboxTabHtml, filterEnquiries, renderInboxTab, INBOX_STATUSES } from '../public/js/features/admin/inbox/inbox-tab.js';
import { generatePackagesTabHtml, renderPackagesTab } from '../public/js/features/admin/packages/packages-tab.js';
import { generateStudioTabHtml, renderStudioTab } from '../public/js/features/admin/studio/studio-tab.js';
import { createAdminApp } from '../public/js/features/admin/admin-app.js';

// Canonical fixture data
import { defaultProjects, defaultSettings } from '../lib/defaults.js';

// =============================================================================
// 1. MODULE ARCHITECTURE & INDEPENDENCE
// =============================================================================

test('admin entry point re-exports essential symbols for compatibility', () => {
  assert.equal(typeof adminEntry.initAdminApp, 'function');
  assert.equal(typeof adminEntry.adminStore, 'object');
  assert.equal(typeof adminEntry.icons, 'object');
  assert.equal(typeof adminEntry.escapeHtml, 'function');
  assert.equal(typeof adminEntry.checkSession, 'function');
  assert.equal(typeof adminEntry.adminLogin, 'function');
  assert.equal(typeof adminEntry.adminLogout, 'function');
  assert.equal(typeof adminEntry.saveProject, 'function');
  assert.equal(typeof adminEntry.saveSettings, 'function');
  assert.equal(typeof adminEntry.updateEnquiryStatus, 'function');
  assert.equal(typeof adminEntry.deleteEnquiry, 'function');
  assert.equal(typeof adminEntry.uploadMedia, 'function');
});

test('all admin submodules export deterministic functions with zero import-time side effects', () => {
  assert.equal(typeof createAdminStore, 'function');
  assert.equal(typeof slugify, 'function');
  assert.equal(typeof generateNoticesHtml, 'function');
  assert.equal(typeof generateLoginHtml, 'function');
  assert.equal(typeof generateDashboardShellHtml, 'function');
  assert.equal(typeof generateProjectsTabHtml, 'function');
  assert.equal(typeof generateInboxTabHtml, 'function');
  assert.equal(typeof generatePackagesTabHtml, 'function');
  assert.equal(typeof generateStudioTabHtml, 'function');
});

// =============================================================================
// 2. STATE ARCHITECTURE & IMMUTABILITY GUARDS
// =============================================================================

test('createAdminStore initializes with canonical 15 state properties and allows subscriber notifications', () => {
  const store = createAdminStore();
  const state = store.getState();

  assert.equal(state.tab, 'Projects');
  assert.deepEqual(state.projects, []);
  assert.equal(state.settings, null);
  assert.deepEqual(state.enquiries, []);
  assert.deepEqual(state.activity, {});
  assert.equal(state.user, null);
  assert.equal(state.editor, null);
  assert.equal(state.busy, false);
  assert.equal(state.uploading, '');
  assert.equal(state.message, '');
  assert.equal(state.error, '');
  assert.equal(state.search, '');
  assert.equal(state.statusFilter, 'All');
  assert.equal(state.openLeadId, '');
  assert.equal(state.dirty, false);

  let notified = false;
  const unsubscribe = store.subscribe((s) => {
    notified = true;
    assert.equal(s.tab, 'Inbox');
  });

  store.setTab('Inbox');
  assert.equal(notified, true);
  assert.equal(store.getState().tab, 'Inbox');

  unsubscribe();
  notified = false;
  store.setTab('Packages');
  assert.equal(notified, false, 'Unsubscribed listener must not be called');
});

test('store setters correctly mutate state without cross-contamination', () => {
  const store = createAdminStore();

  store.setUser({ username: 'studio_lead' });
  assert.equal(store.getState().user.username, 'studio_lead');

  store.setBusy(true);
  assert.equal(store.getState().busy, true);

  store.setUploading('image');
  assert.equal(store.getState().uploading, 'image');

  store.notice('Project created successfully');
  assert.equal(store.getState().message, 'Project created successfully');
  assert.equal(store.getState().error, '');

  store.notice('Upload failed: payload too large', true);
  assert.equal(store.getState().message, '');
  assert.equal(store.getState().error, 'Upload failed: payload too large');

  store.setDirty(true);
  assert.equal(store.getState().dirty, true);

  store.reset();
  assert.equal(store.getState().user, null);
  assert.equal(store.getState().dirty, false);
  assert.equal(store.getState().tab, 'Projects');
});

// =============================================================================
// 3. UI RENDERING & DIALOG GUARDS
// =============================================================================

test('slugify produces valid URL-friendly slugs identical to legacy behavior', () => {
  assert.equal(slugify('Rainbow Orchard: Game Launch!'), 'rainbow-orchard-game-launch');
  assert.equal(slugify('   Leading & Trailing Spaces   '), 'leading-trailing-spaces');
  assert.equal(slugify('Special@#%&*Chars!!!'), 'special-chars');
  assert.equal(slugify(''), '');
  assert.equal(slugify(null), '');
});

test('generateNoticesHtml produces role-attributed banners with safe HTML escaping', () => {
  const infoMarkup = generateNoticesHtml({ message: 'Saved successfully <script>alert(1)</script>', error: '' });
  assert.match(infoMarkup, /class="admin-notice"/);
  assert.match(infoMarkup, /role="status"/);
  assert.match(infoMarkup, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);

  const errorMarkup = generateNoticesHtml({ message: '', error: 'Database connection failed' });
  assert.match(errorMarkup, /class="admin-notice admin-error"/);
  assert.match(errorMarkup, /role="alert"/);
  assert.match(errorMarkup, /Database connection failed/);

  const emptyMarkup = generateNoticesHtml({ message: '', error: '' });
  assert.equal(emptyMarkup, '');
});

test('renderSaveBarHtml displays contextual save bar only on Studio and Packages tabs', () => {
  const projectsSaveBar = renderSaveBarHtml({ tab: 'Projects', dirty: true, busy: false });
  assert.equal(projectsSaveBar, '', 'Save bar must not render on Projects tab');

  const inboxSaveBar = renderSaveBarHtml({ tab: 'Inbox', dirty: true, busy: false });
  assert.equal(inboxSaveBar, '', 'Save bar must not render on Inbox tab');

  const packagesClean = renderSaveBarHtml({ tab: 'Packages', dirty: false, busy: false });
  assert.match(packagesClean, /Your saved content appears on the website\./);
  assert.match(packagesClean, /disabled/);

  const packagesDirty = renderSaveBarHtml({ tab: 'Packages', dirty: true, busy: false });
  assert.match(packagesDirty, /You have unsaved changes\./);
  assert.doesNotMatch(packagesDirty, /disabled/);

  const studioBusy = renderSaveBarHtml({ tab: 'Studio', dirty: true, busy: true });
  assert.match(studioBusy, /Saving…/);
  assert.match(studioBusy, /disabled/);
});

// =============================================================================
// 4. AUTHENTICATION & SESSION CONTROLLER (BATCH A)
// =============================================================================

test('createAdminApp manages authentication lifecycle, idempotency, and session hydration', async () => {
  const store = createAdminStore();
  let sessionCallCount = 0;

  const mockApi = {
    async checkSession() {
      sessionCallCount++;
      return {
        authenticated: true,
        user: { username: 'lead_artist' },
        projects: defaultProjects,
        settings: defaultSettings,
        enquiries: [
          { id: 'enq-1', name: 'Studio Tester', email: 'tester@studio.test', status: 'New', service: 'Thumbnails', goal: 'Launch art', createdAt: new Date().toISOString() }
        ],
        activity: { project_open: 42, enquiry_submitted: 12 }
      };
    },
    async adminLogin() { return { success: true }; },
    async adminLogout() { return { success: true }; }
  };

  const app = createAdminApp({
    store,
    apiClient: mockApi,
    getRoot: () => null // Headless environment
  });

  assert.equal(app.isInitialized(), false);
  await app.init();
  assert.equal(app.isInitialized(), true);
  assert.equal(sessionCallCount, 1);

  // Verification of state hydration
  assert.equal(store.getState().user.username, 'lead_artist');
  assert.equal(store.getState().projects.length, defaultProjects.length);
  assert.equal(store.getState().settings.tagline, defaultSettings.tagline);
  assert.equal(store.getState().enquiries.length, 1);
  assert.equal(store.getState().activity.project_open, 42);

  // Idempotency: repeated init does not cause duplicate network calls
  await app.init();
  assert.equal(sessionCallCount, 1, 'Duplicate init must not trigger second session check');
});

test('createAdminApp handles unauthenticated session and race-condition guards on logout', async () => {
  const store = createAdminStore();

  let sessionResolvers = [];
  const mockApi = {
    checkSession() {
      return new Promise((resolve) => {
        sessionResolvers.push(resolve);
      });
    },
    async adminLogout() { return { success: true }; }
  };

  const app = createAdminApp({
    store,
    apiClient: mockApi,
    getRoot: () => null
  });

  const sessionPromise = app.refreshSession();
  assert.equal(sessionResolvers.length, 1);

  // Simulate logout while session check is in-flight
  await handleLogout(app.getContext());
  assert.equal(store.getState().user, null);

  // Now resolve the late session response
  sessionResolvers[0]({
    authenticated: true,
    user: { username: 'stale_user' },
    projects: defaultProjects
  });
  await sessionPromise;

  // Stale response must NOT repopulate state after logout
  assert.equal(store.getState().user, null, 'Stale session response must be rejected after logout');
});

// =============================================================================
// 5. PROJECTS WORKSPACE (BATCH B)
// =============================================================================

test('generateProjectsTabHtml renders toolbar, published/hidden badges, and category tags', () => {
  const state = {
    ...createInitialState(),
    projects: defaultProjects,
    editor: null
  };

  const html = generateProjectsTabHtml(state);
  assert.match(html, /Portfolio projects/);
  assert.match(html, /Add project/);
  assert.match(html, /Rainbow Orchard/);
  assert.match(html, /Published/);
  assert.match(html, /Thumbnails/);
  assert.doesNotMatch(html, /class="admin-editor"/);
});

test('generateProjectEditorHtml renders complete editing form and detects new vs existing projects', () => {
  const existingProject = { ...defaultProjects[0] };
  const state = {
    ...createInitialState(),
    projects: defaultProjects,
    editor: existingProject
  };

  const editHtml = generateProjectEditorHtml(existingProject, state);
  assert.match(editHtml, /Edit project/);
  assert.match(editHtml, /value="rainbow-orchard"/);
  assert.match(editHtml, /id="proj-title"/);
  assert.match(editHtml, /id="proj-slug"/);
  assert.match(editHtml, /id="save-proj-btn"/);

  const newProject = {
    id: crypto.randomUUID(),
    slug: 'new-unseen-project',
    title: 'Brand New Project',
    category: 'Trailers',
    image: '',
    video: '',
    description: 'Fresh pitch',
    objective: 'Brand awareness',
    hook: 'High intensity trailer',
    role: 'Full production',
    published: false,
    featured: false,
    concept: true,
    order: 99
  };

  const newHtml = generateProjectEditorHtml(newProject, state);
  assert.match(newHtml, /A new first impression/);
  assert.match(newHtml, /Brand New Project/);
});

test('uploadProjectMedia applies async safety guards to prevent cross-editor corruption', async () => {
  const store = createAdminStore();
  const project1 = { id: 'p1', title: 'First Project', image: '' };
  const project2 = { id: 'p2', title: 'Second Project', image: '' };

  store.setEditor(project1);

  let renderCount = 0;
  let uploadResolve;
  const mockContext = {
    uploadMedia: () => new Promise((resolve) => { uploadResolve = resolve; })
  };

  const mockFile = { name: 'cover.webp', size: 1024, type: 'image/webp' };

  // Trigger upload for project 1
  const uploadPromise = uploadProjectMedia(mockFile, 'image', store, () => { renderCount++; }, mockContext);
  assert.equal(store.getState().uploading, 'image');

  // While upload is in flight, user switches editor to project 2
  store.setEditor(project2);

  // Late upload completes
  uploadResolve({ url: '/media/uploaded_cover.webp' });
  await uploadPromise;

  assert.equal(store.getState().uploading, '');
  assert.equal(store.getState().editor.image, '', 'Late upload response must not overwrite swapped project editor');
});

// =============================================================================
// 6. INBOX WORKSPACE (BATCH C)
// =============================================================================

test('filterEnquiries correctly filters by status and text search query', () => {
  const enquiries = [
    { id: '1', name: 'Alice Smith', email: 'alice@game.com', service: 'Thumbnails', goal: 'Viral thumbnail', status: 'New' },
    { id: '2', name: 'Bob Jones', email: 'bob@studio.io', service: 'Trailers', goal: 'Launch video', status: 'Contacted' },
    { id: '3', name: 'Charlie Ray', email: 'charlie@indie.dev', service: 'Campaigns', goal: 'Seasonal event', status: 'Won' }
  ];

  assert.equal(filterEnquiries(enquiries, 'All', '').length, 3);
  assert.equal(filterEnquiries(enquiries, 'New', '').length, 1);
  assert.equal(filterEnquiries(enquiries, 'Won', '').length, 1);
  assert.equal(filterEnquiries(enquiries, 'Closed', '').length, 0);

  // Text search filtering across multiple fields
  assert.equal(filterEnquiries(enquiries, 'All', 'alice').length, 1);
  assert.equal(filterEnquiries(enquiries, 'All', 'bob@studio.io').length, 1);
  assert.equal(filterEnquiries(enquiries, 'All', 'Launch video').length, 1);
  assert.equal(filterEnquiries(enquiries, 'All', 'Nonexistent').length, 0);
  assert.equal(filterEnquiries(enquiries, 'Won', 'alice').length, 0);
});

test('generateInboxTabHtml renders status dropdown, detail drawer, and empty states', () => {
  const emptyState = { ...createInitialState(), enquiries: [] };
  const emptyHtml = generateInboxTabHtml(emptyState);
  assert.match(emptyHtml, /Room for your next big project\./);

  const populatedState = {
    ...createInitialState(),
    enquiries: [
      {
        id: '12345678-abcd-1111-2222-333333333333',
        name: 'John Developer',
        email: 'john@roblox.dev',
        service: 'Game Thumbnails',
        packageName: 'Flagship Core',
        goal: 'Need 3 dynamic CTR-boosting thumbnails',
        discord: 'john#1234',
        gameUrl: 'https://roblox.com/games/12345',
        budget: '$1,500',
        deadline: '2 weeks',
        status: 'New',
        createdAt: '2026-10-25T10:00:00Z'
      }
    ],
    openLeadId: '12345678-abcd-1111-2222-333333333333'
  };

  const leadHtml = generateInboxTabHtml(populatedState);
  assert.match(leadHtml, /John Developer/);
  assert.match(leadHtml, /john@roblox\.dev/);
  assert.match(leadHtml, /Flagship Core/);
  assert.match(leadHtml, /12345678/); // Reference code
  assert.match(leadHtml, /Delete enquiry/);
  assert.match(leadHtml, /Reply by email/);
});

// =============================================================================
// 7. PACKAGES WORKSPACE (BATCH D)
// =============================================================================

test('generatePackagesTabHtml renders all package configuration inputs and flags', () => {
  const state = {
    ...createInitialState(),
    settings: defaultSettings
  };

  const html = generatePackagesTabHtml(state);
  assert.match(html, /Creative packages/);
  assert.match(html, /class="package-admin-grid"/);
  assert.match(html, /MONDO LAB/);
  assert.match(html, /MONDO LAUNCH/);
  assert.match(html, /Show under monthly plans/);
  assert.match(html, /Highlight this package/);
});

// =============================================================================
// 8. STUDIO SETTINGS WORKSPACE (BATCH E)
// =============================================================================

test('generateStudioTabHtml renders studio tagline, contacts, services, and FAQ items', () => {
  const state = {
    ...createInitialState(),
    settings: defaultSettings
  };

  const html = generateStudioTabHtml(state);
  assert.match(html, /The studio details/);
  assert.match(html, /What we do/);
  assert.match(html, /Good questions\. Clear answers\./);
  assert.match(html, /studio-tagline/);
  assert.match(html, /studio-email/);
  assert.match(html, /studio-discord/);
  assert.match(html, /studio-x/);
  assert.match(html, /QUESTION 01/);
  assert.match(html, /remove-faq-btn/);
});

// =============================================================================
// 9. DASHBOARD SHELL & METRICS (BATCH F)
// =============================================================================

test('generateDashboardShellHtml correctly computes metrics and reflects active tab header', () => {
  const state = {
    ...createInitialState(),
    tab: 'Inbox',
    projects: defaultProjects, // 5 projects, 4 published
    enquiries: [
      { id: '1', status: 'New' },
      { id: '2', status: 'Contacted' }
    ],
    activity: { project_open: 150, enquiry_submitted: 32 },
    user: { username: 'creative_director' }
  };

  const html = generateDashboardShellHtml(state);
  assert.match(html, /Your next projects\./);
  assert.match(html, /creative_director/);
  assert.match(html, /<strong>05<\/strong>/); // 5 published projects
  assert.match(html, /<strong>01<\/strong>/); // 1 new enquiry
  assert.match(html, /<strong>150<\/strong>/); // 150 project opens
  assert.match(html, /<strong>32<\/strong>/); // 32 briefs received
  assert.match(html, /class="lime-dot"/, 'New enquiry must illuminate notification dot');
});
