// BLENDIA UI

const grid = document.getElementById("grid");
const detail = document.getElementById("detail");
const overlay = document.getElementById("overlay");
const filterBar = document.getElementById("filters");
const searchInput = document.getElementById("search");
const resultCount = document.getElementById("result-count");

let activeCountry = "すべて";
let searchQuery = "";
let activeTaste = "none"; // 目指す味での並び替え（基礎知識「ゴールを決めてから組む」の実践）

// 参考価格帯（3段階）。金額は表示せず、実売価格は販売サイト側で確認してもらう方針
function priceTier(bean) {
  if (bean.price < 800) return { mark: "¥", label: "手頃" };
  if (bean.price <= 1200) return { mark: "¥¥", label: "標準" };
  return { mark: "¥¥¥", label: "プレミアム" };
}

// 販売サイトの検索リンク（検索ジェネレーターとしての出口）
// 収益化できる出口だけを置く（Amazon/楽天はアフィリエイト対象。珈琲問屋も楽天店経由なら対象）
const RAKUTEN_AFF_ID = "55d289f4.46df8fc2.55d289f5.0e8ffc7e";
const AMAZON_TAG = "blendia-22";

// 楽天の任意URLをアフィリエイト計測付きリンクに変換
function rakutenAff(url) {
  return `https://hb.afl.rakuten.co.jp/hgc/${RAKUTEN_AFF_ID}/?pc=${encodeURIComponent(url)}&m=${encodeURIComponent(url)}`;
}

function shopLinks(bean) {
  const q = encodeURIComponent(`${bean.country} ${bean.name} コーヒー豆`);
  const qTonya = encodeURIComponent(`珈琲問屋 ${bean.name}`);
  const rakutenUrl = `https://search.rakuten.co.jp/search/mall/${q}/`;
  const tonyaUrl = `https://search.rakuten.co.jp/search/mall/${qTonya}/`;
  return `
    <div class="shop-links">
      <p class="shop-links-label">この豆を販売サイトで探す</p>
      <a href="https://www.amazon.co.jp/s?k=${q}&tag=${AMAZON_TAG}" target="_blank" rel="nofollow sponsored noopener" class="shop-btn">Amazon</a>
      <a href="${rakutenAff(rakutenUrl)}" target="_blank" rel="nofollow sponsored noopener" class="shop-btn">楽天市場</a>
      <a href="${rakutenAff(tonyaUrl)}" target="_blank" rel="nofollow sponsored noopener" class="shop-btn">珈琲問屋（楽天店）</a>
    </div>`;
}

// 国旗絵文字はWindowsで描画されないため、2文字の国コードバッジとして表示する
function countryCode(bean) {
  return [...bean.flag].map((c) => String.fromCodePoint(c.codePointAt(0) - 0x1f1e6 + 65)).join("");
}
function flagBadge(bean, large = false) {
  return `<span class="flag-badge ${large ? "flag-badge-lg" : ""}">${countryCode(bean)}</span>`;
}

// ---- レーダーチャート（SVG） ----
function radarSVG(profile, size = 180, color = "var(--accent)") {
  const cx = size / 2, cy = size / 2;
  const rMax = size / 2 - 28;
  const n = AXES.length;
  const angle = (i) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pt = (i, r) => [cx + Math.cos(angle(i)) * r, cy + Math.sin(angle(i)) * r];

  let gridLines = "";
  for (let lv = 1; lv <= 5; lv++) {
    const pts = AXES.map((_, i) => pt(i, (rMax * lv) / 5).join(",")).join(" ");
    gridLines += `<polygon points="${pts}" fill="none" stroke="var(--line)" stroke-width="${lv === 5 ? 1.2 : 0.6}"/>`;
  }
  let spokes = "";
  let labels = "";
  AXES.forEach((ax, i) => {
    const [x, y] = pt(i, rMax);
    spokes += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="var(--line)" stroke-width="0.6"/>`;
    const [lx, ly] = pt(i, rMax + 16);
    labels += `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle" class="radar-label">${ax.label}</text>`;
  });
  const shape = AXES.map((ax, i) => pt(i, (rMax * profile[ax.key]) / 5).join(",")).join(" ");

  return `<svg viewBox="0 0 ${size} ${size}" class="radar">
    ${gridLines}${spokes}
    <polygon points="${shape}" fill="${color}" fill-opacity="0.25" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>
    ${labels}
  </svg>`;
}

