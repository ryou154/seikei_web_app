// Classify explicit procedure names; an unspecified injection or device is not
// evidence for every body area where it could potentially be used.
function partsFromTreatmentName(value) {
  const name = String(value || '').normalize('NFKC');
  const parts = [];
  if (/二重/.test(name)) parts.push('二重');
  if (/二重|目元|眼瞼|まぶた|瞼|目頭|目尻|目の[上下]|クマ|くま|涙袋|眉下|タレ目|たれ目|ハムラ|アイバック/i.test(name)) parts.push('目元');
  if (/鼻/.test(name)) parts.push('鼻');
  const facial = /輪郭|小顔|フェイスライン|エラ|顎|あご|頬|全顔|フェイスリフト|糸リフト|バッカルファット|ジョールファット|メーラーファット|脂肪吸引\s*顔/.test(name);
  if (facial) parts.push('輪郭');
  if (/肌|スキン|シミ|しみ|毛穴|ニキビ|ピーリング|ピール|ダーマペン|ポテンツァ|ルメッカ|ピコレーザー|シルファーム|イオン導入|ほくろ|ホクロ|いぼ|タトゥー|ケロイド|ヴェルヴェットスキン|ブレッシング|ジュベルック/i.test(name)) parts.push('肌');
  if (/豊胸|バスト|乳房|乳輪|乳頭/.test(name)) parts.push('胸');
  const explicitBody = /身体|体の|腹部|上腹部|下腹部|側腹部|腰部|二の腕|太もも|大腿|ふくらはぎ|背中|お尻|臀部/.test(name);
  if (/痩身|ダイエット|脱毛|多汗症|わきが|ワキガ|婦人科形成/.test(name)
    || /脂肪吸引|脂肪溶解/.test(name) && (!facial || explicitBody)) parts.push('体');
  return parts;
}

module.exports = { partsFromTreatmentName };
