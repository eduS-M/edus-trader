/**
 * EduSTrader — Investment Dashboard JS Charts
 */

// Si Chart.js no está cargado globalmente, lo cargaremos desde CDN en el HTML

async function loadTickerChart(symbol) {
    const ctxDcf = document.getElementById('dcf-chart');
    const ctxPeg = document.getElementById('peg-chart');
    if (!ctxDcf) return;

    try {
        const res = await fetch(`${API_BASE}/valuations?ticker=${symbol}&days=1825`);
        const { success, data } = await res.json();
        
        if (success && data.history && data.history.length > 0) {
            
            // Extraer datos para el chart
            const labels = data.history.map(d => d.valuation_date);
            const prices = data.history.map(d => d.price_at_date);
            const dcfValues = data.history.map(d => d.dcf_intrinsic_value);
            const pegValues = data.history.map(d => d.peg_value);

            // Reemplazar los placeholders por canvas
            ctxDcf.innerHTML = '<canvas id="dcf-chart-canvas" width="100%" height="300"></canvas>';
            if (ctxPeg) {
                ctxPeg.innerHTML = '<canvas id="peg-chart-canvas" width="100%" height="250"></canvas>';
            }
            
            const canvasCtxDcf = document.getElementById('dcf-chart-canvas').getContext('2d');
            
            new Chart(canvasCtxDcf, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Precio de Mercado',
                            data: prices,
                            borderColor: '#3B82F6', // accent
                            backgroundColor: 'transparent',
                            borderWidth: 2,
                            pointRadius: 0,
                            tension: 0.1
                        },
                        {
                            label: 'Valor Intrínseco (DCF)',
                            data: dcfValues,
                            borderColor: '#10B981', // success
                            backgroundColor: 'rgba(16, 185, 129, 0.1)',
                            borderDash: [5, 5],
                            borderWidth: 2,
                            fill: true,
                            pointRadius: 0,
                            tension: 0.1
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: {
                        mode: 'index',
                        intersect: false,
                    },
                    plugins: {
                        legend: {
                            labels: { color: '#94A3B8' }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    let label = context.dataset.label || '';
                                    if (label) label += ': ';
                                    if (context.parsed.y !== null) {
                                        label += new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(context.parsed.y);
                                    }
                                    return label;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false },
                            ticks: { color: '#94A3B8', maxTicksLimit: 12 }
                        },
                        y: {
                            grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false },
                            ticks: {
                                color: '#94A3B8',
                                callback: function(value) { return '$' + value; }
                            }
                        }
                    }
                }
            });

            if (ctxPeg) {
                const canvasCtxPeg = document.getElementById('peg-chart-canvas').getContext('2d');
                new Chart(canvasCtxPeg, {
                    type: 'bar',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: 'PEG Ratio',
                            data: pegValues,
                            backgroundColor: pegValues.map(v => {
                                if (v === null) return 'rgba(156, 163, 175, 0.5)';
                                if (v < 1) return 'rgba(16, 185, 129, 0.7)'; // verde
                                if (v <= 2) return 'rgba(234, 179, 8, 0.7)'; // amarillo
                                return 'rgba(239, 68, 68, 0.7)'; // rojo
                            }),
                            borderRadius: 4
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                callbacks: {
                                    label: function(context) {
                                        let v = context.parsed.y;
                                        return v !== null ? 'PEG: ' + v.toFixed(2) : 'PEG: N/A';
                                    }
                                }
                            }
                        },
                        scales: {
                            x: {
                                grid: { display: false },
                                ticks: { color: '#94A3B8', maxTicksLimit: 12 }
                            },
                            y: {
                                grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false },
                                ticks: { color: '#94A3B8' }
                            }
                        }
                    }
                });
            }
        }
    } catch (err) {
        console.error('Error loading chart:', err);
        ctxDcf.innerHTML = 'Error cargando gráfico.';
    }
}
