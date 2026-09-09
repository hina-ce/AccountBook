const STORAGE_KEY = "expense-pwa-records-v1";
const EMAIL_STORAGE_KEY = "expense-pwa-email-v1";
const MEMO_PRESET_STORAGE_KEY = "expense-pwa-memo-presets-v1";
const MAX_RECENT = 10;
const MAX_AMOUNT = 999999;
const MAX_MEMO_LENGTH = 32;
const AUTO_DELETE_DAYS = 60;
const MAIL_SUBJECT = "kakeibo-pwa-export";
const CATEGORIES = ["食費", "外食費", "交際費", "娯楽費", "医療費", "雑費"];
const DEFAULT_MEMO_PRESETS = ["万代", "イオン", "ファミマ", "セブン", "ローソン", "ライフ"];
const LEGACY_MEMO_PRESET_COUNT = 3;

const entryForm = document.getElementById("entry-form");
const amountInput = document.getElementById("amount-input");
const memoInput = document.getElementById("memo-input");
const emailInput = document.getElementById("email-input");
const saveButton = document.getElementById("save-button");
const cancelEditButton = document.getElementById("cancel-edit-button");
const categoryButtons = Array.from(document.querySelectorAll(".category-chip"));
const memoPresetButtons = Array.from(document.querySelectorAll(".memo-preset-button"));
const memoPresetSettingsForm = document.getElementById("memo-preset-settings-form");
const memoPresetNameInputs = Array.from(document.querySelectorAll(".memo-preset-name-input"));
const entryFeedback = document.getElementById("entry-feedback");
const emailFeedback = document.getElementById("email-feedback");
const memoPresetSettingsFeedback = document.getElementById("memo-preset-settings-feedback");
const recordsList = document.getElementById("records-list");
const recordsEmpty = document.getElementById("records-empty");
const monthlySummary = document.getElementById("monthly-summary");
const monthlySummaryBody = document.getElementById("monthly-summary-body");
const currentMonthLabel = document.getElementById("current-month-label");
const previousMonthLabel = document.getElementById("previous-month-label");
const totalCountLabel = document.getElementById("total-count-label");

let records = [];
let memoPresets = [...DEFAULT_MEMO_PRESETS];
let selectedCategory = "";
let editingId = null;

