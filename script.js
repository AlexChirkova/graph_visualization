// ============ МОДЕЛЬ ДАННЫХ ============
class Graph {
    constructor() {
        this.vertices = new Map();
        this.edges = [];
    }

    addVertex(id, label = id, x = 0, y = 0, color = '#208141', radius = 25) {
        this.vertices.set(id, { id, label, x, y, color, radius });
    }

    addEdge(from, to, weight = 1, label = '', color = '#626c7c', width = 2, isDirected = false) {
        this.edges.push({ from, to, weight, label, color, width, isDirected });
    }

    removeVertex(id) {
        this.vertices.delete(id);
        this.edges = this.edges.filter(e => e.from !== id && e.to !== id);
    }

    removeEdge(index) {
        this.edges.splice(index, 1);
    }

    clear() {
        this.vertices.clear();
        this.edges = [];
    }

    toJSON() {
        return {
            vertices: Array.from(this.vertices.values()),
            edges: this.edges
        };
    }

    fromJSON(data) {
        this.clear();
        data.vertices.forEach(v => {
            this.addVertex(v.id, v.label, v.x, v.y, v.color || '#208141', v.radius || 25);
        });
        data.edges.forEach(e => {
            this.addEdge(e.from, e.to, e.weight || 1, e.label || '', e.color || '#626c7c', e.width || 2, e.isDirected || false);
        });
    }
}

// ============ СОСТОЯНИЕ ПРИЛОЖЕНИЯ ============
const state = {
    graph: new Graph(),
    mode: 'select', // select, addVertex, addEdge, delete
    selectedVertex: null,
    selectedEdge: null,
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    edgeFrom: null,
    highlightedPath: [],
    highlightedVertices: [],
    // координаты для создания новой вершины
    pendingVertexX: 0, 
    pendingVertexY: 0,
    // панорамирование
    isPanning: false,
    panStartX: 0,
    panStartY: 0,
    panOffsetX: 0,
    panOffsetY: 0,
    // визуализация алгоритмов
    algoMode: 'off',       // 'off', 'bfs', 'dfs', 'dijkstra'
    algoStepMode: 'off',   // 'off', 'space', 'auto'
    algoDelay: 1000,       // мс
    algoTimerId: null,

    // для подсветки
    algoCurrent: null,     // текущая вершина (красная)
    algoNext: null,        // следующая (розовая)

    // BFS
    bfsQueue: [],
    bfsVisited: new Set(),
    bfsOrder: [],

    // DFS
    dfsStack: [],
    dfsVisited: new Set(),
    dfsOrder: [],

    // Дейкстра
    djUnvisited: new Set(),
    djDistances: new Map(),
    djPrevious: new Map(),
    djOrder: [],   
    
    // Связность
    componentsOriginalColors: null,

    isVisualizationRunning: false,
};

// ============ ИНИЦИАЛИЗАЦИЯ ============
const canvas = document.getElementById('graphCanvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    render();
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ============ РЕНДЕРИНГ ============
function render() {
    ctx.fillStyle = '#fcfcf9';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(state.zoom, state.zoom);
    ctx.translate(state.offsetX, state.offsetY);

    // Рисуем рёбра
    state.graph.edges.forEach((edge, index) => {
        drawEdge(edge, index);
    });

    // Рисуем вершины
    state.graph.vertices.forEach(vertex => {
        drawVertex(vertex);
    });

    ctx.restore();
}

function drawVertex(vertex) {
    const isSelected = state.selectedVertex === vertex.id;
    const isHighlighted = state.highlightedVertices.includes(vertex.id);

    const isCurrentAlgo = vertex.id === state.algoCurrent; // текущая вершина алгоритма
    const isNextAlgo = vertex.id === state.algoNext;       // следующая в очереди/стеке

    // Цвет ЗАЛИВКИ вершины
    if (isCurrentAlgo) {
        ctx.fillStyle = '#c0152f';        // красный
    } else if (isNextAlgo) {
        ctx.fillStyle = '#f7a3a3';        // бледно-розовый
    } else if (isHighlighted) {
        ctx.fillStyle = '#a84b2f';        // твой цвет для пути
    } else {
        ctx.fillStyle = vertex.color;     // обычный цвет вершины
    }
    ctx.beginPath();
    ctx.arc(vertex.x, vertex.y, vertex.radius, 0, Math.PI * 2);
    ctx.fill();

    if (isSelected) {
        ctx.strokeStyle = '#1f2121';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.strokeStyle = '#208141';
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }

    ctx.fillStyle = '#fcfcf9';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(vertex.label, vertex.x, vertex.y);
}

function drawEdge(edge, index) {
    const from = state.graph.vertices.get(edge.from);
    const to = state.graph.vertices.get(edge.to);

    if (!from || !to) return;

    const isHighlighted = state.highlightedPath.includes(index);
    const isSelected = state.selectedEdge === index;

    ctx.strokeStyle = isHighlighted ? '#c0152f' : (isSelected ? '#1f2121' : edge.color);
    ctx.lineWidth = isHighlighted ? 4 : (isSelected ? 3 : edge.width);

    // Рисуем линию
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();

    // Рисуем стрелку для ориентированных рёбер
    if (edge.isDirected) {
        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        const arrowSize = 12;
        const endX = to.x - Math.cos(angle) * (to.radius + 5);
        const endY = to.y - Math.sin(angle) * (to.radius + 5);

        ctx.fillStyle = edge.color;
        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(endX - arrowSize * Math.cos(angle - Math.PI / 6), endY - arrowSize * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(endX - arrowSize * Math.cos(angle + Math.PI / 6), endY - arrowSize * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
    }

    // Рисуем метку ребра
    if (edge.label) {
        const midX = (from.x + to.x) / 2;
        const midY = (from.y + to.y) / 2;
        ctx.fillStyle = '#1f2121';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(edge.label, midX, midY - 8);
    }
}

// ============ ОБРАБОТЧИКИ СОБЫТИЙ ============

// Кнопки инструментов
document.getElementById('addVertexBtn').addEventListener('click', () => {
state.mode = state.mode === 'addVertex' ? 'select' : 'addVertex';
document.getElementById('addVertexBtn').style.opacity = state.mode === 'addVertex' ? '0.5' : '1';
if (state.mode === 'addVertex') {
    openAddVertexModal();
}
});

document.getElementById('addEdgeBtn').addEventListener('click', () => {
    state.mode = state.mode === 'addEdge' ? 'select' : 'addEdge';
    document.getElementById('addEdgeBtn').style.opacity = state.mode === 'addEdge' ? '0.5' : '1';
    state.edgeFrom = null;
});

document.getElementById('deleteBtn').addEventListener('click', () => {
    if (state.selectedVertex) {
        state.graph.removeVertex(state.selectedVertex);
        state.selectedVertex = null;
    } else if (state.selectedEdge !== null) {
        state.graph.removeEdge(state.selectedEdge);
        state.selectedEdge = null;
    }
    updateStatus();
    render();
});

document.getElementById('clearBtn').addEventListener('click', () => {
    if (confirm('Вы уверены? Это действие невозможно отменить.')) {
        state.graph.clear();
        state.selectedVertex = null;
        state.selectedEdge = null;
        state.highlightedPath = [];
        state.highlightedVertices = [];
        updateStatus();
        render();
    }
});

// Макеты
document.getElementById('forceLayoutBtn').addEventListener('click', () => {
    forceDirectedLayout();
    render();
});

document.getElementById('circleLayoutBtn').addEventListener('click', () => {
    circleLayout();
    render();
});

document.getElementById('gridLayoutBtn').addEventListener('click', () => {
    gridLayout();
    render();
});

document.getElementById('treeLayoutBtn').addEventListener('click', openTreeLayoutModal);


// Алгоритмы
document.getElementById('dijkstraBtn').addEventListener('click', openDijkstraModal);
document.getElementById('bfsBtn').addEventListener('click', openBfsModal);
document.getElementById('dfsBtn').addEventListener('click', openDfsModal);
document.getElementById('componentsBtn').addEventListener('click', findConnectedComponents);
document.getElementById('cutVertexBtn').addEventListener('click', findCutVertices);
document.getElementById('bridgeBtn').addEventListener('click', findBridges);

// Матрицы
document.getElementById('loadMatrixBtn').addEventListener('click', loadGraphFromMatrix);
document.getElementById('saveMatrixBtn').addEventListener('click', saveGraphAsMatrix);


// Файлы
document.getElementById('saveBtn').addEventListener('click', saveGraph);
document.getElementById('loadBtn').addEventListener('click', () => {
    document.getElementById('fileInput').click();
});
document.getElementById('exportBtn').addEventListener('click', exportCanvas);

document.getElementById('fileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);
                state.graph.fromJSON(data);
                state.selectedVertex = null;
                state.selectedEdge = null;
                updateStatus();
                render();
            } catch (error) {
                alert('Ошибка загрузки файла: ' + error.message);
            }
        };
        reader.readAsText(file);
    }
});

