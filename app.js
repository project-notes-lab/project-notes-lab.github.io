"use strict";

const $ = (id) => document.getElementById(id);
const state = { data: null };
const numberFormat = new Intl.NumberFormat("en", { maximumFractionDigits: 2 });
const dateFormat = new Intl.DateTimeFormat("en", {
  year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  hourCycle: "h23", timeZone: "UTC",
});
const stages = {
  running: "Running", queued: "Queued", held: "Held", planned: "Planned",
  awaiting_evaluation: "Awaiting evaluation", status_unverified: "Status unverified",
};
const kinds = {
  primary: "Primary experiment", comparison: "Toolset / scope comparison", repeat: "Repeat",
  side_effect: "Side-effect check", native_check: "Native validation", screen: "Screen", control: "Control",
};
const statistics = {
  significant_gain: "Statistically significant gain", not_significant: "Not statistically significant",
  not_available: "Statistics unavailable",
};
const freshnessLabels = {
  recently_verified: "Recently verified", retained_snapshot: "Retained snapshot; not freshly reverified",
};
const stageOrder = ["running", "awaiting_evaluation", "queued", "held", "planned", "status_unverified"];

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}
function append(parent, ...children) {
  parent.append(...children.filter((child) => child !== null && child !== undefined));
  return parent;
}
function isNumber(value) { return typeof value === "number" && Number.isFinite(value); }
function formatNumber(value) { return isNumber(value) ? numberFormat.format(value) : "Unavailable"; }
function readable(value) { return typeof value === "string" ? value.replaceAll("_", " ") : "Unavailable"; }
function formatDate(value) {
  if (!value) return "Timestamp unavailable";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "Timestamp unavailable" : `${dateFormat.format(date)} UTC`;
}
function updateTime(id, value) {
  const node = $(id);
  node.textContent = formatDate(value);
  if (value && !Number.isNaN(new Date(value).valueOf())) node.dateTime = value;
}
function makeTime(value) {
  const node = element("time", "", formatDate(value));
  if (value && !Number.isNaN(new Date(value).valueOf())) node.dateTime = value;
  return node;
}
function formatP(value) {
  if (!isNumber(value)) return "Unavailable";
  if (value === 0) return "0 (reported)";
  return value < 0.0001 ? value.toExponential(3) : Number(value.toPrecision(4)).toString();
}
function signed(value) {
  return isNumber(value) ? `${value > 0 ? "+" : value < 0 ? "−" : ""}${formatNumber(Math.abs(value))}` : "Unavailable";
}
function textSearch(row, fields, query) {
  return !query || fields.map((field) => Array.isArray(row[field]) ? row[field].join(" ") : row[field] || "")
    .join(" ").toLocaleLowerCase().includes(query);
}
function fillSelect(id, rows, key, labelKey, labels) {
  const select = $(id);
  select.replaceChildren(select.options[0]);
  const options = new Map();
  rows.forEach((row) => {
    if (row[key]) options.set(row[key], labels?.[row[key]] || row[labelKey] || readable(row[key]));
  });
  [...options].sort((a, b) => a[1].localeCompare(b[1])).forEach(([value, label]) => {
    const option = element("option", "", label);
    option.value = value;
    select.append(option);
  });
}
function noteList(notes) {
  const list = element("ul");
  (Array.isArray(notes) ? notes : []).forEach((note) => list.append(element("li", "", note)));
  return list;
}
function labelValue(label, value) {
  return append(element("p"), element("strong", "", `${label}: `), document.createTextNode(value));
}
function unavailable(message) { return element("p", "empty-state", message); }

