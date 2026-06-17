/**
 * EduS Inversión — Dashboard JS v4
 */

const API_BASE = '/api/inversiones';

// ── Helpers ──────────────────────────────────────────────────────────────────
const formatMoney = (val) => {
    if (val === null || val === undefined) return '--';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
};

const formatPct = (val) => {
    if (val === null || val === undefined) return '--';
    const num = Number(val);
    const sign = num > 0 ? '+' : '';
    return `${sign}${num.toFixed(2)}%`;
};

const getSignalBadge = (signal) => {
    if (!signal || signal === 'n/a') return `<span class="signal-badge signal-na">N/A</span>`;
    const s = signal.toLowerCase().replace('_', '-');
    const label = signal.replace('_', ' ').toUpperCase();
    return `<span class="signal-badge signal-${s}">${label}</span>`;
};

const getScoreStars = (score) => {
    if (score === null || score === undefined) return '<span style="color:#4B5563;font-size:0.7rem;">--</span>';
    let html = '<div class="score-stars">';
    for (let i = 1; i <= 5; i++) {
        const cls = i <= score ? (score >= 4 ? 'excellent' : 'filled') : '';
        html += `<svg class="star ${cls}" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>`;
    }
    html += '</div>';
    return html;
};

// ── PORTAFOLIO ────────────────────────────────────────────────────────────────
async function loadPortfolio() {
    const tableBody = document.querySelector('#portfolio-table tbody');
    if (!tableBody) return;

    try {
        const res = await fetch(`${API_BASE}/portfolio`);
        const { success, data, error } = await res.json();

        if (!success) throw new Error(error);

        // Summary cards
        document.getElementById('portfolio-summary').innerHTML = `
            <div class="inv-stat-card">
                <span class="inv-stat-label">Valor Total Portafolio</span>
                <span class="inv-stat-value">${formatMoney(data.summary.total_value)}</span>
            </div>
            <div class="inv-stat-card">
                <span class="inv-stat-label">P&L Latente</span>
                <span class="inv-stat-value ${data.summary.total_pnl >= 0 ? 'positive' : 'negative'}">
                    ${formatMoney(data.summary.total_pnl)}<br>
                    <span style="font-size:1rem;">(${formatPct(data.summary.total_pnl_pct)})</span>
                </span>
            </div>
            <div class="inv-stat-card">
                <span class="inv-stat-label">Posiciones Activas</span>
                <span class="inv-stat-value">${data.summary.positions_count}</span>
            </div>
        `;

        if (data.positions.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:2rem;color:#94A3B8;">No hay posiciones activas.</td></tr>`;
            return;
        }

        tableBody.innerHTML = data.positions.map(p => `
            <tr>
                <td>
                    <a href="ticker.html?symbol=${p.ticker}" class="ticker-link">${p.ticker}</a>
                    <div class="text-xs text-muted" style="margin-top:3px;font-weight:400;">${p.name || '&nbsp;'}</div>
                </td>
                <td class="text-xs text-muted" style="max-width:120px;">${p.sector || p.instrument_type || '--'}</td>
                <td style="text-align:right;" class="font-medium">${p.quantity}</td>
                <td style="text-align:right;white-space:nowrap;" class="text-muted">${formatMoney(p.avg_price)}</td>
                <td style="text-align:right;white-space:nowrap;" class="font-medium">${formatMoney(p.last_price)}</td>
                <td style="text-align:right;white-space:nowrap;" class="font-bold">
                    <span style="color:${(p.unrealized_pnl || 0) >= 0 ? '#10B981' : '#EF4444'}">
                        ${formatPct(p.unrealized_pnl_pct)}
                    </span>
                </td>
                <td style="text-align:right;white-space:nowrap;">${p.peg_value ? p.peg_value.toFixed(2) : '--'}<br><span class="text-xs">${getSignalBadge(p.peg_signal)}</span></td>
                <td style="white-space:nowrap;">${formatMoney(p.dcf_intrinsic_value)}<br><span class="text-xs">${getSignalBadge(p.dcf_signal)}</span></td>
                <td style="white-space:nowrap;">${p.eps_next_5y_pct ? formatPct(p.eps_next_5y_pct * 100) : '--'}<br><span class="text-xs">${getSignalBadge(p.eps_signal)}</span></td>
                <td style="text-align:center;">${getScoreStars(p.positive_signals)}</td>
            </tr>
        `).join('');

    } catch (err) {
        console.error(err);
        tableBody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:#EF4444;padding:2rem;">Error cargando datos: ${err.message}</td></tr>`;
    }
}

