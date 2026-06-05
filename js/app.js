let manifest, questions = [], current = 0, answers = {}, checked = {}, mode = "instant", currentSession = null;
const $ = id => document.getElementById(id);
const labels = ["ア","イ","ウ","エ","オ","カ","キ","ク","ケ","コ"];
const labelOf = i => labels[i] || String(i + 1);
const STORE_KEY = "alvixiaShindanshiLearning.v1";

function cleanDisplayText(s){
  return String(s ?? "").replace(/[\s\u3000]+[0-9０-９]+[\s\u3000]*$/g, "").trim();
}

function defaultStore(){ return { questions:{}, sessions:[], activeSession:null }; }
function loadStore(){
  try { return { ...defaultStore(), ...(JSON.parse(localStorage.getItem(STORE_KEY) || "{}")) }; }
  catch { return defaultStore(); }
}
function saveStore(store){ localStorage.setItem(STORE_KEY, JSON.stringify(store)); }
function qStat(id){ return loadStore().questions[id] || {}; }
function isCorrect(q, value){ return q.allCorrect || value === q.answer; }

async function init(){
  manifest = await fetch(`data/manifest.json?v=${Date.now()}`).then(r => r.json());
  manifest.years.forEach(y => $("yearSelect").add(new Option(y.name, y.id)));
  fillSubjects();

  $("yearSelect").addEventListener("change", fillSubjects);
  $("startBtn").onclick = () => start(false);
  $("resumeBtn").onclick = resumeSession;
  $("weaknessBtn").onclick = showWeakness;
  $("clearHistoryBtn").onclick = clearHistory;
  $("answerBtn").onclick = answer;
  $("prevBtn").onclick = prev;
  $("nextBtn").onclick = next;
  $("finishBtn").onclick = finish;
  $("reviewBtn").onclick = toggleReview;
  $("backBtn").onclick = backSetup;
  $("retryBtn").onclick = () => start(false);
  $("resultBackBtn").onclick = backSetup;
  refreshLearningStats();
}

function fillSubjects(){
  const year = manifest.years.find(y => y.id === $("yearSelect").value) || manifest.years[0];
  $("subjectSelect").innerHTML = "";
  $("subjectSelect").add(new Option("全科目", "all"));
  year.subjects.forEach(s => $("subjectSelect").add(new Option(s.name, s.id)));
}

async function loadQuestions(yearId, subjectId){
  const year = manifest.years.find(y => y.id === yearId);
  const targets = subjectId === "all" ? year.subjects : year.subjects.filter(s => s.id === subjectId);
  const loaded = [];
  for (const s of targets) {
    const arr = await fetch(`data/${yearId}/${s.id}.json?v=${Date.now()}`).then(r => r.json()).catch(() => []);
    loaded.push(...arr.filter(q => q.included !== false));
  }
  return loaded;
}

async function start(fromResume){
  const yearId = $("yearSelect").value;
  const subjectId = $("subjectSelect").value;
  const practice = $("practiceSelect").value;
  mode = $("modeSelect").value;
  questions = await loadQuestions(yearId, subjectId);
  current = 0; answers = {}; checked = {};

  if (practice === "wrong") questions = questions.filter(q => (qStat(q.id).wrong || 0) > 0 && qStat(q.id).lastCorrect !== true);
  if (practice === "review") questions = questions.filter(q => qStat(q.id).review === true);

  if (!questions.length) {
    alert(practice === "all" ? "この年度・科目はまだ問題データが未投入です。" : "対象になる問題がまだありません。");
    return;
  }

  currentSession = { yearId, subjectId, practice, mode, questionIds: questions.map(q => q.id), current, answers, checked, updatedAt: Date.now() };
  saveActiveSession();
  showQuiz();
  render();
}