function renderOverview(data) {
  document.title = data.project?.title || "Weight-Space Programming for Robotics";
  if (data.project?.subtitle) $("project-subtitle").textContent = data.project.subtitle;
  if (data.project?.status) $("project-status").textContent = data.project.status;
  updateTime("hero-timestamp", data.evidence_as_of);
  updateTime("experiment-timestamp", data.evidence_as_of);
  updateTime("generated-timestamp", data.generated_at);
  if (data.method?.description) $("method-description").textContent = data.method.description;
  $("development-budget").textContent = formatNumber(data.method?.development_budget);
  $("heldout-layouts").textContent = formatNumber(data.method?.heldout_layouts);

  const toolsets = (data.method?.toolsets || []).map((toolset) => append(element("article", "toolset-card"),
    element("h3", "", toolset.label), element("p", "", toolset.description)));
  $("toolsets").replaceChildren(...toolsets);
  const protocol = (data.method?.stages || []).map((stage) => append(element("li"),
    element("strong", "", stage.title), document.createTextNode(stage.body || "")));
  $("method-stages").replaceChildren(...(protocol.length ? protocol : [element("li", "", "No detailed protocol stages were included in this snapshot.")]));

  const summary = data.summary || {};
  const metrics = [
    [summary.validated_runs, "Completed held-out comparisons", "Selected experiments, not independent replications"],
    [summary.numerical_gains, "Numerical gains", "A positive difference is not a significance claim"],
    [summary.regressions, "Regressions retained", `${formatNumber(summary.ties)} ties also retained`],
    [summary.significant_gains, "Statistically significant gains", `${formatNumber(summary.significance_known_runs)} comparisons have known significance metadata`],
  ];
  $("result-metrics").replaceChildren(...metrics.map(([value, label, note]) => append(element("div", "metric"),
    element("p", "metric-value", formatNumber(value)), element("p", "metric-label", label), element("p", "metric-note", note))));

  const statusCounts = new Map();
  data.experiments.forEach((row) => statusCounts.set(row.stage, (statusCounts.get(row.stage) || 0) + 1));
  $("experiment-summary").replaceChildren(...stageOrder.filter((stage) => statusCounts.has(stage)).map((stage) =>
    element("span", `badge ${stage}`, `${formatNumber(statusCounts.get(stage))} ${stages[stage].toLowerCase()}`)));
}

function resultDetails(row) {
  const details = element("details", "result-details");
  const summary = element("summary", "", "Details & caveats");
  summary.setAttribute("aria-label", `Details and caveats: ${row.policy_label}, ${row.task_label}, ${row.method_label}, ${row.cohort_label}`);
  const body = element("div", "detail-content");
  const ci = Array.isArray(row.ci95_pp) && row.ci95_pp.length === 2 && row.ci95_pp.every(isNumber)
    ? `${signed(row.ci95_pp[0])} to ${signed(row.ci95_pp[1])} pp` : "Unavailable";
  append(body,
    labelValue("95% confidence interval", ci),
    labelValue("Cohort", row.cohort_label || readable(row.cohort)),
    labelValue("Numerical outcome", readable(row.numerical_outcome)),
    labelValue("Freshness", freshnessLabels[row.source_freshness] || readable(row.source_freshness)),
    append(element("p"), element("strong", "", "Observed: "), makeTime(row.observed_at)));
  if (Array.isArray(row.notes) && row.notes.length) body.append(noteList(row.notes));
  else body.append(element("p", "", "No row-specific notes supplied. The project-wide limitations still apply."));
  return append(details, summary, body);
}
function scoreCell(successes, denominator) {
  const cell = element("td", "numeric");
  if (!isNumber(successes) || !isNumber(denominator)) return append(cell, document.createTextNode("Unavailable"));
  append(cell, element("span", "", formatNumber(successes)), element("span", "score-denominator", ` / ${formatNumber(denominator)}`));
  cell.setAttribute("aria-label", `${successes} successes out of ${denominator} episodes`);
  return cell;
}
function resultRow(row) {
  const outcome = ["gain", "regression", "tie"].includes(row.numerical_outcome) ? row.numerical_outcome : "";
  const policy = append(element("td"), element("span", "cell-title", row.policy_label || readable(row.policy)), element("span", "cell-subtitle", row.task_label || readable(row.task)));
  const method = append(element("td"), element("span", "cell-title", row.method_label || readable(row.method)), element("span", "cell-subtitle", row.cohort_label || readable(row.cohort)));
  const evidence = append(element("td"), element("span", "", isNumber(row.p_value) ? `p = ${formatP(row.p_value)}` : "p unavailable"),
    element("span", `evidence-tag${row.statistical_outcome === "significant_gain" ? " significant" : ""}`, statistics[row.statistical_outcome] || "Statistics unavailable"));
  return append(element("tr"), policy, method,
    scoreCell(row.baseline_successes, row.episodes_per_side), scoreCell(row.edited_successes, row.episodes_per_side),
    append(element("td", `numeric delta ${outcome}`), document.createTextNode(signed(row.delta_pp)), element("span", "cell-subtitle", readable(row.numerical_outcome))),
    evidence, append(element("td"), resultDetails(row)));
}
function compareNullable(a, b, direction = 1) {
  if (!isNumber(a)) return isNumber(b) ? 1 : 0;
  if (!isNumber(b)) return -1;
  return (a - b) * direction;
}
function sortResults(rows, sort) {
  const name = (row) => [row.policy_label, row.task_label, row.method_label, row.cohort_label, row.id].join(" ");
  return rows.sort((a, b) => {
    let compared = 0;
    if (sort === "delta-desc") compared = compareNullable(a.delta_pp, b.delta_pp, -1);
    if (sort === "delta-asc") compared = compareNullable(a.delta_pp, b.delta_pp);
    if (sort === "p-value") compared = compareNullable(a.p_value, b.p_value);
    if (sort === "latest") compared = compareNullable(a.observed_at ? Date.parse(a.observed_at) : null, b.observed_at ? Date.parse(b.observed_at) : null, -1);
    return compared || name(a).localeCompare(name(b));
  });
}
function renderResults() {
  if (!state.data) return;
  const policy = $("result-policy").value;
  const method = $("result-method").value;
  const cohort = $("result-cohort").value;
  const outcome = $("result-outcome").value;
  const query = $("result-search").value.trim().toLocaleLowerCase();
  const filtered = state.data.results.filter((row) => (!policy || row.policy === policy)
    && (!method || row.method === method) && (!cohort || row.cohort === cohort)
    && (!outcome || row.numerical_outcome === outcome || row.statistical_outcome === outcome)
    && textSearch(row, ["policy_label", "task", "task_label", "method_label", "cohort_label", "notes"], query));
  sortResults(filtered, $("result-sort").value);
  $("result-rows").replaceChildren(...filtered.map(resultRow));
  $("result-empty").hidden = filtered.length !== 0;
  $("result-count").textContent = `${formatNumber(filtered.length)} of ${formatNumber(state.data.results.length)} completed comparisons shown. Summary counts above describe the full snapshot.`;
}

