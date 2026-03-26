"use strict";

const STORAGE_KEY = "skillflow.skills.v1";
const HISTORY_KEY = "skillflow.history.v1";
const THEME_KEY = "skillflow.theme.v1";

const state = {
    skills: [],
    history: []
};

const dom = {
    totalSkills: null,
    todoSkills: null,
    doneSkills: null,
    progressPercent: null,
    skillForm: null,
    skillName: null,
    skillCategory: null,
    skillLevel: null,
    skillNote: null,
    resetProgress: null,
    seedDemo: null,
    todoList: null,
    doneList: null,
    skillsMatrixBody: null,
    matrixRadar: null,
    matrixRadarLevel: null,
    matrixLegend: null,
    matrixLegendLevel: null,
    matrixHover: null,
    matrixHoverLevel: null,
    themeToggle: null
};

let resizeTimeoutId = null;
let chartFrameQueued = false;
let matrixHoverIndex = -1;
let matrixRadarModel = [];
let matrixLevelHoverIndex = -1;
let matrixRadarLevelModel = [];
let animationFrameIds = {};
let saveDebounceId = null;
let lastRadarMoveTime = 0;
let lastRadarLevelMoveTime = 0;
const CANVAS_THROTTLE_MS = 100;
const SAVE_DEBOUNCE_MS = 2000;

function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function todayISO() {
    return new Date().toISOString().slice(0, 10);
}

function formatDate(isoDate) {
    const date = new Date(isoDate);
    return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function animateCounter(element, targetValue, duration = 800) {
    const startValue = parseInt(element.textContent) || 0;
    const diff = targetValue - startValue;
    const startTime = Date.now();

    const key = element.id;
    if (animationFrameIds[key]) cancelAnimationFrame(animationFrameIds[key]);

    function update() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeOutQuad = 1 - (1 - progress) * (1 - progress);
        const value = Math.round(startValue + diff * easeOutQuad);
        
        if (element.id === 'progressPercent') {
            element.textContent = value + '%';
        } else {
            element.textContent = value;
        }

        if (progress < 1) {
            animationFrameIds[key] = requestAnimationFrame(update);
        }
    }

    update();
}

function initTheme() {
    const savedTheme = localStorage.getItem(THEME_KEY) || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    if (savedTheme === 'light') {
        document.body.classList.add('dark-theme');
        dom.themeToggle.textContent = '☀️';
    } else {
        document.body.classList.remove('dark-theme');
        dom.themeToggle.textContent = '🌙';
    }
}

function toggleTheme() {
    const currentTheme = localStorage.getItem(THEME_KEY) || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    localStorage.setItem(THEME_KEY, newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    
    if (newTheme === 'light') {
        document.body.classList.add('dark-theme');
        dom.themeToggle.textContent = '☀️';
    } else {
        document.body.classList.remove('dark-theme');
        dom.themeToggle.textContent = '🌙';
    }
}

function saveState() {
    clearTimeout(saveDebounceId);
    saveDebounceId = setTimeout(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state.skills));
        localStorage.setItem(HISTORY_KEY, JSON.stringify(state.history));
    }, SAVE_DEBOUNCE_MS);
}

function loadState() {
    try {
        const savedSkills = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        const savedHistory = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");

        state.skills = Array.isArray(savedSkills) ? savedSkills : [];
        state.history = Array.isArray(savedHistory) ? savedHistory : [];
    } catch (error) {
        state.skills = [];
        state.history = [];
    }

    recordSnapshot();
}

function getStatsAndBuckets() {
    let done = 0;
    const todoItems = [];
    const doneItems = [];

    for (const skill of state.skills) {
        if (skill.status === "done") {
            done += 1;
            doneItems.push(skill);
        } else {
            todoItems.push(skill);
        }
    }

    const total = state.skills.length;
    const todo = total - done;
    const percent = total ? Math.round((done / total) * 100) : 0;

    return { total, done, todo, percent, todoItems, doneItems };
}

function recordSnapshot() {
    const { total, done, percent } = getStatsAndBuckets();
    const date = todayISO();
    const existing = state.history.find((item) => item.date === date);

    if (existing) {
        existing.total = total;
        existing.done = done;
        existing.percent = percent;
    } else {
        state.history.push({ date, total, done, percent });
    }

    state.history.sort((a, b) => a.date.localeCompare(b.date));
    saveState();
}

