(function () {
  "use strict";

  // --- 화면 전환 (1/2/3번 탭) ---
  // 분리된 페이지였던 기존 버전과 달리 이 단일 파일은 탭을 눌러도 스크립트가
  // 다시 실행되지 않는다 — 그래서 "1번에서 생성하면 3번에 이어받기" 같은
  // 로직은 페이지 로드 시 한 번만이 아니라 탭을 보여줄 때마다 다시 실행해야
  // 한다. show()가 "view:show" 커스텀 이벤트를 쏘고, 각 화면의 초기화
  // 함수가 필요하면 그걸 구독해서 반응한다.
  function initTabs() {
    const links = Array.from(document.querySelectorAll(".tool-nav-link"));
    const panels = Array.from(document.querySelectorAll("[data-view-panel]"));
    function show(view) {
      panels.forEach((p) => {
        p.hidden = p.dataset.viewPanel !== view;
      });
      links.forEach((a) => {
        a.classList.toggle("tool-nav-link-active", a.dataset.view === view);
      });
      window.dispatchEvent(new CustomEvent("view:show", { detail: view }));
    }
    links.forEach((a) => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        show(a.dataset.view);
        window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
      });
    });
    show("apply");
  }

  // ========================================================================
  // 1. 영장신청서 작성
  // ========================================================================
  function initApplyForm() {
    const form = document.getElementById("form");
    const statusEl = document.getElementById("status");
    const generateBtn = document.getElementById("generateBtn");
    if (!form) return;

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

    let lastAutoFilledCrimeFacts = null;

    function fillCrimeFactsExample(crimeFactsExamples, crimeName) {
      const crimeFactsField = form.elements["crimeFacts"];
      if (!crimeFactsField) return;
      const example = crimeFactsExamples[crimeName] || "";
      if (example) {
        crimeFactsField.value = example;
        lastAutoFilledCrimeFacts = example;
      } else if (crimeFactsField.value === lastAutoFilledCrimeFacts) {
        crimeFactsField.value = "";
        lastAutoFilledCrimeFacts = null;
      }
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
            appendLine(form.elements["crimeContext"], item);
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
        appendLine(form.elements["crimeContext"], value);
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

    function setupNecessityReasonTypes(types) {
      const container = document.getElementById("necessityReasonTypes");
      if (!container) return;
      container.innerHTML = "";
      types.forEach((t) => {
        const anchor = document.createElement("span");
        anchor.className = "tip-anchor necessity-type-anchor";

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "chip";
        btn.textContent = t.type;
        btn.addEventListener("click", () => {
          appendLine(form.elements["necessityReason"], t.example);
        });

        const bubble = document.createElement("span");
        bubble.className = "tip-bubble tip-bubble-wide";
        bubble.textContent = t.purpose;

        anchor.appendChild(btn);
        anchor.appendChild(bubble);
        container.appendChild(anchor);
      });
    }

    const presets = window.AppData;
    renderChips(
      document.querySelector('[data-chips-for="crimeName"]'),
      presets.CRIME_NAME_PRESETS,
      "replace",
      (crimeName) => fillCrimeFactsExample(presets.CRIME_FACTS_EXAMPLES, crimeName)
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
    setupNecessityReasonTypes(presets.NECESSITY_REASON_TYPES || []);
    setupEvidencePicker(presets.EVIDENCE_CATEGORIES || []);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      statusEl.classList.remove("err");
      statusEl.textContent = "생성 중...";
      generateBtn.disabled = true;

      const data = Object.fromEntries(new FormData(form).entries());

      try {
        const { blob, fileName } = await generateApplicationZip(data);
        downloadBlob(blob, fileName);
        statusEl.textContent = "생성 완료: " + fileName + " (이 PC에는 별도로 저장되지 않았습니다 — 지금 받은 파일이 유일한 사본입니다)";

        try {
          sessionStorage.setItem(
            "영장신청서_이어쓰기데이터",
            JSON.stringify({
              orgName: data.orgName || "",
              suspectName: data.suspectName || "",
              crimeName: data.crimeName || "",
            })
          );
        } catch (err) {
          // 무시 — 이어받기는 편의 기능일 뿐
        }
      } catch (err) {
        statusEl.classList.add("err");
        statusEl.textContent = "오류: " + err.message;
      } finally {
        generateBtn.disabled = false;
      }
    });
  }

  // ========================================================================
  // 2. 영장집행순서 체크리스트
  // ========================================================================
  function initChecklist() {
    const container = document.getElementById("phases");
    if (!container) return;

    const STORAGE_KEY = "영장집행순서체크리스트_진행상태";

    function loadChecked() {
      try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      } catch (e) {
        return {};
      }
    }
    function saveChecked(checked) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(checked));
      } catch (e) {
        // 무시
      }
    }

    function renderPhases(phases) {
      const checked = loadChecked();
      let allStepIds = [];

      container.innerHTML = "";
      phases.forEach((phase, phaseIndex) => {
        const card = document.createElement("section");
        card.className = "card checklist-phase";

        const h2 = document.createElement("h2");
        h2.textContent = (phaseIndex + 1) + ". " + phase.phase;
        card.appendChild(h2);

        phase.steps.forEach((step) => {
          allStepIds.push(step.id);

          const item = document.createElement("label");
          item.className = "checklist-item";

          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.checked = !!checked[step.id];
          checkbox.addEventListener("change", () => {
            checked[step.id] = checkbox.checked;
            saveChecked(checked);
            item.classList.toggle("checklist-item-done", checkbox.checked);
            updateProgress(allStepIds, checked);
          });

          const body = document.createElement("div");
          body.className = "checklist-item-body";

          const title = document.createElement("div");
          title.className = "checklist-item-title";
          title.textContent = step.title;
          if (step.formRef) {
            const tag = document.createElement("span");
            tag.className = "section-tag";
            tag.textContent = step.formRef;
            title.appendChild(tag);
          }
          body.appendChild(title);

          if (step.detail) {
            const detail = document.createElement("p");
            detail.className = "checklist-item-detail";
            detail.textContent = step.detail;
            body.appendChild(detail);
          }
          if (step.legalBasis) {
            const basis = document.createElement("p");
            basis.className = "checklist-item-basis";
            basis.textContent = "근거: " + step.legalBasis;
            body.appendChild(basis);
          }
          if (step.warn) {
            const warn = document.createElement("p");
            warn.className = "checklist-item-warn";
            warn.textContent = "주의: " + step.warn;
            body.appendChild(warn);
          }

          item.appendChild(checkbox);
          item.appendChild(body);
          if (checkbox.checked) item.classList.add("checklist-item-done");
          card.appendChild(item);
        });

        container.appendChild(card);
      });

      updateProgress(allStepIds, checked);

      document.getElementById("resetBtn").addEventListener("click", () => {
        if (!confirm("체크 표시를 모두 초기화할까요?")) return;
        localStorage.removeItem(STORAGE_KEY);
        renderPhases(phases);
      });
    }

    function updateProgress(allStepIds, checked) {
      const total = allStepIds.length;
      const done = allStepIds.filter((id) => checked[id]).length;
      const pct = total ? Math.round((done / total) * 100) : 0;
      document.getElementById("progressFill").style.width = pct + "%";
      document.getElementById("progressLabel").textContent = done + " / " + total + " 완료";
    }

    renderPhases(window.AppData.EXECUTION_CHECKLIST || []);
  }

  // ========================================================================
  // 3. 집행 후 서식 작성
  // ========================================================================
  function initExecutionForm() {
    const form = document.getElementById("execForm");
    const statusEl = document.getElementById("execStatus");
    const generateBtn = document.getElementById("execGenerateBtn");
    if (!form) return;

    // 탭 전환은 페이지 재실행이 아니므로, 1번 화면에서 "생성"을 누른 시점에
    // sessionStorage가 채워질 수 있다 — 이 화면을 보여줄 때마다 다시
    // 확인한다. 이미 사용자가 입력해 둔 값은 덮어쓰지 않는다.
    function syncCarriedOverData() {
      try {
        const carried = JSON.parse(sessionStorage.getItem("영장신청서_이어쓰기데이터") || "null");
        if (!carried) return;
        if (carried.orgName && !form.elements["orgName"].value) form.elements["orgName"].value = carried.orgName;
        if (carried.suspectName && !form.elements["suspectName"].value) form.elements["suspectName"].value = carried.suspectName;
        if (carried.crimeName && !form.elements["crimeName"].value) form.elements["crimeName"].value = carried.crimeName;
      } catch (e) {
        // 무시
      }
    }
    syncCarriedOverData();
    window.addEventListener("view:show", (e) => {
      if (e.detail === "execution") syncCarriedOverData();
    });

    const participantsEl = document.getElementById("participants");
    const MAX_PARTICIPANTS = 4;

    function addParticipantRow(values) {
      values = values || {};
      if (participantsEl.children.length >= MAX_PARTICIPANTS) return;
      const row = document.createElement("div");
      row.className = "repeat-row";
      row.innerHTML =
        '<input type="text" class="p-name" placeholder="성명" />' +
        '<input type="text" class="p-rrn" placeholder="주민등록번호" />' +
        '<input type="text" class="p-address" placeholder="주소" />' +
        '<button type="button" class="chip remove-row">삭제</button>';
      row.querySelector(".p-name").value = values.name || "";
      row.querySelector(".p-rrn").value = values.rrn || "";
      row.querySelector(".p-address").value = values.address || "";
      row.querySelector(".remove-row").addEventListener("click", () => row.remove());
      participantsEl.appendChild(row);
    }

    document.getElementById("addParticipant").addEventListener("click", () => addParticipantRow());
    addParticipantRow();

    function collectParticipants() {
      return Array.from(participantsEl.querySelectorAll(".repeat-row"))
        .map((row) => ({
          name: row.querySelector(".p-name").value.trim(),
          rrn: row.querySelector(".p-rrn").value.trim(),
          address: row.querySelector(".p-address").value.trim(),
        }))
        .filter((p) => p.name || p.rrn || p.address);
    }

    const itemsEl = document.getElementById("items");
    const MAX_ITEMS = 7;

    function addItemRow(values) {
      values = values || {};
      if (itemsEl.children.length >= MAX_ITEMS) return;
      const row = document.createElement("div");
      row.className = "repeat-row";
      row.innerHTML =
        '<input type="text" class="i-name" placeholder="품종 (예: 삼성 갤럭시노트10, 시리얼번호 0000)" />' +
        '<input type="text" class="i-qty" placeholder="수량 (예: 1대)" />' +
        '<input type="text" class="i-note" placeholder="비고" />' +
        '<button type="button" class="chip remove-row">삭제</button>';
      row.querySelector(".i-name").value = values.name || "";
      row.querySelector(".i-qty").value = values.qty || "";
      row.querySelector(".i-note").value = values.note || "";
      row.querySelector(".remove-row").addEventListener("click", () => row.remove());
      itemsEl.appendChild(row);
    }

    document.getElementById("addItem").addEventListener("click", () => addItemRow());
    addItemRow();

    function collectItems() {
      return Array.from(itemsEl.querySelectorAll(".repeat-row"))
        .map((row) => ({
          name: row.querySelector(".i-name").value.trim(),
          qty: row.querySelector(".i-qty").value.trim(),
          note: row.querySelector(".i-note").value.trim(),
        }))
        .filter((it) => it.name || it.qty || it.note);
    }

    document.getElementById("copySuspectToHolder").addEventListener("click", () => {
      document.getElementById("holderName").value = form.elements["suspectName"].value;
    });
    document.getElementById("copyHolderToOwner").addEventListener("click", () => {
      document.getElementById("ownerName").value = document.getElementById("holderName").value;
      document.getElementById("ownerAddress").value = document.getElementById("holderAddress").value;
      document.getElementById("ownerRRN").value = document.getElementById("holderRRN").value;
      document.getElementById("ownerPhone").value = document.getElementById("holderPhone").value;
    });

    function fieldVal(id) {
      const el = document.getElementById(id);
      return el ? el.value.trim() : "";
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      statusEl.classList.remove("err");
      statusEl.textContent = "생성 중...";
      generateBtn.disabled = true;

      const data = Object.fromEntries(new FormData(form).entries());
      data.participants = collectParticipants();
      data.items = collectItems();
      data.holder = {
        name: fieldVal("holderName"),
        address: fieldVal("holderAddress"),
        rrn: fieldVal("holderRRN"),
        phone: fieldVal("holderPhone"),
      };
      data.owner = {
        name: fieldVal("ownerName"),
        address: fieldVal("ownerAddress"),
        rrn: fieldVal("ownerRRN"),
        phone: fieldVal("ownerPhone"),
      };

      try {
        const { blob, fileName } = await generateExecutionFormsZip(data);
        downloadBlob(blob, fileName);
        statusEl.textContent = "생성 완료: " + fileName + " (이 PC에는 별도로 저장되지 않았습니다 — 지금 받은 파일이 유일한 사본입니다)";
      } catch (err) {
        statusEl.classList.add("err");
        statusEl.textContent = "오류: " + err.message;
      } finally {
        generateBtn.disabled = false;
      }
    });
  }

  initTabs();
  initApplyForm();
  initChecklist();
  initExecutionForm();
})();
