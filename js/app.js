let manifest, questions = [], current = 0, answers = {}, checked = {}, mode = "instant", currentSession = null;
const $ = id => document.getElementById(id);
const labels = ["ア","イ","ウ","エ","オ","カ","キ","ク","ケ","コ"];
const labelOf = i => labels[i] || String(i + 1);
const STORE_KEY = "alvixiaShindanshiLearning.v1";
const GITHUB_REPO = "https://github.com/bsfykg2007-commits/alvixia-shindanshi-app";
const SECONDARY_STORE_KEY = "alvixiaShindanshiSecondAnswers.v1";
const SECONDARY_SCORE_KEY = "alvixiaShindanshiSecondScores.v1";
const AI_PROMPT_STORE_KEY = "alvixiaShindanshiAiPrompts.v1";
const SEO_BASE_URL = "https://alvixia.jp/shindanshi/";
const SEO_IMAGE_URL = `${SEO_BASE_URL}assets/icons/shindanshi-kakomon-icon-512.png`;
const SEO_TOP = {
  title: "中小企業診断士過去問アプリ｜一次試験7科目対応・無料学習サイト",
  description: "中小企業診断士一次試験対策向けの無料過去問学習サイトです。企業経営理論、財務会計、運営管理、経済学・経済政策、経営情報システム、経営法務、中小企業経営・政策の7科目に対応。スマホ学習にも対応しています。"
};
const SEO_SUBJECTS = {
  kigyou: "企業経営理論",
  zaimu: "財務会計",
  unei: "運営管理",
  keizai: "経済学・経済政策",
  jouhou: "経営情報システム",
  houmu: "経営法務",
  chusho: "中小企業経営・政策"
};
let secondaryData = null;
let currentUser = null;
let authMode = "login";
let passwordResetToken = "";
const secondarySyncTimers = new Map();

function cleanDisplayText(s){
  return String(s ?? "").replace(/[\s\u3000]+[0-9０-９]+[\s\u3000]*$/g, "").trim();
}

function defaultStore(){ return { questions:{}, attempts:[], sessions:[], activeSession:null }; }
function loadStore(){
  try {
    const store = { ...defaultStore(), ...(JSON.parse(localStorage.getItem(STORE_KEY) || "{}")) };
    Object.values(store.questions || {}).forEach(row => {
      row.topic = inferTopic(row);
    });
    return store;
  }
  catch { return defaultStore(); }
}
function saveStore(store){ localStorage.setItem(STORE_KEY, JSON.stringify(store)); }
function qStat(id){ return loadStore().questions[id] || {}; }
function isCorrect(q, value){ return q.allCorrect || value === q.answer; }

async function init(){
  manifest = await fetch(`data/manifest.json?v=${Date.now()}`).then(r => r.json());
  manifest.years.forEach(y => $("yearSelect").add(new Option(y.name, y.id)));
  fillSubjects();

  $("openPrimaryBtn").onclick = () => showMode("primary");
  $("openSecondaryBtn").onclick = () => showMode("secondary");
  $("primaryHomeBtn").onclick = () => showMode("home");
  $("secondaryHomeBtn").onclick = () => showMode("home");
  $("yearSelect").addEventListener("change", fillSubjects);
  $("subjectSelect").addEventListener("change", updateSeoMeta);
  $("startBtn").onclick = () => start(false);
  $("resumeBtn").onclick = resumeSession;
  $("weaknessBtn").onclick = showWeakness;
  $("clearHistoryBtn").onclick = clearHistory;
  $("answerBtn").onclick = answer;
  $("prevBtn").onclick = prev;
  $("nextBtn").onclick = next;
  $("finishBtn").onclick = finish;
  $("reviewBtn").onclick = toggleReview;
  $("bookmarkBtn").onclick = toggleBookmark;
  $("proposeBtn").onclick = showProposalForm;
  $("submitProposalBtn").onclick = submitProposal;
  $("copyProposalBtn").onclick = copyProposal;
  $("cancelProposalBtn").onclick = hideProposalForm;
  $("backBtn").onclick = backSetup;
  $("retryBtn").onclick = () => start(false);
  $("resultBackBtn").onclick = backSetup;
  $("showLoginBtn").onclick = () => setAuthMode("login");
  $("showRegisterBtn").onclick = () => setAuthMode("register");
  $("authForm").addEventListener("submit", submitAuth);
  $("forgotPasswordBtn").onclick = () => setAuthMode("resetRequest");
  $("resetRequestForm").addEventListener("submit", submitResetRequest);
  $("resetRequestCancelBtn").onclick = () => setAuthMode("login");
  $("resetPasswordForm").addEventListener("submit", submitResetPassword);
  $("logoutBtn").onclick = logout;
  $("openHistoryBtn").onclick = showHistory;
  $("closeHistoryBtn").onclick = () => $("historyView").classList.add("hidden");
  refreshLearningStats();
  await initSecondaryExam();
  await refreshAuth();
  initPasswordResetFromUrl();
}

function showMode(mode){
  $("home").classList.toggle("hidden", mode !== "home");
  $("primaryApp").classList.toggle("hidden", mode !== "primary");
  $("secondaryApp").classList.toggle("hidden", mode !== "secondary");
  if (mode === "primary") {
    $("setup").classList.remove("hidden");
    $("quiz").classList.add("hidden");
    $("result").classList.add("hidden");
    $("proposal").classList.add("hidden");
  }
}

function fillSubjects(){
  const year = manifest.years.find(y => y.id === $("yearSelect").value) || manifest.years[0];
  $("subjectSelect").innerHTML = "";
  $("subjectSelect").add(new Option("全科目", "all"));
  year.subjects.forEach(s => $("subjectSelect").add(new Option(s.name, s.id)));
  updateSeoMeta();
}

function updateSeoMeta(){
  const subjectName = SEO_SUBJECTS[$("subjectSelect")?.value];
  const title = subjectName
    ? `中小企業診断士 ${subjectName} 過去問・解説｜無料学習サイト`
    : SEO_TOP.title;
  const description = subjectName
    ? `中小企業診断士一次試験「${subjectName}」の過去問と解説を無料で学習できます。正解だけでなく、各選択肢がなぜ正しいか・誤りかを確認しながら学習できます。`
    : SEO_TOP.description;
  document.title = title;
  setMeta("name", "description", description);
  setMeta("property", "og:title", title);
  setMeta("property", "og:description", description);
  setMeta("property", "og:image", SEO_IMAGE_URL);
  setMeta("property", "og:url", SEO_BASE_URL);
  setMeta("property", "og:type", "website");
  setMeta("property", "og:site_name", "中小企業診断士過去問アプリ");
  setMeta("name", "twitter:card", "summary_large_image");
  setMeta("name", "twitter:title", title);
  setMeta("name", "twitter:description", description);
  setMeta("name", "twitter:image", SEO_IMAGE_URL);
  setLink("canonical", SEO_BASE_URL);
}

