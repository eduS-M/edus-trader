/**
 * EduSTrader — Investment Dashboard JS Logic
 */

const API_BASE = '/api/inversiones';

// Helper: Formatear moneda
const formatMoney = (val) => {
    if (val === null || val === undefined) return '--';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
};

// Helper: Formatear porcentaje
const formatPct = (val) => {
    if (val === null || val === undefined) return '--';
    const num = Number(val);
    const sign = num > 0 ? '+' : '';
    return `${sign}${num.toFixed(2)}%`;
};

// Helper: Generar badge de señal
const getSignalBadge = (signal) => {
    if (!signal || signal === 'n/a') return `<span class="signal-badge signal-na">N/A</span>`;
    const s = signal.toLowerCase().replace('_', '-');
    const label = signal.replace('_', ' ').toUpperCase();
    return `<span class="signal-badge signal-${s}">${label}</span>`;
};

// Helper: Generar estrellas de score
const getScoreStars = (score) => {
    if (score === null || score === undefined) return '--';
    let html = '<div class="score-stars">';
    for (let i = 1; i <= 5; i++) {
        const cls = i <= score ? (score >= 4 ? 'excellent' : 'filled') : '';
        html += `<svg class="star ${cls}" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>`;
    }
    html += '</div>';
    return html;
};


// ==========================================
// COLUMN SORTING
// ==========================================

let sortState = { key: null, dir: 'asc' };

// Mapeo de data-sort-key a función que recibe (cellElement, textContent)
const SORT_PARSERS = {
    ticker:    (cell, text) => text.toLowerCase(),
    sector:    (cell, text) => text.toLowerCase(),
    ctd:       (cell, text) => parseFloat(text.replace(/[^0-9.\-]/g, '')) || 0,
    compra:    (cell, text) => parseFloat(text.replace(/[^0-9.\-]/g, '')) || 0,
    actual:    (cell, text) => parseFloat(text.replace(/[^0-9.\-]/g, '')) || 0,
    pnl:       (cell, text) => parseFloat(text.replace(/[^0-9.\-]/g, '')) || 0,
    peg:       (cell, text) => { const n = parseFloat(text.replace(/[^0-9.]/g, '')); return isNaN(n) ? -999 : n; },
    dcf:       (cell, text) => {
        const top = cell.querySelector('.stack-top');
        const val = top ? top.innerText.trim() : text;
        return parseFloat(val.replace(/[^0-9.\-]/g, '')) || 0;
    },
    earn_est:  (cell, text) => {
        const top = cell.querySelector('.stack-top');
        const val = top ? top.innerText.trim() : text;
        const pct = parseFloat(val.replace(/[^0-9.\-]/g, ''));
        if (!isNaN(pct)) return pct;
        // fallback: ordenar por señal
        const order = { 'ALTO': 2, 'MEDIO': 1, 'BAJO': 0, 'N/A': -1 };
        const found = Object.keys(order).find(k => text.toUpperCase().includes(k));
        return found !== undefined ? order[found] : -1;
    },
    score:     (cell, text) => cell.querySelectorAll('.star.filled, .star.excellent').length,
    precio:    (cell, text) => parseFloat(text.replace(/[^0-9.\-]/g, '')) || 0,
    var_dia:   (cell, text) => parseFloat(text.replace(/[^0-9.\-]/g, '')) || 0,
    ddm:       (cell, text) => {
        const order = { 'SUBVALORADA': 3, 'PRECIO JUSTO': 2, 'INVERTIBLE': 1, 'SOBREVALORADA': 0, 'N/A': -1 };
        const found = Object.keys(order).find(k => text.toUpperCase().includes(k));
        return found !== undefined ? order[found] : -1;
    },
    pbv:       (cell, text) => {
        const order = { 'SUBVALORADA': 3, 'PRECIO JUSTO': 2, 'INVERTIBLE': 1, 'SOBREVALORADA': 0, 'N/A': -1 };
        const found = Object.keys(order).find(k => text.toUpperCase().includes(k));
        return found !== undefined ? order[found] : -1;
    },
};