// Масштабирование
document.getElementById('zoomInBtn').addEventListener('click', () => {
    state.zoom *= 1.2;
    updateZoomDisplay();
    render();
});

document.getElementById('zoomOutBtn').addEventListener('click', () => {
    state.zoom /= 1.2;
    updateZoomDisplay();
    render();
});

document.getElementById('resetZoomBtn').addEventListener('click', () => {
    state.zoom = 1;
    state.offsetX = 0;
    state.offsetY = 0;
    updateZoomDisplay();
    render();
});


// Обработка кнопок в модальных окнах
document.getElementById('vertexLabelInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        confirmAddVertex();
    }
});

// Canvas события
canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const canvasX = (e.clientX - rect.left - canvas.width / 2) / state.zoom - state.offsetX;
    const canvasY = (e.clientY - rect.top - canvas.height / 2) / state.zoom - state.offsetY;

    document.getElementById('mousePos').textContent = `Позиция: ${Math.round(canvasX)}, ${Math.round(canvasY)}`;

    if (state.isDragging && state.selectedVertex) {
        const vertex = state.graph.vertices.get(state.selectedVertex);
        vertex.x = canvasX;
        vertex.y = canvasY;
        render();
    }
    else if (state.isPanning) {
        const dx = (e.clientX - state.panStartX) / state.zoom;
        const dy = (e.clientY - state.panStartY) / state.zoom;
        state.offsetX = state.panOffsetX + dx;
        state.offsetY = state.panOffsetY + dy;
        render();
    }
});

canvas.addEventListener('mousedown', (e) => {
    if (state.isVisualizationRunning) {
        // во время визуализации игнорируем попытки редактирования
        return;
    }
    const rect = canvas.getBoundingClientRect();
    const canvasX = (e.clientX - rect.left - canvas.width / 2) / state.zoom - state.offsetX;
    const canvasY = (e.clientY - rect.top - canvas.height / 2) / state.zoom - state.offsetY;

    if (e.button === 2) return; // Right click handled separately

    // Поиск вершины под курсором
    let clickedVertex = null;
    for (let [id, vertex] of state.graph.vertices) {
        const dist = Math.hypot(vertex.x - canvasX, vertex.y - canvasY);
        if (dist <= vertex.radius) {
            clickedVertex = id;
            break;
        }
    }

    if (state.mode === 'addVertex' && !clickedVertex) {
        // Сохраняем координаты для последующего использования
        state.pendingVertexX = canvasX;
        state.pendingVertexY = canvasY;
        openAddVertexModal();
    } else if (state.mode === 'addEdge') {
        if (!state.edgeFrom && clickedVertex) {
            // выбираем стартовую вершину для ребра
            state.edgeFrom = clickedVertex;
        } else if (state.edgeFrom && clickedVertex 
                    && clickedVertex !== state.edgeFrom) {
            state.graph.addEdge(state.edgeFrom, clickedVertex, 1, '', '#626c7c', 2, false);
            state.edgeFrom = null;
            state.mode = 'select';
            document.getElementById('addEdgeBtn').style.opacity = '1';
            updateStatus();
            render();
        }
    } else if (state.mode === 'select') {
        state.selectedEdge = null;

        // Проверка клика по рёбрам
        for (let i = 0; i < state.graph.edges.length; i++) {
            const edge = state.graph.edges[i];
            const from = state.graph.vertices.get(edge.from);
            const to = state.graph.vertices.get(edge.to);
            const dist = pointToLineDistance(canvasX, canvasY, from.x, from.y, to.x, to.y);
            if (dist < 10) {
                state.selectedEdge = i;
                break;
            }
        }

        if (clickedVertex) {
            state.selectedVertex = clickedVertex;
            state.isDragging = true;
        } else {
            // панорамирование холста
            state.selectedVertex = null;
            state.isDragging = false;
            state.isPanning = true;
            state.panStartX = e.clientX;
            state.panStartY = e.clientY;
            state.panOffsetX = state.offsetX;
            state.panOffsetY = state.offsetY;
        }

        updatePropertiesPanel();
        render();
    }
});

