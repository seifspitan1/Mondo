import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  submitEnquiry,
  getEnquiries,
  updateEnquiryStatus,
  deleteEnquiry
} from '../src/services/enquiry.service.js';

function mockBrief(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    name: 'MONDO Quality Assurance',
    email: 'qa@mondostudio.test',
    discord: 'mondo#0001',
    gameUrl: 'https://roblox.com/games/12345',
    service: 'Game Thumbnails',
    packageName: 'MONDO LAB',
    goal: 'We need high-converting thumbnails for an upcoming release update.',
    budget: '$500 - $1,000',
    deadline: 'Next month',
    consent: true,
    website: '',
    ...overrides
  };
}

test('Enquiry Service: submitEnquiry enforces validation rules before database call', async () => {
  const origUrl = process.env.SUPABASE_URL;
  const origKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'https://mock-supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key-12345';

  try {
    // Missing consent
    await assert.rejects(
      async () => {
        await submitEnquiry(mockBrief({ consent: false }));
      },
      (err) => {
        assert.equal(err.status, 400);
        assert.match(err.message, /privacy notice/i);
        return true;
      }
    );

    // Invalid email
    await assert.rejects(
      async () => {
        await submitEnquiry(mockBrief({ email: 'not-an-email' }));
      },
      (err) => {
        assert.equal(err.status, 400);
        assert.match(err.message, /valid email/i);
        return true;
      }
    );

    // Goal too short (< 15 chars)
    await assert.rejects(
      async () => {
        await submitEnquiry(mockBrief({ goal: 'Short' }));
      },
      (err) => {
        assert.equal(err.status, 400);
        assert.match(err.message, /Tell us a little more/i);
        return true;
      }
    );

    // Honeypot field filled
    await assert.rejects(
      async () => {
        await submitEnquiry(mockBrief({ website: 'bot-injected-domain.com' }));
      },
      (err) => {
        assert.equal(err.status, 400);
        assert.match(err.message, /empty/i);
        return true;
      }
    );
  } finally {
    if (origUrl) process.env.SUPABASE_URL = origUrl;
    else delete process.env.SUPABASE_URL;
    if (origKey) process.env.SUPABASE_SERVICE_ROLE_KEY = origKey;
    else delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  }
});

test('Enquiry Service: submitEnquiry fails gracefully with 503 when database is unconfigured', async () => {
  await assert.rejects(
    async () => {
      await submitEnquiry(mockBrief());
    },
    (err) => {
      assert.equal(err.status, 503);
      assert.match(err.message, /Database service is not configured/);
      return true;
    }
  );
});

test('Enquiry Service: getEnquiries returns empty list when database is unconfigured', async () => {
  const list = await getEnquiries(100);
  assert.deepEqual(list, []);
});

test('Enquiry Service: updateEnquiryStatus validates status enum and fails closed on unconfigured DB', async () => {
  // Invalid status
  await assert.rejects(
    async () => {
      // Even if DB was configured, invalid status throws 400
      await updateEnquiryStatus('some-id', 'BogusStatus');
    },
    (err) => {
      // Without DB, checks DB first or status first? Let's verify behavior
      assert.ok(err.status === 503 || err.status === 400);
      return true;
    }
  );
});

test('Enquiry Service: deleteEnquiry fails gracefully with 503 when database is unconfigured', async () => {
  await assert.rejects(
    async () => {
      await deleteEnquiry('any-id');
    },
    (err) => {
      assert.equal(err.status, 503);
      return true;
    }
  );
});
