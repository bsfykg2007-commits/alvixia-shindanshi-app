const SECONDARY_STORE_KEY = "alvixiaShindanshiSecondAnswers.v1";
let secondaryManifest = null;
let currentSecondData = null;

const s$ = id => document.getElementById(id);

document.addEventListener("DOMContentLoaded", () => {
  s$("openPrimaryBtn")?.addEventListener("click", () => showMode("primary"));
  s$("openSecondaryBtn")?.addEventListener("click", () => showMode("secondary"));
  s$("primaryHomeBtn")?.addEventListener("click", () => showMode("home"));
  s$("secondaryHomeBtn")?.addEventListener("click", () => showMode("home"));
  initSecondary();
});

function showMode(mode){
  s$("home").classList.toggle("hidden", mode !== "home");
  s$("primaryApp").classList.toggle("hidden", mode !== "primary");
  s$("secondaryApp").classList.toggle("hidden", mode !== "secondary");
  if (mode === "primary") {
    s$("setup").classList.remove("hidden");
    s$("quiz").classList.add("hidden");
    s$("result").classList.add("hidden");
    s$("proposal").classList.add("hidden");
  }
}

async function initSecondary(){
  secondaryManifest = await fetch(`data/secondary/manifest.json?v=${Date.now()}`).then(r => r.json()).catch(() => null);
  if (!secondaryManifest) return;
  const yearSelect = s$("secondYearSelect");
  const caseSelect = s$("secondCaseSelect");
  secondaryManifest.years.forEach(y => yearSelect.add(new Option(y.yearLabel, y.year)));
  fillSecondCases();
  yearSelect.addEventListener("change", () => { fillSecondCases(); loadSecondCase(); });
  caseSelect.addEventListener("change", loadSecondCase);
  yearSelect.value = "R05";
  fillSecondCases();
  caseSelect.value = "case1";
  loadSecondCase();
}

function fillSecondCases(){
  const year = secondaryManifest.years.find(y => y.year === s$("secondYearSelect").value) || secondaryManifest.years[0];
  s$("secondCaseSelect").innerHTML = "";
  year.cases.forEach(c => s$("secondCaseSelect").add(new Option(c.caseLabel, c.caseId)));
}

async function loadSecondCase(){
  const year = s$("secondYearSelect").value;
  const caseId = s$("secondCaseSelect").value;
  const meta = findSecondCase(year, caseId);
  if (!meta) return;
  currentSecondData = await fetch(`data/secondary/${meta.file}?v=${Date.now()}`).then(r => r.json()).catch(() => emptySecondData(meta));
  renderSecondCase(currentSecondData);
}

function findSecondCase(year, caseId){
  const y = secondaryManifest.years.find(item => item.year === year);
  return y?.cases.find(item => item.caseId === caseId);
}

function emptySecondData(meta){
  return {
    year: meta.year,
    yearLabel: meta.yearLabel,
    caseId: meta.caseId,
    caseLabel: meta.caseLabel,
    source: "一般社団法人 日本中小企業診断士協会連合会 中小企業診断士試験過去問題",
    sourceUrl: meta.sourceUrl || "",
    background: "この年度・事例の与件文は未投入です。公式PDFからJSONを差し替えると、この画面に表示されます。",
    questions: []
  };
}

function renderSecondCase(data){
  s$("secondProblemHeader").innerHTML = `<p class="badge">${escapeHtml2(data.yearLabel)}</p><p class="badge">${escapeHtml2(data.caseLabel)}</p>`;
  s$("secondSource").innerHTML = data.purposeUrl ? `<a href="${escapeHtml2(data.purposeUrl)}" target="_blank" rel="noopener">公式の出題の趣旨</a>` : "";
  s$("secondBackground").textContent = data.background || "";
  if (!data.questions?.length) {
    s$("secondQuestions").innerHTML = `<p class="note">この年度・事例の設問データは未投入です。JSONを追加すると答案入力欄が表示されます。</p>`;
    return;
  }
  s$("secondQuestions").innerHTML = data.questions.map(q => renderAnswerBox(data, q)).join("");
  data.questions.forEach(q => bindAnswerBox(data, q));
}

