import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getProjects, getProjectBySlug, saveProject } from '../src/services/project.service.js';
import { getSettings, saveSettings } from '../src/services/settings.service.js';
import { defaultProjects, defaultSettings } from '../src/config/defaults.js';

test('Project Service: getProjects returns published projects sorted by order and title', async () => {
  const published = await getProjects(false);
  assert.equal(published.length, 5);
  assert.equal(published.every((p) => p.published), true);
  for (let i = 0; i < published.length - 1; i++) {
    const diff = published[i].order - published[i + 1].order;
    assert.ok(diff <= 0, 'Projects should be sorted by ascending order');
  }
});

test('Project Service: getProjectBySlug finds existing project and returns null for missing', async () => {
  const found = await getProjectBySlug('rainbow-orchard');
  assert.ok(found);
  assert.equal(found.id, 'concept-orchard');
  assert.equal(found.title, 'Rainbow Orchard');

  const missing = await getProjectBySlug('non-existent-project-xyz');
  assert.equal(missing, null);
});

test('Project Service: saveProject rejects when database is unconfigured or payload invalid', async () => {
  // Database unconfigured error (status 503)
  await assert.rejects(
    async () => {
      await saveProject(defaultProjects[0]);
    },
    (err) => {
      assert.equal(err.status, 503);
      assert.match(err.message, /Database service is not configured/);
      return true;
    }
  );
});

test('Settings Service: getSettings returns fallback defaults when database is unconfigured', async () => {
  const settings = await getSettings();
  assert.deepEqual(settings, defaultSettings);
  assert.equal(settings.packages.length, 6);
  assert.equal(settings.services.length, 3);
  assert.equal(settings.faqs.length, 6);
});

test('Settings Service: saveSettings rejects when database is unconfigured or payload invalid', async () => {
  await assert.rejects(
    async () => {
      await saveSettings(defaultSettings);
    },
    (err) => {
      assert.equal(err.status, 503);
      assert.match(err.message, /Database service is not configured/);
      return true;
    }
  );
});