function addSkill(payload, options = { silent: false }) {
    state.skills.push({
        id: uid(),
        name: payload.name,
        category: payload.category,
        level: payload.level,
        note: payload.note,
        status: "todo",
        createdAt: new Date().toISOString(),
        completedAt: null
    });

    if (!options.silent) {
        recordSnapshot();
        render();
    }
}

function addSkillsBatch(skills) {
    for (const skill of skills) {
        addSkill(skill, { silent: true });
    }

    recordSnapshot();
    render();
}

function setSkillStatus(skillId, isDone) {
    const skill = state.skills.find((item) => item.id === skillId);
    if (!skill) return;

    skill.status = isDone ? "done" : "todo";
    skill.completedAt = isDone ? new Date().toISOString() : null;

    recordSnapshot();
    render();
}

function removeSkill(skillId) {
    state.skills = state.skills.filter((item) => item.id !== skillId);
    recordSnapshot();
    render();
}

function renderStats(stats) {
    animateCounter(dom.totalSkills, stats.total);
    animateCounter(dom.todoSkills, stats.todo);
    animateCounter(dom.doneSkills, stats.done);
    animateCounter(dom.progressPercent, stats.percent);
}

function cardHTML(skill, inDoneColumn) {
    const created = formatDate(skill.createdAt);
    const doneDate = skill.completedAt ? formatDate(skill.completedAt) : null;

    return `
        <article class="skill">
            <div class="skill-head">
                <div class="skill-title">${escapeHTML(skill.name)}</div>
                <span class="skill-tag">${escapeHTML(skill.level)}</span>
            </div>
            <div class="skill-meta">
                <span class="skill-tag">${escapeHTML(skill.category)}</span>
                <span class="skill-tag" style="background: rgba(94, 234, 212, 0.08); color: var(--muted);">Creee le ${created}</span>
                ${doneDate ? `<span class="skill-tag" style="background: rgba(134, 239, 172, 0.15); color: #86efac;">Validee le ${doneDate}</span>` : ""}
            </div>
            ${skill.note ? `<div class="skill-meta" style="margin-top: 8px; border-top: 1px solid var(--line); padding-top: 8px; font-size: 0.85rem; color: var(--muted);">${escapeHTML(skill.note)}</div>` : ""}
            <div class="skill-actions">
                ${inDoneColumn
                    ? `<button class="btn ghost" data-action="undo" data-id="${skill.id}">Remettre a faire</button>`
                    : `<button class="btn primary" data-action="done" data-id="${skill.id}">Valider</button>`}
                <button class="btn warn" data-action="delete" data-id="${skill.id}">Supprimer</button>
            </div>
        </article>
    `;
}

const LIST_PAGE_SIZE = 15;

function renderListColumn(container, items, inDone) {
    if (!items.length) {
        container.innerHTML = inDone
            ? '<div class="empty">Aucune competence validee pour le moment.</div>'
            : '<div class="empty">Aucune competence en attente.</div>';
        return;
    }

    const visible = items.slice(0, LIST_PAGE_SIZE);
    let html = visible.map((skill) => cardHTML(skill, inDone)).join("");

    if (items.length > LIST_PAGE_SIZE) {
        const remaining = items.length - LIST_PAGE_SIZE;
        html += `<button class="btn ghost show-more-btn" data-action="show-more" data-column="${inDone ? 'done' : 'todo'}">+${remaining} de plus</button>`;
    }

    container.innerHTML = html;
}

function renderLists(stats) {
    renderListColumn(dom.todoList, stats.todoItems, false);
    renderListColumn(dom.doneList, stats.doneItems, true);
}

