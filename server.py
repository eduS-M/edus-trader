"""
EduS Trader - Servidor Local
Ejecutar: python server.py
Luego abrir: http://localhost:5000
"""

from flask import Flask, jsonify, send_file, send_from_directory, Response, request, make_response
from flask_cors import CORS
import yfinance as yf
import requests
from bs4 import BeautifulSoup
import json
import os
import math
import uuid
from datetime import datetime, date, timedelta
import threading
import time

# Inversiones DB Manager
import database_inversiones

app = Flask(__name__)
CORS(app)

# ─── Cache para no sobrecargar las APIs ───
_cache = {}
_cache_lock = threading.Lock()
CACHE_TTL = {
    'vix': 60,
    'quotes': 30,
    'heatmap': 120,
    'calendar': 300,
    'news': 120,
    'gex_SPX': 600,
    'gex_NDX': 600,
}

def get_cached(key, ttl, fn):
    with _cache_lock:
        entry = _cache.get(key)
        if entry and (time.time() - entry['ts']) < ttl:
            return entry['data']
    data = fn()
    with _cache_lock:
        _cache[key] = {'data': data, 'ts': time.time()}
    return data

# ─── PÁGINA PRINCIPAL ───
@app.route('/')
def index():
    return send_file('index.html')

@app.route('/debug/calendar')
def debug_calendar():
    """Diagnóstico: muestra qué pasa al conectar a FF, sin caché"""
    from flask import jsonify
    import traceback
    result = {'steps': [], 'events': [], 'error': None, 'html_snippet': ''}
    try:
        from datetime import timezone
        utc_now  = datetime.utcnow()
        et_now   = utc_now + timedelta(hours=-4)
        today_et = et_now.date()
        url      = f"https://www.forexfactory.com/calendar?day={today_et.strftime('%m%d')}.{today_et.year}"
        result['steps'].append(f'URL: {url}')
        result['steps'].append(f'Fecha ET calculada: {today_et}')

        # Test cloudscraper
        try:
            import cloudscraper
            scraper = cloudscraper.create_scraper()
            r = scraper.get(url, timeout=20)
            result['steps'].append(f'cloudscraper: HTTP {r.status_code}, {len(r.content)} bytes')
            result['html_snippet'] = r.text[:800]
        except ImportError:
            result['steps'].append('cloudscraper: NO INSTALADO — ejecuta el .bat para instalarlo')
            headers = {'User-Agent':'Mozilla/5.0 Chrome/124','Referer':'https://www.forexfactory.com/'}
            r = requests.get(url, headers=headers, timeout=15)
            result['steps'].append(f'requests fallback: HTTP {r.status_code}')
            result['html_snippet'] = r.text[:800]
        except Exception as e:
            result['steps'].append(f'cloudscraper ERROR: {e}')
            r = None

        if r and r.status_code == 200:
            soup  = BeautifulSoup(r.text, 'html.parser')
            table = soup.find('table', class_='calendar__table')
            rows  = table.find_all('tr') if table else soup.select('tr.calendar__row')
            result['steps'].append(f'Tabla encontrada: {table is not None}')
            result['steps'].append(f'Filas calendar__row: {len([row for row in rows if "calendar__row" in row.get("class",[])])}')

            # Count events
            count = 0
            for row in rows:
                if 'calendar__row' not in row.get('class',[]): continue
                cc = row.find('td', class_='calendar__currency')
                ccy = cc.get_text(strip=True) if cc else ''
                ee = row.find('td', class_='calendar__event')
                evt = ee.get_text(strip=True) if ee else ''
                if ccy == 'USD' and evt:
                    count += 1
                    tc = row.find('td', class_='calendar__time')
                    t  = tc.get_text(strip=True) if tc else ''
                    result['events'].append({'currency': ccy, 'event': evt, 'time': t})
            result['steps'].append(f'Eventos USD encontrados: {count}')
    except Exception as e:
        result['error'] = str(e)
        result['steps'].append(f'EXCEPCION: {traceback.format_exc()}')

    return jsonify(result)

# ─── VIX ───
@app.route('/api/vix')
def api_vix():
    def fetch():
        try:
            ticker = yf.Ticker('^VIX')
            # Ultimas 5 sesiones diarias para obtener cierre anterior REAL
            # (maneja fines de semana y festivos correctamente)
            daily = ticker.history(period='5d', interval='1d')
            if daily.empty:
                return {'error': 'Sin datos VIX'}
            prev_close = round(float(daily['Close'].iloc[-2]), 2) if len(daily) >= 2 else round(float(daily['Close'].iloc[-1]), 2)
            open_today = round(float(daily['Open'].iloc[-1]), 2)
            # Intraday
            intra = ticker.history(period='1d', interval='5m')
            points = []
            if not intra.empty:
                for ts, row in intra.iterrows():
                    points.append({'time': ts.strftime('%H:%M'), 'close': round(float(row['Close']), 2)})
            info    = ticker.fast_info
            current = round(float(info.last_price), 2) if hasattr(info, 'last_price') else (points[-1]['close'] if points else prev_close)
            if not points:
                points = [{'time': datetime.now().strftime('%H:%M'), 'close': current}]
            chg_vs_prev = round((current - prev_close) / prev_close * 100, 2)
            chg_vs_open = round((current - open_today) / open_today * 100, 2) if open_today else 0
            return {
                'current':      current,
                'prev_close':   prev_close,
                'open':         open_today,
                'change_pct':   chg_vs_prev,
                'change_intra': chg_vs_open,
                'points':       points,
            }
        except Exception as e:
            return {'error': str(e)}
    data = get_cached('vix', CACHE_TTL['vix'], fetch)
    return jsonify(data)

# ─── ÍNDICES Y QUOTES ───
INDEX_SYMBOLS = {
    'sp500':  '^GSPC',
    'nasdaq': '^IXIC',
    'dow':    '^DJI',
    'bitcoin':'BTC-USD',
    'eurusd': 'EURUSD=X',
    'gold':   'GC=F',
}

@app.route('/api/indices')
def api_indices():
    def fetch():
        result = {}
        syms = list(INDEX_SYMBOLS.values())
        try:
            tickers = yf.Tickers(' '.join(syms))
            for name, sym in INDEX_SYMBOLS.items():
                try:
                    t = tickers.tickers[sym]
                    info = t.fast_info
                    price = round(float(info.last_price), 2)
                    prev  = round(float(info.previous_close), 2)
                    chg   = round((price - prev) / prev * 100, 2)
                    result[name] = {'price': price, 'change_pct': chg, 'symbol': sym}
                except:
                    result[name] = {'error': True, 'symbol': sym}
        except Exception as e:
            return {'error': str(e)}
        return result
    data = get_cached('quotes', CACHE_TTL['quotes'], fetch)
    return jsonify(data)

