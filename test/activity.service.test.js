import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordEvent, getActivityMetrics } from '../src/services/activity.service.js';

test('Activity Service: recordEvent validates event types strictly', async () => {
  // Allowed types
  const r1 = await recordEvent('project_open', 'cat-battle');
  assert.equal(r1.ok, true);

  const r2 = await recordEvent('trailer_play', 'dragon-escape');
  assert.equal(r2.ok, true);

  const r3 = await recordEvent('form_start', '');
  assert.equal(r3.ok, true);

  // Rejects invalid types with 400
  await assert.rejects(
    async () => {
      await recordEvent('unknown_event_type', 'slug');
    },
    (err) => {
      assert.equal(err.status, 400);
      assert.match(err.message, /Invalid event payload/);
      return true;
    }
  );

  // Rejects manufactured enquiry_submitted
  await assert.rejects(
    async () => {
      await recordEvent('enquiry_submitted', '');
    },
    (err) => {
      assert.equal(err.status, 400);
      return true;
    }
  );
});

test('Activity Service: getActivityMetrics returns zeroed structure when unconfigured', async () => {
  const metrics = await getActivityMetrics();
  assert.deepEqual(metrics, {
    project_open: 0,
    trailer_play: 0,
    form_start: 0,
    enquiry_submitted: 0
  });
});