// ---- 一覧カード ----
function beanCard(bean) {
  const role = beanRole(bean);
  const noteTags = bean.notes.map((n) => `<span class="tag">${NOTE_LABELS[n]}</span>`).join("");
  return `
    <article class="card" data-id="${bean.id}" tabindex="0">
      <div class="card-head">
        ${flagBadge(bean)}
        <div>
          <p class="card-country">${bean.country} / ${bean.region}</p>
          <h3 class="card-name">${bean.name}</h3>
        </div>
      </div>
      <div class="card-tags">${noteTags}</div>
      <div class="card-foot">
        <span class="role role-${role}">${ROLE_LABELS[role]}</span>
        <span class="roast">${ROAST_LABELS[bean.roast]}</span>
        <span class="price" title="参考価格帯: ${priceTier(bean).label}">${priceTier(bean).mark}</span>
      </div>
    </article>`;
}

function matchesQuery(bean, q) {
  const haystack = [
    bean.name, bean.country, bean.region, bean.process, bean.variety,
    ROAST_LABELS[bean.roast],
    ...bean.notes.map((n) => NOTE_LABELS[n]),
  ].join(" ").toLowerCase();
  return q.split(/\s+/).every((word) => haystack.includes(word));
}

function renderGrid() {
  let beans = activeCountry === "すべて" ? BEANS : BEANS.filter((b) => b.country === activeCountry);
  const q = searchQuery.trim().toLowerCase();
  if (q) beans = beans.filter((b) => matchesQuery(b, q));
  if (activeTaste !== "none" && GOALS[activeTaste]) {
    const goal = GOALS[activeTaste];
    beans = beans.slice().sort((a, b) => goalDistance(a.profile, goal) - goalDistance(b.profile, goal));
  }
  grid.innerHTML = beans.length
    ? beans.map(beanCard).join("")
    : `<p class="empty">該当する豆が見つかりませんでした。</p>`;
  grid.scrollTop = 0;
  resultCount.textContent = `${beans.length}銘柄`;
}

function renderTasteFilters() {
  const box = document.getElementById("taste-filters");
  const chips = [`<button class="chip taste-chip ${activeTaste === "none" ? "active" : ""}" data-taste="none">指定なし</button>`]
    .concat(
      Object.entries(GOALS).map(
        ([key, g]) =>
          `<button class="chip taste-chip ${key === activeTaste ? "active" : ""}" data-taste="${key}">${g.label}</button>`
      )
    );
  box.innerHTML = chips.join("");
  box.querySelectorAll("[data-taste]").forEach((btn) =>
    btn.addEventListener("click", () => {
      activeTaste = btn.dataset.taste;
      renderTasteFilters();
      renderGrid();
    })
  );
}

function renderFilters() {
  const countries = ["すべて", ...new Set(BEANS.map((b) => b.country))];
  filterBar.innerHTML = countries
    .map((c) => `<button class="chip ${c === activeCountry ? "active" : ""}" data-country="${c}">${c}</button>`)
    .join("");
}

// ---- 詳細パネル ----
function miniProfileBars(profile) {
  return AXES.map(
    (ax) => `
    <div class="bar-row">
      <span class="bar-label">${ax.label}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${(profile[ax.key] / 5) * 100}%"></div></div>
    </div>`
  ).join("");
}

let activeGoal = "balance";

