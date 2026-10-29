// Rencana Cukup: "I have this much money now; make it last until …".
// All the math is in planner.js; this file only shows it.

import { append, h, icon, moneyInput, confirmDialog, alertDialog, toast, errorMessage } from '../ui.js';
import { screenHeader, card, money, notice, keyed, progressBar, meter, statusBadge } from '../components.js';
import { planReport, planSummary, reverseCalc, planPurchase, savingTips } from '../planner.js';
import { weekday } from '../logic.js';
import { formatRupiah, formatDate, formatDateLong, formatDateShort, DAYS } from '../format.js';
import { openPlanForm } from './plan-form.js';
import * as store from '../store.js';

export const title = 'Rencana Cukup';

export function render(main, ctx) {
  const { data, today } = ctx;
  const plan = data.plans.active;
  const subtitle = plan ? `Supaya uangmu cukup sampai ${formatDate(plan.endDate)}.` : 'Bikin uang yang ada cukup sampai waktunya.';
  append(main, keyed(screenHeader('Rencana Cukup', subtitle), 'header'));

  if (!plan) {
    append(main, introCard(ctx), historyCard(data));
    return;
  }
  const report = planReport(plan, data.expenses, today);
  if (report.phase === 'ended') {
    append(main, endedCard(ctx, plan), historyCard(data));
    return;
  }
  append(
    main,
    planHero(report),
    shortfallNotice(report),
    report.status !== 'aman' ? tipsCard(report, data, today) : null,
    summaryCard(report, plan),
    obligationsCard(report, plan),
    timelineCard(report),
    reverseCard(ctx, report),
    purchaseCard(ctx, plan),
    keyed(
      h(
        'div',
        { class: 'button-row plan-actions' },
        h('button', { type: 'button', class: 'btn', id: 'plan-edit', onclick: () => openPlanForm(ctx, { plan }) }, icon('pencil'), 'Ubah rencana'),
        h('button', { type: 'button', class: 'btn btn-danger', id: 'plan-end', onclick: () => endPlanFlow(ctx) }, 'Akhiri rencana'),
        h('button', { type: 'button', class: 'btn', id: 'plan-new', onclick: () => newPlanFlow(ctx) }, icon('plus'), 'Rencana baru'),
      ),
      'actions',
    ),
    historyCard(data),
  );
}

/* ------------------------------ explanations ------------------------------ */

function explanation(r) {
  const texts = {
    aman: `Uangmu cukup sampai ${formatDate(r.endDate)} kalau belanja sesuai jatah.`,
    mepet: `Cukup, tapi mepet dengan belanja minimal ${formatRupiah(r.minDaily)} per hari.`,
    turun: 'Jatah harianmu turun karena belanja lebih besar dari rencana. Coba hemat beberapa hari ke depan.',
    'hari-ini': 'Belanja hari ini sudah melebihi jatah. Jatah hari berikutnya akan sedikit turun.',
    kewajiban: 'Kewajiban dan dana darurat lebih besar dari uang yang kamu punya.',
    habis: 'Uang rencana sudah habis untuk sisa hari. Kurangi belanja atau tambah uang.',
    minimum: `Uangnya tidak cukup untuk belanja minimal ${formatRupiah(r.minDaily)} per hari sampai ${formatDate(r.endDate)}.`,
  };
  return texts[r.reason] || '';
}

const dayLabel = (date) => DAYS[weekday(date)].slice(0, 3); // 'Sen', 'Sel', ...

/* --------------------------------- parts --------------------------------- */

function introCard(ctx) {
  return keyed(
    card(
      null,
      h(
        'div',
        { class: 'plan-intro' },
        icon('plan', 'icon plan-intro-icon'),
        h('h2', { class: 'card-title' }, 'Bikin uangmu cukup'),
        h('p', { class: 'muted' }, 'Masukkan uang yang kamu punya sekarang dan sampai kapan harus cukup. Aplikasi menghitung jatah per hari, lalu menyesuaikannya setiap hari sesuai belanjamu.'),
      ),
      h(
        'ul',
        { class: 'plan-points' },
        h('li', null, 'Kewajiban seperti kos dan pulsa disisihkan dulu.'),
        h('li', null, 'Dana darurat tidak ikut dibelanjakan.'),
        h('li', null, 'Belanja lebih hari ini → jatah besok turun. Hemat → jatah besok naik.'),
      ),
      h('button', { type: 'button', class: 'btn btn-primary btn-big btn-block', id: 'plan-create', onclick: () => openPlanForm(ctx) }, icon('plus'), 'Buat rencana'),
    ),
    'card:intro',
  );
}

