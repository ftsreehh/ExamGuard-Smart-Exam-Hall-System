
const API_BASE = "http://127.0.0.1:5000/api";

let noiseHalls = [];
let noiseReadings = [];
let isRefreshing = false;

const el = {
    hallSelect: document.getElementById("hallSelect"),
    currentNoise: document.getElementById("currentNoise"),
    noiseStatus: document.getElementById("noiseStatus"),
    readingCount: document.getElementById("readingCount"),
    lastReadingTime: document.getElementById("lastReadingTime"),
    noiseMessage: document.getElementById("noiseMessage"),
    currentExamName: document.getElementById("currentExamName"),
    connectionStatus: document.getElementById("connectionStatus"),
    connectionDot: document.getElementById("connectionDot"),
    noiseTableBody: document.getElementById("noiseTableBody"),
    refreshButton: document.getElementById("refreshNoise")
};


// ==========================================================
// HELPERS
// ==========================================================

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}


async function apiRequest(url) {
    const response = await fetch(url);

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(
            data.message || `Request failed (${response.status})`
        );
    }

    return data;
}


function setConnectionStatus(connected) {
    el.connectionStatus.textContent = connected
        ? "Backend Connected"
        : "Backend Unavailable";

    el.connectionDot.classList.toggle("offline", !connected);
    el.connectionDot.classList.toggle("online", connected);
}


function getSelectedHallId() {
    return Number(el.hallSelect.value || 0);
}


function getSelectedHall() {
    return noiseHalls.find(
        hall => Number(hall.id) === getSelectedHallId()
    ) || null;
}


function getHallName(hall) {
    if (!hall) return "Unknown Hall";

    return hall.code || hall.name || `Hall ${hall.id}`;
}


function getHallReadings() {
    const hallId = getSelectedHallId();

    return noiseReadings.filter(
        reading => Number(reading.hall_id) === hallId
    );
}


function formatNoiseTime(value) {
    if (!value) return "Time unavailable";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "Time unavailable";
    }

    return date.toLocaleString();
}


function showNoiseStatus(label, className, icon) {
    el.noiseStatus.className =
        `noise-status-badge ${className}`;

    el.noiseStatus.innerHTML = `
        <i class="bi ${icon}"></i>
        ${escapeHTML(label)}
    `;
}


// ==========================================================
// LOAD HALLS
// ==========================================================

async function loadNoiseHalls() {
    const data = await apiRequest(`${API_BASE}/halls`);

    noiseHalls = Array.isArray(data)
        ? data
        : Array.isArray(data.halls)
            ? data.halls
            : [];

    const previousSelection = el.hallSelect.value;

    el.hallSelect.innerHTML = noiseHalls.length
        ? noiseHalls.map(hall => `
            <option value="${Number(hall.id)}">
                ${escapeHTML(getHallName(hall))}
                ${hall.name && hall.code
                    ? ` — ${escapeHTML(hall.name)}`
                    : ""}
            </option>
        `).join("")
        : `<option value="">No halls available</option>`;

    if (
        previousSelection &&
        noiseHalls.some(
            hall => Number(hall.id) === Number(previousSelection)
        )
    ) {
        el.hallSelect.value = previousSelection;
    }

    if (!el.hallSelect.value && noiseHalls.length) {
        el.hallSelect.value = String(noiseHalls[0].id);
    }
}


// ==========================================================
// LOAD NOISE EVENTS
// ==========================================================

async function fetchNoiseReadings() {
    const data = await apiRequest(
        `${API_BASE}/noise/readings`
    );

    noiseReadings = Array.isArray(data) ? data : [];

    // Ensure newest events appear first.
    noiseReadings.sort((a, b) => {
        return new Date(b.created_at) - new Date(a.created_at);
    });
}


// ==========================================================
// EVENT STATUS
// ==========================================================

function getEventStatus(reading) {
    if (reading.unit === "events") {
        return {
            label: "HIGH NOISE ALERT",
            className: "noise-status-high"
        };
    }

    if (reading.unit === "dB") {
        return {
            label: "SENSOR READING",
            className: "noise-status-warning"
        };
    }

    return {
        label: "SENSOR EVENT",
        className: "noise-status-normal"
    };
}


function getEventValue(reading) {
    const value = Number(reading.value);

    if (!Number.isFinite(value)) {
        return "--";
    }

    if (reading.unit === "events") {
        return `${value} detections`;
    }

    if (reading.unit === "dB") {
        return `${value.toFixed(1)} dB`;
    }

    return `${value} ${reading.unit || ""}`.trim();
}


