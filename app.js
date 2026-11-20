const STORAGE_KEY = 'minimal_todos_v1';

const CATEGORY_LABELS = {
  work: '工作',
  life: '生活',
};

const VALID_STATUSES = ['todo', 'process', 'done'];

// 應用程式狀態
let todos = [];
let currentFilter = 'all';
let draggedTodoId = null;

// DOM 元素快取
const todoForm = document.getElementById('todo-form');
const todoInput = document.getElementById('todo-input');
const todoAssignee = document.getElementById('todo-assignee');
const todoCategory = document.getElementById('todo-category');
const remainingCountEl = document.getElementById('remaining-count');
const countAllEl = document.getElementById('count-all');
const countWorkEl = document.getElementById('count-work');
const countLifeEl = document.getElementById('count-life');
const clearCompletedBtn = document.getElementById('clear-completed-btn');
const filterBtns = document.querySelectorAll('.filter-btn');

const dropzones = {
  todo: document.getElementById('list-todo'),
  process: document.getElementById('list-process'),
  done: document.getElementById('list-done'),
};

const colCounts = {
  todo: document.getElementById('col-count-todo'),
  process: document.getElementById('col-count-process'),
  done: document.getElementById('col-count-done'),
};

const kanbanColumns = document.querySelectorAll('.kanban-column');

/**
 * 正規化單筆任務資料（相容舊版 completed 欄位）
 */
function normalizeTodo(item) {
  let status = item.status;
  if (!VALID_STATUSES.includes(status)) {
    status = item.completed ? 'done' : 'todo';
  }
  return {
    id: String(item.id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
    text: String(item.text || '').trim(),
    assignee: String(item.assignee || '未指派').trim(),
    category: item.category === 'life' ? 'life' : 'work',
    status,
    completed: status === 'done',
    createdAt: Number(item.createdAt) || Date.now(),
  };
}

/**
 * 從 localStorage 載入任務資料
 */
function loadTodos() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      todos = [];
      return;
    }
    const parsed = JSON.parse(raw);
    todos = Array.isArray(parsed) ? parsed.map(normalizeTodo) : [];
  } catch (err) {
    console.error('無法從 localStorage 讀取待辦事項:', err);
    todos = [];
  }
}

/**
 * 將任務資料儲存至 localStorage
 */
function saveTodos() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  } catch (err) {
    console.error('無法儲存待辦事項至 localStorage:', err);
  }
}

/**
 * 新增待辦任務（預設進入 To-do 欄位）
 * @param {string} text - 任務內容
 * @param {string} assignee - 負責人名稱
 * @param {'work' | 'life'} category - 任務分類
 */
function addTodo(text, assignee, category) {
  const newTodo = normalizeTodo({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    text,
    assignee: assignee || '未指派',
    category,
    status: 'todo',
    createdAt: Date.now(),
  });

  todos.unshift(newTodo);
  saveTodos();
  render();
}

/**
 * 更新任務所在欄位狀態 (todo / process / done)，並支援拖曳排序置頂
 * @param {string} id - 任務 ID
 * @param {'todo' | 'process' | 'done'} newStatus - 目標狀態欄位
 */
function updateTodoStatus(id, newStatus) {
  if (!VALID_STATUSES.includes(newStatus)) return;

  const targetIndex = todos.findIndex((item) => item.id === id);
  if (targetIndex === -1) return;

  const updatedItem = {
    ...todos[targetIndex],
    status: newStatus,
    completed: newStatus === 'done',
  };

  todos.splice(targetIndex, 1);
  todos.unshift(updatedItem);

  saveTodos();
  render();
}

/**
 * 刪除指定任務
 * @param {string} id - 任務 ID
 */
function deleteTodo(id) {
  todos = todos.filter((item) => item.id !== id);
  saveTodos();
  render();
}

/**
 * 清除所有 Done 狀態的任務
 */
function clearCompletedTodos() {
  todos = todos.filter((item) => item.status !== 'done');
  saveTodos();
  render();
}

/**
 * 更新上方統計數量與按鈕狀態
 */
function updateStats() {
  const doneCount = todos.filter((t) => t.status === 'done').length;
  const remainingCount = todos.length - doneCount;
  const workCount = todos.filter((t) => t.category === 'work').length;
  const lifeCount = todos.filter((t) => t.category === 'life').length;

  remainingCountEl.textContent = String(remainingCount);
  countAllEl.textContent = String(todos.length);
  countWorkEl.textContent = String(workCount);
  countLifeEl.textContent = String(lifeCount);

  clearCompletedBtn.hidden = doneCount === 0;
}

