require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const {
  sma, bollingerBands, rsi,
  goldenCross, bollingerSignal, rsiSignal, volumeBreakout, macdSignal, macd,
  aggregateRecommendation
} = require('./indicators');

const app = express();
const PORT = process.env.PORT || 3000;
const TOKEN = process.env.GOAPI_TOKEN;
const BASE = process.env.GOAPI_BASE || 'https://api.goapi.io';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function isoDate(d) { return d.toISOString().slice(0, 10); }
function idxDate(d) {
  return d.getFullYear().toString() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
}
function decodeHTML(s) {
  if (!s) return '';
  return String(s)
    .replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/<[^>]+>/g, '').trim();
}

function normaliseCandles(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((c) => ({
    date: c.date || c.timestamp || c.time || c.t || null,
    open: Number(c.open != null ? c.open : c.o),
    high: Number(c.high != null ? c.high : c.h),
    low: Number(c.low != null ? c.low : c.l),
    close: Number(c.close != null ? c.close : c.c),
    volume: Number(c.volume != null ? c.volume : (c.v != null ? c.v : 0))
  }))
  .filter((c) => Number.isFinite(c.close))
  .sort((a, b) => new Date(a.date) - new Date(b.date));
}

function extractCandles(body) {
  const raw =
    (body && body.data && body.data.results) ||
    (body && body.data && body.data.historical) ||
    (body && body.data && body.data.prices) ||
    (body && body.data) ||
    (body && body.results) || [];
  return normaliseCandles(Array.isArray(raw) ? raw : []);
}

async function fetchRange(url, fromStr, toStr) {
  const res = await axios.get(url, {
    params: {
      api_key: TOKEN, from: fromStr, to: toStr,
      start_date: fromStr, end_date: toStr,
      'from-date': fromStr, 'to-date': toStr
    },
    timeout: 20000, validateStatus: () => true
  });
  if (res.status >= 400) {
    const msg = (res.data && res.data.message) || res.statusText;
    const err = new Error(msg); err.status = res.status; throw err;
  }
  if (res.data && res.data.status === 'error') throw new Error(res.data.message || 'GoAPI error');
  return extractCandles(res.data);
}

// Simple in-memory cache (key -> { value, exp })
const cache = new Map();
function cacheGet(key) {
  const v = cache.get(key);
  if (!v) return null;
  if (Date.now() > v.exp) { cache.delete(key); return null; }
  return v.value;
}
function cacheSet(key, value, ttlMs) { cache.set(key, { value, exp: Date.now() + ttlMs }); }

// Yahoo Finance chart API - sumber utama historis (gratis, no auth, unlimited rasanya)
async function fetchYahooHistorical(symbol) {
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + symbol + '.JK?range=2y&interval=1d&includePrePost=false';
  const res = await axios.get(url, {
    headers: { 'User-Agent': UA, 'Accept': 'application/json' },
    timeout: 10000, validateStatus: () => true
  });
  if (res.status >= 400) {
    const msg = (res.data && res.data.chart && res.data.chart.error && res.data.chart.error.description) || res.statusText;
    throw new Error('Yahoo ' + res.status + ': ' + msg);
  }
  const result = res.data && res.data.chart && res.data.chart.result && res.data.chart.result[0];
  if (!result) {
    const err = res.data && res.data.chart && res.data.chart.error;
    throw new Error('Yahoo: ' + (err ? err.description : 'response kosong'));
  }
  const ts = result.timestamp || [];
  const q = (result.indicators && result.indicators.quote && result.indicators.quote[0]) || {};
  const candles = [];
  for (let i = 0; i < ts.length; i++) {
    const close = q.close && q.close[i];
    if (close == null) continue;
    candles.push({
      date: new Date(ts[i] * 1000).toISOString().slice(0, 10),
      open: Number(q.open && q.open[i]) || close,
      high: Number(q.high && q.high[i]) || close,
      low: Number(q.low && q.low[i]) || close,
      close: Number(close),
      volume: Number(q.volume && q.volume[i]) || 0
    });
  }
  if (candles.length === 0) throw new Error('Yahoo: candles kosong (cek kode emiten)');
  return { candles, source: 'yahoo finance (' + symbol + '.JK)' };
}

async function fetchGoAPIHistorical(symbol) {
  const today = new Date();
  const c1To = new Date(today);
  const c1From = new Date(today); c1From.setDate(c1From.getDate() - 360);
  const c2To = new Date(c1From); c2To.setDate(c2To.getDate() - 1);
  const c2From = new Date(c2To); c2From.setDate(c2From.getDate() - 360);
  const ranges = [[isoDate(c2From), isoDate(c2To)], [isoDate(c1From), isoDate(c1To)]];
  const url = BASE + '/stock/idx/' + symbol + '/historical';
  const chunkErrors = [];
  const chunks = await Promise.all(
    ranges.map(async (r) => {
      try { return await fetchRange(url, r[0], r[1]); }
      catch (e) { chunkErrors.push((e.status || '?') + ' ' + e.message); return []; }
    })
  );
  const merged = chunks.flat();
  if (merged.length === 0) {
    throw new Error('GoAPI gagal: ' + chunkErrors.join(', '));
  }
  const map = new Map();
  for (const c of merged) map.set(c.date, c);
  const candles = Array.from(map.values()).sort((a, b) => new Date(a.date) - new Date(b.date));
  return { candles, source: 'goapi' };
}

