const {load}=require('cheerio');
const {partsFromName,sameOriginLink}=require('./clinic-html-sync');
const {downtimeUpperDays}=require('./clinic-html-downtime');
const clean=s=>String(s||'').normalize('NFKC').replace(/\s+/g,' ').trim();
const procedure=/二重|眼瞼|まぶた|目頭|目尻|クマ|くま取り|涙袋|眉下|鼻整形|隆鼻|鼻尖|鼻翼|小鼻|輪郭|小顔|リフト|たるみ|エラ|顎|あご|人中|シミ|しみ|毛穴|ニキビ|ピーリング|脱毛|豊胸|乳輪|乳頭|脂肪吸引|脂肪注入|脂肪溶解|痩身|ボトックス|ヒアルロン|ほくろ|ホクロ|いぼ|多汗|ワキガ|薄毛|育毛|埋没|ダーマ|ポテンツァ|ルメッカ|ジュベルック|シルファーム|ハイフ|HIFU|ピコ|フォトフェイシャル|イオン導入|水光注射|アートメイク|医療レーザー|タトゥー|刺青|プラセンタ|白玉点滴/i;
function treatmentName(raw){
  const value=clean(raw).replace(/^(?:[・●]\s*|\d+[位.、．]\s*|詳しくはこちら|詳しく見る|施術名|治療名)[:：]?/,'').replace(/(?:詳しくはこちら|詳しく見る|詳細はこちら|詳細を見る|Read More|TOP|MORE|more|\s*→|\s*＞|\s*»)+$/gi,'').trim();
  if(/[¥￥↑↓]|\d+月|\d+代|\d+歳|を|には|による|解消|追求|推奨|バレない|特別|協力プラン|ビフォー|アフター|ご紹介|ご用意|詳細|自然な|施術時間|年代別|予防する|明るくなる|からの|\sに$|が下がる|クリニック|あらゆる|進化版|取り組み|施術の|部位詳細|脱毛部位|エリア表|初診料|診察料|治療方法|の場合|ましょう|対応$|に対する|への|使われる|新しい治療|上限なし|寝ながら|次世代の/.test(value))return '';
  if(!value||value.length>45||!procedure.test(value)||/[。！？?✨#]|とは|について|おすすめ|人気|ランキング|症例|ブログ|コラム|医師|院長|理事長|ドクター|クリニック|当院|キャンペーン|モニター|予約|アクセス|料金|費用|価格|検索|お悩み|リスク|副作用|ダウンタイム|保証|学会|採用|比較|\d[\d,]*円|一覧|メリット|デメリット|原因|効果|注意点|よくある|動画|写真|口コミ|紹介記事|解説|ポイント|POINT|特徴|特長|施術前|ヶ月後|か月後|導入開始|出勤日|カウンセリング|アーティスト|無料|割引|カウンセ|ご案内|流れ|Q&A|違い|もっとも|受けられ|します|います|ます$|です$|可能です|改善したい|ふっくらさせたい|短くしたい|失敗|イメージ|選び|種類|適して|お知らせ|掲載|ガイド|石鹸|商品|\d{4}[年./]/i.test(value))return '';
  return value;
}
function parseServicePage(html,url,{shared=false,branch=false,detailName=''}={}){
  const $=load(html),rows=[],links=[],risks=[],aftercare=[];
  $('script,style,noscript,header,footer,nav,aside,[hidden],[aria-hidden="true"],[class*="breadcrumb"],[class*="global-nav"],[class*="gnav"]').remove();
  $('br').replaceWith('\n');
  $('table img[alt]').each((_,image)=>{const alt=clean($(image).attr('alt'));if(/診療あり|診察あり|再診のみ|休診/.test(alt))$(image).replaceWith(` ${alt} `);});
  const add=(raw,sourceUrl=url)=>{const name=treatmentName(raw);if(name&&!rows.some(r=>r.name===name))rows.push({name,parts:partsFromName(name),downtimeMaxDays:null,sourceUrl,evidence:clean(raw)});return name;};
  // A shared group's navigation cannot establish availability at a branch.
  const region=shared?$('#case,[id*="treatment"],.clinic-treatment,[class*="clinic-menu"],[class*="clinic_menu"],[class*="clinic_treatment"]'):$('body');
  if(!shared||branch){
    region.find('a[href],h2,h3,h4').each((_,e)=>{
      const el=$(e),raw=clean(el.text())||clean(el.find('img').attr('alt'));
      if(el.is('a')){const href=sameOriginLink(el.attr('href'),url);if(!href||/blog|column|case|news|recruit|doctor|staff|campaign|instagram|\/shop\//i.test(new URL(href).pathname))return;}
      const name=add(raw);
      const target=el.is('a')&&sameOriginLink(el.attr('href'),url);
      if(name&&target&&!/blog|column|case|news|recruit|doctor|staff|campaign/i.test(new URL(target).pathname))links.push({url:target,name});
    });
  }
  const heading=clean($('h1').first().text());
  const currentName=treatmentName(heading)||treatmentName(detailName);
  if(!shared&&currentName)add(currentName);
  let openingHours='';
  const hours=[];
  $('dt,th').each((_,e)=>{
    const label=clean($(e).text());
    if(!/^(?:診療時間|診察時間|営業時間|受付時間|休診日)[：:]?$/.test(label))return;
    const value=clean($(e).next('dd,td').text());
    if(value&&value.length<400&&(/休診/.test(label)||/\d.*(?:[:：]|時)/.test(value)))hours.push(`${label}：${value}`);
  });
  $('[class*="hours"],[class*="open-time"],[class*="open_time"],[class*="clinic_time"]').each((_,e)=>{
    const text=clean($(e).text());
    if(text.length<350&&/診療時間|診察時間|営業時間/.test(text)&&/\d.*(?:[:：]|時)/.test(text))hours.push(text);
  });
  const schedules=[...new Set(hours.filter(h=>/^診療時間：|^診察時間：|^営業時間：/.test(h)))];
  if(hours.length&&schedules.length<=1)openingHours=[...new Set(hours)].join('／').slice(0,1000);
  $('table').each((_,table)=>{
    const text=clean($(table).text());
    if(schedules.length<=1&&/月.*火.*水.*木.*金.*土/.test(text)&&/\d{1,2}[:：]\d{2}/.test(text)&&text.length<700&&!openingHours.includes(text)){
      const grid=$(table).find('tr').map((_,tr)=>$(tr).children('th,td').map((_,cell)=>clean($(cell).text())||'空欄').get().join('｜')).get().join('／');
      openingHours=(openingHours?openingHours+'／':'')+grid;
    }
  });
  if(currentName&&!shared){
    $('dt,th,h2,h3,h4,h5').each((_,e)=>{
      const label=clean($(e).text());
      if(label.length>70||!/ダウンタイム|副作用|リスク|アフターケア|保証|術後のケア/.test(label))return;
      const value=clean($(e).is('dt,th')?$(e).next('dd,td').text():$(e).nextUntil('h1,h2,h3,h4,h5,h6').slice(0,3).text());
      if(!value||value.length>1000)return;
      const item={title:label,description:value,treatment:currentName,sourceUrl:url};
      (/保証|アフターケア|術後のケア/.test(label)?aftercare:risks).push(item);
      if(/^ダウンタイム[：:]?$/.test(label)&&!/(?:日|週間)以上|長引|ヶ月|か月|カ月/.test(value)){
        const days=downtimeUpperDays(value);
        if(days!==null){const row=rows.find(r=>r.name===currentName);if(row)row.downtimeMaxDays=Math.max(row.downtimeMaxDays??0,days);}
      }
    });
  }
  const generalLinks=[];
  $('a[href]').each((_,e)=>{
    const target=sameOriginLink($(e).attr('href'),url),label=clean($(e).text());
    if(target&&/診療案内|施術一覧|治療一覧|診療メニュー|施術メニュー|診療時間|アクセス|医院案内|クリニック紹介/.test(label)&&label.length<45&&!/blog|column|case|recruit|doctor/.test(target))generalLinks.push({url:target,label});
  });
  return {treatmentDetails:rows.slice(0,200),links:[...new Map(links.map(l=>[l.url,l])).values()],generalLinks:[...new Map(generalLinks.map(l=>[l.url,l])).values()],openingHours:openingHours.slice(0,1000),downtimeAndRisks:risks.slice(0,20),warrantyAndAftercare:aftercare.slice(0,20)};
}
function serviceParts(name){return /脱毛症|薄毛|育毛/.test(name)&&!/医療脱毛/.test(name)?partsFromName(name).filter(p=>p!=='体'):partsFromName(name);}
module.exports={parseServicePage,treatmentName,serviceParts};
