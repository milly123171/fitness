// ===================== 資料儲存 =====================
const STORAGE_KEY = "fitDietApp_v1";

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try { return JSON.parse(raw); } catch (e) { /* fallthrough */ }
  }
  return {
    profile: null,
    foods: SEED_FOODS.map(f => ({ id: uid(), name: f.name, category: f.category, cal: f.cal, protein: f.protein, carb: f.carb, fat: f.fat })),
    recipes: [],
    diary: {}, // date -> { weight, entries: [] }
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let state = loadState();

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function todayStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function round1(n) { return Math.round(n * 10) / 10; }

function getFoodById(id) { return state.foods.find(f => f.id === id); }
function getRecipeById(id) { return state.recipes.find(r => r.id === id); }

function ensureDiaryDate(date) {
  if (!state.diary[date]) state.diary[date] = { weight: null, entries: [] };
  return state.diary[date];
}

// ===================== 營養計算 =====================
function nutritionForFoodGrams(food, grams) {
  const ratio = grams / 100;
  return {
    cal: food.cal * ratio,
    protein: food.protein * ratio,
    carb: food.carb * ratio,
    fat: food.fat * ratio,
  };
}

function recipeTotals(recipe) {
  const totals = { cal: 0, protein: 0, carb: 0, fat: 0 };
  recipe.ingredients.forEach(ing => {
    const food = getFoodById(ing.foodId);
    if (!food) return;
    const n = nutritionForFoodGrams(food, ing.grams);
    totals.cal += n.cal; totals.protein += n.protein; totals.carb += n.carb; totals.fat += n.fat;
  });
  return totals;
}

function recipePerServing(recipe) {
  const t = recipeTotals(recipe);
  const s = Math.max(1, recipe.servings);
  return { cal: t.cal / s, protein: t.protein / s, carb: t.carb / s, fat: t.fat / s };
}

function computeBMR({ gender, age, heightCm, weightKg }) {
  if (gender === "male") {
    return 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
  }
  return 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
}

// 建議熱量調整幅度：增肌抓 TDEE 的 ~12% 盈餘、減脂抓 ~20% 赤字（並限制在安全區間內）
function computeRecommendedAdjust(tdee, goal) {
  if (goal === "bulk") {
    const val = Math.round((tdee * 0.12) / 10) * 10;
    return Math.max(200, Math.min(500, val));
  }
  if (goal === "cut") {
    const val = Math.round((tdee * 0.20) / 10) * 10;
    return Math.max(300, Math.min(600, val));
  }
  return 100; // 維持體態不使用此數值
}

function leanBodyMass({ weightKg, bodyFatPct }) {
  if (!bodyFatPct || bodyFatPct <= 0 || bodyFatPct >= 70) return null;
  return weightKg * (1 - bodyFatPct / 100);
}

// 建議蛋白質攝取量（換算為 g/kg 總體重，供既有滑桿使用）
// 有體脂率：以去脂體重(LBM)為基準計算，最貼近實際肌肉需求
// 無體脂率：退回以總體重 + BMI 概估
function computeRecommendedProteinRatio(profile) {
  const { age, heightCm, weightKg, goal } = profile;
  const lbm = leanBodyMass(profile);

  let effectiveRatio;

  if (lbm) {
    let perLbm;
    if (goal === "bulk") perLbm = 2.2;
    else if (goal === "cut") perLbm = 2.7; // 減脂期提高攝取以保留肌肉量
    else perLbm = 1.8;

    if (age >= 50) perLbm += 0.2;

    const proteinG = lbm * perLbm;
    effectiveRatio = proteinG / weightKg;
  } else {
    let base;
    if (goal === "bulk") base = 2.0;
    else if (goal === "cut") base = 2.2;
    else base = 1.6;

    if (age >= 50) base += 0.2; // 年長者建議提高攝取以減緩肌肉流失

    const heightM = heightCm / 100;
    if (heightM > 0) {
      const bmi = weightKg / (heightM * heightM);
      if (bmi >= 30) base -= 0.3; // 體重基數較大時，改以總體重估算會偏高，酌減
      else if (bmi >= 25) base -= 0.15;
    }
    effectiveRatio = base;
  }

  return Math.max(1.2, Math.min(3.2, Math.round(effectiveRatio * 10) / 10));
}

function computeProfileTargets(profile) {
  const { activity, goal, adjust, proteinRatio, weightKg } = profile;
  const bmr = computeBMR(profile);
  const tdee = bmr * activity;
  let targetCal;
  if (goal === "bulk") targetCal = tdee + adjust;
  else if (goal === "cut") targetCal = Math.max(1200, tdee - adjust);
  else targetCal = tdee;

  const proteinG = weightKg * proteinRatio;
  const proteinCal = proteinG * 4;
  const fatCal = targetCal * 0.25;
  const fatG = fatCal / 9;
  const carbCal = Math.max(0, targetCal - proteinCal - fatCal);
  const carbG = carbCal / 4;

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    targetCal: Math.round(targetCal),
    protein: round1(proteinG),
    carb: round1(carbG),
    fat: round1(fatG),
  };
}

