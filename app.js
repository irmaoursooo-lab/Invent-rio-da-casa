// js/app.js - Controlador Principal da Aplicação Apple Home Inventory
import { db } from './db.js?v=5';
import { fileToBase64, analyzeProductPhoto, analyzeReceiptPhoto } from './gemini.js?v=5';
import { renderInventoryGrid, renderShoppingList, renderReceiptReviewSheet, populateItemDetailModal, showAppleToast } from './ui.js?v=5';

// Estado da Aplicação
const state = {
  items: [],
  currentTab: 'inventario', // 'inventario' | 'compras' | 'ajustes'
  selectedCategory: 'todos', // 'todos' | 'alimento' | 'limpeza' | 'higiene'
  selectedStatus: 'todos', // 'todos' | 'ok' | 'baixo' | 'em_falta'
  searchQuery: '',
  editingItemId: null,
  activeDetailItemId: null,
  scanMode: 'produto', // 'produto' | 'nota'
  currentPhotoBase64: null,
  currentPhotoMime: null
};

// Inicialização segura
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => initApp());
} else {
  initApp();
}

async function initApp() {
  try {
    // 1. Inicializar ouvintes de eventos e UI primeiro (sem travar botões)
    setupNavigation();
    setupFilters();
    setupModals();
    setupScanner();
    setupSettings();
    setupNetworkStatusListener();
    registerServiceWorker();

    // 2. Carregar tema e dados
    await loadThemePreference();
    await refreshItems();
  } catch (err) {
    console.error('Erro na inicialização da aplicação:', err);
    showAppleToast('Erro ao carregar dados: ' + err.message, 'warning');
  }
}

// Registrar Service Worker
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => console.log('Service Worker registrado:', reg.scope))
        .catch(err => console.log('Falha no Service Worker:', err));
    });
  }
}

// Atualizar e renderizar lista de itens
async function refreshItems() {
  state.items = await db.getAllItems();
  applyFiltersAndRender();
  updateSummaryCounters();

  // Atualizar modal de detalhes se estiver aberto
  if (state.activeDetailItemId) {
    const detailModal = document.getElementById('modal-item-detail');
    if (detailModal && !detailModal.classList.contains('hidden')) {
      const updatedItem = state.items.find(i => i.id === state.activeDetailItemId);
      if (updatedItem) {
        populateItemDetailModal(
          updatedItem,
          async (newPriceData) => {
            await db.addPriceRecord(updatedItem.id, newPriceData);
            await refreshItems();
            showAppleToast('Novo preço registrado com sucesso!', 'success');
          },
          (idToEdit) => {
            closeModal('modal-item-detail');
            openItemModal(idToEdit);
          }
        );
      }
    }
  }
}

// Filtros e busca
function applyFiltersAndRender() {
  let filtered = [...state.items];

  // Filtro por Categoria
  if (state.selectedCategory !== 'todos') {
    filtered = filtered.filter(i => i.category === state.selectedCategory);
  }

  // Filtro por Status
  if (state.selectedStatus !== 'todos') {
    filtered = filtered.filter(i => i.status === state.selectedStatus);
  }

  // Busca textual
  if (state.searchQuery.trim()) {
    const q = state.searchQuery.toLowerCase().trim();
    filtered = filtered.filter(i => 
      i.name.toLowerCase().includes(q) ||
      i.category.toLowerCase().includes(q)
    );
  }

  // Renderizar de acordo com a aba ativa
  if (state.currentTab === 'inventario') {
    renderInventoryGrid(filtered, handleItemAction);
  } else if (state.currentTab === 'compras') {
    renderShoppingList(state.items, handleQuickReplenish);
  }
}

