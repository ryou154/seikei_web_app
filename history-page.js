(() => {
  const HANDOFF_KEY = "meylon-history-settings";
  const controls = {
    list: document.getElementById("history-list"),
    status: document.getElementById("history-status"),
    reload: document.getElementById("history-reload"),
    clear: document.getElementById("clear-history-button"),
  };
  const imageUrls = new Set();
  let entries = [];
  let loading = false;

  function setStatus(message, isError = false) {
    if (!controls.status) return;
    controls.status.textContent = message;
    controls.status.dataset.error = String(isError);
  }

  function revokeImages() {
    for (const url of imageUrls) URL.revokeObjectURL(url);
    imageUrls.clear();
  }

  async function api(path, options = {}) {
    const response = await window.AppAuth.fetch(path, {
      ...options,
      cache: "no-store",
      headers: options.body ? { "Content-Type": "application/json" } : options.headers
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "履歴を処理できませんでした。時間をおいて再度お試しください。");
    return data;
  }

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = String(text);
    return element;
  }

  function dateText(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "日時不明" : date.toLocaleString("ja-JP");
  }

  function appendDetail(list, label, value) {
    const item = node("div", "history-detail");
    item.append(node("dt", "", label), node("dd", "", value || "未設定"));
    list.append(item);
  }

  const optionLabels = {
    style: {
      none: "追加指定なし",
      kawaii: "頬や輪郭に丸みを残す",
      cool: "輪郭と目元をすっきり見せる",
      korean: "目元を明るく華やかに見せる",
      doll: "目をぱっちり大きく見せる",
      natural: "元の顔立ちを活かす"
    },
    eye: {
      none: "目元は変更しない",
      wide: "ぱっちり二重",
      cat: "切れ長・猫目",
      soft: "やさしいたれ目",
      natural: "自然な目元"
    },
    nose: {
      none: "鼻は変更しない",
      high: "鼻筋を高く",
      small: "小鼻を小さく",
      sharp: "鼻先をシャープに",
      natural: "自然な鼻"
    },
    face: {
      none: "追加指定なし",
      vline: "あご先を細く見せる",
      oval: "頬の丸みを残し、あご先を細くする",
      sharp: "頬からあごをシャープに見せる",
      natural: "元の輪郭を活かす"
    },
    mouth: {
      none: "口元は変更しない",
      full: "ふっくらした唇",
      small: "小さめの口元",
      smile: "口角を上げる",
      natural: "自然な口元"
    },
    forehead: {
      none: "おでこは変更しない",
      round: "丸みのあるおでこ",
      smooth: "なめらかなおでこ",
      balanced: "顔全体と自然に調整",
      natural: "自然なおでこ"
    },
    budget: {
      any: "指定しない",
      under20: "20万円未満",
      "20to40": "20〜40万円",
      over40: "40万円以上"
    },
    downtime: {
      any: "指定しない",
      short: "短め（数日〜1週間）",
      standard: "標準（1〜2週間）",
      flexible: "期間は問わない"
    }
  };
  const detailOptionLabels = {
    "shorten-face": "面長を短く見せる",
    "slim-cheeks": "頬をすっきり見せる",
    "soften-jaw": "エラの張りを目立ちにくくする",
    "shorten-chin": "顎先を短く見せる",
    "sharpen-jawline": "フェイスラインをシャープにする",
    "open-eyes": "目をぱっちり大きく見せる",
    "raise-eye-corners": "目尻を少し上げて見せる",
    "soften-eye-corners": "目尻をやわらかく見せる",
    "balance-eyes": "目の左右差を目立ちにくくする",
    "emphasize-under-eye": "涙袋を自然に強調する",
    "straighten-nose": "鼻筋をまっすぐ見せる",
    "slim-nose-wings": "小鼻をすっきり見せる",
    "refine-nose-tip": "鼻先を小さくすっきり見せる",
    "lift-mouth-corners": "口角が上がった印象にする",
    "fuller-lips": "唇に自然な立体感を出す",
    "soften-mouth": "口元を控えめに見せる",
    "round-forehead": "おでこに丸みを出す",
    "smooth-forehead": "おでこの凹凸を目立ちにくくする",
    "balance-face-length": "顔の縦横比を自然に整える",
    "center-face": "顔の中心のずれを目立ちにくくする",
    "balance-cheekbones": "頬骨の張りを目立ちにくくする",
    "soften-face-outline": "輪郭の角をやわらかく見せる",
    "balance-brows": "眉の左右差を整えて見せる",
    "lower-brow-distance": "眉と目の距離を近く見せる",
    "brighten-eyes": "目元を明るく見せる",
    "reduce-eye-fatigue": "目元の疲れた印象をやわらげる",
    "smooth-skin": "肌の質感をなめらかに見せる",
    "natural-skin-texture": "肌の質感を残して自然に見せる",
    "reduce-shine": "テカリを控えめに見せる",
    "soften-shadows": "顔の影をやわらかく見せる",
    "hair-removal-after": "脱毛後のように肌をなめらかに見せる",
    "reduce-facial-hair-shadow": "産毛やひげの影を目立ちにくくする",
    "even-skin-tone": "肌の色むらを均一に見せる",
    "reduce-redness": "赤みを控えめに見せる",
    "bright-clear-skin": "明るく清潔感のある肌に見せる"
  };

  function displayOption(field, customValue, storedValue) {
    if (customValue) return customValue;
    return optionLabels[field]?.[storedValue] || storedValue;
  }

  function buildAdjustmentSummary(result) {
    const adjustments = Array.isArray(result.adjustments) ? result.adjustments : [];
    const procedures = Array.isArray(result.relatedProcedures) ? result.relatedProcedures : [];
    if (!adjustments.length && !procedures.length) return null;
    const section = node("section", "history-adjustments");
    const heading = node("div", "history-adjustments-heading");
    heading.append(node("h4", "", "After画像に反映した調整内容"));
    if (result.adjustmentStrength) {
      heading.append(node("span", "history-adjustment-strength", `${result.adjustmentStrength.value}%（${result.adjustmentStrength.label}）`));
    }
    section.append(heading, node("p", "history-adjustment-note", "画像生成時に指定した内容です。医療行為や効果を判定したものではありません。"));
    const list = node("div", "history-adjustment-list");
    for (const adjustment of adjustments) {
      const item = node("div", "history-adjustment-item");
      item.append(node("strong", "", adjustment.part), node("p", "", adjustment.change));
      list.append(item);
    }
    section.append(list);
    if (procedures.length) {
      section.append(node("h5", "", "関連する施術例"));
      const procedureList = node("ul", "history-procedure-list");
      for (const procedure of procedures) {
        procedureList.append(node("li", "", `${procedure.part}：${procedure.examples.join("、")}`));
      }
      section.append(procedureList, node("p", "history-adjustment-note", "一般的な参考例です。適応や方法は医師の診察で異なります。"));
    }
    return section;
  }

  function buildCard(entry) {
    const card = node("article", "history-card");
    const heading = node("div", "history-card-header");
    const headingText = node("div");
    const profile = entry.profile || {};
    const custom = profile.custom || {};
    const savedName = entry.category || "無題のシミュレーション";
    const title = node("h3", "", savedName === "無題のシミュレーションのシミュレーション"
      ? "無題のシミュレーション" : savedName);
    const date = node("p", "history-date", `作成日時：${dateText(entry.savedAt)}`);
    headingText.append(title, date);
    heading.append(headingText);

    const request = node("p", "history-request", entry.requestText || "選択した項目に基づくシミュレーションです。");
    const result = entry.result || {};
    const fields = node("dl", "history-details");
    appendDetail(fields, "自由入力の細かい希望", profile.detailFreeText);
    appendDetail(fields, "変化の強さ", profile.strength === undefined ? "未設定" : `${profile.strength}%`);
    appendDetail(fields, "地域", profile.region);
    appendDetail(fields, "予算", displayOption("budget", "", profile.budget));
    appendDetail(fields, "ダウンタイム", displayOption("downtime", "", profile.downtime));
    appendDetail(fields, "選択した細かい希望", (profile.details || []).map((key) => detailOptionLabels[key]).filter(Boolean).join("、"));

    let analysisDetails = null;
    if (result.analysis) {
      analysisDetails = node("details", "history-analysis");
      analysisDetails.append(node("summary", "", "シミュレーション内容・施術候補"));
      const legacyLabels = {
        "かわいい系": "頬や輪郭に丸みを残す",
        "クール系": "輪郭と目元をすっきり見せる",
        "韓国アイドル風": "目元を明るく華やかに見せる",
        "ドール系": "目をぱっちり大きく見せる",
        "ナチュラル美人": "元の顔立ちを活かす",
        "Vライン小顔": "あご先を細く見せる",
        "卵型フェイス": "頬の丸みを残し、あご先を細くする",
        "自然な輪郭": "元の輪郭を活かす",
        "シャープな輪郭": "頬からあごをシャープに見せる"
      };
      const analysisText = Object.entries(legacyLabels).reduce(
        (text, [oldLabel, newLabel]) => text.replaceAll(oldLabel, newLabel),
        result.analysis
      );
      analysisDetails.append(node("p", "", analysisText));
    }

    const adjustmentSummary = buildAdjustmentSummary(result);
    const scores = node("div", "history-scores");
    for (const [label, value] of [["変更前", result.beforeScore], ["変更後", result.afterScore]]) {
      const score = node("div", "history-score");
      score.append(node("span", "", `${label} スコア`), node("strong", "", Number.isFinite(value) ? `${value} / 100` : "保存なし"));
      scores.append(score);
    }
    const disclaimer = node("p", "history-disclaimer", "スコアは写真上の幾何比率から算出した学習用の参考値です。容姿の優劣や医療効果を示すものではありません。");

    const imageArea = node("div", "history-images");
    const imageMessage = node("p", "history-image-message");
    const flags = result.images || {};
    const available = ["before", "after"].filter((kind) => flags[kind]);
    if (!available.length) {
      imageMessage.textContent = result.generationStatus === "fallback"
        ? "変更後画像の生成に失敗した履歴です。保存画像はありません。"
        : "この履歴には保存画像がありません。画像保存に同意していない場合、画像は保存されません。";
    } else {
      imageMessage.textContent = "画像を読み込んでいます…";
      Promise.all(available.map(async (kind) => {
        try {
          const response = await window.AppAuth.fetch(`/api/account/history/${encodeURIComponent(entry.id)}/images/${kind}`, { cache: "no-store" });
          if (!response.ok) throw new Error("画像を取得できませんでした。");
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          imageUrls.add(url);
          const figure = node("figure", "history-image-figure");
          figure.append(node("figcaption", "", kind === "before" ? "変更前" : "変更後"));
          const image = document.createElement("img");
          image.src = url;
          image.alt = `${kind === "before" ? "変更前" : "変更後"}の保存画像`;
          figure.append(image);
          return { element: figure, loaded: true };
        } catch {
          const failed = node("p", "history-image-message", `${kind === "before" ? "変更前" : "変更後"}画像を読み込めませんでした。再読込してください。`);
          return { element: failed, loaded: false };
        }
      })).then((items) => {
        imageArea.append(...items.map(({ element }) => element));
        imageMessage.textContent = items.some(({ loaded }) => loaded) ? "" : "保存画像を読み込めませんでした。";
      });
    }

    const actions = node("div", "history-actions");
    const load = node("button", "", "この設定を読込");
    load.type = "button";
    load.addEventListener("click", () => handoffSettings(entry));
    const repeat = node("button", "", "同じ設定でもう一度生成");
    repeat.type = "button";
    repeat.addEventListener("click", () => handoffSettings(entry));
    const remove = node("button");
    remove.type = "button";
    remove.dataset.danger = "true";
    remove.textContent = "1件削除";
    remove.addEventListener("click", () => deleteEntry(entry, remove));
    actions.append(load, repeat, remove);

    card.append(heading, request, fields);
    if (analysisDetails) card.append(analysisDetails);
    if (adjustmentSummary) card.append(adjustmentSummary);
    card.append(scores, disclaimer, imageMessage, imageArea, actions);
    return card;
  }

  function render() {
    if (!controls.list) return;
    revokeImages();
    if (!window.AppAuth?.uid) {
      controls.list.replaceChildren(node("p", "history-empty", "ログインすると本人専用の履歴を表示します。"));
      return;
    }
    if (!entries.length) {
      controls.list.replaceChildren(node("p", "history-empty", "保存された履歴はありません。シミュレーション結果を保存すると、ここに表示されます。"));
      return;
    }
    controls.list.replaceChildren(...entries.slice(0, 10).map(buildCard));
  }

  async function loadHistory() {
    if (!controls.list || loading) return;
    if (!window.AppAuth?.uid) {
      entries = [];
      render();
      return;
    }
    loading = true;
    controls.reload.disabled = true;
    controls.clear.disabled = true;
    controls.list.replaceChildren(node("p", "history-empty", "履歴を読み込んでいます…"));
    setStatus("本人専用の履歴を読み込んでいます…");
    try {
      const data = await api("/api/account/history");
      entries = Array.isArray(data.entries) ? data.entries.slice(0, 10) : [];
      render();
      setStatus(`${entries.length}件の履歴を表示しています。`);
    } catch (error) {
      entries = [];
      controls.list.replaceChildren(node("p", "history-error", error.message || "通信に失敗しました。再読込してください。"));
      setStatus("履歴を読み込めませんでした。接続を確認して再読込してください。", true);
    } finally {
      loading = false;
      controls.reload.disabled = false;
      controls.clear.disabled = false;
    }
  }

  function handoffSettings(entry) {
    try {
      sessionStorage.setItem(HANDOFF_KEY, JSON.stringify({ requestText: entry.requestText || "", profile: entry.profile || {} }));
      location.href = "/app.html#input-title";
    } catch {
      setStatus("設定を一時保存できませんでした。ブラウザーのストレージ設定を確認してください。", true);
    }
  }

  async function deleteEntry(entry, button) {
    if (!confirm("この履歴を削除しますか？保存画像も削除されます。この操作は元に戻せません。")) return;
    button.disabled = true;
    try {
      const data = await api(`/api/account/history/${encodeURIComponent(entry.id)}`, { method: "DELETE" });
      entries = Array.isArray(data.entries) ? data.entries.slice(0, 10) : [];
      render();
      setStatus("履歴を1件削除しました。");
    } catch (error) {
      setStatus(error.message || "履歴を削除できませんでした。", true);
      button.disabled = false;
    }
  }

  async function clearHistory() {
    if (!entries.length) {
      setStatus("削除する履歴はありません。");
      return;
    }
    if (!confirm("保存した履歴と関連画像をすべて削除しますか？この操作は元に戻せません。")) return;
    controls.clear.disabled = true;
    try {
      const data = await api("/api/account/history", { method: "DELETE" });
      entries = Array.isArray(data.entries) ? data.entries : [];
      render();
      setStatus("履歴をすべて削除しました。");
    } catch (error) {
      setStatus(error.message || "履歴を削除できませんでした。", true);
    } finally {
      controls.clear.disabled = false;
    }
  }

  if (controls.list) {
    controls.reload.addEventListener("click", loadHistory);
    controls.clear.addEventListener("click", clearHistory);
    window.addEventListener("app-authorized", loadHistory);
    window.addEventListener("app-locked", () => {
      entries = [];
      render();
      setStatus("ログイン状態を確認できません。再度ログインしてください。", true);
    });
    window.addEventListener("beforeunload", revokeImages);
    render();
    if (window.AppAuth?.uid) loadHistory();
  }
})();