function progressBlock(row) {
  const block = element("div", "progress-block");
  const progress = row.progress;
  if (!progress || typeof progress !== "object") {
    return append(block, element("p", "", "Progress not reported in this snapshot."));
  }
  append(block, element("p", "", progress.phase ? `Phase: ${readable(progress.phase)}` : "Work progress · not a success score"));
  const fields = [["completed", "Completed"], ["requested", "Requested"], ["charged", "Charged development episodes"], ["budget", "Development budget"]];
  const values = element("dl");
  fields.forEach(([field, label]) => {
    if (isNumber(progress[field])) append(values, element("dt", "", label), element("dd", "", formatNumber(progress[field])));
  });
  if (values.children.length) block.append(values);
  else block.append(element("p", "", "Quantitative progress unavailable."));
  let completed = null;
  let requested = null;
  let label = "";
  if (isNumber(progress.completed) && isNumber(progress.requested) && progress.requested > 0 && progress.completed >= 0) {
    completed = progress.completed; requested = progress.requested; label = "Reported work completed";
  } else if (isNumber(progress.charged) && isNumber(progress.budget) && progress.budget > 0 && progress.charged >= 0) {
    completed = progress.charged; requested = progress.budget; label = "Charged development budget used";
  }
  if (requested !== null) {
    const bar = element("progress");
    bar.max = requested;
    bar.value = Math.min(completed, requested);
    bar.setAttribute("aria-label", `${label}: ${formatNumber(completed)} of ${formatNumber(requested)}; not a policy success score`);
    block.append(bar);
  }
  return block;
}
function experimentCard(row) {
  const card = element("article", "experiment-card");
  const stageClass = Object.hasOwn(stages, row.stage) ? row.stage : "status_unverified";
  append(card,
    append(element("div", "card-topline"), element("span", "kind-label", kinds[row.kind] || readable(row.kind)), element("span", `badge ${stageClass}`, stages[row.stage] || readable(row.stage))),
    element("h3", "", row.task_label || readable(row.task)),
    element("p", "experiment-identity", `${row.policy_label || readable(row.policy)} · ${row.method_label || readable(row.method)}`),
    progressBlock(row));
  if (Array.isArray(row.notes) && row.notes.length) {
    const details = element("details", "experiment-notes");
    const summary = element("summary", "", "Context & caveats");
    summary.setAttribute("aria-label", `Context and caveats: ${row.policy_label}, ${row.task_label}, ${row.method_label}`);
    append(details, summary, noteList(row.notes));
    card.append(details);
  }
  card.append(append(element("p", "observed"), document.createTextNode("Observed: "), makeTime(row.observed_at)));
  return card;
}
function renderExperiments() {
  if (!state.data) return;
  const stage = $("experiment-stage").value;
  const kind = $("experiment-kind").value;
  const policy = $("experiment-policy").value;
  const query = $("experiment-search").value.trim().toLocaleLowerCase();
  const filtered = state.data.experiments.filter((row) => (!stage || row.stage === stage)
    && (!kind || row.kind === kind) && (!policy || row.policy === policy)
    && textSearch(row, ["policy_label", "task", "task_label", "method_label", "notes"], query));
  const rank = (value) => stageOrder.includes(value) ? stageOrder.indexOf(value) : stageOrder.length;
  filtered.sort((a, b) => rank(a.stage) - rank(b.stage) || `${a.policy_label} ${a.task_label} ${a.method_label} ${a.id}`.localeCompare(`${b.policy_label} ${b.task_label} ${b.method_label} ${b.id}`));
  $("experiment-cards").replaceChildren(...filtered.map(experimentCard));
  $("experiment-empty").hidden = filtered.length !== 0;
  $("experiment-count").textContent = `${formatNumber(filtered.length)} of ${formatNumber(state.data.experiments.length)} experiments shown · ordered by status, then policy and task.`;
}
function renderInventory(data) {
  const policies = data.policies.map((policy) => {
    const card = append(element("article", "policy-card"),
      append(element("div", "card-topline"), element("h3", "", policy.label), element("span", "badge", policy.family || "Family unavailable")),
      element("p", "", policy.status || "Status unavailable"));
    const tasks = element("div", "policy-tasks");
    tasks.setAttribute("aria-label", "Tasks in the research inventory");
    (policy.tasks || []).forEach((task) => tasks.append(element("span", "task-label", readable(task))));
    if (!tasks.children.length) tasks.append(element("span", "task-label", "Task coverage not reported"));
    return append(card, tasks);
  });
  $("policy-cards").replaceChildren(...(policies.length ? policies : [unavailable("No policy inventory was included in this snapshot.")]));
  const caveats = data.caveats.map((caveat) => append(element("article", "caveat"), element("h3", "", caveat.title), element("p", "", caveat.text)));
  $("caveats").replaceChildren(...(caveats.length ? caveats : [unavailable("No additional structured caveats were included. The limitations stated above still apply.")]));
  const references = [];
  (data.links || []).forEach((link) => {
    try {
      const url = new URL(link.url);
      if (!["https:", "http:"].includes(url.protocol)) return;
      const anchor = element("a", "", link.label || url.hostname);
      anchor.href = url.href;
      anchor.rel = "noopener noreferrer";
      references.push(append(element("li"), anchor));
    } catch { /* Invalid references are not exposed as navigable links. */ }
  });
  $("reference-list").replaceChildren(...references);
  $("reference-links").hidden = !references.length;
}
function setControlsDisabled(disabled) {
  document.querySelectorAll(".filter-panel input, .filter-panel select, .filter-panel button").forEach((node) => { node.disabled = disabled; });
}
function populateFilters(data) {
  fillSelect("result-policy", data.results, "policy", "policy_label");
  fillSelect("result-method", data.results, "method", "method_label");
  fillSelect("result-cohort", data.results, "cohort", "cohort_label");
  fillSelect("experiment-policy", data.experiments, "policy", "policy_label");
  fillSelect("experiment-stage", data.experiments, "stage", null, stages);
  fillSelect("experiment-kind", data.experiments, "kind", null, kinds);
}
async function loadSnapshot() {
  const notice = $("data-notice");
  notice.hidden = false;
  notice.classList.remove("error");
  notice.textContent = "Loading the published research snapshot…";
  setControlsDisabled(true);
  try {
    const response = await fetch("./data.json", { cache: "no-cache" });
    if (!response.ok) throw new Error("Snapshot response unavailable");
    const data = await response.json();
    if (data.schema_version !== 1 || !["results", "experiments", "policies", "caveats"].every((key) => Array.isArray(data[key]))) {
      throw new Error("Unsupported snapshot structure");
    }
    state.data = data;
    renderOverview(data);
    populateFilters(data);
    renderResults();
    renderExperiments();
    renderInventory(data);
    setControlsDisabled(false);
    notice.hidden = true;
    // Data-dependent sections can move the fragment target after the browser's initial scroll.
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ behavior: "instant", block: "start" });
  } catch {
    notice.classList.add("error");
    notice.replaceChildren(element("p", "", "The published snapshot could not be loaded. Results and experiment statuses are unavailable—not zero. You can retry, or use the JSON and CSV download links below. This static site must be served over HTTP(S), rather than opened as a local file."));
    const retry = element("button", "button secondary", "Retry loading snapshot");
    retry.type = "button";
    retry.addEventListener("click", loadSnapshot);
    notice.append(retry);
    $("result-count").textContent = "Results unavailable: the snapshot could not be loaded.";
    $("experiment-count").textContent = "Experiment statuses unavailable: the snapshot could not be loaded.";
    ["hero-timestamp", "experiment-timestamp", "generated-timestamp"].forEach((id) => { $(id).textContent = "unavailable"; });
  }
}
function connectForm(id, render) {
  const form = $(id);
  form.addEventListener("submit", (event) => event.preventDefault());
  form.addEventListener("input", render);
  form.addEventListener("change", render);
  form.addEventListener("reset", () => { setTimeout(render, 0); });
}
connectForm("result-filters", renderResults);
connectForm("experiment-filters", renderExperiments);
loadSnapshot();
