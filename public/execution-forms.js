(function () {
  "use strict";

  function initApp() {
    const form = document.getElementById("form");
    const statusEl = document.getElementById("status");
    const generateBtn = document.getElementById("generateBtn");

    // --- 1번 화면(영장신청서 작성)에서 바로 넘어온 경우, 겹치는 항목(기관명ㆍ
    // 피의자 성명ㆍ죄명)만 이어받는다. sessionStorage는 이 탭을 닫으면
    // 사라지므로, 1번 화면의 "저장하지 않음" 원칙과 충돌하지 않는다. ---
    try {
      const carried = JSON.parse(sessionStorage.getItem("영장신청서_이어쓰기데이터") || "null");
      if (carried) {
        if (carried.orgName) form.elements["orgName"].value = carried.orgName;
        if (carried.suspectName) form.elements["suspectName"].value = carried.suspectName;
        if (carried.crimeName) form.elements["crimeName"].value = carried.crimeName;
      }
    } catch (e) {
      // 무시 — 이어받기는 편의 기능일 뿐, 실패해도 화면은 그대로 동작해야 함
    }

    // --- 참여인 반복 입력 (최대 4명) ---
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

    // --- 압수목록 품목 반복 입력 (최대 7건) ---
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

    // --- 소지자/소유자 보조 버튼 ---
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
        const res = await fetch("/api/generate-execution-forms", {
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
        const fileName = match ? decodeURIComponent(match[1]) : "영장집행서식.zip";

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