canvas.addEventListener('mouseup', () => {
    state.isDragging = false;
    state.isPanning = false;
});

canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const canvasX = (e.clientX - rect.left - canvas.width / 2) / state.zoom - state.offsetX;
    const canvasY = (e.clientY - rect.top - canvas.height / 2) / state.zoom - state.offsetY;

    for (let [id, vertex] of state.graph.vertices) {
        const dist = Math.hypot(vertex.x - canvasX, vertex.y - canvasY);
        if (dist <= vertex.radius) {
            state.graph.removeVertex(id);
            state.selectedVertex = null;
            state.selectedEdge = null;
            updateStatus();
            render();
            return;
        }
    }
});

canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    state.zoom *= zoomFactor;
    state.zoom = Math.max(0.1, Math.min(state.zoom, 5));
    updateZoomDisplay();
    render();
});

// Свойства элементов
document.getElementById('vertexLabel').addEventListener('change', (e) => {
    if (state.selectedVertex) {
        // Проверка уникальности метки
        for (let [id, vertex] of state.graph.vertices) {
            if (vertex.label === e.target.value) {
                alert('Вершина с такой меткой уже существует!');
                return;
            }
        }
        state.graph.vertices.get(state.selectedVertex).label = e.target.value;
        render();
    }
});

document.getElementById('vertexColor').addEventListener('change', (e) => {
    if (state.selectedVertex) {
        state.graph.vertices.get(state.selectedVertex).color = e.target.value;
        render();
    }
});

document.getElementById('vertexRadius').addEventListener('change', (e) => {
    if (state.selectedVertex) {
        state.graph.vertices.get(state.selectedVertex).radius = parseInt(e.target.value);
        render();
    }
});

document.getElementById('edgeLabel').addEventListener('change', (e) => {
    if (state.selectedEdge !== null) {
        state.graph.edges[state.selectedEdge].label = e.target.value;
        render();
    }
});

document.getElementById('edgeWeight').addEventListener('change', (e) => {
    if (state.selectedEdge !== null) {
        state.graph.edges[state.selectedEdge].weight = parseFloat(e.target.value);
    }
});

document.getElementById('edgeColor').addEventListener('change', (e) => {
    if (state.selectedEdge !== null) {
        state.graph.edges[state.selectedEdge].color = e.target.value;
        render();
    }
});

document.getElementById('edgeWidth').addEventListener('change', (e) => {
    if (state.selectedEdge !== null) {
        state.graph.edges[state.selectedEdge].width = parseInt(e.target.value);
        render();
    }
});

document.getElementById('isDirected').addEventListener('change', (e) => {
    if (state.selectedEdge !== null) {
        state.graph.edges[state.selectedEdge].isDirected = e.target.checked;
        render();
    }
});

document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && state.algoStepMode === 'space') {
        e.preventDefault();
        if (state.algoMode === 'bfs') bfsStep();
        else if (state.algoMode === 'dfs') dfsStep();
        else if (state.algoMode === 'dijkstra') dijkstraStep();
    }
    if (e.key === 'Shift') {
        e.preventDefault();

        // 1) Компоненты связности: вернуть исходные цвета вершин
        if (state.componentsOriginalColors) {
            state.componentsOriginalColors.forEach((color, id) => {
                const v = state.graph.vertices.get(id);
                if (v) v.color = color;
            });
            state.componentsOriginalColors = null;
        }

        // 2) Шарниры / другие временные перекраски вершин
        if (state._originalVertexColors) {
            state._originalVertexColors.forEach((color, id) => {
                const v = state.graph.vertices.get(id);
                if (v) v.color = color;
            });
            state._originalVertexColors = null;
        }

        // 3) Сбросить подсветку путей / рёбер, если нужно
        state.highlightedVertices = [];
        state.highlightedPath = [];
        state.algoCurrent = null;
        state.algoNext = null;

        render();
    }
});

// ============ ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ============

function updatePropertiesPanel() {
    const noSelection = document.getElementById('noSelection');
    const vertexProps = document.getElementById('vertexProperties');
    const edgeProps = document.getElementById('edgeProperties');

    noSelection.classList.remove('hidden');
    vertexProps.classList.add('hidden');
    edgeProps.classList.add('hidden');

    if (state.selectedVertex) {
        const vertex = state.graph.vertices.get(state.selectedVertex);
        document.getElementById('vertexLabel').value = vertex.label;
        document.getElementById('vertexColor').value = vertex.color;
        document.getElementById('vertexRadius').value = vertex.radius;

        noSelection.classList.add('hidden');
        vertexProps.classList.remove('hidden');
    } else if (state.selectedEdge !== null) {
        const edge = state.graph.edges[state.selectedEdge];
        document.getElementById('edgeLabel').value = edge.label;
        document.getElementById('edgeWeight').value = edge.weight;
        document.getElementById('edgeColor').value = edge.color;
        document.getElementById('edgeWidth').value = edge.width;
        document.getElementById('isDirected').checked = edge.isDirected;

        noSelection.classList.add('hidden');
        edgeProps.classList.remove('hidden');
    }
}

function updateStatus() {
    document.getElementById('vertexCount').textContent = `Вершин: ${state.graph.vertices.size}`;
    document.getElementById('edgeCount').textContent = `Рёбер: ${state.graph.edges.length}`;
}

function updateZoomDisplay() {
    document.getElementById('zoomLevel').textContent = `${Math.round(state.zoom * 100)}%`;
}