// Stockbit live price - real-time IDX (Yahoo delay 15-20 menit, ini live)
const STOCKBIT_TOKEN = process.env.STOCKBIT_TOKEN;
const STOCKBIT_HEADERS = {
  'Authorization': 'Bearer ' + (STOCKBIT_TOKEN || ''),
  'User-Agent': UA,
  'Accept': 'application/json',
  'Origin': 'https://stockbit.com',
  'Referer': 'https://stockbit.com/'
};

function parseStockbitPrice(item) {
  if (!item) return null;
  const price = Number(
    item.last_price != null ? item.last_price :
    item.lastPrice != null ? item.lastPrice :
    item.last != null ? item.last :
    item.close != null ? item.close :
    item.price
  );
  if (!Number.isFinite(price) || price <= 0) return null;
  return {
    price,
    open: Number(item.open) || price,
    high: Number(item.high) || price,
    low: Number(item.low) || price,
    volume: Number(item.volume) || 0,
    change: Number(item.change),
    changePct: Number(item.percentage_change || item.percentageChange || item.change_percentage),
    source: 'stockbit-live'
  };
}

async function fetchStockbitLivePrice(symbol) {
  if (!STOCKBIT_TOKEN) return null;
  // Coba beberapa endpoint Stockbit (struktur internal mereka berubah-ubah)
  const endpoints = [
    'https://exodus.stockbit.com/findata-view/last-price?symbols=' + symbol,
    'https://exodus.stockbit.com/orderbook/companies/v2/' + symbol,
    'https://exodus.stockbit.com/last-price/v3/' + symbol
  ];
  for (const url of endpoints) {
    try {
      const res = await axios.get(url, {
        headers: STOCKBIT_HEADERS,
        timeout: 5000, validateStatus: () => true
      });
      if (res.status !== 200 || !res.data) continue;
      // Parse berbagai struktur response
      let item = null;
      if (Array.isArray(res.data.data)) item = res.data.data[0];
      else if (res.data.data && typeof res.data.data === 'object') item = res.data.data;
      else if (Array.isArray(res.data)) item = res.data[0];
      else if (typeof res.data === 'object') item = res.data;
      const parsed = parseStockbitPrice(item);
      if (parsed) return parsed;
    } catch (_) { /* coba endpoint berikutnya */ }
  }
  return null;
}

// Override last candle dengan harga live dari Stockbit
function applyLivePrice(candles, live) {
  if (!live || !candles || candles.length === 0) return candles;
  const last = candles[candles.length - 1];
  const todayISO = new Date().toISOString().slice(0, 10);
  // Kalau last candle = hari ini, override; kalau bukan, append candle baru
  if (last.date === todayISO) {
    last.close = live.price;
    if (live.high > last.high) last.high = live.high;
    if (live.low > 0 && live.low < last.low) last.low = live.low;
    if (live.volume > last.volume) last.volume = live.volume;
  } else {
    candles.push({
      date: todayISO,
      open: live.open || live.price,
      high: live.high || live.price,
      low: live.low || live.price,
      close: live.price,
      volume: live.volume || 0
    });
  }
  return candles;
}

async function fetchHistorical(emiten) {
  const symbol = emiten.toUpperCase();
  const cacheKey = 'hist:' + symbol;
  const cached = cacheGet(cacheKey);
  if (cached) {
    // Selalu refresh harga live untuk last candle (cache 30 detik)
    const liveCacheKey = 'live:' + symbol;
    let live = cacheGet(liveCacheKey);
    if (!live) {
      live = await fetchStockbitLivePrice(symbol);
      if (live) cacheSet(liveCacheKey, live, 30 * 1000);
    }
    if (live) {
      const candles = applyLivePrice(cached.candles.slice(), live);
      return { candles, source: cached.source + ' + stockbit live' };
    }
    return cached;
  }

  const errors = [];
  let baseResult = null;
  // 1. Yahoo Finance dulu (gratis, unlimited)
  try {
    const r = await fetchYahooHistorical(symbol);
    if (r.candles.length > 0) baseResult = r;
  } catch (e) { errors.push(e.message); }

  // 2. Fallback ke GoAPI
  if (!baseResult) {
    try {
      const r = await fetchGoAPIHistorical(symbol);
      if (r.candles.length > 0) baseResult = r;
    } catch (e) { errors.push(e.message); }
  }

  if (!baseResult) throw new Error('Semua sumber historis gagal: ' + errors.join(' | '));

  cacheSet(cacheKey, baseResult, 15 * 60 * 1000); // cache historis 15 menit

  // Override last price dengan Stockbit live
  const live = await fetchStockbitLivePrice(symbol);
  if (live) {
    cacheSet('live:' + symbol, live, 30 * 1000);
    const candles = applyLivePrice(baseResult.candles.slice(), live);
    return { candles, source: baseResult.source + ' + stockbit live' };
  }
  return baseResult;
}

// === NEWS & SENTIMENT ===
const POS_WORDS = [
  'naik','untung','laba','tumbuh','kenaikan','bullish','akumulasi','optimis','ekspansi','dividen',
  'profit','surplus','growth','gain','rise','surge','rally','upgrade','beat','positif','menguat',
  'rekor','tertinggi','lonjak','meroket','tembus','breakout','akuisisi','kerjasama','kemitraan',
  'ekspansi','investasi','pertumbuhan','peningkatan','positive','strong','exceed','outperform',
  'target','rekomendasi beli','buy','top pick','penguatan','perbaikan','bangkit','rebound'
];
const NEG_WORDS = [
  'turun','rugi','defisit','penurunan','bearish','distribusi','koreksi','pesimis','pailit',
  'suspend','downgrade','miss','decline','fall','drop','plunge','loss','negatif','melemah',
  'terkoreksi','merosot','anjlok','ambruk','jatuh','tertekan','krisis','gagal','tunda','batal',
  'mundur','negative','weak','underperform','sell','jual','divestasi','kasus','denda','sanksi',
  'pelemahan','penurunan','penyusutan','ambles','terpangkas','laba turun'
];

