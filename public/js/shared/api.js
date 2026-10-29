/**
 * MONDO Frontend API Client
 */

export async function loadPublicContent() {
  const res = await fetch('/api/v1/load');
  if (!res.ok) throw new Error('Failed to load content.');
  return await res.json();
}

export function track(type, slug = '') {
  try {
    fetch('/api/v1/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, slug }),
      keepalive: true
    }).catch(() => {});
  } catch {}
}

export async function submitEnquiry(payload) {
  const res = await fetch('/api/v1/enquiries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'We couldn’t save your brief. Please try again.');
  }
  return data;
}

export async function adminLogin(username, password) {
  const res = await fetch('/api/v1/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Login failed.');
  }
  return data;
}

export async function checkSession() {
  const res = await fetch('/api/v1/session');
  if (!res.ok) return { authenticated: false };
  return await res.json();
}

export async function adminLogout() {
  const res = await fetch('/api/v1/logout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  return await res.json();
}

export async function saveProject(project) {
  const res = await fetch('/api/v1/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'project', data: project })
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Could not save the project.');
  }
  return data;
}

export async function saveSettings(settings) {
  const res = await fetch('/api/v1/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'settings', data: settings })
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Could not save settings.');
  }
  return data;
}

export async function updateEnquiryStatus(id, status) {
  const res = await fetch('/api/v1/enquiries', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, status })
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Could not update enquiry status.');
  }
  return data;
}

export async function deleteEnquiry(id) {
  const res = await fetch('/api/v1/enquiries', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id })
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Could not delete enquiry.');
  }
  return data;
}

export async function uploadMedia(file) {
  const formData = new FormData();
  formData.set('file', file);
  const res = await fetch('/api/v1/upload', {
    method: 'POST',
    body: formData
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Upload failed.');
  }
  return data;
}