// ── SCANNER ───────────────────────────────────────────────────────────────────
async function loadScanner() {
    const tableBody = document.querySelector('#scanner-table tbody');
    const filter = document.getElementById('scanner-filter').value;
    if (!tableBody) return;

    tableBody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:1.5rem;color:#94A3B8;">Escaneando el mercado...</td></tr>`;

    try {
        const res = await fetch(`${API_BASE}/scanner?filter=${filter}`);
        const { success, data, error } = await res.json();

        if (!success) throw new Error(error);

        if (data.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:1.5rem;color:#94A3B8;">No se encontraron oportunidades con este filtro.</td></tr>`;
            return;
        }

        tableBody.innerHTML = data.map(p => `
            <tr>
                <td>
                    <a href="ticker.html?symbol=${p.ticker}" class="ticker-link">${p.ticker}</a>
                    <div class="text-xs text-muted" style="margin-top:3px;font-weight:400;">${p.name || '&nbsp;'}</div>
                </td>
                <td class="text-xs text-muted" style="max-width:130px;">${p.sector || '--'}</td>
                <td style="text-align:right;white-space:nowrap;" class="font-medium">${formatMoney(p.last_price)}</td>
                <td style="text-align:right;white-space:nowrap;">${p.peg_value ? p.peg_value.toFixed(2) : '--'}<br><span class="text-xs">${getSignalBadge(p.peg_signal)}</span></td>
                <td style="text-align:right;white-space:nowrap;">
                    ${p.dcf_diff_pct ? `<span style="color:${p.dcf_diff_pct > 0 ? '#10B981' : '#EF4444'}">${formatPct(p.dcf_diff_pct * 100)}</span>` : '--'}
                </td>
                <td>${getSignalBadge(p.dcf_signal)}</td>
                <td>${getSignalBadge(p.pbv_signal)}</td>
                <td style="text-align:center;">${getScoreStars(p.positive_signals)}</td>
                <td>
                    <a href="cuestionario.html?symbol=${p.ticker}" style="display:inline-block;background:rgba(61,214,192,0.1);color:#3dd6c0;border:0.5px solid rgba(61,214,192,0.3);text-decoration:none;font-size:0.72rem;padding:3px 10px;border-radius:4px;font-weight:700;white-space:nowrap;font-family:'Montserrat',sans-serif;">📝 Analizar</a>
                </td>
            </tr>
        `).join('');

    } catch (err) {
        console.error(err);
        tableBody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:#EF4444;padding:1.5rem;">Error escaneando: ${err.message}</td></tr>`;
    }
}

