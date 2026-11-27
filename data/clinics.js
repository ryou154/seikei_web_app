(() => {
  const rows = [
    ['shinjuku','新宿',['東京','新宿','関東'],'東京都渋谷区代々木2-9-2 久保ビル6F','JR新宿駅南口 徒歩約3分'],
    ['umeda','梅田',['大阪','梅田','関西'],'大阪府大阪市北区梅田1-11-4 大阪駅前第4ビル6F','JR大阪駅中央改札口 徒歩約7分'],
    ['yokohama','横浜',['神奈川','横浜','関東'],'神奈川県横浜市西区高島2-13-12 崎陽軒ビル ヨコハマジャスト3号館7F','JR横浜駅東口 徒歩約2分']
  ];
  window.CLINIC_DATA = rows.map(([key,branch,areas,address,access]) => {
    const sourceUrl = `https://www.shinagawa.com/clinic_${key}/`;
    return {id:`shinagawa-${key}`,name:`品川美容外科 ${branch}院`,areas,area:`${areas[0]}・${branch}`,regions:areas,address,access,hours:'10:00〜20:00',sourceUrl,priceUrl:'https://www.shinagawa.com/price/',strengths:['二重','目元'],tags:['二重埋没法'],description:'公式院ページの症例掲載を確認した施術を登録しています。',sources:[{label:'公式院ページ（所在地・診療時間・症例）',url:sourceUrl,lastVerified:'2026-10-09'}],lastVerified:'2026-10-09',verifiedAt:'2026-10-09'};
  });
})();