async function resumeSession(){
  const saved = loadStore().activeSession;
  if (!saved) return;
  mode = saved.mode || "instant";
  const loaded = await loadQuestions(saved.yearId, saved.subjectId);
  const byId = Object.fromEntries(loaded.map(q => [q.id, q]));
  questions = (saved.questionIds || []).map(id => byId[id]).filter(Boolean);
  if (!questions.length) { alert("再開できる問題が見つかりませんでした。"); return; }
  current = Math.min(saved.current || 0, questions.length - 1);
  answers = saved.answers || {};
  checked = saved.checked || {};
  currentSession = saved;
  $("yearSelect").value = saved.yearId;
  fillSubjects();
  $("subjectSelect").value = saved.subjectId;
  $("modeSelect").value = mode;
  $("practiceSelect").value = saved.practice || "all";
  showQuiz();
  render();
}

function showQuiz(){
  $("setup").classList.add("hidden");
  $("result").classList.add("hidden");
  $("quiz").classList.remove("hidden");
}

function render(){
  const q = questions[current];
  const stat = qStat(q.id);
  $("progressText").textContent = `${current + 1} / ${questions.length}`;
  $("scoreText").textContent = `回答済み ${Object.keys(answers).length}問`;
  $("qTitle").textContent = `${q.year || ""}｜${q.subject || ""}｜${q.no || ""}`;
  $("qStatus").textContent = statusText(q, stat);
  $("reviewBtn").textContent = stat.review ? "要復習を解除" : "要復習に追加";
  $("reviewBtn").classList.toggle("active", !!stat.review);
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
  saveActiveSession();
}

function statusText(q, stat){
  const parts = [];
  if (stat.attempts) parts.push(`履歴 ${stat.correct || 0}/${stat.attempts}回正解`);
  if (stat.wrong) parts.push(`間違い ${stat.wrong}回`);
  if (stat.review) parts.push("要復習");
  return parts.join("｜");
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
  if (!images.length) { box.innerHTML = ""; box.classList.add("hidden"); return; }
  box.classList.remove("hidden");
  box.innerHTML = images.map((src, i) => `<figure><img src="${escapeHtml(src)}" alt="${escapeHtml((q.no || "問題") + " 図表 " + (i + 1))}" loading="lazy"></figure>`).join("");
}

function selected(){
  const el = document.querySelector('input[name="choice"]:checked');
  return el ? Number(el.value) : null;
}

function saveCurrentSelection(){
  const q = questions[current];
  const v = selected();
  if (v !== null) answers[q.id] = v;
  saveActiveSession();
  return v;
}

function answer(){
  const q = questions[current];
  const v = selected();
  if (v === null) { alert("選択肢を選んでください。"); return; }
  answers[q.id] = v;
  checked[q.id] = true;
  recordAnswer(q, v);
  showFeedback(q);
  updateButtons();
  refreshLearningStats();
  saveActiveSession();
}

function recordAnswer(q, value){
  const store = loadStore();
  const ok = isCorrect(q, value);
  const prev = store.questions[q.id] || {};
  store.questions[q.id] = {
    ...prev,
    id: q.id,
    year: q.year,
    subject: q.subject,
    subjectId: q.subjectId,
    no: q.no,
    answer: q.answer,
    lastAnswer: value,
    lastCorrect: ok,
    attempts: (prev.attempts || 0) + 1,
    correct: (prev.correct || 0) + (ok ? 1 : 0),
    wrong: (prev.wrong || 0) + (ok ? 0 : 1),
    lastAt: Date.now()
  };
  saveStore(store);
}

function toggleReview(){
  const q = questions[current];
  const store = loadStore();
  const prev = store.questions[q.id] || {};
  store.questions[q.id] = { ...prev, id: q.id, year: q.year, subject: q.subject, subjectId: q.subjectId, no: q.no, review: !prev.review, updatedAt: Date.now() };
  saveStore(store);
  render();
  refreshLearningStats();
}

