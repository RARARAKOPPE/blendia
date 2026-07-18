// ブレンド相性スコアリング（ルールベース）
//
// 考え方:
// 1. 各豆に「役割」を与える — ベース(土台) / キャラクター(個性) / アクセント(香り付け)
//    定石は「ベース × キャラクター」。同役割同士は減点。
// 2. 想定比率で混ぜた場合のプロファイルを計算し、バランスの良さを採点。
// 3. フレーバーノートの相性表（チョコ×ベリー等）でボーナス。
// 4. 同国・同地域はプロファイルが近くなりがちなので減点。

// 「目指す味」ゴール（INIC coffeeの記事より: ブレンドはゴール地点を決めてから組む）
const GOALS = {
  fresh: {
    label: "すっきり・華やか",
    ideal: { acidity: 4.5, body: 2.5, sweetness: 4, bitterness: 1.5, aroma: 4.5, fruity: 4.5 },
  },
  balance: {
    label: "バランス",
    ideal: { acidity: 3.5, body: 3.5, sweetness: 4, bitterness: 2.5, aroma: 4, fruity: 3.5 },
  },
  rich: {
    label: "どっしり・重厚",
    ideal: { acidity: 2, body: 4.8, sweetness: 3.8, bitterness: 3.5, aroma: 3.5, fruity: 2 },
  },
};

const ROAST_ORDER = { light: 1, medium: 2, mediumdark: 3, dark: 4 };

// フレーバーノートの好相性ペア（順不同）
const NOTE_SYNERGY = [
  ["chocolate", "berry", 8],
  ["chocolate", "citrus", 6],
  ["chocolate", "wine", 6],
  ["nuts", "citrus", 6],
  ["nuts", "berry", 5],
  ["caramel", "berry", 6],
  ["caramel", "citrus", 5],
  ["honey", "citrus", 5],
  ["spice", "chocolate", 6],
  ["earthy", "floral", 7],
  ["earthy", "berry", 8], // モカ・ジャバの王道
  ["earthy", "citrus", 5],
  ["tea", "honey", 4],
  ["tropical", "chocolate", 5],
];

const ROLE_LABELS = { base: "ベース", character: "キャラクター", accent: "アクセント" };

function beanRole(bean) {
  const p = bean.profile;
  if (p.aroma >= 5 && p.body <= 2) return "accent"; // ゲイシャ・イルガチェフェ級の香り特化
  if (p.body >= 4 && p.acidity <= 3) return "base";
  if (p.acidity >= 4 || p.fruity >= 4) return "character";
  return "base";
}

const ROLE_BONUS = {
  "base|character": 24, "character|base": 24,
  "base|accent": 20, "accent|base": 20,
  "character|accent": 10, "accent|character": 10,
  "base|base": -8,
  "character|character": -10,
  "accent|accent": -14,
};

// 比率は候補の中から「目指す味」に最も近づくものを選ぶ。
// アクセント役（香り特化）の豆は少量側に寄せる制約付き。
const CANDIDATE_RATIOS = [[8, 2], [7, 3], [6, 4], [5, 5], [4, 6], [3, 7], [2, 8]];

function goalDistance(profile, goal) {
  let d = 0;
  for (const ax of AXES) d += Math.abs(profile[ax.key] - goal.ideal[ax.key]);
  return d;
}

function bestRatio(bean, partner, goal) {
  let cands = CANDIDATE_RATIOS;
  if (beanRole(partner) === "accent") cands = cands.filter(([, b]) => b <= 3);
  else if (beanRole(bean) === "accent") cands = cands.filter(([a]) => a <= 5);
  let best = cands[0];
  let bestDist = Infinity;
  for (const r of cands) {
    const d = goalDistance(blendedProfile(bean, partner, r), goal);
    if (d < bestDist) { bestDist = d; best = r; }
  }
  return best;
}

// [{bean, weight}, ...] を混ぜたときの予測プロファイル（2種でも3種以上でも使える）
function mixProfile(items) {
  const total = items.reduce((s, it) => s + it.weight, 0);
  const out = {};
  for (const ax of AXES) {
    out[ax.key] = items.reduce((s, it) => s + it.bean.profile[ax.key] * it.weight, 0) / total;
  }
  return out;
}

function blendedProfile(bean, partner, ratio) {
  return mixProfile([
    { bean, weight: ratio[0] },
    { bean: partner, weight: ratio[1] },
  ]);
}

