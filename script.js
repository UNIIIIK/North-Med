// ===============================
// North Med Diagnostics
// Laboratory Reagent Inventory System
// ===============================

// ===============================
// Domain & Utility Layer (Single-responsibility helpers)
// ===============================

const CategoryItems = Object.freeze({
  Chemistry: [
    'Glucose',
    'Cholesterol',
    'Triglycerides',
    'HDL Chol',
    'Uric Acid',
    'Total Protein',
    'Albumin',
    'Amylase',
    'Calcium',
    'Phosphorus',
    'SGPT',
    'SGOT',
    'Urea',
    'Creatinine',
    'TB',
    'DB',
  ],
  Hematology: [
    'URIT Diluent',
    'URIT Lyse',
    'URIT Probe Cleanser',
    'URIT Detergent',
    'Anti Sera A',
    'Anti Sera B',
    'Rh Typing',
  ],
  Immunoserology: [
    'GP PSA',
    'TSH',
    'GP FT4',
    'GP T4',
    'HbA1c',
    'GP T3',
    'FBS',
    'CRP',
    'Trop I',
    'Thyroid Panel B',
    'GLU Serology',
    'HCG Serum (1,2)',
    'HBsAg (1,2)',
    'RPR/Anti-TP',
  ],
});

const DateUtils = (() => {
  function parse(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function format(dateStr) {
    const d = parse(dateStr);
    if (!d) return '';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }

  function daysBetween(from, to) {
    if (!from || !to) return null;
    const msPerDay = 24 * 60 * 60 * 1000;
    const diff = to.setHours(0, 0, 0, 0) - from.setHours(0, 0, 0, 0);
    return Math.round(diff / msPerDay);
  }

  function classifyExpiry(expiryDateStr) {
    const today = new Date();
    const expiry = parse(expiryDateStr);
    if (!expiry) return { label: 'No Expiry', code: 'none', days: null };
    const daysDiff = daysBetween(today, expiry);
    if (daysDiff < 0) {
      return { label: 'Expired', code: 'expired', days: daysDiff };
    }
    if (daysDiff <= 90) {
      return {
        label: `Expiring in ${daysDiff} day${daysDiff === 1 ? '' : 's'}`,
        code: 'warning',
        days: daysDiff,
      };
    }
    return {
      label: `Valid (${daysDiff} day${daysDiff === 1 ? '' : 's'} left)`,
      code: 'good',
      days: daysDiff,
    };
  }

  return { parse, format, classifyExpiry };
})();

// ===============================
// Persistence Layer
// ===============================

const InventoryRepository = (() => {
  const TABLE_NAME = 'inventory_items';

  function getClient() {
    const client = window.supabaseClient;
    if (!client) {
      console.error('Supabase client not found on window.supabaseClient');
    }
    return client;
  }

  function mapRowToItem(row) {
    if (!row) return null;
    return {
      id: row.id,
      category: row.category || '',
      itemName: row.item_name,
      brand: row.brand || '',
      contentVolume: row.content_volume || '',
      lotNumber: row.lot_number || '',
      dateReceived: row.date_received || '',
      expiryDate: row.expiry_date || '',
      dateOpened: row.date_opened || '',
      status: row.status || 'Unopened',
      quantity: Number(row.quantity ?? 0),
      remarks: row.remarks || '',
    };
  }

  function mapItemToRow(item) {
    return {
      id: item.id,
      category: item.category || null,
      item_name: item.itemName,
      brand: item.brand || null,
      content_volume: item.contentVolume || null,
      lot_number: item.lotNumber || null,
      date_received: item.dateReceived || null,
      expiry_date: item.expiryDate || null,
      date_opened: item.dateOpened || null,
      status: item.status || 'Unopened',
      quantity: Number(item.quantity ?? 0),
      remarks: item.remarks || null,
    };
  }

  async function load() {
    const supabase = getClient();
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from(TABLE_NAME)
        .select('*')
        .order('expiry_date', { ascending: true });
      if (error) {
        console.error('Failed to load inventory from Supabase', error);
        return [];
      }
      return (data || []).map(mapRowToItem);
    } catch (err) {
      console.error('Unexpected error loading inventory from Supabase', err);
      return [];
    }
  }

  async function upsert(item) {
    const supabase = getClient();
    if (!supabase) return [];
    try {
      const row = mapItemToRow(item);
      const { error } = await supabase.from(TABLE_NAME).upsert(row);
      if (error) {
        console.error('Failed to upsert inventory item in Supabase', error);
      }
    } catch (err) {
      console.error('Unexpected error upserting inventory item in Supabase', err);
    }
    // Always return a fresh list
    return load();
  }

  async function remove(id) {
    const supabase = getClient();
    if (!supabase) return [];
    try {
      const { error } = await supabase
        .from(TABLE_NAME)
        .delete()
        .eq('id', id);
      if (error) {
        console.error('Failed to delete inventory item in Supabase', error);
      }
    } catch (err) {
      console.error('Unexpected error deleting inventory item in Supabase', err);
    }
    // Return updated list
    return load();
  }

  async function initializeWithSampleDataIfEmpty() {
    // For Supabase-backed storage we simply load existing rows.
    const items = await load();
    return items;
  }

  return { load, upsert, remove, initializeWithSampleDataIfEmpty };
})();

