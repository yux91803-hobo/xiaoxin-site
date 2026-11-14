// Intro overlay (title + 跳过 button). Plays once per browser session.
import { $ } from './dom.js';
import { INTRO_KEY } from '../config.js';

export function shouldPlayIntro({ reducedMotion, deepLink }) {
  if (reducedMotion || deepLink) return false;
  const p = new URLSearchParams(location.search).get('intro');
  if (p === '0') return false;
  if (p === '1') return true;
  try { return !sessionStorage.getItem(INTRO_KEY); } catch { return true; }
}
export function markIntroSeen() { try { sessionStorage.setItem(INTRO_KEY, '1'); } catch {} }

export function createIntroOverlay({ bus }) {
  const el = $('intro');
  $('introSkip').addEventListener('click', () => bus.emit('intro:skip'));
  return {
    show() { document.body.classList.add('intro-on'); el.classList.add('on'); el.setAttribute('aria-hidden', 'false'); },
    hide() { document.body.classList.remove('intro-on'); el.classList.remove('on'); el.setAttribute('aria-hidden', 'true'); },
  };
}