function noteSynergy(bean, partner) {
  let score = 0;
  const hits = [];
  for (const [n1, n2, pts] of NOTE_SYNERGY) {
    if (
      (bean.notes.includes(n1) && partner.notes.includes(n2)) ||
      (bean.notes.includes(n2) && partner.notes.includes(n1))
    ) {
      score += pts;
      hits.push([n1, n2]);
    }
  }
  return { score, hits };
}

function scorePair(bean, partner, goalKey = "balance") {
  const goal = GOALS[goalKey] ?? GOALS.balance;
  const ratio = bestRatio(bean, partner, goal);
  const blended = blendedProfile(bean, partner, ratio);

  // ゴール適合度: 目指す味のプロファイルからの距離が小さいほど高得点（最大60）
  const balance = Math.max(0, 60 - goalDistance(blended, goal) * 7);

  const roleKey = `${beanRole(bean)}|${beanRole(partner)}`;
  const role = ROLE_BONUS[roleKey] ?? 0;

  const synergy = noteSynergy(bean, partner);

  let penalty = 0;
  if (bean.country === partner.country) penalty -= 8;
  if (bean.region === partner.region) penalty -= 10;

  // 焙煎度が2段階以上離れると減点（INIC coffeeの記事より: 焙煎度が近い豆同士が合わせやすい）
  const roastGap = Math.abs(ROAST_ORDER[bean.roast] - ROAST_ORDER[partner.roast]);
  if (roastGap >= 2) penalty -= 6 * (roastGap - 1);

  return {
    partner,
    ratio,
    blended,
    score: Math.round(balance + role + synergy.score + penalty),
    synergyHits: synergy.hits,
    roastGap,
  };
}

function recommendBlends(bean, beans, topN = 3, goalKey = "balance") {
  return beans
    .filter((b) => b.id !== bean.id)
    .map((b) => scorePair(bean, b, goalKey))
    .sort((x, y) => y.score - x.score)
    .slice(0, topN);
}

// ---- 自作ブレンドの総合分析（N種対応・ブレンドをつくる機能で使用） ----

// items = [{bean, weight}] を受け取り、味わい・完成度・ゴール適合率などを返す
function analyzeBlend(items) {
  const valid = items.filter((it) => it.bean && it.weight > 0);
  const total = valid.reduce((s, it) => s + it.weight, 0);
  if (!valid.length || total <= 0) return null;

  const profile = mixProfile(valid);

  // 役割の重み構成（ベース/キャラクター/アクセント）
  const roleW = { base: 0, character: 0, accent: 0 };
  for (const it of valid) roleW[beanRole(it.bean)] += it.weight / total;

  // 各ゴールへの適合率（0〜100%）
  const goalMatch = {};
  for (const k in GOALS) {
    goalMatch[k] = Math.max(0, Math.round(100 - goalDistance(profile, GOALS[k]) * 5.5));
  }
  const topGoal = Object.keys(GOALS).sort((a, b) => goalMatch[b] - goalMatch[a])[0];

  // フレーバー相性（全ペア）
  let synergy = 0;
  const synergyHits = [];
  for (let i = 0; i < valid.length; i++) {
    for (let j = i + 1; j < valid.length; j++) {
      const s = noteSynergy(valid[i].bean, valid[j].bean);
      synergy += s.score;
      synergyHits.push(...s.hits);
    }
  }

  // 減点（同国・同地域・焙煎度の広がり）
  let penalty = 0;
  let sameOrigin = false;
  for (let i = 0; i < valid.length; i++) {
    for (let j = i + 1; j < valid.length; j++) {
      if (valid[i].bean.country === valid[j].bean.country) { penalty -= 4; sameOrigin = true; }
      if (valid[i].bean.region === valid[j].bean.region) penalty -= 6;
    }
  }
  const roasts = valid.map((it) => ROAST_ORDER[it.bean.roast]);
  const roastSpread = Math.max(...roasts) - Math.min(...roasts);
  if (roastSpread >= 2) penalty -= 5 * (roastSpread - 1);

  // 役割構成のスコア
  const hasBase = roleW.base >= 0.35;
  const hasCharacter = roleW.character + roleW.accent >= 0.15;
  let roleScore;
  if (hasBase && hasCharacter) roleScore = 24;
  else if (roleW.accent > 0.5) roleScore = -14;
  else if (roleW.character >= 0.8) roleScore = -8;
  else if (roleW.base >= 0.85) roleScore = 4;
  else roleScore = 8;

  const score = Math.max(0, Math.min(100, Math.round(55 + roleScore + Math.min(synergy, 20) + penalty)));

  let scoreLabel;
  if (score >= 80) scoreLabel = "とてもよくまとまっています";
  else if (score >= 65) scoreLabel = "バランスの良い配合です";
  else if (score >= 50) scoreLabel = "悪くない配合です";
  else scoreLabel = "少し尖った配合です";

  // 味わいの要約（値の高い2軸）
  const TRAIT = {
    acidity: "明るい酸味", body: "重厚なコク", sweetness: "ふくよかな甘み",
    bitterness: "しっかりした苦味", aroma: "華やかな香り", fruity: "豊かな果実味",
  };
  const topAxes = AXES.map((ax) => ({ key: ax.key, v: profile[ax.key] }))
    .sort((a, b) => b.v - a.v)
    .slice(0, 2);
  const taste = `${TRAIT[topAxes[0].key]}と${TRAIT[topAxes[1].key]}が主役の、${GOALS[topGoal].label}系の味わい。${cupComment(profile)}`;

  // アドバイス
  const advice = [];
  if (valid.length === 1) advice.push("2種類以上を混ぜると、ブレンドならではの奥行きが出ます。");
  if (roastSpread >= 2) advice.push("焙煎度が離れた豆が混ざっています。近い焙煎度でまとめると味が安定します。");
  if (roleW.accent > 0.5) advice.push("香りの強い豆（アクセント）が多めです。1〜2割に抑えると全体が締まります。");
  if (!hasBase && valid.length >= 2) advice.push("コクのある土台（ベース）の豆を加えると、味に芯が通ります。");
  if (hasBase && !hasCharacter && valid.length >= 2) advice.push("個性のある豆（キャラクター）を2〜4割足すと、表情が生まれます。");
  if (sameOrigin) advice.push("同じ国の豆同士は似た傾向になりがち。別の産地を混ぜると変化が出ます。");

  return { profile, roleW, goalMatch, topGoal, score, scoreLabel, taste, advice, synergyHits, roastSpread };
}