function planHero(r) {
  const negative = r.sisaHariIni < 0;
  const panel = card(
    'Rencana hari ini',
    h(
      'div',
      { class: 'plan-hero-top' },
      h(
        'div',
        null,
        h('p', { class: 'hero-label' }, 'Sisa hari ini (rencana)'),
        h('p', { class: 'hero-amount', id: 'plan-sisa', 'data-count-key': 'plan:sisa', 'data-value': String(r.sisaHariIni) }, formatRupiah(r.sisaHariIni)),
      ),
      meter(r.spentToday, r.allowanceToday, `Terpakai hari ini ${formatRupiah(r.spentToday)} dari ${formatRupiah(r.allowanceToday)}`, 'plan:today'),
    ),
    h('div', { class: 'plan-status' }, statusBadge(r.status), h('p', { class: 'plan-status-text', id: 'plan-status-text' }, explanation(r))),
    h(
      'dl',
      { class: 'hero-stats' },
      h('div', null, h('dt', null, 'Jatah hari ini'), h('dd', { id: 'plan-aman' }, money(r.allowanceToday, '', 'plan:aman'))),
      h('div', null, h('dt', null, 'Terpakai hari ini'), h('dd', null, money(r.spentToday, '', 'plan:spent', 'down'))),
      h('div', null, h('dt', null, 'Sisa hari'), h('dd', null, `${r.daysLeft} hari`), h('small', null, `sampai ${formatDateShort(r.endDate)}`)),
      h('div', null, h('dt', null, 'Sisa uang rencana'), h('dd', null, money(r.remaining, '', 'plan:remaining'))),
    ),
  );
  panel.classList.add('hero', 'plan-hero');
  if (negative) panel.classList.add('is-negative');
  return keyed(panel, 'plan-hero');
}

function shortfallNotice(r) {
  if (r.status !== 'tidak-cukup' || r.shortfall <= 0) return null;
  const parts = [h('strong', null, `Kurang ${formatRupiah(r.shortfall)}`), ` untuk sampai ${formatDate(r.endDate)}.`];
  if (r.minDaily > 0) {
    parts.push(
      r.coverDays > 0
        ? ` Dengan belanja minimal ${formatRupiah(r.minDaily)} per hari, uangnya cukup ${r.coverDays} hari (sampai ${formatDateShort(r.lastCoveredDay)}) dan habis sekitar ${formatDateLong(r.runsOutOn)}.`
        : ' Uangnya bahkan tidak cukup untuk belanja minimal hari ini.',
    );
  }
  return keyed(notice('danger', parts), 'plan:shortfall');
}

function tipsCard(r, data, today) {
  const tips = savingTips(r, data, today);
  const parts = [h('p', null, `Supaya cukup sampai ${formatDateShort(r.endDate)}, belanja maksimal `, h('strong', null, formatRupiah(tips.maxPerDay)), ' per hari.')];
  if (tips.typicalPerDay !== null) {
    parts.push(
      h('p', { class: 'muted' }, `Rata-rata belanjamu 7 hari terakhir ${formatRupiah(tips.typicalPerDay)} per hari${tips.cutPerDay > 0 ? `, jadi perlu hemat sekitar ${formatRupiah(tips.cutPerDay)} per hari.` : '.'}`),
    );
  }
  if (tips.obligations.length) {
    parts.push(h('h3', { class: 'tips-heading' }, 'Tagihan yang bisa ditunda atau dikurangi'));
    parts.push(
      h(
        'ul',
        { class: 'rows' },
        tips.obligations.map((o) =>
          h('li', { class: 'row' }, h('span', { class: 'row-main' }, h('span', { class: 'row-title', text: o.name }), h('span', { class: 'row-sub', text: `Jatah per hari naik ${formatRupiah(o.perDayGain)}` })), h('span', { class: 'row-amount' }, formatRupiah(o.amount))),
        ),
      ),
    );
  }
  if (tips.habits.length) {
    parts.push(h('h3', { class: 'tips-heading' }, 'Pengeluaran keinginan terbesar periode ini'));
    parts.push(
      h(
        'ul',
        { class: 'rows' },
        tips.habits.map((g) =>
          h(
            'li',
            { class: 'row' },
            h('span', { class: 'row-main' }, h('span', { class: 'row-title', text: `${g.label} (${g.count}×)` }), h('span', { class: 'row-sub', text: `Kurangi setengahnya: hemat ± ${formatRupiah(g.halfSaving)} per hari` })),
            h('span', { class: 'row-amount' }, formatRupiah(g.total)),
          ),
        ),
      ),
    );
  }
  if (!tips.obligations.length && !tips.habits.length) parts.push(h('p', { class: 'hint' }, 'Belum ada cukup data pengeluaran untuk saran yang lebih spesifik.'));
  return keyed(card('Saran penghematan', ...parts), 'card:tips');
}