function setMeta(attr, key, content){
  let tag = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute(attr, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
}

function setLink(rel, href){
  let tag = document.head.querySelector(`link[rel="${rel}"]`);
  if (!tag) {
    tag = document.createElement("link");
    tag.setAttribute("rel", rel);
    document.head.appendChild(tag);
  }
  tag.setAttribute("href", href);
}

async function loadQuestions(yearId, subjectId){
  const year = manifest.years.find(y => y.id === yearId);
  const targets = subjectId === "all" ? year.subjects : year.subjects.filter(s => s.id === subjectId);
  const loaded = [];
  for (const s of targets) {
    const arr = await fetch(`data/${yearId}/${s.id}.json?v=${Date.now()}`).then(r => r.json()).catch(() => []);
    loaded.push(...arr.filter(q => q.included !== false).map(q => ({ ...q, topic: inferTopic(q) })));
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
  if (practice === "bookmark") questions = questions.filter(q => qStat(q.id).bookmark === true);
  if (practice === "random") questions = shuffle(questions);

  if (!questions.length) {
    alert(practice === "all" ? "この年度・科目はまだ問題データが未投入です。" : "対象になる問題がまだありません。");
    return;
  }

  currentSession = { id: createClientId(), yearId, subjectId, practice, mode, questionIds: questions.map(q => q.id), current, answers, checked, startedAt: Date.now(), updatedAt: Date.now() };
  saveActiveSession();
  saveSessionProgress(questions.length === 1 ? "completed" : "active");
  showQuiz();
  render();
}

function shuffle(items){
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
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
  saveSessionProgress(current >= questions.length - 1 ? "completed" : "active");
}

function showQuiz(){
  $("setup").classList.add("hidden");
  $("result").classList.add("hidden");
  $("proposal").classList.add("hidden");
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
  $("bookmarkBtn").textContent = stat.bookmark ? "ブックマーク解除" : "ブックマーク";
  $("bookmarkBtn").classList.toggle("active", !!stat.bookmark);
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
  if (stat.bookmark) parts.push("ブックマーク");
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
  saveSessionProgress(current >= questions.length - 1 ? "completed" : "active");
}

function recordAnswer(q, value){
  const store = loadStore();
  const ok = isCorrect(q, value);
  const attempt = {
    id: createClientId(),
    ...questionPayload(q),
    selectedAnswer: value,
    correctAnswer: q.answer,
    isCorrect: ok,
    points: Number(q.points || 0),
    answeredAt: Date.now()
  };
  const prev = store.questions[q.id] || {};
  store.questions[q.id] = {
    ...prev,
    id: q.id,
    year: q.year,
    subject: q.subject,
    subjectId: q.subjectId,
    topic: inferTopic(q),
    no: q.no,
    answer: q.answer,
    lastAnswer: value,
    lastCorrect: ok,
    attempts: (prev.attempts || 0) + 1,
    correct: (prev.correct || 0) + (ok ? 1 : 0),
    wrong: (prev.wrong || 0) + (ok ? 0 : 1),
    lastAt: Date.now()
  };
  store.attempts.unshift(attempt);
  store.attempts = store.attempts.slice(0, 5000);
  saveStore(store);
  apiPost("save.php", {
    type: "answer",
    attemptId: attempt.id,
    ...attempt
  });
}

function toggleReview(){
  const q = questions[current];
  const store = loadStore();
  const prev = store.questions[q.id] || {};
  store.questions[q.id] = { ...prev, id: q.id, year: q.year, subject: q.subject, subjectId: q.subjectId, topic: inferTopic(q), no: q.no, review: !prev.review, updatedAt: Date.now() };
  saveStore(store);
  saveQuestionState(q, store.questions[q.id]);
  render();
  refreshLearningStats();
}

function toggleBookmark(){
  const q = questions[current];
  const store = loadStore();
  const prev = store.questions[q.id] || {};
  store.questions[q.id] = { ...prev, id: q.id, year: q.year, subject: q.subject, subjectId: q.subjectId, topic: inferTopic(q), no: q.no, bookmark: !prev.bookmark, updatedAt: Date.now() };
  saveStore(store);
  saveQuestionState(q, store.questions[q.id]);
  render();
  refreshLearningStats();
}

function saveQuestionState(q, stat){
  apiPost("save.php", {
    type: "question_state",
    ...questionPayload(q),
    needsReview: !!stat.review,
    bookmarked: !!stat.bookmark
  });
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
  $("feedback").className = `feedback ${ok ? "correct" : "wrong"}`;
  $("feedback").innerHTML = `
    <h3>${ok ? "正解" : "不正解"}</h3>
    <p><strong>正解：${q.allCorrect ? "全員正解" : labelOf(q.answer)}（${q.points || 0}点）</strong></p>
    ${renderExplanationDetails(ex)}`;
  $("feedback").classList.remove("hidden");
}

function showProposalForm(){
  const q = questions[current];
  if (!q) return;
  saveCurrentSelection();
  $("quiz").classList.add("hidden");
  $("setup").classList.add("hidden");
  $("result").classList.add("hidden");
  $("proposal").classList.remove("hidden");

  const answerOptions = (q.choices || [])
    .map((choice, i) => `<option value="${i}" ${q.answer === i ? "selected" : ""}>${labelOf(i)}：${escapeHtml(cleanDisplayText(choice)).slice(0, 80)}</option>`)
    .join("");
  $("proposedAnswer").innerHTML = answerOptions || `<option value="${q.answer || 0}">${labelOf(q.answer || 0)}</option>`;
  $("proposalReadonly").innerHTML = `
    <dl class="proposal-readonly">
      <div><dt>年度</dt><dd>${escapeHtml(q.year || "")}</dd></div>
      <div><dt>科目</dt><dd>${escapeHtml(q.subject || "")}</dd></div>
      <div><dt>問題番号</dt><dd>${escapeHtml(q.no || "")}</dd></div>
      <div><dt>現在の解答</dt><dd>${q.allCorrect ? "全員正解" : labelOf(q.answer)}</dd></div>
    </dl>
    <h3>問題文（表示のみ）</h3>
    <pre class="readonly-block">${escapeHtml(cleanDisplayText(q.question || ""))}</pre>
    <h3>選択肢（表示のみ）</h3>
    <ol class="readonly-choices">${(q.choices || []).map((choice, i) => `<li><strong>${labelOf(i)}</strong> ${escapeHtml(cleanDisplayText(choice))}</li>`).join("")}</ol>`;
  const currentExplanation = proposalExplanationText(q.explanation || {});
  $("currentExplanation").value = currentExplanation;
  $("proposedExplanation").value = currentExplanation;
  $("proposalReason").value = "";
  $("proposalOutput").classList.add("hidden");
  $("proposalOutput").textContent = "";
}

function hideProposalForm(){
  $("proposal").classList.add("hidden");
  $("quiz").classList.remove("hidden");
}

function proposalExplanationText(ex){
  return [
    ex.summary ? `解説概要:\n${ex.summary}` : "",
    ex.keywordExplanation ? `用語・前提:\n${ex.keywordExplanation}` : "",
    Array.isArray(ex.choiceReasons) ? `選択肢ごとの理由:\n${ex.choiceReasons.join("\n")}` : "",
    ex.examPointV7 || ex.examPoint ? `試験のポイント:\n${ex.examPointV7 || ex.examPoint}` : "",
    ex.practicalNote ? `実務補足:\n${ex.practicalNote}` : ""
  ].filter(Boolean).join("\n\n");
}

function buildProposalMarkdown(){
  const q = questions[current];
  const proposedAnswer = Number($("proposedAnswer").value);
  const proposedExplanation = $("proposedExplanation").value.trim();
  const reason = $("proposalReason").value.trim();
  return `## 解答・解説修正提案

### 対象
- year: ${q.year || ""}
- subject: ${q.subject || ""}
- no: ${q.no || ""}

### 変更可能項目
- 現在の解答: ${q.allCorrect ? "全員正解" : labelOf(q.answer)}
- 修正後の解答: ${labelOf(proposedAnswer)}
- 解説: 下記の内容へ修正

### 修正後の解説
\`\`\`
${proposedExplanation}
\`\`\`

### 修正理由
${reason || "未入力"}

### 変更不可項目
question / choices / year / subject は変更しないでください。`;
}

function submitProposal(){
  const body = buildProposalMarkdown();
  $("proposalOutput").textContent = body;
  $("proposalOutput").classList.remove("hidden");
  const q = questions[current];
  const title = encodeURIComponent(`解答・解説修正提案: ${q.no || ""}`);
  const url = `${GITHUB_REPO}/issues/new?title=${title}&body=${encodeURIComponent(body)}`;
  window.open(url, "_blank", "noopener");
}

async function copyProposal(){
  const body = buildProposalMarkdown();
  $("proposalOutput").textContent = body;
  $("proposalOutput").classList.remove("hidden");
  try {
    await navigator.clipboard.writeText(body);
    alert("提案内容をコピーしました。GitHubのPR本文に貼り付けてください。");
  } catch {
    alert("コピーできませんでした。下の提案内容を選択してコピーしてください。");
  }
}

function prev(){
  saveCurrentSelection();
  saveSessionProgress(current >= questions.length - 1 ? "completed" : "active");
  if (current > 0) { current--; render(); }
}
function next(){
  saveCurrentSelection();
  if (current < questions.length - 1) {
    current++;
    render();
    saveSessionProgress(current >= questions.length - 1 ? "completed" : "active");
  }
}

function finish(){
  saveCurrentSelection();
  if (mode === "batch" && Object.keys(answers).length < questions.length) {
    if (!confirm("未回答があります。このまま採点しますか？")) return;
  }
  if (mode === "batch") questions.forEach(q => { if (answers[q.id] !== undefined && !checked[q.id]) { checked[q.id] = true; recordAnswer(q, answers[q.id]); } });
  const store = loadStore();
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
    html += `<div class="result-card"><h4>${i + 1}. ${escapeHtml(q.subject || "")} ${escapeHtml(q.no || "")}：${ok ? "○" : "×"} 正解 ${q.allCorrect ? "全員正解" : labelOf(q.answer)}</h4>${renderExplanationDetails(q.explanation || {})}</div>`;
  });
  $("resultDetails").innerHTML = html;
  saveSessionProgress("completed", { totalPoints: total, earnedPoints: got, finishedAt: Date.now() });
  currentSession = null;
  refreshLearningStats();
}

