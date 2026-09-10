(function () {
  "use strict";

  function initApp() {
    const form = document.getElementById("form");
    const statusEl = document.getElementById("status");
    const generateBtn = document.getElementById("generateBtn");

    function renderChips(container, items, mode, onSelect) {
      container.innerHTML = "";
      items.forEach((text) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "chip";
        btn.textContent = text;
        btn.addEventListener("click", () => {
          applyChip(container, text, mode);
          if (onSelect) onSelect(text);
        });
        container.appendChild(btn);
      });
    }

    function fillCrimeFactsExample(crimeFactsExamples, crimeName) {
      const example = crimeFactsExamples[crimeName];
      if (!example) return;
      const crimeFactsField = form.elements["crimeFacts"];
      if (!crimeFactsField) return;
      crimeFactsField.value = example;
    }

    function appendLine(field, text) {
      const current = field.value.replace(/\s+$/, "");
      field.value = current ? current + "\n" + text : text;
      field.focus();
    }

    function applyChip(container, text, mode) {
      const fieldName = container.dataset.chipsFor;
      const field = form.elements[fieldName];
      if (!field) return;
      if (mode === "append-line") {
        appendLine(field, text);
      } else {
        field.value = text;
        field.focus();
      }
    }

    function wireAddressAdd(buttonId, inputId, labelPrefix) {
      const btn = document.getElementById(buttonId);
      const input = document.getElementById(inputId);
      btn.addEventListener("click", () => {
        const addr = input.value.trim();
        if (!addr) {
          input.focus();
          return;
        }
        appendLine(form.elements["searchPlace"], labelPrefix + ": " + addr);
        input.value = "";
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          btn.click();
        }
      });
    }

    wireAddressAdd("addResidence", "residenceAddr", "피의자의 주거지");
    wireAddressAdd("addWorkplace", "workplaceAddr", "피의자가 운영하는 사업장");

    function wireUseSuspectAddress(buttonId) {
      const btn = document.getElementById(buttonId);
      const suspectAddressField = form.elements["suspectAddress"];
      if (!btn || !suspectAddressField) return;
      const syncState = () => {
        btn.disabled = !suspectAddressField.value.trim();
      };
      syncState();
      suspectAddressField.addEventListener("input", syncState);
      btn.addEventListener("click", () => {
        const addr = suspectAddressField.value.trim();
        if (!addr) {
          suspectAddressField.focus();
          return;
        }
        appendLine(form.elements["searchPlace"], "피의자의 주거지: " + addr);
      });
    }

    wireUseSuspectAddress("useSuspectAddress");

    function setupEvidencePicker(categories) {
      const categoriesEl = document.getElementById("evidenceCategories");
      const groupsEl = document.getElementById("evidenceGroups");
      const itemsEl = document.getElementById("evidenceItems");
      const manualInput = document.getElementById("evidenceManualInput");
      const manualAddBtn = document.getElementById("evidenceManualAdd");
      if (!categoriesEl || !groupsEl || !itemsEl || !manualInput || !manualAddBtn) return;

      let selectedCategory = null;
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
          btn.className = "chip chip-level3";
          btn.textContent = item;
          btn.addEventListener("click", () => {
            appendLine(form.elements["crimeContext"], selectedGroup.group + " : " + item);
          });
          itemsEl.appendChild(btn);
        });
      }

      function renderGroups() {
        groupsEl.innerHTML = "";
        itemsEl.innerHTML = "";
        selectedGroup = null;
        if (!selectedCategory) return;
        selectedCategory.groups.forEach((g) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "chip chip-level2";
          btn.textContent = g.group;
          btn.addEventListener("click", () => {
            selectedGroup = g;
            groupsEl.querySelectorAll(".chip").forEach((c) => c.classList.remove("chip-selected"));
            btn.classList.add("chip-selected");
            renderItems();
          });
          groupsEl.appendChild(btn);
        });
      }

      categoriesEl.innerHTML = "";
      categories.forEach((cat) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "chip chip-level1";
        btn.textContent = cat.category;
        btn.addEventListener("click", () => {
          selectedCategory = cat;
          categoriesEl.querySelectorAll(".chip").forEach((c) => c.classList.remove("chip-selected"));
          btn.classList.add("chip-selected");
          renderGroups();
        });
        categoriesEl.appendChild(btn);
      });

      manualAddBtn.addEventListener("click", () => {
        const value = manualInput.value.trim();
        if (!value) return;
        appendLine(form.elements["crimeContext"], selectedGroup ? selectedGroup.group + " : " + value : value);
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
        const crimeFactsExamples = presets.CRIME_FACTS_EXAMPLES || {};
        renderChips(
          document.querySelector('[data-chips-for="crimeName"]'),
          presets.CRIME_NAME_PRESETS,
          "replace",
          (crimeName) => fillCrimeFactsExample(crimeFactsExamples, crimeName)
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

        statusEl.textContent = "생성 완료: " + fileName + " (이 PC에는 별도로 저장되지 않았습니다 — 지금 받은 파일이 유일한 사본입니다)";
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
  }

  initApp();
})();
