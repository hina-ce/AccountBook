const STORAGE_KEY = "expense-pwa-records-v1";
const EMAIL_STORAGE_KEY = "expense-pwa-email-v1";
const MAX_RECENT = 10;
const MAX_BATCH_SIZE = 10;
const MAX_AMOUNT = 999999;
const MAX_MEMO_LENGTH = 32;
const AUTO_DELETE_DAYS = 60;
const MAIL_SUBJECT = "kakeibo-pwa-export";
const CATEGORIES = ["食費", "外食費", "交際費", "娯楽費", "医療費", "雑費"];

const entryForm = document.getElementById("entry-form");
const amountInput = document.getElementById("amount-input");
const memoInput = document.getElementById("memo-input");
const emailInput = document.getElementById("email-input");
const saveButton = document.getElementById("save-button");
const cancelEditButton = document.getElementById("cancel-edit-button");
const sendButton = document.getElementById("send-button");
const categoryButtons = Array.from(document.querySelectorAll(".category-chip"));
const entryFeedback = document.getElementById("entry-feedback");
const sendFeedback = document.getElementById("send-feedback");
const recordsList = document.getElementById("records-list");
const recordsEmpty = document.getElementById("records-empty");
const entryMode = document.getElementById("entry-mode");
const unsentStatus = document.getElementById("unsent-status");
const unsentCount = document.getElementById("unsent-count");
const totalCountLabel = document.getElementById("total-count-label");
const batchStatus = document.getElementById("batch-status");
const networkStatus = document.getElementById("network-status");

let records = [];
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

function sortByDatetimeAsc(left, right) {
  return new Date(left.datetime).getTime() - new Date(right.datetime).getTime();
}

function readRecords() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("Failed to read local records:", error);
    return [];
  }
}

function writeRecords(nextRecords) {
  records = [...nextRecords].sort(sortByDatetimeDesc);
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

function pruneExpiredRecords(sourceRecords) {
  const cutoff = Date.now() - AUTO_DELETE_DAYS * 24 * 60 * 60 * 1000;
  return sourceRecords.filter((record) => {
    if (!record.sentAt) {
      return true;
    }

    const date = new Date(record.datetime);
    return Number.isNaN(date.getTime()) || date.getTime() >= cutoff;
  });
}

function setFeedback(target, message, isError = false) {
  target.textContent = message;
  target.classList.toggle("is-error", isError);
}

function updateNetworkStatus() {
  networkStatus.textContent = navigator.onLine ? "オンライン" : "オフライン";
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
  entryMode.textContent = "新規";
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

function renderSummary() {
  const unsent = records.filter((record) => record.sentAt === null).length;
  unsentCount.textContent = String(unsent);
  unsentStatus.textContent = `未送信 ${unsent} 件`;
  totalCountLabel.textContent = `全体 ${records.length} 件`;
  batchStatus.textContent = unsent > MAX_BATCH_SIZE ? `次回 ${MAX_BATCH_SIZE} 件` : "1通最大10件";
  sendButton.disabled = unsent === 0;
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

    const tag = document.createElement("span");
    tag.className = `record-tag${record.sentAt ? " is-sent" : ""}`;
    tag.textContent = record.sentAt ? "送信済み" : "未送信";

    top.append(amount, tag);

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

function renderAll() {
  renderSummary();
  renderRecords();
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
  entryMode.textContent = "編集中";
  saveButton.textContent = "更新";
  cancelEditButton.hidden = false;
  setFeedback(entryFeedback, "編集中です。保存すると再送対象になります。");
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

function openMailDraft(email, batch) {
  const csv = createCsv(batch);
  window.location.href = buildMailtoUrl(email, csv);
}

function createMailBatch() {
  const email = emailInput.value.trim();
  if (email && !emailInput.checkValidity()) {
    setFeedback(sendFeedback, "送信先メールアドレスの形式を確認してください。", true);
    emailInput.focus();
    return;
  }

  const unsentRecords = records.filter((record) => record.sentAt === null).sort(sortByDatetimeAsc);
  const batch = unsentRecords.slice(0, MAX_BATCH_SIZE);
  if (batch.length === 0) {
    setFeedback(sendFeedback, "未送信データはありません。");
    return;
  }

  const sentAt = formatOffsetDateTime(new Date());
  const nextRecords = records.map((record) =>
    batch.some((item) => item.id === record.id) ? { ...record, sentAt } : record
  );

  writeRecords(nextRecords);
  writeSavedEmail(email);
  renderAll();
  const remaining = records.filter((record) => record.sentAt === null).length;
  setFeedback(
    sendFeedback,
    `${batch.length} 件のメールを作成しました。${remaining > 0 ? `残り ${remaining} 件です。` : "未送信はありません。"}`
  );
  openMailDraft(email, batch);
}

function handleEntrySubmit(event) {
  event.preventDefault();

  const error = validateEntry();
  if (error) {
    setFeedback(entryFeedback, error, true);
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

    const nextRecords = records.map((record) =>
      record.id === editingId
        ? {
            ...record,
            amount,
            category: selectedCategory,
            memo,
            updatedAt: nowValue,
            sentAt: null
          }
        : record
    );

    writeRecords(nextRecords);
    renderAll();
    resetEntryForm();
    setFeedback(entryFeedback, "更新しました。");
    amountInput.focus();
    return;
  }

  const record = {
    id: createRecordId(now),
    datetime: nowValue,
    amount,
    category: selectedCategory,
    memo,
    updatedAt: nowValue,
    sentAt: null
  };

  writeRecords([record, ...records]);
  renderAll();
  resetEntryForm();
  setFeedback(entryFeedback, "保存しました。");
  amountInput.focus();
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
  renderAll();
  updateNetworkStatus();
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

entryForm.addEventListener("submit", handleEntrySubmit);
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
  }
});
sendButton.addEventListener("click", createMailBatch);
recordsList.addEventListener("click", (event) => {
  const button = event.target.closest(".record-button");
  if (!button) {
    return;
  }

  startEdit(button.dataset.recordId);
});
window.addEventListener("online", updateNetworkStatus);
window.addEventListener("offline", updateNetworkStatus);
window.addEventListener("load", initialize);
