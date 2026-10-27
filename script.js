
const API = "http://localhost:18080";
let allExpenses = [];

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

function money(amount) {
    return "₹" + Number(amount).toLocaleString("en-IN", {
        maximumFractionDigits: 2
    });
}

function getSummaryPanel() {
    let panel = document.getElementById("expenseSummaries");

    if (!panel) {
        panel = document.createElement("div");
        panel.id = "expenseSummaries";
        panel.style.cssText =
            "display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:18px;margin:24px 0;";

        const heading = document.querySelector("h1");
        if (heading) {
            heading.insertAdjacentElement("afterend", panel);
        } else {
            document.body.prepend(panel);
        }
    }

    return panel;
}

async function loadExpenses() {
    try {
        const response = await fetch(`${API}/api/expenses`);

        if (!response.ok) {
            throw new Error("Could not load expenses");
        }

        allExpenses = await response.json();

        renderExpenses();
        renderSummaries();
        updateDashboardNumbers();
        renderBudget();
    } catch (error) {
        console.error("Could not connect to C++ backend:", error);
    }
}

function renderExpenses() {
    const query = document.getElementById("search").value
        .trim()
        .toLowerCase();

    const filtered = allExpenses.filter(expense =>
        [
            expense.title,
            expense.category,
            expense.date,
            expense.amount
        ].join(" ").toLowerCase().includes(query)
    );

    document.getElementById("list").innerHTML = filtered.map(expense => `
        <tr>
            <td>${escapeHTML(expense.title)}</td>
            <td>${escapeHTML(expense.category)}</td>
            <td>${escapeHTML(expense.date)}</td>
            <td>${money(expense.amount)}</td>
            <td>
                <button type="button"
                    onclick="editExpense(${expense.id})">Edit</button>
                <button type="button"
                    onclick="deleteExpense(${expense.id})">Delete</button>
            </td>
        </tr>
    `).join("");

    if (filtered.length === 0) {
        document.getElementById("list").innerHTML = `
            <tr><td colspan="5">No expenses found.</td></tr>
        `;
    }
}

function updateDashboardNumbers() {
    const total = allExpenses.reduce(
        (sum, expense) => sum + Number(expense.amount), 0
    );

    const now = new Date();
    const currentMonth = now.getFullYear() + "-" +
        String(now.getMonth() + 1).padStart(2, "0");

    const monthTotal = allExpenses
        .filter(expense => expense.date.startsWith(currentMonth))
        .reduce((sum, expense) => sum + Number(expense.amount), 0);

    const totalElement = document.getElementById("total");
    const monthElement = document.getElementById("month");
    const countElement = document.getElementById("count");

    if (totalElement) totalElement.textContent = money(total);
    if (monthElement) monthElement.textContent = money(monthTotal);
    if (countElement) countElement.textContent = allExpenses.length;
}

const BUDGET_STORAGE_KEY = "expenseTrackerMonthlyBudget";

function getCurrentMonthKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthlySpending() {
    const currentMonth = getCurrentMonthKey();

    return allExpenses.reduce((total, expense) => {
        if (String(expense.date || "").slice(0, 7) === currentMonth) {
            return total + Number(expense.amount || 0);
        }
        return total;
    }, 0);
}

function getSavedBudget() {
    try {
        const saved = JSON.parse(
            localStorage.getItem(BUDGET_STORAGE_KEY) || "{}"
        );
        return Number(saved[getCurrentMonthKey()]) || 0;
    } catch {
        return 0;
    }
}

function saveBudget() {
    const input = document.getElementById("budgetAmount");
    const amount = Number(input.value);

    if (!input.value.trim() || !Number.isFinite(amount) || amount <= 0) {
        alert("Please enter a valid monthly budget greater than ₹0.");
        return;
    }

    try {
        const saved = JSON.parse(
            localStorage.getItem(BUDGET_STORAGE_KEY) || "{}"
        );

        saved[getCurrentMonthKey()] = amount;
        localStorage.setItem(BUDGET_STORAGE_KEY, JSON.stringify(saved));

        renderBudget();
    } catch (error) {
        alert("Could not save the budget in this browser.");
        console.error(error);
    }
}

function renderBudget() {
    const budget = getSavedBudget();
    const spent = getMonthlySpending();
    const remaining = budget - spent;
    const percent = budget > 0 ? (spent / budget) * 100 : 0;

    document.getElementById("budgetSpent").textContent = money(spent);
    document.getElementById("budgetRemaining").textContent =
        money(Math.max(0, remaining));
    document.getElementById("budgetPercent").textContent =
        `${Math.round(percent)}%`;

    const progress = document.getElementById("budgetProgress");
    progress.style.width = `${Math.min(percent, 100)}%`;

    const message = document.getElementById("budgetMessage");

    if (budget <= 0) {
        message.textContent = "Set a budget to start tracking your spending.";
        progress.style.background = "#16a085";
    } else if (spent > budget) {
        message.textContent =
            `Budget exceeded by ${money(spent - budget)}. Consider reducing your spending.`;
        progress.style.background = "#e05252";
    } else if (percent >= 80) {
        message.textContent =
            `Warning: You have used ${Math.round(percent)}% of your monthly budget.`;
        progress.style.background = "#f0a52b";
    } else {
        message.textContent =
            `You're within budget. You have ${money(remaining)} left to spend this month.`;
        progress.style.background = "#16a085";
    }

    document.getElementById("budgetAmount").value = budget || "";
}