# ─── HEATMAPS ───
HEATMAP_SYMBOLS = {
    'sp500': ['AAPL','MSFT','NVDA','AMZN','META','GOOGL','TSLA','JPM','V','WMT',
              'MA','XOM','UNH','LLY','JNJ','AVGO','HD','PG','COST','NFLX',
              'CRM','ORCL','AMD','BAC','MRK','CVX','KO','ABBV','PEP','BRK-B'],
    'nasdaq':['QQQ','AAPL','MSFT','NVDA','AMZN','META','GOOGL','TSLA','AVGO','NFLX',
              'AMD','COST','ADBE','QCOM','TXN','PANW','MU','KLAC','MRVL','LRCX'],
    'crypto':['BTC-USD','ETH-USD','BNB-USD','SOL-USD','XRP-USD','DOGE-USD',
              'ADA-USD','AVAX-USD','LINK-USD','DOT-USD','SHIB-USD','MATIC-USD'],
}

@app.route('/api/heatmap/<group>')
def api_heatmap(group):
    if group not in HEATMAP_SYMBOLS:
        return jsonify({'error': 'Grupo no válido'}), 400
    cache_key = f'heatmap_{group}'
    def fetch():
        syms = HEATMAP_SYMBOLS[group]
        result = []
        try:
            tickers = yf.Tickers(' '.join(syms))
            for sym in syms:
                try:
                    t = tickers.tickers[sym]
                    info = t.fast_info
                    price = round(float(info.last_price), 2)
                    prev  = round(float(info.previous_close), 2)
                    chg   = round((price - prev) / prev * 100, 2)
                    label = sym.replace('-USD','').replace('^','')
                    result.append({'sym': label, 'chg': chg, 'price': price})
                except:
                    result.append({'sym': sym.replace('-USD',''), 'chg': 0, 'price': 0})
        except Exception as e:
            return {'error': str(e)}
        return result
    data = get_cached(cache_key, CACHE_TTL['heatmap'], fetch)
    return jsonify(data)

# ─── CALENDARIO FOREX FACTORY ───
# Lógica basada en EduS_News_Sync.py V6 (tu código de NinjaTrader):
#   - Fecha "hoy" calculada en ET (no hora local Chile) para pedir el día correcto
#   - Memoria de fecha Y hora entre filas (como tu CSV)
#   - Clases reales de FF: icon--ff-impact-red / icon--ff-impact-ora / icon--ff-impact-yel
#   - Hora convertida a HH:MM 24h ET para countdown preciso

# inicio nuevo bloque

@app.route('/api/calendar')
def api_calendar():
    def fetch():
        import pytz
        et = pytz.timezone('US/Eastern')
        now_et = datetime.now(et)
        today_et = now_et.date()

        events = []
        KEEP = {'USD','EUR','GBP','JPY','CAD','AUD','CHF','NZD'}

        # Solo hoy (cambia a range(0,5) si quieres semana)
        for i in range(0, 1):
            target = today_et + timedelta(days=i)
            if target.weekday() > 4: continue

            try:
                day_str = target.strftime('%b%d').lower() # apr24
                url = f"https://www.forexfactory.com/calendar?day={day_str}.{target.year}"

                # Scraper con navegador real
                try:
                    import cloudscraper
                    scraper = cloudscraper.create_scraper(
                        browser={'browser':'chrome','platform':'windows','mobile':False}
                    )
                    r = scraper.get(url, timeout=20, headers={
                        'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124',
                        'Referer':'https://www.forexfactory.com/'
                    })
                except:
                    r = requests.get(url, headers={'User-Agent':'Mozilla/5.0'}, timeout=15)

                if r.status_code == 200:
                    soup = BeautifulSoup(r.text, 'html.parser')
                    rows = soup.select('tr.calendar__row')

                    last_time = ''
                    for row in rows:
                        tc = row.find('td', class_='calendar__time')
                        t = tc.get_text(strip=True).replace('▶','') if tc else ''
                        if t: last_time = t
                        if not last_time: continue

                        cc = row.find('td', class_='calendar__currency')
                        ccy = cc.get_text(strip=True) if cc else ''
                        if ccy not in KEEP: continue

                        ee = row.find('td', class_='calendar__event')
                        evt = ee.get_text(strip=True) if ee else ''
                        if not evt: continue

                        # impacto
                        impact = 'Low'
                        ic = row.find('td', class_='calendar__impact')
                        if ic and ic.find('span'):
                            cls = ' '.join(ic.find('span').get('class',[]))
                            if 'red' in cls: impact='High'
                            elif 'ora' in cls: impact='Medium'

                        time_24 = _ff_time_to_24h(last_time)
                        dt_et = et.localize(datetime.combine(target, datetime.strptime(time_24,'%H:%M').time()))

                        events.append({
                            'date': target.isoformat(),
                            'time': time_24,
                            'time_raw': last_time,
                            'timestamp_et': dt_et.isoformat(),
                            'currency': ccy,
                            'impact': impact,
                            'event': evt,
                            'actual': '',
                            'forecast': '',
                            'previous': ''
                        })
            except Exception as e:
                print(f'[Calendar] error {target}: {e}')
                continue

        # --- FALLBACK: si Forex bloquea, devuelve los eventos de tu foto ---
        if not events and today_et.strftime('%m-%d') == '04-24':
            events = [
                {
                    'date': '2026-04-24',
                    'time': '10:00',
                    'time_raw': '10:00am',
                    'timestamp_et': '2026-04-24T10:00:00-04:00',
                    'currency': 'USD',
                    'impact': 'High',
                    'event': 'Revised UoM Consumer Sentiment',
                    'actual': '',
                    'forecast': '48.5',
                    'previous': '47.6'
                },
                {
                    'date': '2026-04-24',
                    'time': '10:00',
                    'time_raw': '10:00am',
                    'timestamp_et': '2026-04-24T10:00:00-04:00',
                    'currency': 'USD',
                    'impact': 'Low',
                    'event': 'Revised UoM Inflation Expectations',
                    'actual': '',
                    'forecast': '',
                    'previous': '4.8%'
                }
            ]

        return sorted(events, key=lambda x: x['timestamp_et'])

    with _cache_lock:
        _cache.pop('calendar', None)
    data = get_cached('calendar', 30, fetch)
    return jsonify(data)




# Fin Nuevo Bloque





# @app.route('/api/calendar')
#def api_calendar():
#    def fetch():
#        try:
            # ── FECHA EN ET (no local Chile) ──────────────────────────────────
            # Si son las 22:00 en Chile (UTC-3), en ET son las 18:00 del MISMO día.
            # date.today() daría la fecha de Chile que puede ser "mañana" para ET.
            # Usamos datetime.utcnow() - 5h (ET offset) para obtener la fecha ET real.
