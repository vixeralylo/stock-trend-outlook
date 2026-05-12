// Technical indicators
function sma(values, period) {
  const out = new Array(values.length).fill(null);
  if (values.length < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  out[period - 1] = sum / period;
  for (let i = period; i < values.length; i++) {
    sum += values[i] - values[i - period];
    out[i] = sum / period;
  }
  return out;
}

function stdev(values, period, means) {
  const out = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    const m = means[i];
    if (m === null) continue;
    let s = 0;
    for (let j = i - period + 1; j <= i; j++) s += (values[j] - m) ** 2;
    out[i] = Math.sqrt(s / period);
  }
  return out;
}

function bollingerBands(closes, period, mult) {
  period = period || 20; mult = mult || 2;
  const middle = sma(closes, period);
  const sd = stdev(closes, period, middle);
  const upper = middle.map((m, i) => (m === null ? null : m + mult * sd[i]));
  const lower = middle.map((m, i) => (m === null ? null : m - mult * sd[i]));
  return { upper, middle, lower };
}

function rsi(closes, period) {
  period = period || 14;
  const out = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;
  let gainSum = 0, lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gainSum += diff; else lossSum -= diff;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

function ema(values, period) {
  const out = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  // Seed with SMA
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  out[period - 1] = sum / period;
  for (let i = period; i < values.length; i++) {
    out[i] = values[i] * k + out[i - 1] * (1 - k);
  }
  return out;
}

function macd(closes, fastP, slowP, signalP) {
  fastP = fastP || 12; slowP = slowP || 26; signalP = signalP || 9;
  const emaFast = ema(closes, fastP);
  const emaSlow = ema(closes, slowP);
  const macdLine = closes.map((_, i) => {
    if (emaFast[i] == null || emaSlow[i] == null) return null;
    return emaFast[i] - emaSlow[i];
  });
  // Signal line = EMA(9) of MACD line (only valid values)
  const validIdx = macdLine.findIndex((v) => v != null);
  const validMacd = macdLine.slice(validIdx);
  const sig = ema(validMacd, signalP);
  const signalLine = new Array(macdLine.length).fill(null);
  for (let i = 0; i < sig.length; i++) signalLine[validIdx + i] = sig[i];
  const histogram = macdLine.map((m, i) => (m == null || signalLine[i] == null) ? null : m - signalLine[i]);
  return { macd: macdLine, signal: signalLine, histogram };
}

function macdSignal(closes) {
  const m = macd(closes, 12, 26, 9);
  const last = closes.length - 1;
  const macdNow = m.macd[last];
  const sigNow = m.signal[last];
  const histNow = m.histogram[last];
  if (macdNow == null || sigNow == null) {
    return { signal: 'NEUTRAL', macd: macdNow, signalLine: sigNow, histogram: histNow, note: 'Data MACD belum cukup' };
  }
  // Cek cross dalam 3 bar terakhir
  let crossed = null;
  for (let i = Math.max(1, last - 2); i <= last; i++) {
    const a = m.macd[i], b = m.signal[i], pa = m.macd[i - 1], pb = m.signal[i - 1];
    if (a == null || b == null || pa == null || pb == null) continue;
    if (pa <= pb && a > b) { crossed = { type: 'BULLISH', barsAgo: last - i }; break; }
    if (pa >= pb && a < b) { crossed = { type: 'BEARISH', barsAgo: last - i }; break; }
  }
  let signal = 'NEUTRAL', note = '';
  if (crossed && crossed.type === 'BULLISH') {
    signal = 'BUY';
    note = 'MACD bullish cross ' + (crossed.barsAgo === 0 ? 'hari ini' : crossed.barsAgo + ' hari lalu') + ' - momentum naik';
  } else if (crossed && crossed.type === 'BEARISH') {
    signal = 'SELL';
    note = 'MACD bearish cross ' + (crossed.barsAgo === 0 ? 'hari ini' : crossed.barsAgo + ' hari lalu') + ' - momentum turun';
  } else if (macdNow > sigNow && histNow > 0) {
    signal = 'BUY';
    note = 'MACD ' + macdNow.toFixed(2) + ' di atas signal ' + sigNow.toFixed(2) + ' (hist +' + histNow.toFixed(2) + ')';
  } else if (macdNow < sigNow && histNow < 0) {
    signal = 'SELL';
    note = 'MACD ' + macdNow.toFixed(2) + ' di bawah signal ' + sigNow.toFixed(2) + ' (hist ' + histNow.toFixed(2) + ')';
  } else {
    note = 'MACD ' + macdNow.toFixed(2) + ' / signal ' + sigNow.toFixed(2) + ' - mixed';
  }
  return { signal, macd: macdNow, signalLine: sigNow, histogram: histNow, note };
}

function goldenCross(closes, shortP, longP) {
  shortP = shortP || 9; longP = longP || 21;
  const sShort = sma(closes, shortP);
  const sLong = sma(closes, longP);
  const last = closes.length - 1;
  if (last < 1) return { signal: 'NEUTRAL', shortMA: null, longMA: null, periods: { short: shortP, long: longP }, note: 'Data tidak cukup' };
  const sNow = sShort[last], lNow = sLong[last];
  const sPrev = sShort[last - 1], lPrev = sLong[last - 1];
  if (sNow === null || lNow === null || sPrev === null || lPrev === null) {
    return { signal: 'NEUTRAL', shortMA: sNow, longMA: lNow, periods: { short: shortP, long: longP }, note: 'Butuh ' + longP + ' candle untuk MA' + longP + '. Tersedia: ' + closes.length };
  }
  let crossed = null;
  for (let i = Math.max(1, last - 2); i <= last; i++) {
    const a = sShort[i], b = sLong[i], pa = sShort[i - 1], pb = sLong[i - 1];
    if (a === null || b === null || pa === null || pb === null) continue;
    if (pa <= pb && a > b) { crossed = { type: 'GOLDEN', barsAgo: last - i }; break; }
    if (pa >= pb && a < b) { crossed = { type: 'DEATH', barsAgo: last - i }; break; }
  }
  let signal = 'NEUTRAL', note = '';
  if (crossed && crossed.type === 'GOLDEN') {
    signal = 'BUY';
    note = 'Golden Cross MA' + shortP + '/MA' + longP + ' ' + (crossed.barsAgo === 0 ? 'hari ini' : crossed.barsAgo + ' hari lalu') + ' - entry signal';
  } else if (crossed && crossed.type === 'DEATH') {
    signal = 'SELL';
    note = 'Death Cross MA' + shortP + '/MA' + longP + ' ' + (crossed.barsAgo === 0 ? 'hari ini' : crossed.barsAgo + ' hari lalu') + ' - exit signal';
  } else if (sNow > lNow) {
    signal = 'BUY';
    note = 'Tren naik: MA' + shortP + ' ' + (((sNow - lNow) / lNow) * 100).toFixed(2) + '% di atas MA' + longP;
  } else {
    signal = 'SELL';
    note = 'Tren turun: MA' + shortP + ' ' + (((lNow - sNow) / lNow) * 100).toFixed(2) + '% di bawah MA' + longP;
  }
  return { signal, shortMA: sNow, longMA: lNow, periods: { short: shortP, long: longP }, note };
}

function bollingerSignal(closes, period, mult) {
  period = period || 20; mult = mult || 2;
  const bb = bollingerBands(closes, period, mult);
  const last = closes.length - 1;
  const price = closes[last];
  const upper = bb.upper[last], middle = bb.middle[last], lower = bb.lower[last];
  if (upper === null) return { signal: 'NEUTRAL', upper, middle, lower, price, note: 'Data BB belum cukup' };
  const range = upper - lower;
  const positionPct = range === 0 ? 50 : ((price - lower) / range) * 100;
  let signal = 'NEUTRAL', note = '';
  if (price <= lower) { signal = 'BUY'; note = 'Harga ' + price.toFixed(2) + ' menembus lower band - oversold'; }
  else if (price >= upper) { signal = 'SELL'; note = 'Harga ' + price.toFixed(2) + ' menembus upper band - overbought'; }
  else if (positionPct < 25) { signal = 'BUY'; note = 'Dekat lower band (' + positionPct.toFixed(0) + '%)'; }
  else if (positionPct > 75) { signal = 'SELL'; note = 'Dekat upper band (' + positionPct.toFixed(0) + '%)'; }
  else { note = 'Tengah band (' + positionPct.toFixed(0) + '%)'; }
  return { signal, upper, middle, lower, price, positionPct, note };
}

function rsiSignal(closes, period) {
  period = period || 14;
  const r = rsi(closes, period);
  const last = closes.length - 1;
  const value = r[last];
  if (value === null) return { signal: 'NEUTRAL', value, note: 'Data RSI belum cukup' };
  let signal = 'NEUTRAL', note = '';
  if (value < 30) { signal = 'BUY'; note = 'RSI ' + value.toFixed(1) + ' - oversold'; }
  else if (value > 70) { signal = 'SELL'; note = 'RSI ' + value.toFixed(1) + ' - overbought'; }
  else if (value < 45) { note = 'RSI ' + value.toFixed(1) + ' - bias melemah'; }
  else if (value > 55) { note = 'RSI ' + value.toFixed(1) + ' - bias menguat'; }
  else { note = 'RSI ' + value.toFixed(1) + ' - netral'; }
  return { signal, value, note };
}

function volumeBreakout(candles, period, multiplier) {
  period = period || 20; multiplier = multiplier || 2;
  const last = candles.length - 1;
  if (last < period) return { signal: 'NEUTRAL', currentVolume: null, avgVolume: null, ratio: null, note: 'Data volume belum cukup' };
  let avg = 0;
  for (let i = last - period; i < last; i++) avg += candles[i].volume;
  avg /= period;
  const currentVolume = candles[last].volume;
  const ratio = avg === 0 ? 0 : currentVolume / avg;
  const priceChange = candles[last].close - candles[last - 1].close;
  let signal = 'NEUTRAL', note = '';
  if (ratio >= multiplier && priceChange > 0) { signal = 'BUY'; note = 'Volume ' + ratio.toFixed(2) + 'x + harga naik (akumulasi)'; }
  else if (ratio >= multiplier && priceChange < 0) { signal = 'SELL'; note = 'Volume ' + ratio.toFixed(2) + 'x + harga turun (distribusi)'; }
  else if (ratio >= multiplier) { note = 'Volume breakout ' + ratio.toFixed(2) + 'x, harga sideways'; }
  else { note = 'Volume normal (' + ratio.toFixed(2) + 'x ' + period + 'd)'; }
  return { signal, currentVolume, avgVolume: avg, ratio, note };
}

function fmtRpShort(n) {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e12) return sign + (abs / 1e12).toFixed(2) + ' T';
  if (abs >= 1e9) return sign + (abs / 1e9).toFixed(2) + ' M';
  if (abs >= 1e6) return sign + (abs / 1e6).toFixed(2) + ' Jt';
  return n.toLocaleString('id-ID');
}