function diaryDayTotals(date) {
  const day = state.diary[date];
  const totals = { cal: 0, protein: 0, carb: 0, fat: 0 };
  if (!day) return totals;
  day.entries.forEach(e => {
    totals.cal += e.cal; totals.protein += e.protein; totals.carb += e.carb; totals.fat += e.fat;
  });
  return totals;
}

// ===================== Tabs =====================
function switchTab(tab) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll(".panel").forEach(p => p.classList.toggle("active", p.id === `panel-${tab}`));
  if (tab === "dashboard") renderDashboard();
  if (tab === "diary") renderDiary();
  if (tab === "foods") renderFoods();
  if (tab === "recipes") renderRecipes();
  if (tab === "profile") renderProfile();
}

// ===================== Toast =====================
let toastTimer;
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

// ===================== Dashboard =====================
let dashDate = todayStr();

function renderDashboard() {
  document.getElementById("dashDate").value = dashDate;
  const totals = diaryDayTotals(dashDate);
  const day = state.diary[dashDate];

  const targets = state.profile ? computeProfileTargets(state.profile) : null;

  document.getElementById("statTargetCal").textContent = targets ? `${targets.targetCal} kcal` : "尚未設定";
  document.getElementById("statGoalLabel").textContent = state.profile
    ? { bulk: "目標：增肌 (熱量盈餘)", cut: "目標：減脂 (熱量赤字)", maintain: "目標：維持體態" }[state.profile.goal]
    : "請至「個人設定」建立資料";

  document.getElementById("statIntakeCal").textContent = `${Math.round(totals.cal)} kcal`;
  const remain = targets ? targets.targetCal - totals.cal : null;
  document.getElementById("statRemainCal").textContent = targets
    ? (remain >= 0 ? `剩餘 ${Math.round(remain)} kcal` : `已超過 ${Math.round(-remain)} kcal`)
    : "設定目標後顯示";

  document.getElementById("statWeight").textContent = day && day.weight ? `${day.weight} kg` : "-- kg";
  document.getElementById("weightInput").value = day && day.weight ? day.weight : "";

  const percent = targets ? Math.min(150, Math.round((totals.cal / targets.targetCal) * 100)) : 0;
  drawRing(document.getElementById("calRing"), percent);
  document.getElementById("ringCenterText").textContent = targets ? `${percent}%` : "--";

  drawMacroBar(document.getElementById("macroBarChart"), totals, targets);
  renderMacroLegend(totals, targets);

  drawWeightTrend(document.getElementById("weightTrendChart"));

  renderMealList("dashMealList", dashDate, false);
}

function renderMacroLegend(totals, targets) {
  const el = document.getElementById("macroLegend");
  const rows = [
    { label: "蛋白質", color: "var(--accent-protein)", val: totals.protein, target: targets ? targets.protein : null },
    { label: "碳水", color: "var(--accent-carb)", val: totals.carb, target: targets ? targets.carb : null },
    { label: "脂肪", color: "var(--accent-fat)", val: totals.fat, target: targets ? targets.fat : null },
  ];
  el.innerHTML = rows.map(r => `
    <span><span class="legend-dot" style="background:${r.color}"></span>${r.label} ${round1(r.val)}g${r.target ? ` / ${r.target}g` : ""}</span>
  `).join("");
}

// ===================== Canvas Charts =====================
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || name;
}

function drawRing(canvas, percent) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - 12;
  ctx.lineWidth = 16;
  ctx.strokeStyle = cssVar("--surface-alt") || "#eee";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  const frac = Math.min(1, percent / 100);
  let color = cssVar("--primary") || "#2f9e6b";
  if (percent > 105) color = cssVar("--accent-fat") || "#f0653c";
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
  ctx.stroke();
}