function renderSummaries() {
    const categories = {};
    const months = {};

    allExpenses.forEach(expense => {
        const category = expense.category || "Other";
        const month = expense.date.slice(0, 7) || "Unknown";

        categories[category] =
            (categories[category] || 0) + Number(expense.amount);

        months[month] =
            (months[month] || 0) + Number(expense.amount);
    });

    renderCharts(categories, months);
}

function renderCharts(categories, months) {
    const colors = [
        "#3867e8", "#16a085", "#f4b740", "#8b5cf6",
        "#ef6474", "#22a6b3", "#f08b42", "#718096"
    ];

    // Category donut chart
    const entries = Object.entries(categories)
        .sort((a, b) => b[1] - a[1]);

    const total = entries.reduce((sum, item) => sum + item[1], 0);

    const chart = document.getElementById("categoryChart");
    const chartTotal = document.getElementById("chartTotal");
    const legend = document.getElementById("categoryLegend");

    if (!chart || !chartTotal || !legend) return;

    chartTotal.textContent = money(total);

    let angle = 0;
    const slices = entries.map(([name, amount], index) => {
        const start = angle;
        angle += total > 0 ? amount / total * 360 : 0;
        return `${colors[index % colors.length]} ${start}deg ${angle}deg`;
    });

    chart.style.background = total > 0
        ? `conic-gradient(${slices.join(", ")})`
        : "#e9edf5";

    legend.innerHTML = entries.length
        ? entries.map(([name, amount], index) => `
            <div class="legend-item">
                <span class="legend-dot"
                    style="background:${colors[index % colors.length]}"></span>
                <span class="legend-name">${escapeHTML(name)}</span>
                <span class="legend-value">${money(amount)}</span>
            </div>
        `).join("")
        : '<p class="muted">Add expenses to see categories.</p>';

    // Monthly bar chart: latest six calendar months
    const now = new Date();
    const recentMonths = [];

    for (let i = 5; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

        recentMonths.push({
            key,
            label: date.toLocaleDateString("en-IN", { month: "short" }),
            amount: months[key] || 0
        });
    }

    const maxAmount = Math.max(
        1,
        ...recentMonths.map(month => month.amount)
    );

    const monthlyChart = document.getElementById("monthlyChart");
    if (!monthlyChart) return;

    monthlyChart.innerHTML = recentMonths.map(month => {
        const height = month.amount > 0
            ? Math.max(3, month.amount / maxAmount * 100)
            : 0;

        return `
            <div class="bar-column"
                 title="${escapeHTML(month.key)}: ${money(month.amount)}">
                <span class="bar-value">${money(month.amount)}</span>
                <div class="bar-track">
                    <div class="bar-fill" style="height:${height}%"></div>
                </div>
                <span class="bar-label">${escapeHTML(month.label)}</span>
            </div>
        `;
    }).join("");
}


async function addExpense() {
    const expense = {
        title: document.getElementById("title").value.trim(),
        amount: Number(document.getElementById("amount").value),
        category: document.getElementById("category").value,
        date: document.getElementById("date").value
    };

    if (!expense.title || expense.amount <= 0 || !expense.date) {
        alert("Please enter a name, a positive amount, and a date.");
        return;
    }

    try {
        const response = await fetch(`${API}/api/expenses`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(expense)
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || "Failed to add expense");
        }

        document.getElementById("title").value = "";
        document.getElementById("amount").value = "";

        await loadExpenses();
    } catch (error) {
        alert(error.message || "Could not save the expense.");
        console.error(error);
    }
}

async function editExpense(id) {
    const expense = allExpenses.find(item => item.id === id);
    if (!expense) return;

    const title = prompt("Expense name:", expense.title);
    if (title === null) return;

    const amountText = prompt("Amount (₹):", expense.amount);
    if (amountText === null) return;

    const category = prompt("Category:", expense.category);
    if (category === null) return;

    const date = prompt("Date (YYYY-MM-DD):", expense.date);
    if (date === null) return;

    const updated = {
        title: title.trim(),
        amount: Number(amountText),
        category: category.trim(),
        date: date.trim()
    };

    if (!updated.title || updated.amount <= 0 ||
        !Number.isFinite(updated.amount) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(updated.date)) {
        alert("Please enter a valid name, positive amount, and date in YYYY-MM-DD format.");
        return;
    }

    try {
        const response = await fetch(`${API}/api/expenses/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updated)
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || "Update failed");
        }

        await loadExpenses();
        alert("Expense updated successfully!");
    } catch (error) {
        alert(error.message || "Could not update the expense.");
        console.error(error);
    }
}

async function deleteExpense(id) {
    if (!confirm("Delete this expense?")) return;

    try {
        const response = await fetch(`${API}/api/expenses/${id}`, {
            method: "DELETE"
        });

        if (!response.ok) {
            throw new Error("Delete failed");
        }

        await loadExpenses();
    } catch (error) {
        alert("Could not delete the expense.");
        console.error(error);
    }
}

function filterExpenses() {
    renderExpenses();
}

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("date").value =
        new Date().toISOString().slice(0, 10);

    loadExpenses();
});
