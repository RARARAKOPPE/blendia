// ブレンドをつくる — 自作ブレンドのシミュレーター UI
// data.js（BEANS/AXES/NOTE_LABELS）と blend.js（analyzeBlend/GOALS/ROLE_LABELS/beanRole/mixProfile）に依存

// ---- レーダーチャート（app.js と同じ純粋関数の複製。両ページが同時に読み込まれることはない） ----
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
  let spokes = "", labels = "";
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

// ---- 状態 ----
// blend: [{ beanId, weight }]
let blend = [
  { beanId: "idn-mandheling", weight: 6 },
  { beanId: "eth-sidamo", weight: 4 },
];

const MAX_BEANS = 5;
const rowsBox = document.getElementById("blend-rows");
const resultBox = document.getElementById("blend-result");
const addBtn = document.getElementById("add-bean");

// 国名でグループ化（optgroup）。リストでは国名が見出しに出て、選択後は銘柄名だけが表示される
function beanOptions(selectedId) {
  const byCountry = new Map();
  for (const b of BEANS) {
    if (!byCountry.has(b.country)) byCountry.set(b.country, []);
    byCountry.get(b.country).push(b);
  }
  let html = "";
  for (const [country, beans] of byCountry) {
    html += `<optgroup label="${country}">`;
    for (const b of beans) {
      html += `<option value="${b.id}" ${b.id === selectedId ? "selected" : ""}>${b.name}</option>`;
    }
    html += `</optgroup>`;
  }
  return html;
}

function renderRows() {
  const total = blend.reduce((s, it) => s + it.weight, 0) || 1;
  rowsBox.innerHTML = blend
    .map((it, i) => {
      const pct = Math.round((it.weight / total) * 100);
      return `
      <div class="blend-row" data-i="${i}">
        <select class="row-bean">${beanOptions(it.beanId)}</select>
        <div class="row-ratio">
          <input type="range" class="row-weight" min="1" max="10" value="${it.weight}" aria-label="配合の割合" />
          <span class="row-pct">${pct}%</span>
        </div>
        <button class="row-remove" type="button" aria-label="削除" ${blend.length <= 1 ? "disabled" : ""}>×</button>
      </div>`;
    })
    .join("");

  rowsBox.querySelectorAll(".blend-row").forEach((row) => {
    const i = Number(row.dataset.i);
    row.querySelector(".row-bean").addEventListener("change", (e) => {
      blend[i].beanId = e.target.value;
      update();
    });
    row.querySelector(".row-weight").addEventListener("input", (e) => {
      blend[i].weight = Number(e.target.value);
      update();
    });
    row.querySelector(".row-remove").addEventListener("click", () => {
      blend.splice(i, 1);
      update();
    });
  });

  addBtn.disabled = blend.length >= MAX_BEANS;
  addBtn.textContent = blend.length >= MAX_BEANS ? "豆は最大5種までです" : "＋ 豆を追加";
}

function goalBars(goalMatch, topGoal) {
  return Object.entries(GOALS)
    .map(([key, g]) => {
      const pct = goalMatch[key];
      const top = key === topGoal;
      return `
      <div class="goal-bar-row ${top ? "top" : ""}">
        <span class="goal-bar-label">${g.label}</span>
        <div class="goal-bar-track"><div class="goal-bar-fill" style="width:${pct}%"></div></div>
        <span class="goal-bar-pct">${pct}%</span>
      </div>`;
    })
    .join("");
}

function roleTags() {
  const total = blend.reduce((s, it) => s + it.weight, 0) || 1;
  const roleW = { base: 0, character: 0, accent: 0 };
  for (const it of blend) {
    const bean = BEANS.find((b) => b.id === it.beanId);
    if (bean) roleW[beanRole(bean)] += it.weight / total;
  }
  return Object.entries(roleW)
    .filter(([, w]) => w > 0)
    .map(([role, w]) => `<span class="role role-${role}">${ROLE_LABELS[role]} ${Math.round(w * 100)}%</span>`)
    .join("");
}

function renderResult() {
  const items = blend
    .map((it) => ({ bean: BEANS.find((b) => b.id === it.beanId), weight: it.weight }))
    .filter((it) => it.bean);
  const r = analyzeBlend(items);
  if (!r) {
    resultBox.innerHTML = `<p class="empty">豆を1種以上追加してください。</p>`;
    return;
  }
  resultBox.innerHTML = `
    <div class="result-top">
      <div class="result-radar">
        ${radarSVG(r.profile, 200, "var(--accent2)")}
        <span class="rec-radar-caption">ブレンド後の味わい予測</span>
      </div>
      <div class="result-score">
        <span class="result-score-num">${r.score}<small>pt</small></span>
        <p class="result-score-label">${r.scoreLabel}</p>
        <div class="result-roles">${roleTags()}</div>
      </div>
    </div>

    <h3 class="result-heading">味わいの方向性</h3>
    <div class="goal-bars">${goalBars(r.goalMatch, r.topGoal)}</div>

    <h3 class="result-heading">どんな味わいになる？</h3>
    <p class="result-taste">${r.taste}</p>

    ${
      r.advice.length
        ? `<h3 class="result-heading">よりよくするヒント</h3>
           <ul class="result-advice">${r.advice.map((a) => `<li>${a}</li>`).join("")}</ul>`
        : ""
    }
  `;
}

function addBean() {
  const used = new Set(blend.map((it) => it.beanId));
  const next = BEANS.find((b) => !used.has(b.id)) || BEANS[0];
  blend.push({ beanId: next.id, weight: 3 });
  update();
}

function update() {
  renderRows();
  renderResult();
}

addBtn.addEventListener("click", addBean);
update();