function backSetup(){
  saveCurrentSelection();
  saveSessionProgress("completed", { finishedAt: Date.now() });
  $("quiz").classList.add("hidden");
  $("result").classList.add("hidden");
  $("proposal").classList.add("hidden");
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

function sessionSnapshot(status, extra = {}){
  if (!currentSession || !questions.length) return null;
  const answeredQuestions = questions.filter(q => answers[q.id] !== undefined);
  const correctCount = answeredQuestions.filter(q => isCorrect(q, answers[q.id])).length;
  const totalPoints = questions.reduce((sum, q) => sum + Number(q.points || 0), 0);
  const earnedPoints = answeredQuestions.reduce((sum, q) => sum + (isCorrect(q, answers[q.id]) ? Number(q.points || 0) : 0), 0);
  const topics = [...new Set(questions.map(inferTopic).filter(Boolean))];
  return {
    id: currentSession.id,
    clientSessionId: currentSession.id,
    yearId: currentSession.yearId || "",
    subjectId: currentSession.subjectId || "",
    subjectName: currentSession.subjectId === "all" ? "全科目" : (questions[0]?.subject || ""),
    topic: topics.length === 1 ? topics[0] : "複数分野",
    practice: currentSession.practice || "",
    mode: currentSession.mode || mode,
    status,
    questionCount: questions.length,
    answeredCount: answeredQuestions.length,
    correctCount,
    accuracy: answeredQuestions.length ? Math.round(correctCount * 1000 / answeredQuestions.length) / 10 : 0,
    totalPoints,
    earnedPoints,
    startedAt: currentSession.startedAt || Date.now(),
    updatedAt: Date.now(),
    finishedAt: status === "completed" ? (extra.finishedAt || Date.now()) : null,
    ...extra
  };
}

function saveSessionProgress(status, extra = {}){
  const row = sessionSnapshot(status, extra);
  if (!row) return;
  const store = loadStore();
  const index = store.sessions.findIndex(item => item.id === row.id || item.clientSessionId === row.clientSessionId);
  if (index >= 0) store.sessions[index] = { ...store.sessions[index], ...row };
  else store.sessions.unshift(row);
  store.sessions = store.sessions.slice(0, 100);
  saveStore(store);
  apiPost("save.php", { type: "session", ...row });
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
  const bookmarks = rows.filter(r => r.bookmark).length;
  $("learningStats").innerHTML = `<div class="stat-grid"><div><strong>${attempts}</strong><span>解答数</span></div><div><strong>${attempts ? Math.round(correct / attempts * 100) : 0}%</strong><span>正答率</span></div><div><strong>${wrongNow}</strong><span>間違い復習</span></div><div><strong>${review}</strong><span>要復習</span></div><div><strong>${bookmarks}</strong><span>ブックマーク</span></div></div>${accuracyHtml("subject")}${accuracyHtml("year")}${accuracyHtml("topic")}${weaknessHtml()}`;
}

function accuracyHtml(kind){
  const rows = Object.values(loadStore().questions).filter(r => r.attempts);
  const by = {};
  rows.forEach(r => {
    const key = kind === "year" ? (r.year || "年度未設定") : kind === "topic" ? inferTopic(r) : (r.subject || "未分類");
    by[key] ??= { attempts: 0, correct: 0 };
    by[key].attempts += r.attempts || 0;
    by[key].correct += r.correct || 0;
  });
  const entries = Object.entries(by).sort((a, b) => String(a[0]).localeCompare(String(b[0]), "ja"));
  if (!entries.length) return "";
  const title = kind === "year" ? "年度別正答率" : kind === "topic" ? "分野別正答率" : "科目別正答率";
  return `<div class="weakness"><h3>${title}</h3>${entries.map(([key, v]) => `<p><span class="badge">${escapeHtml(key)}</span>${Math.round(v.correct / v.attempts * 100)}%（${v.correct}/${v.attempts}回）</p>`).join("")}</div>`;
}

function weaknessHtml(scopeQuestions){
  const store = loadStore();
  const rows = scopeQuestions ? scopeQuestions.map(q => ({...store.questions[q.id], subject: q.subject, year: q.year })).filter(r => r.id) : Object.values(store.questions);
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
  if (currentUser) apiPost("clear.php", {});
  refreshLearningStats();
}

function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m])); }
function formatText(s){ return escapeHtml(s).replace(/\n/g, "<br>"); }
function stripLeadingChoiceLabel(s){ return String(s ?? "").replace(/^\s*\d+\s*[\.．、)]\s*/g, "").replace(/^\s*[アイウエオカキクケコ]\s*[:：]\s*/g, "").trim(); }
function renderDetailBlock(title, html){
  if (!String(html || "").trim()) return "";
  return `<details class="explanation-fold"><summary>${escapeHtml(title)}</summary><div class="explanation-detail">${html}</div></details>`;
}
function renderChoiceReasons(ex){
  const reasons = Array.isArray(ex.choiceReasons) ? ex.choiceReasons : [];
  const items = reasons
    .map((r, i) => `<div class="choice-reason"><strong>${labelOf(i)}：</strong>${formatText(stripLeadingChoiceLabel(r))}</div>`)
    .join("");
  return renderDetailBlock("選択肢ごとの理由", items);
}
function renderExplanationDetails(ex){
  if (!ex) return "";
  return `<div class="explanation-details">
    ${renderDetailBlock("解説概要", formatText(ex.summary || ""))}
    ${renderFormulaBlocks(ex)}
    ${renderChoiceReasons(ex)}
    ${renderDetailBlock("試験のポイント", formatText(ex.examPointV7 || ex.examPoint || ""))}
    ${renderDetailBlock("実務補足", formatText(ex.practicalNote || ""))}
  </div>`;
}
function renderFormulaBlocks(ex){
  if (!ex) return "";
  const blocks = [];
  if (ex.mainFormula1) blocks.push(renderDetailBlock("主要公式①", formatText(ex.mainFormula1)));
  if (ex.mainFormula2) blocks.push(renderDetailBlock("主要公式②", formatText(ex.mainFormula2)));
  if (ex.formulaExample) blocks.push(renderDetailBlock("具体例", formatText(ex.formulaExample)));
  return blocks.join("");
}