function drawMacroBar(canvas, totals, targets) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const items = [
    { label: "蛋白質", val: totals.protein, target: targets ? targets.protein : Math.max(totals.protein, 1), color: cssVar("--accent-protein") },
    { label: "碳水", val: totals.carb, target: targets ? targets.carb : Math.max(totals.carb, 1), color: cssVar("--accent-carb") },
    { label: "脂肪", val: totals.fat, target: targets ? targets.fat : Math.max(totals.fat, 1), color: cssVar("--accent-fat") },
  ];

  const maxVal = Math.max(...items.map(i => Math.max(i.val, i.target)), 1) * 1.15;
  const barAreaW = w - 80;
  const barH = 26;
  const gap = (h - barH * 3) / 4;

  ctx.font = "13px sans-serif";
  ctx.fillStyle = cssVar("--text") || "#333";
  ctx.textBaseline = "middle";

  items.forEach((item, i) => {
    const y = gap + i * (barH + gap);
    // label
    ctx.fillStyle = cssVar("--text");
    ctx.fillText(item.label, 0, y + barH / 2);
    // background track
    ctx.fillStyle = cssVar("--surface-alt");
    ctx.fillRect(56, y, barAreaW, barH);
    // value bar
    const bw = Math.min(barAreaW, (item.val / maxVal) * barAreaW);
    ctx.fillStyle = item.color;
    ctx.fillRect(56, y, bw, barH);
    // target marker
    if (targets) {
      const tx = 56 + Math.min(barAreaW, (item.target / maxVal) * barAreaW);
      ctx.strokeStyle = cssVar("--text");
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(tx, y - 3);
      ctx.lineTo(tx, y + barH + 3);
      ctx.stroke();
    }
    // value text
    ctx.fillStyle = cssVar("--text");
    ctx.fillText(`${round1(item.val)}g`, 56 + bw + 6, y + barH / 2);
  });
}

function drawWeightTrend(canvas) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const entries = Object.keys(state.diary)
    .filter(d => state.diary[d].weight != null)
    .sort()
    .slice(-30)
    .map(d => ({ date: d, weight: state.diary[d].weight }));

  if (entries.length < 2) {
    ctx.fillStyle = cssVar("--text-muted") || "#999";
    ctx.font = "13px sans-serif";
    ctx.fillText("至少需要 2 筆體重紀錄才能顯示趨勢圖", 10, h / 2);
    return;
  }

  const pad = 30;
  const weights = entries.map(e => e.weight);
  const minW = Math.min(...weights) - 0.5;
  const maxW = Math.max(...weights) + 0.5;
  const xStep = (w - pad * 2) / (entries.length - 1);

  const xFor = i => pad + i * xStep;
  const yFor = wt => h - pad - ((wt - minW) / (maxW - minW || 1)) * (h - pad * 2);

  // grid
  ctx.strokeStyle = cssVar("--border") || "#eee";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, pad); ctx.lineTo(pad, h - pad); ctx.lineTo(w - pad, h - pad);
  ctx.stroke();

  // line
  ctx.strokeStyle = cssVar("--primary") || "#2f9e6b";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  entries.forEach((e, i) => {
    const x = xFor(i), y = yFor(e.weight);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // points
  ctx.fillStyle = cssVar("--primary") || "#2f9e6b";
  entries.forEach((e, i) => {
    ctx.beginPath();
    ctx.arc(xFor(i), yFor(e.weight), 3.5, 0, Math.PI * 2);
    ctx.fill();
  });

  // labels min/max
  ctx.fillStyle = cssVar("--text-muted") || "#999";
  ctx.font = "11px sans-serif";
  ctx.fillText(`${maxW.toFixed(1)}kg`, 2, pad);
  ctx.fillText(`${minW.toFixed(1)}kg`, 2, h - pad);
  ctx.fillText(entries[0].date.slice(5), pad, h - pad + 14);
  ctx.fillText(entries[entries.length - 1].date.slice(5), w - pad - 30, h - pad + 14);
}

// ===================== Meal list rendering (shared by dashboard/diary) =====================
const MEAL_ORDER = ["早餐", "午餐", "晚餐", "點心"];

function renderMealList(containerId, date, editable) {
  const container = document.getElementById(containerId);
  const day = state.diary[date];
  if (!day || day.entries.length === 0) {
    container.innerHTML = `<div class="empty-state">尚無紀錄</div>`;
    return;
  }
  let html = "";
  MEAL_ORDER.forEach(meal => {
    const items = day.entries.filter(e => e.meal === meal);
    if (items.length === 0) return;
    const mealCal = items.reduce((s, e) => s + e.cal, 0);
    html += `<div class="meal-group-title">${meal} · ${Math.round(mealCal)} kcal</div>`;
    items.forEach(e => {
      html += `
        <div class="diary-item">
          <div>
            <div class="item-name">${e.name}</div>
            <div class="item-meta">${e.amountLabel} · P${round1(e.protein)}g C${round1(e.carb)}g F${round1(e.fat)}g</div>
          </div>
          <div style="display:flex;align-items:center;gap:10px;">
            <div class="item-cal">${Math.round(e.cal)} kcal</div>
            ${editable ? `<button class="remove-btn" data-remove="${e.id}" title="刪除">✕</button>` : ""}
          </div>
        </div>`;
    });
  });
  container.innerHTML = html;

  if (editable) {
    container.querySelectorAll("[data-remove]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.remove;
        day.entries = day.entries.filter(e => e.id !== id);
        saveState();
        renderDiary();
      });
    });
  }
}