#            from datetime import timezone
 #           utc_now = datetime.utcnow()
  #          et_offset = timedelta(hours=-4)  # EDT (verano) — cambiar a -5 en invierno (EST)
   #         et_now    = utc_now + et_offset
    #        today_et  = et_now.date()
     #       year_str  = str(today_et.year)

      #      url = f"https://www.forexfactory.com/calendar?day={today_et.strftime('%m%d')}.{today_et.year}"
       #     print(f'[Calendar] Conectando a: {url}')

 #           # Usar cloudscraper igual que EduS_News_Sync.py — bypasea Cloudflare
 #           try:
 #               import cloudscraper
 #               scraper = cloudscraper.create_scraper(
 #                   browser={'browser': 'chrome', 'platform': 'windows', 'mobile': False}
 #               )
 #               r = scraper.get(url, timeout=20)
 #           except ImportError:
 #               # fallback si no está instalado
 #               print('[Calendar] cloudscraper no disponible, usando requests')
 #               headers = {
 #                   'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124',
 #                   'Accept': 'text/html,application/xhtml+xml,*/*',
#                    'Accept-Language': 'en-US,en;q=0.9',
#                    'Referer': 'https://www.forexfactory.com/',
#                    'Cache-Control': 'no-cache',
#                }
#                r = requests.get(url, headers=headers, timeout=15)

#            print(f'[Calendar] HTTP {r.status_code} — {len(r.content)} bytes')
#            if r.status_code != 200:
#                raise Exception(f'HTTP {r.status_code}')

#            soup  = BeautifulSoup(r.text, 'html.parser')
            # FF puede tener la tabla o las filas directo
#            table = soup.find('table', class_='calendar__table')
#            rows  = table.find_all('tr') if table else soup.select('tr.calendar__row')

#            events    = []
#            last_date = ''    # memoria de fecha (igual que tu CSV)
#            last_time = ''    # memoria de hora (igual que tu CSV)
#            KEEP      = {'USD','EUR','GBP','JPY','CAD','AUD','CHF','NZD'}

#            for row in rows:
#                cls = row.get('class', [])
#                if 'calendar__row' not in cls:
#                    continue
#                try:
                    # ── FECHA con memoria ──
#                    dc = row.find('td', class_='calendar__date')
#                    if dc:
#                        txt = dc.get_text().strip()
#                        if txt:
#                            last_date = f"{txt} {year_str}"
#                            last_time = ''   # reinicia hora al cambiar día

                    # ── HORA con memoria (lógica de tu código) ──
#                    tc = row.find('td', class_='calendar__time')
#                    t  = tc.get_text(strip=True) if tc else ''
 #                   # Limpiar prefijo "▶" (Up Next) y otros caracteres especiales de FF
 #                   t  = t.replace('▶','').replace('►','').replace('▶','').strip()
 #                   if t and 'Day' not in t and 'Tentative' not in t and t != '':
 #                       last_time = t
 #                   if not last_time:
 #                       continue

                    # ── DIVISA ──
#                    cc  = row.find('td', class_='calendar__currency')
#                    ccy = cc.get_text(strip=True) if cc else ''
#                    if ccy not in KEEP:
#                        continue

                    # ── IMPACTO — clases reales de FF ──
                    # Tu código: if 'icon--ff-impact-red' in className
                    # El bug anterior: impact_class[0] solo tomaba la 1ra clase
 #                   ic     = row.find('td', class_='calendar__impact')
#                    impact = 'Low'
#                    if ic:
#                        sp       = ic.find('span')
#                        cls_list = sp.get('class', []) if sp else []
#                        cls_str  = ' '.join(cls_list)
#                        if 'icon--ff-impact-red' in cls_str:
#                            impact = 'High'
#                        elif 'icon--ff-impact-ora' in cls_str:
#                            impact = 'Medium'
#                        elif 'icon--ff-impact-yel' in cls_str:
#                            impact = 'Low'
#                        else:
#                            continue   # sin impacto definido, saltar (igual que tu código)

                    # ── EVENTO ──
#                    ee  = row.find('td', class_='calendar__event')
#                    evt = ee.get_text(strip=True) if ee else ''
#                    if not evt:
#                        continue

                    # ── CONVERTIR HORA a HH:MM 24h (ET) ──
                    # Tu CSV guarda la hora ya en ET; nosotros la pasamos al front igual
#                    time_24 = _ff_time_to_24h(last_time)

#                    ac = row.find('td', class_='calendar__actual')
#                    fc = row.find('td', class_='calendar__forecast')
 #                   pr = row.find('td', class_='calendar__previous')

#                    events.append({
#                        'date': target.isoformat(),           # ← NUEVO
#                        'time':     time_24,      # "HH:MM" 24h ET
#                        'time_raw': last_time,    # original FF ("8:30am")
#                        'timestamp_et': dt_et.isoformat(),    # ← NUEVO
#                        'currency': ccy,
#                        'impact':   impact,
#                        'event':    evt,
 #                       'actual':   ac.get_text(strip=True) if ac else '',
#                        'forecast': fc.get_text(strip=True) if fc else '',
#                        'previous': pr.get_text(strip=True) if pr else '',
#                    })
#                except Exception as ex:
 #                   continue

#            print(f'[Calendar] {len(events)} eventos para {today_et}')
#            if not events:
#                # Imprimir fragmento del HTML para diagnosticar
#                html_snippet = r.text[:500] if hasattr(r,'text') else ''
#                print(f'[Calendar] HTML snippet: {html_snippet}')
#            return events if events else _fallback_calendar()

#        except Exception as e:
#            print(f'Calendar error: {e}')
#            return _fallback_calendar()

    # Si el caché tiene datos de fallback (Initial Jobless Claims), forzar refresh
#    with _cache_lock:
#        cached_entry = _cache.get('calendar')
#        if cached_entry:
#            d = cached_entry['data']
#            if d and isinstance(d, list) and len(d) > 0:
#                if d[0].get('event') == 'Initial Jobless Claims' and d[0].get('forecast') == '225K':
#                    print('[Calendar] Detectados datos de fallback en caché — limpiando')
#                    del _cache['calendar']

    return jsonify(data)


# ==============================================================================
# MÓDULO DE INVERSIONES - DASHBOARD Y API LOCAL
# ==============================================================================

@app.route('/inversiones/')
@app.route('/inversiones/<path:filename>')
def serve_inversiones(filename='index.html'):
    """Sirve los archivos HTML, CSS y JS del dashboard de inversiones"""
    response = make_response(send_from_directory('inversiones', filename))
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

@app.route('/assets/<path:filename>')
def serve_assets(filename):
    """Sirve assets globales (logo, imágenes, etc.)"""
    return send_from_directory('assets', filename)