function formatOffsetDateTime(date) {
  const pad = (value) => String(value).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const offsetHours = pad(Math.floor(abs / 60));
  const offsetMins = pad(abs % 60);
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${sign}${offsetHours}:${offsetMins}`;
}

function formatCompactDate(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join("");
}

function formatCompactTime(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return [pad(date.getHours()), pad(date.getMinutes()), pad(date.getSeconds())].join("");
}

function formatDisplayDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function formatCsvDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatAmount(value) {
  return new Intl.NumberFormat("ja-JP").format(value);
}

function formatYearMonth(date) {
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthHeading(label, date) {
  return `${label}（${formatYearMonth(date)}）`;
}

function generateSuffix() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let suffix = "";

  if (window.crypto?.getRandomValues) {
    const values = new Uint8Array(3);
    window.crypto.getRandomValues(values);
    values.forEach((value) => {
      suffix += chars[value % chars.length];
    });
    return suffix;
  }

  for (let index = 0; index < 3; index += 1) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }

  return suffix;
}

function createRecordId(date) {
  return `${formatCompactDate(date)}-${formatCompactTime(date)}-${generateSuffix()}`;
}

function sortByDatetimeDesc(left, right) {
  return new Date(right.datetime).getTime() - new Date(left.datetime).getTime();
}

function normalizeRecord(record) {
  if (!record || typeof record !== "object") {
    return null;
  }

  return {
    id: record.id,
    datetime: record.datetime,
    amount: record.amount,
    category: record.category,
    memo: typeof record.memo === "string" ? record.memo : "",
    updatedAt: record.updatedAt || record.datetime
  };
}

function readRecords() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(normalizeRecord).filter(Boolean) : [];
  } catch (error) {
    console.error("Failed to read local records:", error);
    return [];
  }
}

function writeRecords(nextRecords) {
  records = nextRecords.map(normalizeRecord).filter(Boolean).sort(sortByDatetimeDesc);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function readSavedEmail() {
  try {
    const raw = window.localStorage.getItem(EMAIL_STORAGE_KEY);
    return typeof raw === "string" ? raw.trim() : "";
  } catch (error) {
    console.error("Failed to read saved email:", error);
    return "";
  }
}

function writeSavedEmail(email) {
  try {
    if (!email) {
      window.localStorage.removeItem(EMAIL_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(EMAIL_STORAGE_KEY, email);
  } catch (error) {
    console.error("Failed to write saved email:", error);
  }
}

function validateMemoPresetNames(names) {
  for (let index = 0; index < names.length; index += 1) {
    const name = names[index];

    if (!name) {
      return { index, message: "ボタン" + (index + 1) + "の名前を入力してください。" };
    }

    if (name.length > MAX_MEMO_LENGTH) {
      return { index, message: "ボタン" + (index + 1) + "の名前は32文字以内で入力してください。" };
    }

    if (/[,"\r\n]/.test(name)) {
      return {
        index,
        message: "ボタン" + (index + 1) + "の名前に , 改行 ダブルクォートは使えません。"
      };
    }
  }

  return null;
}

function readMemoPresets() {
  try {
    const raw = window.localStorage.getItem(MEMO_PRESET_STORAGE_KEY);
    if (!raw) {
      return [...DEFAULT_MEMO_PRESETS];
    }

    const parsed = JSON.parse(raw);
    if (
      !Array.isArray(parsed) ||
      ![LEGACY_MEMO_PRESET_COUNT, DEFAULT_MEMO_PRESETS.length].includes(parsed.length)
    ) {
      return [...DEFAULT_MEMO_PRESETS];
    }

    const names = DEFAULT_MEMO_PRESETS.map((defaultName, index) => {
      if (index >= parsed.length) {
        return defaultName;
      }

      return typeof parsed[index] === "string" ? parsed[index].trim() : "";
    });
    return validateMemoPresetNames(names) ? [...DEFAULT_MEMO_PRESETS] : names;
  } catch (error) {
    console.error("Failed to read memo presets:", error);
    return [...DEFAULT_MEMO_PRESETS];
  }
}

function writeMemoPresets(names) {
  window.localStorage.setItem(MEMO_PRESET_STORAGE_KEY, JSON.stringify(names));
}

function pruneExpiredRecords(sourceRecords) {
  const cutoff = Date.now() - AUTO_DELETE_DAYS * 24 * 60 * 60 * 1000;
  return sourceRecords.filter((record) => {
    const date = new Date(record.datetime);
    return Number.isNaN(date.getTime()) || date.getTime() >= cutoff;
  });
}

function setFeedback(target, message, isError = false) {
  target.textContent = message;
  target.classList.toggle("is-error", isError);
}

function updateCategorySelection() {
  categoryButtons.forEach((button) => {
    const active = button.dataset.category === selectedCategory;
    button.classList.toggle("is-selected", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function resetEntryForm() {
  editingId = null;
  selectedCategory = "";
  entryForm.reset();
  updateCategorySelection();
  saveButton.textContent = "保存";
  cancelEditButton.hidden = true;
  setFeedback(entryFeedback, "");
}

function getTrimmedMemo() {
  return memoInput.value.trim();
}

function validateAmount(raw) {
  if (!/^\d+$/.test(raw)) {
    return "金額は整数で入力してください。";
  }

  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    return "金額は 1 以上で入力してください。";
  }

  if (value > MAX_AMOUNT) {
    return "金額は 999999 以下で入力してください。";
  }

  return "";
}

function validateMemo(memo) {
  if (memo.length > MAX_MEMO_LENGTH) {
    return "メモは 32 文字以内で入力してください。";
  }

  if (/[,"\r\n]/.test(memo)) {
    return "メモに , 改行 ダブルクォートは使えません。";
  }

  return "";
}

function validateEntry() {
  const amountValue = amountInput.value.trim();
  const amountError = validateAmount(amountValue);
  if (amountError) {
    return amountError;
  }

  if (!selectedCategory || !CATEGORIES.includes(selectedCategory)) {
    return "カテゴリを選択してください。";
  }

  const memoError = validateMemo(getTrimmedMemo());
  if (memoError) {
    return memoError;
  }

  return "";
}

function renderMemoPresets() {
  memoPresetButtons.forEach((button, index) => {
    button.textContent = memoPresets[index];
  });

  memoPresetNameInputs.forEach((input, index) => {
    input.value = memoPresets[index];
  });
}

function handleMemoPresetSettingsSubmit(event) {
  event.preventDefault();

  const names = memoPresetNameInputs.map((input) => input.value.trim());
  const error = validateMemoPresetNames(names);
  if (error) {
    setFeedback(memoPresetSettingsFeedback, error.message, true);
    memoPresetNameInputs[error.index]?.focus();
    return;
  }

  memoPresets = names;
  writeMemoPresets(memoPresets);
  renderMemoPresets();
  setFeedback(memoPresetSettingsFeedback, "ボタン名を保存しました。");
}

function renderSummary() {
  totalCountLabel.textContent = `全体 ${records.length} 件`;
}

function renderRecords() {
  const recentRecords = [...records].sort(sortByDatetimeDesc).slice(0, MAX_RECENT);
  recordsList.innerHTML = "";
  recordsEmpty.hidden = recentRecords.length > 0;

  recentRecords.forEach((record) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "record-button";
    button.dataset.recordId = record.id;

    const top = document.createElement("div");
    top.className = "record-top";

    const amount = document.createElement("p");
    amount.className = "record-amount";
    amount.textContent = `¥${formatAmount(record.amount)}`;

    top.append(amount);

    const bottom = document.createElement("div");
    bottom.className = "record-bottom";

    const meta = document.createElement("p");
    meta.className = "record-meta";
    meta.textContent = `${formatDisplayDateTime(record.datetime)} / ${record.category}`;

    const memo = document.createElement("p");
    memo.className = "record-memo";
    memo.textContent = record.memo || "メモなし";

    bottom.append(meta, memo);
    button.append(top, bottom);
    item.append(button);
    recordsList.append(item);
  });
}

function collectMonthlyTotals() {
  const now = new Date();
  const currentMonthDate = new Date(now.getFullYear(), now.getMonth(), 1);
  const previousMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const currentKey = `${currentMonthDate.getFullYear()}-${currentMonthDate.getMonth()}`;
  const previousKey = `${previousMonthDate.getFullYear()}-${previousMonthDate.getMonth()}`;
  const totals = {
    current: Object.fromEntries(CATEGORIES.map((category) => [category, 0])),
    previous: Object.fromEntries(CATEGORIES.map((category) => [category, 0]))
  };

  records.forEach((record) => {
    if (!CATEGORIES.includes(record.category)) {
      return;
    }

    const date = new Date(record.datetime);
    if (Number.isNaN(date.getTime())) {
      return;
    }

    const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
    const amount = Number(record.amount);
    if (!Number.isFinite(amount)) {
      return;
    }

    if (monthKey === currentKey) {
      totals.current[record.category] += amount;
    } else if (monthKey === previousKey) {
      totals.previous[record.category] += amount;
    }
  });

  return {
    currentMonthDate,
    previousMonthDate,
    totals
  };
}

function renderMonthlySummary() {
  monthlySummary.hidden = records.length === 0;
  monthlySummaryBody.innerHTML = "";
  currentMonthLabel.textContent = "今月";
  previousMonthLabel.textContent = "前月";

  if (records.length === 0) {
    return;
  }

  const { currentMonthDate, previousMonthDate, totals } = collectMonthlyTotals();
  currentMonthLabel.textContent = formatMonthHeading("今月", currentMonthDate);
  previousMonthLabel.textContent = formatMonthHeading("前月", previousMonthDate);

  let currentGrandTotal = 0;
  let previousGrandTotal = 0;

  CATEGORIES.forEach((category) => {
    const row = document.createElement("tr");

    const heading = document.createElement("th");
    heading.scope = "row";
    heading.textContent = category;

    const currentCell = document.createElement("td");
    currentCell.textContent = `¥${formatAmount(totals.current[category])}`;

    const previousCell = document.createElement("td");
    previousCell.textContent = `¥${formatAmount(totals.previous[category])}`;

    currentGrandTotal += totals.current[category];
    previousGrandTotal += totals.previous[category];
    row.append(heading, currentCell, previousCell);
    monthlySummaryBody.append(row);
  });

  const totalRow = document.createElement("tr");
  totalRow.className = "is-total";

  const totalHeading = document.createElement("th");
  totalHeading.scope = "row";
  totalHeading.textContent = "総額";

  const currentTotalCell = document.createElement("td");
  currentTotalCell.textContent = `¥${formatAmount(currentGrandTotal)}`;

  const previousTotalCell = document.createElement("td");
  previousTotalCell.textContent = `¥${formatAmount(previousGrandTotal)}`;

  totalRow.append(totalHeading, currentTotalCell, previousTotalCell);
  monthlySummaryBody.append(totalRow);
}

function renderAll() {
  renderSummary();
  renderRecords();
  renderMonthlySummary();
}

function startEdit(recordId) {
  const record = records.find((item) => item.id === recordId);
  if (!record) {
    return;
  }

  editingId = record.id;
  amountInput.value = String(record.amount);
  memoInput.value = record.memo;
  selectedCategory = record.category;
  updateCategorySelection();
  saveButton.textContent = "更新";
  cancelEditButton.hidden = false;
  setFeedback(entryFeedback, "編集中です。保存するとメール下書きを作成します。");
  amountInput.focus();
}

function createCsv(batch) {
  const lines = ["id,datetime,amount,category,memo,updatedAt"];
  batch.forEach((record) => {
    lines.push(
      [
        record.id,
        formatCsvDateTime(record.datetime),
        String(record.amount),
        record.category,
        record.memo,
        formatCsvDateTime(record.updatedAt)
      ].join(",")
    );
  });
  return lines.join("\r\n");
}

function buildMailtoUrl(email, body) {
  const params = new URLSearchParams({
    subject: MAIL_SUBJECT,
    body
  });
  return `mailto:${email}?${params.toString()}`;
}

function openMailDraft(email, record) {
  const csv = createCsv([record]);
  window.location.href = buildMailtoUrl(email, csv);
}

function validateEmail() {
  const email = emailInput.value.trim();
  emailInput.value = email;

  if (email && !emailInput.checkValidity()) {
    setFeedback(emailFeedback, "宛先メールアドレスの形式を確認してください。", true);
    emailInput.focus();
    return null;
  }

  setFeedback(emailFeedback, "");
  writeSavedEmail(email);
  return email;
}

function handleEntrySubmit(event) {
  event.preventDefault();

  const error = validateEntry();
  if (error) {
    setFeedback(entryFeedback, error, true);
    return;
  }

  const email = validateEmail();
  if (email === null) {
    return;
  }

  const now = new Date();
  const nowValue = formatOffsetDateTime(now);
  const amount = Number(amountInput.value.trim());
  const memo = getTrimmedMemo();

  if (editingId) {
    const current = records.find((record) => record.id === editingId);
    if (!current) {
      setFeedback(entryFeedback, "編集中のレコードが見つかりません。", true);
      resetEntryForm();
      return;
    }

    const updatedRecord = {
      id: current.id,
      datetime: current.datetime,
      amount,
      category: selectedCategory,
      memo,
      updatedAt: nowValue
    };
    const nextRecords = records.map((record) => (record.id === editingId ? updatedRecord : record));

    writeRecords(nextRecords);
    renderAll();
    resetEntryForm();
    setFeedback(entryFeedback, "更新しました。");
    openMailDraft(email, updatedRecord);
    return;
  }

  const record = {
    id: createRecordId(now),
    datetime: nowValue,
    amount,
    category: selectedCategory,
    memo,
    updatedAt: nowValue
  };

  writeRecords([record, ...records]);
  renderAll();
  resetEntryForm();
  setFeedback(entryFeedback, "保存しました。");
  openMailDraft(email, record);
}

function sanitizeNumericInput(event) {
  const nextValue = event.target.value.replace(/\D+/g, "").slice(0, 6);
  if (event.target.value !== nextValue) {
    event.target.value = nextValue;
  }
}

function sanitizeMemoInput(event) {
  const nextValue = event.target.value.replace(/[,"\r\n]/g, "").slice(0, MAX_MEMO_LENGTH);
  if (event.target.value !== nextValue) {
    event.target.value = nextValue;
  }
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  navigator.serviceWorker.register("./sw.js").catch((error) => {
    console.error("Service Worker registration failed:", error);
  });
}

function initialize() {
  records = pruneExpiredRecords(readRecords()).sort(sortByDatetimeDesc);
  writeRecords(records);
  emailInput.value = readSavedEmail();
  memoPresets = readMemoPresets();
  renderAll();
  renderMemoPresets();
  registerServiceWorker();
  amountInput.focus();
}

categoryButtons.forEach((button) => {
  button.addEventListener("click", () => {
    selectedCategory = button.dataset.category ?? "";
    updateCategorySelection();
    setFeedback(entryFeedback, "");
  });
});

memoPresetButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const index = Number(button.dataset.presetIndex);
    if (!Number.isInteger(index) || !memoPresets[index]) {
      return;
    }

    memoInput.value = memoPresets[index];
    setFeedback(entryFeedback, "");
  });
});

entryForm.addEventListener("submit", handleEntrySubmit);
memoPresetSettingsForm.addEventListener("submit", handleMemoPresetSettingsSubmit);
cancelEditButton.addEventListener("click", () => {
  resetEntryForm();
  amountInput.focus();
});
amountInput.addEventListener("input", sanitizeNumericInput);
memoInput.addEventListener("input", sanitizeMemoInput);
emailInput.addEventListener("change", () => {
  const email = emailInput.value.trim();
  emailInput.value = email;
  if (!email || emailInput.checkValidity()) {
    writeSavedEmail(email);
    setFeedback(emailFeedback, "");
  } else {
    setFeedback(emailFeedback, "宛先メールアドレスの形式を確認してください。", true);
  }
});
recordsList.addEventListener("click", (event) => {
  const button = event.target.closest(".record-button");
  if (!button) {
    return;
  }

  startEdit(button.dataset.recordId);
});
window.addEventListener("load", initialize);
