// Pos anggaran: edit the budget buckets (name, percent, "bisa dipakai").

import { append, h, toast, errorMessage } from '../ui.js';
import { screenHeader, card, bucketEditor } from '../components.js';
import { shake } from '../motion.js';
import * as store from '../store.js';

export const title = 'Pos anggaran';

export function render(main, ctx) {
  const editor = bucketEditor({ buckets: ctx.data.buckets, usageOf: store.bucketUsage, makeId: store.makeId });
  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });

  const form = h(
    'form',
    { class: 'stack', novalidate: true },
    card(null, h('p', { class: 'muted' }, 'Pemasukan dibagi ke pos-pos ini sesuai persennya. Total harus tepat 100%. Pos yang "bisa dipakai" dihitung untuk uang harian; pos lain (misalnya tabungan) disimpan.'), editor.element),
    error,
    h('div', { class: 'button-row' }, h('button', { type: 'submit', class: 'btn btn-primary' }, 'Simpan'), h('a', { class: 'btn', href: '#/pengaturan' }, 'Batal')),
  );
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      store.saveBuckets(editor.getBuckets(), editor.getReassign());
      toast('Pos anggaran disimpan.', 'success');
      ctx.go('pengaturan');
    } catch (err) {
      error.textContent = errorMessage(err);
      error.hidden = false;
      error.scrollIntoView({ block: 'center' });
      shake(error);
    }
  });

  append(main, screenHeader('Pos anggaran', 'Atur pembagian uang bulananmu.'), form);
}