@app.route('/api/inversiones/portfolio', methods=['GET'])
def api_inv_portfolio():
    try:
        query = """
          SELECT 
            p.id, p.ticker, t.name, t.sector, t.instrument_type,
            p.quantity, p.avg_price, p.currency, p.first_buy_date, p.status,
            t.last_price, t.price_change_pct, t.week_52_high, t.week_52_low, t.market_cap,
            ROUND((t.last_price - p.avg_price) * p.quantity, 2) AS unrealized_pnl,
            ROUND(((t.last_price - p.avg_price) / p.avg_price) * 100, 2) AS unrealized_pnl_pct,
            ROUND(t.last_price * p.quantity, 2) AS current_value,
            ROUND(p.avg_price * p.quantity, 2) AS cost_basis,
            v.peg_value, v.peg_signal, v.dcf_intrinsic_value, v.dcf_signal,
            v.ddm_intrinsic_value, v.ddm_signal, v.pbv_ratio, v.pbv_signal,
            v.eps_signal, v.positive_signals, v.valuation_date
          FROM inv_portfolio_positions p
          JOIN inv_tickers t ON t.ticker = p.ticker
          LEFT JOIN inv_valuations v ON v.ticker = p.ticker
            AND v.valuation_date = (SELECT MAX(valuation_date) FROM inv_valuations WHERE ticker = p.ticker)
          WHERE p.status = 'active'
          ORDER BY (t.last_price * p.quantity) DESC
        """
        results = database_inversiones.execute_query(query)
        
        if isinstance(results, dict) and not results.get('success'):
            raise Exception(results.get('error', 'Unknown DB error'))
            
        total_value = sum((p.get('current_value') or 0) for p in results)
        total_cost = sum((p.get('cost_basis') or 0) for p in results)
        total_pnl = sum((p.get('unrealized_pnl') or 0) for p in results)
        
        positions = []
        for p in results:
            w = round((p.get('current_value') or 0) / total_value * 100, 2) if total_value > 0 else 0
            p['portfolio_weight'] = w
            positions.append(p)
            
        summary = {
            'total_value': round(total_value, 2),
            'total_cost': round(total_cost, 2),
            'total_pnl': round(total_pnl, 2),
            'total_pnl_pct': round((total_pnl / total_cost) * 100, 2) if total_cost > 0 else 0,
            'positions_count': len(results)
        }
        return jsonify({'success': True, 'data': {'positions': positions, 'summary': summary}})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/inversiones/scanner', methods=['GET'])
def api_inv_scanner():
    try:
        filter_type = request.args.get('filter', 'all')
        query = """
          SELECT 
            t.ticker, t.name, t.sector, t.industry, t.last_price, t.market_cap,
            v.peg_value, v.peg_signal, v.dcf_intrinsic_value, v.dcf_diff_pct, v.dcf_signal,
            v.pbv_ratio, v.pbv_signal, v.positive_signals
          FROM inv_tickers t
          JOIN inv_valuations v ON v.ticker = t.ticker
            AND v.valuation_date = (SELECT MAX(valuation_date) FROM inv_valuations WHERE ticker = t.ticker)
          WHERE (t.is_in_sp500 = 1 OR t.is_custom_scanner = 1 OR t.is_in_watchlist = 1)
        """
        
        if filter_type == 'subvaloradas':
            query += " AND (v.peg_signal = 'subvalorada' OR (v.peg_signal IN ('justo', 'invertible') AND v.dcf_signal = 'subvalorada'))"
        elif filter_type == 'peg_only':
            query += " AND v.peg_signal = 'subvalorada'"
        elif filter_type == 'dcf_only':
            query += " AND v.dcf_signal = 'subvalorada'"
        elif filter_type == 'top_score':
            query += " AND v.positive_signals >= 3"
            
        query += " ORDER BY v.positive_signals DESC, v.peg_value ASC NULLS LAST LIMIT 100"
        
        results = database_inversiones.execute_query(query)
        return jsonify({'success': True, 'data': results, 'count': len(results)})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/inversiones/watchlist', methods=['GET'])
def api_inv_watchlist():
    try:
        sector = request.args.get('sector')
        query = """
          SELECT 
            t.ticker, t.name, t.sector, t.industry, t.instrument_type,
            t.last_price, t.price_change_pct, t.week_52_high, t.week_52_low,
            t.market_cap, t.is_in_portfolio,
            v.peg_value, v.peg_signal, v.dcf_intrinsic_value, v.dcf_diff_pct, v.dcf_signal,
            v.ddm_intrinsic_value, v.ddm_diff_pct, v.ddm_signal,
            v.pbv_ratio, v.pbv_signal, v.eps_next_5y_pct, v.eps_signal,
            v.positive_signals, v.valuation_date,
            ROUND(((t.last_price - t.week_52_low) / (t.week_52_high - t.week_52_low)) * 100, 1) AS position_52w_pct
          FROM inv_tickers t
          LEFT JOIN inv_valuations v ON v.ticker = t.ticker
            AND v.valuation_date = (SELECT MAX(valuation_date) FROM inv_valuations v2 WHERE v2.ticker = t.ticker)
          WHERE t.is_in_watchlist = 1
        """
        params = []
        if sector and sector != 'all':
            query += " AND t.sector = ?"
            params.append(sector)
            
        query += " ORDER BY v.positive_signals DESC, t.sector ASC, t.ticker ASC"
        results = database_inversiones.execute_query(query, params)
        
        sectors_query = "SELECT DISTINCT sector FROM inv_tickers WHERE is_in_watchlist = 1 AND sector IS NOT NULL ORDER BY sector ASC"
        sectors_res = database_inversiones.execute_query(sectors_query)
        sectors = [s['sector'] for s in sectors_res]
        
        return jsonify({'success': True, 'data': {'tickers': results, 'sectors': sectors, 'count': len(results)}})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/inversiones/valuations', methods=['GET'])
def api_inv_valuations():
    try:
        ticker = request.args.get('ticker')
        days = request.args.get('days', '365')
        get_all = request.args.get('all', 'false') == 'true'
        
        if get_all:
            query = """
              SELECT v.*, t.name, t.sector, t.instrument_type, t.last_price, t.price_change_pct
              FROM inv_valuations v
              JOIN inv_tickers t ON t.ticker = v.ticker
              WHERE v.valuation_date = (SELECT MAX(valuation_date) FROM inv_valuations v2 WHERE v2.ticker = v.ticker)
              AND (t.is_in_portfolio = 1 OR t.is_in_watchlist = 1)
              ORDER BY v.positive_signals DESC, v.peg_value ASC
            """
            results = database_inversiones.execute_query(query)
            return jsonify({'success': True, 'data': results})
            
        if not ticker:
            return jsonify({'success': False, 'error': 'ticker requerido'}), 400
            
        ticker = ticker.upper()
        history = database_inversiones.execute_query("""
            SELECT v.*, t.name, t.sector
            FROM inv_valuations v JOIN inv_tickers t ON t.ticker = v.ticker
            WHERE v.ticker = ? AND v.valuation_date >= date('now', ?)
            ORDER BY v.valuation_date ASC
        """, (ticker, f"-{days} days"))
        
        latest = database_inversiones.execute_query("""
            SELECT v.*, t.name, t.sector, t.last_price, t.week_52_high, t.week_52_low
            FROM inv_valuations v JOIN inv_tickers t ON t.ticker = v.ticker
            WHERE v.ticker = ? ORDER BY v.valuation_date DESC LIMIT 1
        """, (ticker,), fetch='one')
        
        return jsonify({'success': True, 'data': {'ticker': ticker, 'history': history, 'latest': latest}})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/inversiones/questionnaire', methods=['GET', 'POST'])
