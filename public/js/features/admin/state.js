/**
 * MONDO Admin State Store
 * Clean, predictable state container with explicit updater operations.
 */

export function createInitialState() {
  return {
    tab: 'Projects',
    projects: [],
    settings: null,
    enquiries: [],
    activity: {},
    user: null,
    editor: null,
    busy: false,
    uploading: '',
    message: '',
    error: '',
    search: '',
    statusFilter: 'All',
    openLeadId: '',
    dirty: false
  };
}

export function createAdminStore(initialState = {}) {
  let state = {
    ...createInitialState(),
    ...initialState
  };

  const listeners = new Set();

  function notify() {
    for (const listener of listeners) {
      try {
        listener(state);
      } catch (err) {
        console.error('State listener error:', err);
      }
    }
  }

  return {
    getState() {
      return state;
    },

    setState(partial) {
      const next = typeof partial === 'function' ? partial(state) : partial;
      state = { ...state, ...next };
      notify();
      return state;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    setTab(tab) {
      state.tab = tab;
      notify();
    },

    setUser(user) {
      state.user = user;
      notify();
    },

    setProjects(projects) {
      state.projects = Array.isArray(projects) ? projects : [];
      notify();
    },

    setSettings(settings) {
      state.settings = settings;
      notify();
    },

    setEnquiries(enquiries) {
      state.enquiries = Array.isArray(enquiries) ? enquiries : [];
      notify();
    },

    setActivity(activity) {
      state.activity = activity || {};
      notify();
    },

    setEditor(editor) {
      state.editor = editor ? { ...editor } : null;
      notify();
    },

    updateEditor(patch) {
      if (!state.editor) return;
      state.editor = { ...state.editor, ...patch };
      notify();
    },

    setBusy(busy) {
      state.busy = Boolean(busy);
      notify();
    },

    setUploading(uploading) {
      state.uploading = uploading || '';
      notify();
    },

    notice(msg, isErr = false) {
      state.message = isErr ? '' : (msg || '');
      state.error = isErr ? (msg || '') : '';
      notify();
    },

    setSearch(search) {
      state.search = search || '';
      notify();
    },

    setStatusFilter(statusFilter) {
      state.statusFilter = statusFilter || 'All';
      notify();
    },

    setOpenLeadId(openLeadId) {
      state.openLeadId = openLeadId || '';
      notify();
    },

    setDirty(dirty) {
      state.dirty = Boolean(dirty);
      notify();
    },

    reset() {
      state = createInitialState();
      notify();
    }
  };
}

export const adminStore = createAdminStore();
