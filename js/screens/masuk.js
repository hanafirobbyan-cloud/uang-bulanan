// Jadwal Uang Masuk (MSK): this period's installments (with "Geser tanggal"),
// the monthly schedule editor and "Cara hitung".

import { append, h } from '../ui.js';
import { screenHeader, keyed } from '../components.js';
import { dailyBudget } from '../logic.js';
import { formatPeriod } from '../format.js';
import { incomePanel, arrivalBanners, scheduleCard, calcModeCard, openPeriodIncomeEditor } from '../income.js';

export const title = 'Jadwal Uang Masuk';

export function render(main, ctx) {
  const budget = dailyBudget(ctx.data, ctx.today);
  append(
    main,
    keyed(screenHeader('Jadwal Uang Masuk', `Periode ${formatPeriod(budget.period)}`), 'header'),
    ...arrivalBanners(ctx, budget.incomeStatus),
    incomePanel(ctx, budget, { title: 'Periode ini' }),
    keyed(
      h(
        'div',
        { class: 'button-row' },
        h('button', { type: 'button', class: 'btn', id: 'edit-period-income', onclick: () => openPeriodIncomeEditor(ctx, budget.period) }, 'Ubah uang masuk periode ini'),
      ),
      'period-actions',
    ),
    scheduleCard(ctx),
    calcModeCard(ctx),
  );
}
