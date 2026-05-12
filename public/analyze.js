if (window.Chart && window['chartjs-plugin-annotation']) {
  Chart.register(window['chartjs-plugin-annotation']);
}
const $ = id => document.getElementById(id);
function setText(id,v){var e=$(id); if(e) e.textContent=v;}
function setHTML(id,v){var e=$(id); if(e) e.innerHTML=v;}
function fmt(n,d){ if(n==null||Number.isNaN(n)) return '-'; return Number(n).toLocaleString('id-ID',{maximumFractionDigits:d==null?2:d}); }
function fmtRp(n){ if(n==null||Number.isNaN(n)) return '-'; var a=Math.abs(n),s=n<0?'-':''; if(a>=1e12) return s+(a/1e12).toFixed(2)+' T'; if(a>=1e9) return s+(a/1e9).toFixed(2)+' M'; if(a>=1e6) return s+(a/1e6).toFixed(2)+' Jt'; return n.toLocaleString('id-ID'); }
function timeAgo(iso){ if(!iso) return ''; var d=new Date(iso),s=Math.max(0,Math.floor((Date.now()-d)/1000)); if(s<60) return s+'d lalu'; if(s<3600) return Math.floor(s/60)+'m lalu'; if(s<86400) return Math.floor(s/3600)+'j lalu'; return Math.floor(s/86400)+' hari lalu'; }
function escHTML(s){ return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
const charts = {};
function destroyChart(k){ if(charts[k]){ charts[k].destroy(); delete charts[k]; } }

const COMMON_OPTS = {
  responsive:true, maintainAspectRatio:false,
  interaction:{intersect:false,mode:'index'},
  plugins:{legend:{display:false},tooltip:{backgroundColor:'#0f1729',padding:10,cornerRadius:8}},
  scales:{
    x:{ticks:{color:'#6b7693',maxTicksLimit:8,font:{size:10}},grid:{color:'rgba(230,235,247,.6)'}},
    y:{ticks:{color:'#6b7693',font:{size:10}},grid:{color:'rgba(230,235,247,.6)'}}
  }
};

function buildMainChart(data){
  destroyChart('main');
  var ohlcData = data.chart.map(c => ({
    x: new Date(c.date).getTime(),
    o: c.open, h: c.high, l: c.low, c: c.close
  }));
  var ma9Data = data.chart.map(c => ({ x: new Date(c.date).getTime(), y: c.ma9 }));
  var ma21Data = data.chart.map(c => ({ x: new Date(c.date).getTime(), y: c.ma21 }));
  var annotations = {};
  if (data.fibonacci) {
    var lv = data.fibonacci.levels, bz = data.fibonacci.buyZone;
    annotations.buyZone = {
      type:'box',yMin:Math.min(bz.from,bz.to),yMax:Math.max(bz.from,bz.to),
      backgroundColor:'rgba(0,199,121,.10)',borderColor:'rgba(0,199,121,.3)',borderWidth:1,
      label:{content:bz.label,display:true,position:'start',color:'#00a86c',font:{size:10,weight:'700'},backgroundColor:'rgba(232,252,242,.95)'}
    };
    var fibLines = [
      {k:'level_0',l:'0%',c:'rgba(255,61,94,.5)'},{k:'level_236',l:'23.6%',c:'rgba(91,108,255,.4)'},
      {k:'level_382',l:'38.2%',c:'rgba(0,199,121,.6)'},{k:'level_50',l:'50%',c:'rgba(139,92,246,.5)'},
      {k:'level_618',l:'61.8%',c:'rgba(0,199,121,.6)'},{k:'level_786',l:'78.6%',c:'rgba(255,159,26,.5)'},
      {k:'level_100',l:'100%',c:'rgba(15,23,41,.4)'}
    ];
    fibLines.forEach((f,i) => {
      annotations['f'+i] = {type:'line',yMin:lv[f.k],yMax:lv[f.k],borderColor:f.c,borderWidth:1,borderDash:[4,4],
        label:{content:f.l+' - '+fmt(lv[f.k]),display:true,position:'end',color:f.c,font:{size:10,weight:'600'},backgroundColor:'rgba(255,255,255,.85)',padding:3}};
    });
  }
  charts.main = new Chart($('priceChart'), {
    type: 'candlestick',
    data: {
      datasets: [
        {
          label: 'OHLC',
          data: ohlcData,
          color: { up: '#00c779', down: '#ff3d5e', unchanged: '#888' },
          borderColor: { up: '#00a86c', down: '#e02547', unchanged: '#888' },
          order: 3
        },
        {
          type: 'line',
          label: 'MA9',
          data: ma9Data,
          borderColor: '#00c779',
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
          tension: 0.25,
          order: 2
        },
        {
          type: 'line',
          label: 'MA21',
          data: ma21Data,
          borderColor: '#ff9f1a',
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
          tension: 0.25,
          order: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { display: true, position: 'top', align: 'end', labels: { boxWidth: 12, font: { size: 11 } } },
        tooltip: {
          backgroundColor: '#0f1729', padding: 10, cornerRadius: 8,
          callbacks: {
            label: function(ctx) {
              var d = ctx.raw;
              if (d && d.o !== undefined) {
                return ['O: ' + fmt(d.o), 'H: ' + fmt(d.h), 'L: ' + fmt(d.l), 'C: ' + fmt(d.c)];
              }
              return ctx.dataset.label + ': ' + fmt(ctx.parsed.y);
            }
          }
        },
        annotation: { annotations: annotations }
      },
      scales: {
        x: {
          type: 'time',
          time: { unit: 'day', displayFormats: { day: 'd MMM' } },
          ticks: { color: '#6b7693', maxTicksLimit: 8, font: { size: 10 } },
          grid: { color: 'rgba(230,235,247,.6)' }
        },
        y: {
          ticks: { color: '#6b7693', font: { size: 10 } },
          grid: { color: 'rgba(230,235,247,.6)' }
        }
      }
    }
  });
}


var TIME_OPTS = {
  responsive:true, maintainAspectRatio:false,
  interaction:{intersect:false,mode:'index'},
  plugins:{legend:{display:false},tooltip:{backgroundColor:'#0f1729',padding:10,cornerRadius:8}},
  scales:{
    x:{type:'time',time:{unit:'day',displayFormats:{day:'d MMM'}},ticks:{color:'#6b7693',maxTicksLimit:6,font:{size:10}},grid:{color:'rgba(230,235,247,.6)'}},
    y:{ticks:{color:'#6b7693',font:{size:10}},grid:{color:'rgba(230,235,247,.6)'}}
  }
};

function buildCrossChart(id,data){
  destroyChart(id);
  var ohlc = data.chart.map(c => ({x:new Date(c.date).getTime(),o:c.open,h:c.high,l:c.low,c:c.close}));
  var ma9 = data.chart.map(c => ({x:new Date(c.date).getTime(),y:c.ma9}));
  var ma21 = data.chart.map(c => ({x:new Date(c.date).getTime(),y:c.ma21}));
  charts[id] = new Chart($(id),{type:'candlestick',data:{datasets:[
    {label:'OHLC',data:ohlc,color:{up:'#00c779',down:'#ff3d5e',unchanged:'#888'},borderColor:{up:'#00a86c',down:'#e02547',unchanged:'#888'},order:3},
    {type:'line',label:'MA9',data:ma9,borderColor:'#00c779',borderWidth:1.5,pointRadius:0,fill:false,tension:.25,order:2},
    {type:'line',label:'MA21',data:ma21,borderColor:'#ff9f1a',borderWidth:1.5,pointRadius:0,fill:false,tension:.25,order:1}
  ]},options:TIME_OPTS});
}
function buildBBChart(id,data){
  destroyChart(id);
  var ohlc = data.chart.map(c => ({x:new Date(c.date).getTime(),o:c.open,h:c.high,l:c.low,c:c.close}));
  var bbU = data.chart.map(c => ({x:new Date(c.date).getTime(),y:c.bbUpper}));
  var bbM = data.chart.map(c => ({x:new Date(c.date).getTime(),y:c.bbMiddle}));
  var bbL = data.chart.map(c => ({x:new Date(c.date).getTime(),y:c.bbLower}));
  charts[id] = new Chart($(id),{type:'candlestick',data:{datasets:[
    {label:'OHLC',data:ohlc,color:{up:'#00c779',down:'#ff3d5e',unchanged:'#888'},borderColor:{up:'#00a86c',down:'#e02547',unchanged:'#888'},order:4},
    {type:'line',label:'U',data:bbU,borderColor:'#8b5cf6',borderWidth:1,pointRadius:0,fill:false,tension:.25,order:1},
    {type:'line',label:'M',data:bbM,borderColor:'rgba(139,92,246,.5)',borderWidth:1,borderDash:[4,4],pointRadius:0,fill:false,tension:.25,order:2},
    {type:'line',label:'L',data:bbL,borderColor:'#8b5cf6',borderWidth:1,pointRadius:0,fill:false,tension:.25,order:3}
  ]},options:TIME_OPTS});
}
function buildRSIChart(id,data){
  destroyChart(id);
  var labels = data.chart.map(c => c.date ? new Date(c.date).toLocaleDateString('id-ID',{month:'short',day:'numeric'}) : '');
  charts[id] = new Chart($(id),{type:'line',data:{labels,datasets:[
    {label:'RSI',data:data.chart.map(c=>c.rsi),borderColor:'#5b6cff',borderWidth:2,pointRadius:0,fill:false,tension:.3}
  ]},options:Object.assign({},COMMON_OPTS,{
    scales:{x:COMMON_OPTS.scales.x,y:{min:0,max:100,ticks:{color:'#6b7693',font:{size:10},stepSize:25},grid:{color:'rgba(230,235,247,.6)'}}},
    plugins:Object.assign({},COMMON_OPTS.plugins,{annotation:{annotations:{
      ob:{type:'line',yMin:70,yMax:70,borderColor:'rgba(255,61,94,.5)',borderWidth:1,borderDash:[4,4]},
      os:{type:'line',yMin:30,yMax:30,borderColor:'rgba(0,199,121,.5)',borderWidth:1,borderDash:[4,4]},
      mid:{type:'line',yMin:50,yMax:50,borderColor:'rgba(107,118,147,.3)',borderWidth:1}
    }}})
  })});
}
function buildVolumeChart(id,data){
  destroyChart(id);
  var labels = data.chart.map(c => c.date ? new Date(c.date).toLocaleDateString('id-ID',{month:'short',day:'numeric'}) : '');
  var vols = data.chart.map(c=>c.volume), avgs = data.volAvgSeries||[];
  var colors = vols.map((v,i)=>{var a=avgs[i]; if(a&&v>=a*2) return '#00c779'; if(a&&v>=a*1.3) return '#5b6cff'; return 'rgba(91,108,255,.35)';});
  charts[id] = new Chart($(id),{data:{labels,datasets:[
    {type:'bar',label:'Volume',data:vols,backgroundColor:colors,borderRadius:2,barPercentage:1,categoryPercentage:.9},
    {type:'line',label:'Avg 20d',data:avgs,borderColor:'#ff9f1a',borderWidth:1.8,pointRadius:0,fill:false,tension:.2}
  ]},options:COMMON_OPTS});
}

function buildMACDChart(id,data){
  destroyChart(id);
  var labels = data.chart.map(c => c.date ? new Date(c.date).toLocaleDateString('id-ID',{month:'short',day:'numeric'}) : '');
  var hist = data.chart.map(c => c.macdHist);
  var histColors = hist.map(v => v == null ? 'rgba(0,0,0,0)' : (v >= 0 ? 'rgba(0,199,121,.6)' : 'rgba(255,61,94,.6)'));
  charts[id] = new Chart($(id),{data:{labels,datasets:[
    {type:'bar',label:'Histogram',data:hist,backgroundColor:histColors,borderRadius:1,barPercentage:1,categoryPercentage:.9,order:3},
    {type:'line',label:'MACD',data:data.chart.map(c=>c.macd),borderColor:'#5b6cff',borderWidth:1.8,pointRadius:0,fill:false,tension:.25,order:1},
    {type:'line',label:'Signal',data:data.chart.map(c=>c.macdSignal),borderColor:'#ff9f1a',borderWidth:1.5,pointRadius:0,fill:false,tension:.25,order:2}
  ]},options:Object.assign({},COMMON_OPTS,{
    plugins:Object.assign({},COMMON_OPTS.plugins,{
      annotation:{annotations:{ zero:{ type:'line', yMin:0, yMax:0, borderColor:'rgba(107,118,147,.3)', borderWidth:1 } }}
    })
  })});
}

function renderIndicatorCards(data){
  var ind = data.indicators;
  var sP = (ind.goldenCross.periods&&ind.goldenCross.periods.short)||9;
  var lP = (ind.goldenCross.periods&&ind.goldenCross.periods.long)||21;
  var cards = [
    {id:'crossChart',title:'Cross MA'+sP+'/MA'+lP,sig:ind.goldenCross.signal,desc:ind.goldenCross.note,meta:'MA'+sP+': '+fmt(ind.goldenCross.shortMA)+' - MA'+lP+': '+fmt(ind.goldenCross.longMA),build:buildCrossChart},
    {id:'bbChart',title:'Bollinger Bands (20,2)',sig:ind.bollingerBands.signal,desc:ind.bollingerBands.note,meta:'U: '+fmt(ind.bollingerBands.upper)+' - M: '+fmt(ind.bollingerBands.middle)+' - L: '+fmt(ind.bollingerBands.lower),build:buildBBChart},
    {id:'rsiChart',title:'RSI (14)',sig:ind.rsi.signal,desc:ind.rsi.note,meta:'RSI: '+fmt(ind.rsi.value,1),build:buildRSIChart},
    {id:'volChart',title:'Volume Breakout (20d, 2x)',sig:ind.volumeBreakout.signal,desc:ind.volumeBreakout.note,meta:'Vol: '+fmt(ind.volumeBreakout.currentVolume,0)+' - Avg: '+fmt(ind.volumeBreakout.avgVolume,0)+' - '+fmt(ind.volumeBreakout.ratio)+'x',build:buildVolumeChart},
    {id:'macdChart',title:'MACD (12,26,9)',sig:ind.macd ? ind.macd.signal : 'NEUTRAL',desc:ind.macd ? ind.macd.note : 'Tidak tersedia',meta:ind.macd ? ('MACD: '+fmt(ind.macd.macd)+' - Signal: '+fmt(ind.macd.signalLine)+' - Hist: '+fmt(ind.macd.histogram)) : '',build:buildMACDChart}
  ];
  $('indicatorGrid').innerHTML = cards.map(c =>
    '<div class="indicator-card sig-'+(c.sig||'NEUTRAL').replace(' ','')+'">' +
      '<div class="indicator-head"><span class="name">'+c.title+'</span><span class="badge '+(c.sig||'NEUTRAL').replace(' ','')+'">'+c.sig+'</span></div>' +
      '<div class="indicator-desc">'+c.desc+'</div>' +
      '<div class="indicator-meta">'+c.meta+'</div>' +
      '<div class="mini-chart"><canvas id="'+c.id+'"></canvas></div>' +
    '</div>'
  ).join('');
  cards.forEach(c => c.build(c.id, data));
}


function renderNews(sent){
  var list = $('newsList'); if(!list) return;
  list.innerHTML = '';
  var news = (sent&&sent.news)||[];
  if(!news.length){ list.innerHTML = '<div style="color:var(--muted);padding:20px;text-align:center;">Tidak ada berita ditemukan.</div>'; return; }
  news.forEach(n => {
    var item = document.createElement('div');
    item.className = 'news-item ' + (n.sentiment||'NEUTRAL');
    item.innerHTML =
      '<div class="news-content">' +
        '<a href="'+escHTML(n.link||'#')+'" target="_blank" rel="noopener" class="news-title">'+escHTML(n.title)+'</a>' +
        '<div class="news-meta"><span class="tag">'+escHTML(n.source||n.publisher||'')+'</span>' +
        (n.publisher && n.source!==n.publisher ? '<span>'+escHTML(n.publisher)+'</span>' : '') +
        (n.publishedAt ? '<span>'+timeAgo(n.publishedAt)+'</span>' : '') +
        '</div>' +
      '</div>' +
      '<div><span class="badge '+(n.sentiment||'NEUTRAL')+'" style="padding:4px 10px;font-size:10px;">'+(n.sentiment||'NEUTRAL')+'</span></div>';
    list.appendChild(item);
  });
}

async function analyze(){
  var emiten = $('emiten').value.trim().toUpperCase();
  var errBox = $('error');
  errBox.classList.remove('show'); errBox.textContent = '';
  if(!emiten){ errBox.textContent='Masukkan kode emiten.'; errBox.classList.add('show'); return; }
  // Update URL
  history.replaceState(null, '', '?emiten=' + encodeURIComponent(emiten));
  var btn = $('analyzeBtn');
  btn.disabled = true; btn.textContent = 'Memuat...';
  try {
    var res = await fetch('/api/analyze/'+encodeURIComponent(emiten));
    var data = await res.json();
    if(!res.ok) throw new Error(data.error||'Error');
    $('result').style.display = 'block';
    setText('emitenName', data.emiten);
    var last = data.lastCandle;
    setHTML('lastInfo',
      '<span>Harga: <b>'+fmt(last.close)+'</b></span>' +
      '<span>Volume: <b>'+fmt(last.volume,0)+'</b></span>' +
      '<span>Tanggal: <b>'+(last.date?new Date(last.date).toLocaleDateString('id-ID'):'-')+'</b></span>' +
      '<span>'+data.candleCount+' candle</span>'
    );
    var reco = data.recommendation;
    var badge = $('recoBadge');
    if(badge){ badge.textContent = reco.action; badge.className = 'badge '+reco.action.replace(' ',''); }
    var plan = data.tradingPlan;
    setText('planCurrent', fmt(plan.currentPrice));
    setText('planEntry', fmt(plan.entry));
    var dist = Number(plan.distToEntryPct);
    if(Math.abs(dist)<0.1) setHTML('planEntryDist','<span style="color:var(--buy)">= harga sekarang</span>');
    else if(dist<0) setHTML('planEntryDist','<span style="color:var(--buy)">'+Math.abs(dist).toFixed(2)+'% di bawah</span> harga sekarang');
    else setHTML('planEntryDist','<span style="color:var(--sell)">'+dist.toFixed(2)+'% di atas</span> harga sekarang');
    setText('planStop', fmt(plan.initialStopLoss));
    setText('planStopLabel', '-'+plan.stopPct+'% dari entry');
    setText('planTrailing', plan.trailingStop ? fmt(plan.trailingStop) : 'belum aktif');
    setText('planResistance', fmt(plan.nextResistance));
    setHTML('planResistancePct', '<span style="color:var(--buy)">+'+plan.upsideToResistancePct+'%</span> dari entry');
    setText('planRR', '1 : '+plan.riskRewardRatio);
    var typeMap = {NOW:'ENTRY SEKARANG',WAIT_PULLBACK:'TUNGGU PULLBACK',WAIT_REBOUND:'TUNGGU REBOUND',WAIT_REVERSAL:'TUNGGU REVERSAL',COUNTER_TREND:'COUNTER TREND'};
    var typeColors = {NOW:'var(--buy)',WAIT_PULLBACK:'var(--neutral)',WAIT_REBOUND:'var(--neutral)',WAIT_REVERSAL:'var(--neutral)',COUNTER_TREND:'var(--sell)'};
    var typeEl = $('planEntryType');
    if(typeEl){ typeEl.textContent = typeMap[plan.entryType]||plan.entryType; typeEl.style.color = typeColors[plan.entryType]||'var(--text)'; }
    setText('planStrategy', plan.strategy);
    var ha = data.holderAdvice;
    if (ha) {
      var hl = $('holderLabel');
      if (hl) { hl.textContent = ha.label; hl.className = 'badge ' + (ha.color === 'buy' ? 'BUY' : ha.color === 'sell' ? 'SELL' : 'NEUTRAL'); }
      setText('holderReason', ha.reason);
    }
    if(data.fibonacci){
      var f = data.fibonacci;
      setText('fiboTrend', 'Tren '+(f.trend==='UP'?'Naik':'Turun')+' - High '+fmt(f.high)+' / Low '+fmt(f.low));
      setHTML('fiboSummary',
        '<span>23.6%: '+fmt(f.levels.level_236)+'</span>' +
        '<span class="gold">38.2%: '+fmt(f.levels.level_382)+'</span>' +
        '<span>50%: '+fmt(f.levels.level_50)+'</span>' +
        '<span class="gold">61.8%: '+fmt(f.levels.level_618)+'</span>' +
        '<span>78.6%: '+fmt(f.levels.level_786)+'</span>'
      );
    } else { setText('fiboTrend','Data tidak cukup'); setHTML('fiboSummary',''); }

    buildMainChart(data);
    renderIndicatorCards(data);
    renderNews(data.indicators.sentiment);

    var wb = $('warnings');
    if(wb){ wb.innerHTML=''; (data.warnings||[]).forEach(w => { var div=document.createElement('div'); div.className='warning'; div.textContent=w; wb.appendChild(div); }); }
    setText('disclaimer', data.disclaimer);
  } catch(e){
    errBox.textContent = e.message;
    errBox.classList.add('show');
    $('result').style.display = 'none';
  } finally {
    btn.disabled = false; btn.textContent = 'Analisa Sekarang';
  }
}

document.addEventListener('DOMContentLoaded', function(){
  var ab = $('analyzeBtn'), em = $('emiten');
  if(ab) ab.addEventListener('click', analyze);
  if(em) em.addEventListener('keydown', e => { if(e.key==='Enter') analyze(); });
  // Auto-load if ?emiten= in URL
  var params = new URLSearchParams(location.search);
  var em2 = params.get('emiten');
  if(em2 && em){ em.value = em2; analyze(); }
});
