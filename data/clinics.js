const CLINIC_BRANDS = {
  sbc: {
    name: "湘南美容クリニック",
    strengths: ["二重", "目元", "鼻", "輪郭", "小顔", "若返り"],
    tags: ["二重・目元", "鼻整形", "小顔・フェイスライン"],
    priceUrl: "https://www.s-b-c.net/charge_list/"
  },
  tcb: {
    name: "TCB東京中央美容外科",
    strengths: ["二重", "目元", "鼻", "口", "唇", "輪郭", "小顔"],
    tags: ["二重整形", "クマ取り", "鼻・口元・輪郭"],
    priceUrl: "https://aoki-tsuyoshi.com/price"
  },
  shinagawa: {
    name: "品川美容外科",
    strengths: ["二重", "目元", "鼻", "あご", "輪郭", "小顔", "若返り"],
    tags: ["二重・目元", "鼻・あご", "小顔治療"],
    priceUrl: "https://www.shinagawa.com/price/"
  }
};

function createClinic(brandKey, branch, area, regions, address, hours, sourceUrl, options = {}) {
  const brand = CLINIC_BRANDS[brandKey];
  return {
    name: `${options.brandName || brand.name} ${branch}`,
    area,
    regions,
    strengths: options.strengths || brand.strengths,
    tags: options.tags || brand.tags,
    description: `${branch}の公式ページに掲載された診療メニューをもとにした候補です。`,
    address,
    hours,
    sourceUrl,
    priceUrl: brand.priceUrl,
    verifiedAt: "2026-07-16"
  };
}