async function initSecondaryExam(){
  secondaryData = await fetch(`data/secondary-sample.json?v=${Date.now()}`).then(r => r.json()).catch(() => null);
  if (!secondaryData) return;
  const years = [...new Map(secondaryData.cases.map(c => [c.year, c])).values()];
  $("secondYearSelect").innerHTML = years.map(c => `<option value="${escapeHtml(c.year)}">${escapeHtml(c.yearLabel)}</option>`).join("");
  $("secondYearSelect").addEventListener("change", fillSecondCases);
  $("secondCaseSelect").addEventListener("change", fillSecondQuestions);
  $("secondQuestionSelect").addEventListener("change", renderSecondQuestion);
  fillSecondCases();
}

function fillSecondCases(){
  const year = $("secondYearSelect").value;
  const cases = secondaryData.cases.filter(c => c.year === year);
  $("secondCaseSelect").innerHTML = cases.map(c => `<option value="${escapeHtml(c.caseId)}">${escapeHtml(c.caseLabel)}</option>`).join("");
  fillSecondQuestions();
}

function fillSecondQuestions(){
  const data = currentSecondCase();
  $("secondQuestionSelect").innerHTML = (data?.questions || []).map(q => {
    const limitText = q.limit ? `・${q.limit}字以内` : "";
    return `<option value="${escapeHtml(q.id)}">${escapeHtml(q.title)}（${Number(q.points || 0)}点${limitText}）</option>`;
  }).join("");
  renderSecondQuestion();
}

function currentSecondCase(){
  if (!secondaryData) return null;
  return secondaryData.cases.find(c => c.year === $("secondYearSelect").value && c.caseId === $("secondCaseSelect").value) || secondaryData.cases[0];
}

function currentSecondQuestion(){
  const data = currentSecondCase();
  return data?.questions.find(q => q.id === $("secondQuestionSelect").value) || data?.questions[0];
}

function renderSecondQuestion(){
  const data = currentSecondCase();
  const q = currentSecondQuestion();
  if (!data || !q) return;
  $("secondHeader").innerHTML = `<p><span class="badge">${escapeHtml(data.yearLabel)}</span><span class="badge">${escapeHtml(data.caseLabel)}</span></p>`;
  $("secondSource").innerHTML = data.purposeUrl ? `<a href="${escapeHtml(data.purposeUrl)}" target="_blank" rel="noopener">公式の出題の趣旨</a>` : "";
  $("secondBackground").textContent = data.background;
  const slots = getSecondAnswerSlots(q);
  const answerFields = slots.map(slot => {
    const saved = loadSecondAnswer(data.year, data.caseId, q.id, slot.id);
    const limitText = slot.limit ? `（${slot.limit}字以内）` : "（字数制限なし）";
    const pointsText = slot.points ? `・配点${slot.points}点` : "";
    const maxlength = slot.limit ? ` maxlength="${slot.limit}"` : "";
    return `
      <div class="answer-slot">
        <label for="secondAnswer-${escapeHtml(slot.id)}">${escapeHtml(slot.label)}${limitText}${pointsText}</label>
        ${slot.question ? `<p class="slot-question">${formatText(slot.question)}</p>` : ""}
        <textarea id="secondAnswer-${escapeHtml(slot.id)}" data-answer-slot="${escapeHtml(slot.id)}"${maxlength} placeholder="${escapeHtml(slot.label)}の答案を入力してください">${escapeHtml(saved.text || "")}</textarea>
        <div class="answer-meta">
          <span id="secondCount-${escapeHtml(slot.id)}"></span>
          <span id="secondWarning-${escapeHtml(slot.id)}" class="warn"></span>
          <span id="secondSaved-${escapeHtml(slot.id)}">${saved.updatedAt ? `保存済み：${new Date(saved.updatedAt).toLocaleString("ja-JP")}` : "未保存"}</span>
        </div>
      </div>`;
  }).join("");
  const savedScore = loadSecondScore(data.year, data.caseId, q.id);
  $("secondQuestionArea").innerHTML = `
    <article class="answer-box">
      <h3>${escapeHtml(q.title)}（配点${Number(q.points || 0)}点${q.limit ? `・${q.limit}字以内` : ""}）</h3>
      <p class="question-text">${formatText(q.question)}</p>
      <div class="answer-slots">${answerFields}</div>
      <div class="self-score-box">
        <h4>セルフ採点</h4>
        <div class="self-score-grid">
          <label>得点（${Number(q.points || 0)}点満点）<input id="secondSelfScore" type="number" min="0" max="${Number(q.points || 0)}" step="0.5" value="${escapeHtml(savedScore.score ?? "")}"></label>
          <label>振り返りメモ<textarea id="secondSelfNote" placeholder="良かった点、改善点、次回の注意点">${escapeHtml(savedScore.note || "")}</textarea></label>
        </div>
        <button id="saveSecondScoreBtn" type="button" class="secondary">セルフ採点を保存</button>
        <span id="secondScoreStatus" class="note">${savedScore.updatedAt ? `保存済み：${new Date(savedScore.updatedAt).toLocaleString("ja-JP")}` : ""}</span>
      </div>
      <div class="actions">
        <button id="chatgptReviewBtn" type="button" class="primary">ChatGPTで添削</button>
        <button id="geminiReviewBtn" type="button" class="secondary">Geminiで添削</button>
        <button id="claudeReviewBtn" type="button" class="secondary">Claudeで添削</button>
        <button id="copySecondPromptBtn" type="button" class="ghost">プロンプトをコピー</button>
      </div>
      <p id="secondAiStatus" class="note" aria-live="polite"></p>
    </article>`;
  slots.forEach(slot => {
    $(`secondAnswer-${slot.id}`).addEventListener("input", () => updateSecondAnswer(slot.id));
  });
  $("chatgptReviewBtn").onclick = () => openAiReview("chatgpt");
  $("geminiReviewBtn").onclick = () => openAiReview("gemini");
  $("claudeReviewBtn").onclick = () => openAiReview("claude");
  $("copySecondPromptBtn").onclick = copySecondPrompt;
  $("saveSecondScoreBtn").onclick = saveCurrentSecondScore;
  slots.forEach(slot => updateSecondAnswer(slot.id, false));
}