function foreignFlowSignal(flows) {
  if (!Array.isArray(flows) || flows.length === 0) {
    return { signal: 'NEUTRAL', netTotal: 0, days: [], note: 'Data foreign flow tidak tersedia' };
  }
  const recent = flows.slice(-4);
  const netTotal = recent.reduce((s, d) => s + (d.net || 0), 0);
  const positiveDays = recent.filter((d) => (d.net || 0) > 0).length;
  const negativeDays = recent.filter((d) => (d.net || 0) < 0).length;
  let signal = 'NEUTRAL', note = '';
  // Threshold: butuh net signifikan (>1 Miliar) + konsistensi 4 hari untuk action
  const SIG_THRESHOLD = 1e9; // 1 Miliar Rupiah
  if (netTotal > SIG_THRESHOLD && positiveDays >= 3) {
    signal = 'BUY';
    note = 'Foreign net BUY ' + fmtRpShort(netTotal) + ' (' + positiveDays + '/' + recent.length + ' hari positif) - akumulasi asing kuat';
  } else if (netTotal < -SIG_THRESHOLD && negativeDays >= 3) {
    signal = 'SELL';
    note = 'Foreign net SELL ' + fmtRpShort(netTotal) + ' (' + negativeDays + '/' + recent.length + ' hari negatif) - distribusi asing kuat';
  } else {
    note = 'Foreign flow netral / tipis (' + fmtRpShort(netTotal) + ')';
  }
  return { signal, netTotal, days: recent, note };
}

function aggregateRecommendation(signals) {
  let buy = 0, sell = 0;
  for (const s of signals) { if (s === 'BUY') buy++; else if (s === 'SELL') sell++; }
  const diff = buy - sell;
  // 5 indikator: gc, bb, rsi, volume, macd
  if (buy >= 4 && sell === 0) return { action: 'STRONG BUY', score: diff };
  if (sell >= 4 && buy === 0) return { action: 'STRONG SELL', score: diff };
  if (diff >= 2) return { action: 'BUY', score: diff };
  if (diff <= -2) return { action: 'SELL', score: diff };
  return { action: 'HOLD', score: diff };
}

module.exports = {
  ema, macd, macdSignal,
  sma, bollingerBands, rsi,
  goldenCross, bollingerSignal, rsiSignal, volumeBreakout, foreignFlowSignal,
  aggregateRecommendation
};
