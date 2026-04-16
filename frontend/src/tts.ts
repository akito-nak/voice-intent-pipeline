async function getBestVoice(): Promise<SpeechSynthesisVoice | undefined> {
  const getVoices = (): SpeechSynthesisVoice[] => window.speechSynthesis.getVoices();

  const immediate = getVoices();
  if (immediate.length > 0) {
    return pickEnglishVoice(immediate);
  }

  return new Promise((resolve) => {
    window.speechSynthesis.addEventListener('voiceschanged', () => {
      resolve(pickEnglishVoice(getVoices()));
    }, { once: true });
  });
}

function pickEnglishVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  return (
    voices.find(v => v.name === 'Samantha') ||
    voices.find(v => v.lang === 'en-US' && v.localService) ||
    voices.find(v => v.lang.startsWith('en'))
  );
}

let selectedVoice: SpeechSynthesisVoice | undefined;

void getBestVoice().then(v => { selectedVoice = v; });

export function speak(text: string, rate = 1.1): Promise<void> {
  return new Promise((resolve, reject) => {
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang  = 'en-US';
    utterance.rate  = rate;
    utterance.pitch = 1.0;

    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    utterance.onend   = () => resolve();
    utterance.onerror = (e) => reject(new Error(e.error));

    window.speechSynthesis.speak(utterance);
  });
}

export function isTTSSupported(): boolean {
  return 'speechSynthesis' in window;
}