// ===================== Diary Panel =====================
let diaryDate = todayStr();

function populateQuickAddItems() {
  const type = document.getElementById("quickAddType").value;
  const sel = document.getElementById("quickAddItem");
  sel.innerHTML = "";
  if (type === "food") {
    state.foods.slice().sort((a,b)=>a.name.localeCompare(b.name,'zh-Hant')).forEach(f => {
      const opt = document.createElement("option");
      opt.value = f.id; opt.textContent = `${f.name} (${f.cal}kcal/100g)`;
      sel.appendChild(opt);
    });
    document.getElementById("quickAddAmount").placeholder = "克數 (g)";
  } else {
    state.recipes.forEach(r => {
      const opt = document.createElement("option");
      const per = recipePerServing(r);
      opt.value = r.id; opt.textContent = `${r.name} (${Math.round(per.cal)}kcal/份)`;
      sel.appendChild(opt);
    });
    document.getElementById("quickAddAmount").placeholder = "份數";
  }
}

function renderDiary() {
  document.getElementById("diaryDate").value = diaryDate;
  renderMealList("diaryMeals", diaryDate, true);
  populateQuickAddItems();
}

function handleQuickAdd() {
  const type = document.getElementById("quickAddType").value;
  const meal = document.getElementById("quickAddMeal").value;
  const itemId = document.getElementById("quickAddItem").value;
  const amount = parseFloat(document.getElementById("quickAddAmount").value);

  if (!itemId) { showToast("請先建立食物或食譜"); return; }
  if (!amount || amount <= 0) { showToast("請輸入有效數量"); return; }

  const day = ensureDiaryDate(diaryDate);
  let entry;
  if (type === "food") {
    const food = getFoodById(itemId);
    const n = nutritionForFoodGrams(food, amount);
    entry = { id: uid(), meal, type, refId: itemId, name: food.name, amountLabel: `${amount} g`, ...n };
  } else {
    const recipe = getRecipeById(itemId);
    const per = recipePerServing(recipe);
    entry = {
      id: uid(), meal, type, refId: itemId, name: recipe.name,
      amountLabel: `${amount} 份`,
      cal: per.cal * amount, protein: per.protein * amount, carb: per.carb * amount, fat: per.fat * amount,
    };
  }
  day.entries.push(entry);
  saveState();
  document.getElementById("quickAddAmount").value = "";
  renderDiary();
  showToast("已加入紀錄");
}

// ===================== Foods Panel =====================
let foodCategoryFilter = "全部";
let foodSearchTerm = "";

const CATEGORIES = ["全部", "蛋白質", "全穀根莖", "蔬菜", "水果", "乳製品", "油脂", "其他"];

function renderCategoryFilter() {
  const el = document.getElementById("categoryFilter");
  el.innerHTML = CATEGORIES.map(c =>
    `<button class="cat-chip ${c === foodCategoryFilter ? "active" : ""}" data-cat="${c}">${c}</button>`
  ).join("");
  el.querySelectorAll(".cat-chip").forEach(btn => {
    btn.addEventListener("click", () => {
      foodCategoryFilter = btn.dataset.cat;
      renderFoods();
    });
  });
}

function renderFoods() {
  renderCategoryFilter();
  const tbody = document.getElementById("foodTableBody");
  let list = state.foods.slice();
  if (foodCategoryFilter !== "全部") list = list.filter(f => f.category === foodCategoryFilter);
  if (foodSearchTerm) list = list.filter(f => f.name.toLowerCase().includes(foodSearchTerm.toLowerCase()));
  list.sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">找不到符合的食物</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(f => `
    <tr>
      <td>${f.name}</td>
      <td>${f.category}</td>
      <td>${f.cal}</td>
      <td>${f.protein}</td>
      <td>${f.carb}</td>
      <td>${f.fat}</td>
      <td>
        <button class="table-btn edit" data-edit="${f.id}">編輯</button>
        <button class="table-btn del" data-del="${f.id}">刪除</button>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll("[data-edit]").forEach(btn => {
    btn.addEventListener("click", () => startEditFood(btn.dataset.edit));
  });
  tbody.querySelectorAll("[data-del]").forEach(btn => {
    btn.addEventListener("click", () => deleteFood(btn.dataset.del));
  });
}