function updateButtons(){
  const q = questions[current];
  const isLast = current >= questions.length - 1;
  const isChecked = !!checked[q.id];
  ["prevBtn","answerBtn","nextBtn","finishBtn"].forEach(id => $(id).classList.add("hidden"));
  if (current > 0) $("prevBtn").classList.remove("hidden");
  if (mode === "instant") {
    if (!isChecked) {
      $("answerBtn").classList.remove("hidden");
      (isLast ? $("finishBtn") : $("nextBtn")).classList.remove("hidden");
    } else {
      (isLast ? $("finishBtn") : $("nextBtn")).classList.remove("hidden");
    }
  } else {
    (isLast ? $("finishBtn") : $("nextBtn")).classList.remove("hidden");
  }
}

function showFeedback(q){
  const ok = isCorrect(q, answers[q.id]);
  const ex = q.explanation || {};
  const reasons = (ex.choiceReasons || []).map((r, i) => `<li><strong>${labelOf(i)}：</strong>${formatText(stripLeadingChoiceLabel(r))}</li>`).join("");
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
    <details><summary>実務補足</summary><p class="explanation-detail">${formatText(ex.practicalNote || "")}</p></details>`;
  $("feedback").classList.remove("hidden");
}

function prev(){ saveCurrentSelection(); if (current > 0) { current--; render(); } }
function next(){ saveCurrentSelection(); if (current < questions.length - 1) { current++; render(); } }

function finish(){
  saveCurrentSelection();
  if (mode === "batch" && Object.keys(answers).length < questions.length) {
    if (!confirm("未回答があります。このまま採点しますか？")) return;
  }
  if (mode === "batch") questions.forEach(q => { if (answers[q.id] !== undefined && !checked[q.id]) { checked[q.id] = true; recordAnswer(q, answers[q.id]); } });
  const store = loadStore();
  store.sessions.unshift({ at: Date.now(), count: questions.length, answered: Object.keys(answers).length, yearId: currentSession?.yearId, subjectId: currentSession?.subjectId });
  store.sessions = store.sessions.slice(0, 20);
  store.activeSession = null;
  saveStore(store);

  $("quiz").classList.add("hidden");
  $("result").classList.remove("hidden");
  const total = questions.reduce((s, q) => s + (q.points || 0), 0);
  const got = questions.reduce((s, q) => s + ((q.allCorrect || answers[q.id] === q.answer) ? (q.points || 0) : 0), 0);
  $("resultSummary").innerHTML = `<p><strong>総合点：${got} / ${total}点</strong></p>${weaknessHtml(questions)}`;

  const bySubject = {};
  questions.forEach(q => {
    bySubject[q.subject] ??= { got: 0, total: 0, count: 0 };
    bySubject[q.subject].total += q.points || 0;
    bySubject[q.subject].got += (q.allCorrect || answers[q.id] === q.answer) ? (q.points || 0) : 0;
    bySubject[q.subject].count++;
  });
  let html = "<h3>科目別</h3>";
  for (const [subject, v] of Object.entries(bySubject)) html += `<p><span class="badge">${escapeHtml(subject)}</span>${v.got}/${v.total}点（${v.count}問）</p>`;
  html += "<h3>解答一覧</h3>";
  questions.forEach((q, i) => {
    const ok = q.allCorrect || answers[q.id] === q.answer;
    html += `<div class="result-card"><h4>${i + 1}. ${escapeHtml(q.subject || "")} ${escapeHtml(q.no || "")}：${ok ? "○" : "×"} 正解 ${q.allCorrect ? "全員正解" : labelOf(q.answer)}</h4><p class="explanation-summary">${formatText((q.explanation || {}).summary || "")}</p></div>`;
  });
  $("resultDetails").innerHTML = html;
  currentSession = null;
  refreshLearningStats();
}

function backSetup(){
  saveCurrentSelection();
  $("quiz").classList.add("hidden");
  $("result").classList.add("hidden");
  $("setup").classList.remove("hidden");
  refreshLearningStats();
}

function saveActiveSession(){
  if (!currentSession || !questions.length) return;
  const store = loadStore();
  currentSession = { ...currentSession, current, answers, checked, updatedAt: Date.now() };
  store.activeSession = currentSession;
  saveStore(store);
}

function refreshLearningStats(){
  const store = loadStore();
  const rows = Object.values(store.questions);
  $("resumeBtn").classList.toggle("hidden", !store.activeSession);
  if (!rows.length) { $("learningStats").innerHTML = `<p class="note">学習履歴はまだありません。</p>`; return; }
  const attempts = rows.reduce((s, r) => s + (r.attempts || 0), 0);
  const correct = rows.reduce((s, r) => s + (r.correct || 0), 0);
  const wrongNow = rows.filter(r => r.wrong > 0 && r.lastCorrect !== true).length;
  const review = rows.filter(r => r.review).length;
  $("learningStats").innerHTML = `<div class="stat-grid"><div><strong>${attempts}</strong><span>解答数</span></div><div><strong>${attempts ? Math.round(correct / attempts * 100) : 0}%</strong><span>正答率</span></div><div><strong>${wrongNow}</strong><span>間違い復習</span></div><div><strong>${review}</strong><span>要復習</span></div></div>${weaknessHtml()}`;
}

function weaknessHtml(scopeQuestions){
  const store = loadStore();
  const rows = scopeQuestions ? scopeQuestions.map(q => ({...store.questions[q.id], subject: q.subject })).filter(r => r.id) : Object.values(store.questions);
  const by = {};
  rows.forEach(r => {
    const key = r.subject || "未分類";
    by[key] ??= { attempts:0, correct:0, wrong:0, review:0 };
    by[key].attempts += r.attempts || 0;
    by[key].correct += r.correct || 0;
    by[key].wrong += r.wrong || 0;
    by[key].review += r.review ? 1 : 0;
  });
  const list = Object.entries(by).filter(([,v]) => v.attempts).sort((a,b) => (b[1].wrong / b[1].attempts) - (a[1].wrong / a[1].attempts)).slice(0, 5);
  if (!list.length) return `<p class="note">弱点分析は解答後に表示されます。</p>`;
  return `<div class="weakness"><h3>弱点分析</h3>${list.map(([subject,v]) => `<p><span class="badge">${escapeHtml(subject)}</span>正答率 ${Math.round(v.correct / v.attempts * 100)}%｜誤答 ${v.wrong}回｜要復習 ${v.review}問</p>`).join("")}</div>`;
}

function showWeakness(){
  $("resultSummary").innerHTML = weaknessHtml();
  $("resultDetails").innerHTML = "";
  $("setup").classList.add("hidden");
  $("quiz").classList.add("hidden");
  $("result").classList.remove("hidden");
}

function clearHistory(){
  if (!confirm("学習履歴・途中再開・要復習をすべて消去しますか？")) return;
  localStorage.removeItem(STORE_KEY);
  refreshLearningStats();
}

function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m])); }
function formatText(s){ return escapeHtml(s).replace(/\n/g, "<br>"); }
function stripLeadingChoiceLabel(s){ return String(s ?? "").replace(/^\s*\d+\s*[\.．、)]\s*/g, "").replace(/^\s*[アイウエオカキクケコ]\s*[:：]\s*/g, "").trim(); }
function renderFormulaBlocks(ex){
  if (!ex) return "";
  const blocks = [];
  if (ex.mainFormula1) blocks.push(`<details open><summary>主要公式①</summary><p class="explanation-detail">${formatText(ex.mainFormula1)}</p></details>`);
  if (ex.mainFormula2) blocks.push(`<details open><summary>主要公式②</summary><p class="explanation-detail">${formatText(ex.mainFormula2)}</p></details>`);
  if (ex.formulaExample) blocks.push(`<details open><summary>具体例</summary><p class="explanation-detail">${formatText(ex.formulaExample)}</p></details>`);
  return blocks.join("");
}

init();