function getSecondAnswerSlots(q){
  const configured = Array.isArray(q.answerSlots) && q.answerSlots.length
    ? q.answerSlots
    : [{ id: "main", label: "答案", limit: q.limit, points: q.points }];
  const usedIds = new Map();
  return configured.map((slot, index) => ({
    id: (() => {
      const baseId = String(slot.id || `slot${index + 1}`).replace(/[^A-Za-z0-9_-]/g, "") || `slot${index + 1}`;
      const count = (usedIds.get(baseId) || 0) + 1;
      usedIds.set(baseId, count);
      return count === 1 ? baseId : `${baseId}_${count}`;
    })(),
    label: slot.label || `答案${index + 1}`,
    limit: Number(Object.prototype.hasOwnProperty.call(slot, "limit") ? slot.limit : q.limit) || null,
    points: Number(slot.points || 0) || null,
    question: slot.question || ""
  }));
}

function updateSecondAnswer(slotId, persist = true){
  const data = currentSecondCase();
  const q = currentSecondQuestion();
  const slot = getSecondAnswerSlots(q).find(item => item.id === slotId);
  if (!slot) return;
  const text = $(`secondAnswer-${slot.id}`).value;
  const count = Array.from(text).length;
  $(`secondCount-${slot.id}`).textContent = slot.limit ? `${count} / ${slot.limit}字` : `${count}字`;
  $(`secondWarning-${slot.id}`).textContent = slot.limit && count > 0 && count < Math.ceil(slot.limit * 0.6) ? "字数が少なめです" : "";
  if (persist) {
    saveSecondAnswer(data.year, data.caseId, q.id, slot.id, text);
    $(`secondSaved-${slot.id}`).textContent = `保存済み：${new Date().toLocaleString("ja-JP")}`;
  }
}

function secondStore(){
  try { return JSON.parse(localStorage.getItem(SECONDARY_STORE_KEY) || "{}"); }
  catch { return {}; }
}

function secondKey(year, caseId, questionId, slotId = "main"){
  return `${year}:${caseId}:${questionId}:${slotId}`;
}

function loadSecondAnswer(year, caseId, questionId, slotId = "main"){
  const store = secondStore();
  return store[secondKey(year, caseId, questionId, slotId)] || (slotId === "main" ? store[`${year}:${caseId}:${questionId}`] : {}) || {};
}

function saveSecondAnswer(year, caseId, questionId, slotId, text){
  const store = secondStore();
  const row = { year, caseId, questionId, slotId, text, characterCount: Array.from(text).length, updatedAt: Date.now() };
  store[secondKey(year, caseId, questionId, slotId)] = row;
  localStorage.setItem(SECONDARY_STORE_KEY, JSON.stringify(store));
  if (currentUser) {
    const timerKey = secondKey(year, caseId, questionId, slotId);
    clearTimeout(secondarySyncTimers.get(timerKey));
    secondarySyncTimers.set(timerKey, setTimeout(() => apiPost("save.php", { type: "secondary_answer", ...row }), 500));
  }
}

function secondScoreStore(){
  try { return JSON.parse(localStorage.getItem(SECONDARY_SCORE_KEY) || "{}"); }
  catch { return {}; }
}

function aiPromptStore(){
  try { return JSON.parse(localStorage.getItem(AI_PROMPT_STORE_KEY) || "[]"); }
  catch { return []; }
}

function saveAiPromptHistory(provider, prompt, action){
  const data = currentSecondCase();
  const q = currentSecondQuestion();
  if (!data || !q) return;
  const row = {
    id: createClientId(),
    year: data.year,
    caseId: data.caseId,
    questionId: q.id,
    provider,
    action,
    prompt,
    characterCount: Array.from(prompt).length,
    createdAt: Date.now()
  };
  const store = aiPromptStore();
  store.unshift(row);
  localStorage.setItem(AI_PROMPT_STORE_KEY, JSON.stringify(store.slice(0, 200)));
  apiPost("save.php", { type: "ai_prompt", ...row });
}

function loadSecondScore(year, caseId, questionId){
  return secondScoreStore()[`${year}:${caseId}:${questionId}`] || {};
}

function saveCurrentSecondScore(){
  const data = currentSecondCase();
  const q = currentSecondQuestion();
  const score = Number($("secondSelfScore").value);
  const maxScore = Number(q.points || 0);
  const note = $("secondSelfNote").value.trim();
  if (!Number.isFinite(score) || score < 0 || score > maxScore) {
    alert(`得点は0点から${maxScore}点の範囲で入力してください。`);
    return;
  }
  const row = { year: data.year, caseId: data.caseId, questionId: q.id, score, maxScore, note, updatedAt: Date.now() };
  const store = secondScoreStore();
  store[`${data.year}:${data.caseId}:${q.id}`] = row;
  localStorage.setItem(SECONDARY_SCORE_KEY, JSON.stringify(store));
  $("secondScoreStatus").textContent = `保存済み：${new Date(row.updatedAt).toLocaleString("ja-JP")}`;
  apiPost("save.php", { type: "self_score", ...row });
}