function sortTable(sortKey, headerEl) {
    const table = headerEl.closest('table');
    if (!table) return;
    const tbody = table.querySelector('tbody');
    const rows = Array.from(tbody.querySelectorAll('tr'));

    if (rows.length === 1 && rows[0].cells.length === 1 && rows[0].cells[0].colSpan > 1) return;
    // Saltar filas de mensaje (colspan > 1)
    const dataRows = rows.filter(r => r.cells.length > 1 && r.cells[0].colSpan <= 1);
    if (dataRows.length === 0) return;

    if (sortState.key === sortKey) {
        sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
    } else {
        sortState.key = sortKey;
        sortState.dir = 'asc';
    }

    table.querySelectorAll('th[data-sort-key]').forEach(th => {
        const sk = th.dataset.sortKey;
        const ind = th.querySelector('.sort-indicator');
        if (ind) {
            if (sk === sortKey) {
                ind.textContent = sortState.dir === 'asc' ? ' \u25B2' : ' \u25BC';
                ind.classList.add('active');
            } else {
                ind.textContent = '';
                ind.classList.remove('active');
            }
        }
    });

    const colIdx = headerEl.cellIndex;
    const parser = SORT_PARSERS[sortKey] || ((cell, text) => text.toLowerCase());

    dataRows.sort((a, b) => {
        const ca = a.cells[colIdx];
        const cb = b.cells[colIdx];
        let va = parser(ca, (ca ? ca.innerText.trim() : ''));
        let vb = parser(cb, (cb ? cb.innerText.trim() : ''));
        if (typeof va === 'string') {
            return sortState.dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
        }
        return sortState.dir === 'asc' ? va - vb : vb - va;
    });

    dataRows.forEach(row => tbody.appendChild(row));
}

// ==========================================
// COLUMN TOOLTIP
// ==========================================

function initColumnTooltip(tableId) {
    const tooltip = document.getElementById('col-tooltip');
    if (!tooltip) return;

    const selector = tableId ? `#${tableId} th[data-definition]` : 'th[data-definition]';
    const headers = document.querySelectorAll(selector);
    let hideTimeout = null;

    headers.forEach(th => {
        th.addEventListener('mouseenter', (e) => {
            clearTimeout(hideTimeout);
            const rect = th.getBoundingClientRect();
            tooltip.textContent = th.dataset.definition;
            tooltip.style.display = 'block';
            tooltip.style.visibility = 'hidden';
            tooltip.style.left = '0px';
            tooltip.style.top = '0px';
            const ttw = Math.min(360, rect.width * 2);
            tooltip.style.maxWidth = ttw + 'px';
            // Forzar reflow para medir altura real
            const ttH = tooltip.offsetHeight;
            const ttW = tooltip.offsetWidth || ttw;
            tooltip.style.visibility = 'visible';
            let left = rect.left + rect.width / 2 - ttW / 2;
            left = Math.max(8, Math.min(left, window.innerWidth - ttW - 8));
            tooltip.style.left = left + 'px';
            tooltip.style.top = (rect.top - ttH - 6) + 'px';
        });

        th.addEventListener('mouseleave', () => {
            hideTimeout = setTimeout(() => {
                tooltip.style.display = 'none';
            }, 250);
        });

        th.addEventListener('click', (e) => {
            const sk = th.dataset.sortKey;
            if (sk) sortTable(sk, th);
        });
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('th[data-definition]')) {
            tooltip.style.display = 'none';
        }
    });
}

// ==========================================
// PORTAFOLIO LOGIC
// ==========================================