/** A deduction shown calmly (not red): '− Rp 450.000'. */
const deduction = (amount) => h('span', { class: 'money' }, amount ? `− ${formatRupiah(amount)}` : formatRupiah(0));

function line(label, value, className = '') {
  return h('div', { class: `total-row ${className}` }, h('dt', null, label), h('dd', null, value));
}

function summaryCard(r, plan) {
  const perDay =
    plan.pattern === 'weekend'
      ? h('span', null, money(r.perWeekday), h('small', { class: 'muted' }, ' hari biasa'), h('br'), money(r.perWeekendDay), h('small', { class: 'muted' }, ' Sabtu/Minggu'))
      : money(r.perWeekday);
  return keyed(
    card(
      'Ringkasan rencana',
      h(
        'dl',
        { class: 'totals' },
        line(`Uang saat mulai (${formatDateShort(r.startDate)})`, money(r.money)),
        line('Kewajiban', deduction(r.obligationsTotal)),
        line('Dana darurat', deduction(r.emergency)),
        line('Bisa dibelanjakan', money(r.spendable), 'is-strong'),
        line('Jumlah hari', `${r.totalDays} hari`),
        line('Jatah per hari (sekarang)', perDay),
        line('Jatah per minggu (sekarang)', money(r.perWeek)),
        line('Sudah terpakai', money(r.spentTotal)),
      ),
      r.ignoredObligations.length ? h('p', { class: 'hint' }, `${r.ignoredObligations.length} kewajiban bertanggal setelah ${formatDateShort(r.endDate)}, jadi tidak dihitung.`) : null,
    ),
    'card:plan-summary',
  );
}

function obligationsCard(r, plan) {
  if (!plan.obligations.length) return null;
  const counted = new Set(r.obligations.map((o) => o.id));
  const rows = plan.obligations.map((o) => {
    const id = `paid-${o.id}`;
    const box = h('input', { type: 'checkbox', class: 'switch', id, checked: o.paid, disabled: !counted.has(o.id) });
    box.addEventListener('change', () => store.setObligationPaid(o.id, box.checked));
    return h(
      'li',
      { class: `row obligation-item${o.paid ? ' is-paid' : ''}${counted.has(o.id) ? '' : ' is-quiet'}`, 'data-key': `o:${o.id}` },
      h('span', { class: 'row-main' }, h('span', { class: 'row-title', text: o.name }), h('span', { class: 'row-sub', text: counted.has(o.id) ? formatDateShort(o.date, true) : `${formatDateShort(o.date, true)} · di luar rencana` })),
      h('span', { class: 'row-amount' }, formatRupiah(o.amount)),
      h('label', { class: 'paid-toggle', for: id }, box, h('span', null, 'Lunas')),
    );
  });
  return keyed(
    card('Kewajiban', h('ul', { class: 'rows' }, rows), h('p', { class: 'hint' }, 'Sudah dihitung di rencana. Saat dibayar, centang "Lunas"; tidak perlu dicatat lagi sebagai pengeluaran.')),
    'card:obligations',
  );
}