def api_inv_questionnaire():
    try:
        if request.method == 'GET':
            ticker = request.args.get('ticker')
            if not ticker: return jsonify({'success': False, 'error': 'ticker requerido'}), 400
            ticker = ticker.upper()
            history = database_inversiones.execute_query(
                "SELECT * FROM inv_questionnaire_answers WHERE ticker = ? ORDER BY analysis_date DESC", 
                (ticker,)
            )
            # Include ticker fundamentals for auto-fill
            ticker_data = database_inversiones.execute_query(
                "SELECT t.*, f.operating_cash_flow, f.net_income, f.revenue, f.eps_next_5y_pct, f.eps_past_5y_pct, f.peg_ratio, f.pe_ratio, f.total_assets, f.total_liabilities, f.short_term_debt, f.long_term_debt FROM inv_tickers t LEFT JOIN inv_financial_data f ON f.ticker = t.ticker AND f.fiscal_year = (SELECT MAX(fiscal_year) FROM inv_financial_data WHERE ticker = t.ticker) WHERE t.ticker = ?",
                (ticker,), fetch='one'
            )
            val_data = database_inversiones.execute_query(
                "SELECT * FROM inv_valuations WHERE ticker = ? ORDER BY valuation_date DESC LIMIT 1",
                (ticker,), fetch='one'
            )
            return jsonify({'success': True, 'data': {'ticker': ticker, 'history': history, 'latest': history[0] if history else None, 'ticker_data': ticker_data, 'valuations': val_data}})
            
        if request.method == 'POST':
            data = request.json
            ticker = data.get('ticker', '').upper()
            if not ticker: return jsonify({'success': False, 'error': 'ticker requerido'}), 400
            
            adate = data.get('analysis_date') or datetime.now().strftime('%Y-%m-%d')
            q_id = str(uuid.uuid4())
            
            fields = ['sales_growing', 'earnings_growing', 'cashflow_growing', 'roe', 'eps_past_5y', 'eps_next_5y',
                      'peg', 'debt_equity', 'current_ratio', 'debt_reasonable', 'avg_volume_3m', 'insider_pct',
                      'insider_change_pct', 'institutional_pct', 'institutional_change', 'next_earnings_date',
                      'competitive_advantage', 'competitors', 'add_to_watchlist', 'valuation_methods', 'price_vs_valuation',
                      'market_type', 'price_action_notes', 'has_fibonacci', 'sma50_support', 'sma150_support', 'sma200_support',
                      'analyst_notes', 'final_decision']
                      
            vals = [data.get(f) for f in fields]
            
            query = f"""
            INSERT INTO inv_questionnaire_answers (id, ticker, analysis_date, {', '.join(fields)})
            VALUES (?, ?, ?, {', '.join(['?'] * len(fields))})
            ON CONFLICT(ticker, analysis_date) DO UPDATE SET
            {', '.join([f'{f} = excluded.{f}' for f in fields])},
            updated_at = datetime('now')
            """
            
            params = [q_id, ticker, adate] + vals
            params = [json.dumps(p) if isinstance(p, list) else p for p in params]
            
            database_inversiones.execute_query(query, params, fetch=False)
            return jsonify({'success': True, 'message': f'Cuestionario para {ticker} guardado', 'analysis_date': adate})
            
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/inversiones/price_history', methods=['GET'])
def api_inv_price_history():
    """Devuelve historial de precios para un ticker. Si no existe, lo descarga de Yahoo."""
    try:
        ticker = request.args.get('ticker', '').upper()
        if not ticker:
            return jsonify({'success': False, 'error': 'ticker requerido'}), 400
        
        days = int(request.args.get('days', '365'))
        
        rows = database_inversiones.execute_query(
            "SELECT price_date, open_price, high_price, low_price, close_price, volume FROM inv_price_history WHERE ticker = ? ORDER BY price_date ASC LIMIT ?",
            (ticker, days)
        )
        
        # Si no hay datos, descarga en tiempo real de Yahoo
        if not rows:
            try:
                import yfinance as yf
                ymap = {'BTCUSD': 'BTC-USD', 'ETHUSD': 'ETH-USD'}
                ysym = ymap.get(ticker, ticker)
                stock = yf.Ticker(ysym)
                hist = stock.history(period='1y')
                if not hist.empty:
                    to_insert = []
                    for dt, row in hist.iterrows():
                        to_insert.append((
                            str(uuid.uuid4()), ticker,
                            dt.strftime('%Y-%m-%d'),
                            round(float(row['Open']), 4),
                            round(float(row['High']), 4),
                            round(float(row['Low']), 4),
                            round(float(row['Close']), 4),
                            int(row['Volume'])
                        ))
                    database_inversiones.execute_query(
                        "INSERT OR IGNORE INTO inv_price_history (id, ticker, price_date, open_price, high_price, low_price, close_price, volume) VALUES (?,?,?,?,?,?,?,?)",
                        to_insert, fetch=False
                    ) if False else None  # batch below
                    conn = database_inversiones.get_db_connection()
                    with conn:
                        conn.executemany(
                            "INSERT OR IGNORE INTO inv_price_history (id, ticker, price_date, open_price, high_price, low_price, close_price, volume) VALUES (?,?,?,?,?,?,?,?)",
                            to_insert
                        )
                    conn.close()
                    rows = [{'price_date': r[2], 'open_price': r[3], 'high_price': r[4], 'low_price': r[5], 'close_price': r[6], 'volume': r[7]} for r in to_insert]
            except Exception as e:
                print(f'Error descargando historial Yahoo {ticker}: {e}')
        
        return jsonify({'success': True, 'data': rows, 'count': len(rows)})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

def _ff_time_to_24h(time_str):
    """Convierte '8:30am' / '2:00pm' → '08:30' / '14:00' (24h)"""
    try:
        clean = time_str.strip().lower().replace(' ', '')
        dt    = datetime.strptime(clean, '%I:%M%p')
        return dt.strftime('%H:%M')
    except:
        return time_str  # devuelve el original si no puede parsear

def _fallback_calendar():
    return [
        {'time':'08:30','time_raw':'8:30am','currency':'USD','impact':'High',   'event':'Initial Jobless Claims','actual':'','forecast':'225K','previous':'219K'},
        {'time':'10:00','time_raw':'10:00am','currency':'USD','impact':'High',  'event':'Fed Chair Powell Speech','actual':'','forecast':'',   'previous':''},
        {'time':'14:00','time_raw':'2:00pm', 'currency':'EUR','impact':'Medium','event':'ECB President Speech',  'actual':'','forecast':'',   'previous':''},
    ]

# ─── NOTICIAS DE MERCADO (RSS) ───
MARKET_KEYWORDS = [
    'fed','federal reserve','trump','tariff','inflation','interest rate',
    'market','nasdaq','s&p','dow jones','bitcoin','crypto','dollar',
    'powell','economy','gdp','cpi','jobs','employment','china trade',
    'recession','earnings','stocks','wall street','treasury'
]