function pointToLineDistance(px, py, x1, y1, x2, y2) {
    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    if (lenSq !== 0) param = dot / lenSq;
    let xx, yy;
    if (param < 0) { xx = x1; yy = y1; }
    else if (param > 1) { xx = x2; yy = y2; }
    else { xx = x1 + param * C; yy = y1 + param * D; }
    const dx = px - xx;
    const dy = py - yy;
    return Math.sqrt(dx * dx + dy * dy);
}

// Блокировка редактирования и опасных кнопок
function startVisualizationMode(label) {
    state.isVisualizationRunning = true;

    // Запрещаем режимы редактирования
    state.mode = 'select';
    state.edgeFrom = null;
    state.selectedVertex = null;
    state.selectedEdge = null;
    updatePropertiesPanel();

    // Блокируем кнопки редактирования графа
    const toDisable = [
        '#addVertexBtn',
        '#addEdgeBtn',
        '#deleteBtn',
        '#clearBtn',
        '#forceLayoutBtn',
        '#circleLayoutBtn',
        '#gridLayoutBtn',
        '#treeLayoutBtn',
        '#loadJsonBtn',
        '#loadMatrixBtn'
    ];

    toDisable.forEach(sel => {
        document.querySelectorAll(sel).forEach(btn => {
            btn.disabled = true;
            btn.classList.add('disabled-btn');
        });
    });

    // Показываем пользователю активный режим (простая строка над холстом)
    const status = document.getElementById('algorithmStatus');
    if (status) {
        status.textContent = `Выполняется визуализация: ${label}`;
        status.style.display = 'block';
    }
}

// Выключить режим визуализации: вернуть всё как было
function stopVisualizationMode() {
    state.isVisualizationRunning = false;

    const toDisable = [
        '#addVertexBtn',
        '#addEdgeBtn',
        '#deleteBtn',
        '#clearBtn',
        '#forceLayoutBtn',
        '#circleLayoutBtn',
        '#gridLayoutBtn',
        '#treeLayoutBtn',
        '#loadJsonBtn',
        '#loadMatrixBtn'
    ];

    toDisable.forEach(sel => {
        document.querySelectorAll(sel).forEach(btn => {
            btn.disabled = false;
            btn.classList.remove('disabled-btn');
        });
    });

    const status = document.getElementById('algorithmStatus');
    if (status) {
        status.textContent = '';
        status.style.display = 'none';
    }
}

// ============ ДОБАВЛЕНИЕ ВЕРШИНЫ ============


function openAddVertexModal() {
    const input = document.getElementById('vertexLabelInput');
    input.value = '';
    input.focus();
    document.getElementById('addVertexModal').classList.add('active');
}

function closeAddVertexModal() {
    document.getElementById('addVertexModal').classList.remove('active');
    state.mode = 'select';
    document.getElementById('addVertexBtn').style.opacity = '1';
}

function confirmAddVertex() {
    const label = document.getElementById('vertexLabelInput').value.trim();

    if (label === '') {
        alert('Метка не может быть пустой!');
        return;
    }

    // Проверка уникальности метки
    for (let [id, vertex] of state.graph.vertices) {
        if (vertex.label === label) {
            alert('Вершина с такой меткой уже существует!');
            return;
        }
    }

    // Генерация уникального ID
    let id = label;
    let counter = 1;
    while (state.graph.vertices.has(id)) {
        id = label + counter;
        counter++;
    }

    // Добавление вершины с сохранёнными координатами
    const x = state.pendingVertexX || 0;
    const y = state.pendingVertexY || 0;
    state.graph.addVertex(id, label, x, y);
    state.selectedVertex = id;


    if ((state.pendingVertexX > 150 && state.pendingVertexY < -150)
        || (state.pendingVertexX < -150 && state.pendingVertexY > 150)
    ){
        state.pendingVertexX -= 20;
        state.pendingVertexY += 20;
    }
    else{
        state.pendingVertexX += 20;
        state.pendingVertexY -= 20;
    }
    

    updateStatus();
    render();
    updatePropertiesPanel();
    closeAddVertexModal();
}


// ============ МАКЕТЫ ============

function forceDirectedLayout() {
    const iterations = 100;
    const k = 100;
    const c = 0.1;

    for (let iter = 0; iter < iterations; iter++) {
        const forces = new Map();
        for (let [id] of state.graph.vertices) {
            forces.set(id, { x: 0, y: 0 });
        }

        // Отталкивание между вершинами
        const vertices = Array.from(state.graph.vertices.values());
        for (let i = 0; i < vertices.length; i++) {
            for (let j = i + 1; j < vertices.length; j++) {
                const v1 = vertices[i];
                const v2 = vertices[j];
                const dx = v2.x - v1.x;
                const dy = v2.y - v1.y;
                const dist = Math.hypot(dx, dy) + 0.1;
                const force = (k * k) / dist;
                forces.get(v1.id).x -= (force * dx) / dist;
                forces.get(v1.id).y -= (force * dy) / dist;
                forces.get(v2.id).x += (force * dx) / dist;
                forces.get(v2.id).y += (force * dy) / dist;
            }
        }

        // Притяжение вдоль рёбер
        for (let edge of state.graph.edges) {
            const v1 = state.graph.vertices.get(edge.from);
            const v2 = state.graph.vertices.get(edge.to);
            const dx = v2.x - v1.x;
            const dy = v2.y - v1.y;
            const dist = Math.hypot(dx, dy) + 0.1;
            const force = (dist * dist) / k;
            forces.get(v1.id).x += (force * dx) / dist;
            forces.get(v1.id).y += (force * dy) / dist;
            forces.get(v2.id).x -= (force * dx) / dist;
            forces.get(v2.id).y -= (force * dy) / dist;
        }

        // Применяем силы
        for (let [id, vertex] of state.graph.vertices) {
            const f = forces.get(id);
            const dist = Math.hypot(f.x, f.y);
            if (dist > 0) {
                vertex.x += c * (f.x / dist) * Math.min(dist, 50);
                vertex.y += c * (f.y / dist) * Math.min(dist, 50);
            }
        }
    }
}