function timelineCard(r) {
  const rows = r.days.map((d) => {
    const diff = d.planned - d.spent;
    let detail = `Jatah ${formatRupiah(d.planned)}`;
    let diffNode = null;
    if (d.state !== 'future') {
      detail = `${formatRupiah(d.spent)} dari ${formatRupiah(d.planned)}`;
      if (d.state === 'past') diffNode = h('span', { class: diff >= 0 ? 'is-under' : 'is-over' }, diff >= 0 ? `▲ hemat ${formatRupiah(diff)}` : `▼ lebih ${formatRupiah(-diff)}`);
    }
    return h(
      'li',
      { class: `timeline-day is-${d.state}`, 'data-key': `d:${d.date}` },
      h('span', { class: 'timeline-date' }, h('small', null, d.state === 'today' ? 'Hari ini' : dayLabel(d.date)), h('strong', null, String(Number(d.date.slice(8))))),
      h(
        'span',
        { class: 'timeline-main' },
        d.state === 'future' ? h('div', { class: 'bar bar-quiet' }) : progressBar(d.spent, d.planned, `${formatDateLong(d.date)}: ${detail}`, `pd:${d.date}`),
        h('span', { class: 'timeline-detail' }, detail, diffNode ? ' · ' : null, diffNode),
      ),
    );
  });
  return keyed(card('Hari demi hari', h('ol', { class: 'timeline' }, rows)), 'card:timeline');
}

function reverseCard(ctx, r) {
  const result = h('div', { class: 'calc-result', 'aria-live': 'polite' });
  const input = moneyInput({
    value: ctx.ui.plan.perDay,
    id: 'plan-perday',
    placeholder: 'Contoh: 50.000',
    onInput: (value) => {
      ctx.ui.plan.perDay = value;
      update();
    },
  });
  function update() {
    const perDay = ctx.ui.plan.perDay;
    if (!perDay) {
      result.replaceChildren(h('p', { class: 'muted' }, 'Ketik jumlah belanja per hari untuk melihat sampai kapan uangnya cukup.'));
      return;
    }
    const calc = reverseCalc(r, perDay);
    if (calc.enough) {
      result.replaceChildren(notice('success', `Cukup sampai ${formatDate(r.endDate)}. Masih sisa ${formatRupiah(calc.leftover)} di akhir.`));
    } else if (calc.days > 0) {
      result.replaceChildren(notice('warning', `Uangnya cukup ${calc.days} hari, sampai ${formatDateLong(calc.lastDay)}. Habis sekitar ${formatDateShort(calc.runsOutOn)}; kurang ${formatRupiah(calc.shortfall)}.`));
    } else {
      result.replaceChildren(notice('danger', `Tidak cukup untuk hari ini. Kurang ${formatRupiah(calc.shortfall)} sampai ${formatDate(r.endDate)}.`));
    }
  }
  update();
  return keyed(card('Kalau aku belanja … per hari', h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'plan-perday' }, 'Belanja per hari'), input.element), result), 'card:reverse');
}

function compare(label, before, after) {
  return h('div', { class: 'compare-row' }, h('dt', null, label), h('dd', null, money(before), h('span', { class: 'arrow', 'aria-label': 'menjadi' }, ' → '), money(after)));
}

function purchaseCard(ctx, plan) {
  const result = h('div', { class: 'calc-result', 'aria-live': 'polite' });
  const input = moneyInput({
    value: ctx.ui.plan.buy,
    id: 'plan-buy',
    placeholder: 'Contoh: 150.000',
    onInput: (value) => {
      ctx.ui.plan.buy = value;
      update();
    },
  });
  function update() {
    const amount = ctx.ui.plan.buy;
    if (!amount) {
      result.replaceChildren(h('p', { class: 'muted' }, 'Ketik harga barang untuk melihat jatah harian sebelum dan sesudah.'));
      return;
    }
    const sim = planPurchase(plan, store.getData().expenses, ctx.today, amount);
    result.replaceChildren(
      sim.after.sisaHariIni < 0 ? notice('danger', `Melebihi jatah hari ini sebesar ${formatRupiah(-sim.after.sisaHariIni)}.`) : notice('success', `Masih aman. Sisa hari ini jadi ${formatRupiah(sim.after.sisaHariIni)}.`),
      h(
        'dl',
        { class: 'compare' },
        compare('Sisa hari ini', sim.before.sisaHariIni, sim.after.sisaHariIni),
        sim.hasTomorrow
          ? compare('Jatah per hari mulai besok', sim.before.perDayFromTomorrow, sim.after.perDayFromTomorrow)
          : h('div', { class: 'compare-row' }, h('dt', null, 'Jatah mulai besok'), h('dd', { class: 'muted' }, 'Rencana selesai hari ini.')),
        h('div', { class: 'compare-row' }, h('dt', null, 'Status'), h('dd', null, statusBadge(sim.before.status), h('span', { class: 'arrow' }, ' → '), statusBadge(sim.after.status))),
      ),
      h('p', { class: 'hint' }, 'Hanya simulasi, tidak disimpan.'),
    );
  }
  update();
  return keyed(card('Kalau beli ini', h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'plan-buy' }, 'Harga barang'), input.element), result), 'card:purchase');
}

