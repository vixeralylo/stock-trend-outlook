const ind = require('./indicators');

const closes = [];
for (let i = 0; i < 30; i++) closes.push(100 - i * 0.3);
for (let i = 0; i < 12; i++) closes.push(91 + i * 0.6);
const gc = ind.goldenCross(closes, 9, 21);
console.log('Cross:', gc.signal, '|', gc.note);

const flows = [
  { date: '2025-04-25', buy: 50e9, sell: 30e9, net: 20e9 },
  { date: '2025-04-26', buy: 60e9, sell: 25e9, net: 35e9 },
  { date: '2025-04-27', buy: 40e9, sell: 35e9, net: 5e9 },
  { date: '2025-04-28', buy: 70e9, sell: 30e9, net: 40e9 }
];
const ff = ind.foreignFlowSignal(flows);
console.log('Foreign:', ff.signal, '|', ff.note);

console.log('Agg 4B1S:', JSON.stringify(ind.aggregateRecommendation(['BUY','BUY','BUY','SELL','BUY'])));
console.log('Agg 3B2N:', JSON.stringify(ind.aggregateRecommendation(['BUY','BUY','BUY','NEUTRAL','NEUTRAL'])));
console.log('Agg 1B1S3N:', JSON.stringify(ind.aggregateRecommendation(['BUY','SELL','NEUTRAL','NEUTRAL','NEUTRAL'])));