// ==========================================================
// SUMMARY
// ==========================================================

function renderNoiseSummary() {
    const readings = getHallReadings();

    el.readingCount.textContent = readings.length;

    if (!readings.length) {
        el.currentNoise.textContent = "--";

        el.lastReadingTime.textContent =
            "Waiting for events";

        el.currentExamName.textContent =
            "No Active Exam";

        el.noiseMessage.textContent =
            "Waiting for sensor events from this examination hall.";

        showNoiseStatus(
            "Awaiting data",
            "noise-status-waiting",
            "bi-hourglass-split"
        );

        return;
    }

    const latest = readings[0];

    el.lastReadingTime.textContent =
        formatNoiseTime(latest.created_at);

    el.currentNoise.textContent =
        getEventValue(latest);

    el.currentExamName.textContent =
        latest.exam_name || "No Active Exam";

    el.noiseMessage.textContent =
        latest.message || "A sensor event was received.";

    const status = getEventStatus(latest);

    showNoiseStatus(
        status.label,
        status.className,
        latest.unit === "events"
            ? "bi-exclamation-triangle-fill"
            : "bi-soundwave"
    );
}


// ==========================================================
// EVENT HISTORY TABLE
// ==========================================================

function renderNoiseTable() {
    const hall = getSelectedHall();
    const readings = getHallReadings();

    if (!readings.length) {
        el.noiseTableBody.innerHTML = `
            <tr>
                <td colspan="6">
                    <div class="noise-empty-state">
                        <i class="bi bi-soundwave"></i>
                        <strong>No sensor events yet</strong>
                        New events will appear here when received.
                    </div>
                </td>
            </tr>
        `;

        return;
    }

    el.noiseTableBody.innerHTML = readings.slice(0, 50).map(reading => {

        const status = getEventStatus(reading);

        const examName = reading.exam_name || "No Active Exam";

        const examClass = examName === "No Active Exam"
            ? "exam-unavailable"
            : "exam-name";

        const detection = getEventValue(reading);

        return `
            <tr>
                <td>#${Number(reading.id)}</td>

                <td class="${examClass}">
                    ${escapeHTML(examName)}
                </td>

                <td>
                    ${escapeHTML(getHallName(hall))}
                </td>

                <td>
                    <strong>${escapeHTML(detection)}</strong>
                </td>

                <td>
                    <span class="noise-status-badge ${status.className}">
                        ${escapeHTML(status.label)}
                    </span>
                </td>

                <td>
                    ${escapeHTML(formatNoiseTime(reading.created_at))}
                </td>
            </tr>
        `;
    }).join("");
}


// ==========================================================
// REFRESH MONITOR
// ==========================================================

async function refreshNoiseMonitor() {
    if (isRefreshing) return;

    isRefreshing = true;
    el.refreshButton.disabled = true;

    try {
        await Promise.all([
            loadNoiseHalls(),
            fetchNoiseReadings()
        ]);

        setConnectionStatus(true);

        renderNoiseSummary();
        renderNoiseTable();

    } catch (error) {
        console.error("Noise monitor error:", error);

        setConnectionStatus(false);

        el.currentNoise.textContent = "--";
        el.readingCount.textContent = "0";
        el.currentExamName.textContent = "Unavailable";
        el.lastReadingTime.textContent = "Unavailable";
        el.noiseMessage.textContent =
            "Unable to retrieve monitoring data. Check the Flask backend.";

        showNoiseStatus(
            "Backend unavailable",
            "noise-status-waiting",
            "bi-wifi-off"
        );

        el.noiseTableBody.innerHTML = `
            <tr>
                <td colspan="6">
                    <div class="noise-empty-state">
                        <i class="bi bi-exclamation-circle"></i>
                        <strong>Unable to load sensor events</strong>
                        Check that Flask is running and the API is reachable.
                    </div>
                </td>
            </tr>
        `;

    } finally {
        isRefreshing = false;
        el.refreshButton.disabled = false;
    }
}


// ==========================================================
// EVENT LISTENERS
// ==========================================================

el.hallSelect.addEventListener("change", () => {
    renderNoiseSummary();
    renderNoiseTable();
});

el.refreshButton.addEventListener(
    "click",
    refreshNoiseMonitor
);


// ==========================================================
// INITIALIZE
// ==========================================================

async function initializeNoiseMonitor() {
    await refreshNoiseMonitor();

    // Refresh the event history every five seconds.
    setInterval(refreshNoiseMonitor, 5000);
}

initializeNoiseMonitor();
