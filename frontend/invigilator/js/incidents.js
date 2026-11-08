"use strict";

const API_BASE = "http://127.0.0.1:5000/api";

const TOKEN_KEY = "examguardInvigilatorToken";
const USER_KEY = "examguardInvigilator";

const form = document.getElementById("incidentForm");
const examSelect = document.getElementById("exam_id");
const incidentType = document.getElementById("incident_type");
const locationInput = document.getElementById("location");
const messageInput = document.getElementById("message");

const formMessage = document.getElementById("formMessage");
const historyMessage = document.getElementById("historyMessage");
const submitButton = document.getElementById("submitButton");

const reportTableBody = document.getElementById("reportTableBody");
const reportCount = document.getElementById("reportCount");

function getToken() {
    return sessionStorage.getItem(TOKEN_KEY);
}

function clearInvigilatorSession() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
}

function showMessage(element, message, type) {
    element.textContent = message;
    element.className = `message ${type}`;
}

function hideMessage(element) {
    element.textContent = "";
    element.className = "message";
}

async function apiRequest(path, options = {}) {
    const token = getToken();

    if (!token) {
        window.location.replace("login.html");
        throw new Error("Your session has expired. Please log in again.");
    }

    const headers = {
        "Authorization": `Bearer ${token}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {})
    };

    let response;

    try {
        response = await fetch(`${API_BASE}${path}`, {
            ...options,
            headers
        });
    } catch (error) {
        throw new Error(
            "Cannot connect to the server. Check that Flask is running."
        );
    }

    if (response.status === 401 || response.status === 403) {
        let errorData = {};

        try {
            errorData = await response.json();
        } catch (_) {
            // The response may not contain JSON.
        }

        /*
         * A 403 can mean insufficient permissions rather than an expired
         * session. Only clear the session on a 401.
         */
        if (response.status === 401) {
            clearInvigilatorSession();
            window.location.replace("login.html");
        }

        throw new Error(
            errorData.message ||
            (response.status === 401
                ? "Your session has expired."
                : "You do not have permission to perform this action.")
        );
    }

    let data;

    try {
        data = await response.json();
    } catch (_) {
        throw new Error("The server returned an invalid response.");
    }

    if (!response.ok || data.status === "error") {
        throw new Error(data.message || "The request failed.");
    }

    return data;
}

function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleString();
}

function makeCell(text) {
    const cell = document.createElement("td");
    cell.textContent = text ?? "—";
    return cell;
}

function makeBadge(text, className) {
    const badge = document.createElement("span");
    badge.className = `badge ${className}`;
    badge.textContent = text || "—";
    return badge;
}

function severityClass(severity) {
    switch (String(severity || "").toUpperCase()) {
        case "LOW":
            return "badge-low";
        case "HIGH":
            return "badge-high";
        default:
            return "badge-medium";
    }
}

async function loadAssignedExams() {
    examSelect.innerHTML = "";

    const initialOption = document.createElement("option");
    initialOption.value = "";
    initialOption.textContent = "Loading assigned examinations...";
    examSelect.appendChild(initialOption);

    try {
        const data = await apiRequest("/incidents/my-exams");

        const exams = Array.isArray(data.exams) ? data.exams : [];

        examSelect.replaceChildren();

        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = exams.length
            ? "Select an examination"
            : "No assigned examinations found";

        examSelect.appendChild(placeholder);

        exams.forEach(exam => {
            const option = document.createElement("option");
            option.value = exam.id;

            const title = exam.title || `Exam ${exam.id}`;
            const date = exam.exam_date
                ? ` — ${exam.exam_date}`
                : "";

            option.textContent = `${title}${date}`;
            examSelect.appendChild(option);
        });

        examSelect.disabled = exams.length === 0;
    } catch (error) {
        examSelect.replaceChildren();

        const option = document.createElement("option");
        option.value = "";
        option.textContent = "Unable to load examinations";

        examSelect.appendChild(option);
        examSelect.disabled = true;

        showMessage(formMessage, error.message, "error");
    }
}

async function loadIncidentHistory() {
    reportTableBody.replaceChildren();

    const loadingRow = document.createElement("tr");
    const loadingCell = document.createElement("td");

    loadingCell.colSpan = 6;
    loadingCell.className = "empty-state";
    loadingCell.textContent = "Loading incident reports...";

    loadingRow.appendChild(loadingCell);
    reportTableBody.appendChild(loadingRow);

    try {
        const data = await apiRequest("/incidents/my-reports");
        const incidents = Array.isArray(data.incidents)
            ? data.incidents
            : [];

        reportTableBody.replaceChildren();

        reportCount.textContent =
            `${incidents.length} ${incidents.length === 1 ? "REPORT" : "REPORTS"}`;

        if (incidents.length === 0) {
            const row = document.createElement("tr");
            const cell = document.createElement("td");

            cell.colSpan = 6;
            cell.className = "empty-state";
            cell.textContent =
                "You haven't submitted any incident reports yet.";

            row.appendChild(cell);
            reportTableBody.appendChild(row);
            return;
        }

        incidents.forEach(incident => {
            const row = document.createElement("tr");

            row.appendChild(makeCell(incident.id));
            row.appendChild(makeCell(
                incident.type || incident.incident_type
            ));

            const severityCell = document.createElement("td");
            severityCell.appendChild(
                makeBadge(
                    incident.severity,
                    severityClass(incident.severity)
                )
            );
            row.appendChild(severityCell);

            row.appendChild(makeCell(incident.message));

            const statusCell = document.createElement("td");
            statusCell.appendChild(
                makeBadge(
                    incident.status,
                    "badge-status"
                )
            );
            row.appendChild(statusCell);

            row.appendChild(makeCell(
                formatDate(incident.reported_at)
            ));

            reportTableBody.appendChild(row);
        });

        hideMessage(historyMessage);
    } catch (error) {
        reportTableBody.replaceChildren();

        const row = document.createElement("tr");
        const cell = document.createElement("td");

        cell.colSpan = 6;
        cell.className = "empty-state";
        cell.textContent = "Unable to load incident history.";

        row.appendChild(cell);
        reportTableBody.appendChild(row);

        showMessage(historyMessage, error.message, "error");
    }
}

form.addEventListener("submit", async function (event) {
    event.preventDefault();

    hideMessage(formMessage);

    const examId = examSelect.value;
    const selectedSeverity =
        form.querySelector('input[name="severity"]:checked');

    const incidentTypeValue = incidentType.value;
    const description = messageInput.value.trim();

    if (!examId || !incidentTypeValue || !selectedSeverity || !description) {
        showMessage(
            formMessage,
            "Please complete all required fields.",
            "error"
        );
        return;
    }

    const payload = {
        exam_id: Number(examId),
        incident_type: incidentTypeValue,
        severity: selectedSeverity.value,
        location: locationInput.value.trim(),
        message: description
    };

    submitButton.disabled = true;
    submitButton.textContent = "Submitting...";

    try {
        const result = await apiRequest("/incidents", {
            method: "POST",
            body: JSON.stringify(payload)
        });

        showMessage(
            formMessage,
            result.message || "Incident report submitted successfully.",
            "success"
        );

        form.reset();

        await loadIncidentHistory();
    } catch (error) {
        showMessage(formMessage, error.message, "error");
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Submit Incident Report →";
    }
});

document.getElementById("logoutButton").addEventListener(
    "click",
    async function () {
        const logoutButton = this;
        const token = getToken();

        logoutButton.disabled = true;
        logoutButton.textContent = "Logging out...";

        try {
            if (token) {
                await fetch(`${API_BASE}/auth/invigilator-logout`, {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${token}`
                    }
                });
            }
        } catch (error) {
            console.error("Invigilator logout error:", error);
        } finally {
            clearInvigilatorSession();
            window.location.replace("login.html");
        }
    }
);

async function initializeIncidentPage() {
    if (!getToken()) {
        window.location.replace("login.html");
        return;
    }

    await Promise.all([
        loadAssignedExams(),
        loadIncidentHistory()
    ]);
}

initializeIncidentPage();