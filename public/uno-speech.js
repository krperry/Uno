(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.CardTableUnoSpeech = api;
  }
}(typeof window !== 'undefined' ? window : globalThis, function () {
  function buildUnoSpeechText(actorIsYou, actorName) {
    const cleanedName = typeof actorName === 'string' && actorName.trim()
      ? actorName.trim()
      : 'A player';

    return actorIsYou
      ? 'UNO. You say UNO!'
      : ('UNO. ' + cleanedName + ' says UNO!');
  }

  function buildUnoAnnouncementMessage(message) {
    if (typeof message !== 'string' || !message.trim()) {
      return '';
    }

    const trimmed = message.trim();
    if (/says UNO/i.test(trimmed)) {
      return 'UNO. ' + trimmed.replace(/\.?$/, '.');
    }

    if (/\bUNO\b/i.test(trimmed)) {
      return 'UNO. ' + trimmed.replace(/\.?$/, '.');
    }

    return trimmed;
  }

  return {
    buildUnoSpeechText: buildUnoSpeechText,
    buildUnoAnnouncementMessage: buildUnoAnnouncementMessage
  };
}));