// Contadores dos cartões de resumo
function updateSummaryCounters() {
  const totalCount = state.items.length;
  const okCount = state.items.filter(i => i.status === 'ok').length;
  const baixoCount = state.items.filter(i => i.status === 'baixo').length;
  const faltaCount = state.items.filter(i => i.status === 'em_falta').length;

  const countAll = document.getElementById('count-total');
  const countOk = document.getElementById('count-ok');
  const countBaixo = document.getElementById('count-baixo');
  const countFalta = document.getElementById('count-falta');

  if (countAll) countAll.textContent = totalCount;
  if (countOk) countOk.textContent = okCount;
  if (countBaixo) countBaixo.textContent = baixoCount;
  if (countFalta) countFalta.textContent = faltaCount;

  // Atualizar badge da aba de compras
  const shoppingBadge = document.getElementById('badge-shopping-count');
  if (shoppingBadge) {
    const needed = baixoCount + faltaCount;
    if (needed > 0) {
      shoppingBadge.textContent = needed;
      shoppingBadge.classList.remove('hidden');
    } else {
      shoppingBadge.classList.add('hidden');
    }
  }
}

// Tratamento de ações nos cards de itens
async function handleItemAction(action, itemId, value) {
  if (action === 'increase') {
    await db.updateQuantity(itemId, 1);
    await refreshItems();
  } else if (action === 'decrease') {
    await db.updateQuantity(itemId, -1);
    await refreshItems();
  } else if (action === 'statusChange') {
    await db.updateStatus(itemId, value);
    await refreshItems();
    showAppleToast(`Status atualizado para ${value.replace('_', ' ')}`, 'success');
  } else if (action === 'edit') {
    openItemModal(itemId);
  } else if (action === 'detail') {
    const item = state.items.find(i => i.id === itemId);
    if (item) {
      openItemDetailModal(item);
    }
  }
}

// Abre o Pop-up de Detalhes do Produto e Histórico de Preços
function openItemDetailModal(item) {
  state.activeDetailItemId = item.id;
  populateItemDetailModal(
    item,
    async (newPriceData) => {
      await db.addPriceRecord(item.id, newPriceData);
      await refreshItems();
      showAppleToast('Novo preço registrado com sucesso!', 'success');
    },
    (idToEdit) => {
      closeModal('modal-item-detail');
      openItemModal(idToEdit);
    }
  );
  openModal('modal-item-detail');
}

// Reposição rápida a partir da Lista de Compras
async function handleQuickReplenish(item) {
  const qtyStr = prompt(`Quantas unidades de "${item.name}" você comprou?`, "1");
  if (qtyStr === null) return;

  const qty = parseFloat(qtyStr) || 1;
  const newTotal = (item.quantity || 0) + qty;
  
  await db.saveItem({
    ...item,
    quantity: newTotal,
    status: 'ok'
  });

  await refreshItems();
  showAppleToast(`"${item.name}" abastecido! Saldo: ${newTotal} ${item.unit}`, 'success');
}

// Navegação entre abas
function setupNavigation() {
  const navTabs = document.querySelectorAll('[data-tab-target]');
  navTabs.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tabTarget;
      switchTab(target);
    });
  });
}

function switchTab(tab) {
  state.currentTab = tab;

  // Atualizar classes ativas dos botões de navegação
  document.querySelectorAll('[data-tab-target]').forEach(btn => {
    if (btn.dataset.tabTarget === tab) {
      btn.classList.add('text-blue-600', 'dark:text-blue-400');
      btn.classList.remove('text-neutral-500');
    } else {
      btn.classList.remove('text-blue-600', 'dark:text-blue-400');
      btn.classList.add('text-neutral-500');
    }
  });

  // Exibir seções correspondentes
  const secInventory = document.getElementById('section-inventory');
  const secShopping = document.getElementById('section-shopping');
  const secSettings = document.getElementById('section-settings');

  if (secInventory) secInventory.classList.toggle('hidden', tab !== 'inventario');
  if (secShopping) secShopping.classList.toggle('hidden', tab !== 'compras');
  if (secSettings) secSettings.classList.toggle('hidden', tab !== 'ajustes');

  applyFiltersAndRender();
}

// Configuração de Filtros e Busca
function setupFilters() {
  // Filtros de Categoria (Pill Segmented)
  const categoryButtons = document.querySelectorAll('[data-filter-category]');
  categoryButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      categoryButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.selectedCategory = btn.dataset.filterCategory;
      applyFiltersAndRender();
    });
  });

  // Filtros de Status (Pill Segmented)
  const statusButtons = document.querySelectorAll('[data-filter-status]');
  statusButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      statusButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.selectedStatus = btn.dataset.filterStatus;
      applyFiltersAndRender();
    });
  });

  // Busca instantânea
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      applyFiltersAndRender();
    });
  }
}

