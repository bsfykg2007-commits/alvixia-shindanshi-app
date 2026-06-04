// shindanshi explanation UI helper v7.2
// Use this only if your current app does not display mainFormula1/mainFormula2/formulaExample/examPointV7 separately.

function escapeHtmlForExplanation(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatExplanationLineBreaks(value) {
  return escapeHtmlForExplanation(value).replace(/\n/g, '<br>');
}

function renderFormulaBlocks(exp) {
  if (!exp) return '';
  const blocks = [];
  if (exp.mainFormula1) {
    blocks.push(`<div class="formula-block"><strong>主要公式①</strong><br>${formatExplanationLineBreaks(exp.mainFormula1)}</div>`);
  }
  if (exp.mainFormula2) {
    blocks.push(`<div class="formula-block"><strong>主要公式②</strong><br>${formatExplanationLineBreaks(exp.mainFormula2)}</div>`);
  }
  if (exp.formulaExample) {
    blocks.push(`<div class="formula-example"><strong>具体例</strong><br>${formatExplanationLineBreaks(exp.formulaExample)}</div>`);
  }
  if (exp.examPointV7 || exp.examPoint) {
    blocks.push(`<div class="exam-point"><strong>試験ポイント</strong><br>${formatExplanationLineBreaks(exp.examPointV7 || exp.examPoint)}</div>`);
  }
  return blocks.join('');
}

// choiceReasons in the JSON no longer include leading "ア：" labels.
// If your app currently adds labels, keep that behavior.
// If your app does not add labels, add labels on the app side when rendering.