window.CLINIC_DATA = [
  createClinic("sbc", "新宿本院", "東京・西新宿", ["東京", "新宿", "西新宿", "関東"], "東京都新宿区西新宿6-5-1 新宿アイランドタワー24F", "10:00〜19:00", "https://www.s-b-c.net/clinic/branch/shinjuku/"),
  createClinic("tcb", "新宿三丁目院", "東京・新宿三丁目", ["東京", "新宿", "新宿三丁目", "関東"], "東京都新宿区新宿3-1-20 メットライフ新宿スクエア7F", "9:00〜19:00", "https://aoki-tsuyoshi.com/clinic/shinjuku/shinjuku_sanchome"),
  createClinic("shinagawa", "新宿院", "東京・新宿", ["東京", "新宿", "代々木", "関東"], "東京都渋谷区代々木2-9-2 久保ビル6F", "10:00〜20:00", "https://www.shinagawa.com/clinic_shinjuku/"),

  createClinic("sbc", "大阪梅田本院", "大阪・梅田", ["大阪", "梅田", "大阪駅", "関西"], "大阪府大阪市北区梅田3-2-123 イノゲート大阪13F", "9:00〜18:00", "https://www.s-b-c.net/clinic/branch/osaka/"),
  createClinic("tcb", "梅田大阪駅前院", "大阪・梅田", ["大阪", "梅田", "東梅田", "関西"], "大阪府大阪市北区曽根崎2-8-15 K'sスクエアビル3F", "9:00〜19:00", "https://aoki-tsuyoshi.com/clinic/shinsaibashi/umedaosaka"),
  createClinic("shinagawa", "梅田院", "大阪・梅田", ["大阪", "梅田", "北新地", "関西"], "大阪府大阪市北区梅田1-11-4 大阪駅前第4ビル6F", "10:00〜20:00", "https://www.shinagawa.com/clinic_umeda/"),

  createClinic("sbc", "横浜院", "神奈川・横浜", ["神奈川", "横浜", "横浜駅", "関東"], "神奈川県横浜市神奈川区鶴屋町2-23-2 TSプラザビル3F", "10:00〜19:00", "https://www.s-b-c.net/clinic/branch/yokohama/"),
  createClinic("tcb", "横浜駅前院", "神奈川・横浜", ["神奈川", "横浜", "横浜駅", "関東"], "神奈川県横浜市西区北幸1-1-8 エキニア横浜7F", "9:00〜19:00", "https://aoki-tsuyoshi.com/clinic/yokohama/yokohama_ekimae"),
  createClinic("shinagawa", "横浜院", "神奈川・横浜", ["神奈川", "横浜", "横浜駅", "関東"], "神奈川県横浜市西区高島2-13-12 崎陽軒ビル ヨコハマジャスト3号館7F", "10:00〜20:00", "https://www.shinagawa.com/clinic_yokohama/"),

  createClinic("sbc", "名古屋駅本院", "愛知・名古屋", ["愛知", "名古屋", "名古屋駅", "東海"], "愛知県名古屋市中村区名駅4-8-26 エニシオ名駅3F", "9:00〜18:00", "https://www.s-b-c.net/clinic/branch/nagoya-station/"),
  createClinic("tcb", "名古屋駅前院", "愛知・名古屋", ["愛知", "名古屋", "名古屋駅", "東海"], "愛知県名古屋市中村区名駅3-26-6 Third KHビル5F", "9:00〜19:00", "https://aoki-tsuyoshi.com/clinic/nagoya/nagoya_ekimae"),
  createClinic("shinagawa", "名古屋院", "愛知・名古屋", ["愛知", "名古屋", "名古屋駅", "東海"], "愛知県名古屋市中村区名駅2-45-19 桑山ビル2F", "10:00〜19:00", "https://www.shinagawa.com/clinic_nagoya/"),

  createClinic("sbc", "福岡院", "福岡・天神", ["福岡", "天神", "福岡市", "九州"], "福岡県福岡市中央区渡辺通4-9-25 Luz福岡天神7F", "10:00〜19:00", "https://www.s-b-c.net/clinic/branch/fukuoka/"),
  createClinic("tcb", "福岡天神院", "福岡・天神", ["福岡", "天神", "福岡市", "九州"], "福岡県福岡市中央区天神2-7-6 DADAビル6F", "9:00〜19:00", "https://aoki-tsuyoshi.com/clinic/fukuoka/fukuoka_tenjin"),
  createClinic("shinagawa", "福岡院", "福岡・天神", ["福岡", "天神", "福岡市", "九州"], "福岡県福岡市中央区今泉1-20-2 天神MENTビル2F", "10:00〜19:00", "https://www.shinagawa.com/clinic_fukuoka/", { tags: ["二重・目元", "糸リフト", "小顔治療"] }),

  createClinic("sbc", "札幌院", "北海道・札幌", ["北海道", "札幌", "札幌駅"], "北海道札幌市中央区北5条西2-5 JRタワーオフィスプラザさっぽろ13F", "10:00〜19:00", "https://www.s-b-c.net/clinic/branch/sapporo/"),
  createClinic("tcb", "札幌駅前院", "北海道・札幌", ["北海道", "札幌", "札幌駅"], "北海道札幌市中央区北4条西2-1-2 キタコートレードビル6F", "9:00〜19:00", "https://aoki-tsuyoshi.com/clinic/sapporo"),
  createClinic("shinagawa", "札幌院", "北海道・札幌", ["北海道", "札幌", "札幌駅"], "北海道札幌市北区北7条西1-2-6 NCO札幌7F", "10:00〜19:00", "https://www.shinagawa.com/clinic_skin_sapporo/", { brandName: "品川スキンクリニック", strengths: ["目元", "輪郭", "小顔", "若返り", "肌"], tags: ["目元", "若返り", "小顔治療"] }),

  createClinic("sbc", "仙台院", "宮城・仙台", ["宮城", "仙台", "仙台駅", "東北"], "宮城県仙台市青葉区中央1-2-3 仙台マークワン17F", "10:00〜19:00", "https://www.s-b-c.net/clinic/branch/sendai/", { tags: ["二重・目元", "若返り", "リフトアップ"] }),
  createClinic("tcb", "仙台駅前院", "宮城・仙台", ["宮城", "仙台", "仙台駅", "東北"], "宮城県仙台市青葉区中央3-6-1 仙台TRビル東館7F", "9:00〜19:00", "https://aoki-tsuyoshi.com/clinic/sendai_city/sendai_city/sendai"),
  createClinic("shinagawa", "仙台院", "宮城・仙台", ["宮城", "仙台", "仙台駅", "東北"], "宮城県仙台市青葉区中央1-3-1 AER（アエル）29F", "10:00〜19:00", "https://www.shinagawa.com/clinic_sendai/", { tags: ["二重・目元", "クマ取り", "小顔治療"] })
];