// Modais (Cadastro Manual / Edição)
function setupModals() {
  const btnNewItem = document.getElementById('btn-new-item');
  if (btnNewItem) {
    btnNewItem.addEventListener('click', () => openItemModal(null));
  }

  const itemForm = document.getElementById('form-item');
  if (itemForm) {
    itemForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleSaveItemFromModal();
    });
  }

  const btnDeleteItem = document.getElementById('btn-delete-item');
  if (btnDeleteItem) {
    btnDeleteItem.addEventListener('click', async () => {
      if (state.editingItemId) {
        if (confirm('Tem certeza que deseja remover este produto do inventário?')) {
          await db.deleteItem(state.editingItemId);
          closeItemModal();
          await refreshItems();
          showAppleToast('Produto removido', 'info');
        }
      }
    });
  }

  // Fechar modais ao clicar no backdrop ou botão fechar
  document.querySelectorAll('[data-close-modal]').forEach(el => {
    el.addEventListener('click', () => {
      const modalId = el.dataset.closeModal;
      closeModal(modalId);
    });
  });
}

function openItemModal(itemId = null) {
  state.editingItemId = itemId;
  const modal = document.getElementById('modal-item');
  const title = document.getElementById('modal-item-title');
  const deleteBtn = document.getElementById('btn-delete-item');

  const nameInput = document.getElementById('item-name');
  const catInput = document.getElementById('item-category');
  const qtyInput = document.getElementById('item-quantity');
  const unitInput = document.getElementById('item-unit');
  const statusInput = document.getElementById('item-status');
  const thresholdInput = document.getElementById('item-threshold');
  const priceInput = document.getElementById('item-price');
  const storeInput = document.getElementById('item-store');

  if (itemId) {
    const item = state.items.find(i => i.id === itemId);
    if (!item) return;

    if (title) title.textContent = 'Editar Produto';
    if (nameInput) nameInput.value = item.name;
    if (catInput) catInput.value = item.category;
    if (qtyInput) qtyInput.value = item.quantity;
    if (unitInput) unitInput.value = item.unit;
    if (statusInput) statusInput.value = item.status;
    if (thresholdInput) thresholdInput.value = item.minAlertThreshold || 1;

    // Se tiver histórico de preços, preenche com o mais recente
    if (priceInput) {
      const latestPrice = (item.priceHistory && item.priceHistory.length > 0) ? item.priceHistory[0].price : '';
      priceInput.value = latestPrice || '';
    }
    if (storeInput) {
      const latestStore = (item.priceHistory && item.priceHistory.length > 0) ? item.priceHistory[0].store : '';
      storeInput.value = latestStore || '';
    }

    if (deleteBtn) deleteBtn.classList.remove('hidden');
  } else {
    if (title) title.textContent = 'Novo Produto';
    if (nameInput) nameInput.value = '';
    if (catInput) catInput.value = 'alimento';
    if (qtyInput) qtyInput.value = 1;
    if (unitInput) unitInput.value = 'un';
    if (statusInput) statusInput.value = 'ok';
    if (thresholdInput) thresholdInput.value = 1;
    if (priceInput) priceInput.value = '';
    if (storeInput) storeInput.value = '';
    if (deleteBtn) deleteBtn.classList.add('hidden');
  }

  openModal('modal-item');
}

