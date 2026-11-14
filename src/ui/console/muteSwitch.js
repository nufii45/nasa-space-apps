// Small always-visible mute switch, wired to the shared sound state.
import { createToggle } from './toggle.js';
import { isMuted, setMuted, onMuteChange } from './sound.js';

export function createMuteSwitch() {
  const t = createToggle({ label: 'Sound', on: !isMuted(), onChange: (on) => setMuted(!on) });
  onMuteChange((m) => t.set(!m));
  return t;
}
