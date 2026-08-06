const test = require('node:test');
const assert = require('node:assert/strict');
const helper = require('../public/touch-helpers');

class FakeElement {
  constructor() {
    this.listeners = {};
  }

  addEventListener(type, handler) {
    if (!this.listeners[type]) {
      this.listeners[type] = [];
    }
    this.listeners[type].push(handler);
  }

  removeEventListener(type, handler) {
    this.listeners[type] = (this.listeners[type] || []).filter(function (entry) {
      return entry !== handler;
    });
  }

  dispatch(type, event) {
    const listeners = this.listeners[type] || [];
    listeners.forEach(function (listener) {
      listener(event);
    });
  }
}

test('touch end suppresses the follow-up click event for the same tap', () => {
  const element = new FakeElement();
  const calls = [];

  helper.installTouchClickBridge(element, function (event) {
    calls.push(event.type || 'handler');
  }, { suppressMs: 400 });

  element.dispatch('touchend', { changedTouches: [{}], cancelable: true });
  element.dispatch('click', { cancelable: true });

  assert.deepEqual(calls, ['handler']);
});

test('clicks without a recent touch still trigger the handler', () => {
  const element = new FakeElement();
  const calls = [];

  helper.installTouchClickBridge(element, function (event) {
    calls.push(event.type || 'handler');
  }, { suppressMs: 400 });

  element.dispatch('click', { cancelable: true });

  assert.deepEqual(calls, ['handler']);
});

test('touch end without changedTouches still triggers the handler for accessibility gestures', () => {
  const element = new FakeElement();
  const calls = [];

  helper.installTouchClickBridge(element, function (event) {
    calls.push(event.type || 'handler');
  }, { suppressMs: 400 });

  element.dispatch('touchend', { cancelable: true });

  assert.deepEqual(calls, ['handler']);
});

test('touch cancel does not call preventDefault', () => {
  const element = new FakeElement();
  let prevented = false;

  helper.installTouchClickBridge(element, function () {}, { suppressMs: 400, preventDefaultOnTouch: true });

  element.dispatch('touchcancel', {
    cancelable: true,
    preventDefault: function () {
      prevented = true;
    }
  });

  assert.equal(prevented, false);
});
