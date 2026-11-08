const API_BASE = "http://127.0.0.1:5000/api";

// ==========================================
// LOAD NOISE ALERTS + INVIGILATOR INCIDENTS
// ==========================================
async function loadAlerts() {
    const body = document.getElementById("alertTableBody");
    const message = document.getElementById("alertMessage");

    try {
        message.textContent = "";
        message.className = "";

        // Load both data sources using the Admin session.
        const [alertsResponse, incidentsResponse] = await Promise.all([
            fetch(`${API_BASE}/alerts`, {
                method: "GET",
                credentials: "include"
            }),

            fetch(`${API_BASE}/incidents`, {
                method: "GET",
                credentials: "include"
            })
        ]);

        if (alertsResponse.status === 401) {
            throw new Error(
                "Admin session expired. Please log in again."
            );
        }

        if (!alertsResponse.ok) {
            throw new Error(
                `Alerts API returned ${alertsResponse.status}.`
            );
        }

        const alertsData = await alertsResponse.json();

        // The API returns { success: true, alerts: [...] }.
        const alerts = Array.isArray(alertsData)
            ? alertsData
            : alertsData.alerts || [];

        // Incident reports are loaded separately.
        // A failure here should not hide valid noise alerts.
        let incidents = [];
        let incidentLoadWarning = "";

        if (incidentsResponse.ok) {
            const incidentsData = await incidentsResponse.json();

            incidents = Array.isArray(incidentsData)
                ? incidentsData
                : incidentsData.incidents || [];
        } else {
            incidentLoadWarning =
                `Noise alerts loaded, but incident reports returned HTTP ${incidentsResponse.status}.`;
        }

        // Identify each record's source.
        const combinedRecords = [
            ...alerts.map(alert => ({
                ...alert,
                record_source: "NOISE_ALERT"
            })),

            ...incidents.map(incident => ({
                ...incident,
                record_source: "INCIDENT_REPORT"
            }))
        ];

        // Sort newest first.
        combinedRecords.sort((a, b) => {
            const dateA = new Date(
                a.created_at || a.reported_at || 0
            ).getTime();

            const dateB = new Date(
                b.created_at || b.reported_at || 0
            ).getTime();

            return dateB - dateA;
        });

        // Dashboard summary counts.
        document.getElementById("totalAlerts").textContent =
            combinedRecords.length;

        document.getElementById("pendingAlerts").textContent =
            combinedRecords.filter(record =>
                !["ACKNOWLEDGED", "REVIEWED", "RESOLVED"].includes(
                    String(record.status || "OPEN").toUpperCase()
                )
            ).length;

        document.getElementById("acknowledgedAlerts").textContent =
            combinedRecords.filter(record =>
                ["ACKNOWLEDGED", "REVIEWED", "RESOLVED"].includes(
                    String(record.status || "").toUpperCase()
                )
            ).length;

        if (combinedRecords.length === 0) {
            body.innerHTML = `
                <tr>
                    <td colspan="8" class="text-center py-4">
                        No alerts or incident reports recorded.
                    </td>
                </tr>
            `;

            if (incidentLoadWarning) {
                message.className = "alert alert-warning";
                message.textContent = incidentLoadWarning;
            }

            return;
        }

        // Render noise alerts and incidents in the same table.
        body.innerHTML = combinedRecords.map(record => {
            const isIncident =
                record.record_source === "INCIDENT_REPORT";

            const status = String(
                record.status || "OPEN"
            ).toUpperCase();

            const isComplete = [
                "ACKNOWLEDGED",
                "REVIEWED",
                "RESOLVED"
            ].includes(status);

            const severity = String(
                record.severity || "MEDIUM"
            ).toUpperCase();

            const type = isIncident
                ? record.incident_type || "INCIDENT"
                : record.type || record.alert_type || "NOISE";

            const messageText = record.message || "—";

            const value = isIncident
                ? "—"
                : record.value ?? "—";

            const timestamp = isIncident
                ? record.reported_at
                : record.created_at || record.timestamp;

            let actionHTML = "";

            if (isIncident) {
                actionHTML = `
                    <button
                        class="btn btn-sm btn-outline-primary incident-status-btn"
                        data-incident-id="${Number(record.id)}"
                        data-current-status="${escapeHTML(status)}"
                        ${status === "RESOLVED" ? "disabled" : ""}>
                        <i class="bi bi-clipboard-check"></i>
                        ${status === "RESOLVED" ? "Resolved" : "Update Status"}
                    </button>
                `;
            } else if (isComplete) {
                actionHTML = `
                    <span class="text-success">
                        <i class="bi bi-check-circle"></i>
                        Completed
                    </span>
                `;
            } else {
                actionHTML = `
                    <button
                        class="btn btn-sm btn-success acknowledge-btn"
                        data-alert-id="${Number(record.id)}">
                        <i class="bi bi-check-circle"></i>
                        Acknowledge
                    </button>
                `;
            }

            return `
                <tr>
                    <td>${Number(record.id)}</td>

                    <td>
                        <span class="badge ${
                            isIncident
                                ? "bg-primary"
                                : "bg-dark"
                        }">
                            ${escapeHTML(type)}
                        </span>
                    </td>

                    <td>
                        <span class="badge ${
                            severity === "HIGH"
                                ? "bg-danger"
                                : severity === "MEDIUM"
                                ? "bg-warning text-dark"
                                : "bg-secondary"
                        }">
                            ${escapeHTML(severity)}
                        </span>
                    </td>

                    <td>${escapeHTML(messageText)}</td>

                    <td>${escapeHTML(value)}</td>

                    <td>
                        <span class="badge ${
                            status === "RESOLVED" ||
                            status === "ACKNOWLEDGED"
                                ? "bg-success"
                                : status === "REVIEWED"
                                ? "bg-info text-dark"
                                : "bg-danger"
                        }">
                            ${escapeHTML(status)}
                        </span>
                    </td>

                    <td>${formatDateTime(timestamp)}</td>

                    <td>${actionHTML}</td>
                </tr>
            `;
        }).join("");

        if (incidentLoadWarning) {
            message.className = "alert alert-warning";
            message.textContent = incidentLoadWarning;
        }

    } catch (error) {
        document.getElementById("totalAlerts").textContent = "—";
        document.getElementById("pendingAlerts").textContent = "—";
        document.getElementById("acknowledgedAlerts").textContent = "—";

        body.innerHTML = `
            <tr>
                <td colspan="8" class="text-center py-4">
                    Alert data is currently unavailable.
                </td>
            </tr>
        `;

        message.className = "alert alert-warning";
        message.textContent = error.message;

        console.error("Alerts loading error:", error);
    }
}