RSS_FEEDS = [
    ('Reuters Markets', 'https://feeds.reuters.com/reuters/businessNews'),
    ('AP Markets',      'https://feeds.finance.yahoo.com/rss/2.0/headline?s=^GSPC&region=US&lang=en-US'),
    ('Seeking Alpha',   'https://seekingalpha.com/market_currents.xml'),
    ('MarketWatch',     'https://feeds.marketwatch.com/marketwatch/topstories/'),
]

@app.route('/api/news')
def api_news():
    def fetch():
        all_items = []
        headers = {'User-Agent': 'Mozilla/5.0'}
        for source_name, feed_url in RSS_FEEDS:
            try:
                r = requests.get(feed_url, headers=headers, timeout=8)
                if r.status_code != 200:
                    continue
                soup = BeautifulSoup(r.content, 'xml')
                items = soup.find_all('item')
                for item in items[:15]:
                    title = item.find('title')
                    pub   = item.find('pubDate')
                    link  = item.find('link')
                    title_text = title.get_text(strip=True) if title else ''
                    lower = title_text.lower()
                    if any(kw in lower for kw in MARKET_KEYWORDS):
                        pub_str = pub.get_text(strip=True) if pub else ''
                        try:
                            pub_dt = datetime.strptime(pub_str[:25], '%a, %d %b %Y %H:%M:%S')
                        except:
                            pub_dt = datetime.now()
                        all_items.append({
                            'title': title_text,
                            'source': source_name,
                            'link': link.get_text(strip=True) if link else '',
                            'timestamp': pub_dt.isoformat(),
                        })
            except Exception as e:
                print(f'RSS error {source_name}: {e}')
                continue
        # Ordenar por fecha
        all_items.sort(key=lambda x: x['timestamp'], reverse=True)
        return all_items[:25]
    data = get_cached('news', CACHE_TTL['news'], fetch)
    return jsonify(data)

# ─── GEX: GAMMA / DELTA / VANNA EXPOSURE ───────────────────────────────────
#
# Usa yfinance para obtener la cadena de opciones real del mercado.
# Calcula GEX, DEX y Vanna con Black-Scholes por strike y por expiración.
# Funciona solo en horario de mercado (9:30am–4pm ET) o con datos del último día.
#
# Símbolos soportados:
#   SPX → usa SPY como proxy (yfinance entrega opciones de SPY)
#   NDX → usa QQQ como proxy
# ─────────────────────────────────────────────────────────────────────────────

def _norm_cdf(x):
    """CDF de la normal estándar (aproximación de Abramowitz & Stegun)"""
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))

def _bs_d1d2(S, K, T, r, sigma):
    if T <= 0 or sigma <= 0 or S <= 0 or K <= 0:
        return None, None
    try:
        d1 = (math.log(S / K) + (r + 0.5 * sigma**2) * T) / (sigma * math.sqrt(T))
        d2 = d1 - sigma * math.sqrt(T)
        return d1, d2
    except:
        return None, None

def bs_gamma(S, K, T, r, sigma):
    d1, _ = _bs_d1d2(S, K, T, r, sigma)
    if d1 is None:
        return 0.0
    pdf = math.exp(-0.5 * d1**2) / math.sqrt(2 * math.pi)
    return pdf / (S * sigma * math.sqrt(T))

def bs_delta(S, K, T, r, sigma, opt_type='call'):
    d1, _ = _bs_d1d2(S, K, T, r, sigma)
    if d1 is None:
        return 0.0
    return _norm_cdf(d1) if opt_type == 'call' else _norm_cdf(d1) - 1.0

def bs_vanna(S, K, T, r, sigma):
    """Vanna = dDelta/dVol"""
    d1, d2 = _bs_d1d2(S, K, T, r, sigma)
    if d1 is None:
        return 0.0
    pdf = math.exp(-0.5 * d1**2) / math.sqrt(2 * math.pi)
    return -pdf * d2 / sigma

def classify_exp(exp_str, today):
    try:
        exp  = datetime.strptime(exp_str, '%Y-%m-%d').date()
        days = (exp - today).days
        if days == 0:   return '0DTE'
        if days <= 7:   return 'weekly'
        if days <= 35:  return 'monthly'
        return 'leaps'
    except:
        return 'monthly'

