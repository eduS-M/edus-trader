// ============================================================
// functions/lib/pricing.js
// Configuración centralizada de precios para los planes.
// ============================================================

export const USD_TO_CLP = 950; // Tipo de cambio referencial

export const PRICES = {
  basic: {
    monthly:  { usd: 15,   label: 'mes'       },
    annual:   { usd: 144,  label: 'año', monthlyEq: 12, saving: 20 },
    defined:  { usd: 39,   label: '3 meses'   },
  },
  pro: {
    monthly:  { usd: 29,   label: 'mes'       },
    annual:   { usd: 278,  label: 'año', monthlyEq: 23.2, saving: 20 },
    defined:  { usd: 75,   label: '3 meses'   },
  },
  premium: {
    monthly:  { usd: 49,   label: 'mes'       },
    annual:   { usd: 468,  label: 'año', monthlyEq: 39, saving: 20 },
    defined:  { usd: 129,  label: '3 meses'   },
    lifetime: { usd: 299,  label: 'pago único' },
  },
};

export function getPriceInCLP(plan, billingCycle) {
  const planData = PRICES[plan];
  if (!planData) return null;
  
  const billingData = planData[billingCycle];
  if (!billingData || billingData.usd === null) return null;

  return Math.round(billingData.usd * USD_TO_CLP);
}

export function getPriceInUSD(plan, billingCycle) {
  const planData = PRICES[plan];
  if (!planData) return null;
  
  const billingData = planData[billingCycle];
  if (!billingData || billingData.usd === null) return null;

  return billingData.usd;
}
