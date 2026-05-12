const $ = id => document.getElementById(id);
function fmt(n,d){ if(n==null||Number.isNaN(n)) return '-'; return Number(n).toLocaleString('id-ID',{maximumFractionDigits:d==null?2:d}); }
function fmtRp(n){ if(n==null||Number.isNaN(n)) return '-'; var a=Math.abs(n),s=n<0?'-':''; if(a>=1e12) return s+(a/1e12).toFixed(2)+' T'; if(a>=1e9) return s+(a/1e9).toFixed(2)+' M'; if(a>=1e6) return s+(a/1e6).toFixed(2)+' Jt'; return n.toLocaleString('id-ID'); }

const STORAGE_KEY = 'pf_holdings_v1';

function loadHoldings(){
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch(_) { return []; }
}
function saveHoldings(list){ localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); }

function addHolding(){
  var symbol = $('inSymbol').value.trim().toUpperCase();
  var lot = Number($('inLot').value);
  var avg = Number($('inAvg').value);
  if (!symbol || !lot || !avg) { alert('Isi semua field'); return; }
  var list = loadHoldings();
  // Cek duplicate - kalau sudah ada, update avg & lot (averaging)
  var existing = list.find(h => h.symbol === symbol);
  if (existing) {
    var totalLot = existing.lot + lot;
    var totalCost = (existing.lot * 100 * existing.avgPrice) + (lot * 100 * avg);
    existing.lot = totalLot;
    existing.avgPrice = totalCost / (totalLot * 100);
  } else {
    list.push({ symbol, lot, avgPrice: avg });
  }
  saveHoldings(list);
  $('inSymbol').value = ''; $('inLot').value = ''; $('inAvg').value = '';
  refresh();
}

function removeHolding(symbol){
  if (!confirm('Hapus ' + symbol + ' dari portfolio?')) return;
  var list = loadHoldings().filter(h => h.symbol !== symbol);
  saveHoldings(list);
  refresh();
}

async function refresh(){
  var list = loadHoldings();
  var status = $('pfStatus');
  var table = $('pfTable');
  if (list.length === 0) {
    status.textContent = 'Belum ada holding. Tambah di atas.';
    status.style.display = 'block';
    table.style.display = 'none';
    ['sCost','sValue','sPL','sPct'].forEach(id => $(id).textContent = '-');
    return;
  }
  status.textContent = 'Memuat harga & analisa...';
  status.style.display = 'block';
  table.style.display = 'none';

  try {
    var res = await fetch('/api/portfolio-analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ holdings: list })
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error');

    // Summary
    var s = data.summary;
    $('sCost').textContent = fmtRp(s.totalCost);
    $('sValue').textContent = fmtRp(s.totalValue);
    var plEl = $('sPL'), pctEl = $('sPct');
    plEl.textContent = (s.totalPL >= 0 ? '+' : '') + fmtRp(s.totalPL);
    plEl.className = 'value ' + (s.totalPL >= 0 ? 'buy' : 'sell');
    pctEl.textContent = (s.totalPL >= 0 ? '+' : '') + s.totalPct + '%';
    pctEl.className = 'value ' + (s.totalPL >= 0 ? 'buy' : 'sell');

    // Rows
    var body = $('pfBody');
    body.innerHTML = '';
    data.holdings.forEach(h => {
      if (h.error) {
        var tr = document.createElement('tr');
        tr.innerHTML = '<td class="sym">' + h.symbol + '</td>' +
          '<td colspan="8" style="color:var(--sell);font-style:italic;">Error: ' + h.error + '</td>' +
          '<td><button class="del" data-symbol="' + h.symbol + '">Hapus</button></td>';
        body.appendChild(tr);
        return;
      }
      var plClass = h.pl >= 0 ? 'pos' : 'neg';
      var plSign = h.pl >= 0 ? '+' : '';
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td class="sym"><a href="/analyze.html?emiten=' + h.symbol + '" style="color:inherit;text-decoration:none;">' + h.symbol + '</a></td>' +
        '<td class="num">' + h.lot + '</td>' +
        '<td class="num">' + fmt(h.avgPrice) + '</td>' +
        '<td class="num">' + fmt(h.currentPrice) + '</td>' +
        '<td class="num">' + fmtRp(h.cost) + '</td>' +
        '<td class="num">' + fmtRp(h.value) + '</td>' +
        '<td class="num ' + plClass + '">' + plSign + fmtRp(h.pl) + '</td>' +
        '<td class="num ' + plClass + '">' + plSign + h.pctReturn.toFixed(2) + '%</td>' +
        '<td><span class="reco ' + h.color + '">' + h.recommendation + '</span></td>' +
        '<td><button class="del" data-symbol="' + h.symbol + '">Hapus</button></td>';
      body.appendChild(tr);
      // Reason row
      var reasonTr = document.createElement('tr');
      reasonTr.className = 'reason-row';
      reasonTr.innerHTML = '<td colspan="10">' + h.reason + '</td>';
      body.appendChild(reasonTr);
    });
    body.querySelectorAll('button.del').forEach(btn => {
      btn.addEventListener('click', () => removeHolding(btn.getAttribute('data-symbol')));
    });
    status.style.display = 'none';
    table.style.display = 'table';
  } catch(e) {
    status.textContent = 'Gagal: ' + e.message;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  $('btnAdd').addEventListener('click', addHolding);
  $('btnRefresh').addEventListener('click', refresh);
  ['inSymbol','inLot','inAvg'].forEach(id => {
    $(id).addEventListener('keydown', e => { if (e.key === 'Enter') addHolding(); });
  });
  refresh();
});