function renderMatrix() {
    if (!state.skills.length) {
        dom.skillsMatrixBody.innerHTML = `
            <tr>
                <td colspan="7" class="empty">Aucune competence a afficher dans la matrice.</td>
            </tr>
        `;
        return;
    }

    const sorted = [...state.skills].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    dom.skillsMatrixBody.innerHTML = sorted.map((skill) => {
        const doneDate = skill.completedAt ? formatDate(skill.completedAt) : "-";
        const statusLabel = skill.status === "done" ? "Validee" : "A obtenir";

        return `
            <tr>
                <td>${escapeHTML(skill.name)}</td>
                <td>${escapeHTML(skill.category)}</td>
                <td>${escapeHTML(skill.level)}</td>
                <td><span class="status-pill ${skill.status}">${statusLabel}</span></td>
                <td>${formatDate(skill.createdAt)}</td>
                <td>${doneDate}</td>
                <td>${skill.note ? escapeHTML(skill.note) : "-"}</td>
            </tr>
        `;
    }).join("");
}

function resizeCanvasToDisplaySize(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = Math.max(1, Math.floor(canvas.clientWidth));
    const cssHeight = Math.max(1, Math.floor(canvas.clientHeight));
    const neededWidth = Math.floor(cssWidth * dpr);
    const neededHeight = Math.floor(cssHeight * dpr);

    if (canvas.width !== neededWidth || canvas.height !== neededHeight) {
        canvas.width = neededWidth;
        canvas.height = neededHeight;
    }

    return { dpr, cssWidth, cssHeight };
}

function drawChart() {
    drawSkillMatrixCircle();
    drawLevelMatrixCircle();
}

function getCategoryMetrics() {
    const categoriesMap = new Map();
    for (const skill of state.skills) {
        if (!categoriesMap.has(skill.category)) {
            categoriesMap.set(skill.category, { total: 0, done: 0 });
        }

        const bucket = categoriesMap.get(skill.category);
        bucket.total += 1;
        if (skill.status === "done") bucket.done += 1;
    }

    const maxDone = Math.max(1, ...Array.from(categoriesMap.values(), (value) => value.done));

    const categories = Array.from(categoriesMap.entries())
        .map(([name, value]) => ({
            name,
            // Radar value is driven only by validated skills.
            ratio: value.done / maxDone,
            done: value.done,
            total: value.total
        }))
        .sort((a, b) => b.ratio - a.ratio || a.name.localeCompare(b.name));

    if (!categories.length) {
        return [{ name: "Aucune donnee", ratio: 0, done: 0, total: 0 }];
    }

    return categories;
}

function getLevelMetrics() {
    const levelOrder = ["Debutant", "Intermediaire", "Avance", "Expert"];
    const levelMap = new Map(levelOrder.map((level) => [level, 0]));

    for (const skill of state.skills) {
        if (skill.status !== "done") continue;
        if (!levelMap.has(skill.level)) {
            levelMap.set(skill.level, 0);
        }

        levelMap.set(skill.level, levelMap.get(skill.level) + 1);
    }

    const maxDone = Math.max(1, ...Array.from(levelMap.values()));

    return Array.from(levelMap.entries()).map(([name, done]) => ({
        name,
        ratio: done / maxDone,
        done,
        total: done
    }));
}

function renderMatrixLegend(container, categories) {
    container.innerHTML = categories.map((cat) => {
        const percent = Math.round(cat.ratio * 100);
        return `
            <div class="matrix-legend-item">
                <div class="matrix-legend-head">
                    <strong>${escapeHTML(cat.name)}</strong>
                    <span>${cat.done} validees - ${percent}%</span>
                </div>
                <div class="matrix-bar">
                    <div class="matrix-bar-fill" style="width:${percent}%"></div>
                </div>
            </div>
        `;
    }).join("");
}

function updateMatrixHoverInfo(container, category) {
    if (!category) {
        container.textContent = "Survole un point du radar pour voir les details.";
        return;
    }

    const percent = Math.round(category.ratio * 100);
    container.textContent = `${category.name}: ${category.done} competences validees (${percent}% de la valeur maximale).`;
}

function drawSkillMatrixCircle() {
    const categories = getCategoryMetrics();
    renderMatrixLegend(dom.matrixLegend, categories);

    matrixRadarModel = drawRadarMatrix({
        canvas: dom.matrixRadar,
        metrics: categories,
        hoverIndex: matrixHoverIndex,
        title: "Skills Matrix: basee sur les competences validees",
        labelSuffix: " ->"
    });

    const hovered = matrixRadarModel.find((node) => node.index === matrixHoverIndex);
    updateMatrixHoverInfo(dom.matrixHover, hovered ? hovered.cat : null);
}