function recCard(bean, rec, rank) {
  const p = rec.partner;
  const [ra, rb] = rec.ratio;
  return `
    <div class="rec-card">
      <div class="rec-rank">${rank}</div>
      <div class="rec-body">
        <div class="rec-head">
          ${flagBadge(p)}
          <div>
            <p class="card-country">${p.country} / ${p.region}</p>
            <h4 class="rec-name">${p.name}</h4>
          </div>
          <span class="rec-score" title="相性スコア">${rec.score}<small>pt</small></span>
        </div>
        <p class="rec-ratio">おすすめ比率 <strong>${ra} : ${rb}</strong>（この豆 : ${p.name}）</p>
        <p class="rec-reason">${reasonText(bean, rec)}</p>
        <div class="rec-radar">
          ${radarSVG(rec.blended, 150, "var(--accent2)")}
          <span class="rec-radar-caption">ブレンド後の味わい予測</span>
        </div>
        <button class="link-btn" data-goto="${p.id}">この豆を見る →</button>
      </div>
    </div>`;
}

function showDetail(id) {
  const bean = BEANS.find((b) => b.id === id);
  if (!bean) return;
  const recs = recommendBlends(bean, BEANS, 3, activeGoal);
  const role = beanRole(bean);

  const goalChips = Object.entries(GOALS)
    .map(
      ([key, g]) =>
        `<button class="chip goal-chip ${key === activeGoal ? "active" : ""}" data-goal="${key}">${g.label}</button>`
    )
    .join("");

  detail.innerHTML = `
    <button class="close-btn" id="closeDetail" aria-label="閉じる">×</button>
    <div class="detail-head">
      ${flagBadge(bean, true)}
      <div>
        <p class="card-country">${bean.country} / ${bean.region}</p>
        <h2>${bean.name}</h2>
        <div class="card-tags">${bean.notes.map((n) => `<span class="tag">${NOTE_LABELS[n]}</span>`).join("")}</div>
      </div>
    </div>

    <div class="detail-cols">
      <div class="detail-info">
        <p class="desc">${bean.description}</p>
        <table class="spec">
          <tr><th>品種</th><td>${bean.variety}</td></tr>
          <tr><th>標高</th><td>${bean.altitude}</td></tr>
          <tr><th>収穫期</th><td>${bean.harvest}</td></tr>
          <tr><th>精製</th><td>${bean.process}</td></tr>
          <tr><th>焙煎</th><td>${ROAST_LABELS[bean.roast]}</td></tr>
          <tr><th>おすすめの淹れ方</th><td>${bean.brew.join(" / ")}</td></tr>
          <tr><th>ブレンドでの役割</th><td><span class="role role-${role}">${ROLE_LABELS[role]}</span></td></tr>
          <tr><th>参考価格帯</th><td>${priceTier(bean).mark}（${priceTier(bean).label}） <small class="price-note">実売価格は販売サイトでご確認ください</small></td></tr>
        </table>
        ${shopLinks(bean)}
      </div>
      <div class="detail-radar">
        ${radarSVG(bean.profile, 210)}
        ${miniProfileBars(bean.profile)}
      </div>
    </div>

    <section class="rec-section">
      <h3>この豆とブレンドするなら</h3>
      <p class="rec-sub">まず目指す味を選んでください。風味プロファイルの相性から、おすすめの組み合わせ TOP3 を算出します。</p>
      <div class="goal-chips">${goalChips}</div>
      <div class="rec-list">
        ${recs.map((r, i) => recCard(bean, r, i + 1)).join("")}
      </div>
    </section>
  `;

  overlay.classList.add("open");
  detail.classList.add("open");
  detail.scrollTop = 0;

  document.getElementById("closeDetail").addEventListener("click", closeDetail);
  detail.querySelectorAll("[data-goto]").forEach((btn) =>
    btn.addEventListener("click", () => showDetail(btn.dataset.goto))
  );
  detail.querySelectorAll("[data-goal]").forEach((btn) =>
    btn.addEventListener("click", () => {
      activeGoal = btn.dataset.goal;
      const scroll = detail.scrollTop;
      showDetail(id);
      detail.scrollTop = scroll;
    })
  );
}

function closeDetail() {
  overlay.classList.remove("open");
  detail.classList.remove("open");
}