function sentimentScore(text) {
  const t = String(text || '').toLowerCase();
  let pos = 0, neg = 0;
  for (const w of POS_WORDS) {
    const re = new RegExp('\\b' + w.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g');
    const m = t.match(re); if (m) pos += m.length;
  }
  for (const w of NEG_WORDS) {
    const re = new RegExp('\\b' + w.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g');
    const m = t.match(re); if (m) neg += m.length;
  }
  return { pos, neg, score: pos - neg };
}

async function fetchYahooNews(symbol) {
  try {
    const url = 'https://query1.finance.yahoo.com/v1/finance/search?q=' + symbol + '.JK&quotesCount=0&newsCount=20&listsCount=0';
    const res = await axios.get(url, {
      headers: { 'User-Agent': UA, 'Accept': 'application/json' },
      timeout: 12000, validateStatus: () => true
    });
    if (res.status >= 400) return [];
    const items = (res.data && res.data.news) || [];
    return items.map((n) => ({
      title: decodeHTML(n.title),
      publisher: n.publisher || 'Yahoo Finance',
      link: n.link,
      publishedAt: n.providerPublishTime ? new Date(n.providerPublishTime * 1000).toISOString() : null,
      source: 'Yahoo Finance'
    })).filter((n) => n.title);
  } catch (_) { return []; }
}

async function fetchGoogleNews(symbol) {
  try {
    const q = encodeURIComponent(symbol + ' saham');
    const url = 'https://news.google.com/rss/search?q=' + q + '&hl=id&gl=ID&ceid=ID:id';
    const res = await axios.get(url, {
      headers: { 'User-Agent': UA, 'Accept': 'application/rss+xml, application/xml, text/xml' },
      timeout: 12000, validateStatus: () => true
    });
    if (res.status >= 400 || !res.data) return [];
    const xml = String(res.data);
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let m;
    while ((m = itemRegex.exec(xml)) !== null && items.length < 20) {
      const block = m[1];
      const title = (block.match(/<title>([\s\S]*?)<\/title>/) || [])[1];
      const link = (block.match(/<link>([\s\S]*?)<\/link>/) || [])[1];
      const pub = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1];
      const src = (block.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [])[1];
      if (title) items.push({
        title: decodeHTML(title),
        publisher: decodeHTML(src) || 'Google News',
        link: (link || '').trim(),
        publishedAt: pub ? new Date(pub).toISOString() : null,
        source: 'Google News'
      });
    }
    return items;
  } catch (_) { return []; }
}

async function fetchNews(symbol) {
  const [yahoo, google] = await Promise.all([fetchYahooNews(symbol), fetchGoogleNews(symbol)]);
  // Dedupe by title
  const seen = new Set();
  const merged = [];
  for (const item of [...yahoo, ...google]) {
    const key = item.title.toLowerCase().slice(0, 60);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  // Sort by publishedAt desc
  merged.sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
  return merged.slice(0, 15);
}

function newsSentimentSignal(news) {
  if (!Array.isArray(news) || news.length === 0) {
    return { signal: 'NEUTRAL', news: [], totalPos: 0, totalNeg: 0, note: 'Tidak ada berita ditemukan' };
  }
  let totalPos = 0, totalNeg = 0;
  const scored = news.map((n) => {
    const s = sentimentScore(n.title);
    totalPos += s.pos; totalNeg += s.neg;
    return Object.assign({}, n, {
      sentiment: s.score > 0 ? 'POSITIVE' : s.score < 0 ? 'NEGATIVE' : 'NEUTRAL',
      sentimentScore: s.score
    });
  });
  let signal = 'NEUTRAL', note = '';
  if (totalPos === 0 && totalNeg === 0) {
    note = 'Sentimen netral - kata kunci sentiment tidak terdeteksi di ' + news.length + ' berita';
  } else if (totalPos >= totalNeg * 2 && totalPos >= 4) {
    signal = 'BUY';
    note = 'Sentimen positif dominan (' + totalPos + ' positif vs ' + totalNeg + ' negatif dari ' + news.length + ' berita)';
  } else if (totalNeg >= totalPos * 2 && totalNeg >= 4) {
    signal = 'SELL';
    note = 'Sentimen negatif dominan (' + totalNeg + ' negatif vs ' + totalPos + ' positif dari ' + news.length + ' berita)';
  } else {
    note = 'Sentimen netral / campuran (' + totalPos + ' positif vs ' + totalNeg + ' negatif)';
  }
  return { signal, news: scored, totalPos, totalNeg, note };
}

// === FIBONACCI ===
function fibonacciLevels(candles, lookback) {
  lookback = lookback || 60;
  const slice = candles.slice(-lookback);
  if (slice.length < 2) return null;
  let highIdx = 0, lowIdx = 0;
  for (let i = 1; i < slice.length; i++) {
    if (slice[i].high > slice[highIdx].high) highIdx = i;
    if (slice[i].low < slice[lowIdx].low) lowIdx = i;
  }
  const high = slice[highIdx].high, low = slice[lowIdx].low;
  const trendUp = highIdx > lowIdx;
  const fib = (pct) => trendUp ? high - (high - low) * pct : low + (high - low) * pct;
  return {
    high, low, trend: trendUp ? 'UP' : 'DOWN',
    levels: {
      'level_0': fib(0), 'level_236': fib(0.236), 'level_382': fib(0.382),
      'level_50': fib(0.5), 'level_618': fib(0.618), 'level_786': fib(0.786), 'level_100': fib(1)
    },
    buyZone: trendUp
      ? { from: fib(0.618), to: fib(0.382), label: 'Golden Pocket (38.2-61.8%)' }
      : { from: fib(0.382), to: fib(0.618), label: 'Resistance Zone (38.2-61.8%)' }
  };
}

// Trading plan dengan Fibonacci entry + signal-based exit (trailing, hold sampai indicator turun)
function calculateTradingPlan(candles, fib, gc, bb, rs) {
  const last = candles[candles.length - 1];
  const currentPrice = last.close;
  const recent20 = candles.slice(-20);
  const recentLow = Math.min.apply(null, recent20.map((c) => c.low));
  const ma21 = gc && gc.longMA;
  const ma9 = gc && gc.shortMA;

  let entry, initialStopLoss, strategy, entryType;
  let nextResistance = null, projectedTarget = null;

  if (fib && fib.trend === 'UP') {
    const f0 = fib.levels.level_0;
    const f236 = fib.levels.level_236;
    const f382 = fib.levels.level_382;
    const f618 = fib.levels.level_618;
    const f786 = fib.levels.level_786;

    if (currentPrice <= f382 && currentPrice >= f618) {
      entry = currentPrice;
      entryType = 'NOW';
      strategy = 'Harga di Golden Pocket (38.2-61.8%) - entry sekarang. Zone akumulasi optimal.';
    } else if (currentPrice > f0) {
      entry = f236;
      entryType = 'WAIT_PULLBACK';
      strategy = 'Harga sudah breakout di atas swing high. Tunggu pullback ke fib 23.6% (' + f236.toFixed(2) + ').';
    } else if (currentPrice > f382) {
      entry = f382;
      entryType = 'WAIT_PULLBACK';
      const upsideToEntry = ((currentPrice - entry) / currentPrice) * 100;
      strategy = 'Tunggu pullback ' + upsideToEntry.toFixed(1) + '% ke fib 38.2% (' + entry.toFixed(2) + ').';
    } else {
      entry = f618;
      entryType = 'WAIT_REBOUND';
      strategy = 'Tunggu rebound ke fib 61.8% (' + entry.toFixed(2) + ') untuk konfirmasi.';
    }

    const slCandidate1 = Math.min(f786, recentLow) * 0.99;
    initialStopLoss = Math.min(slCandidate1, entry * 0.97);

    nextResistance = fib.high;
    const swingRange = fib.high - fib.low;
    projectedTarget = {
      ext1272: entry + swingRange * 0.272,
      ext1618: entry + swingRange * 0.618,
      swingHigh: fib.high
    };
  } else if (fib && fib.trend === 'DOWN') {
    const f382 = fib.levels.level_382;
    const f618 = fib.levels.level_618;
    if (currentPrice >= f382 && currentPrice <= f618) {
      entry = currentPrice;
      entryType = 'COUNTER_TREND';
      strategy = 'Counter-trend setup di resistance zone. RISIKO TINGGI - hanya untuk scalping cepat.';
    } else if (currentPrice < f382) {
      entry = f382;
      entryType = 'WAIT_REVERSAL';
      strategy = 'Downtrend aktif. Tunggu reversal di fib 38.2% (' + entry.toFixed(2) + ').';
    } else {
      entry = f618;
      entryType = 'WAIT_REVERSAL';
      strategy = 'Tunggu break di atas fib 61.8% (' + entry.toFixed(2) + ').';
    }
    initialStopLoss = Math.min(recentLow, entry * 0.97);
    nextResistance = fib.high;
    projectedTarget = { ext1272: entry * 1.05, ext1618: entry * 1.10, swingHigh: fib.high };
  } else {
    entry = currentPrice;
    entryType = 'NOW';
    strategy = 'Data fibonacci tidak tersedia.';
    initialStopLoss = currentPrice * 0.97;
    nextResistance = currentPrice * 1.10;
    projectedTarget = { ext1272: currentPrice * 1.05, ext1618: currentPrice * 1.10, swingHigh: currentPrice * 1.10 };
  }

  if (!Number.isFinite(entry) || entry <= 0) entry = currentPrice;
  if (!Number.isFinite(initialStopLoss) || initialStopLoss >= entry) initialStopLoss = entry * 0.97;

  // Trailing stop = MA21 (geser stop ke MA21 setiap hari setelah profit)
  const trailingStop = ma21 && ma21 > initialStopLoss ? ma21 : null;

  // Exit triggers (sinyal yang bilang "saatnya jual")
  const exitTriggers = [
    'Death Cross MA9/MA21 muncul (sinyal reversal)',
    'RSI > 78 (overbought ekstrem) - tunggu RSI turun di bawah 70',
    'Harga break ke bawah MA21 dengan volume tinggi',
    'Foreign net SELL 3 hari berturut',
    'Sentimen berita berubah negatif dominan',
    'Harga tembus initial stop loss (' + initialStopLoss.toFixed(2) + ')'
  ];

  const stopPct = ((entry - initialStopLoss) / entry) * 100;
  const distToEntry = ((entry - currentPrice) / currentPrice) * 100;
  const upsideToResistance = ((nextResistance - entry) / entry) * 100;
  const rrToResistance = (nextResistance - entry) / (entry - initialStopLoss);

  return {
    currentPrice, entry, initialStopLoss, trailingStop,
    nextResistance, projectedTarget,
    entryType, strategy, exitTriggers,
    stopPct: stopPct.toFixed(2),
    distToEntryPct: distToEntry.toFixed(2),
    upsideToResistancePct: upsideToResistance.toFixed(2),
    riskRewardRatio: rrToResistance.toFixed(2),
    holdStrategy: 'HOLD selama indikator masih bullish.',
    note: 'Signal-based exit: tidak terbatas +5%.'
  };
}

// Rekomendasi untuk yang SUDAH PUNYA saham (holder advice)
function holderRecommendation(action, indicators, fibo) {
  const rsi = indicators.rsi.value;
  const trendUp = indicators.goldenCross.signal === 'BUY';
  const inGP = fibo && fibo.trend === 'UP' &&
    indicators.bollingerBands.price >= fibo.levels.level_618 &&
    indicators.bollingerBands.price <= fibo.levels.level_382;

  let label, color, reason;
  if (action === 'STRONG SELL') {
    label = 'JUAL SEKARANG';
    color = 'sell';
    reason = 'Sinyal sangat bearish dari mayoritas indikator. Take profit jika sudah cuan, atau cut loss untuk batasi kerugian. Jangan averaging down.';
  } else if (action === 'SELL') {
    label = 'KURANGI POSISI';
    color = 'sell';
    reason = 'Momentum melemah. Pertimbangkan jual sebagian untuk amankan profit. Sisanya monitor ketat - kalau ada sinyal lebih buruk, exit total.';
  } else if (action === 'STRONG BUY') {
    label = 'HOLD KUAT - bisa tambah';
    color = 'buy';
    reason = 'Sinyal sangat bullish. Pertahankan posisi. Kalau punya cash & sudah profit, boleh averaging up (tambah posisi) di pullback ke MA21.';
  } else if (action === 'BUY') {
    label = 'HOLD - pertahankan';
    color = 'buy';
    reason = 'Tren masih positif. Pertahankan posisi sambil pasang trailing stop di MA21. Jangan tambah posisi sebelum konfirmasi STRONG BUY.';
  } else {
    // HOLD
    if (rsi !== null && rsi > 70) {
      label = 'HOLD - jangan tambah';
      color = 'neutral';
      reason = 'RSI overbought (' + rsi.toFixed(1) + '). Pertahankan posisi tapi jangan tambah. Siap take profit jika muncul sinyal SELL.';
    } else if (trendUp) {
      label = 'HOLD - sinyal mixed';
      color = 'neutral';
      reason = 'Tren naik tapi sinyal lain mixed. Pertahankan posisi tanpa tambah. Pasang stop loss untuk proteksi.';
    } else {
      label = 'HOLD HATI-HATI';
      color = 'neutral';
      reason = 'Tren tidak jelas. Monitor harian untuk sinyal exit. Pertimbangkan kurangi posisi jika ada sinyal SELL.';
    }
  }
  return { label, color, reason };
}


app.get('/api/analyze/:emiten', async (req, res) => {
  const emiten = (req.params.emiten || '').trim();
  if (!emiten) return res.status(400).json({ error: 'Emiten wajib diisi' });
  try {
    const symbol = emiten.toUpperCase();
    const [hist, news] = await Promise.all([
      fetchHistorical(emiten),
      fetchNews(symbol)
    ]);
    const candles = hist.candles;
    if (candles.length < 22) {
      return res.status(422).json({ error: 'Data candle hanya ' + candles.length + ', butuh minimal 22.' });
    }
    const closes = candles.map((c) => c.close);
    const last = candles[candles.length - 1];
    const ma9Full = sma(closes, 9), ma21Full = sma(closes, 21);
    const bbFull = bollingerBands(closes, 20, 2), rsiFull = rsi(closes, 14);
    const macdFull = macd(closes, 12, 26, 9);
    const sliceN = Math.min(60, candles.length);
    const start = candles.length - sliceN;
    const chartCandles = candles.slice(start);
    const chart = chartCandles.map((c, i) => ({
      date: c.date, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume,
      ma9: ma9Full[start + i], ma21: ma21Full[start + i],
      bbUpper: bbFull.upper[start + i], bbMiddle: bbFull.middle[start + i], bbLower: bbFull.lower[start + i],
      rsi: rsiFull[start + i],
      macd: macdFull.macd[start + i],
      macdSignal: macdFull.signal[start + i],
      macdHist: macdFull.histogram[start + i]
    }));
    const volAvg = chartCandles.map((_, i) => {
      const idxAbs = start + i; if (idxAbs < 20) return null;
      let s = 0; for (let j = idxAbs - 20; j < idxAbs; j++) s += candles[j].volume;
      return s / 20;
    });

    const gc = goldenCross(closes, 9, 21);
    const bb = bollingerSignal(closes, 20, 2);
    const rs = rsiSignal(closes, 14);
    const vb = volumeBreakout(candles, 20, 2);
        const md = macdSignal(closes);
    const sent = newsSentimentSignal(news);
    const fibo = fibonacciLevels(candles, 60);
    const recommendation = aggregateRecommendation([gc.signal, bb.signal, rs.signal, vb.signal, md.signal]);

    const tradingPlan = calculateTradingPlan(candles, fibo, gc, bb, rs);
    const warnings = [];
        if (news.length === 0) warnings.push('Tidak ada berita yang ditemukan untuk sentiment analysis.');

    res.json({
      emiten: symbol, source: hist.source,
            lastCandle: last, candleCount: candles.length,
      indicators: {
        goldenCross: gc, bollingerBands: bb, rsi: rs,
        volumeBreakout: vb, macd: md, sentiment: sent
      },
      recommendation,
      tradingPlan,
      holderAdvice: holderRecommendation(recommendation.action, { goldenCross: gc, bollingerBands: bb, rsi: rs, sentiment: sent }, fibo),
      fibonacci: fibo, chart, volAvgSeries: volAvg, warnings,
      disclaimer: 'Hasil analisa ini adalah informasi teknikal, BUKAN rekomendasi investasi.'
    });
  } catch (err) {
    res.status(502).json({ error: 'Gagal memuat data ' + emiten + ': ' + err.message });
  }
});


// === STOCK SCREENER ===
// 200 saham IDX dengan rata-rata transaksi harian gede (LQ45 + IDX80 + blue chip mid-cap aktif)
// Saham super tipis / gorengan ekstrim TIDAK dimasukkan (kayak ZINC, IFSH, NETV, DIVA, BNBR penny, dll)
const SCREENER_LIST = [
  // ============ BANK ============
  'BBCA','BBRI','BMRI','BBNI','BBTN','BRIS','ARTO','BJBR','BJTM','BNGA','BDMN','BTPS','NISP','PNBN','MEGA','BNLI','SDRA','BNII','BBYB','BBKP',
  // ============ MULTIFINANCE & FINANCE ============
  'ADMF','BFIN','CFIN','MFIN','WOMF',
  // ============ TELCO & TOWER ============
  'TLKM','ISAT','EXCL','MTEL','TOWR','TBIG','LINK','SUPR',
  // ============ KONGLOMERASI - PRAJOGO PANGESTU ============
  'BRPT','TPIA','CUAN','PTRO','BREN','RAJA',
  // ============ KONGLOMERASI LAIN (Saratoga, Sinarmas, MPMX, Essa) ============
  'SRTG','MPMX','ESSA','DSSA','SMMA',
  // ============ OTOMOTIF & AUTOPARTS ============
  'ASII','AUTO','IMAS','GJTL','SMSM','DRMA','BRAM',
  // ============ ENERGI - BATU BARA ============
  'BYAN','ADRO','PTBA','ITMG','ADMR','HRUM','INDY','BUMI','BSSR','ABMM','GEMS',
  // ============ ENERGI - OIL & GAS ============
  'MEDC','PGAS','ELSA','AKRA','ENRG',
  // ============ ENERGI - RENEWABLE / POWER ============
  'TOBA','POWR','KEEN',
  // ============ HEAVY EQUIPMENT & MINING SERVICES ============
  'UNTR','HEXA','DOID','DEWA',
  // ============ LOGAM - NIKEL ============
  'INCO','NCKL','MBMA',
  // ============ LOGAM - EMAS / TEMBAGA ============
  'ANTM','MDKA','AMMN','PSAB','BRMS',
  // ============ LOGAM - LAINNYA (timah, baja, mineral) ============
  'TINS','KRAS','CITA','ISSP',
  // ============ PULP & PAPER ============
  'INKP','TKIM','SPMA','FASW',
  // ============ CONSUMER GOODS / FARMASI ============
  'UNVR','INDF','ICBP','MYOR','GGRM','HMSP','KLBF','SIDO','TSPC','KAEF',
  // ============ MAKANAN & MINUMAN ============
  'ULTJ','ROTI','MLBI','DLTA','CMRY','CAMP','GOOD','AVIA','KINO','WIIM',
  // ============ HEALTHCARE & RUMAH SAKIT ============
  'MIKA','HEAL','PRDA','SILO','SRAJ','SAME',
  // ============ SEMEN & KONSTRUKSI ============
  'SMGR','INTP','WIKA','PTPP','ADHI','JSMR','WSKT','WSBP','TOTL','BUKK','ARNA','SSIA','DGIK',
  // ============ PROPERTI ============
  'BSDE','CTRA','PWON','SMRA','LPKR','DILD','MTLA','APLN','ASRI','KIJA','DUTI','DMAS','BEST','PANI',
  // ============ TECH & MEDIA ============
  'BUKA','GOTO','EMTK','DCII','MTDL','MCAS','MNCN','SCMA','KPIG','WIRG','MARK','BMTR','MSIN',
  // ============ RETAIL ============
  'ACES','MAPI','ERAA','MIDI','AMRT','LPPF','MAPA','MAPB','RANC','HRTA','CNMA','MDIY',
  // ============ AGRI & SAWIT ============
  'AALI','LSIP','SIMP','SGRO','DSNG','SSMS','SMAR','TAPG','TBLA','ANJT',
  // ============ POULTRY ============
  'CPIN','JPFA','MAIN','SIPD',
  // ============ SHIPPING & MARINE ============
  'TMAS','SMDR','HITS','TPMA','SHIP','WINS','MBSS','BBRM','IPCM',
  // ============ HOTEL, TOURISM, AVIATION, TRANSPORT ============
  'PJAA','BAYU','GIAA','BIRD','ASSA',
  // ============ DIVERSIFIED HOLDING / OTHERS ============
  'BHIT','POLU','TRIM','PNLF',
];
// Dedupe
const SCREENER_LIST_UNIQUE = [...new Set(SCREENER_LIST)];

// Deteksi saham suspend/halt:
// - Last candle date > 5 hari kalender (>1 minggu trading) -> suspend
// - 3 candle terakhir volume = 0 -> halted
// - 5 candle terakhir close-nya sama persis (price frozen)
function detectSuspended(candles) {
  if (!candles || candles.length < 5) return { suspended: false };
  const last = candles[candles.length - 1];
  const lastDate = new Date(last.date);
  const ageDays = (Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays > 5) return { suspended: true, reason: 'data terakhir ' + Math.floor(ageDays) + ' hari yang lalu' };
  const last3 = candles.slice(-3);
  if (last3.every((c) => !c.volume || c.volume === 0)) return { suspended: true, reason: 'volume 0 di 3 candle terakhir' };
  const last5 = candles.slice(-5);
  if (last5.every((c) => c.close === last5[0].close)) return { suspended: true, reason: 'harga frozen di ' + last5[0].close + ' selama 5 hari' };
  return { suspended: false };
}

async function quickAnalyze(symbol) {
  try {
    const r = await fetchYahooHistorical(symbol);
    let candles = r.candles;
    if (candles.length < 22) return null;
    const susp = detectSuspended(candles);
    if (susp.suspended) {
      console.warn('[screener] ' + symbol + ' SUSPEND: ' + susp.reason);
      return { symbol, suspended: true, suspendReason: susp.reason };
    }
    // Override last price dengan Stockbit live (real-time IDX)
    const live = await fetchStockbitLivePrice(symbol);
    if (live) candles = applyLivePrice(candles.slice(), live);
    const closes = candles.map((c) => c.close);
    const last = candles[candles.length - 1];
    const gc = goldenCross(closes, 9, 21);
    const bb = bollingerSignal(closes, 20, 2);
    const rs = rsiSignal(closes, 14);
    const vb = volumeBreakout(candles, 20, 2);
    const md = macdSignal(closes);
    const fibo = fibonacciLevels(candles, 60);
    const signals = [gc.signal, bb.signal, rs.signal, vb.signal, md.signal];
    let score = 0;
    signals.forEach((s) => { if (s === 'BUY') score += 1; else if (s === 'SELL') score -= 1; });
    // Bonus / penalty
    if (gc.note && gc.note.indexOf('Golden Cross') === 0) score += 2;
    if (gc.note && gc.note.indexOf('Death Cross') === 0) score -= 2;
    if (rs.value !== null) {
      if (rs.value < 25) score += 1;
      if (rs.value > 75) score -= 1;
    }
    // Bonus kalau di Golden Pocket Fibonacci (uptrend) - opportunity entry sekarang
    let inGoldenPocket = false;
    if (fibo && fibo.trend === 'UP') {
      if (last.close >= fibo.levels.level_618 && last.close <= fibo.levels.level_382) {
        score += 2; inGoldenPocket = true;
      }
    }
    // Hitung %change 1, 7, 30 hari trading
    function pctChange(daysAgo) {
      const idx = candles.length - 1 - daysAgo;
      if (idx < 0) return 0;
      const prev = candles[idx].close;
      return ((last.close - prev) / prev) * 100;
    }
    const pct1d = pctChange(1);
    const pct7d = pctChange(7);
    const pct30d = pctChange(30);
    return {
      symbol, price: last.close, date: last.date, score,
      pct1d: pct1d.toFixed(2),
      pct7d: pct7d.toFixed(2),
      pct30d: pct30d.toFixed(2),
      signals: { gc: gc.signal, bb: bb.signal, rsi: rs.signal, volume: vb.signal, macd: md.signal },
      rsi: rs.value !== null ? rs.value.toFixed(1) : null,
      trend: fibo ? fibo.trend : null,
      inGoldenPocket,
      gcNote: gc.note
    };
  } catch (_) { return null; }
}

// Wrapper timeout — Promise.race terhadap setTimeout supaya tidak ada yg hang selamanya
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout ' + ms + 'ms')), ms))
  ]).catch((e) => {
    if (label) console.warn('[screener]', label, 'failed:', e.message);
    return null;
  });
}