// ===============================
// Service Layer (business rules)
// ===============================

const InventoryService = (() => {
  function createItem(payload) {
    return {
      id: payload.id || `itm-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      category: payload.category,
      itemName: payload.itemName,
      brand: payload.brand || '',
      contentVolume: payload.contentVolume || '',
      lotNumber: payload.lotNumber || '',
      dateReceived: payload.dateReceived || '',
      expiryDate: payload.expiryDate || '',
      dateOpened: payload.dateOpened || '',
      status: payload.status || 'Unopened',
      quantity: Number(payload.quantity ?? 0),
      remarks: payload.remarks || '',
    };
  }

  function validate(item) {
    const errors = [];
    if (!item.category) errors.push('Category is required');
    if (!item.itemName) errors.push('Item Name is required');
    if (!item.expiryDate) errors.push('Expiry Date is required');
    if (item.quantity == null || Number.isNaN(item.quantity)) {
      errors.push('Quantity must be a number');
    }
    if (item.quantity < 0) {
      errors.push('Quantity cannot be negative');
    }
    return errors;
  }

  function filter(items, filters) {
    return items.filter((i) => {
      if (filters.category && i.category !== filters.category) return false;
      if (filters.status && i.status !== filters.status) return false;

      if (filters.search) {
        const q = filters.search.toLowerCase();
        const haystack = [
          i.category,
          i.itemName,
          i.brand,
          i.contentVolume,
          i.lotNumber,
          i.remarks,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      const expInfo = DateUtils.classifyExpiry(i.expiryDate);
      if (filters.expiry === 'expired' && expInfo.code !== 'expired') return false;
      if (filters.expiry === '3months' && expInfo.code !== 'warning') return false;
      if (filters.expiry === 'good' && expInfo.code !== 'good') return false;

      if (filters.lowStock === 'low' && !(i.quantity <= 2)) return false;

      return true;
    });
  }

  function sort(items, sortField, direction) {
    if (!sortField) return items.slice();
    const dir = direction === 'desc' ? -1 : 1;
    const sorted = items.slice().sort((a, b) => {
      let av = a[sortField];
      let bv = b[sortField];

      if (sortField === 'quantity') {
        av = Number(av ?? 0);
        bv = Number(bv ?? 0);
      }

      if (sortField.toLowerCase().includes('date')) {
        const ad = DateUtils.parse(av);
        const bd = DateUtils.parse(bv);
        const at = ad ? ad.getTime() : 0;
        const bt = bd ? bd.getTime() : 0;
        return at === bt ? 0 : at > bt ? dir : -dir;
      }

      if (typeof av === 'string') av = av.toLowerCase();
      if (typeof bv === 'string') bv = bv.toLowerCase();

      if (av === bv) return 0;
      return av > bv ? dir : -dir;
    });
    return sorted;
  }

  function computeAlerts(items) {
    let expSoon = 0;
    let expired = 0;
    let outOfStock = 0;
    let zeroQty = 0;

    items.forEach((i) => {
      const expInfo = DateUtils.classifyExpiry(i.expiryDate);
      if (expInfo.code === 'expired') expired += 1;
      if (expInfo.code === 'warning') expSoon += 1;
      if (i.status === 'Out of Stock') outOfStock += 1;
      if (i.quantity === 0) zeroQty += 1;
    });

    return { expSoon, expired, outOfStock, zeroQty };
  }

  return { createItem, validate, filter, sort, computeAlerts };
})();

// ===============================
// UI Layer
// ===============================

const UI = (() => {
  let state = {
    items: [],
    filters: {
      search: '',
      category: '',
      status: '',
      expiry: '',
      lowStock: '',
    },
    sortField: 'expiryDate',
    sortDirection: 'asc',
  };

  // DOM references
  const els = {};

  function cacheDom() {
    els.category = document.getElementById('category');
    els.itemName = document.getElementById('itemName');
    els.inventoryForm = document.getElementById('inventoryForm');
    els.submitBtn = document.getElementById('submitBtn');
    els.tableBody = document.getElementById('inventoryTableBody');
    els.searchInput = document.getElementById('searchInput');
    els.filterCategory = document.getElementById('filterCategory');
    els.filterStatus = document.getElementById('filterStatus');
    els.filterExpiry = document.getElementById('filterExpiry');
    els.filterLowStock = document.getElementById('filterLowStock');
    els.tableHead = document.querySelector('#inventoryTable thead');
    els.alertSummary = document.getElementById('alertSummary');
    els.exportCsvBtn = document.getElementById('exportCsvBtn');
    els.yearSpan = document.getElementById('yearSpan');
    els.kpiExpSoon = document.getElementById('kpiExpSoon');
    els.kpiOutOrZero = document.getElementById('kpiOutOrZero');
    els.kpiTotal = document.getElementById('kpiTotal');
    els.fabAddItem = document.getElementById('fabAddItem');
    els.topSearchInput = document.getElementById('topSearchInput');

    // Edit modal elements
    els.editModalBackdrop = document.getElementById('editModalBackdrop');
    els.editModalCloseBtn = document.getElementById('editModalCloseBtn');
    els.editForm = document.getElementById('editForm');
    els.editCancelBtn = document.getElementById('editCancelBtn');

    // Add modal elements
    els.addModalBackdrop = document.getElementById('addModalBackdrop');
    els.addModalCloseBtn = document.getElementById('addModalCloseBtn');
    els.addCancelBtn = document.getElementById('addCancelBtn');
  }

  function initCategoryItemOptions() {
    if (!els.category || !els.itemName) return;

    function populate() {
      const category = els.category.value;
      const select = els.itemName;
      select.innerHTML = '<option value="">Select item</option>';
      if (!category || !CategoryItems[category]) return;
      CategoryItems[category].forEach((name) => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        select.appendChild(opt);
      });
    }

    els.category.addEventListener('change', populate);
    populate();
  }

  async function handleFormSubmit(e) {
    e.preventDefault();
    const formData = new FormData(els.inventoryForm);
    const payload = {
      category: formData.get('category'),
      itemName: formData.get('itemName'),
      brand: formData.get('brand'),
      contentVolume: formData.get('contentVolume'),
      lotNumber: formData.get('lotNumber'),
      dateReceived: formData.get('dateReceived'),
      expiryDate: formData.get('expiryDate'),
      status: formData.get('status'),
      quantity: Number(formData.get('quantity')),
      remarks: '',
    };
    const item = InventoryService.createItem(payload);
    const errors = InventoryService.validate(item);
    if (errors.length) {
      alert('Please fix the following issues:\n- ' + errors.join('\n- '));
      return;
    }
    state.items = await InventoryRepository.upsert(item);
    els.inventoryForm.reset();
    closeAddModal();
    render();
  }

  function handleFilters() {
    const baseSearch = els.searchInput ? els.searchInput.value.trim() : '';
    const topSearch = els.topSearchInput ? els.topSearchInput.value.trim() : '';
    state.filters.search = `${baseSearch} ${topSearch}`.trim();
    state.filters.category = els.filterCategory ? els.filterCategory.value : '';
    state.filters.status = els.filterStatus.value;
    state.filters.expiry = els.filterExpiry.value;
    state.filters.lowStock = els.filterLowStock.value;
    renderTable();
    renderAlerts();
  }

  function handleSortClick(e) {
    const th = e.target.closest('th[data-sort]');
    if (!th) return;
    const field = th.dataset.sort;
    if (state.sortField === field) {
      state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      state.sortField = field;
      state.sortDirection = 'asc';
    }
    renderTable();
  }

  function openEditModal(id) {
    const item = state.items.find((i) => i.id === id);
    if (!item) return;
    els.editModalBackdrop.hidden = false;
    document.body.style.overflow = 'hidden';

    document.getElementById('editId').value = item.id;
    const editCategory = document.getElementById('editCategory');
    if (editCategory) {
      editCategory.value = item.category || '';
    }
    document.getElementById('editItemName').value = item.itemName;
    document.getElementById('editBrand').value = item.brand;
    document.getElementById('editContentVolume').value = item.contentVolume;
    document.getElementById('editLotNumber').value = item.lotNumber;
    document.getElementById('editDateReceived').value = item.dateReceived;
    document.getElementById('editExpiryDate').value = item.expiryDate;
    document.getElementById('editStatus').value = item.status;
    document.getElementById('editQuantity').value = item.quantity;

    const firstInput = document.getElementById('editItemName');
    if (firstInput) {
      firstInput.focus();
    }
  }

  function closeEditModal() {
    els.editModalBackdrop.hidden = true;
    document.body.style.overflow = '';
  }

  function openAddModal() {
    if (!els.addModalBackdrop) return;
    els.addModalBackdrop.hidden = false;
    document.body.style.overflow = 'hidden';
    if (els.inventoryForm) {
      els.inventoryForm.reset();
      if (els.category) {
        els.category.dispatchEvent(new Event('change'));
        els.category.focus();
      }
    }
  }

  function closeAddModal() {
    if (!els.addModalBackdrop) return;
    els.addModalBackdrop.hidden = true;
    document.body.style.overflow = '';
  }

  async function handleEditSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('editId').value;
    const payload = {
      id,
      category: document.getElementById('editCategory').value || '',
      itemName: document.getElementById('editItemName').value,
      brand: document.getElementById('editBrand').value,
      contentVolume: document.getElementById('editContentVolume').value,
      lotNumber: document.getElementById('editLotNumber').value,
      dateReceived: document.getElementById('editDateReceived').value,
      expiryDate: document.getElementById('editExpiryDate').value,
      status: document.getElementById('editStatus').value,
      quantity: Number(document.getElementById('editQuantity').value),
      remarks: '',
    };
    const updatedItem = InventoryService.createItem(payload);
    const errors = InventoryService.validate(updatedItem);
    if (errors.length) {
      alert('Please fix the following issues:\n- ' + errors.join('\n- '));
      return;
    }
    state.items = await InventoryRepository.upsert(updatedItem);
    closeEditModal();
    render();
  }

  async function handleDelete(id) {
    const item = state.items.find((i) => i.id === id);
    const label = item ? `${item.itemName} (${item.category})` : id;
    if (!window.confirm(`Delete inventory item:\n${label}?`)) return;
    state.items = await InventoryRepository.remove(id);
    render();
  }

  function attachTableRowHandlers() {
    els.tableBody.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      if (action === 'edit') openEditModal(id);
      if (action === 'delete') handleDelete(id);
    });
  }

  function renderTable() {
    const filtered = InventoryService.filter(state.items, state.filters);
    const sorted = InventoryService.sort(
      filtered,
      state.sortField,
      state.sortDirection
    );
    els.tableBody.innerHTML = '';
    sorted.forEach((item) => {
      const tr = document.createElement('tr');
      const expInfo = DateUtils.classifyExpiry(item.expiryDate);
      const expClass =
        expInfo.code === 'expired'
          ? 'tag--exp-expired'
          : expInfo.code === 'warning'
          ? 'tag--exp-warning'
          : expInfo.code === 'good'
          ? 'tag--exp-good'
          : '';
      const statusClass =
        item.status === 'Unopened'
          ? 'tag--status-unopened'
          : item.status === 'Opened'
          ? 'tag--status-opened'
          : 'tag--status-out';

      tr.innerHTML = `
        <td>${item.category || ''}</td>
        <td>${item.itemName}</td>
        <td>${item.brand || ''}</td>
        <td>${item.contentVolume || ''}</td>
        <td>${item.lotNumber || ''}</td>
        <td>${DateUtils.format(item.dateReceived)}</td>
        <td>${DateUtils.format(item.expiryDate)}</td>
        <td><span class="tag ${statusClass}">${item.status}</span></td>
        <td>${item.quantity}</td>
        <td>
          <span class="tag ${expClass}">
            ${expInfo.label}
          </span>
        </td>
        <td>
          <div class="table-actions">
            <button type="button" class="btn-edit" data-action="edit" data-id="${item.id}">Edit</button>
            <button type="button" class="btn-delete" data-action="delete" data-id="${item.id}">Delete</button>
          </div>
        </td>
      `;
      els.tableBody.appendChild(tr);
    });
  }

  function renderAlerts() {
    const alerts = InventoryService.computeAlerts(state.items);
    els.alertSummary.innerHTML = '';
    const pills = [];
    if (alerts.expired > 0) {
      pills.push(
        `<span class="pill pill--danger">${alerts.expired} expired item${alerts.expired === 1 ? '' : 's'}</span>`
      );
    }
    if (alerts.expSoon > 0) {
      pills.push(
        `<span class="pill pill--warning">${alerts.expSoon} expiring &le; 90 days</span>`
      );
    }
    if (alerts.outOfStock > 0 || alerts.zeroQty > 0) {
      const totalOut = alerts.outOfStock + alerts.zeroQty;
      pills.push(
        `<span class="pill pill--danger">${totalOut} out of stock / zero quantity</span>`
      );
    }
    if (pills.length === 0) {
      pills.push(
        '<span class="pill pill--muted">No critical alerts</span>'
      );
    }
    els.alertSummary.innerHTML = pills.join('');

    // update KPI cards
    if (els.kpiExpSoon) {
      els.kpiExpSoon.textContent = String(alerts.expSoon);
    }
    if (els.kpiOutOrZero) {
      const totalOut = alerts.outOfStock + alerts.zeroQty;
      els.kpiOutOrZero.textContent = String(totalOut);
    }
    if (els.kpiTotal) {
      els.kpiTotal.textContent = String(state.items.length);
    }
  }

  function exportCsv() {
    const filtered = InventoryService.filter(state.items, state.filters);
    const sorted = InventoryService.sort(
      filtered,
      state.sortField,
      state.sortDirection
    );
    if (sorted.length === 0) {
      alert('No inventory data to export for the current view.');
      return;
    }
    const header = [
      'Category',
      'Item Name',
      'Brand / Supplier',
      'Content Volume',
      'Lot Number',
      'Date Received',
      'Expiry Date',
      'Date Opened',
      'Status',
      'Quantity Remaining',
      'Remarks',
      'Expiry Status',
    ];
    const rows = sorted.map((item) => {
      const expInfo = DateUtils.classifyExpiry(item.expiryDate);
      return [
        item.category,
        item.itemName,
        item.brand || '',
        item.contentVolume || '',
        item.lotNumber || '',
        DateUtils.format(item.dateReceived),
        DateUtils.format(item.expiryDate),
        DateUtils.format(item.dateOpened),
        item.status,
        String(item.quantity),
        (item.remarks || '').replace(/\n/g, ' '),
        expInfo.label,
      ];
    });
    const csvLines = [header, ...rows]
      .map((row) =>
        row
          .map((value) => {
            const safe = value.replace(/"/g, '""');
            return `"${safe}"`;
          })
          .join(',')
      )
      .join('\r\n');

    const blob = new Blob([csvLines], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    a.download = `north-med-reagent-inventory-${ts}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function bindEvents() {
    els.inventoryForm.addEventListener('submit', handleFormSubmit);

    if (els.searchInput) {
      els.searchInput.addEventListener('input', handleFilters);
    }
    if (els.topSearchInput) {
      els.topSearchInput.addEventListener('input', handleFilters);
    }
    if (els.filterCategory) {
      els.filterCategory.addEventListener('change', handleFilters);
    }
    els.filterStatus.addEventListener('change', handleFilters);
    els.filterExpiry.addEventListener('change', handleFilters);
    els.filterLowStock.addEventListener('change', handleFilters);

    els.tableHead.addEventListener('click', handleSortClick);
    attachTableRowHandlers();

    // Edit modal handlers
    els.editModalCloseBtn.addEventListener('click', closeEditModal);
    els.editCancelBtn.addEventListener('click', closeEditModal);
    els.editModalBackdrop.addEventListener('click', (e) => {
      if (e.target === els.editModalBackdrop) closeEditModal();
    });
    els.editForm.addEventListener('submit', handleEditSubmit);

    // Add modal handlers
    if (els.addModalCloseBtn) {
      els.addModalCloseBtn.addEventListener('click', closeAddModal);
    }
    if (els.addCancelBtn) {
      els.addCancelBtn.addEventListener('click', closeAddModal);
    }
    if (els.addModalBackdrop) {
      els.addModalBackdrop.addEventListener('click', (e) => {
        if (e.target === els.addModalBackdrop) closeAddModal();
      });
    }

    // Global escape key to close modals
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (els.editModalBackdrop && !els.editModalBackdrop.hidden) {
          closeEditModal();
        }
        if (els.addModalBackdrop && !els.addModalBackdrop.hidden) {
          closeAddModal();
        }
      }
    });

    // Export
    els.exportCsvBtn.addEventListener('click', exportCsv);

    // FAB opens add modal
    if (els.fabAddItem) {
      els.fabAddItem.addEventListener('click', openAddModal);
    }
  }

  function render() {
    renderTable();
    renderAlerts();
  }

  async function init() {
    cacheDom();
    state.items = await InventoryRepository.initializeWithSampleDataIfEmpty();
    initCategoryItemOptions();
    bindEvents();
    render();
    if (els.yearSpan) {
      els.yearSpan.textContent = String(new Date().getFullYear());
    }
  }

  return { init };
})();

// ===============================
// Bootstrap
// ===============================

document.addEventListener('DOMContentLoaded', () => {
  UI.init();
});