async function handleSaveItemFromModal() {
  const name = document.getElementById('item-name').value;
  const category = document.getElementById('item-category').value;
  const quantity = parseFloat(document.getElementById('item-quantity').value) || 0;
  const unit = document.getElementById('item-unit').value;
  const status = document.getElementById('item-status').value;
  const threshold = parseFloat(document.getElementById('item-threshold').value) || 1;
  const priceInput = document.getElementById('item-price');
  const storeInput = document.getElementById('item-store');
  const priceVal = priceInput ? parseFloat(priceInput.value) : 0;
  const storeVal = storeInput ? storeInput.value.trim() : '';

  if (!name.trim()) {
    showAppleToast('Informe o nome do produto', 'warning');
    return;
  }

  let priceHistory = [];
  if (state.editingItemId) {
    const existing = state.items.find(i => i.id === state.editingItemId);
    if (existing && Array.isArray(existing.priceHistory)) {
      priceHistory = [...existing.priceHistory];
    }
  }

  // Se o usuário digitou preço e local no formulário, adiciona ao histórico se mudou
  if (priceVal > 0) {
    const isDifferent = priceHistory.length === 0 || 
                        priceHistory[0].price !== priceVal || 
                        (storeVal && priceHistory[0].store !== storeVal);
    if (isDifferent) {
      priceHistory.unshift({
        id: 'price_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        price: priceVal,
        store: storeVal || 'Mercado',
        date: new Date().toISOString().slice(0, 10),
        createdAt: new Date().toISOString()
      });
    }
  }

  const itemData = {
    id: state.editingItemId || undefined,
    name: name.trim(),
    category,
    quantity,
    unit,
    status,
    minAlertThreshold: threshold,
    priceHistory
  };

  await db.saveItem(itemData);
  closeModal('modal-item');
  await refreshItems();
  showAppleToast(state.editingItemId ? 'Produto atualizado' : 'Produto cadastrado com sucesso!', 'success');
}

function closeItemModal() {
  closeModal('modal-item');
  state.editingItemId = null;
}

// Scanner de Foto & IA Gemini
function setupScanner() {
  const btnOpenScanner = document.getElementById('btn-open-scanner');
  if (btnOpenScanner) {
    btnOpenScanner.addEventListener('click', () => {
      openModal('modal-scanner');
      resetScannerState();
    });
  }

  // Alternador de Modo do Scanner (Foto do Produto vs. Foto da Nota Fiscal)
  const scanModeButtons = document.querySelectorAll('[data-scan-mode]');
  scanModeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      scanModeButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.scanMode = btn.dataset.scanMode;
      updateScannerModeUI();
    });
  });

  // Input de Câmera / Arquivo
  const cameraInput = document.getElementById('camera-file-input');
  const uploadArea = document.getElementById('scanner-upload-area');
  const photoPreview = document.getElementById('scanner-preview-img');
  const previewContainer = document.getElementById('scanner-preview-container');

  if (uploadArea && cameraInput) {
    uploadArea.addEventListener('click', () => cameraInput.click());
  }

  if (cameraInput) {
    cameraInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        const { base64Data, mimeType, dataUrl } = await fileToBase64(file);
        state.currentPhotoBase64 = base64Data;
        state.currentPhotoMime = mimeType;

        if (photoPreview) photoPreview.src = dataUrl;
        if (uploadArea) uploadArea.classList.add('hidden');
        if (previewContainer) previewContainer.classList.remove('hidden');

        // Disparar análise automaticamente
        await processScannedPhoto();
      } catch (err) {
        showAppleToast('Erro ao carregar imagem: ' + err.message, 'warning');
      }
    });
  }

  // Botão Trocar Foto
  const btnRetake = document.getElementById('btn-retake-photo');
  if (btnRetake && cameraInput) {
    btnRetake.addEventListener('click', () => {
      resetScannerState();
      cameraInput.click();
    });
  }
}

function updateScannerModeUI() {
  const subtitle = document.getElementById('scanner-mode-description');
  if (!subtitle) return;

  if (state.scanMode === 'produto') {
    subtitle.textContent = 'Tire a foto da embalagem do produto. A IA preencherá o nome e categoria; você apenas digita a quantidade.';
  } else {
    subtitle.textContent = 'Tire a foto do cupom fiscal. A IA extrairá todos os produtos, quantidades e unidades em lote.';
  }
}

function resetScannerState() {
  state.currentPhotoBase64 = null;
  state.currentPhotoMime = null;
  const uploadArea = document.getElementById('scanner-upload-area');
  const previewContainer = document.getElementById('scanner-preview-container');
  const analyzingBox = document.getElementById('scanner-analyzing-box');
  const cameraInput = document.getElementById('camera-file-input');

  if (uploadArea) uploadArea.classList.remove('hidden');
  if (previewContainer) previewContainer.classList.add('hidden');
  if (analyzingBox) analyzingBox.classList.add('hidden');
  if (cameraInput) cameraInput.value = '';
}