function circleLayout() {
    const vertices = Array.from(state.graph.vertices.values());
    const radius = Math.max(200, vertices.length * 30);
    const center = { x: 0, y: 0 };

    vertices.forEach((vertex, i) => {
        const angle = (i / vertices.length) * Math.PI * 2;
        vertex.x = center.x + Math.cos(angle) * radius;
        vertex.y = center.y + Math.sin(angle) * radius;
    });
}

function gridLayout() {
    const vertices = Array.from(state.graph.vertices.values());
    const cols = Math.ceil(Math.sqrt(vertices.length));
    const spacing = 150;

    vertices.forEach((vertex, i) => {
        vertex.x = (i % cols - cols / 2) * spacing;
        vertex.y = (Math.floor(i / cols) - cols / 2) * spacing;
    });
}

function openTreeLayoutModal() {
    if (state.graph.vertices.size === 0) {
        alert('Граф пуст');
        return;
    }

    const select = document.getElementById('treeRootVertex');
    select.innerHTML = '';

    for (let [id, v] of state.graph.vertices) {
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = v.label || id;
        select.appendChild(opt);
    }

    document.getElementById('treeModal').classList.add('active');
}

function closeTreeModal() {
    document.getElementById('treeModal').classList.remove('active');
}

function applyTreeLayout() {
    const rootId = document.getElementById('treeRootVertex').value;
    closeTreeModal();  

    if (!state.graph.vertices.has(rootId)) return;

    // 1. Строим уровни (BFS по неориентированному графу)
    const levels = [];                      
    const levelMap = new Map();            
    const visited = new Set();
    const queue = [rootId];

    visited.add(rootId);
    levelMap.set(rootId, 0);

    while (queue.length > 0) {
        const current = queue.shift();
        const depth = levelMap.get(current);

        if (!levels[depth]) levels[depth] = [];
        levels[depth].push(current);

        for (const edge of state.graph.edges) {
            let neighbor = null;
            if (edge.from === current) neighbor = edge.to;
            else if (!edge.isDirected && edge.to === current) neighbor = edge.from;

            if (neighbor !== null && !visited.has(neighbor)) {
                visited.add(neighbor);
                levelMap.set(neighbor, depth + 1);
                queue.push(neighbor);
            }
        }
    }

    // 2. Раскладываем по уровню: корень сверху, дети ниже
    const levelHeight = 150; 
    const nodeSpacing = 120; 

    levels.forEach((level, depth) => {
        const y = depth * levelHeight;

        const totalWidth = (level.length - 1) * nodeSpacing;
        let x = -totalWidth / 2;

        level.forEach(id => {
            const v = state.graph.vertices.get(id);
            if (v) {
                v.x = x;
                v.y = y;
            }
            x += nodeSpacing;
        });
    });

    // 3. Для вершин, не достигнутых от корня
    const notPlaced = [];
    for (let [id] of state.graph.vertices) {
        if (!visited.has(id)) notPlaced.push(id);
    }

    if (notPlaced.length > 0) {
        const depth = levels.length; 
        const y = depth * levelHeight;
        const totalWidth = (notPlaced.length - 1) * nodeSpacing;
        let x = -totalWidth / 2;

        notPlaced.forEach(id => {
            const v = state.graph.vertices.get(id);
            if (v) {
                v.x = x;
                v.y = y;
            }
            x += nodeSpacing;
        });
    }

    render();
}


// ============ АЛГОРИТМЫ ============

// Дейкстра (кратчайший путь)
function openDijkstraModal() {
    if (state.graph.vertices.size < 2) {
        alert('Нужно минимум 2 вершины');
        return;
    }

    const select1 = document.getElementById('startVertex');
    const select2 = document.getElementById('endVertex');
    select1.innerHTML = '';
    select2.innerHTML = '';

    for (let [id, vertex] of state.graph.vertices) {
        const opt1 = document.createElement('option');
        opt1.value = id;
        opt1.textContent = vertex.label || id;
        select1.appendChild(opt1);

        const opt2 = document.createElement('option');
        opt2.value = id;
        opt2.textContent = vertex.label || id;
        select2.appendChild(opt2);
    }

    document.getElementById('dijkstraModal').classList.add('active');
}

function closeDijkstraModal() {
    document.getElementById('dijkstraModal').classList.remove('active');
}

function startDijkstraVisualization() {
    closeDijkstraModal();
    startVisualizationMode('Кратчайший путь (Дейкстра)');

    const start = document.getElementById('startVertex').value;
    const end = document.getElementById('endVertex').value;
    const mode = document.getElementById('djModeSelect').value;
    const delaySec = parseFloat(document.getElementById('djDelayInput').value) || 1;

    if (state.algoTimerId) {
        clearInterval(state.algoTimerId);
        state.algoTimerId = null;
    }

    state.algoMode = 'dijkstra';
    state.algoStepMode = mode;
    state.algoDelay = delaySec * 1000;

    state.djDistances = new Map();
    state.djPrevious = new Map();
    state.djUnvisited = new Set();
    state.djOrder = [];

    for (let [id] of state.graph.vertices) {
        state.djDistances.set(id, id === start ? 0 : Infinity);
        state.djPrevious.set(id, null);
        state.djUnvisited.add(id);
    }

    state.dijkstraStart = start;
    state.dijkstraEnd = end;

    state.algoCurrent = null;
    state.algoNext = start;

    render();

    if (mode === 'auto') {
        state.algoTimerId = setInterval(dijkstraStep, state.algoDelay);
    }
}

function dijkstraStep() {
    if (state.djUnvisited.size === 0) {
        finishDijkstra();
        return;
    }

    // выбираем вершину с минимальной дистанцией среди непосещённых
    let current = null;
    let minDist = Infinity;
    for (let id of state.djUnvisited) {
        const d = state.djDistances.get(id);
        if (d < minDist) {
            minDist = d;
            current = id;
        }
    }

    if (current === null || minDist === Infinity) {
        finishDijkstra();
        return;
    }

    state.djUnvisited.delete(current);
    state.djOrder.push(current);
    state.algoCurrent = current;

    for (let edge of state.graph.edges) {
        let neighbor = null;
        if (edge.from === current && state.djUnvisited.has(edge.to)) {
            neighbor = edge.to;
        } else if (!edge.isDirected && edge.to === current && state.djUnvisited.has(edge.from)) {
            neighbor = edge.from;
        }

        if (neighbor !== null) {
            const alt = state.djDistances.get(current) + edge.weight;
            if (alt < state.djDistances.get(neighbor)) {
                state.djDistances.set(neighbor, alt);
                state.djPrevious.set(neighbor, current);
            }
        }
    }

    // следующая вершина в очереди (по текущим дистанциям)
    let next = null;
    let nextMin = Infinity;
    for (let id of state.djUnvisited) {
        const d = state.djDistances.get(id);
        if (d < nextMin) {
            nextMin = d;
            next = id;
        }
    }
    state.algoNext = next;

    if (current === state.dijkstraEnd) {
        finishDijkstra();
        return;
    }

    render();
}