// Concurrency limiter - batch N stocks at a time
async function runWithLimit(items, limit, taskFn) {
  const results = new Array(items.length);
  let idx = 0;
  let done = 0;
  const total = items.length;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await taskFn(items[i]);
      done++;
      if (done % 25 === 0 || done === total) console.log('[screener] progress ' + done + '/' + total);
    }
  }
  const workers = Array(Math.min(limit, items.length)).fill(0).map(() => worker());
  await Promise.all(workers);
  return results;
}

app.get('/api/screener', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  // Cache 1 jam, bypass dengan ?refresh=1
  if (req.query.refresh || req.query.fresh) {
    cache.delete('screener:v2');
    console.log('[screener] cache di-clear, force fresh scan');
  } else {
    const cached = cacheGet('screener:v2');
    if (cached) { console.log('[screener] return cached'); return res.json(cached); }
  }
  console.log('[screener] scan fresh (cache 1 jam)');
  const list = SCREENER_LIST_UNIQUE;
  console.log('[screener] mulai scan ' + list.length + ' saham (concurrency 25, timeout 10s/req)...');
  const t0 = Date.now();
  const results = await runWithLimit(list, 25, (s) => withTimeout(quickAnalyze(s), 10000, s));
  const allResults = results.filter((r) => r != null);
  // Pisahkan saham suspend - tidak dianalisa untuk rekomendasi
  const suspended = allResults.filter((r) => r.suspended);
  const all = allResults.filter((r) => !r.suspended);
  console.log('[screener] selesai dalam ' + ((Date.now() - t0) / 1000).toFixed(1) + 's, ' + all.length + ' valid + ' + suspended.length + ' suspend dari ' + list.length);
  all.sort((a, b) => b.score - a.score);
  // Filter: hanya tampilkan kalau skor signifikan supaya konsisten dengan detail recommendation
  // Detail pakai 6 indikator dengan threshold ketat - scanner pakai 4 indikator
  // Jadi syarat: BUY butuh skor >= +2, SELL butuh skor <= -2
  const buyCandidates = all.filter((s) => s.score >= 2);
  const sellCandidates = all.filter((s) => s.score <= -2);
  const topBuy = buyCandidates.slice(0, 10);
  const topSell = sellCandidates.slice(-10).reverse();
  const payload = {
    scannedAt: new Date().toISOString(),
    totalScanned: list.length,
    successCount: all.length,
    suspendedCount: suspended.length,
    suspended: suspended.map((s) => ({ symbol: s.symbol, reason: s.suspendReason })),
    topBuy, topSell
  };
  cacheSet('screener:v2', payload, 60 * 60 * 1000); // cache 1 jam
  res.json(payload);
});