// ==========================================
// ESCAPE HTML
// ==========================================
function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}


// ==========================================
// FORMAT DATE AND TIME
// ==========================================
function formatDateTime(value) {
    if (!value) return "—";

    const date = new Date(value);

    return isNaN(date.getTime())
        ? escapeHTML(value)
        : date.toLocaleString("en-IN");
}


// ==========================================
// LIVE CLOCK
// ==========================================
function updateClock() {
    const clock = document.getElementById("liveClock");

    if (clock) {
        clock.textContent =
            new Date().toLocaleTimeString("en-IN");
    }
}


// ==========================================
// ACKNOWLEDGE NOISE ALERT
// ==========================================
async function acknowledgeAlert(alertId) {
    if (!confirm("Acknowledge this noise alert?")) {
        return;
    }

    try {
        const response = await fetch(
            `${API_BASE}/alerts/${alertId}/acknowledge`,
            {
                method: "PATCH",
                credentials: "include"
            }
        );

        const result = await response.json();

        if (!response.ok) {
            throw new Error(
                result.message || "Unable to acknowledge alert."
            );
        }

        alert("Alert acknowledged successfully!");

        await loadAlerts();

    } catch (error) {
        console.error("Acknowledge alert error:", error);
        alert(error.message);
    }
}


// ==========================================
// UPDATE INCIDENT STATUS
// ==========================================
async function updateIncidentStatus(incidentId, currentStatus) {
    const allowedStatuses = [
        "ACKNOWLEDGED",
        "REVIEWED",
        "RESOLVED"
    ];

    const suggestedStatus =
        currentStatus === "OPEN"
            ? "ACKNOWLEDGED"
            : currentStatus === "ACKNOWLEDGED"
            ? "REVIEWED"
            : "RESOLVED";

    const newStatus = prompt(
        `Enter the new incident status:\n${allowedStatuses.join(", ")}`,
        suggestedStatus
    );

    if (newStatus === null) return;

    const normalizedStatus = newStatus.trim().toUpperCase();

    if (!allowedStatuses.includes(normalizedStatus)) {
        alert(
            "Invalid status. Choose ACKNOWLEDGED, REVIEWED, or RESOLVED."
        );
        return;
    }

    try {
        const response = await fetch(
            `${API_BASE}/incidents/${incidentId}/status`,
            {
                method: "PATCH",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    status: normalizedStatus
                })
            }
        );

        const result = await response.json();

        if (!response.ok) {
            throw new Error(
                result.message || "Unable to update incident status."
            );
        }

        alert("Incident status updated successfully!");

        await loadAlerts();

    } catch (error) {
        console.error("Incident status update error:", error);
        alert(error.message);
    }
}


// ==========================================
// TABLE BUTTON EVENTS
// ==========================================
document
    .getElementById("alertTableBody")
    .addEventListener("click", function (event) {

        const acknowledgeButton =
            event.target.closest(".acknowledge-btn");

        if (acknowledgeButton) {
            acknowledgeAlert(
                acknowledgeButton.dataset.alertId
            );
            return;
        }

        const incidentButton =
            event.target.closest(".incident-status-btn");

        if (incidentButton) {
            updateIncidentStatus(
                incidentButton.dataset.incidentId,
                incidentButton.dataset.currentStatus
            );
        }
    });


// ==========================================
// REFRESH + INITIALIZE
// ==========================================
document
    .getElementById("refreshAlerts")
    .addEventListener("click", loadAlerts);

setInterval(updateClock, 1000);

updateClock();
loadAlerts();