function finishDijkstra() {
    if (state.algoTimerId) {
        clearInterval(state.algoTimerId);
        state.algoTimerId = null;
    }

    const start = state.dijkstraStart;
    const end = state.dijkstraEnd;

    // восстановление пути
    const path = [];
    let cur = end;
    while (cur !== null) {
        path.unshift(cur);
        cur = state.djPrevious.get(cur);
    }

    if (path[0] !== start) {
        alert('Пути не существует');
    } else {
        const dist = state.djDistances.get(end);
        const labels = path.map(id => state.graph.vertices.get(id).label || id);
        alert(`Кратчайший путь найден!\nДистанция: ${dist}\nПуть: ${labels.join(' → ')}`);
    }

    state.algoCurrent = null;
    state.algoNext = null;
    state.algoMode = 'off';
    state.algoStepMode = 'off';
    render();
    stopVisualizationMode();
}

// Обход в ширину
function openBfsModal() {
    if (state.graph.vertices.size < 1) {
        alert('Граф пуст');
        return;
    }

    const select = document.getElementById('bfsStartVertex');
    select.innerHTML = '';

    for (let [id, vertex] of state.graph.vertices) {
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = vertex.label || id;
        select.appendChild(opt);
    }

    document.getElementById('bfsModal').classList.add('active');
}

function closeBfsModal() {
    document.getElementById('bfsModal').classList.remove('active');
}

function startBfsVisualization() {
    closeBfsModal();
    startVisualizationMode('BFS обход');

    
    const start = document.getElementById('bfsStartVertex').value;
    const mode = document.getElementById('bfsModeSelect').value;
    const delaySec = parseFloat(document.getElementById('bfsDelayInput').value) || 1;

    if (state.algoTimerId) {
        clearInterval(state.algoTimerId);
        state.algoTimerId = null;
    }

    state.algoMode = 'bfs';
    state.algoStepMode = mode;
    state.algoDelay = delaySec * 1000;

    state.bfsVisited = new Set();
    state.bfsOrder = [];
    state.bfsQueue = [start];

    state.algoCurrent = null;
    state.algoNext = start;

    //closeBfsModal();
    render();

    if (mode === 'auto') {
        state.algoTimerId = setInterval(bfsStep, state.bfsDelay);
    }
    // В режиме по пробелу шаги пойдут из обработчика клавиатуры
}

function bfsStep() {
    if (state.bfsQueue.length === 0) {
        // Обход закончен
        if (state.algoTimerId) {
            clearInterval(state.algoTimerId);
            state.algoTimerId = null;
        }
        state.algoCurrent = null;
        state.algoNext = null;
        render();
        stopVisualizationMode();

        const labels = state.bfsOrder.map(id => state.graph.vertices.get(id).label || id);
        alert('BFS порядок: ' + labels.join(' → '));

        state.algoMode = 'off';
        state.algoStepMode = 'off';
        return;
    }

    const current = state.bfsQueue.shift();
    state.algoCurrent = current;
    state.bfsVisited.add(current);
    state.bfsOrder.push(current);

    // Добавляем соседей
    for (let edge of state.graph.edges) {
        if (edge.from === current && !state.bfsVisited.has(edge.to) && !state.bfsQueue.includes(edge.to)) {
            state.bfsQueue.push(edge.to);
        } else if (!edge.isDirected && edge.to === current &&
                !state.bfsVisited.has(edge.from) && !state.bfsQueue.includes(edge.from)) {
            state.bfsQueue.push(edge.from);
        }
    }

    // Следующая вершина в очереди (для бледно-розового)
    state.algoNext = state.bfsQueue.length > 0 ? state.bfsQueue[0] : null;

    render();
}

// Обход в глубину
function openDfsModal() {
    if (state.graph.vertices.size < 1) {
        alert('Граф пуст');
        return;
    }

    const select = document.getElementById('dfsStartVertex');
    select.innerHTML = '';

    for (let [id, vertex] of state.graph.vertices) {
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = vertex.label || id;
        select.appendChild(opt);
    }

    document.getElementById('dfsModal').classList.add('active');
}

function closeDfsModal() {
    document.getElementById('dfsModal').classList.remove('active');
}

function startDfsVisualization() {
    closeDfsModal();
    startVisualizationMode('DFS обход');

    const start = document.getElementById('dfsStartVertex').value;
    const mode = document.getElementById('dfsModeSelect').value;
    const delaySec = parseFloat(document.getElementById('dfsDelayInput').value) || 1;

    if (state.algoTimerId) {
        clearInterval(state.algoTimerId);
        state.algoTimerId = null;
    }

    state.algoMode = 'dfs';
    state.algoStepMode = mode;
    state.algoDelay = delaySec * 1000;

    state.dfsVisited = new Set();
    state.dfsOrder = [];
    state.dfsStack = [start];

    state.algoCurrent = null;
    state.algoNext = start;

    //closeDfsModal();
    render();

    if (mode === 'auto') {
        state.algoTimerId = setInterval(dfsStep, state.algoDelay);
    }
}

