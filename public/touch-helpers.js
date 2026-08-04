(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.CardTableTouch = api;
  }
}(typeof window !== 'undefined' ? window : globalThis, function () {
  function shouldSuppressClickFromTouch(lastTouchAt, now, thresholdMs) {
    return typeof lastTouchAt === 'number' && typeof now === 'number' && now - lastTouchAt <= (thresholdMs || 400);
  }

  function installTouchClickBridge(element, handler, options) {
    if (!element || typeof handler !== 'function') {
      return null;
    }

    const settings = Object.assign({
      suppressMs: 400,
      preventDefaultOnTouch: true
    }, options || {});

    let lastTouchAt = 0;

    function handleTouchEnd(event) {
      if (!event || !event.changedTouches || !event.changedTouches.length) {
        return;
      }

      lastTouchAt = Date.now();
      if (settings.preventDefaultOnTouch && event && event.cancelable && typeof event.preventDefault === 'function') {
        event.preventDefault();
      }
      handler(event);
    }

    function handleClick(event) {
      if (!event) {
        return;
      }

      const now = Date.now();
      if (shouldSuppressClickFromTouch(lastTouchAt, now, settings.suppressMs)) {
        lastTouchAt = 0;
        if (event && event.cancelable && typeof event.preventDefault === 'function') {
          event.preventDefault();
        }
        return;
      }

      handler(event);
    }

    function handleTouchCancel(event) {
      lastTouchAt = 0;
      if (settings.preventDefaultOnTouch && event && event.cancelable && typeof event.preventDefault === 'function') {
        event.preventDefault();
      }
    }

    element.addEventListener('touchend', handleTouchEnd, { passive: false });
    element.addEventListener('touchcancel', handleTouchCancel, { passive: false });
    element.addEventListener('click', handleClick);

    return {
      destroy: function () {
        element.removeEventListener('touchend', handleTouchEnd);
        element.removeEventListener('touchcancel', handleTouchCancel);
        element.removeEventListener('click', handleClick);
      }
    };
  }

  return {
    shouldSuppressClickFromTouch: shouldSuppressClickFromTouch,
    installTouchClickBridge: installTouchClickBridge
  };
}));
