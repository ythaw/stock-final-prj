document.getElementById("search-form").addEventListener("submit", function (event) {
    event.preventDefault();

    const ticker = document.getElementById("ticker").value.trim();
    const resultDiv = document.getElementById("result");
    resultDiv.textContent = "";

    if (!ticker) {
        alert("Please fill out this field");
        return;
    }

    fetch(`/search?ticker=${encodeURIComponent(ticker)}`)
    .then(response => {
        const cacheStatus = response.headers.get("X-Cache");
        return response.json().then(data => ({ data, cacheStatus }));
    })
    .then(({ data, cacheStatus }) => {
        const cacheBox = document.getElementById("cache-status");
        const resultDiv = document.getElementById("result");

        // cache message
        if (cacheStatus === "HIT") {
            cacheBox.textContent = "Served from cache";
            cacheBox.style.color = "white";
        } else {
            cacheBox.textContent = "Fetched from Tiingo (not cached)";
            cacheBox.style.color = "grey";
        }

        // error case
        if (data.error) {
            document.getElementById("results-container").style.display = "block";
            document.getElementById("tabs-tables").style.display = "none";
            cacheBox.textContent = "";
            resultDiv.textContent = data.error;
            return;
        }

        // success case
        document.getElementById("results-container").style.display = "block";
        document.getElementById("tabs-tables").style.display = "block";
        resultDiv.textContent = "";
        activateTab("summary-tab");

        fillCompanyTab(data.company);

        const stock = data.stock;
        const last = stock.last != null ? stock.last : stock.tngoLast;
        const prevClose = stock.prevClose;
        const change = last - prevClose;
        const changePct = (change / prevClose) * 100;

        document.getElementById("sum-ticker").textContent = stock.ticker || "";
        document.getElementById("sum-day").textContent =
            stock.timestamp ? stock.timestamp.split("T")[0] : "";
        document.getElementById("sum-prev-close").textContent = prevClose?.toFixed(2) ?? "";
        document.getElementById("sum-open").textContent = stock.open?.toFixed(2) ?? "";
        document.getElementById("sum-high").textContent = stock.high?.toFixed(2) ?? "";
        document.getElementById("sum-low").textContent = stock.low?.toFixed(2) ?? "";
        document.getElementById("sum-last").textContent = last?.toFixed(2) ?? "";
        document.getElementById("sum-volume").textContent =
            stock.volume?.toLocaleString() ?? "";

        const changeCell = document.getElementById("sum-change");
        const changePctCell = document.getElementById("sum-change-pct");

        changeCell.textContent = "";
        changePctCell.textContent = "";

        const arrowImg = document.createElement("img");
        arrowImg.className = "arrow";
        arrowImg.src = change >= 0
            ? "/static/images/GreenArrowUP.png"
            : "/static/images/RedArrowDown.png";

        changeCell.textContent = change.toFixed(2);
        changeCell.appendChild(arrowImg.cloneNode());

        changePctCell.textContent = changePct.toFixed(2) + " %";
        changePctCell.appendChild(arrowImg);
    })
    .catch(err => {
        console.error(err);
        document.getElementById("result").textContent = "Server error.";
    });
});

function fillCompanyTab(company) {
    document.getElementById("co-name").textContent = company.name || "";
    document.getElementById("co-ticker").textContent = company.ticker || "";
    document.getElementById("co-exchange").textContent = company.exchangeCode || "";
    document.getElementById("co-startdate").textContent = company.startDate || "";
    document.getElementById("co-desc").textContent = company.description || "";
}

function loadHistory() {
    fetch("/history")
        .then(response => response.json())
        .then(rows => {
            const tbody = document.getElementById("history-body");
            tbody.innerHTML = ""; 

            rows.forEach(item => {
                const tr = document.createElement("tr");

                const tdTicker = document.createElement("td");
                tdTicker.textContent = item.ticker;

                const tdTime = document.createElement("td");
                tdTime.textContent = item.timestamp;

                tr.appendChild(tdTicker);
                tr.appendChild(tdTime);
                tbody.appendChild(tr);
            });
        })
        .catch(err => {
            console.error("History load error:", err);
        });
}

function activateTab(tabId) {
    document.querySelectorAll(".tab-button").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.tab === tabId);
    });
    document.querySelectorAll(".tab-content").forEach(div => {
        div.classList.toggle("active", div.id === tabId);
    });
}

document.querySelectorAll(".tab-button").forEach(btn => {
    btn.addEventListener("click", () => {
        const tabId = btn.dataset.tab;
        activateTab(tabId);
        if (tabId === "history-tab") {
            loadHistory();
        }
    });
});

// Clear button: hide results + clear error
document.getElementById("clear-btn").addEventListener("click", () => {
    document.getElementById("result").textContent = "";
    document.getElementById("results-container").style.display = "none";
});