function endedCard(ctx, plan) {
  const s = planSummary(plan, ctx.data.expenses, ctx.today);
  return keyed(
    card(
      'Rencana sudah selesai',
      h('p', { class: 'muted' }, `${formatDate(plan.startDate)} – ${formatDate(plan.endDate)}`),
      h('dl', { class: 'totals' }, line('Bisa dibelanjakan', money(s.spendable)), line('Terpakai', money(s.spent)), line(s.leftover >= 0 ? 'Sisa' : 'Kurang', money(Math.abs(s.leftover)), 'is-strong is-big')),
      h(
        'div',
        { class: 'button-row' },
        h('button', { type: 'button', class: 'btn btn-primary', id: 'plan-archive', onclick: () => archive(ctx) }, 'Simpan ke riwayat'),
        h('button', { type: 'button', class: 'btn', onclick: () => newPlanFlow(ctx) }, icon('plus'), 'Rencana baru'),
      ),
    ),
    'card:ended',
  );
}

function historyCard(data) {
  if (!data.plans.history.length) return null;
  const rows = data.plans.history.map((e) =>
    h(
      'li',
      { class: 'row', 'data-key': `ph:${e.id}` },
      h(
        'span',
        { class: 'row-main' },
        h('span', { class: 'row-title', text: `${formatDateShort(e.startDate)} – ${formatDateShort(e.endDate, true)}` }),
        h('span', { class: 'row-sub', text: `Rencana ${formatRupiah(e.spendable)} · terpakai ${formatRupiah(e.spent)}${e.endedEarly ? ' · diakhiri lebih cepat' : ''}` }),
      ),
      h('span', { class: `row-amount ${e.leftover >= 0 ? 'is-under' : 'is-over'}` }, `${e.leftover >= 0 ? '▲ Sisa' : '▼ Kurang'} ${formatRupiah(Math.abs(e.leftover))}`),
    ),
  );
  return keyed(card('Riwayat rencana', h('ul', { class: 'rows' }, rows)), 'card:plan-history');
}

/* -------------------------------- actions -------------------------------- */

function summaryMessage(s) {
  return [
    `${formatDate(s.startDate)} – ${formatDate(s.endedOn < s.endDate ? s.endedOn : s.endDate)}`,
    `Bisa dibelanjakan ${formatRupiah(s.spendable)}, terpakai ${formatRupiah(s.spent)}.`,
    s.leftover >= 0 ? `Sisa ${formatRupiah(s.leftover)}. Hebat!` : `Kurang ${formatRupiah(-s.leftover)}. Tidak apa-apa, coba lagi di rencana berikutnya.`,
  ];
}

function archive(ctx) {
  try {
    const summary = store.endPlan(ctx.today);
    toast('Rencana disimpan ke riwayat.', 'success');
    return summary;
  } catch (err) {
    toast(errorMessage(err), 'error');
    return null;
  }
}

async function endPlanFlow(ctx) {
  const ok = await confirmDialog({
    title: 'Akhiri rencana?',
    message: 'Rencana ini disimpan ke riwayat beserta ringkasannya. Setelah itu kamu bisa membuat rencana baru.',
    confirmLabel: 'Akhiri',
    danger: true,
  });
  if (!ok) return;
  const summary = archive(ctx);
  if (summary) await alertDialog({ title: 'Rencana selesai', message: summaryMessage(summary) });
}

async function newPlanFlow(ctx) {
  if (store.getData().plans.active) {
    const ok = await confirmDialog({
      title: 'Akhiri rencana yang sekarang?',
      message: 'Hanya boleh ada satu rencana aktif. Rencana sekarang akan diakhiri dan disimpan ke riwayat dulu.',
      confirmLabel: 'Akhiri & buat baru',
    });
    if (!ok || !archive(ctx)) return;
  }
  openPlanForm(ctx);
}
