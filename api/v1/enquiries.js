import { isAdmin, getClientIp } from '../../src/services/auth.service.js';
import { sameOrigin } from '../../src/utils/csrf.js';
import {
  submitEnquiry,
  getEnquiries,
  updateEnquiryStatus,
  deleteEnquiry
} from '../../src/services/enquiry.service.js';

export default async function handler(req, res) {
  const method = req.method;

  // 1. PUBLIC SUBMISSION: POST
  if (method === 'POST') {
    if (!sameOrigin(req)) {
      return res.status(403).json({ error: 'Please send your brief from this website.' });
    }

    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('application/json')) {
      return res.status(415).json({ error: 'Invalid request.' });
    }

    const clientIp = getClientIp(req);
    const body = req.body || {};

    try {
      const result = await submitEnquiry(body, clientIp);
      return res.status(result.status || 201).json({ ok: true, id: result.id });
    } catch (err) {
      const status = err.status || 500;
      return res.status(status).json({
        error: err.message || 'We couldn’t save your brief. Please try again; your details are still in the form.'
      });
    }
  }

  // 2. ADMIN LIST: GET
  if (method === 'GET') {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Admin access required.' });
    }
    const limit = Number(req.query?.limit || 500);
    const enquiries = await getEnquiries(limit);
    return res.status(200).json({ ok: true, enquiries });
  }

  // 3. ADMIN STATUS UPDATE: PATCH
  if (method === 'PATCH') {
    if (!sameOrigin(req) || !isAdmin(req)) {
      return res.status(403).json({ error: 'Admin access required.' });
    }

    const { id, status } = req.body || {};
    if (!id || !status) {
      return res.status(400).json({ error: 'Choose a valid status.' });
    }

    try {
      await updateEnquiryStatus(id, status);
      return res.status(200).json({ ok: true });
    } catch (err) {
      const code = err.status || 500;
      return res.status(code).json({ error: err.message || 'Could not update the enquiry.' });
    }
  }

  // 4. ADMIN DELETION: DELETE
  if (method === 'DELETE') {
    if (!sameOrigin(req) || !isAdmin(req)) {
      return res.status(403).json({ error: 'Admin access required.' });
    }

    const { id } = req.body || {};
    if (!id) {
      return res.status(400).json({ error: 'Invalid enquiry.' });
    }

    try {
      await deleteEnquiry(id);
      return res.status(200).json({ ok: true });
    } catch (err) {
      const code = err.status || 500;
      return res.status(code).json({ error: err.message || 'Could not delete the enquiry.' });
    }
  }

  res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
  return res.status(405).json({ error: 'Method not allowed.' });
}