async function loadPortfolio() {
    const tableBody = document.querySelector('#portfolio-table tbody');
    if (!tableBody) return;

    try {
        const res = await fetch(`${API_BASE}/portfolio`);
        const { success, data, error } = await res.json();

        if (!success) throw new Error(error);

        // Update Summary
        document.getElementById('portfolio-summary').innerHTML = `
            <div class="inv-stat-card">
                <span class="inv-stat-label">Valor Total Portafolio</span>
                <span class="inv-stat-value">${formatMoney(data.summary.total_value)}</span>
            </div>
            <div class="inv-stat-card">
                <span class="inv-stat-label">P&L Latente</span>
                <span class="inv-stat-value ${data.summary.total_pnl >= 0 ? 'positive' : 'negative'}">
                    ${formatMoney(data.summary.total_pnl)} (${formatPct(data.summary.total_pnl_pct)})
                </span>
            </div>
            <div class="inv-stat-card">
                <span class="inv-stat-label">Posiciones Activas</span>
                <span class="inv-stat-value">${data.summary.positions_count}</span>
            </div>
        `;

        // Update Table
        if (data.positions.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="10" style="text-align: center;">No hay posiciones activas.</td></tr>`;
            return;
        }

        tableBody.innerHTML = data.positions.map(p => `
            <tr>
                <td>
                    <a href="ticker.html?symbol=${p.ticker}" class="ticker-link">${p.ticker}</a>
                    <div class="text-xs text-muted">${p.name || '--'}</div>
                </td>
                <td class="text-sm">${p.sector || p.instrument_type}</td>
                <td class="td-center font-medium">${p.quantity}</td>
                <td class="td-center text-muted">${formatMoney(p.avg_price)}</td>
                <td class="td-center font-medium">${formatMoney(p.last_price)}</td>
                <td class="td-center font-bold ${p.unrealized_pnl >= 0 ? 'positive' : 'negative'}">
                    <span style="color: ${p.unrealized_pnl >= 0 ? 'var(--signal-subvalorada)' : 'var(--signal-sobrevalorada)'}">
                        ${formatPct(p.unrealized_pnl_pct)}
                    </span>
                </td>
                <td class="td-center">
                    <div class="stack-cell">
                        <div class="stack-top">${p.peg_value ? p.peg_value.toFixed(2) : '--'}</div>
                        <div class="stack-bot">${getSignalBadge(p.peg_signal)}</div>
                    </div>
                </td>
                <td class="td-center">
                    <div class="stack-cell">
                        <div class="stack-top">${formatMoney(p.dcf_intrinsic_value)}</div>
                        <div class="stack-bot">${getSignalBadge(p.dcf_signal)}</div>
                    </div>
                </td>
                <td class="td-center">
                    <div class="stack-cell">
                        <div class="stack-top">${p.eps_next_5y_pct != null ? (p.eps_next_5y_pct * 100).toFixed(1) + '%' : '--'}</div>
                        <div class="stack-bot">${getSignalBadge(p.eps_signal)}</div>
                    </div>
                </td>
                <td class="td-center">${getScoreStars(p.positive_signals)}</td>
            </tr>
        `).join('');

    } catch (err) {
        console.error(err);
        tableBody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: var(--signal-sobrevalorada);">Error cargando datos: ${err.message}</td></tr>`;
    }
}


// ==========================================
// SCANNER LOGIC
// ==========================================

async function loadScanner() {
    const tableBody = document.querySelector('#scanner-table tbody');
    const filter = document.getElementById('scanner-filter').value;
    if (!tableBody) return;

    tableBody.innerHTML = `<tr><td colspan="8" style="text-align: center;">Escaneando el mercado...</td></tr>`;

    try {
        const res = await fetch(`${API_BASE}/scanner?filter=${filter}`);
        const { success, data, error } = await res.json();

        if (!success) throw new Error(error);

        if (data.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="8" style="text-align: center;">No se encontraron oportunidades con este filtro.</td></tr>`;
            return;
        }

        tableBody.innerHTML = data.map(p => {
            const dcfColor = p.dcf_diff_pct < 0 ? 'var(--signal-subvalorada)' : 'var(--signal-sobrevalorada)';
            return `
            <tr>
                <td>
                    <a href="ticker.html?symbol=${p.ticker}" class="ticker-link">${p.ticker}</a>
                    <div class="text-xs text-muted">${p.name || '--'}</div>
                </td>
                <td class="text-sm">${p.sector || '--'}</td>
                <td class="td-center font-medium">${formatMoney(p.last_price)}</td>
                <td class="td-center">
                    <div class="stack-cell">
                        <div class="stack-top">${p.peg_value != null ? p.peg_value.toFixed(2) : '--'}</div>
                        <div class="stack-bot">${getSignalBadge(p.peg_signal)}</div>
                    </div>
                </td>
                <td class="td-center">
                    <div class="stack-cell">
                        <div class="stack-top" style="color:${dcfColor}">${p.dcf_diff_pct ? formatPct(p.dcf_diff_pct * 100) : '--'}</div>
                        <div class="stack-bot">${getSignalBadge(p.dcf_signal)}</div>
                    </div>
                </td>
                <td class="td-center">${getSignalBadge(p.pbv_signal)}</td>
                <td class="td-center">${getScoreStars(p.positive_signals)}</td>
                <td>
                    <a href="cuestionario.html?symbol=${p.ticker}" style="color: var(--inv-text-secondary); text-decoration: none; font-size: 0.875rem;">📝 Analizar</a>
                </td>
            </tr>
        `}).join('');

    } catch (err) {
        console.error(err);
        tableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--signal-sobrevalorada);">Error escaneando: ${err.message}</td></tr>`;
    }
}
