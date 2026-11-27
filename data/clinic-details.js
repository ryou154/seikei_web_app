(() => {
  const date = '2026-10-09';
  const url = 'https://www.shinagawa.com/eye_1dayhyper/';
  const profiles = {
    'shinagawa-shinjuku':['大貫 祐輝','https://www.shinagawa.com/doctor_oonuki/',['日本美容外科学会専門医','アラガン施注資格認定医']],
    'shinagawa-umeda':['坂野 良之','https://www.shinagawa.com/doctor_sn/',['日本美容外科学会認定 美容外科専門医（JSAS）','サーマクール認定医']],
    'shinagawa-yokohama':['石内 直樹','https://www.shinagawa.com/doctor_iu/',['日本美容外科学会認定 美容外科専門医（JSAS）','アラガン施注資格認定医']]
  };
  window.CLINIC_DATA = (window.CLINIC_DATA || []).map(c => {
    const [name,sourceUrl,qualifications] = profiles[c.id];
    const doctor = {name,title:'院長',specialties:['二重整形','糸リフト','目の下のクマ・目の下のたるみ'],qualifications,sourceUrl,lastVerified:date};
    const treatment = {id:'ever-natural',name:'二重術エバーナチュラル法',parts:['二重','目元'],
      pricing:[{amount:68000,conditions:'税込・両目2点留め・麻酔代と針代を含む',sourceUrl:url,lastVerified:date},{amount:99000,conditions:'税込・両目3点留め・麻酔代と針代を含む',sourceUrl:url,lastVerified:date}],
      extraCosts:'掲載料金は麻酔代・針代を含む。別施術・追加オプションの費用は公式情報で確認できず。',
      downtime:{maxDays:14,text:'腫れ・痛みの目安3〜5日、内出血の目安1〜2週間。自然な感じになるまで約1ヶ月。個人差あり。'},
      risks:'腫れ、痛み、内出血。個人差あり。詳細は診察で確認してください。',
      aftercare:'術後の痛み止め・目薬の処方、異常や不明点は電話相談。',
      warranty:'3年間の保障制度の掲載あり。適用条件・対象範囲は公式情報で確認できず。',sourceUrl:url,lastVerified:date};
    return {...c,doctors:[doctor],doctor,treatments:[treatment],officialCases:{treatment:treatment.name,count:null,period:null,scope:'院ページ掲載症例',sourceUrl:c.sourceUrl,lastVerified:date},
      cases:{summary:'公式症例掲載あり。症例件数：公式情報で確認できず',period:'集計期間：公式情報で確認できず',scope:treatment.name,sourceUrl:c.sourceUrl},
      sources:[...c.sources,{label:'公式医師プロフィール（医師名・得意分野・資格抜粋）',url:sourceUrl,lastVerified:date},{label:'公式施術・料金ページ（料金条件・リスク・保障・術後対応）',url,lastVerified:date}]};
  });
})();