// ---- 推薦理由の文章生成（テンプレート） ----

function topTrait(bean) {
  const traits = [
    ["acidity", "明るい酸味"],
    ["fruity", "豊かな果実味"],
    ["aroma", "華やかな香り"],
    ["body", "重厚なコク"],
    ["sweetness", "ふくよかな甘み"],
    ["bitterness", "しっかりした苦味"],
  ];
  let best = traits[0];
  for (const t of traits) if (bean.profile[t[0]] > bean.profile[best[0]]) best = t;
  return best[1];
}

function cupComment(blended) {
  if (blended.acidity >= 3.8 && blended.aroma >= 4) return "香り高く、明るい飲み口のカップに仕上がります。";
  if (blended.body >= 4) return "飲みごたえのある、どっしりとしたカップに仕上がります。";
  if (blended.sweetness >= 4.2) return "甘みが際立つ、まろやかなカップに仕上がります。";
  if (blended.acidity >= 3.5) return "酸味とコクのバランスが取れた、軽やかなカップに仕上がります。";
  return "毎日飲んでも飽きのこない、バランスの良いカップに仕上がります。";
}

function reasonText(bean, rec) {
  const p = rec.partner;
  const pair = `${beanRole(bean)}|${beanRole(p)}`;
  const bt = topTrait(bean);
  const pt = topTrait(p);

  let lead;
  switch (pair) {
    case "base|character":
    case "base|accent":
      lead = `この豆の${bt}を土台に、${p.country}・${p.region}の${pt}が表情を加えます。`;
      break;
    case "character|base":
    case "accent|base":
      lead = `${p.country}・${p.region}の${pt}が土台となり、この豆の${bt}を受け止めて安定感を生みます。`;
      break;
    case "character|accent":
    case "accent|character":
      lead = `${bt}に${p.country}・${p.region}の${pt}が重なり、個性の掛け算で複雑な風味が生まれます。`;
      break;
    default:
      lead = `${p.country}・${p.region}の${pt}が、この豆の${bt}を引き立てます。`;
  }

  let synergyNote = "";
  if (rec.synergyHits.length > 0) {
    const [n1, n2] = rec.synergyHits[0];
    synergyNote = `${NOTE_LABELS[n1]}と${NOTE_LABELS[n2]}は好相性の組み合わせ。`;
  }

  return `${lead}${synergyNote}${cupComment(rec.blended)}`;
}