function dfsStep() {
    if (state.dfsStack.length === 0) {
        // закончено
        if (state.algoTimerId) {
            clearInterval(state.algoTimerId);
            state.algoTimerId = null;
        }
        state.algoCurrent = null;
        state.algoNext = null;
        render();
        stopVisualizationMode();

        const labels = state.dfsOrder.map(id => state.graph.vertices.get(id).label || id);
        alert('DFS порядок: ' + labels.join(' → '));

        state.algoMode = 'off';
        state.algoStepMode = 'off';
        return;
    }

    const current = state.dfsStack.pop();
    if (state.dfsVisited.has(current)) {
        // ищем следующего кандидата
        state.algoCurrent = current;
        state.algoNext = state.dfsStack.length ? state.dfsStack[state.dfsStack.length - 1] : null;
        render();
        return;
    }

    state.dfsVisited.add(current);
    state.dfsOrder.push(current);
    state.algoCurrent = current;

    // Добавляем соседей в стек 
    const neighbors = [];
    for (let edge of state.graph.edges) {
        if (edge.from === current) {
            neighbors.push(edge.to);
        } else if (!edge.isDirected && edge.to === current) {
            neighbors.push(edge.from);
        }
    }
    // добавляем в обратном порядке, чтобы первый в списке был обработан раньше
    neighbors.reverse().forEach(n => {
        if (!state.dfsVisited.has(n) && !state.dfsStack.includes(n)) {
            state.dfsStack.push(n);
        }
    });

    state.algoNext = state.dfsStack.length ? state.dfsStack[state.dfsStack.length - 1] : null;

    render();
}

// Связность
function findConnectedComponents() {
    const vertices = Array.from(state.graph.vertices.keys());
    if (vertices.length === 0) {
        alert('Граф пуст');
        return;
    }

    // Сохраняем исходные цвета, если ещё не сохранены
    const originalColors = new Map();
    state.graph.vertices.forEach((v, id) => {
        originalColors.set(id, v.color);
    });
    state.componentsOriginalColors = originalColors;

    const visited = new Set();
    const components = [];

    // Обход (используем BFS/DFS, рассматривая граф как неориентированный)
    for (const start of vertices) {
        if (visited.has(start)) continue;
        const queue = [start];
        const component = [];

        visited.add(start);
        while (queue.length > 0) {
            const v = queue.shift();
            component.push(v);

            for (const edge of state.graph.edges) {
                let neighbor = null;
                if (edge.from === v) neighbor = edge.to;
                else if (!edge.isDirected && edge.to === v) neighbor = edge.from;

                if (neighbor !== null && !visited.has(neighbor)) {
                    visited.add(neighbor);
                    queue.push(neighbor);
                }
            }
        }

        components.push(component);
    }

    // Палитра цветов для компонент
    const palette = [
        '#e6194b', // красный
        '#3cb44b', // зелёный
        '#4363d8', // синий
        '#f58231', // оранжевый
        '#911eb4', // фиолетовый
        '#46f0f0', // бирюзовый
        '#f032e6', // розовый
        '#bcf60c', // салатовый
        '#fabebe', // светло-розовый
        '#008080'  // тёмный бирюзовый
    ];

    // Красим каждую компоненту в свой цвет
    components.forEach((comp, index) => {
        const color = palette[index % palette.length];
        comp.forEach(id => {
            const v = state.graph.vertices.get(id);
            if (v) v.color = color;
        });
    });

    // Обновляем визуализацию
    state.algoCurrent = null;
    state.algoNext = null;
    render();

    // Показываем список компонент
    const compStr = components
        .map((comp, i) =>
            `${i + 1}: {` + comp
                .map(id => state.graph.vertices.get(id)?.label || id)
                .join(', ') + '}')
        .join('\n');
    alert('Компоненты связности:\n' + compStr);
}

// Шарниры и мосты
function tarjanArticulationAndBridges() {
    const ids = new Map();      // время входа в вершину
    const low = new Map();      // минимальное достижимое время
    const visited = new Set();
    let time = 0;

    const cutVertices = new Set(); // шарниры
    const bridges = [];            // список мостов 

    function dfs(at, parent = null) {
        visited.add(at);
        ids.set(at, time);
        low.set(at, time);
        time++;

        let children = 0;

        for (const edge of state.graph.edges) {
            // рассматриваем граф как неориентированный
            let to = null;
            if (edge.from === at) to = edge.to;
            else if (!edge.isDirected && edge.to === at) to = edge.from;

            if (to === null) continue;
            if (to === parent) continue;

            if (!visited.has(to)) {
                children++;
                dfs(to, at);

                low.set(at, Math.min(low.get(at), low.get(to)));

                // условие моста
                if (low.get(to) > ids.get(at)) {
                    bridges.push({ from: at, to });
                }

                // условие шарнира (не корень)
                if (parent !== null && low.get(to) >= ids.get(at)) {
                    cutVertices.add(at);
                }
            } else {
                // обратное ребро
                low.set(at, Math.min(low.get(at), ids.get(to)));
            }
        }

        // корень DFS‑дерева — шарнир, если имеет более одного ребёнка 
        if (parent === null && children > 1) {
            cutVertices.add(at);
        }
    }

    for (const [id] of state.graph.vertices) {
        if (!visited.has(id)) dfs(id, null);
    }

    return { cutVertices, bridges };
}

function findCutVertices() {
    if (state.graph.vertices.size === 0) {
        alert('Граф пуст');
        return;
    }

    // Сбрасываем предыдущую подсветку
    state.highlightedVertices = [];
    state.highlightedPath = [];
    state.algoCurrent = null;
    state.algoNext = null;

    const { cutVertices } = tarjanArticulationAndBridges();

    // Подсветка шарниров красным: используем highlightedVertices,
    // а в drawVertex уже предусмотрен цвет для них (например, #a84b2f),
    // либо можно временно менять v.color, если хочешь именно красный.
    state.highlightedVertices = Array.from(cutVertices);

    render();

    const list = Array.from(cutVertices).map(id =>
        state.graph.vertices.get(id)?.label || id
    );
    alert(
        cutVertices.size === 0
            ? 'Шарниров нет'
            : 'Найденные шарниры (cut vertices):\n' + list.join(', ')
    );
}