function renderAnswerBox(data, q){
  const saved = loadSecondAnswer(data.year, data.caseId, q.id);
  return `<article class="answer-box">
    <h3>${escapeHtml2(q.title)}（${Number(q.limit || 0)}字以内）</h3>
    <p class="question-text">${formatText2(q.question)}</p>
    <textarea id="answer-${escapeHtml2(q.id)}" maxlength="${Number(q.limit || 0)}" placeholder="答案を入力してください">${escapeHtml2(saved.text || "")}</textarea>
    <div class="answer-meta">
      <span id="count-${escapeHtml2(q.id)}"></span>
      <span id="warn-${escapeHtml2(q.id)}" class="warn"></span>
      <span>${saved.updatedAt ? `保存済み：${new Date(saved.updatedAt).toLocaleString("ja-JP")}` : "未保存"}</span>
    </div>
    <div class="actions">
      <button type="button" class="primary" data-ai="chatgpt" data-qid="${escapeHtml2(q.id)}">ChatGPTで添削</button>
      <button type="button" class="secondary" data-ai="gemini" data-qid="${escapeHtml2(q.id)}">Geminiで添削</button>
      <button type="button" class="ghost" data-copy-prompt="${escapeHtml2(q.id)}">プロンプトをコピー</button>
    </div>
  </article>`;
}

function bindAnswerBox(data, q){
  const textarea = s$(`answer-${q.id}`);
  const update = () => {
    const count = countJapaneseChars(textarea.value);
    s$(`count-${q.id}`).textContent = `${count} / ${q.limit}字`;
    s$(`warn-${q.id}`).textContent = count > 0 && count < Math.ceil(q.limit * 0.6) ? "字数が少なめです" : "";
    saveSecondAnswer(data.year, data.caseId, q.id, textarea.value);
  };
  textarea.addEventListener("input", update);
  update();
  document.querySelectorAll(`[data-ai][data-qid="${cssEscape(q.id)}"]`).forEach(btn => {
    btn.addEventListener("click", () => openAiReview(btn.dataset.ai, buildReviewPrompt(data, q, textarea.value)));
  });
  document.querySelector(`[data-copy-prompt="${cssEscape(q.id)}"]`)?.addEventListener("click", async () => {
    await navigator.clipboard.writeText(buildReviewPrompt(data, q, textarea.value));
    alert("AI添削用プロンプトをコピーしました。");
  });
}

function countJapaneseChars(text){
  return Array.from(String(text ?? "")).length;
}

function secondAnswers(){
  try { return JSON.parse(localStorage.getItem(SECONDARY_STORE_KEY) || "{}"); }
  catch { return {}; }
}

function answerKey(year, caseId, questionId){
  return `${year}:${caseId}:${questionId}`;
}

function loadSecondAnswer(year, caseId, questionId){
  return secondAnswers()[answerKey(year, caseId, questionId)] || {};
}

function saveSecondAnswer(year, caseId, questionId, text){
  const store = secondAnswers();
  store[answerKey(year, caseId, questionId)] = { year, caseId, questionId, text, updatedAt: Date.now() };
  localStorage.setItem(SECONDARY_STORE_KEY, JSON.stringify(store));
}

function buildReviewPrompt(data, q, answer){
  return `あなたは中小企業診断士二次試験の添削者です。
以下の答案を、公式採点ではなく参考評価として添削してください。

【年度】
${data.yearLabel}

【事例】
${data.caseLabel}

【与件文】
${data.background}

【設問】
${q.question}

【字数制限】
${q.limit}字以内

【受験生答案】
${answer || "（未入力）"}

【評価観点】
1. 参考点数（100点満点）
2. 設問要求との一致
3. 与件根拠の活用
4. 因果関係の明確さ
5. 多面的な解答構成
6. 必要キーワードの充足度
7. 不足している視点
8. 改善点
9. 改善答案例

【注意】
中小企業診断士二次試験には公式解答がないため、点数は参考評価として提示してください。`;
}

function buildChatGptUrl(prompt){
  return `https://chatgpt.com/?q=${encodeURIComponent(prompt)}`;
}

function buildGeminiUrl(prompt){
  return `https://gemini.google.com/app?q=${encodeURIComponent(prompt)}`;
}

function openAiReview(provider, prompt){
  const url = provider === "gemini" ? buildGeminiUrl(prompt) : buildChatGptUrl(prompt);
  window.open(url, "_blank", "noopener");
}

function cssEscape(value){
  return String(value).replace(/["\\]/g, "\\$&");
}

function escapeHtml2(s){
  return String(s ?? "").replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
}

function formatText2(s){
  return escapeHtml2(s).replace(/\n/g, "<br>");
}
