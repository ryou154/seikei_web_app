const CLINIC_DETAILS = {
  "湘南美容クリニック 新宿本院": {
    doctor: {
      name: "中村 大輔",
      title: "新宿本院院長",
      specialties: ["豊胸", "脂肪吸引", "ボディメイク"],
      qualifications: ["美容外科専門医（JSAS）", "日本整形外科学会専門医", "VASER脂肪吸引認定医"],
      sourceUrl: "https://www.s-b-c.net/clinic/branch/shinjuku/treatment/"
    }
  },
  "TCB東京中央美容外科 新宿三丁目院": {
    doctor: {
      name: "朴 大然",
      title: "新宿三丁目院院長",
      specialties: ["二重整形", "クマ取り"],
      qualifications: [],
      sourceUrl: "https://aoki-tsuyoshi.com/clinic/shinjuku/shinjuku_sanchome"
    }
  },
  "品川美容外科 新宿院": {
    doctor: {
      name: "大貫 祐輝",
      title: "新宿院院長",
      specialties: ["美容外科のデザイン相談"],
      qualifications: [],
      sourceUrl: "https://www.shinagawa.com/clinic_shinjuku/"
    }
  },
  "湘南美容クリニック 大阪梅田本院": {
    doctor: {
      name: "横谷 仁彦",
      title: "大阪梅田本院 外科皮膚科統括医師",
      specialties: ["二重整形", "豊胸"],
      qualifications: ["美容外科専門医（JSAS）", "日本外科学会専門医"],
      sourceUrl: "https://www.s-b-c.net/clinic/branch/osaka/"
    },
    cases: {
      summary: "二重埋没法の症例件数3万件超（横谷医師）",
      period: "公式ページに集計期間の明記なし",
      scope: "医師個人",
      sourceUrl: "https://www.s-b-c.net/clinic/branch/osaka/special/a_umeda/"
    }
  },
  "TCB東京中央美容外科 梅田大阪駅前院": {
    doctor: {
      name: "寺西 宏王",
      title: "梅田大阪駅前院院長",
      specialties: ["二重・目元", "クマ取り", "鼻整形"],
      qualifications: ["日本美容医療学会（JAPSA）代表理事"],
      sourceUrl: "https://aoki-tsuyoshi.com/clinic/shinsaibashi/umedaosaka"
    }
  },
  "品川美容外科 梅田院": {
    doctor: {
      name: "坂野 良之",
      title: "梅田院院長",
      specialties: ["医療ハイフ", "シミ治療"],
      qualifications: [],
      sourceUrl: "https://www.shinagawa.com/clinic_umeda/"
    }
  },
  "湘南美容クリニック 横浜院": {
    doctor: {
      name: "長谷川 裕之",
      title: "横浜院院長",
      specialties: ["脂肪吸引", "二重整形", "若返り"],
      qualifications: ["VASER脂肪吸引認定医", "ミントリフト認定医", "日本美容外科学会会員"],
      sourceUrl: "https://www.s-b-c.net/clinic/branch/yokohama/"
    }
  },
  "TCB東京中央美容外科 横浜駅前院": {
    doctor: {
      name: "村井 瑞佳",
      title: "横浜駅前院院長",
      specialties: ["二重整形", "クマ取り", "鼻整形"],
      qualifications: ["日本麻酔科学会会員", "ボトックスビスタ認定医", "ジュビダームビスタ認定医"],
      sourceUrl: "https://aoki-tsuyoshi.com/clinic/yokohama/yokohama_ekimae"
    }
  },
  "品川美容外科 横浜院": {
    doctor: {
      name: "石内 直樹",
      title: "横浜院院長",
      specialties: ["二重整形", "小顔治療"],
      qualifications: [],
      sourceUrl: "https://www.shinagawa.com/clinic_yokohama/"
    }
  },
  "湘南美容クリニック 名古屋駅本院": {
    doctor: {
      name: "高川 裕也",
      title: "名古屋駅本院院長",
      specialties: ["二重整形", "クマ取り"],
      qualifications: ["美容外科専門医（JSAS）"],
      sourceUrl: "https://www.s-b-c.net/clinic/branch/nagoya-station/"
    }
  },
  "TCB東京中央美容外科 名古屋駅前院": {
    doctor: {
      name: "佐野 孝治",
      title: "名古屋駅前院院長",
      specialties: ["二重整形", "クマ取り", "鼻整形"],
      qualifications: [],
      sourceUrl: "https://aoki-tsuyoshi.com/clinic/nagoya/nagoya_ekimae"
    }
  },
  "品川美容外科 名古屋院": {
    doctor: {
      name: "河内 泰仁",
      title: "名古屋院院長",
      specialties: ["糸リフト", "シワ治療"],
      qualifications: [],
      sourceUrl: "https://www.shinagawa.com/clinic_nagoya/"
    }
  },
  "湘南美容クリニック 福岡院": {
    doctor: {
      name: "鴨田 隆弘",
      title: "福岡院院長",
      specialties: [],
      qualifications: ["日本美容外科学会会員", "ボトックスビスタ認定医", "ジュビダームビスタ認定医", "医工学博士"],
      sourceUrl: "https://www.s-b-c.net/clinic/branch/fukuoka/"
    }
  },
  "TCB東京中央美容外科 福岡天神院": {
    doctor: {
      name: "植木 翔也",
      title: "福岡天神院院長",
      specialties: ["二重整形", "小顔整形"],
      qualifications: ["日本形成外科学会専門医・領域指導医", "日本創傷外科学会専門医"],
      sourceUrl: "https://aoki-tsuyoshi.com/clinic/fukuoka/fukuoka_tenjin"
    }
  },
  "品川美容外科 福岡院": {
    doctor: {
      name: "吉池 剛",
      title: "福岡院院長",
      specialties: ["二重整形", "小顔治療", "医療ハイフ"],
      qualifications: [],
      sourceUrl: "https://www.shinagawa.com/clinic_fukuoka/"
    }
  },
  "湘南美容クリニック 札幌院": {
    doctor: {
      name: "梶山 典彦",
      title: "札幌院院長",
      specialties: ["二重整形", "若返り"],
      qualifications: [],
      sourceUrl: "https://www.s-b-c.net/clinic/branch/sapporo/"
    }
  },
  "TCB東京中央美容外科 札幌駅前院": {
    doctor: {
      name: "栗林 理佳",
      title: "札幌駅前院院長",
      specialties: ["二重整形", "クマ取り"],
      qualifications: [],
      sourceUrl: "https://aoki-tsuyoshi.com/clinic/sapporo"
    }
  },
  "品川スキンクリニック 札幌院": {
    doctor: {
      name: "小林 雅郎",
      title: "札幌院院長",
      specialties: ["若返り", "目元治療"],
      qualifications: [],
      sourceUrl: "https://www.shinagawa.com/clinic_skin_sapporo/"
    }
  },
  "湘南美容クリニック 仙台院": {
    doctor: {
      name: "福山 紘平",
      title: "仙台院院長",
      specialties: ["目元治療", "リフトアップ"],
      qualifications: [],
      sourceUrl: "https://www.s-b-c.net/clinic/branch/sendai/"
    }
  },
  "TCB東京中央美容外科 仙台駅前院": {
    doctor: {
      name: "山本 展生",
      title: "仙台駅前院院長",
      specialties: ["二重整形", "クマ取り", "鼻整形", "小顔整形"],
      qualifications: ["日本整形外科学会専門医", "日本美容外科学会（JSAS）正会員", "日本美容医療学会（JAPSA）認定医"],
      sourceUrl: "https://aoki-tsuyoshi.com/clinic/sendai_city/sendai_city/sendai"
    }
  },
  "品川美容外科 仙台院": {
    doctor: {
      name: "蝶野 貴彦",
      title: "仙台院院長",
      specialties: ["二重整形", "小顔治療", "医療ハイフ"],
      qualifications: [],
      sourceUrl: "https://www.shinagawa.com/clinic_sendai/"
    }
  }
};

window.CLINIC_DATA = (window.CLINIC_DATA || []).map((clinic) => ({
  ...clinic,
  ...CLINIC_DETAILS[clinic.name],
  cases: CLINIC_DETAILS[clinic.name]?.cases || {
    summary: "公式症例写真あり（総件数の記載を確認できず）",
    period: "集計期間の記載なし",
    scope: "院・担当医の公式掲載症例",
    sourceUrl: clinic.sourceUrl
  }
}));
