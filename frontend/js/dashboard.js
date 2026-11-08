const API_BASE = "http://127.0.0.1:5000/api";

let exams = [];
let halls = [];
let countdownInterval = null;


// ------------------------------
// LIVE CLOCK
// ------------------------------

function updateClock() {
    const clock = document.getElementById("liveClock");

    if (!clock) return;

    clock.textContent = new Date().toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true
    });
}


// ------------------------------
// SYSTEM STATUS
// ------------------------------

async function checkSystem() {
    const statusElement = document.getElementById("systemStatus");

    try {
        const response = await fetch(`${API_BASE}/health`);

        if (!response.ok) {
            throw new Error("Backend unavailable");
        }

        const result = await response.json();

        if (result.status === "healthy") {
            statusElement.textContent = "System Online";
        } else {
            statusElement.textContent = "Database Disconnected";
        }

    } catch (error) {
        statusElement.textContent = "Backend Offline";
    }
}


// ------------------------------
// LOAD HALLS
// ------------------------------

async function loadHalls() {
    const hallList = document.getElementById("hallList");

    try {
        const response = await fetch(`${API_BASE}/halls`);

        if (!response.ok) {
            throw new Error("Unable to load halls");
        }

        halls = await response.json();

        const activeHalls = halls.filter(
            hall => hall.is_active === true
        );

        const totalCapacity = activeHalls.reduce(
            (total, hall) => total + Number(hall.capacity || 0),
            0
        );

        document.getElementById("activeHalls").textContent =
            activeHalls.length;

        document.getElementById("totalCapacity").textContent =
            totalCapacity;

        if (halls.length === 0) {
            hallList.innerHTML = `
                <div class="loading-message">
                    No examination halls have been created.
                </div>
            `;
            return;
        }

        hallList.innerHTML = halls.map(hall => `
            <div class="hall-card">

                <div class="hall-card-top">

                    <div>
                        <h4>${escapeHTML(hall.name)}</h4>

                        <span class="hall-code">
                            ${escapeHTML(hall.code)}
                        </span>
                    </div>

                    <span
                        class="hall-indicator ${hall.is_active ? "active" : ""}"
                        title="${hall.is_active ? "Active" : "Inactive"}">
                    </span>

                </div>

                <div class="hall-meta">

                    <span>
                        <i class="bi bi-people"></i>
                        ${Number(hall.capacity)} seats
                    </span>

                    <span>
                        <i class="bi bi-volume-up"></i>
                        Threshold: ${Number(hall.noise_threshold)}
                    </span>

                </div>

            </div>
        `).join("");

    } catch (error) {
        hallList.innerHTML = `
            <div class="loading-message">
                Unable to load halls. Check the backend server.
            </div>
        `;

        document.getElementById("activeHalls").textContent = "—";
        document.getElementById("totalCapacity").textContent = "—";

        console.error("Hall API error:", error);
    }
}


// ------------------------------
// LOAD EXAMS
// ------------------------------