function startEditFood(id) {
  const f = getFoodById(id);
  if (!f) return;
  document.getElementById("foodEditId").value = f.id;
  document.getElementById("foodName").value = f.name;
  document.getElementById("foodCategory").value = f.category;
  document.getElementById("foodCal").value = f.cal;
  document.getElementById("foodProtein").value = f.protein;
  document.getElementById("foodCarb").value = f.carb;
  document.getElementById("foodFat").value = f.fat;
  document.getElementById("foodFormTitle").textContent = "編輯食物";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetFoodForm() {
  document.getElementById("foodForm").reset();
  document.getElementById("foodEditId").value = "";
  document.getElementById("foodFormTitle").innerHTML = `新增自訂食物 <span class="hint">(以每 100 公克為基準)</span>`;
}

function deleteFood(id) {
  const usedInRecipe = state.recipes.some(r => r.ingredients.some(i => i.foodId === id));
  if (usedInRecipe) {
    if (!confirm("此食物已被用在某個食譜中，刪除後該食譜的相關食材會失效。確定要刪除嗎？")) return;
  } else {
    if (!confirm("確定要刪除這項食物嗎？")) return;
  }
  state.foods = state.foods.filter(f => f.id !== id);
  state.recipes.forEach(r => { r.ingredients = r.ingredients.filter(i => i.foodId !== id); });
  saveState();
  renderFoods();
  showToast("已刪除食物");
}

function handleFoodFormSubmit(e) {
  e.preventDefault();
  const id = document.getElementById("foodEditId").value;
  const data = {
    name: document.getElementById("foodName").value.trim(),
    category: document.getElementById("foodCategory").value,
    cal: parseFloat(document.getElementById("foodCal").value) || 0,
    protein: parseFloat(document.getElementById("foodProtein").value) || 0,
    carb: parseFloat(document.getElementById("foodCarb").value) || 0,
    fat: parseFloat(document.getElementById("foodFat").value) || 0,
  };
  if (!data.name) { showToast("請輸入食物名稱"); return; }

  if (id) {
    const f = getFoodById(id);
    Object.assign(f, data);
    showToast("已更新食物");
  } else {
    state.foods.push({ id: uid(), ...data });
    showToast("已新增食物");
  }
  saveState();
  resetFoodForm();
  renderFoods();
}

// ===================== Recipes Panel =====================
let editingRecipe = null; // { id, name, servings, ingredients: [{foodId, grams}] } or null while creating

function renderRecipes() {
  const list = document.getElementById("recipeList");
  if (state.recipes.length === 0) {
    list.innerHTML = `<div class="empty-state">尚未建立任何食譜，點擊上方「+ 新增食譜」開始建立。</div>`;
    return;
  }
  list.innerHTML = state.recipes.map(r => {
    const per = recipePerServing(r);
    return `
      <div class="card recipe-card">
        <div class="recipe-title">${r.name}</div>
        <div class="recipe-meta">共 ${r.servings} 份 · 每份 ${Math.round(per.cal)} kcal · P${round1(per.protein)}g C${round1(per.carb)}g F${round1(per.fat)}g</div>
        <div class="recipe-meta">食材：${r.ingredients.map(i => getFoodById(i.foodId)?.name || "(已刪除)").join("、") || "無"}</div>
        <div class="recipe-actions">
          <button class="btn secondary" data-editrecipe="${r.id}">編輯</button>
          <button class="btn danger" data-delrecipe="${r.id}">刪除</button>
        </div>
      </div>
    `;
  }).join("");

  list.querySelectorAll("[data-editrecipe]").forEach(btn => {
    btn.addEventListener("click", () => openRecipeEditor(getRecipeById(btn.dataset.editrecipe)));
  });
  list.querySelectorAll("[data-delrecipe]").forEach(btn => {
    btn.addEventListener("click", () => {
      if (!confirm("確定要刪除此食譜嗎？")) return;
      state.recipes = state.recipes.filter(r => r.id !== btn.dataset.delrecipe);
      saveState();
      renderRecipes();
      showToast("已刪除食譜");
    });
  });
}

function openRecipeEditor(recipe) {
  editingRecipe = recipe
    ? JSON.parse(JSON.stringify(recipe))
    : { id: null, name: "", servings: 1, ingredients: [] };

  document.getElementById("recipeEditorCard").style.display = "block";
  document.getElementById("recipeEditorTitle").textContent = recipe ? "編輯食譜" : "新增食譜";
  document.getElementById("recipeEditId").value = editingRecipe.id || "";
  document.getElementById("recipeName").value = editingRecipe.name;
  document.getElementById("recipeServings").value = editingRecipe.servings;

  const sel = document.getElementById("recipeIngredientSelect");
  sel.innerHTML = state.foods.slice().sort((a,b)=>a.name.localeCompare(b.name,'zh-Hant')).map(f =>
    `<option value="${f.id}">${f.name}</option>`
  ).join("");

  renderRecipeIngredientTable();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function closeRecipeEditor() {
  editingRecipe = null;
  document.getElementById("recipeEditorCard").style.display = "none";
}

function renderRecipeIngredientTable() {
  const tbody = document.getElementById("recipeIngredientBody");
  if (!editingRecipe.ingredients.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">尚未加入食材</td></tr>`;
  } else {
    tbody.innerHTML = editingRecipe.ingredients.map((ing, idx) => {
      const food = getFoodById(ing.foodId);
      if (!food) return "";
      const n = nutritionForFoodGrams(food, ing.grams);
      return `
        <tr>
          <td>${food.name}</td>
          <td>${ing.grams} g</td>
          <td>${Math.round(n.cal)}</td>
          <td>${round1(n.protein)}</td>
          <td>${round1(n.carb)}</td>
          <td>${round1(n.fat)}</td>
          <td><button class="table-btn del" data-rmidx="${idx}">移除</button></td>
        </tr>
      `;
    }).join("");
  }
  tbody.querySelectorAll("[data-rmidx]").forEach(btn => {
    btn.addEventListener("click", () => {
      editingRecipe.ingredients.splice(parseInt(btn.dataset.rmidx), 1);
      renderRecipeIngredientTable();
    });
  });

  const totals = recipeTotals(editingRecipe);
  const servings = Math.max(1, parseInt(document.getElementById("recipeServings").value) || 1);
  document.getElementById("recipeTotals").innerHTML = `
    <div><span class="label">總熱量</span>${Math.round(totals.cal)} kcal</div>
    <div><span class="label">每份熱量</span>${Math.round(totals.cal / servings)} kcal</div>
    <div><span class="label">總蛋白質</span>${round1(totals.protein)} g</div>
    <div><span class="label">總碳水</span>${round1(totals.carb)} g</div>
    <div><span class="label">總脂肪</span>${round1(totals.fat)} g</div>
  `;
}

function handleAddIngredient() {
  const foodId = document.getElementById("recipeIngredientSelect").value;
  const grams = parseFloat(document.getElementById("recipeIngredientAmount").value);
  if (!foodId) { showToast("請選擇食材"); return; }
  if (!grams || grams <= 0) { showToast("請輸入有效克數"); return; }
  editingRecipe.ingredients.push({ foodId, grams });
  document.getElementById("recipeIngredientAmount").value = "";
  renderRecipeIngredientTable();
}

function handleSaveRecipe() {
  const name = document.getElementById("recipeName").value.trim();
  const servings = Math.max(1, parseInt(document.getElementById("recipeServings").value) || 1);
  if (!name) { showToast("請輸入食譜名稱"); return; }
  if (editingRecipe.ingredients.length === 0) { showToast("請至少加入一項食材"); return; }

  editingRecipe.name = name;
  editingRecipe.servings = servings;

  if (editingRecipe.id) {
    const idx = state.recipes.findIndex(r => r.id === editingRecipe.id);
    state.recipes[idx] = editingRecipe;
  } else {
    editingRecipe.id = uid();
    state.recipes.push(editingRecipe);
  }
  saveState();
  closeRecipeEditor();
  renderRecipes();
  showToast("食譜已儲存");
}

// ===================== Profile Panel =====================
function renderProfile() {
  const p = state.profile;
  if (p) {
    document.getElementById("pGender").value = p.gender;
    document.getElementById("pAge").value = p.age;
    document.getElementById("pHeight").value = p.heightCm;
    document.getElementById("pWeight").value = p.weightKg;
    document.getElementById("pBodyFat").value = p.bodyFatPct != null ? p.bodyFatPct : "";
    document.getElementById("pActivity").value = p.activity;
    document.getElementById("pGoal").value = p.goal;
    document.getElementById("pAdjust").value = p.adjust;
    document.getElementById("pAdjustVal").textContent = `${p.adjust} kcal`;
    document.getElementById("pProteinRatio").value = p.proteinRatio;
    document.getElementById("pProteinVal").textContent = `${p.proteinRatio} g/kg`;

    const targets = computeProfileTargets(p);
    const lbm = leanBodyMass(p);
    document.getElementById("profileResultCard").style.display = "block";
    document.getElementById("profileResults").innerHTML = `
      <div class="result-item"><div class="r-label">BMR 基礎代謝</div><div class="r-value">${targets.bmr}</div></div>
      <div class="result-item"><div class="r-label">TDEE 消耗總量</div><div class="r-value">${targets.tdee}</div></div>
      <div class="result-item"><div class="r-label">建議攝取熱量</div><div class="r-value">${targets.targetCal}</div></div>
      <div class="result-item"><div class="r-label">蛋白質目標</div><div class="r-value">${targets.protein}g</div></div>
      <div class="result-item"><div class="r-label">碳水目標</div><div class="r-value">${targets.carb}g</div></div>
      <div class="result-item"><div class="r-label">脂肪目標</div><div class="r-value">${targets.fat}g</div></div>
      ${lbm ? `<div class="result-item"><div class="r-label">去脂體重 (LBM)</div><div class="r-value">${round1(lbm)}kg</div></div>` : ""}
    `;
  }
  syncRecommendations();
}

// ===================== Profile Recommendations =====================
function readProfileDraft() {
  const bodyFatRaw = parseFloat(document.getElementById("pBodyFat").value);
  return {
    gender: document.getElementById("pGender").value,
    age: parseFloat(document.getElementById("pAge").value) || 0,
    heightCm: parseFloat(document.getElementById("pHeight").value) || 0,
    weightKg: parseFloat(document.getElementById("pWeight").value) || 0,
    bodyFatPct: isNaN(bodyFatRaw) ? null : bodyFatRaw,
    activity: parseFloat(document.getElementById("pActivity").value),
    goal: document.getElementById("pGoal").value,
  };
}

function syncRecommendations() {
  const draft = readProfileDraft();
  const adjustHint = document.getElementById("pAdjustHint");
  const proteinHint = document.getElementById("pProteinHint");

  if (!draft.age || !draft.heightCm || !draft.weightKg) {
    adjustHint.textContent = "請先填寫年齡/身高/體重以取得建議值";
    proteinHint.textContent = "請先填寫年齡/身高/體重以取得建議值";
    return null;
  }

  const bmr = computeBMR(draft);
  const tdee = bmr * draft.activity;
  const recAdjust = computeRecommendedAdjust(tdee, draft.goal);
  const recProtein = computeRecommendedProteinRatio(draft);

  const goalLabel = { bulk: "增肌", cut: "減脂", maintain: "維持" }[draft.goal];
  adjustHint.textContent = draft.goal === "maintain"
    ? "維持體態以 TDEE 為目標，不需額外調整熱量"
    : `依你的 TDEE (約 ${Math.round(tdee)} kcal) 建議${goalLabel}${draft.goal === "bulk" ? "盈餘" : "赤字"} ${recAdjust} kcal`;

  const lbm = leanBodyMass(draft);
  proteinHint.textContent = lbm
    ? `依去脂體重 ${round1(lbm)}kg（體重${draft.weightKg}kg、體脂${draft.bodyFatPct}%）與${goalLabel}目標，建議約 ${recProtein} g/kg（換算全身總重）`
    : `依總體重 ${draft.weightKg}kg、年齡 ${draft.age} 歲與${goalLabel}目標概估約 ${recProtein} g/kg，填寫體脂率可更精準`;

  return { recAdjust, recProtein };
}

function applyRecommendations() {
  const rec = syncRecommendations();
  if (!rec) { showToast("請先填寫年齡/身高/體重"); return; }
  document.getElementById("pAdjust").value = rec.recAdjust;
  document.getElementById("pAdjustVal").textContent = `${rec.recAdjust} kcal`;
  document.getElementById("pProteinRatio").value = rec.recProtein;
  document.getElementById("pProteinVal").textContent = `${rec.recProtein} g/kg`;
}

function handleProfileSubmit(e) {
  e.preventDefault();
  const profile = {
    gender: document.getElementById("pGender").value,
    age: parseInt(document.getElementById("pAge").value),
    heightCm: parseFloat(document.getElementById("pHeight").value),
    weightKg: parseFloat(document.getElementById("pWeight").value),
    bodyFatPct: document.getElementById("pBodyFat").value ? parseFloat(document.getElementById("pBodyFat").value) : null,
    activity: parseFloat(document.getElementById("pActivity").value),
    goal: document.getElementById("pGoal").value,
    adjust: parseInt(document.getElementById("pAdjust").value),
    proteinRatio: parseFloat(document.getElementById("pProteinRatio").value),
  };
  state.profile = profile;

  // also log today's weight if not present
  const day = ensureDiaryDate(todayStr());
  if (day.weight == null) day.weight = profile.weightKg;

  saveState();
  renderProfile();
  showToast("已儲存個人資料並計算目標");
}

// ===================== Import / Export / Reset =====================
function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `diet-data-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed.foods || !parsed.diary) throw new Error("格式錯誤");
      state = parsed;
      saveState();
      showToast("匯入成功");
      switchTab("dashboard");
    } catch (err) {
      showToast("匯入失敗：檔案格式不正確");
    }
  };
  reader.readAsText(file);
}

function resetAllData() {
  if (!confirm("此動作將清除所有食物、食譜與飲食紀錄，且無法復原，確定要繼續嗎？")) return;
  localStorage.removeItem(STORAGE_KEY);
  state = loadState();
  showToast("已清除所有資料");
  switchTab("dashboard");
}

// ===================== Theme =====================
function initTheme() {
  const saved = localStorage.getItem("theme") || "light";
  document.documentElement.setAttribute("data-theme", saved);
  document.getElementById("themeToggle").textContent = saved === "dark" ? "☀️" : "🌙";
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "light";
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("theme", next);
  document.getElementById("themeToggle").textContent = next === "dark" ? "☀️" : "🌙";
  // redraw charts with new theme colors
  if (document.getElementById("panel-dashboard").classList.contains("active")) renderDashboard();
}

// ===================== Init / Event wiring =====================
document.addEventListener("DOMContentLoaded", () => {
  initTheme();

  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
  document.getElementById("themeToggle").addEventListener("click", toggleTheme);

  // Dashboard
  document.getElementById("dashDate").value = dashDate;
  document.getElementById("dashDate").addEventListener("change", e => {
    dashDate = e.target.value || todayStr();
    renderDashboard();
  });
  document.getElementById("weightInput").addEventListener("change", e => {
    const val = parseFloat(e.target.value);
    const day = ensureDiaryDate(dashDate);
    day.weight = isNaN(val) ? null : val;
    saveState();
    renderDashboard();
  });

  // Diary
  document.getElementById("diaryDate").value = diaryDate;
  document.getElementById("diaryDate").addEventListener("change", e => {
    diaryDate = e.target.value || todayStr();
    renderDiary();
  });
  document.getElementById("quickAddType").addEventListener("change", populateQuickAddItems);
  document.getElementById("quickAddBtn").addEventListener("click", handleQuickAdd);

  // Foods
  document.getElementById("foodForm").addEventListener("submit", handleFoodFormSubmit);
  document.getElementById("foodFormCancel").addEventListener("click", resetFoodForm);
  document.getElementById("foodSearch").addEventListener("input", e => {
    foodSearchTerm = e.target.value;
    renderFoods();
  });

  // Recipes
  document.getElementById("newRecipeBtn").addEventListener("click", () => openRecipeEditor(null));
  document.getElementById("addIngredientBtn").addEventListener("click", handleAddIngredient);
  document.getElementById("recipeServings").addEventListener("input", renderRecipeIngredientTable);
  document.getElementById("saveRecipeBtn").addEventListener("click", handleSaveRecipe);
  document.getElementById("cancelRecipeBtn").addEventListener("click", closeRecipeEditor);

  // Profile
  document.getElementById("profileForm").addEventListener("submit", handleProfileSubmit);
  document.getElementById("pAdjust").addEventListener("input", e => {
    document.getElementById("pAdjustVal").textContent = `${e.target.value} kcal`;
  });
  document.getElementById("pProteinRatio").addEventListener("input", e => {
    document.getElementById("pProteinVal").textContent = `${e.target.value} g/kg`;
  });
  document.getElementById("useRecommendedBtn").addEventListener("click", applyRecommendations);

  ["pAge", "pHeight", "pWeight", "pBodyFat"].forEach(id => {
    document.getElementById(id).addEventListener("input", syncRecommendations);
    document.getElementById(id).addEventListener("change", applyRecommendations);
  });
  ["pGender", "pActivity", "pGoal"].forEach(id => {
    document.getElementById(id).addEventListener("change", applyRecommendations);
  });

  // Data management
  document.getElementById("exportDataBtn").addEventListener("click", exportData);
  document.getElementById("importDataBtn").addEventListener("click", () => document.getElementById("importDataInput").click());
  document.getElementById("importDataInput").addEventListener("change", e => {
    if (e.target.files[0]) importData(e.target.files[0]);
  });
  document.getElementById("resetDataBtn").addEventListener("click", resetAllData);

  saveState();
  renderDashboard();
});
