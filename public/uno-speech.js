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
      ? 'Lumo. You say Lumo!'
      : ('Lumo. ' + cleanedName + ' says Lumo!');
  }

  function buildUnoAnnouncementMessage(message) {
    if (typeof message !== 'string' || !message.trim()) {
      return '';
    }

    const trimmed = message.trim();
    if (/says Lumo/i.test(trimmed)) {
      return 'Lumo. ' + trimmed.replace(/\.?$/, '.');
    }

    if (/\bLumo\b/i.test(trimmed)) {
      return 'Lumo. ' + trimmed.replace(/\.?$/, '.');
    }

    return trimmed;
  }

  return {
    buildUnoSpeechText: buildUnoSpeechText,
    buildUnoAnnouncementMessage: buildUnoAnnouncementMessage
  };
}));