async function loadExams() {
    const tableBody = document.getElementById("examTableBody");

    try {
        const response = await fetch(`${API_BASE}/exams`);

        if (!response.ok) {
            throw new Error("Unable to load exams");
        }

        exams = await response.json();

        if (exams.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center py-4">
                        No examinations scheduled.
                    </td>
                </tr>
            `;

            document.getElementById("examStatus").textContent =
                "NO EXAMS";

            document.getElementById("timerMessage").textContent =
                "Waiting for schedule";

            document.getElementById("examDetails").textContent =
                "Create an examination to activate the timer.";

            stopCountdown();

            return;
        }

        exams.sort((a, b) =>
            new Date(a.start_at) - new Date(b.start_at)
        );

        tableBody.innerHTML = exams.map(exam => `
            <tr>
                <td>
                    <span class="exam-name">
                        ${escapeHTML(exam.title)}
                    </span>
                </td>

                <td>${escapeHTML(exam.subject)}</td>

                <td>${formatDate(exam.exam_date)}</td>

                <td>${formatTime(exam.start_at)}</td>

                <td>
                    <span class="exam-status-pill">
                        ${escapeHTML(exam.status)}
                    </span>
                </td>
            </tr>
        `).join("");

        updateExamTimer();

    } catch (error) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center py-4">
                    Unable to load examinations.
                </td>
            </tr>
        `;

        document.getElementById("examStatus").textContent =
            "API ERROR";

        console.error("Exam API error:", error);
    }
}


// ------------------------------
// EXAM COUNTDOWN
// ------------------------------

function updateExamTimer() {
    const now = new Date();

    const nextExam = exams
        .filter(exam => {
            const status = String(exam.status || "").toUpperCase();

            return status === "SCHEDULED" || status === "ONGOING";
        })
        .map(exam => ({
            ...exam,
            startDate: new Date(exam.start_at),
            endDate: new Date(exam.end_at)
        }))
        .filter(exam => !isNaN(exam.startDate.getTime()) &&
                        !isNaN(exam.endDate.getTime()))
        .filter(exam => exam.endDate > now)
        .sort((a, b) => a.startDate - b.startDate)[0];

    if (!nextExam) {
        document.getElementById("examStatus").textContent =
            "NO ACTIVE EXAM";

        document.getElementById("examCountdown").textContent =
            "00:00:00";

        document.getElementById("timerMessage").textContent =
            "Waiting for schedule";

        document.getElementById("examDetails").textContent =
            "No upcoming or ongoing examination.";

        stopCountdown();

        return;
    }

    const examEnd = nextExam.endDate;
    const examStart = nextExam.startDate;

    document.getElementById("examDetails").textContent =
        `${nextExam.title} • ${formatDate(nextExam.exam_date)}`;

    function tick() {
        const currentTime = new Date();

        let target;
        let message;

        if (currentTime < examStart) {
            target = examStart;
            message = "Time until exam starts";
            document.getElementById("examStatus").textContent =
                "SCHEDULED";
        } else if (currentTime < examEnd) {
            target = examEnd;
            message = "Time until exam ends";
            document.getElementById("examStatus").textContent =
                "ONGOING";
        } else {
            document.getElementById("examCountdown").textContent =
                "00:00:00";

            document.getElementById("timerMessage").textContent =
                "Exam time completed";

            stopCountdown();
            return;
        }

        const remaining = Math.max(
            0,
            Math.floor((target - currentTime) / 1000)
        );

        const hours = Math.floor(remaining / 3600);
        const minutes = Math.floor((remaining % 3600) / 60);
        const seconds = remaining % 60;

        document.getElementById("examCountdown").textContent =
            `${String(hours).padStart(2, "0")}:` +
            `${String(minutes).padStart(2, "0")}:` +
            `${String(seconds).padStart(2, "0")}`;

        document.getElementById("timerMessage").textContent = message;
    }

    stopCountdown();

    tick();

    countdownInterval = setInterval(tick, 1000);
}


function stopCountdown() {
    if (countdownInterval !== null) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
}


// ------------------------------
// FORMAT DATE AND TIME
// ------------------------------

function formatDate(value) {
    if (!value) return "—";

    const date = new Date(`${value}T00:00:00`);

    if (isNaN(date.getTime())) return escapeHTML(value);

    return date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });
}


function formatTime(value) {
    if (!value) return "—";

    const date = new Date(value);

    if (isNaN(date.getTime())) return escapeHTML(value);

    return date.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true
    });
}


// ------------------------------
// SAFE HTML OUTPUT
// ------------------------------

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}


// ------------------------------
// MOBILE SIDEBAR
// ------------------------------

const sidebar = document.getElementById("sidebar");
const sidebarOverlay = document.getElementById("sidebarOverlay");

function openSidebar() {
    sidebar.classList.add("open");
    sidebarOverlay.classList.add("show");
}

function closeSidebar() {
    sidebar.classList.remove("open");
    sidebarOverlay.classList.remove("show");
}

document.getElementById("menuToggle")
    .addEventListener("click", openSidebar);

document.getElementById("closeSidebar")
    .addEventListener("click", closeSidebar);

sidebarOverlay.addEventListener("click", closeSidebar);

document.querySelectorAll(".sidebar-nav .nav-link")
    .forEach(link => {
        link.addEventListener("click", closeSidebar);
    });


// ------------------------------
// REFRESH DASHBOARD
// ------------------------------

async function refreshDashboard() {
    await Promise.all([
        checkSystem(),
        loadHalls(),
        loadExams(),
        loadDashboardAlerts()
    ]);
}

