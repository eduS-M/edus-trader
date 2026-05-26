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
            tableBody.innerHTML = `<tr><td colspan="11" style="text-align: center;">No hay posiciones activas.</td></tr>`;
            return;
        }

        tableBody.innerHTML = data.positions.map(p => `
            <tr>
                <td>
                    <a href="ticker.html?symbol=${p.ticker}" class="ticker-link">${p.ticker}</a>
                    <div class="text-xs text-muted">${p.name || '--'}</div>
                </td>
                <td class="text-sm">${p.sector || p.instrument_type}</td>
                <td style="text-align: right;" class="font-medium">${p.quantity}</td>
                <td style="text-align: right;" class="text-muted">${formatMoney(p.avg_price)}</td>
                <td style="text-align: right;" class="font-medium">${formatMoney(p.last_price)}</td>
                <td style="text-align: right;" class="font-bold ${p.unrealized_pnl >= 0 ? 'positive' : 'negative'}">
                    <span style="color: ${p.unrealized_pnl >= 0 ? 'var(--signal-subvalorada)' : 'var(--signal-sobrevalorada)'}">
                        ${formatPct(p.unrealized_pnl_pct)}
                    </span>
                </td>
                <td>${p.peg_value ? p.peg_value.toFixed(2) : '--'} ${getSignalBadge(p.peg_signal)}</td>
                <td>${formatMoney(p.dcf_intrinsic_value)}</td>
                <td>${getSignalBadge(p.dcf_signal)}</td>
                <td>${getSignalBadge(p.eps_signal)}</td>
                <td>${getScoreStars(p.positive_signals)}</td>
            </tr>
        `).join('');

    } catch (err) {
        console.error(err);
        tableBody.innerHTML = `<tr><td colspan="11" style="text-align: center; color: var(--signal-sobrevalorada);">Error cargando datos: ${err.message}</td></tr>`;
    }
}


// ==========================================
// SCANNER LOGIC
// ==========================================

async function loadScanner() {
    const tableBody = document.querySelector('#scanner-table tbody');
    const filter = document.getElementById('scanner-filter').value;
    if (!tableBody) return;

    tableBody.innerHTML = `<tr><td colspan="9" style="text-align: center;">Escaneando el mercado...</td></tr>`;

    try {
        const res = await fetch(`${API_BASE}/scanner?filter=${filter}`);
        const { success, data, error } = await res.json();

        if (!success) throw new Error(error);

        if (data.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="9" style="text-align: center;">No se encontraron oportunidades con este filtro.</td></tr>`;
            return;
        }

        tableBody.innerHTML = data.map(p => `
            <tr>
                <td>
                    <a href="ticker.html?symbol=${p.ticker}" class="ticker-link">${p.ticker}</a>
                    <div class="text-xs text-muted">${p.name || '--'}</div>
                </td>
                <td class="text-sm">${p.sector || '--'}</td>
                <td style="text-align: right;" class="font-medium">${formatMoney(p.last_price)}</td>
                <td style="text-align: right;">${p.peg_value ? p.peg_value.toFixed(2) : '--'} ${getSignalBadge(p.peg_signal)}</td>
                <td style="text-align: right;" class="${p.dcf_diff_pct > 0 ? 'positive' : 'negative'}">
                    ${p.dcf_diff_pct ? `<span style="color: ${p.dcf_diff_pct > 0 ? 'var(--signal-subvalorada)' : 'var(--signal-sobrevalorada)'}">${formatPct(p.dcf_diff_pct * 100)}</span>` : '--'}
                </td>
                <td>${getSignalBadge(p.dcf_signal)}</td>
                <td>${getSignalBadge(p.pbv_signal)}</td>
                <td style="text-align: center;">${getScoreStars(p.positive_signals)}</td>
                <td>
                    <a href="cuestionario.html?symbol=${p.ticker}" style="color: var(--inv-text-secondary); text-decoration: none; font-size: 0.875rem;">📝 Analizar</a>
                </td>
            </tr>
        `).join('');

    } catch (err) {
        console.error(err);
        tableBody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--signal-sobrevalorada);">Error escaneando: ${err.message}</td></tr>`;
    }
}