function buildSecondPrompt(){
  const data = currentSecondCase();
  const q = currentSecondQuestion();
  const slots = getSecondAnswerSlots(q);
  const answer = slots.map(slot => {
    const text = $(`secondAnswer-${slot.id}`)?.value || "（未入力）";
    return slots.length > 1 ? `${slot.label}（配点${slot.points || 0}点）：${text}` : text;
  }).join("\n\n");
  const points = Number(q.points || 0);
  const multiSlotInstruction = slots.length > 1
    ? `回答欄は${slots.length}つあります。指定済みの欄別配点（${slots.map(slot => `${slot.label}${slot.points || 0}点`).join("、")}）に従い、合計${points}点満点で採点してください。`
    : "";
  return `中小企業診断士試験、${data.yearLabel}、${data.caseLabel}の${q.title}に関して、出題の趣旨と配点を反映させて、${points}点満点で採点してください。
事例全体の100点満点ではなく、この設問の配点${points}点を上限にしてください。
${multiSlotInstruction}

【公式の出題の趣旨】
${data.purposeUrl || data.purposeIndexUrl || "中小企業診断協会の公表資料を参照してください。"}

【設問】
${q.question}

【回答欄記載内容】
${answer}

【採点結果に含める内容】
1. 得点（${points}点満点）
2. 回答欄ごとの配点と得点${slots.length > 1 ? "" : "（回答欄が1つの場合は省略可）"}
3. 出題の趣旨との一致
4. 与件根拠の活用
5. 良い点と不足点
6. 改善答案例

中小企業診断士二次試験には公式解答・公式採点基準がないため、参考評価であることを明記してください。`;
}

function buildChatGptUrl(prompt){
  return prompt.length <= 6000 ? `https://chatgpt.com/?q=${encodeURIComponent(prompt)}` : "https://chatgpt.com/";
}

function buildGeminiUrl(prompt){
  return "https://gemini.google.com/app";
}

function buildClaudeUrl(prompt){
  return "https://claude.ai/new";
}

async function copyText(text){
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {}
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {}
  textarea.remove();
  return copied;
}

async function openAiReview(provider){
  const prompt = buildSecondPrompt();
  saveAiPromptHistory(provider, prompt, "open");
  const url = provider === "gemini" ? buildGeminiUrl(prompt) : provider === "claude" ? buildClaudeUrl(prompt) : buildChatGptUrl(prompt);
  const opened = window.open(url, "_blank");
  if (opened) opened.opener = null;
  const copied = await copyText(prompt);
  if (!opened) {
    $("secondAiStatus").textContent = copied
      ? "採点用プロンプトはコピーできましたが、別タブを開けませんでした。ポップアップ許可を確認してください。"
      : "別タブを開けず、コピーにも失敗しました。ブラウザのポップアップとクリップボードの許可を確認してください。";
    return;
  }
  if (provider === "chatgpt" && prompt.length <= 6000) {
    $("secondAiStatus").textContent = copied
      ? "ChatGPTへ採点依頼を渡しました。入力欄に表示されない場合は貼り付けて送信してください。"
      : "ChatGPTへ採点依頼を渡しました。表示されない場合は「プロンプトをコピー」を押してください。";
    return;
  }
  $("secondAiStatus").textContent = copied
    ? `${providerName(provider)}を開き、採点用プロンプトをコピーしました。入力欄へ貼り付けて送信してください。`
    : `${providerName(provider)}を開きました。「プロンプトをコピー」を押してから入力欄へ貼り付けてください。`;
}

function providerName(provider){
  return provider === "gemini" ? "Gemini" : provider === "claude" ? "Claude" : "ChatGPT";
}

async function copySecondPrompt(){
  const prompt = buildSecondPrompt();
  saveAiPromptHistory("clipboard", prompt, "copy");
  if (await copyText(prompt)) {
    alert("AI添削用プロンプトをコピーしました。");
  } else {
    alert("コピーできませんでした。");
  }
}

