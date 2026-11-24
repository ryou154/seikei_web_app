function downtimeUpperDays(value) {
  const text = String(value || '').normalize('NFKC');
  if (/ヶ月|か月|カ月|ヵ月|[年月]/.test(text)) return null;
  const durations = [...text.matchAll(/(?:(\d+)\s*(日|週間)?\s*[~〜～－–-]\s*)?(\d+)\s*(日|週間)/g)];
  if (!durations.length) return null;
  const maxima = durations.map(m => Number(m[3]) * (m[4] === '週間' ? 7 : 1));
  return maxima.every(n => n >= 0 && n <= 365) ? Math.max(...maxima) : null;
}

module.exports={downtimeUpperDays};
