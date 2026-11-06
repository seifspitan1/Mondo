/**
 * MONDO — History Manager Unit Test Suite (Stage G3.3-A)
 * Automated verification for route-directed History management,
 * scroll restoration contracts, and traversal queuing.
 */

import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createHistoryManager,
  SCROLL_POLICY,
  TRAVERSAL_DISPOSITION
} from '../public/js/features/navigation/history-manager.js';

import {
  NON_CANCELLABLE_STATES,
  TERMINAL_STATES
} from '../public/js/features/navigation/navigation-state.js';

function createMockHistory(initialState = null) {
  let state = initialState;
  const calls = {
    pushState: [],
    replaceState: []
  };

  return {
    get state() {
      return state;
    },
    set state(val) {
      state = val;
    },
    pushState(data, title, url) {
      state = data;
      calls.pushState.push({ data, title, url });
    },
    replaceState(data, title, url) {
      state = data;
      calls.replaceState.push({ data, title, url });
    },
    _calls: calls
  };
}

describe('Stage G3.3-A: History Manager', () => {

  describe('Group A1: Managed Entry Identification & Serialization', () => {
    it('correctly identifies managed entries vs unmanaged entries', () => {
      const manager = createHistoryManager();

      assert.strictEqual(manager.isManagedEntry(null), false);
      assert.strictEqual(manager.isManagedEntry(undefined), false);
      assert.strictEqual(manager.isManagedEntry('string'), false);
      assert.strictEqual(manager.isManagedEntry({}), false);
      assert.strictEqual(manager.isManagedEntry({ mondoHybrid: false }), false);
      assert.strictEqual(manager.isManagedEntry({ mondoHybrid: true }), true);
      assert.strictEqual(manager.isManagedEntry({ mondoHybrid: true, routeId: 'work' }), true);
    });

    it('preserves unrelated existing history.state data when creating managed state', () => {
      const manager = createHistoryManager();
      const existing = { thirdPartyKey: 'analytics_payload', sessionToken: 12345 };

      const stateObj = manager.createStateObject({
        routeId: 'work',
        scrollX: 10,
        scrollY: 250
      }, existing);

      assert.strictEqual(stateObj.mondoHybrid, true);
      assert.strictEqual(stateObj.routeId, 'work');
      assert.strictEqual(stateObj.slug, null);
      assert.strictEqual(stateObj.scrollX, 10);
      assert.strictEqual(stateObj.scrollY, 250);
      assert.strictEqual(stateObj.thirdPartyKey, 'analytics_payload');
      assert.strictEqual(stateObj.sessionToken, 12345);
      assert.strictEqual(typeof stateObj.timestamp, 'number');

      // Existing state was not mutated in place
      assert.strictEqual(existing.mondoHybrid, undefined);
    });

    it('serializes routeId, slug, and timestamps deterministically', () => {
      const manager = createHistoryManager();
      const fixedTs = 1730689200000;

      const projectState = manager.createStateObject({
        routeId: 'project',
        slug: 'rainbow-orchard',
        scrollX: 0,
        scrollY: 0,
        timestamp: fixedTs
      });

      assert.deepStrictEqual(projectState, {
        mondoHybrid: true,
        routeId: 'project',
        slug: 'rainbow-orchard',
        scrollX: 0,
        scrollY: 0,
        timestamp: fixedTs
      });
    });
  });

  describe('Group A2: Scroll Position Capture & Route-Directed Policy (Amendment 1 & G3-D03)', () => {
    it('captures both scrollX and scrollY from injected coordinates', () => {
      let scrollCoords = { x: 45, y: 320 };
      const manager = createHistoryManager({
        getScroll: () => scrollCoords
      });

      const captured = manager.captureScroll();
      assert.strictEqual(captured.x, 45);
      assert.strictEqual(captured.y, 320);

      scrollCoords = { x: 0, y: 0 };
      assert.deepStrictEqual(manager.captureScroll(), { x: 0, y: 0 });
    });

    it('updates current entry scroll coordinates in-place without overwriting other state', () => {
      const mockHist = createMockHistory({
        mondoHybrid: true,
        routeId: 'work',
        preservedTag: 'active_filter_all'
      });
      const manager = createHistoryManager({
        history: mockHist,
        getScroll: () => ({ x: 0, y: 880 })
      });

      const success = manager.updateCurrentEntryScroll();
      assert.strictEqual(success, true);
      assert.strictEqual(mockHist._calls.replaceState.length, 1);

      const updated = mockHist._calls.replaceState[0].data;
      assert.strictEqual(updated.mondoHybrid, true);
      assert.strictEqual(updated.routeId, 'work');
      assert.strictEqual(updated.scrollX, 0);
      assert.strictEqual(updated.scrollY, 880);
      assert.strictEqual(updated.preservedTag, 'active_filter_all');
    });

    it('pushRoute captures current scroll and resets destination entry to (0, 0)', () => {
      const mockHist = createMockHistory({
        mondoHybrid: true,
        routeId: 'work'
      });
      let currentScroll = { x: 0, y: 640 };
      const manager = createHistoryManager({
        history: mockHist,
        getScroll: () => currentScroll
      });

      const ok = manager.pushRoute('/work/cat-battle', {
        routeId: 'project',
        slug: 'cat-battle'
      }, { title: 'Cat Battles — MONDO' });

      assert.strictEqual(ok, true);
      // updateCurrentEntryScroll was called first
      assert.strictEqual(mockHist._calls.replaceState.length, 1);
      assert.strictEqual(mockHist._calls.replaceState[0].data.scrollY, 640);

      // pushState was called second with destination starting at (0, 0)
      assert.strictEqual(mockHist._calls.pushState.length, 1);
      const pushCall = mockHist._calls.pushState[0];
      assert.strictEqual(pushCall.url, '/work/cat-battle');
      assert.strictEqual(pushCall.title, 'Cat Battles — MONDO');
      assert.strictEqual(pushCall.data.scrollX, 0);
      assert.strictEqual(pushCall.data.scrollY, 0);
      assert.strictEqual(pushCall.data.slug, 'cat-battle');
    });

    it('applies SCROLL_POLICY.RESET_TOP to viewport (0, 0)', () => {
      let scrolledTo = null;
      const manager = createHistoryManager({
        scrollTo: (x, y) => { scrolledTo = { x, y }; }
      });

      const res = manager.applyScrollPolicy(SCROLL_POLICY.RESET_TOP);
      assert.strictEqual(res, true);
      assert.deepStrictEqual(scrolledTo, { x: 0, y: 0 });
    });

    it('applies SCROLL_POLICY.RESTORE_SAVED using both scrollX and scrollY', () => {
      let scrolledTo = null;
      const manager = createHistoryManager({
        scrollTo: (x, y) => { scrolledTo = { x, y }; }
      });

      const res = manager.applyScrollPolicy(SCROLL_POLICY.RESTORE_SAVED, { x: 15, y: 950 });
      assert.strictEqual(res, true);
      assert.deepStrictEqual(scrolledTo, { x: 15, y: 950 });
    });

    it('applies SCROLL_POLICY.PRESERVE_NATIVE without invoking scrollTo', () => {
      let scrollCalled = false;
      const manager = createHistoryManager({
        scrollTo: () => { scrollCalled = true; }
      });

      const res = manager.applyScrollPolicy(SCROLL_POLICY.PRESERVE_NATIVE);
      assert.strictEqual(res, true);
      assert.strictEqual(scrollCalled, false);
    });
  });

  describe('Group A3: Non-Cancellable State Traversal Queuing (Amendment 2)', () => {
    it('evaluates queued disposition for irreversible in-progress states (Amendment 2)', () => {
      const manager = createHistoryManager();
      const irreversibleInProgress = ['COMMITTING', 'AWAITING_READINESS', 'REVEALING', 'RECOVERING'];

      for (const st of irreversibleInProgress) {
        assert.strictEqual(
          manager.evaluateTraversalDisposition(st),
          TRAVERSAL_DISPOSITION.QUEUED,
          `Irreversible in-progress state ${st} must be queued`
        );
      }
    });

    it('evaluates immediate disposition for terminal states (COMPLETE, CANCELLED) and IDLE (Amendment 2)', () => {
      const manager = createHistoryManager();

      assert.strictEqual(manager.evaluateTraversalDisposition('IDLE'), TRAVERSAL_DISPOSITION.IMMEDIATE);
      assert.strictEqual(manager.evaluateTraversalDisposition(null), TRAVERSAL_DISPOSITION.IMMEDIATE);

      for (const terminalState of TERMINAL_STATES) {
        assert.strictEqual(
          manager.evaluateTraversalDisposition(terminalState),
          TRAVERSAL_DISPOSITION.IMMEDIATE,
          `Terminal state ${terminalState} must allow immediate disposition`
        );
      }
    });

    it('evaluates immediate disposition for pre-boundary cancellable states', () => {
      const manager = createHistoryManager();
      const cancellable = ['INITIATED', 'OUTBOUND', 'FETCHING', 'PARSED'];

      for (const st of cancellable) {
        assert.strictEqual(
          manager.evaluateTraversalDisposition(st),
          TRAVERSAL_DISPOSITION.IMMEDIATE,
          `Pre-boundary state ${st} can be cancelled immediately`
        );
      }
    });

    it('queues pending traversal intent and assigns incrementing generations', () => {
      const manager = createHistoryManager();

      assert.strictEqual(manager.hasPendingTraversal(), false);
      assert.strictEqual(manager.getPendingTraversal(), null);

      const t1 = manager.queuePendingTraversal({
        targetUrl: '/work',
        state: { routeId: 'work' }
      }, 'AWAITING_READINESS');

      assert.strictEqual(t1.disposition, TRAVERSAL_DISPOSITION.QUEUED);
      assert.strictEqual(t1.generation, 1);
      assert.strictEqual(manager.hasPendingTraversal(), true);

      const snapshot = manager.getPendingTraversal();
      assert.strictEqual(snapshot.targetUrl, '/work');
      assert.strictEqual(snapshot.generation, 1);

      // Subsequent queue supersedes previous traversal and increments generation
      const t2 = manager.queuePendingTraversal({
        targetUrl: '/work/cosmic-egg',
        state: { routeId: 'project', slug: 'cosmic-egg' }
      }, 'AWAITING_READINESS');

      assert.strictEqual(t2.disposition, TRAVERSAL_DISPOSITION.QUEUED);
      assert.strictEqual(t2.generation, 2);

      const snapshot2 = manager.getPendingTraversal();
      assert.strictEqual(snapshot2.targetUrl, '/work/cosmic-egg');
      assert.strictEqual(snapshot2.generation, 2);

      // Verifies generation staleness check
      assert.strictEqual(manager.isCurrentGeneration(1), false);
      assert.strictEqual(manager.isCurrentGeneration(2), true);
    });

    it('clearPendingTraversal removes the queued intent cleanly', () => {
      const manager = createHistoryManager();
      manager.queuePendingTraversal({ targetUrl: '/work' }, 'COMMITTING');
      assert.strictEqual(manager.hasPendingTraversal(), true);

      manager.clearPendingTraversal();
      assert.strictEqual(manager.hasPendingTraversal(), false);
      assert.strictEqual(manager.getPendingTraversal(), null);
    });
  });

  describe('Group A4: Isolation, Independence & Dormancy', () => {
    it('creates independent instances with decoupled state', () => {
      const m1 = createHistoryManager();
      const m2 = createHistoryManager();

      m1.queuePendingTraversal({ targetUrl: '/work' }, 'COMMITTING');
      assert.strictEqual(m1.hasPendingTraversal(), true);
      assert.strictEqual(m2.hasPendingTraversal(), false);

      m1.destroy();
      assert.strictEqual(m1.hasPendingTraversal(), false);
    });

    it('destroy() resets generations and pending traversals', () => {
      const manager = createHistoryManager();
      manager.queuePendingTraversal({ targetUrl: '/work' }, 'COMMITTING');
      assert.strictEqual(manager.getLatestGeneration(), 1);

      manager.destroy();
      assert.strictEqual(manager.getLatestGeneration(), 0);
      assert.strictEqual(manager.hasPendingTraversal(), false);
    });
  });

});