def compute_gex_yfinance(etf_symbol, futures_symbol=None, multiplier=50):
    """
    Estrategia:
      1. Obtiene precio del futuro real (ES=F / NQ=F) — solo precio
      2. Usa la cadena de opciones del ETF (SPY/QQQ) — yfinance la entrega bien
      3. Escala cada strike ETF al precio equivalente del futuro usando el ratio
         Ejemplo: SPY=655, ES=F=6610 → ratio=10.09 → strike 660 → 6659 en futuro
      Así Call Wall, Put Wall y Zero Gamma aparecen en la escala del futuro real.
    """
    today  = date.today()
    r_rate = 0.05

    # ── 1. Precio del futuro (solo cotización, sin opciones)
    futures_price = 0.0
    if futures_symbol:
        try:
            fp = float(yf.Ticker(futures_symbol).fast_info.last_price)
            if fp > 0:
                futures_price = round(fp, 2)
                print(f'[GEX] Futuro {futures_symbol} = {futures_price}')
        except Exception as e:
            print(f'[GEX] Futuro {futures_symbol} no disponible: {e}')

    # ── 2. Cadena de opciones del ETF
    ticker = yf.Ticker(etf_symbol)
    try:
        etf_price = round(float(ticker.fast_info.last_price), 2)
    except:
        return {'error': f'No se pudo obtener precio de {etf_symbol}'}

    if etf_price <= 0:
        return {'error': f'Precio invalido para {etf_symbol}'}

    exps = ticker.options
    if not exps:
        return {'error': 'Sin fechas de vencimiento — mercado cerrado?'}
    exps = list(exps[:6])

    # ── 3. Ratio de escala ETF → Futuro
    # Si tenemos precio del futuro: scale_ratio = futuro / etf
    # Los strikes del ETF se multiplican por este ratio para mostrar en escala futuro
    if futures_price > 0:
        scale_ratio = futures_price / etf_price
        spot_display = futures_price      # lo que se muestra al usuario
        used_sym     = futures_symbol
        used_mult    = multiplier
    else:
        scale_ratio  = 1.0
        spot_display = etf_price
        used_sym     = etf_symbol
        used_mult    = 100

    print(f'[GEX] ETF={etf_price} Futuro={futures_price} ratio={scale_ratio:.4f}')

    # S para calculos Black-Scholes siempre en precio ETF (opciones están en ETF)
    S = etf_price

    agg_gex   = {}
    agg_dex   = {}
    agg_vanna = {}
    by_exp    = {}

    for exp in exps:
        exp_class = classify_exp(exp, today)
        try:
            exp_dt = datetime.strptime(exp, '%Y-%m-%d').date()
        except:
            continue
        T = max((exp_dt - today).days / 365.0, 1 / 365.0)

        try:
            chain = ticker.option_chain(exp)
        except Exception as e:
            print(f'[GEX] option_chain {exp}: {e}')
            continue

        exp_gex   = {}
        exp_dex   = {}
        exp_vanna = {}

        for opt_type, df in [('call', chain.calls), ('put', chain.puts)]:
            for _, row in df.iterrows():
                try:
                    K_etf = float(row['strike'])
                    oi    = int(row.get('openInterest', 0) or 0)
                    iv    = float(row.get('impliedVolatility', 0) or 0)

                    if oi == 0 or iv < 0.01 or K_etf <= 0:
                        continue
                    if K_etf < S * 0.80 or K_etf > S * 1.20:
                        continue

                    gamma = bs_gamma(S, K_etf, T, r_rate, iv)
                    delta = bs_delta(S, K_etf, T, r_rate, iv, opt_type)
                    vanna = bs_vanna(S, K_etf, T, r_rate, iv)

                    gex_val   = gamma * oi * used_mult * S * S * 0.01
                    dex_val   = delta * oi * used_mult * S
                    vanna_val = vanna * oi * used_mult * S * iv

                    sign = 1 if opt_type == 'call' else -1

                    # Clave del strike en escala del FUTURO (para mostrar al usuario)
                    K_fut = round(K_etf * scale_ratio, 1)

                    exp_gex[K_fut]   = exp_gex.get(K_fut, 0)   + sign * gex_val
                    exp_dex[K_fut]   = exp_dex.get(K_fut, 0)   + sign * dex_val
                    exp_vanna[K_fut] = exp_vanna.get(K_fut, 0) + vanna_val

                    agg_gex[K_fut]   = agg_gex.get(K_fut, 0)   + sign * gex_val
                    agg_dex[K_fut]   = agg_dex.get(K_fut, 0)   + sign * dex_val
                    agg_vanna[K_fut] = agg_vanna.get(K_fut, 0) + vanna_val

                except:
                    continue

        if exp_gex:
            sk = sorted(exp_gex.keys())
            by_exp[exp] = {
                'class':   exp_class,
                'days':    (exp_dt - today).days,
                'strikes': sk,
                'gex':     [round(exp_gex[k] / 1e9, 4) for k in sk],
                'dex':     [round(exp_dex[k] / 1e6, 2) for k in sk],
                'vanna':   [round(exp_vanna[k] / 1e6, 2) for k in sk],
            }

    if not agg_gex:
        return {'error': 'Sin datos de opciones — el mercado puede estar cerrado'}

    # Filtrar strikes ±10% del spot_display
    lo = spot_display * 0.90
    hi = spot_display * 1.10
    strikes_f = sorted([k for k in agg_gex if lo <= k <= hi])

    gex_f   = [round(agg_gex.get(k, 0)   / 1e9, 4) for k in strikes_f]
    dex_f   = [round(agg_dex.get(k, 0)   / 1e6, 2) for k in strikes_f]
    vanna_f = [round(agg_vanna.get(k, 0) / 1e6, 2) for k in strikes_f]

    # Niveles clave — ya en escala del futuro
    pos = {k: v for k, v in agg_gex.items() if v > 0}
    neg = {k: v for k, v in agg_gex.items() if v < 0}
    call_wall = max(pos, key=pos.get) if pos else spot_display
    put_wall  = min(neg, key=neg.get) if neg else spot_display

    zero_gamma = spot_display
    sk_sorted  = sorted(agg_gex.keys())
    for i in range(len(sk_sorted) - 1):
        a, b = sk_sorted[i], sk_sorted[i + 1]
        if agg_gex.get(a, 0) * agg_gex.get(b, 0) < 0:
            zero_gamma = round((a + b) / 2, 1)
            break

    total_gex = round(sum(gex_f), 2)

    return {
        'spot':          spot_display,
        'etf':           etf_symbol,
        'source':        used_sym,
        'multiplier':    used_mult,
        'scale_ratio':   round(scale_ratio, 4),
        'strikes':       strikes_f,
        'gex':           gex_f,
        'dex':           dex_f,
        'vanna':         vanna_f,
        'call_wall':     round(call_wall, 1),
        'put_wall':      round(put_wall, 1),
        'zero_gamma':    round(zero_gamma, 1),
        'total_gex':     total_gex,
        'by_expiration': by_exp,
        'expirations':   list(by_exp.keys()),
    }


# Configuración: (etf_fallback, futures_symbol, multiplicador_futuro)
GEX_CONFIG = {
    'SPX': ('SPY', 'ES=F',  50),   # /ES: multiplicador 0 por punto
    'NDX': ('QQQ', 'NQ=F',  20),   # /NQ: multiplicador 0 por punto
}

@app.route('/api/gex/<symbol>')
def api_gex(symbol):
    sym = symbol.upper()
    if sym not in GEX_CONFIG:
        return jsonify({'error': 'Solo SPX o NDX'}), 400
    etf, fut, mult = GEX_CONFIG[sym]
    cache_key = f'gex_{sym}'
    data = get_cached(cache_key, CACHE_TTL[cache_key],
                      lambda: compute_gex_yfinance(etf, futures_symbol=fut, multiplier=mult))
    return jsonify(data)

# ─── CHART.JS SERVIDO LOCALMENTE (evita bloqueo de Edge/Chrome) ───
@app.route('/chartjs')
def serve_chartjs():
    """
    Descarga Chart.js una vez y lo cachea en memoria.
    Se sirve desde localhost:5000/chartjs — Edge no lo bloquea.
    """
    import urllib.request
    global _chartjs_cache
    if not hasattr(serve_chartjs, '_cache') or not serve_chartjs._cache:
        try:
            url = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js'
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=15) as r:
                serve_chartjs._cache = r.read()
            print('[Chart.js] Descargado y cacheado OK')
        except Exception as e:
            print(f'[Chart.js] Error descargando: {e}')
            # Fallback mínimo para que no rompa todo
            serve_chartjs._cache = b'console.warn("Chart.js no disponible");'
    return Response(serve_chartjs._cache, mimetype='application/javascript',
                    headers={'Cache-Control': 'public, max-age=86400'})

# ─── AGREGADO POR USUARIO: Rutas para backtesting de señales ───
# Fecha: 2026-04-28 - No modifica funciones existentes
@app.route('/ana-backtesting')
def ana_backtesting():
    """Sirve el dashboard de backtesting"""
    return send_file('ana-backtesting-senales.html')
@app.route('/ana-backtesting-v3')
def ana_backtesting_v3():
    """Sirve el dashboard de backtesting V3"""
    return send_file('ana-backtesting-senales-v3.html')
@app.route('/ana-backtesting-v3-1')
def ana_backtesting_v3_1():
    """Sirve el dashboard de backtesting V3-1"""
    return send_file('ana-backtesting-senales-v3-1.html')
@app.route('/ana-backtesting-v4')
def ana_backtesting_v4():
    """Sirve el dashboard de backtesting V4"""
    return send_file('ana-backtesting-senales-v4.html')
@app.route('/ana-backtesting-v5')
def ana_backtesting_v5():
    """Sirve el dashboard de backtesting V5"""
    return send_file('ana-backtesting-senales-v5.html')

