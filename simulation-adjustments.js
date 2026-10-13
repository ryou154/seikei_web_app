(() => {
  const parts = {
    style: {
      label: "全体",
      changes: {
        kawaii: "頬や輪郭に丸みを残し、やわらかい印象に調整",
        cool: "輪郭と目元をすっきり見せ、落ち着いた印象に調整",
        korean: "目元を明るく見せ、華やかな印象に調整",
        doll: "目元を大きく見せ、輪郭とのバランスを調整",
        natural: "元の顔立ちを活かし、全体のまとまりを自然に調整"
      }
    },
    eye: {
      label: "目元",
      changes: {
        wide: "二重ラインと目の縦幅を強調し、ぱっちりした印象に調整",
        cat: "目尻側の横方向を強調し、切れ長の印象に調整",
        soft: "目尻をやわらかく見せ、優しい印象に調整",
        natural: "元の目元を活かし、左右の見え方を自然に調整"
      },
      procedures: {
        wide: ["二重整形（埋没法・切開法など）"],
        cat: ["目尻切開など"],
        soft: ["たれ目形成など"]
      }
    },
    nose: {
      label: "鼻",
      changes: {
        high: "鼻筋を通して見せ、顔全体とのバランスを調整",
        small: "小鼻の横幅を控えめに見せ、鼻先とのつながりを調整",
        sharp: "鼻先の輪郭をすっきり見せ、鼻筋との一体感を調整",
        natural: "元の鼻の形を活かし、顔全体との調和を調整"
      },
      procedures: {
        high: ["隆鼻術など"],
        small: ["鼻翼縮小術など"],
        sharp: ["鼻尖形成術など"]
      }
    },
    face: {
      label: "輪郭",
      changes: {
        vline: "頬から顎先へ向かうラインを細く見せ、Vラインの印象に調整",
        oval: "頬の丸みを残しながら、顎先とのバランスを卵型に調整",
        sharp: "頬から顎にかけての輪郭をすっきり見せるように調整",
        natural: "元の輪郭を活かし、顔全体の左右バランスを調整"
      },
      procedures: {
        vline: ["輪郭形成", "脂肪吸引など"],
        oval: ["輪郭形成", "脂肪注入など"],
        sharp: ["輪郭形成", "脂肪吸引など"]
      }
    },
    mouth: {
      label: "口元",
      changes: {
        full: "唇の厚みと立体感を自然に強調",
        small: "口元の幅とボリュームを控えめに見せるように調整",
        smile: "口角を少し上げて見せ、明るい印象に調整",
        natural: "元の口元を活かし、顔全体との調和を調整"
      },
      procedures: {
        full: ["唇へのヒアルロン酸注入など"],
        small: ["口唇縮小術など"],
        smile: ["口角挙上術など"]
      }
    },
    forehead: {
      label: "おでこ",
      changes: {
        round: "中央に丸みがあるような、やわらかい印象に調整",
        smooth: "表面の凹凸を目立ちにくく見せ、なめらかな印象に調整",
        balanced: "眉・目元・輪郭との比率を見ながら額の印象を調整",
        natural: "元の形を活かし、自然な印象に調整"
      },
      procedures: {
        round: ["額形成", "脂肪注入など"],
        smooth: ["脂肪注入", "ヒアルロン酸注入など"],
        balanced: ["額形成など"]
      }
    }
  };

  function strength(value) {
    const parsed = Number(value);
    const normalized = Number.isFinite(parsed) ? Math.min(100, Math.max(0, Math.round(parsed))) : 50;
    const label = normalized < 35 ? "弱め" : normalized < 70 ? "標準" : "強め";
    return { value: normalized, label };
  }

  function create(profile = {}) {
    const adjustments = [];
    const relatedProcedures = [];
    for (const [key, definition] of Object.entries(parts)) {
      const custom = typeof profile.custom?.[key] === "string" ? profile.custom[key].trim() : "";
      const selected = typeof profile[key] === "string" ? profile[key] : "none";
      const change = custom ? `自由入力「${custom}」という希望を生成条件として反映` : definition.changes[selected];
      if (change) adjustments.push({ part: definition.label, change });
      const examples = custom ? [] : definition.procedures?.[selected] || [];
      if (examples.length) relatedProcedures.push({ part: definition.label, examples: [...examples] });
    }
    return { strength: strength(profile.strength), adjustments, relatedProcedures };
  }

  const api = { create, strength };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.SimulationAdjustments = api;
})();