// ---- イベント ----
grid.addEventListener("click", (e) => {
  const card = e.target.closest(".card");
  if (card) showDetail(card.dataset.id);
});
grid.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const card = e.target.closest(".card");
    if (card) showDetail(card.dataset.id);
  }
});
filterBar.addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  activeCountry = chip.dataset.country;
  renderFilters();
  renderGrid();
});
searchInput.addEventListener("input", () => {
  searchQuery = searchInput.value;
  renderGrid();
});
overlay.addEventListener("click", closeDetail);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeDetail();
});

// ---- 定番レシピ（スライダー） ----
function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function recipeCardHTML(r) {
  const items = r.items.map(([id, w]) => ({ bean: BEANS.find((b) => b.id === id), weight: w }));
  const mixed = mixProfile(items);
  const ratioLabel = items.map((it) => it.weight).join(" : ");
  const beanLinks = items
    .map(
      (it) => `<button class="link-btn recipe-bean" data-goto="${it.bean.id}">${it.bean.name}</button>`
    )
    .join('<span class="recipe-x">×</span>');
  return `
    <div class="recipe-card">
      <div class="recipe-head">
        <h3>${r.name}</h3>
        <span class="tag goal-tag">${r.goal}</span>
      </div>
      <div class="recipe-beans">${beanLinks}</div>
      <p class="recipe-ratio">配合比 <strong>${ratioLabel}</strong></p>
      <p class="recipe-comment">${r.comment}</p>
      <div class="recipe-radar">${radarSVG(mixed, 150, "var(--accent2)")}</div>
    </div>`;
}

let recipeTimer = null;

function renderRecipes() {
  const box = document.getElementById("recipes");
  // 読み込み直すたびに並びをシャッフル（＝表示されるレシピが入れ替わる）
  box.innerHTML = shuffled(RECIPES).map(recipeCardHTML).join("");
  box.scrollLeft = 0;
  box.querySelectorAll("[data-goto]").forEach((btn) =>
    btn.addEventListener("click", () => showDetail(btn.dataset.goto))
  );
}

function recipeStep() {
  const box = document.getElementById("recipes");
  const first = box.querySelector(".recipe-card");
  return first ? first.offsetWidth + 14 : 280; // カード幅 + gap
}

function slideRecipes(dir) {
  const box = document.getElementById("recipes");
  const atEnd = box.scrollLeft + box.clientWidth >= box.scrollWidth - 4;
  if (dir > 0 && atEnd) box.scrollTo({ left: 0, behavior: "smooth" });
  else box.scrollBy({ left: dir * recipeStep(), behavior: "smooth" });
}

function startRecipeAuto() {
  stopRecipeAuto();
  recipeTimer = setInterval(() => slideRecipes(1), 6000); // 一定期間ごとに自動送り
}
function stopRecipeAuto() {
  if (recipeTimer) clearInterval(recipeTimer);
  recipeTimer = null;
}

function initRecipeSlider() {
  const box = document.getElementById("recipes");
  document.getElementById("recipe-prev").addEventListener("click", () => slideRecipes(-1));
  document.getElementById("recipe-next").addEventListener("click", () => slideRecipes(1));
  document.getElementById("recipe-shuffle").addEventListener("click", () => {
    renderRecipes();
    startRecipeAuto();
  });
  // 閲覧中は自動送りを止める
  box.addEventListener("mouseenter", stopRecipeAuto);
  box.addEventListener("mouseleave", startRecipeAuto);
  box.addEventListener("touchstart", stopRecipeAuto, { passive: true });
  startRecipeAuto();
}

// ---- 基礎知識 ----
function renderGuide() {
  document.getElementById("guide").innerHTML = GUIDE_TIPS.map(
    (t, i) => `
    <div class="tip-card">
      <span class="tip-num">${i + 1}</span>
      <div><h4>${t.title}</h4><p>${t.body}</p></div>
    </div>`
  ).join("");
}

renderFilters();
renderTasteFilters();
renderGrid();
renderRecipes();
initRecipeSlider();
renderGuide();

// 記事等からの直リンク対応（index.html#豆id で詳細を開く）
if (location.hash) {
  const target = location.hash.slice(1);
  if (BEANS.some((b) => b.id === target)) showDetail(target);
}