// Processa a foto escaneada com IA
async function processScannedPhoto() {
  const analyzingBox = document.getElementById('scanner-analyzing-box');
  if (analyzingBox) analyzingBox.classList.remove('hidden');

  try {
    if (state.scanMode === 'produto') {
      // 1. Processar Foto de Produto Individual
      const result = await analyzeProductPhoto(state.currentPhotoBase64, state.currentPhotoMime);
      if (analyzingBox) analyzingBox.classList.add('hidden');
      closeModal('modal-scanner');

      // Verificar se produto já existe no inventário
      const existing = await db.findSimilarItem(result.name);

      // Preencher Modal de Produto
      openItemModal(null);
      document.getElementById('item-name').value = result.name;
      document.getElementById('item-category').value = result.category;
      document.getElementById('item-unit').value = result.unit;
      
      // Quantidade padrão a ser digitada
      const qtyInput = document.getElementById('item-quantity');
      qtyInput.value = 1;
      qtyInput.focus();
      qtyInput.select();

      if (existing) {
        showAppleToast(`Identificado: "${result.name}". Já existem ${existing.quantity} ${existing.unit} no estoque.`, 'info');
      } else {
        showAppleToast(`Identificado com sucesso: "${result.name}"`, 'success');
      }

    } else {
      // 2. Processar Foto de NOTA FISCAL em Lote
      const result = await analyzeReceiptPhoto(state.currentPhotoBase64, state.currentPhotoMime);
      if (analyzingBox) analyzingBox.classList.add('hidden');
      closeModal('modal-scanner');

      if (!result.items || result.items.length === 0) {
        showAppleToast('Nenhum item reconhecido na nota fiscal. Tente uma foto mais nítida.', 'warning');
        return;
      }

      // Procurar correspondências para cada item da nota
      const matches = await Promise.all(
        result.items.map(item => db.findSimilarItem(item.name))
      );

      // Abrir Folha de Revisão em Lote
      renderReceiptReviewSheet(result.items, matches, async (confirmedItems) => {
        if (confirmedItems.length === 0) {
          showAppleToast('Nenhum item selecionado para importar.', 'info');
          closeModal('modal-receipt-review');
          return;
        }

        // Salvar / Somar itens ao inventário
        for (const item of confirmedItems) {
          if (item.existingMatch) {
            // Somar à quantidade existente
            const newTotal = (item.existingMatch.quantity || 0) + item.quantity;
            const updatedHistory = Array.isArray(item.existingMatch.priceHistory) 
              ? [...item.existingMatch.priceHistory] 
              : [];

            if (item.unitPrice && item.unitPrice > 0) {
              updatedHistory.unshift({
                id: 'price_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
                price: item.unitPrice,
                store: item.store || 'Nota Fiscal',
                date: item.date || new Date().toISOString().slice(0, 10),
                createdAt: new Date().toISOString()
              });
            }

            await db.saveItem({
              ...item.existingMatch,
              quantity: newTotal,
              status: 'ok',
              category: item.category || item.existingMatch.category,
              priceHistory: updatedHistory
            });
          } else {
            // Criar novo produto
            const priceHistory = [];
            if (item.unitPrice && item.unitPrice > 0) {
              priceHistory.push({
                id: 'price_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
                price: item.unitPrice,
                store: item.store || 'Nota Fiscal',
                date: item.date || new Date().toISOString().slice(0, 10),
                createdAt: new Date().toISOString()
              });
            }

            await db.saveItem({
              name: item.name,
              category: item.category,
              quantity: item.quantity,
              unit: item.unit,
              status: 'ok',
              priceHistory
            });
          }
        }

        closeModal('modal-receipt-review');
        await refreshItems();
        showAppleToast(`${confirmedItems.length} itens importados e atualizados no estoque!`, 'success');
      });

      openModal('modal-receipt-review');
    }
  } catch (error) {
    if (analyzingBox) analyzingBox.classList.add('hidden');
    showAppleToast('Falha na análise da foto: ' + error.message, 'warning');
  }
}

