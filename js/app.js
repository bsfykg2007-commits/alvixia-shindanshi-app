let manifest, questions = [], current = 0, answers = {}, checked = {}, mode = "instant";
const $ = id => document.getElementById(id);
const labels = ["ア","イ","ウ","エ","オ","カ","キ"];
const labelOf = i => labels[i] || String(i + 1);

function cleanDisplayText(s){
  return String(s ?? "")
    .replace(/[\s\u3000]+[0-9０-９]+[\s\u3000]*$/g, "")
    .trim();
}

async function init(){
  manifest = await fetch(`data/manifest.json?v=${Date.now()}`).then(r => r.json());
  manifest.years.forEach(y => $("yearSelect").add(new Option(y.name, y.id)));
  fillSubjects();

  $("yearSelect").addEventListener("change", fillSubjects);
  $("startBtn").onclick = start;
  $("answerBtn").onclick = answer;
  $("prevBtn").onclick = prev;
  $("nextBtn").onclick = next;
  $("finishBtn").onclick = finish;
  $("backBtn").onclick = backSetup;
  $("retryBtn").onclick = start;
}

function fillSubjects(){
  const year = manifest.years.find(y => y.id === $("yearSelect").value) || manifest.years[0];
  $("subjectSelect").innerHTML = "";
  $("subjectSelect").add(new Option("全科目", "all"));
  year.subjects.forEach(s => $("subjectSelect").add(new Option(s.name, s.id)));
}

async function start(){
  const yearId = $("yearSelect").value;
  const subjectId = $("subjectSelect").value;
  mode = $("modeSelect").value;
  questions = [];
  current = 0;
  answers = {};
  checked = {};

  const year = manifest.years.find(y => y.id === yearId);
  const targets = subjectId === "all" ? year.subjects : year.subjects.filter(s => s.id === subjectId);

  for (const s of targets) {
    const arr = await fetch(`data/${yearId}/${s.id}.json?v=${Date.now()}`).then(r => r.json()).catch(() => []);
    questions.push(...arr.filter(q => q.included !== false));
  }

  if (!questions.length) {
    alert("この年度・科目はまだ問題データが未投入です。");
    return;
  }

  $("setup").classList.add("hidden");
  $("result").classList.add("hidden");
  $("quiz").classList.remove("hidden");
  render();
}

function render(){
  const q = questions[current];

  $("progressText").textContent = `${current + 1} / ${questions.length}`;
  $("scoreText").textContent = `回答済み ${Object.keys(answers).length}問`;
  $("qTitle").textContent = `${q.year || ""}｜${q.subject || ""}｜${q.no || ""}`;
  $("qText").textContent = cleanDisplayText(q.question || "");
  renderQuestionImages(q);

  const form = $("choices");
  form.innerHTML = "";
  (q.choices || []).forEach((choice, i) => {
    const lab = document.createElement("label");
    lab.className = "choice";
    lab.innerHTML = `<input type="radio" name="choice" value="${i}" ${answers[q.id] === i ? "checked" : ""}> <strong>${labelOf(i)}</strong>　${escapeHtml(cleanDisplayText(choice))}`;
    form.appendChild(lab);
  });

  $("feedback").classList.add("hidden");
  $("feedback").innerHTML = "";

  if (checked[q.id]) showFeedback(q);
  updateButtons();
}

function renderQuestionImages(q){
  let box = $("qImages");
  if (!box) {
    box = document.createElement("div");
    box.id = "qImages";
    box.className = "question-images";
    $("qText").insertAdjacentElement("afterend", box);
  }

  const images = q.images || [];
  if (!images.length) {
    box.innerHTML = "";
    box.classList.add("hidden");
    return;
  }

  box.classList.remove("hidden");
  box.innerHTML = images.map((src, i) => `
    <figure>
      <img src="${escapeHtml(src)}" alt="${escapeHtml((q.no || "問題") + " 図表 " + (i + 1))}" loading="lazy">
    </figure>
  `).join("");
}

function selected(){
  const el = document.querySelector('input[name="choice"]:checked');
  return el ? Number(el.value) : null;
}

function saveCurrentSelection(){
  const q = questions[current];
  const v = selected();
  if (v !== null) answers[q.id] = v;
  return v;
}

function answer(){
  const q = questions[current];
  const v = selected();

  if (v === null) {
    alert("選択肢を選んでください。");
    return;
  }

  answers[q.id] = v;
  checked[q.id] = true;
  showFeedback(q);
  updateButtons();
}

function updateButtons(){
  const q = questions[current];
  const isLast = current >= questions.length - 1;
  const isChecked = !!checked[q.id];

  $("prevBtn").classList.add("hidden");
  $("answerBtn").classList.add("hidden");
  $("nextBtn").classList.add("hidden");
  $("finishBtn").classList.add("hidden");

  if (current > 0) $("prevBtn").classList.remove("hidden");

  if (mode === "instant") {
    if (!isChecked) {
      $("answerBtn").classList.remove("hidden");
      if (!isLast) {
        $("nextBtn").classList.remove("hidden");
      } else {
        $("finishBtn").classList.remove("hidden");
      }
    } else if (isLast) {
      $("finishBtn").classList.remove("hidden");
    } else {
      $("nextBtn").classList.remove("hidden");
    }
  } else {
    if (isLast) {
      $("finishBtn").classList.remove("hidden");
    } else {
      $("nextBtn").classList.remove("hidden");
    }
  }
}