document.getElementById("refreshDashboard")
    .addEventListener("click", refreshDashboard);
setInterval(refreshDashboard, 30000);

// ------------------------------
// START DASHBOARD
// ------------------------------

updateClock();

setInterval(updateClock, 1000);

refreshDashboard();

// Refresh database information periodically.
setInterval(refreshDashboard, 30000);

// =====================================
// LOAD DASHBOARD ALERTS
// =====================================

async function loadDashboardAlerts() {
    const alertsFeed = document.getElementById("alertsFeed");
    const alertBadge = document.getElementById("alertBadge");
    const mobileAlerts = document.getElementById("mobileAlerts");
    const totalAlertsElement = document.getElementById("totalAlerts");
    const acknowledgedAlertsElement = document.getElementById("acknowledgedAlerts");
    if (!alertsFeed) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/alerts/`);

        if (!response.ok) {
            throw new Error(`Alerts API returned ${response.status}`);
        }

        const alerts = await response.json();
        // Update total alert count
        if (totalAlertsElement) {
            totalAlertsElement.textContent = alerts.length;
        }

        // Count acknowledged alerts
        const acknowledgedAlerts = alerts.filter(
            alert => String(alert.status || "").toUpperCase() === "ACKNOWLEDGED"
        );

        if (acknowledgedAlertsElement) {
            acknowledgedAlertsElement.textContent = acknowledgedAlerts.length;
        }
        // Count alerts that have not been acknowledged
        const openAlerts = alerts.filter(alert =>
            String(alert.status || "OPEN").toUpperCase() !== "ACKNOWLEDGED"
        );

        if (alertBadge) {
            alertBadge.textContent = openAlerts.length;
        }
        // Update notification badge appearance
        if (alertBadge) {
            alertBadge.title = `${openAlerts.length} unacknowledged alert(s)`;

            alertBadge.classList.toggle(
                "has-alerts",
                openAlerts.length > 0
            );
        }
        // Count mobile and RF alerts
        const mobileRfAlerts = alerts.filter(alert => {
            const type = String(
                alert.type || alert.alert_type || ""
            ).toUpperCase();

            return type.includes("MOBILE") || type.includes("RF");
        });

        if (mobileAlerts) {
            mobileAlerts.textContent = mobileRfAlerts.length;
        }

        // Show an empty message if there are no alerts
        if (alerts.length === 0) {
            alertsFeed.innerHTML = `
                <i class="bi bi-shield-check"></i>
                <h4>No alerts recorded</h4>
                <p>Your examination hall is waiting for alerts.</p>
            `;
            return;
        }

        // Display the latest five alerts
        alertsFeed.innerHTML = `
            <div class="dashboard-alert-list">
                ${alerts.slice(0, 5).map(alert => {
                    const severity = String(
                        alert.severity || "INFO"
                    ).toUpperCase();

                    const status = String(
                        alert.status || "OPEN"
                    ).toUpperCase();

                    const message = escapeHTML(
                        alert.message || "No message available"
                    );

                    const type = escapeHTML(
                        alert.type || alert.alert_type || "ALERT"
                    );

                    const time = alert.created_at
                        ? new Date(alert.created_at).toLocaleString()
                        : "Time unavailable";

                    return `
                        <div class="dashboard-alert-item">
                            <div class="dashboard-alert-icon">
                                <i class="bi bi-exclamation-triangle"></i>
                            </div>

                            <div class="dashboard-alert-content">
                                <strong>${type} — ${severity}</strong>
                                <p>${message}</p>
                                <small>${escapeHTML(time)}</small>
                            </div>

                            <span class="dashboard-alert-status">
                                ${escapeHTML(status)}
                            </span>
                        </div>
                    `;
                }).join("")}
            </div>

            <div class="text-center mt-3">
                <a href="alerts.html" class="view-all">
                    View all alerts
                </a>
            </div>
        `;

    } catch (error) {
        console.error("Dashboard alerts error:", error);

        alertsFeed.innerHTML = `
            <i class="bi bi-exclamation-circle"></i>
            <h4>Unable to load alerts</h4>
            <p>Please check that the Flask backend is running.</p>
        `;
    }
}