function createClientId(){
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function inferTopic(item){
  const existing = String(item?.topic || "").trim();
  if (existing && existing !== "分野未設定") return existing;
  const subject = String(item?.subject || item?.subject_name || "").trim();
  const text = `${item?.question || ""} ${item?.no || item?.questionNo || item?.question_no || ""}`.toLowerCase();
  const numberMatch = String(item?.no || item?.questionNo || item?.question_no || "").match(/\d+/);
  const questionNo = numberMatch ? Number(numberMatch[0]) : 0;
  const has = words => words.some(word => text.includes(word.toLowerCase()));

  if (subject.includes("企業経営理論")) {
    if (has(["マーケティング", "消費者", "ブランド", "製品", "価格", "チャネル", "広告", "市場調査", "顧客", "サービス", "流通"])) return "マーケティング";
    if (has(["人的資源", "人事", "労働", "採用", "賃金", "評価", "能力開発", "キャリア", "雇用", "モチベーション"])) return "人的資源管理";
    if (has(["組織", "リーダーシップ", "意思決定", "組織文化", "権限", "官僚制", "コンフリクト", "学習する組織"])) return "組織論";
    if (has(["戦略", "競争", "vrio", "ポーター", "経営資源", "イノベーション", "多角化", "事業", "ガバナンス", "企業間"])) return "経営戦略";
    if (questionNo >= 30) return "マーケティング";
    if (questionNo >= 20) return "人的資源管理";
    if (questionNo >= 14) return "組織論";
    return "経営戦略";
  }
  if (subject.includes("財務")) {
    if (has(["原価", "損益分岐", "標準原価", "cvp"])) return "管理会計";
    if (has(["投資", "npv", "irr", "資本コスト", "企業価値", "証券"])) return "ファイナンス";
    return "財務会計";
  }
  if (subject.includes("運営管理")) {
    if (has(["店舗", "商店", "小売", "物流", "在庫", "販売", "立地"])) return "店舗・販売管理";
    return "生産管理";
  }
  if (subject.includes("経営情報")) {
    if (has(["開発", "プロジェクト", "要件", "テスト", "システム監査"])) return "システム開発・管理";
    if (has(["経営", "戦略", "業務", "it投資", "dx"])) return "経営情報管理";
    return "情報技術";
  }
  if (subject.includes("経営法務")) {
    if (has(["知的財産", "著作", "特許", "商標", "意匠"])) return "知的財産権";
    if (has(["会社法", "株主", "取締役", "組織再編"])) return "会社法";
    return "民法・その他法務";
  }
  if (subject.includes("経済学")) {
    if (has(["国民所得", "gdp", "物価", "金融", "財政", "景気", "為替"])) return "マクロ経済学";
    return "ミクロ経済学";
  }
  if (subject.includes("中小企業")) {
    if (has(["政策", "法律", "支援", "補助", "制度", "白書"])) return "中小企業政策";
    return "中小企業経営";
  }
  return subject ? `${subject}・未分類` : "未分類";
}

function questionPayload(q){
  return {
    questionId: q.id || "",
    year: q.year || "",
    subject: q.subject || "",
    subjectId: q.subjectId || "",
    topic: inferTopic(q),
    questionNo: q.no || ""
  };
}

async function apiRequest(path, options = {}){
  const response = await fetch(`api/${path}`, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({ ok: false, error: "サーバーから不正な応答がありました。" }));
  if (!response.ok) throw new Error(data.error || "サーバー処理に失敗しました。");
  return data;
}

async function apiPost(path, body){
  const publicPaths = ["login.php", "register.php", "request_password_reset.php", "reset_password.php", "contact.php"];
  if (!currentUser && !publicPaths.includes(path)) return null;
  try {
    return await apiRequest(path, { method: "POST", body: JSON.stringify(body || {}) });
  } catch (error) {
    console.warn(`API ${path}:`, error.message);
    return null;
  }
}

function setAuthMode(mode){
  authMode = mode;
  const registering = mode === "register";
  const resetRequest = mode === "resetRequest";
  const resetPassword = mode === "resetPassword";
  $("authForm").classList.toggle("hidden", resetRequest || resetPassword);
  $("resetRequestForm").classList.toggle("hidden", !resetRequest);
  $("resetPasswordForm").classList.toggle("hidden", !resetPassword);
  $("forgotPasswordBtn").classList.toggle("hidden", registering || resetRequest || resetPassword);
  $("displayNameField").classList.toggle("hidden", !registering);
  $("showLoginBtn").classList.toggle("active", !registering);
  $("showRegisterBtn").classList.toggle("active", registering);
  $("showLoginBtn").disabled = resetPassword;
  $("showRegisterBtn").disabled = resetPassword;
  $("authSubmitBtn").textContent = registering ? "ユーザー登録" : "ログイン";
  $("authPassword").autocomplete = registering ? "new-password" : "current-password";
  $("authMessage").textContent = "";
}

function initPasswordResetFromUrl(){
  const params = new URLSearchParams(window.location.search);
  const token = params.get("reset_token") || "";
  if (!token) return;
  passwordResetToken = token;
  currentUser = null;
  updateAccountUi();
  setAuthMode("resetPassword");
  $("authMessage").textContent = "新しいパスワードを入力してください。";
}

async function submitAuth(event){
  event.preventDefault();
  const payload = {
    email: $("authEmail").value.trim(),
    password: $("authPassword").value,
    displayName: $("authDisplayName").value.trim()
  };
  $("authSubmitBtn").disabled = true;
  $("authMessage").textContent = "処理中です。";
  try {
    const result = await apiRequest(authMode === "register" ? "register.php" : "login.php", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    currentUser = result.user;
    updateAccountUi();
    $("authForm").reset();
    await syncLocalData();
    $("authMessage").textContent = "";
  } catch (error) {
    $("authMessage").textContent = error.message;
  } finally {
    $("authSubmitBtn").disabled = false;
  }
}

async function submitResetRequest(event){
  event.preventDefault();
  $("resetRequestSubmitBtn").disabled = true;
  $("authMessage").textContent = "処理中です。";
  try {
    const result = await apiRequest("request_password_reset.php", {
      method: "POST",
      body: JSON.stringify({ email: $("resetEmail").value.trim() })
    });
    $("authMessage").textContent = result.message || "登録済みのメールアドレスの場合、再設定メールを送信しました。";
    $("resetRequestForm").reset();
  } catch {
    $("authMessage").textContent = "登録済みのメールアドレスの場合、再設定メールを送信しました。";
  } finally {
    $("resetRequestSubmitBtn").disabled = false;
  }
}

async function submitResetPassword(event){
  event.preventDefault();
  const password = $("newPassword").value;
  if (password !== $("newPasswordConfirm").value) {
    $("authMessage").textContent = "確認用パスワードが一致しません。";
    return;
  }
  $("resetPasswordSubmitBtn").disabled = true;
  $("authMessage").textContent = "処理中です。";
  try {
    const result = await apiRequest("reset_password.php", {
      method: "POST",
      body: JSON.stringify({ token: passwordResetToken, password })
    });
    passwordResetToken = "";
    $("resetPasswordForm").reset();
    if (window.history?.replaceState) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    setAuthMode("login");
    $("authMessage").textContent = result.message || "パスワードを再設定しました。新しいパスワードでログインしてください。";
  } catch (error) {
    $("authMessage").textContent = error.message;
  } finally {
    $("resetPasswordSubmitBtn").disabled = false;
  }
}

async function refreshAuth(){
  try {
    const result = await apiRequest("me.php");
    currentUser = result.user;
  } catch {
    currentUser = null;
  }
  updateAccountUi();
}

function updateAccountUi(){
  $("accountGuest").classList.toggle("hidden", !!currentUser);
  $("accountUser").classList.toggle("hidden", !currentUser);
  if (currentUser) {
    $("accountName").textContent = currentUser.display_name || currentUser.email;
  } else {
    $("historyView").classList.add("hidden");
  }
}

async function logout(){
  await apiPost("logout.php", {});
  currentUser = null;
  updateAccountUi();
}

async function syncLocalData(){
  if (!currentUser) return;
  const primary = loadStore();
  const secondary = Object.values(secondStore());
  const result = await apiPost("sync.php", {
    questions: Object.values(primary.questions || {}),
    attempts: buildSyncAttempts(primary),
    sessions: Object.values(primary.sessions || {}),
    secondaryAnswers: secondary,
    selfScores: Object.values(secondScoreStore()),
    aiPrompts: aiPromptStore()
  });
  if (!result) return;
  const mergedPrimary = loadStore();
  (result.questions || []).forEach(row => {
    const id = row.question_id;
    const local = mergedPrimary.questions[id] || {};
    mergedPrimary.questions[id] = {
      ...local,
      id,
      year: row.exam_year,
      subject: row.subject_name,
      subjectId: row.subject_id,
      topic: inferTopic({ ...local, topic: row.topic, subject: row.subject_name, no: row.question_no }),
      no: row.question_no,
      review: !!Number(row.needs_review),
      bookmark: !!Number(row.bookmarked),
      lastAnswer: row.last_answer === null ? local.lastAnswer : Number(row.last_answer),
      lastCorrect: row.last_correct === null ? local.lastCorrect : !!Number(row.last_correct),
      attempts: Math.max(Number(local.attempts || 0), Number(row.attempts || 0)),
      correct: Math.max(Number(local.correct || 0), Number(row.correct_count || 0)),
      wrong: Math.max(Number(local.wrong || 0), Number(row.wrong_count || 0)),
      lastAt: Math.max(Number(local.lastAt || 0), Number(row.last_at || 0)),
      updatedAt: Math.max(Number(local.updatedAt || 0), Number(row.updated_at || 0))
    };
  });
  saveStore(mergedPrimary);
  const mergedSecondary = secondStore();
  (result.secondaryAnswers || []).forEach(row => {
    const key = secondKey(row.exam_year, row.case_id, row.question_id, row.slot_id);
    const local = mergedSecondary[key];
    if (!local || Number(row.updated_at || 0) >= Number(local.updatedAt || 0)) {
      mergedSecondary[key] = {
        year: row.exam_year,
        caseId: row.case_id,
        questionId: row.question_id,
        slotId: row.slot_id,
        text: row.answer_text,
        updatedAt: Number(row.updated_at || 0)
      };
    }
  });
  localStorage.setItem(SECONDARY_STORE_KEY, JSON.stringify(mergedSecondary));
  refreshLearningStats();
}

function buildSyncAttempts(store){
  const logged = Array.isArray(store.attempts) ? store.attempts : [];
  const generated = [...logged];
  const loggedByQuestion = {};
  logged.forEach(row => {
    const key = row.questionId;
    loggedByQuestion[key] ??= { correct: 0, wrong: 0 };
    loggedByQuestion[key][row.isCorrect ? "correct" : "wrong"]++;
  });
  Object.values(store.questions || {}).forEach(row => {
    const tracked = loggedByQuestion[row.id] || { correct: 0, wrong: 0 };
    const correct = Math.max(0, Number(row.correct || 0) - tracked.correct);
    const wrong = Math.max(0, Number(row.wrong || 0) - tracked.wrong);
    for (let i = 0; i < correct; i++) {
      generated.push({
        id: `legacy:${row.id}:correct:${i + 1}`,
        questionId: row.id,
        year: row.year || "",
        subject: row.subject || "",
        subjectId: row.subjectId || "",
        topic: inferTopic(row),
        questionNo: row.no || "",
        selectedAnswer: row.answer ?? row.lastAnswer ?? null,
        correctAnswer: row.answer ?? null,
        isCorrect: true,
        points: 0,
        answeredAt: Number(row.lastAt || row.updatedAt || Date.now()) - (correct + wrong - i) * 1000
      });
    }
    for (let i = 0; i < wrong; i++) {
      generated.push({
        id: `legacy:${row.id}:wrong:${i + 1}`,
        questionId: row.id,
        year: row.year || "",
        subject: row.subject || "",
        subjectId: row.subjectId || "",
        topic: inferTopic(row),
        questionNo: row.no || "",
        selectedAnswer: row.lastAnswer ?? null,
        correctAnswer: row.answer ?? null,
        isCorrect: false,
        points: 0,
        answeredAt: Number(row.lastAt || row.updatedAt || Date.now()) - (wrong - i) * 1000
      });
    }
  });
  return generated;
}

async function showHistory(){
  $("historyView").classList.remove("hidden");
  $("historyContent").innerHTML = `<p class="note">履歴を読み込んでいます。</p>`;
  try {
    const data = await apiRequest("history.php");
    $("historyContent").innerHTML = renderHistory(data);
  } catch (error) {
    $("historyContent").innerHTML = `<p class="warn">${escapeHtml(error.message)}</p>`;
  }
  $("historyView").scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderHistory(data){
  const accuracyBlock = (title, rows) => {
    if (!rows?.length) return "";
    return `<div class="history-block"><h3>${title}</h3><div class="history-table-wrap"><table><thead><tr><th>区分</th><th>正答率</th><th>正解数</th><th>解答数</th></tr></thead><tbody>${rows.map(row => `<tr><td>${escapeHtml(row.label || "未分類")}</td><td>${Number(row.accuracy || 0)}%</td><td>${Number(row.correct_count || 0)}</td><td>${Number(row.attempts || 0)}</td></tr>`).join("")}</tbody></table></div></div>`;
  };
  const recent = data.recentAnswers || [];
  const weaknesses = data.weaknesses || [];
  const sessions = data.sessions || [];
  const secondary = data.secondaryAnswers || [];
  const prompts = data.aiPrompts || [];
  return `
    <div class="history-summary">
      ${accuracyBlock("科目別正答率", data.accuracy?.subjects)}
      ${accuracyBlock("年度別正答率", data.accuracy?.years)}
      ${accuracyBlock("分野別正答率", data.accuracy?.topics)}
    </div>
    <div class="history-block"><h3>弱点分析</h3>${weaknesses.length ? weaknesses.map(row => `<p><span class="badge">${escapeHtml(row.subject_name || "未分類")}</span>${escapeHtml(inferTopic({ topic: row.topic, subject: row.subject_name, no: row.question_no }))}：正答率 ${Number(row.accuracy || 0)}%（誤答 ${Number(row.wrong_count || 0)}回）</p>`).join("") : `<p class="note">解答後に表示されます。</p>`}</div>
    <div class="history-block"><h3>演習履歴</h3>${sessions.length ? sessions.map(row => `<p>${escapeHtml(formatServerDate(row.finished_at || row.updated_at || row.started_at))}｜${escapeHtml(row.exam_year || "")} ${escapeHtml(row.subject_name || row.subject_id || "全科目")}｜${escapeHtml(row.topic || "複数分野")}｜${Number(row.correct_count || 0)}/${Number(row.answered_count || 0)}問正解（${Number(row.accuracy || 0)}%）｜${row.status === "completed" ? "完了" : "進行中"}</p>`).join("") : `<p class="note">演習履歴はまだありません。</p>`}</div>
    <div class="history-block"><h3>最近の解答</h3>${recent.length ? recent.map(row => `<p><span class="result-mark ${Number(row.is_correct) ? "ok" : "ng"}">${Number(row.is_correct) ? "○" : "×"}</span>${escapeHtml(formatServerDate(row.answered_at))}｜${escapeHtml(row.exam_year || "")} ${escapeHtml(row.subject_name || "")} ${escapeHtml(row.question_no || "")}｜${escapeHtml(inferTopic({ topic: row.topic, subject: row.subject_name, no: row.question_no }))}</p>`).join("") : `<p class="note">解答履歴はまだありません。</p>`}</div>
    <div class="history-block"><h3>二次答案・セルフ採点</h3>${secondary.length ? secondary.map(row => `<div class="secondary-history-row"><p><strong>${escapeHtml(row.exam_year)} ${escapeHtml(row.case_id)} ${escapeHtml(row.question_id)} ${escapeHtml(row.slot_id)}</strong>｜${escapeHtml(formatServerDate(row.updated_at))}｜${Number(row.character_count || 0)}字${row.score !== null ? `｜セルフ採点 ${Number(row.score)}/${Number(row.max_score)}点` : ""}</p><p>${formatText(String(row.answer_text || "").slice(0, 240))}${String(row.answer_text || "").length > 240 ? "…" : ""}</p>${row.note ? `<p class="note">振り返り：${formatText(row.note)}</p>` : ""}</div>`).join("") : `<p class="note">保存された二次答案はまだありません。</p>`}</div>
    <div class="history-block"><h3>AI添削プロンプト履歴</h3>${prompts.length ? prompts.map(row => `<div class="secondary-history-row"><p><strong>${escapeHtml(row.provider)}</strong>｜${escapeHtml(row.exam_year)} ${escapeHtml(row.case_id)} ${escapeHtml(row.question_id)}｜${Number(row.character_count || 0)}字｜${escapeHtml(formatServerDate(row.created_at))}</p><p>${formatText(String(row.prompt_text || "").slice(0, 240))}${String(row.prompt_text || "").length > 240 ? "…" : ""}</p></div>`).join("") : `<p class="note">AI添削プロンプト履歴はまだありません。</p>`}</div>`;
}

function formatServerDate(value){
  if (!value) return "";
  const normalized = String(value).replace(" ", "T");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("ja-JP");
}

init();
