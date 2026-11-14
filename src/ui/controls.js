// Top-right toolbar: 自转 · 全景 · 实景 · 画质, plus the keyboard shortcuts and the hint line.
import { $ } from './dom.js';
import { TIER_LABEL } from '../core/quality.js';

export function createControls({ store, bus, quality }) {
  const spin = $('btnSpin'), qBtn = $('btnQuality'), realBtns = [$('cardReal'), $('btnReal')];
  spin.addEventListener('click', () => store.set((s) => ({ autoSpin: !s.autoSpin })));
  store.watch((s) => s.autoSpin, (v) => spin.setAttribute('aria-pressed', String(v)), { immediate: true });
  $('btnReset').addEventListener('click', () => bus.emit('view:home'));
  $('btnReal').addEventListener('click', () => bus.emit('photoreal:request', { index: store.get().selected }));
  qBtn.addEventListener('click', () => quality.cycle());

  const label = (s) => s.qualityMode === 'auto' ? `画质 · 自动(${TIER_LABEL[s.tier]})` : `画质 · ${TIER_LABEL[s.qualityMode]}`;
  const short = (s) => `画质·${s.qualityMode === 'auto' ? TIER_LABEL[s.tier] : TIER_LABEL[s.qualityMode]}`;
  const renderQ = (s) => {
    qBtn.textContent = matchMedia('(max-width:760px)').matches ? short(s) : label(s);
    qBtn.title = `画质：${s.qualityMode === 'auto' ? '自动' : TIER_LABEL[s.qualityMode]}（点按切换 自动 / 高 / 中 / 低）`;
  };
  store.subscribe((s, p) => { if (s.qualityMode !== p.qualityMode || s.tier !== p.tier) renderQ(s); });
  renderQ(store.get());
  addEventListener('resize', () => renderQ(store.get()));

  store.watch((s) => s.mode, (m) => { const busy = m !== 'globe'; realBtns.forEach((b) => (b.disabled = busy)); });

  const hint = $('hint'); let hintHidden = false;
  const hideHint = () => { if (!hintHidden) { hintHidden = true; hint.style.opacity = 0; } };
  bus.on('user:interact', hideHint);
  bus.on('place:select', hideHint);

  addEventListener('keydown', (e) => {
    const s = store.get();
    if (s.mode === 'intro' && (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter')) { bus.emit('intro:skip'); return; }
    if (s.mode !== 'globe') return;          // photoreal view handles its own keys
    const n = s.placeCount;
    if (e.key === 'Escape') bus.emit('place:clear');
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') bus.emit('place:select', { index: (s.selected + 1) % n, source: 'key' });
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') bus.emit('place:select', { index: (s.selected - 1 + n) % n, source: 'key' });
  });
}
