(function () {
  "use strict";

  // 체크 상태는 사건 정보를 담지 않는 단순 진행 표시(항목 id -> true/false)이므로
  // localStorage에 남겨도 신청서 쪽 "PC에 저장하지 않음" 보안 원칙과 충돌하지 않는다.
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
      // 저장 불가(프라이빗 모드 등)여도 화면 동작에는 지장 없음
    }
  }

  function renderPhases(phases) {
    const container = document.getElementById("phases");
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

  fetch("/api/checklist")
    .then((r) => r.json())
    .then((data) => renderPhases(data.EXECUTION_CHECKLIST || []))
    .catch(() => {
      document.getElementById("phases").textContent = "체크리스트를 불러오지 못했습니다.";
    });
})();