// ── TICKER ────────────────────────────────────────────────────────────────────
async function loadTickerData(symbol) {
    try {
        const res = await fetch(`${API_BASE}/valuations?ticker=${symbol}`);
        const { success, data } = await res.json();

        if (success && data.latest) {
            const l = data.latest;

            // Header
            document.getElementById('t-symbol').textContent = l.ticker;
            const nameEl = document.getElementById('t-name');
            nameEl.textContent = l.name || '';
            nameEl.href = `https://finance.yahoo.com/quote/${l.ticker}`;
            document.getElementById('t-sector').textContent = `${l.sector || 'N/A'}`;
            document.getElementById('t-price').textContent = formatMoney(l.last_price);

            // Score
            document.getElementById('t-score').innerHTML = getScoreStars(l.positive_signals);

            // Signals
            document.getElementById('s-peg-val').textContent = l.peg_value ? l.peg_value.toFixed(2) : '--';
            document.getElementById('s-peg-badge').innerHTML = getSignalBadge(l.peg_signal);
            document.getElementById('s-peg-eps').textContent = l.peg_eps_growth ? formatPct(l.peg_eps_growth * 100) : '--';
            document.getElementById('s-peg-pe').textContent = l.peg_pe_used ? l.peg_pe_used.toFixed(2) : '--';

            document.getElementById('s-dcf-val').textContent = formatMoney(l.dcf_intrinsic_value);
            document.getElementById('s-dcf-badge').innerHTML = getSignalBadge(l.dcf_signal);
            document.getElementById('s-dcf-diff').innerHTML = l.dcf_diff_pct ?
                `<span style="color:${l.dcf_diff_pct > 0 ? '#10B981' : '#EF4444'}">${formatPct(l.dcf_diff_pct * 100)}</span>` : '--';

            document.getElementById('s-ddm-val').textContent = formatMoney(l.ddm_intrinsic_value);
            document.getElementById('s-ddm-badge').innerHTML = getSignalBadge(l.ddm_signal);
            document.getElementById('s-ddm-diff').innerHTML = l.ddm_diff_pct ?
                `<span style="color:${l.ddm_diff_pct > 0 ? '#10B981' : '#EF4444'}">${formatPct(l.ddm_diff_pct * 100)}</span>` : '--';

            document.getElementById('s-pbv-val').textContent = l.pbv_ratio ? l.pbv_ratio.toFixed(2) : '--';
            document.getElementById('s-pbv-badge').innerHTML = getSignalBadge(l.pbv_signal);
            document.getElementById('s-pbv-note').textContent = l.pbv_is_bank ? 'Umbral especial para sector Bancario (< 1.5)' : 'Umbral normal (< 0.5)';

            document.getElementById('s-eps-val').textContent = l.eps_next_5y_pct ? formatPct(l.eps_next_5y_pct * 100) : '--';
            document.getElementById('s-eps-badge').innerHTML = getSignalBadge(l.eps_signal);

            // 52-week range
            if (l.week_52_low && l.week_52_high && l.last_price) {
                document.getElementById('t-low').textContent = formatMoney(l.week_52_low);
                document.getElementById('t-high').textContent = formatMoney(l.week_52_high);
                const pct = ((l.last_price - l.week_52_low) / (l.week_52_high - l.week_52_low)) * 100;
                const safePct = Math.max(0, Math.min(100, pct));
                document.getElementById('t-bar').style.left = `${safePct}%`;
                document.getElementById('t-range-pct').textContent = `${safePct.toFixed(1)}%`;
                document.getElementById('t-change').innerHTML = `<span style="color:${l.price_change_pct >= 0 ? '#10B981' : '#EF4444'}">${formatPct(l.price_change_pct * 100)}</span>`;
            }

            // Risk section
            if (l.atr_14 && l.last_price) {
                document.getElementById('risk-section').style.display = 'block';
                document.getElementById('risk-atr').textContent = `ATR(14): ${l.atr_14.toFixed(2)}`;
                document.getElementById('risk-price').textContent = formatMoney(l.last_price);
                const sl = l.last_price - (2 * l.atr_14);
                const tp = l.last_price + (3 * l.atr_14);
                document.getElementById('risk-sl').textContent = formatMoney(sl);
                document.getElementById('risk-sl-pct').textContent = formatPct(((sl - l.last_price) / l.last_price) * 100);
                document.getElementById('risk-tp').textContent = formatMoney(tp);
                document.getElementById('risk-tp-pct').textContent = formatPct(((tp - l.last_price) / l.last_price) * 100);
            }
        }
    } catch (err) {
        console.error('Error loading ticker:', err);
    }
}
