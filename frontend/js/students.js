const API_BASE = "http://127.0.0.1:5000/api";

const studentsTableBody = document.getElementById("studentsTableBody");
const totalStudentsEl = document.getElementById("totalStudents");
const activeStudentsEl = document.getElementById("activeStudents");
const inactiveStudentsEl = document.getElementById("inactiveStudents");
const studentSearch = document.getElementById("studentSearch");
const statusFilter = document.getElementById("statusFilter");
const studentMessage = document.getElementById("studentMessage");
const refreshButton = document.getElementById("refreshStudents");

const addStudentForm = document.getElementById("addStudentForm");
const addStudentPanel = document.getElementById("addStudentPanel");
const addStudentMessage = document.getElementById("addStudentMessage");
const saveStudentButton = document.getElementById("saveStudentButton");

let allStudents = [];

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[character]);
}

function isStudentActive(student) {
    return (
        student.is_active === true ||
        student.is_active === 1 ||
        student.is_active === "1"
    );
}

function showMessage(message, isError = false) {
    studentMessage.textContent = message;
    studentMessage.className = isError
        ? "small text-danger mt-2"
        : "small text-muted mt-2";
}

function showAddStudentMessage(message, isError = false) {
    addStudentMessage.textContent = message;
    addStudentMessage.className = isError
        ? "mt-3 text-danger"
        : "mt-3 text-success";
}

async function loadStudents() {
    studentsTableBody.innerHTML = `
        <tr>
            <td colspan="7" class="text-center py-4">
                <div class="spinner-border spinner-border-sm me-2"></div>
                Loading students...
            </td>
        </tr>
    `;

    showMessage("Connecting to the student database...");

    try {
        const response = await fetch(`${API_BASE}/students`, {
            method: "GET",
            credentials: "include",
            headers: {
                "Accept": "application/json"
            }
        });

        const data = await response.json().catch(() => ({}));

        if (response.status === 401 || response.status === 403) {
            throw new Error(
                "Access denied. Please log in as an Admin and try again."
            );
        }

        if (!response.ok) {
            throw new Error(
                data.message ||
                data.error ||
                `Unable to load students (HTTP ${response.status}).`
            );
        }

        if (Array.isArray(data)) {
            allStudents = data;
        } else if (Array.isArray(data.students)) {
            allStudents = data.students;
        } else if (Array.isArray(data.data)) {
            allStudents = data.data;
        } else {
            throw new Error("Unexpected student API response.");
        }

        updateSummary();
        renderStudents();

        showMessage(
            `Successfully loaded ${allStudents.length} student record(s).`
        );

    } catch (error) {
        console.error("Student loading error:", error);

        allStudents = [];
        updateSummary();

        studentsTableBody.innerHTML = `
            <tr>
                <td colspan="7" class="empty-state">
                    <i class="bi bi-exclamation-circle me-2"></i>
                    ${escapeHTML(error.message)}
                </td>
            </tr>
        `;

        showMessage(error.message, true);
    }
}

function updateSummary() {
    const total = allStudents.length;
    const active = allStudents.filter(isStudentActive).length;

    totalStudentsEl.textContent = total;
    activeStudentsEl.textContent = active;
    inactiveStudentsEl.textContent = total - active;
}

function renderStudents() {
    const searchTerm = studentSearch.value.trim().toLowerCase();
    const selectedStatus = statusFilter.value;

    const filteredStudents = allStudents.filter(student => {
        const name = String(student.full_name || "").toLowerCase();
        const enrollment = String(
            student.enrollment_number || ""
        ).toLowerCase();

        const matchesSearch =
            name.includes(searchTerm) ||
            enrollment.includes(searchTerm);

        const active = isStudentActive(student);

        const matchesStatus =
            selectedStatus === "ALL" ||
            (selectedStatus === "ACTIVE" && active) ||
            (selectedStatus === "INACTIVE" && !active);

        return matchesSearch && matchesStatus;
    });

    if (filteredStudents.length === 0) {
        studentsTableBody.innerHTML = `
            <tr>
                <td colspan="7" class="empty-state">
                    <i class="bi bi-search me-2"></i>
                    No matching students found.
                </td>
            </tr>
        `;
        return;
    }

    studentsTableBody.innerHTML = filteredStudents.map(
        (student, index) => {
            const statusBadge = isStudentActive(student)
                ? `<span class="student-status status-active">Active</span>`
                : `<span class="student-status status-inactive">Inactive</span>`;

            return `
                <tr>
                    <td>${index + 1}</td>
                    <td>${escapeHTML(student.enrollment_number || "—")}</td>
                    <td><strong>${escapeHTML(student.full_name || "—")}</strong></td>
                    <td>${escapeHTML(student.department || "—")}</td>
                    <td>${escapeHTML(student.class_name || "—")}</td>
                    <td>${escapeHTML(student.batch_year || "—")}</td>
                    <td>${statusBadge}</td>
                </tr>
            `;
        }
    ).join("");
}

async function registerStudent(event) {
    event.preventDefault();

    const formData = new FormData(addStudentForm);

    const enrollmentNumber = formData.get("enrollment_number").trim();
    const fullName = formData.get("full_name").trim();
    const email = formData.get("email").trim();
    const department = formData.get("department").trim();
    const className = formData.get("class_name").trim();
    const batchYearText = formData.get("batch_year").trim();

    if (!enrollmentNumber || !fullName) {
        showAddStudentMessage(
            "Enrollment number and full name are required.",
            true
        );
        return;
    }

    const payload = {
        enrollment_number: enrollmentNumber,
        full_name: fullName,
        email: email || null,
        department: department || null,
        class_name: className || null,
        batch_year: batchYearText ? Number(batchYearText) : null
    };

    saveStudentButton.disabled = true;
    saveStudentButton.innerHTML = `
        <span class="spinner-border spinner-border-sm me-2"></span>
        Registering...
    `;

    showAddStudentMessage("Registering student...");

    try {
        const response = await fetch(`${API_BASE}/students`, {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json().catch(() => ({}));

        if (response.status === 401 || response.status === 403) {
            throw new Error(
                data.message ||
                "Administrator access required. Please log in again."
            );
        }

        if (!response.ok || data.success === false) {
            throw new Error(
                data.message ||
                data.error ||
                `Student registration failed (HTTP ${response.status}).`
            );
        }

        showAddStudentMessage(
            data.message || "Student registered successfully!"
        );

        addStudentForm.reset();

        // Reload the records and summary cards from the database.
        await loadStudents();

        // Keep the form visible so the Admin can register another student.
        addStudentPanel.style.display = "block";

    } catch (error) {
        console.error("Student registration error:", error);
        showAddStudentMessage(error.message, true);

    } finally {
        saveStudentButton.disabled = false;
        saveStudentButton.innerHTML =
            '<i class="bi bi-check-circle me-1"></i> Register Student';
    }
}

studentSearch.addEventListener("input", renderStudents);
statusFilter.addEventListener("change", renderStudents);
refreshButton.addEventListener("click", loadStudents);

if (addStudentForm) {
    addStudentForm.addEventListener("submit", registerStudent);
}

document.addEventListener("DOMContentLoaded", loadStudents);