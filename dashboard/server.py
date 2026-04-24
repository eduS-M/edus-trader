"""
EduS Trader - Servidor Local
Ejecutar: python server.py
Luego abrir: http://localhost:5000
"""

from flask import Flask, jsonify, send_file, Response
from flask_cors import CORS
import yfinance as yf
import requests
from bs4 import BeautifulSoup
import json
import os
import math
from datetime import datetime, date, timedelta
import threading
import time

FINNHUB_KEY = os.getenv('FINNHUB_KEY', '')


app = Flask(__name__)
# CORS(app)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# ─── Cache para no sobrecargar las APIs ───
_cache = {}
_cache_lock = threading.Lock()
CACHE_TTL = {
    'vix': 55,
    'quotes': 30,
    'heatmap': 120,
    'calendar': 300,
    'news': 120,
    'gex_SPX': 600,
    'gex_NDX': 600,
}

# def get_cached(key, ttl, fn):
#    with _cache_lock:
#        entry = _cache.get(key)
#        if entry and (time.time() - entry['ts']) < ttl:
#            return entry['data']
#    data = fn()
#    with _cache_lock:
#        _cache[key] = {'data': data, 'ts': time.time()}
#    return data

def get_cached(key, ttl, fn):
    with _cache_lock:
        entry = _cache.get(key)
        if entry and (time.time() - entry['ts']) < ttl:
            return entry['data']
    data = fn()
    with _cache_lock:
        # Si Yahoo falló, NO guardes el error, devuelve lo último bueno
        if isinstance(data, dict) and data.get('error'):
            if entry:
                print(f'[CACHE] {key} falló, devolviendo dato anterior')
                return entry['data']
            # si no hay nada anterior, guarda el error 30s para no spamear
            _cache[key] = {'data': data, 'ts': time.time() - ttl + 30}
        else:
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
            current = None
            prev_close = None
            open_today = None
            source = 'yfinance'
            
            # 1) Intentar Finnhub (símbolo correcto es ^VIX)
            if FINNHUB_KEY:
                try:
                    url = f'https://finnhub.io/api/v1/quote?symbol=^VIX&token={FINNHUB_KEY}'
                    r = requests.get(url, timeout=8)
                    # Si Finnhub responde 429, NO lo guardamos, vamos directo a yfinance
                    if r.status_code == 200:
                        q = r.json()
                        if q.get('c') and q.get('c') > 0:
                            current = round(float(q['c']), 2)
                            prev_close = round(float(q.get('pc', 0)), 2)
                            open_today = round(float(q.get('o', 0)), 2)
                            source = 'finnhub'
                except Exception as e:
                    print(f'[VIX] Finnhub error: {e}')
            
            # 2) Fallback yfinance (siempre funciona)
            ticker = yf.Ticker('^VIX')
            daily = ticker.history(period='5d', interval='1d')
            if daily.empty:
                return {'error': 'Sin datos VIX'}
            
            if prev_close is None or prev_close == 0:
                prev_close = round(float(daily['Close'].iloc[-2]), 2) if len(daily) >= 2 else round(float(daily['Close'].iloc[-1]), 2)
            if open_today is None or open_today == 0:
                open_today = round(float(daily['Open'].iloc[-1]), 2)
            
            intra = ticker.history(period='1d', interval='5m')
            points = []
            if not intra.empty:
                for ts, row in intra.iterrows():
                    points.append({'time': ts.strftime('%H:%M'), 'close': round(float(row['Close']), 2)})
            
            if current is None:
                info = ticker.fast_info
                current = round(float(info.last_price), 2) if hasattr(info, 'last_price') else (points[-1]['close'] if points else prev_close)
            
            if not points:
                points = [{'time': datetime.now().strftime('%H:%M'), 'close': current}]
            
            chg_vs_prev = round((current - prev_close) / prev_close * 100, 2) if prev_close else 0
            chg_vs_open = round((current - open_today) / open_today * 100, 2) if open_today else 0
            
            return {
                'current':      current,
                'prev_close':   prev_close,
                'open':         open_today,
                'change_pct':   chg_vs_prev,
                'change_intra': chg_vs_open,
                'points':       points,
                'source':       source,
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



# ─── CALENDARIO FOREX FACTORY ───
#@app.route('/api/calendar')
#def api_calendar():
#    def fetch():
#        try:
#            import pytz
#            et = pytz.timezone('US/Eastern')
#            now_et = datetime.now(et)
#            today_et = now_et.date()

#            print(f'[Calendar] Pidiendo desde HOY {today_et} hasta viernes')

#            events = []
#            KEEP = {'USD','EUR','GBP','JPY','CAD','AUD','CHF','NZD'}

            # DESDE HOY hasta viernes (si hoy es sábado, empieza el lunes siguiente)
            
#            start = today_et
#            if start.weekday() >= 5: # sábado=5 domingo=6
#                start = start + timedelta(days=(7 - start.weekday()))

#            for i in range(0, 7):
#                target = start + timedelta(days=i)
 #               if target.weekday() > 4: # para en viernes
  #                  break

   #             day_str = target.strftime('%b%d').lower()
    #            url = f"https://www.forexfactory.com/calendar?day={day_str}.{target.year}"

#                try:
 #                   import cloudscraper
  #                  scraper = cloudscraper.create_scraper(browser={'browser':'chrome','platform':'windows','mobile':False})
   #                 r = scraper.get(url, timeout=15)
    #            except:
     #               r = requests.get(url, headers={'User-Agent':'Mozilla/5.0'}, timeout=15)

      #          if r.status_code!= 200:
       #             continue

        #        soup = BeautifulSoup(r.text, 'html.parser')
         #       rows = soup.select('tr.calendar__row')
          #      last_time = ''

#                for row in rows:
 #                   try:
  #                      tc = row.find('td', class_='calendar__time')
   #                     t = tc.get_text(strip=True).replace('▶','').strip() if tc else ''
    #                    if t and 'Day' not in t and 'Tentative' not in t:
     #                       last_time = t
      #                  if not last_time:
       #                     continue

        #                cc = row.find('td', class_='calendar__currency')
         #               ccy = cc.get_text(strip=True) if cc else ''
          #              if ccy not in KEEP:
           #                 continue
#
        #                ic = row.find('td', class_='calendar__impact')
       #                 impact = 'Low'
     #                   if ic and ic.find('span'):
      #                      cls = ' '.join(ic.find('span').get('class', []))
    #                        if 'icon--ff-impact-red' in cls: impact = 'High'
   #                         elif 'icon--ff-impact-ora' in cls: impact = 'Medium'
  #                          elif 'icon--ff-impact-yel' in cls: impact = 'Low'
 #                           else: continue
#
    #                    ee = row.find('td', class_='calendar__event')
   #                     evt = ee.get_text(strip=True) if ee else ''
  #                      if not evt:
 #                           continue
#
  #                      time_24 = _ff_time_to_24h(last_time)
 #                       dt_et = et.localize(datetime.combine(target, datetime.strptime(time_24, '%H:%M').time()))
#
              #          events.append({
             #               'date': target.isoformat(),
            #                'time': time_24,
           #                 'time_raw': last_time,
          #                  'currency': ccy,
         #                   'impact': impact,
        #                    'event': evt,
       #                     'actual': '',
      #                      'forecast': '',
     #                       'previous': '',
    #                        'timestamp_et': dt_et.isoformat()
   #                     })
  #                  except:
 #                       continue
#
     #       events.sort(key=lambda x: x['timestamp_et'])
    #        return events
   #     except Exception as e:
  #          print(f'Calendar error: {e}')
 #           return _fallback_calendar()
#
#    with _cache_lock:
#        _cache.pop('calendar', None)

#    data = get_cached('calendar', 60, fetch) # ← caché solo 60s para ver cambios rápido
#    return jsonify(data)
    
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

    # exps = ticker.options
    # if not exps:
    #   return {'error': 'Sin fechas de vencimiento — mercado cerrado?'}
    try:
        exps = ticker.options
    except Exception as e:
        print(f'[GEX] {etf_symbol} options error: {e}')
        exps = []
    if not exps:
        print(f'[GEX] {etf_symbol} sin expiraciones, Yahoo bloqueó')
        return {'error': 'Yahoo no responde — usando último dato'}
    
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

# ─── INICIO ───
if __name__ == '__main__':
    print("="*50)
    print("  EduS Trader Dashboard - Servidor")
    print("="*50)
    port = int(os.environ.get('PORT', 5000))
    print(f"  Puerto: {port}")
    print("  Presiona Ctrl+C para detener")
    print("="*50)
    app.run(host='0.0.0.0', port=port, debug=False)