// Configurações & Preferências
function setupSettings() {
  const apiKeyInput = document.getElementById('settings-gemini-key');
  const btnSaveKey = document.getElementById('btn-save-gemini-key');
  const btnTestKey = document.getElementById('btn-test-gemini-key');
  const btnExport = document.getElementById('btn-export-backup');
  const fileImport = document.getElementById('file-import-backup');
  const btnToggleTheme = document.getElementById('btn-toggle-theme');

  // Carregar chave salva
  db.getSetting('geminiApiKey', '').then(key => {
    if (apiKeyInput && key) apiKeyInput.value = key;
  });

  if (btnSaveKey && apiKeyInput) {
    btnSaveKey.addEventListener('click', async () => {
      const key = apiKeyInput.value.trim();
      await db.setSetting('geminiApiKey', key);
      showAppleToast('Chave de API salva com sucesso!', 'success');
    });
  }

  if (btnTestKey && apiKeyInput) {
    btnTestKey.addEventListener('click', async () => {
      const key = apiKeyInput.value.trim();
      if (!key) {
        showAppleToast('Cole uma chave de API para testar', 'warning');
        return;
      }
      btnTestKey.disabled = true;
      btnTestKey.textContent = 'Testando...';
      try {
        const model = modelSelect ? modelSelect.value : 'gemini-2.5-flash';
        const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}?key=${key}`);
        if (resp.ok) {
          showAppleToast(`Conexão com ${model} estabelecida com sucesso!`, 'success');
        } else {
          const errData = await resp.json().catch(() => ({}));
          showAppleToast(`Aviso: ${errData.error?.message || 'Erro ao conectar à API'}`, 'warning');
        }
      } catch (e) {
        showAppleToast('Erro de rede ao testar conexão: ' + e.message, 'warning');
      } finally {
        btnTestKey.disabled = false;
        btnTestKey.textContent = 'Testar Conexão com Gemini';
      }
    });
  }

  // Exportar Backup
  if (btnExport) {
    btnExport.addEventListener('click', async () => {
      const json = await db.exportBackup();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `inventario-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showAppleToast('Backup exportado com sucesso!', 'success');
    });
  }

  // Importar Backup
  if (fileImport) {
    fileImport.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const count = await db.importBackup(reader.result);
          await refreshItems();
          showAppleToast(`${count} itens restaurados do backup!`, 'success');
        } catch (err) {
          showAppleToast('Falha na importação: ' + err.message, 'warning');
        }
      };
      reader.readAsText(file);
    });
  }

  // Configuração do Modelo Gemini
  const modelSelect = document.getElementById('settings-gemini-model');
  if (modelSelect) {
    db.getSetting('geminiModel', 'gemini-2.5-flash').then(m => {
      modelSelect.value = m;
    });
    modelSelect.addEventListener('change', async () => {
      await db.setSetting('geminiModel', modelSelect.value);
      showAppleToast(`Modelo alterado para ${modelSelect.value}`, 'success');
    });
  }

  // Verificação em 3 Etapas para Limpeza do Estoque
  const btnClearAll = document.getElementById('btn-clear-all-items');
  const step1 = document.getElementById('clear-step-1');
  const step2 = document.getElementById('clear-step-2');
  const step3 = document.getElementById('clear-step-3');
  const stepCounter = document.getElementById('clear-step-counter');
  const totalCountEl = document.getElementById('clear-total-count');
  const inputConfirmText = document.getElementById('input-clear-confirm-text');
  const errorText = document.getElementById('clear-text-error');

  const btnStep2 = document.getElementById('btn-clear-goto-step-2');
  const btnBackStep1 = document.getElementById('btn-clear-back-to-step-1');
  const btnStep3 = document.getElementById('btn-clear-goto-step-3');
  const btnExecuteClear = document.getElementById('btn-execute-clear-all');

  function resetClearModal() {
    if (step1) step1.classList.remove('hidden');
    if (step2) step2.classList.add('hidden');
    if (step3) step3.classList.add('hidden');
    if (stepCounter) stepCounter.textContent = 'Etapa 1 de 3';
    if (inputConfirmText) inputConfirmText.value = '';
    if (errorText) errorText.classList.add('hidden');
  }

  if (btnClearAll) {
    btnClearAll.addEventListener('click', () => {
      resetClearModal();
      if (totalCountEl) totalCountEl.textContent = `${state.items.length} ${state.items.length === 1 ? 'item' : 'itens'}`;
      openModal('modal-clear-confirm');
    });
  }

  if (btnStep2) {
    btnStep2.addEventListener('click', () => {
      if (step1) step1.classList.add('hidden');
      if (step2) step2.classList.remove('hidden');
      if (stepCounter) stepCounter.textContent = 'Etapa 2 de 3';
      if (inputConfirmText) {
        inputConfirmText.value = '';
        inputConfirmText.focus();
      }
    });
  }

  if (btnBackStep1) {
    btnBackStep1.addEventListener('click', () => {
      resetClearModal();
    });
  }

  if (btnStep3) {
    btnStep3.addEventListener('click', () => {
      const val = (inputConfirmText?.value || '').trim().toUpperCase();
      if (val !== 'LIMPAR') {
        if (errorText) errorText.classList.remove('hidden');
        if (inputConfirmText) inputConfirmText.focus();
        return;
      }
      if (errorText) errorText.classList.add('hidden');
      if (step2) step2.classList.add('hidden');
      if (step3) step3.classList.remove('hidden');
      if (stepCounter) stepCounter.textContent = 'Etapa 3 de 3';
    });
  }

  if (btnExecuteClear) {
    btnExecuteClear.addEventListener('click', async () => {
      await db.clearAllItems();
      closeModal('modal-clear-confirm');
      await refreshItems();
      showAppleToast('Todo o estoque foi apagado com sucesso!', 'info');
    });
  }

  // Alternar Tema Claro / Escuro
  if (btnToggleTheme) {
    btnToggleTheme.addEventListener('click', async () => {
      const isDark = document.documentElement.classList.toggle('dark');
      await db.setSetting('theme', isDark ? 'dark' : 'light');
      updateThemeButtonLabel();
    });
  }

  // Forçar Atualização / Limpar Cache do PWA
  const btnForceRefresh = document.getElementById('btn-force-refresh');
  if (btnForceRefresh) {
    btnForceRefresh.addEventListener('click', async () => {
      btnForceRefresh.disabled = true;
      btnForceRefresh.textContent = 'Limpando cache...';
      try {
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          for (const reg of regs) {
            await reg.unregister();
          }
        }
        if ('caches' in window) {
          const keys = await caches.keys();
          for (const k of keys) {
            await caches.delete(k);
          }
        }
        showAppleToast('Cache limpo! Recarregando versão atualizada...', 'success');
        setTimeout(() => {
          window.location.reload(true);
        }, 800);
      } catch (err) {
        window.location.reload(true);
      }
    });
  }
}

async function loadThemePreference() {
  const savedTheme = await db.getSetting('theme', 'system');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  if (savedTheme === 'dark' || (savedTheme === 'system' && prefersDark)) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
  updateThemeButtonLabel();
}

function updateThemeButtonLabel() {
  const label = document.getElementById('theme-label');
  if (!label) return;
  const isDark = document.documentElement.classList.contains('dark');
  label.textContent = isDark ? 'Modo Claro' : 'Modo Escuro';
}

// Helpers de Modal genéricos
function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.add('hidden');
  document.body.style.overflow = '';
  if (id === 'modal-item-detail') {
    state.activeDetailItemId = null;
  }
}

// Detector de Conexão
function setupNetworkStatusListener() {
  const badge = document.getElementById('network-status-badge');
  const updateStatus = () => {
    if (!badge) return;
    if (navigator.onLine) {
      badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-green-500"></span><span class="text-xs text-neutral-500">Online</span>`;
    } else {
      badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-amber-500"></span><span class="text-xs text-amber-600 font-medium">Modo Offline</span>`;
    }
  };
  window.addEventListener('online', updateStatus);
  window.addEventListener('offline', updateStatus);
  updateStatus();
}