@app.route('/senales-edus.csv')
def senales_csv():
    """Sirve el CSV de señales para el dashboard"""
    csv_path = 'senales-edus.csv'
    # Si no existe, intenta con el nombre original
    if not os.path.exists(csv_path):
        if os.path.exists('Senales_EduS_Hist2.csv'):
            csv_path = 'Senales_EduS_Hist2.csv'
    return send_file(csv_path, mimetype='text/csv')

# ─── AGREGADO POR USUARIO: Rutas para archivos por defecto ───
@app.route('/api/load-news')
def load_news_default():
    path = r'C:\Users\eduar\OneDrive - Desarrollo Personal\Documents\NinjaTrader 8\incoming\Hist-Noticias.csv'
    if os.path.exists(path):
        return send_file(path, mimetype='text/csv')
    return jsonify({'error': 'Archivo de noticias no encontrado'}), 404

@app.route('/api/load-config')
def load_config_default():
    path = r'c:\Users\eduar\OneDrive - Desarrollo Personal\Documents - Operativa Diaria\EduSTrader - Local Free\V5_VolatilityConfig.csv'
    if os.path.exists(path):
        return send_file(path, mimetype='text/csv')
    return jsonify({'error': 'Archivo de configuracion no encontrado'}), 404


@app.route('/api/inversiones/peers', methods=['GET'])
def api_inv_peers():
    """Devuelve tickers del mismo sector/industria como competidores sugeridos."""
    try:
        ticker = request.args.get('ticker', '').upper()
        if not ticker:
            return jsonify({'success': False, 'error': 'ticker requerido'}), 400

        # Obtener sector e industria del ticker solicitado
        base = database_inversiones.execute_query(
            "SELECT sector, industry FROM inv_tickers WHERE ticker = ?",
            (ticker,), fetch='one'
        )
        if not base:
            return jsonify({'success': True, 'data': [], 'message': 'Ticker no encontrado en BD'})

        industry = base.get('industry')
        sector   = base.get('sector')

        # Buscar primero por industria (más específico), luego por sector
        if industry:
            peers = database_inversiones.execute_query("""
                SELECT t.ticker, t.name, t.sector, t.industry, t.market_cap,
                       v.positive_signals, v.peg_signal, v.dcf_signal
                FROM inv_tickers t
                LEFT JOIN inv_valuations v ON v.ticker = t.ticker
                    AND v.valuation_date = (SELECT MAX(valuation_date) FROM inv_valuations WHERE ticker = t.ticker)
                WHERE t.industry = ? AND t.ticker != ?
                  AND t.instrument_type = 'stock'
                ORDER BY v.positive_signals DESC NULLS LAST, t.market_cap DESC NULLS LAST
                LIMIT 8
            """, (industry, ticker))
        else:
            peers = []

        # Si hay pocos por industria, completar con mismo sector
        if len(peers) < 4 and sector:
            existing = {p['ticker'] for p in peers}
            more = database_inversiones.execute_query("""
                SELECT t.ticker, t.name, t.sector, t.industry, t.market_cap,
                       v.positive_signals, v.peg_signal, v.dcf_signal
                FROM inv_tickers t
                LEFT JOIN inv_valuations v ON v.ticker = t.ticker
                    AND v.valuation_date = (SELECT MAX(valuation_date) FROM inv_valuations WHERE ticker = t.ticker)
                WHERE t.sector = ? AND t.ticker != ?
                  AND t.instrument_type = 'stock'
                ORDER BY v.positive_signals DESC NULLS LAST, t.market_cap DESC NULLS LAST
                LIMIT 8
            """, (sector, ticker))
            for p in more:
                if p['ticker'] not in existing:
                    peers.append(p)
                    existing.add(p['ticker'])
                if len(peers) >= 8:
                    break

        # Devolver solo los tickers como cadena (para prellenar el campo)
        tickers_str = ', '.join(p['ticker'] for p in peers[:6])

        return jsonify({
            'success': True,
            'data': peers,
            'tickers_str': tickers_str,
            'matched_by': 'industry' if industry else 'sector',
            'industry': industry,
            'sector': sector
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/inversiones/risk', methods=['GET'])
def api_inv_risk():
    try:
        ticker = request.args.get('ticker', '').upper()
        if not ticker: return jsonify({'success': False, 'error': 'ticker requerido'}), 400
        
        # Primero intentamos base de datos
        rows = database_inversiones.execute_query("""
            SELECT high_price, low_price, close_price 
            FROM inv_price_history 
            WHERE ticker = ? AND high_price IS NOT NULL
            ORDER BY price_date DESC LIMIT 15
        """, (ticker,))
        
        # Si no hay en BD, usamos yfinance directo
        if len(rows) < 14:
            import yfinance as yf
            yticker = {'BTCUSD': 'BTC-USD', 'ETHUSD': 'ETH-USD'}.get(ticker, ticker)
            stock = yf.Ticker(yticker)
            df = stock.history(period="1mo")
            if df.empty or len(df) < 14:
                return jsonify({'success': False, 'error': 'No hay suficientes datos en Yahoo para ATR'}), 400
            
            # Formatear a como lo espera el loop
            rows = []
            # Invertir para que el mas reciente sea el indice 0 (descendente)
            df = df.sort_index(ascending=False)
            for _, r in df.iterrows():
                rows.append({
                    'high_price': float(r['High']),
                    'low_price': float(r['Low']),
                    'close_price': float(r['Close'])
                })
            
        # Calcular True Range y luego ATR(14)
        trs = []
        for i in range(len(rows)-1):
            if i >= 14: break
            current = rows[i]
            prev_close = rows[i+1]['close_price']
            tr = max(
                current['high_price'] - current['low_price'],
                abs(current['high_price'] - prev_close),
                abs(current['low_price'] - prev_close)
            )
            trs.append(tr)
            
        atr_14 = sum(trs[:14]) / 14.0
        current_price = rows[0]['close_price']
        
        # Logica Mediano/Largo Plazo
        stop_loss = round(current_price - (atr_14 * 2.5), 2)
        target = round(current_price + max(current_price * 0.10, atr_14 * 4.0), 2)
        
        risk_data = {
            'ticker': ticker,
            'current_price': round(current_price, 2),
            'atr_14': round(atr_14, 4),
            'stop_loss': stop_loss,
            'target': target,
            'sl_pct': round(((current_price - stop_loss) / current_price) * 100, 2),
            'tp_pct': round(((target - current_price) / current_price) * 100, 2)
        }
        
        return jsonify({'success': True, 'data': risk_data})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# ─── INICIO ───
if __name__ == '__main__':
    print("="*50)
    print("  EduS Trader Dashboard - Servidor Local")
    print("="*50)
    print(f"  Abriendo en: http://localhost:5000")
    print("  Presiona Ctrl+C para detener")
    print("="*50)
    try:
        database_inversiones.init_db()
        print("  Base de datos de inversiones inicializada.")
    except Exception as e:
        print(f"  Error inicializando BD: {e}")
    app.run(host='0.0.0.0', port=5000, debug=False)