/**
 * 建立單一可拖曳任務卡片 DOM 節點
 * @param {Object} todo
 * @returns {HTMLDivElement}
 */
function createTaskCard(todo) {
  const card = document.createElement('div');
  card.className = 'task-card';
  card.draggable = true;
  card.dataset.id = todo.id;

  // 拖曳事件
  card.addEventListener('dragstart', (e) => {
    draggedTodoId = todo.id;
    card.classList.add('dragging');
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', todo.id);
    }
  });

  card.addEventListener('dragend', () => {
    draggedTodoId = null;
    card.classList.remove('dragging');
    kanbanColumns.forEach((col) => col.classList.remove('drag-over'));
  });

  // 卡片頂部：任務標題 + 刪除按鈕
  const headerDiv = document.createElement('div');
  headerDiv.className = 'task-card-header';

  const textSpan = document.createElement('span');
  textSpan.className = 'task-text';
  textSpan.textContent = todo.text;

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'btn-delete';
  deleteBtn.setAttribute('aria-label', `刪除「${todo.text}」`);
  deleteBtn.title = '刪除任務';
  deleteBtn.textContent = '✕';
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    deleteTodo(todo.id);
  });

  headerDiv.appendChild(textSpan);
  headerDiv.appendChild(deleteBtn);

  // 卡片底部：分類與負責人標籤
  const metaDiv = document.createElement('div');
  metaDiv.className = 'task-meta';

  const badgesDiv = document.createElement('div');
  badgesDiv.className = 'task-badges';

  const categoryKey = todo.category === 'life' ? 'life' : 'work';
  const categoryBadge = document.createElement('span');
  categoryBadge.className = `badge badge-${categoryKey}`;
  categoryBadge.textContent = CATEGORY_LABELS[categoryKey];

  const assigneeBadge = document.createElement('span');
  assigneeBadge.className = 'badge badge-assignee';
  assigneeBadge.textContent = `👤 ${todo.assignee || '未指派'}`;

  badgesDiv.appendChild(categoryBadge);
  badgesDiv.appendChild(assigneeBadge);
  metaDiv.appendChild(badgesDiv);

  card.appendChild(headerDiv);
  card.appendChild(metaDiv);

  return card;
}

/**
 * 渲染三欄式看板
 */
function render() {
  updateStats();

  const filteredTodos =
    currentFilter === 'all'
      ? todos
      : todos.filter((item) => item.category === currentFilter);

  VALID_STATUSES.forEach((status) => {
    const zone = dropzones[status];
    const items = filteredTodos.filter((item) => item.status === status);

    colCounts[status].textContent = String(items.length);
    zone.innerHTML = '';

    if (items.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'column-empty';
      emptyDiv.textContent = '將任務卡片拖曳至此處';
      zone.appendChild(emptyDiv);
    } else {
      const fragment = document.createDocumentFragment();
      items.forEach((todo) => {
        fragment.appendChild(createTaskCard(todo));
      });
      zone.appendChild(fragment);
    }
  });
}

// 綁定三欄拖放區事件
kanbanColumns.forEach((column) => {
  const targetStatus = column.dataset.status;

  column.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
    column.classList.add('drag-over');
  });

  column.addEventListener('dragenter', (e) => {
    e.preventDefault();
    column.classList.add('drag-over');
  });

  column.addEventListener('dragleave', (e) => {
    if (!column.contains(e.relatedTarget)) {
      column.classList.remove('drag-over');
    }
  });

  column.addEventListener('drop', (e) => {
    e.preventDefault();
    column.classList.remove('drag-over');
    const id = draggedTodoId || (e.dataTransfer ? e.dataTransfer.getData('text/plain') : '');
    if (id && targetStatus) {
      updateTodoStatus(id, targetStatus);
    }
  });
});

// 事件綁定：提交新增表單
todoForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = todoInput.value.trim();
  const assignee = todoAssignee.value.trim();
  const category = todoCategory.value;

  if (!text || !assignee) return;

  addTodo(text, assignee, category);
  todoInput.value = '';
  todoInput.focus();
});

// 事件綁定：切換分類篩選
filterBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    currentFilter = btn.dataset.filter || 'all';
    filterBtns.forEach((b) => {
      const isActive = b === btn;
      b.classList.toggle('active', isActive);
      b.setAttribute('aria-selected', String(isActive));
    });
    render();
  });
});

// 事件綁定：清除已完成任務
clearCompletedBtn.addEventListener('click', clearCompletedTodos);

// 初始化應用程式
loadTodos();
render();