function showFeedback(q){
  const ok = q.allCorrect || answers[q.id] === q.answer;
  const ex = q.explanation || {};
  const reasons = (ex.choiceReasons || []).map((r, i) =>
    `<li><strong>${labelOf(i)}：</strong>${formatText(stripLeadingChoiceLabel(r))}</li>`
  ).join("");

  $("feedback").className = `feedback ${ok ? "correct" : "wrong"}`;
  $("feedback").innerHTML = `
    <h3>${ok ? "正解" : "不正解"}</h3>
    <p><strong>正解：${q.allCorrect ? "全員正解" : labelOf(q.answer)}（${q.points || 0}点）</strong></p>
    <p class="explanation-summary">${formatText(ex.summary || "")}</p>
    ${ex.whyCorrect ? `<p class="explanation-detail"><strong>なぜ正解か：</strong><br>${formatText(ex.whyCorrect)}</p>` : ""}
    ${ex.whyOthersWrong ? `<p class="explanation-detail"><strong>他の選択肢が誤りの理由：</strong><br>${formatText(ex.whyOthersWrong)}</p>` : ""}
    ${renderFormulaBlocks(ex)}
    <details open><summary>選択肢ごとの理由</summary><ol>${reasons}</ol></details>
    <details><summary>試験のポイント</summary><p class="explanation-detail">${formatText(ex.examPointV7 || ex.examPoint || "")}</p></details>
    <details><summary>実務補足</summary><p class="explanation-detail">${formatText(ex.practicalNote || "")}</p></details>
  `;
  $("feedback").classList.remove("hidden");
}

function prev(){
  saveCurrentSelection();
  if (current > 0) {
    current--;
    render();
  }
}

function next(){
  saveCurrentSelection();
  if (current < questions.length - 1) {
    current++;
    render();
  }
}

function finish(){
  saveCurrentSelection();

  if (mode === "batch" && Object.keys(answers).length < questions.length) {
    if (!confirm("未回答があります。このまま採点しますか？")) return;
  }

  $("quiz").classList.add("hidden");
  $("result").classList.remove("hidden");

  const total = questions.reduce((s, q) => s + (q.points || 0), 0);
  const got = questions.reduce((s, q) => s + ((q.allCorrect || answers[q.id] === q.answer) ? (q.points || 0) : 0), 0);

  $("resultSummary").innerHTML = `<p><strong>総合点：${got} / ${total}点</strong></p>`;

  const bySubject = {};
  questions.forEach(q => {
    bySubject[q.subject] ??= { got: 0, total: 0, count: 0 };
    bySubject[q.subject].total += q.points || 0;
    bySubject[q.subject].got += (q.allCorrect || answers[q.id] === q.answer) ? (q.points || 0) : 0;
    bySubject[q.subject].count++;
  });

  let html = "<h3>科目別</h3>";
  for (const [subject, v] of Object.entries(bySubject)) {
    html += `<p><span class="badge">${escapeHtml(subject)}</span>${v.got}/${v.total}点（${v.count}問）</p>`;
  }

  html += "<h3>解答一覧</h3>";
  questions.forEach((q, i) => {
    const ok = q.allCorrect || answers[q.id] === q.answer;
    html += `<div class="result-card"><h4>${i + 1}. ${escapeHtml(q.subject || "")} ${escapeHtml(q.no || "")}：${ok ? "○" : "×"} 正解 ${q.allCorrect ? "全員正解" : labelOf(q.answer)}</h4><p class="explanation-summary">${formatText((q.explanation || {}).summary || "")}</p></div>`;
  });

  $("resultDetails").innerHTML = html;
}

function backSetup(){
  $("quiz").classList.add("hidden");
  $("setup").classList.remove("hidden");
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[m]));
}

function formatText(s){
  return escapeHtml(s).replace(/\n/g, "<br>");
}

function stripLeadingChoiceLabel(s){
  return String(s ?? "")
    .replace(/^\s*\d+\s*[\.．、)]\s*/g, "")
    .replace(/^\s*[アイウエオカキクケコ]\s*[:：]\s*/g, "")
    .trim();
}

function renderFormulaBlocks(ex){
  if (!ex) return "";
  const blocks = [];

  if (ex.mainFormula1) {
    blocks.push(`<details open><summary>主要公式①</summary><p class="explanation-detail">${formatText(ex.mainFormula1)}</p></details>`);
  }

  if (ex.mainFormula2) {
    blocks.push(`<details open><summary>主要公式②</summary><p class="explanation-detail">${formatText(ex.mainFormula2)}</p></details>`);
  }

  if (ex.formulaExample) {
    blocks.push(`<details open><summary>具体例</summary><p class="explanation-detail">${formatText(ex.formulaExample)}</p></details>`);
  }

  return blocks.join("");
}

init();