// === PORTFOLIO ANALYZE ===
// POST: { holdings: [{ symbol, lot, avgPrice }] }
// Returns per-holding analysis with current price, P/L, recommendation
app.post('/api/portfolio-analyze', async (req, res) => {
  const holdings = (req.body && req.body.holdings) || [];
  if (!Array.isArray(holdings) || holdings.length === 0) {
    return res.status(400).json({ error: 'holdings array kosong' });
  }
  const results = await Promise.all(holdings.map(async (h) => {
    const symbol = String(h.symbol || '').toUpperCase().trim();
    const lot = Number(h.lot) || 0;
    const avgPrice = Number(h.avgPrice) || 0;
    if (!symbol || lot === 0 || avgPrice === 0) {
      return { symbol, error: 'data tidak valid' };
    }
    try {
      const r = await withTimeout(quickAnalyze(symbol), 12000, symbol);
      if (!r) return { symbol, lot, avgPrice, error: 'data tidak tersedia' };
      const currentPrice = r.price;
      const shares = lot * 100;
      const cost = shares * avgPrice;
      const value = shares * currentPrice;
      const pl = value - cost;
      const pctReturn = ((currentPrice - avgPrice) / avgPrice) * 100;
      // Decide recommendation untuk holder
      let recommendation, color, reason;
      const signals = r.signals;
      let buyCnt = 0, sellCnt = 0;
      Object.values(signals).forEach((s) => { if (s === 'BUY') buyCnt++; else if (s === 'SELL') sellCnt++; });
      const diff = buyCnt - sellCnt;
      if (diff >= 3) {
        recommendation = 'HOLD - bisa tambah';
        color = 'buy';
        reason = 'Momentum kuat (' + buyCnt + ' BUY signal). Pertahankan + averaging up di pullback.';
      } else if (diff >= 1) {
        recommendation = 'HOLD';
        color = 'buy';
        reason = 'Sinyal masih positif. Pertahankan posisi, pasang trailing stop di MA21.';
      } else if (diff <= -3) {
        recommendation = 'JUAL SEKARANG';
        color = 'sell';
        reason = 'Momentum sangat negatif (' + sellCnt + ' SELL signal). Take profit/cut loss segera.';
      } else if (diff <= -1) {
        recommendation = 'KURANGI POSISI';
        color = 'sell';
        reason = 'Momentum melemah. Pertimbangkan jual sebagian, monitor sisanya.';
      } else if (r.rsi && Number(r.rsi) > 70) {
        recommendation = 'HOLD - jangan tambah';
        color = 'neutral';
        reason = 'RSI overbought (' + r.rsi + '). Jangan tambah, siap take profit.';
      } else {
        recommendation = 'HOLD - monitor';
        color = 'neutral';
        reason = 'Sinyal mixed/netral. Pertahankan posisi sambil monitor.';
      }
      return {
        symbol, lot, shares, avgPrice, currentPrice,
        cost, value, pl, pctReturn,
        score: r.score,
        signals, rsi: r.rsi, trend: r.trend,
        inGoldenPocket: r.inGoldenPocket,
        recommendation, color, reason,
        pct1d: r.pct1d, pct7d: r.pct7d, pct30d: r.pct30d
      };
    } catch (e) {
      return { symbol, lot, avgPrice, error: e.message };
    }
  }));
  // Total summary
  let totalCost = 0, totalValue = 0;
  results.forEach((r) => { if (r.cost) { totalCost += r.cost; totalValue += r.value; } });
  const totalPL = totalValue - totalCost;
  const totalPct = totalCost > 0 ? (totalPL / totalCost) * 100 : 0;
  res.json({
    holdings: results,
    summary: { totalCost, totalValue, totalPL, totalPct: totalPct.toFixed(2) }
  });
});


app.get('/api/health', (_req, res) => res.json({ ok: true, tokenConfigured: Boolean(TOKEN) }));
app.listen(PORT, () => {
  console.log('Saham Indonesia Analyzer running on http://localhost:' + PORT);
  if (!TOKEN) console.warn('WARNING: GOAPI_TOKEN belum di-set di .env');
});
