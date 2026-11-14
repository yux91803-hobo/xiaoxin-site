import { $ } from './dom.js';
export function createToast() {
  const el = $('toast'); let timer = 0;
  return function toast(msg, ms = 6000) {
    el.textContent = msg; el.classList.add('show');
    clearTimeout(timer); timer = setTimeout(() => el.classList.remove('show'), ms);
  };
}
