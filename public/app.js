(function () {
  "use strict";

  const form = document.getElementById("form");
  const statusEl = document.getElementById("status");
  const generateBtn = document.getElementById("generateBtn");

  function renderChips(container, items, mode, exampleMap) {
    container.innerHTML = "";
    items.forEach((text) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip";
      if (exampleMap && exampleMap[text]) {
        btn.classList.add("chip-example");
        btn.title = "클릭하면 범죄사실 작성례가 자동으로 채워집니다.";
      }
      btn.textContent = text;
      btn.addEventListener("click", () => applyChip(container, text, mode, exampleMap));
      container.appendChild(btn);
    });
  }

  function applyChip(container, text, mode, exampleMap) {
    const fieldName = container.dataset.chipsFor;
    const field = form.elements[fieldName];
    if (!field) return;
    if (mode === "append-line") {
      const current = field.value.replace(/\s+$/, "");
      field.value = current ? current + "\n" + text : text;
    } else {
      field.value = text;
    }
    field.focus();

    if (fieldName === "crimeName" && exampleMap && exampleMap[text]) {
      fillCrimeFactsExample(text, exampleMap[text]);
    }
  }

  function fillCrimeFactsExample(crimeName, exampleText) {
    const crimeFactsField = form.elements["crimeFacts"];
    if (!crimeFactsField) return;
    const current = crimeFactsField.value.trim();
    if (current && current !== exampleText.trim()) {
      const ok = window.confirm(
        '"' + crimeName + '" 작성례로 범죄사실 칸을 채우면 지금 입력된 내용이 지워집니다. 계속할까요?'
      );
      if (!ok) return;
    }
    crimeFactsField.value = exampleText;
    crimeFactsField.focus();
    statusEl.classList.remove("err");
    statusEl.textContent =
      "작성례를 불러왔습니다. 실제 사건의 일시ㆍ장소ㆍ금액 등으로 반드시 고쳐 쓰세요.";
  }

  function appendEvidenceLine(text) {
    const field = form.elements["crimeCircumstances"];
    if (!field || !text) return;
    const current = field.value.replace(/\s+$/, "");
    field.value = current ? current + "\n" + text : text;
    field.focus();
  }

  function setupEvidencePicker(categories) {
    const groupsEl = document.getElementById("evidenceGroups");
    const itemsEl = document.getElementById("evidenceItems");
    const manualInput = document.getElementById("evidenceManualInput");
    const manualAddBtn = document.getElementById("evidenceManualAdd");
    if (!groupsEl || !itemsEl || !manualInput || !manualAddBtn) return;

    let selectedGroup = null;

    function renderItems() {
      itemsEl.innerHTML = "";
      if (!selectedGroup) return;
      if (!selectedGroup.items.length) {
        const hint = document.createElement("span");
        hint.className = "hint";
        hint.textContent = '"' + selectedGroup.group + '" 항목은 아래 입력칸에 직접 입력해서 추가하세요.';
        itemsEl.appendChild(hint);
        return;
      }
      selectedGroup.items.forEach((item) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "chip";
        btn.textContent = item;
        btn.addEventListener("click", () => {
          appendEvidenceLine(selectedGroup.group + " : " + item);
        });
        itemsEl.appendChild(btn);
      });
    }

    groupsEl.innerHTML = "";
    categories.forEach((cat) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip";
      btn.textContent = cat.group;
      btn.addEventListener("click", () => {
        selectedGroup = cat;
        groupsEl.querySelectorAll(".chip").forEach((c) => c.classList.remove("chip-selected"));
        btn.classList.add("chip-selected");
        renderItems();
      });
      groupsEl.appendChild(btn);
    });

    manualAddBtn.addEventListener("click", () => {
      const value = manualInput.value.trim();
      if (!value) return;
      appendEvidenceLine(selectedGroup ? selectedGroup.group + " : " + value : value);
      manualInput.value = "";
      manualInput.focus();
    });
    manualInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        manualAddBtn.click();
      }
    });
  }

  fetch("/api/presets")
    .then((r) => r.json())
    .then((presets) => {
      renderChips(
        document.querySelector('[data-chips-for="crimeName"]'),
        presets.CRIME_NAME_PRESETS,
        "replace",
        presets.CRIME_FACTS_EXAMPLES
      );
      renderChips(
        document.querySelector('[data-chips-for="seizureItems"]'),
        presets.SEIZURE_ITEM_PRESETS,
        "append-line"
      );
      renderChips(
        document.querySelector('[data-chips-for="searchPlace"]'),
        presets.SEARCH_PLACE_PRESETS,
        "append-line"
      );
      document.getElementById("crimeFactsStarter").addEventListener("click", () => {
        const field = form.elements["crimeFacts"];
        field.value = field.value ? field.value : presets.CRIME_FACTS_STARTER;
        field.focus();
      });
      setupEvidencePicker(presets.EVIDENCE_CATEGORIES || []);
    })
    .catch(() => {
      statusEl.textContent = "프리셋을 불러오지 못했습니다 (직접 입력은 가능합니다).";
    });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    statusEl.classList.remove("err");
    statusEl.textContent = "생성 중...";
    generateBtn.disabled = true;

    const data = Object.fromEntries(new FormData(form).entries());

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "생성에 실패했습니다.");
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = /filename\*=UTF-8''([^;]+)/.exec(disposition);
      const fileName = match ? decodeURIComponent(match[1]) : "압수수색영장신청서.hwpx";

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      statusEl.textContent = "생성 완료: " + fileName + " (output 폴더에도 저장됨)";
    } catch (err) {
      statusEl.classList.add("err");
      const isNetworkError = err instanceof TypeError;
      statusEl.textContent = isNetworkError
        ? "서버에 연결할 수 없습니다. start.bat 실행창이 열려 있는지 확인한 뒤 이 페이지를 새로고침해주세요."
        : "오류: " + err.message;
    } finally {
      generateBtn.disabled = false;
    }
  });
})();
