/**
 * EduSTrader — Investment Dashboard JS Charts
 */

// Si Chart.js no está cargado globalmente, lo cargaremos desde CDN en el HTML

async function loadTickerChart(symbol) {
    const ctx = document.getElementById('dcf-chart');
    if (!ctx) return;

    try {
        const res = await fetch(`${API_BASE}/valuations?ticker=${symbol}&days=365`);
        const { success, data } = await res.json();
        
        if (success && data.history && data.history.length > 0) {
            
            // Extraer datos para el chart
            const labels = data.history.map(d => d.valuation_date);
            const prices = data.history.map(d => d.price_at_date);
            const dcfValues = data.history.map(d => d.dcf_intrinsic_value);

            // Reemplazar el placeholder por el canvas
            const container = ctx.parentElement;
            container.innerHTML = '<canvas id="dcf-chart-canvas" width="100%" height="300"></canvas>';
            
            const canvasCtx = document.getElementById('dcf-chart-canvas').getContext('2d');
            
            new Chart(canvasCtx, {
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
                            backgroundColor: 'transparent',
                            borderDash: [5, 5],
                            borderWidth: 2,
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
                            grid: { color: '#2A3142', drawBorder: false },
                            ticks: { color: '#94A3B8', maxTicksLimit: 8 }
                        },
                        y: {
                            grid: { color: '#2A3142', drawBorder: false },
                            ticks: {
                                color: '#94A3B8',
                                callback: function(value) { return '$' + value; }
                            }
                        }
                    }
                }
            });
        }
    } catch (err) {
        console.error('Error loading chart:', err);
        ctx.innerHTML = 'Error cargando gráfico.';
    }
}