function findBridges() {
    if (state.graph.vertices.size === 0) {
        alert('Граф пуст');
        return;
    }

    state.highlightedVertices = [];
    state.highlightedPath = [];
    state.algoCurrent = null;
    state.algoNext = null;

    const { bridges } = tarjanArticulationAndBridges();

    // Подсветка мостов красным: собираем индексы рёбер в highlightedPath
    const bridgeEdges = [];
    for (let i = 0; i < state.graph.edges.length; i++) {
        const e = state.graph.edges[i];
        if (bridges.some(b =>
            (b.from === e.from && b.to === e.to) ||
            (!e.isDirected && b.from === e.to && b.to === e.from)
        )) {
            bridgeEdges.push(i);
        }
    }
    state.highlightedPath = bridgeEdges;

    render();

    const list = bridges.map(b => {
        const v1 = state.graph.vertices.get(b.from);
        const v2 = state.graph.vertices.get(b.to);
        const l1 = v1?.label || b.from;
        const l2 = v2?.label || b.to;
        return `${l1} — ${l2}`;
    });

    alert(
        bridges.length === 0
            ? 'Мостов нет'
            : 'Найденные мосты (bridges):\n' + list.join('\n')
    );
}

// ============ ФАЙЛЫ ============

function saveGraph() {
    // Диалог для ввода названия файла
    const filename = prompt('Введите название файла:', 'graph');
    if (filename === null) return; // Отмена

    const data = state.graph.toJSON();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.trim() === '' ? 'graph.json' : filename + '.json'; // Если пусто, используем 'graph.json'
    a.click();
    URL.revokeObjectURL(url);
}

function exportCanvas() {
    // Диалог для ввода названия файла
    const filename = prompt('Введите название файла:', 'graph');
    if (filename === null) return; // Отмена

    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = filename.trim() === '' ? 'graph.png' : filename + '.png'; // Если пусто, используем 'graph.png'
    link.click();
}

// ============ РАБОТА С МАТРИЦЕЙ ВЕСОВ ============

function openMatrixModal() {
    document.getElementById('matrixInput').value = '';
    document.getElementById('vertexLabelsInput').value = '';
    document.getElementById('isDirectedMatrixInput').checked = false;
    document.getElementById('matrixModal').classList.add('active');
}

function closeMatrixModal() {
    document.getElementById('matrixModal').classList.remove('active');
}

function confirmLoadMatrix() {
    const matrixText = document.getElementById('matrixInput').value.trim();
    const labelsText = document.getElementById('vertexLabelsInput').value.trim();
    const isDirected = document.getElementById('isDirectedMatrixInput').checked;

    if (!matrixText) {
        alert('Введите матрицу весов');
        return;
    }

    try {
        // Парсинг матрицы
        const lines = matrixText.split('\n').map(line => 
            line.trim().split(/\s+/).map(Number)
        ).filter(line => line.length > 0);

        const size = lines.length;

        // Проверка введенных весов
        for (let i = 0; i < size; i++) {
            for (let j = 0; j < lines[i].length; j++) {
                const value = lines[i][j];

                if (value === 0) continue;

                if (!Number.isFinite(value)) {
                    alert(`Значение в строке ${i + 1}, столбце ${j + 1} не является числом.`);
                    return;
                }

                if (value < 0 || value > 100) {
                    alert(`Вес в строке ${i + 1}, столбце ${j + 1} должен быть в диапазоне от 0 до 100.`);
                    return;
                }
            }
        }

        // Проверка корректности матрицы
        for (let line of lines) {
            if (line.length !== size) {
                alert('Матрица должна быть квадратной!');
                return;
            }
        }

        // Парсинг метак вершин
        const labels = labelsText ? 
            labelsText.split(',').map(l => l.trim()) : 
            Array.from({length: size}, (_, i) => `V${i}`);

        if (labels.length !== size) {
            alert(`Количество меток (${labels.length}) не совпадает с размером матрицы (${size})`);
            return;
        }

        // Очистка графа
        state.graph.clear();
        state.selectedVertex = null;
        state.selectedEdge = null;
        state.highlightedPath = [];
        state.highlightedVertices = [];

        // Создание вершин
        for (let i = 0; i < size; i++) {
            state.graph.addVertex(i.toString(), labels[i], i * 100 - (size * 50), 0);
        }

        // Создание рёбер из матрицы
        for (let i = 0; i < size; i++) {
            for (let j = 0; j < size; j++) {
                const weight = lines[i][j];
                if (weight !== 0 && weight !== undefined) {
                    // Для неориентированного графа избегаем дублирования
                    if (isDirected || i <= j) {
                        state.graph.addEdge(i.toString(), j.toString(), weight, 
                                        weight.toString(), '#626c7c', 2, isDirected);
                    }
                }
            }
        }

        updateStatus();
        render();
        closeMatrixModal();
        alert('Граф успешно загружен из матрицы');

    } catch (error) {
        alert('Ошибка при парсинге матрицы: ' + error.message);
    }
}

function loadGraphFromMatrix() {
    openMatrixModal();
}

function saveGraphAsMatrix() {
    const vertices = Array.from(state.graph.vertices.values());
    const size = vertices.length;

    if (size === 0) {
        alert('Граф пуст');
        return;
    }

    // Создание матрицы
    const matrix = Array(size).fill(null).map(() => Array(size).fill(0));

    // Заполнение матрицы весами
    for (let edge of state.graph.edges) {
        const fromIdx = Array.from(state.graph.vertices.keys()).indexOf(edge.from);
        const toIdx = Array.from(state.graph.vertices.keys()).indexOf(edge.to);

        if (fromIdx !== -1 && toIdx !== -1) {
            matrix[fromIdx][toIdx] = edge.weight;

            // Для неориентированных рёбер добавляем симметричное значение
            if (!edge.isDirected) {
                matrix[toIdx][fromIdx] = edge.weight;
            }
        }
    }

    // Форматирование матрицы в строку
    let matrixText = 'Матрица весов графа\n';
    matrixText += 'Вершины: ' + vertices.map(v => v.label).join(', ') + '\n\n';

    for (let i = 0; i < size; i++) {
        matrixText += matrix[i].map(val => 
            val === 0 ? '0' : val.toFixed(2)
        ).join('\t') + '\n';
    }

    // Сохранение в файл
    const filename = prompt('Введите название файла:', 'graph_matrix');
    if (filename === null) return;

    const blob = new Blob([matrixText], { type: 'text/plain; charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.trim() === '' ? 'graph_matrix.txt' : filename + '.txt';
    a.click();
    URL.revokeObjectURL(url);

    alert('Матрица сохранена в файл');
}



// Инициализация
updateStatus();
updateZoomDisplay();
