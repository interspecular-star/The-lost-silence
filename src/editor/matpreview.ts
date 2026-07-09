// Мини-превью материала блока прямо в инспекторе: живой образец
// с анимацией рамки — не нужно открывать лабораторию/предпросмотр.

import { BoxStyle } from '../core/types';
import { applyBoxFx, glassBg } from '../runtime/boxfx';
import { h } from './ui';

export function materialPreview(
  style: BoxStyle | undefined,
  accent: string,
  kind: 'panel' | 'button',
  bg = 'rgba(13,20,28,0.92)',
): HTMLElement {
  const wrap = h('div', {
    style: 'position:relative;height:64px;border-radius:6px;overflow:hidden;margin-top:6px;'
      + 'background:radial-gradient(ellipse at 50% 20%, #16222e, #05080d);',
    title: 'Живой образец: так материал выглядит в игре',
  });

  const box = h('div');
  if (kind === 'panel') {
    box.style.cssText = `position:absolute;left:6%;right:6%;bottom:0;height:72%;
      background:var(--dbox-bg);border-top:1px solid color-mix(in srgb, ${accent} 26%, transparent);
      display:flex;align-items:center;padding:0 14px;color:#cfd9e2;font-size:11px;`;
    box.style.setProperty('--dbox-bg', bg);
    box.textContent = 'Реплика собеседника…';
  } else {
    box.style.cssText = `position:absolute;left:18%;right:18%;top:50%;transform:translateY(-50%);height:56%;
      background:${glassBg(bg, style)};display:flex;align-items:center;justify-content:center;
      color:#cfd9e2;font-size:11px;letter-spacing:1px;`;
    box.textContent = 'ВАРИАНТ / КНОПКА';
  }
  applyBoxFx(box, style, accent, { kind });
  // в превью рамка «только при наведении» видна сразу — иначе образец пустой
  box.querySelector('.bfx-ring')?.classList.remove('bfx-hoveronly');
  wrap.appendChild(box);
  return wrap;
}