function drawLevelMatrixCircle() {
    const levels = getLevelMetrics();
    renderMatrixLegend(dom.matrixLegendLevel, levels);

    matrixRadarLevelModel = drawRadarMatrix({
        canvas: dom.matrixRadarLevel,
        metrics: levels,
        hoverIndex: matrixLevelHoverIndex,
        title: "Skills Matrix: basee sur les niveaux cibles valides",
        labelSuffix: ""
    });

    const hovered = matrixRadarLevelModel.find((node) => node.index === matrixLevelHoverIndex);
    updateMatrixHoverInfo(dom.matrixHoverLevel, hovered ? hovered.cat : null);
}

function drawRadarMatrix(options) {
    const { canvas, metrics, hoverIndex, title, labelSuffix } = options;

    const ctx = canvas.getContext("2d");
    const { dpr, cssWidth, cssHeight } = resizeCanvasToDisplaySize(canvas);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const width = cssWidth;
    const height = cssHeight;
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.max(52, Math.min(width, height) * 0.3);

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "rgba(8,13,28,0.7)";
    ctx.fillRect(0, 0, width, height);

    const ringCount = 5;
    ctx.lineWidth = 1;
    for (let i = 1; i <= ringCount; i++) {
        ctx.strokeStyle = i === ringCount ? "rgba(176,185,214,0.45)" : "rgba(176,185,214,0.18)";
        ctx.fillStyle = i % 2 === 0 ? "rgba(14, 24, 46, 0.26)" : "rgba(14, 24, 46, 0.1)";
        ctx.beginPath();
        ctx.arc(cx, cy, (radius * i) / ringCount, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    }

    const step = (Math.PI * 2) / metrics.length;
    const model = [];
    metrics.forEach((cat, index) => {
        const angle = -Math.PI / 2 + step * index;
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius;

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(x, y);
        ctx.strokeStyle = "rgba(176,185,214,0.24)";
        ctx.stroke();

        const labelDistance = radius + 22;
        const lx = cx + Math.cos(angle) * labelDistance;
        const ly = cy + Math.sin(angle) * labelDistance;
        ctx.fillStyle = hoverIndex === index ? "#f5f7ff" : "rgba(176,185,214,0.98)";
        ctx.font = hoverIndex === index ? "bold 12px Segoe UI" : "12px Segoe UI";
        ctx.textAlign = lx < cx - 10 ? "right" : lx > cx + 10 ? "left" : "center";
        ctx.fillText(`${cat.name}${labelSuffix}`, lx, ly);

        const scaled = radius * cat.ratio;
        const px = cx + Math.cos(angle) * scaled;
        const py = cy + Math.sin(angle) * scaled;
        model.push({ index, angle, px, py, cat, cx, cy, radius });
    });

    // Reference target (100%)
    ctx.beginPath();
    metrics.forEach((cat, index) => {
        const angle = -Math.PI / 2 + step * index;
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = "rgba(125, 211, 252, 0.45)";
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    model.forEach((node, index) => {
        if (index === 0) ctx.moveTo(node.px, node.py);
        else ctx.lineTo(node.px, node.py);
    });
    ctx.closePath();
    const gradient = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
    gradient.addColorStop(0, "rgba(56, 189, 248, 0.28)");
    gradient.addColorStop(1, "rgba(94, 234, 212, 0.28)");
    ctx.fillStyle = gradient;
    ctx.strokeStyle = "rgba(94, 234, 212, 0.96)";
    ctx.lineWidth = 2.2;
    ctx.fill();
    ctx.stroke();

    model.forEach((node) => {
        ctx.beginPath();
        ctx.arc(node.px, node.py, hoverIndex === node.index ? 6 : 4, 0, Math.PI * 2);
        ctx.fillStyle = hoverIndex === node.index ? "#67e8f9" : "#22d3ee";
        ctx.fill();
    });

    ctx.fillStyle = "#f5f7ff";
    ctx.font = "bold 12px Segoe UI";
    ctx.textAlign = "center";
    ctx.fillText(title, cx, 18);

    return model;
}

function queueChartDraw() {
    if (chartFrameQueued) return;
    chartFrameQueued = true;

    requestAnimationFrame(() => {
        chartFrameQueued = false;
        drawChart();
    });
}

function escapeHTML(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function render() {
    const stats = getStatsAndBuckets();
    renderStats(stats);
    renderLists(stats);
    renderMatrix();
    queueChartDraw();
}

function onSubmitSkillForm(event) {
    event.preventDefault();

    const name = dom.skillName.value.trim();
    const category = dom.skillCategory.value;
    const level = dom.skillLevel.value;
    const note = dom.skillNote.value.trim();

    if (!name || !category || !level) {
        // Show validation error feedback
        if (!name) {
            dom.skillName.style.borderColor = 'var(--danger)';
            dom.skillName.style.boxShadow = '0 0 0 3px rgba(249, 115, 115, 0.2)';
        }
        if (!category) {
            dom.skillCategory.style.borderColor = 'var(--danger)';
            dom.skillCategory.style.boxShadow = '0 0 0 3px rgba(249, 115, 115, 0.2)';
        }
        if (!level) {
            dom.skillLevel.style.borderColor = 'var(--danger)';
            dom.skillLevel.style.boxShadow = '0 0 0 3px rgba(249, 115, 115, 0.2)';
        }
        return;
    }

    addSkill({ name, category, level, note });
    dom.skillForm.reset();
    
    // Reset field styles
    dom.skillName.style.borderColor = '';
    dom.skillName.style.boxShadow = '';
    dom.skillCategory.style.borderColor = '';
    dom.skillCategory.style.boxShadow = '';
    dom.skillLevel.style.borderColor = '';
    dom.skillLevel.style.boxShadow = '';
}

function onBodyClick(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const action = target.dataset.action;
    const skillId = target.dataset.id;

    if (action === "show-more") {
        const column = target.dataset.column;
        const stats = getStatsAndBuckets();
        const items = column === "done" ? stats.doneItems : stats.todoItems;
        const container = column === "done" ? dom.doneList : dom.todoList;
        const inDone = column === "done";
        container.innerHTML = items.map((skill) => cardHTML(skill, inDone)).join("");
        return;
    }

    if (!action || !skillId) return;

    if (action === "done") setSkillStatus(skillId, true);
    if (action === "undo") setSkillStatus(skillId, false);
    if (action === "delete") removeSkill(skillId);
}

function onResetProgress() {
    if (!confirm("Reinitialiser toutes les competences et la courbe ?")) return;

    state.skills = [];
    state.history = [];
    recordSnapshot();
    render();
}

function onAddDemo() {
    const demoSkills = [
        { name: "Maitriser les bases HTML/CSS", category: "Web", level: "Debutant", note: "Construire 3 pages responsive" },
        { name: "Faire une API REST", category: "Programmation", level: "Intermediaire", note: "Node ou Python" },
        { name: "Analyser un trafic reseau", category: "Reseau", level: "Intermediaire", note: "Wireshark" }
    ];

    addSkillsBatch(demoSkills);
}

function onResize() {
    if (resizeTimeoutId !== null) {
        clearTimeout(resizeTimeoutId);
    }

    resizeTimeoutId = setTimeout(() => {
        queueChartDraw();
    }, 120);
}

function onMatrixRadarMove(event) {
    if (!matrixRadarModel.length) return;

    const now = Date.now();
    if (now - lastRadarMoveTime < CANVAS_THROTTLE_MS) return;
    lastRadarMoveTime = now;

    const rect = dom.matrixRadar.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    let selected = -1;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const node of matrixRadarModel) {
        const dx = x - node.px;
        const dy = y - node.py;
        const dist = Math.hypot(dx, dy);
        if (dist < bestDistance) {
            bestDistance = dist;
            selected = node.index;
        }
    }

    const hovered = matrixRadarModel.find((node) => node.index === selected);
    if (!hovered) return;

    const centerDist = Math.hypot(x - hovered.cx, y - hovered.cy);
    if (centerDist > hovered.radius + 30) {
        selected = -1;
    }

    if (selected !== matrixHoverIndex) {
        matrixHoverIndex = selected;
        queueChartDraw();
    }
}

function onMatrixRadarLeave() {
    if (matrixHoverIndex !== -1) {
        matrixHoverIndex = -1;
        queueChartDraw();
    }
}

function onMatrixRadarLevelMove(event) {
    if (!matrixRadarLevelModel.length) return;

    const now = Date.now();
    if (now - lastRadarLevelMoveTime < CANVAS_THROTTLE_MS) return;
    lastRadarLevelMoveTime = now;

    const rect = dom.matrixRadarLevel.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    let selected = -1;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const node of matrixRadarLevelModel) {
        const dx = x - node.px;
        const dy = y - node.py;
        const dist = Math.hypot(dx, dy);
        if (dist < bestDistance) {
            bestDistance = dist;
            selected = node.index;
        }
    }

    const hovered = matrixRadarLevelModel.find((node) => node.index === selected);
    if (!hovered) return;

    const centerDist = Math.hypot(x - hovered.cx, y - hovered.cy);
    if (centerDist > hovered.radius + 30) {
        selected = -1;
    }

    if (selected !== matrixLevelHoverIndex) {
        matrixLevelHoverIndex = selected;
        queueChartDraw();
    }
}

function onMatrixRadarLevelLeave() {
    if (matrixLevelHoverIndex !== -1) {
        matrixLevelHoverIndex = -1;
        queueChartDraw();
    }
}

function cacheDom() {
    dom.totalSkills = document.getElementById("totalSkills");
    dom.todoSkills = document.getElementById("todoSkills");
    dom.doneSkills = document.getElementById("doneSkills");
    dom.progressPercent = document.getElementById("progressPercent");
    dom.skillForm = document.getElementById("skillForm");
    dom.skillName = document.getElementById("skillName");
    dom.skillCategory = document.getElementById("skillCategory");
    dom.skillLevel = document.getElementById("skillLevel");
    dom.skillNote = document.getElementById("skillNote");
    dom.resetProgress = document.getElementById("resetProgress");
    dom.seedDemo = document.getElementById("seedDemo");
    dom.todoList = document.getElementById("todoList");
    dom.doneList = document.getElementById("doneList");
    dom.skillsMatrixBody = document.getElementById("skillsMatrixBody");
    dom.matrixRadar = document.getElementById("matrixRadar");
    dom.matrixRadarLevel = document.getElementById("matrixRadarLevel");
    dom.matrixLegend = document.getElementById("matrixLegend");
    dom.matrixLegendLevel = document.getElementById("matrixLegendLevel");
    dom.matrixHover = document.getElementById("matrixHover");
    dom.matrixHoverLevel = document.getElementById("matrixHoverLevel");
    dom.themeToggle = document.getElementById("themeToggle");
}

function bindEvents() {
    dom.skillForm.addEventListener("submit", onSubmitSkillForm);
    document.body.addEventListener("click", onBodyClick);
    dom.resetProgress.addEventListener("click", onResetProgress);
    dom.seedDemo.addEventListener("click", onAddDemo);
    dom.themeToggle.addEventListener("click", toggleTheme);
    
    window.addEventListener("beforeunload", () => {
        if (saveDebounceId !== null) {
            clearTimeout(saveDebounceId);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state.skills));
            localStorage.setItem(HISTORY_KEY, JSON.stringify(state.history));
        }
    });

    // Form validation feedback
    dom.skillName.addEventListener("input", (e) => {
        if (e.target.value.trim()) {
            e.target.style.borderColor = 'var(--primary)';
        }
    });
    
    dom.skillCategory.addEventListener("change", (e) => {
        if (e.target.value) {
            e.target.style.borderColor = 'var(--primary)';
        }
    });
    
    dom.skillLevel.addEventListener("change", (e) => {
        if (e.target.value) {
            e.target.style.borderColor = 'var(--primary)';
        }
    });
    
    dom.matrixRadar.addEventListener("mousemove", onMatrixRadarMove, { passive: true });
    dom.matrixRadar.addEventListener("mouseleave", onMatrixRadarLeave, { passive: true });
    dom.matrixRadarLevel.addEventListener("mousemove", onMatrixRadarLevelMove, { passive: true });
    dom.matrixRadarLevel.addEventListener("mouseleave", onMatrixRadarLevelLeave, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });
}

function init() {
    cacheDom();
    initTheme();
    loadState();
    bindEvents();
    render();
}

init();
