// js/ui.js - Renderização de Componentes e Interações no Estilo Apple
import { db } from './db.js?v=5';

// Utilitário para formatar moeda em Real Brasileiro (BRL)
export function formatBRL(value) {
  const num = parseFloat(value) || 0;
  return 'R$ ' + num.toFixed(2).replace('.', ',');
}

// Utilitário para formatar data (AAAA-MM-DD para DD/MM/AAAA)
export function formatDateBR(dateStr) {
  if (!dateStr) return '';
  const parts = String(dateStr).split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

// Utilitário para escapar strings HTML
export function escapeHTML(str) {
  if (!str) return '';
  return String(str).replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}

// Utilitário para exibir Toast estilo Notificação Apple
export function showAppleToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `flex items-center gap-3 px-4 py-3 rounded-2xl shadow-lg border text-sm font-medium transition-all duration-300 transform translate-y-[-20px] opacity-0 backdrop-blur-md`;

  let iconSvg = '';
  if (type === 'success') {
    toast.style.backgroundColor = 'var(--apple-card)';
    toast.style.borderColor = 'rgba(52, 199, 89, 0.3)';
    iconSvg = `<svg class="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>`;
  } else if (type === 'warning') {
    toast.style.backgroundColor = 'var(--apple-card)';
    toast.style.borderColor = 'rgba(255, 149, 0, 0.3)';
    iconSvg = `<svg class="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>`;
  } else {
    toast.style.backgroundColor = 'var(--apple-card)';
    toast.style.borderColor = 'rgba(0, 113, 227, 0.3)';
    iconSvg = `<svg class="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;
  }

  toast.innerHTML = `${iconSvg} <span class="text-neutral-800 dark:text-neutral-100">${message}</span>`;
  container.appendChild(toast);

  // Animar entrada
  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-[-20px]', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');
  });

  // Remover após 3.5 segundos
  setTimeout(() => {
    toast.classList.remove('translate-y-0', 'opacity-100');
    toast.classList.add('translate-y-[-10px]', 'opacity-0');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Renderiza a lista de itens do inventário
export function renderInventoryGrid(items, onAction) {
  const container = document.getElementById('inventory-list');
  if (!container) return;

  if (items.length === 0) {
    container.innerHTML = `
      <div class="col-span-full py-16 text-center">
        <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-400">
          <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
        </div>
        <h3 class="text-lg font-semibold text-neutral-900 dark:text-white">Nenhum item encontrado</h3>
        <p class="text-sm text-neutral-500 max-w-sm mx-auto mt-1">Cadastre um produto manualmente ou tire uma foto do produto ou nota fiscal para começar.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = items.map(item => createItemCardHTML(item)).join('');

  // Vincular eventos: Stepper (+/-), Seletor de Status, Botão Lápis, Clique Curto (Detalhes) e Clique Longo de 3s (Edição)
  items.forEach(item => {
    const cardEl = document.getElementById(`card-${item.id}`);
    const decBtn = document.getElementById(`dec-${item.id}`);
    const incBtn = document.getElementById(`inc-${item.id}`);
    const editBtn = document.getElementById(`btn-edit-${item.id}`);
    const statusSelect = document.getElementById(`status-select-${item.id}`);
    const progressBar = document.getElementById(`longpress-bar-${item.id}`);

    if (decBtn) {
      decBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        onAction('decrease', item.id);
      });
    }

    if (incBtn) {
      incBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        onAction('increase', item.id);
      });
    }

    if (statusSelect) {
      statusSelect.addEventListener('change', (e) => {
        e.stopPropagation();
        onAction('statusChange', item.id, e.target.value);
      });
      statusSelect.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }

    if (editBtn) {
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        onAction('edit', item.id);
      });
    }

    if (cardEl) {
      let pressTimer = null;
      let longPressTriggered = false;
      let startX = 0;
      let startY = 0;
      let isInteracting = false;

      const cancelVisualFeedback = () => {
        cardEl.classList.remove('scale-[0.98]');
        if (progressBar) {
          progressBar.style.transition = 'none';
          progressBar.style.opacity = '0';
          progressBar.style.width = '0%';
        }
      };

      const startPress = (e) => {
        // Se clicou em botões de ação ou selects, não inicia a contagem do card
        if (e.target.closest('button') || e.target.closest('select') || e.target.closest('.badge-category')) {
          return;
        }

        isInteracting = true;
        longPressTriggered = false;

        if (e.type === 'touchstart') {
          startX = e.touches[0].clientX;
          startY = e.touches[0].clientY;
        } else {
          startX = e.clientX;
          startY = e.clientY;
        }

        // Animação da barra de progresso do toque longo de 3 segundos
        if (progressBar) {
          progressBar.style.transition = 'width 3s linear, opacity 0.2s ease';
          progressBar.style.opacity = '1';
          progressBar.style.width = '100%';
        }

        cardEl.classList.add('scale-[0.98]');

        pressTimer = setTimeout(() => {
          longPressTriggered = true;
          cancelVisualFeedback();
          
          // Feedback tátil em dispositivos compatíveis (iPhone / iPad / Android)
          if (navigator.vibrate) {
            try { navigator.vibrate(60); } catch (_) {}
          }

          onAction('edit', item.id);
        }, 3000);
      };

      const cancelPress = () => {
        if (pressTimer) {
          clearTimeout(pressTimer);
          pressTimer = null;
        }
        cancelVisualFeedback();
      };

      const endPress = (e) => {
        if (!isInteracting) return;
        isInteracting = false;

        const wasTriggered = longPressTriggered;
        cancelPress();

        // Se soltou antes de 3s (clique regular) e não tocou em botões ou selects, abre detalhes
        if (!wasTriggered) {
          if (!e.target.closest('button') && !e.target.closest('select') && !e.target.closest('.badge-category')) {
            onAction('detail', item.id);
          }
        }
      };

      const movePress = (e) => {
        if (!isInteracting) return;
        const curX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
        const curY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;

        // Se mover mais de 10px (usuário está rolando a tela), cancela a contagem
        if (Math.hypot(curX - startX, curY - startY) > 10) {
          isInteracting = false;
          cancelPress();
        }
      };

      // Eventos de Toque (Mobile / iOS)
      cardEl.addEventListener('touchstart', startPress, { passive: true });
      cardEl.addEventListener('touchmove', movePress, { passive: true });
      cardEl.addEventListener('touchend', endPress);
      cardEl.addEventListener('touchcancel', () => { isInteracting = false; cancelPress(); });

      // Eventos de Mouse (Desktop)
      cardEl.addEventListener('mousedown', startPress);
      cardEl.addEventListener('mousemove', movePress);
      cardEl.addEventListener('mouseup', endPress);
      cardEl.addEventListener('mouseleave', () => { isInteracting = false; cancelPress(); });

      // Evita menu de contexto ao segurar no mobile
      cardEl.addEventListener('contextmenu', (e) => {
        if (longPressTriggered) {
          e.preventDefault();
        }
      });
    }
  });
}

// Cria o HTML do Card de Produto estilo Apple com Indicadores de Preço e Lápis
function createItemCardHTML(item) {
  const statusBadgeClasses = {
    'ok': 'badge-ok',
    'baixo': 'badge-baixo',
    'em_falta': 'badge-em-falta'
  };

  const categoryLabels = {
    'alimento': 'Alimento',
    'limpeza': 'Limpeza',
    'higiene': 'Higiene'
  };

  const categoryIcons = {
    'alimento': '🍎',
    'limpeza': '✨',
    'higiene': '🧴'
  };

  // Inteligência de Preço no Card
  let priceSnippetHtml = '';
  if (Array.isArray(item.priceHistory) && item.priceHistory.length > 0) {
    const minRec = item.priceHistory.reduce((min, cur) => cur.price < min.price ? cur : min, item.priceHistory[0]);
    
    // Tendência se houver mais de 1 compra
    let trendIcon = '';
    if (item.priceHistory.length >= 2) {
      const sorted = [...item.priceHistory].sort((a, b) => new Date(b.date) - new Date(a.date));
      const latest = sorted[0];
      const prev = sorted[1];
      if (latest.price < prev.price) {
        trendIcon = '<span class="text-green-600 dark:text-green-400 font-bold ml-1" title="Preço baixou">↘️</span>';
      } else if (latest.price > prev.price) {
        trendIcon = '<span class="text-red-500 dark:text-red-400 font-bold ml-1" title="Preço subiu">↗️</span>';
      }
    }

    priceSnippetHtml = `
      <div class="mt-2 flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
        <span class="font-semibold text-neutral-900 dark:text-neutral-200">${formatBRL(minRec.price)}</span>
        <span class="text-[11px] text-neutral-400 truncate max-w-[120px]">• ${escapeHTML(minRec.store)}</span>
        ${trendIcon}
      </div>
    `;
  }

  return `
    <div id="card-${item.id}" class="apple-glass-card rounded-2xl p-4 flex flex-col justify-between cursor-pointer transition-all hover:scale-[1.01] relative overflow-hidden select-none">
      
      <!-- Barra de progresso para clique longo (3 segundos) -->
      <div id="longpress-bar-${item.id}" class="absolute top-0 left-0 h-1 bg-blue-500 rounded-t-2xl w-0 opacity-0 pointer-events-none z-10"></div>

      <div>
        <div class="flex items-center justify-between gap-2 mb-2">
          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium badge-category">
            <span>${categoryIcons[item.category] || '📦'}</span>
            <span>${categoryLabels[item.category] || item.category}</span>
          </span>

          <div class="flex items-center gap-1.5">
            <!-- Seletor Rápido de Status -->
            <div class="relative inline-block">
              <select id="status-select-${item.id}" class="text-xs font-semibold px-2.5 py-1 rounded-full cursor-pointer appearance-none pr-5 ${statusBadgeClasses[item.status]}">
                <option value="ok" ${item.status === 'ok' ? 'selected' : ''}>● Ok</option>
                <option value="baixo" ${item.status === 'baixo' ? 'selected' : ''}>● Baixo</option>
                <option value="em_falta" ${item.status === 'em_falta' ? 'selected' : ''}>● Em falta</option>
              </select>
              <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-1.5 text-current opacity-60">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
              </div>
            </div>

            <!-- Botão de Edição com Ícone de Lápis -->
            <button id="btn-edit-${item.id}" title="Editar Produto (ou segure por 3s)" class="p-1.5 rounded-full text-neutral-400 hover:text-blue-600 hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
            </button>
          </div>
        </div>

        <h4 class="font-semibold text-base text-neutral-900 dark:text-neutral-100 line-clamp-2 mt-1 leading-snug">
          ${escapeHTML(item.name)}
        </h4>

        ${priceSnippetHtml}
      </div>

      <div class="mt-4 pt-3 border-t border-black/5 dark:border-white/5 flex items-center justify-between">
        <div class="flex items-baseline gap-1">
          <span class="text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">
            ${item.quantity}
          </span>
          <span class="text-xs font-medium text-neutral-500 uppercase">
            ${item.unit}
          </span>
        </div>

        <div class="flex items-center gap-1.5">
          <button id="dec-${item.id}" title="Diminuir quantidade" class="apple-stepper-btn">
            −
          </button>
          <button id="inc-${item.id}" title="Aumentar quantidade" class="apple-stepper-btn">
            +
          </button>
        </div>
      </div>
    </div>
  `;
}

// Popula e Gerencia a Janela Pop-up de Detalhes do Produto & Histórico de Preços
export function populateItemDetailModal(item, onSavePrice, onEditItem) {
  const categoryLabels = {
    alimento: 'Alimento',
    limpeza: 'Limpeza',
    higiene: 'Higiene'
  };

  const categoryIcons = {
    alimento: '🍎',
    limpeza: '✨',
    higiene: '🧴'
  };

  const statusLabels = {
    ok: '● Ok (Em estoque)',
    baixo: '● Baixo (Perto de acabar)',
    em_falta: '● Em falta (Esgotado)'
  };

  const statusBadgeClasses = {
    ok: 'badge-ok',
    baixo: 'badge-baixo',
    em_falta: 'badge-em-falta'
  };

  // 1. Cabeçalho do Produto
  const catBadge = document.getElementById('detail-category-badge');
  if (catBadge) {
    catBadge.innerHTML = `<span>${categoryIcons[item.category] || '📦'}</span> <span>${categoryLabels[item.category] || item.category}</span>`;
  }

  const statusBadge = document.getElementById('detail-status-badge');
  if (statusBadge) {
    statusBadge.className = `inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusBadgeClasses[item.status]}`;
    statusBadge.textContent = statusLabels[item.status] || item.status;
  }

  const nameEl = document.getElementById('detail-item-name');
  if (nameEl) nameEl.textContent = item.name;

  const stockEl = document.getElementById('detail-item-stock');
  if (stockEl) {
    stockEl.textContent = `Estoque atual: ${item.quantity} ${item.unit} • Alerta mínimo: ${item.minAlertThreshold || 1} ${item.unit}`;
  }

  // 2. Botão de Lápis de Edição no Cabeçalho do Pop-up
  const pencilBtn = document.getElementById('btn-detail-edit-pencil');
  if (pencilBtn) {
    pencilBtn.onclick = () => {
      if (onEditItem) onEditItem(item.id);
    };
  }

  // 3. Processar Histórico de Preços
  const history = Array.isArray(item.priceHistory) ? [...item.priceHistory] : [];
  history.sort((a, b) => new Date(b.date) - new Date(a.date));

  const bestPriceEl = document.getElementById('detail-best-price');
  const bestUnitEl = document.getElementById('detail-best-unit');
  const bestStoreEl = document.getElementById('detail-best-store');
  const trendBadge = document.getElementById('detail-price-trend-badge');
  const countEl = document.getElementById('detail-records-count');
  const historyList = document.getElementById('detail-price-history-list');

  if (countEl) {
    countEl.textContent = `${history.length} ${history.length === 1 ? 'registro' : 'registros'}`;
  }

  if (history.length === 0) {
    if (bestPriceEl) bestPriceEl.textContent = 'R$ --';
    if (bestUnitEl) bestUnitEl.textContent = `/ ${item.unit}`;
    if (bestStoreEl) bestStoreEl.textContent = 'Nenhum registro de preço ainda';
    if (trendBadge) {
      trendBadge.className = 'text-xs font-medium px-2.5 py-0.5 rounded-full bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400';
      trendBadge.textContent = 'Sem histórico';
    }
    if (historyList) {
      historyList.innerHTML = `
        <div class="py-8 text-center rounded-2xl border border-dashed border-black/10 dark:border-white/10">
          <div class="w-10 h-10 mx-auto mb-2 rounded-full bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center text-blue-600">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          </div>
          <p class="text-xs font-medium text-neutral-700 dark:text-neutral-300">Nenhum preço registrado para este item</p>
          <p class="text-[11px] text-neutral-400 max-w-xs mx-auto mt-0.5">Cadastre um valor manualmente abaixo ou escaneie uma nota fiscal para começar a comparar onde é mais barato.</p>
        </div>
      `;
    }
  } else {
    // Encontrar o menor preço de todos os tempos
    const minRec = history.reduce((min, cur) => cur.price < min.price ? cur : min, history[0]);

    if (bestPriceEl) bestPriceEl.textContent = formatBRL(minRec.price);
    if (bestUnitEl) bestUnitEl.textContent = `/ ${item.unit}`;
    if (bestStoreEl) bestStoreEl.textContent = `${minRec.store} (${formatDateBR(minRec.date)})`;

    // Calcular Tendência de Preço (comparando a última compra com a penúltima)
    if (history.length >= 2) {
      const latest = history[0];
      const prev = history[1];
      const diff = latest.price - prev.price;
      const pct = prev.price > 0 ? ((diff / prev.price) * 100).toFixed(1) : '0';

      if (diff < 0) {
        trendBadge.className = 'text-xs font-bold px-2.5 py-0.5 rounded-full bg-green-100 dark:bg-green-950/60 text-green-700 dark:text-green-300';
        trendBadge.textContent = `↘️ -${Math.abs(pct)}% mais barato`;
      } else if (diff > 0) {
        trendBadge.className = 'text-xs font-bold px-2.5 py-0.5 rounded-full bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300';
        trendBadge.textContent = `↗️ +${pct}% mais caro`;
      } else {
        trendBadge.className = 'text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300';
        trendBadge.textContent = `↔️ Preço estável (0%)`;
      }
    } else {
      trendBadge.className = 'text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300';
      trendBadge.textContent = `● Primeiro registro`;
    }

    // Renderizar Linha do Tempo de Preços
    if (historyList) {
      historyList.innerHTML = history.map((rec, idx) => {
        const isBest = rec.price === minRec.price;

        let diffHtml = '';
        if (idx + 1 < history.length) {
          const olderRec = history[idx + 1];
          const d = rec.price - olderRec.price;
          if (d < 0) {
            diffHtml = `<span class="text-[11px] font-semibold text-green-600 dark:text-green-400">↘️ -${formatBRL(Math.abs(d))}</span>`;
          } else if (d > 0) {
            diffHtml = `<span class="text-[11px] font-semibold text-red-600 dark:text-red-400">↗️ +${formatBRL(d)}</span>`;
          } else {
            diffHtml = `<span class="text-[11px] text-neutral-400">↔️ =</span>`;
          }
        }

        return `
          <div class="p-3 rounded-xl bg-white dark:bg-neutral-850 border border-black/5 dark:border-white/5 flex items-center justify-between gap-3 shadow-sm hover:border-black/10 dark:hover:border-white/10 transition-colors">
            <div class="min-w-0">
              <div class="flex items-center gap-1.5">
                <span class="font-semibold text-sm text-neutral-900 dark:text-white truncate">${escapeHTML(rec.store)}</span>
                ${isBest ? `<span class="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20 whitespace-nowrap">🏆 Menor Preço</span>` : ''}
              </div>
              <div class="text-[11px] text-neutral-400 mt-0.5">
                📅 ${formatDateBR(rec.date)}
              </div>
            </div>
            <div class="text-right flex-shrink-0">
              <div class="text-base font-bold text-neutral-900 dark:text-white">${formatBRL(rec.price)}</div>
              <div>${diffHtml}</div>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // 4. Configuração do Formulário de Registro Rápido de Preço
  const btnToggleForm = document.getElementById('btn-toggle-add-price');
  const formAddPrice = document.getElementById('form-add-price');
  const inputPrice = document.getElementById('input-new-price');
  const inputDate = document.getElementById('input-new-price-date');
  const inputStore = document.getElementById('input-new-price-store');
  const btnCancelForm = document.getElementById('btn-cancel-add-price');

  if (inputDate && !inputDate.value) {
    inputDate.value = new Date().toISOString().slice(0, 10);
  }

  if (btnToggleForm && formAddPrice) {
    btnToggleForm.onclick = () => {
      formAddPrice.classList.toggle('hidden');
      if (!formAddPrice.classList.contains('hidden')) {
        if (inputDate) inputDate.value = new Date().toISOString().slice(0, 10);
        inputPrice?.focus();
      }
    };
  }

  if (btnCancelForm && formAddPrice) {
    btnCancelForm.onclick = () => {
      formAddPrice.classList.add('hidden');
      formAddPrice.reset();
    };
  }

  if (formAddPrice) {
    formAddPrice.onsubmit = (e) => {
      e.preventDefault();
      const priceVal = parseFloat(inputPrice?.value);
      const dateVal = inputDate?.value;
      const storeVal = inputStore?.value;

      if (!priceVal || priceVal <= 0) {
        showAppleToast('Informe um preço válido', 'warning');
        return;
      }

      if (onSavePrice) {
        onSavePrice({
          price: priceVal,
          store: storeVal ? storeVal.trim() : 'Mercado',
          date: dateVal || new Date().toISOString().slice(0, 10)
        });
      }

      formAddPrice.reset();
      formAddPrice.classList.add('hidden');
    };
  }
}

// Renderiza a Lista de Compras (Itens em Falta ou Baixo)
export function renderShoppingList(items, onReplenish) {
  const container = document.getElementById('shopping-list-container');
  if (!container) return;

  const needed = items.filter(i => i.status === 'em_falta' || i.status === 'baixo');

  if (needed.length === 0) {
    container.innerHTML = `
      <div class="py-16 text-center">
        <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 dark:bg-green-950/40 flex items-center justify-center text-green-600">
          <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
        </div>
        <h3 class="text-lg font-semibold text-neutral-900 dark:text-white">Tudo em dia!</h3>
        <p class="text-sm text-neutral-500 max-w-sm mx-auto mt-1">Nenhum produto está em falta ou com estoque baixo no momento.</p>
      </div>
    `;
    return;
  }

  const grouped = {
    alimento: needed.filter(i => i.category === 'alimento'),
    limpeza: needed.filter(i => i.category === 'limpeza'),
    higiene: needed.filter(i => i.category === 'higiene')
  };

  const categoryTitles = {
    alimento: '🍎 Alimentos',
    limpeza: '✨ Limpeza',
    higiene: '🧴 Higiene Pessoal'
  };

  let html = `
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h2 class="text-xl font-bold text-neutral-900 dark:text-white">Lista de Compras</h2>
        <p class="text-xs text-neutral-500">${needed.length} ${needed.length === 1 ? 'item precisa' : 'itens precisam'} de reposição</p>
      </div>
      <button id="btn-share-shopping-list" class="apple-btn-secondary text-xs py-2 px-3">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/></svg>
        <span>Compartilhar</span>
      </button>
    </div>
  `;

  Object.entries(grouped).forEach(([catKey, catItems]) => {
    if (catItems.length === 0) return;

    html += `
      <div class="mb-6">
        <h3 class="text-sm font-semibold uppercase tracking-wider text-neutral-400 mb-2 px-1">
          ${categoryTitles[catKey]} (${catItems.length})
        </h3>
        <div class="apple-glass-card rounded-2xl divide-y divide-black/5 dark:divide-white/5 overflow-hidden">
          ${catItems.map(item => `
            <div class="p-3.5 flex items-center justify-between gap-3 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors">
              <div class="flex items-center gap-3 min-w-0">
                <span class="w-2.5 h-2.5 rounded-full flex-shrink-0 ${item.status === 'em_falta' ? 'bg-red-500' : 'bg-amber-500'}"></span>
                <div class="truncate">
                  <div class="font-medium text-sm text-neutral-900 dark:text-neutral-100 truncate">${escapeHTML(item.name)}</div>
                  <div class="text-xs text-neutral-500">
                    Estoque atual: <strong class="text-neutral-800 dark:text-neutral-200">${item.quantity} ${item.unit}</strong> • Status: ${item.status === 'em_falta' ? 'Em falta' : 'Baixo'}
                  </div>
                </div>
              </div>

              <button id="repon-item-${item.id}" class="apple-btn-primary text-xs py-1.5 px-3 whitespace-nowrap">
                ✓ Comprado
              </button>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  });

  container.innerHTML = html;

  // Eventos de Reposição
  needed.forEach(item => {
    const btn = document.getElementById(`repon-item-${item.id}`);
    if (btn) {
      btn.addEventListener('click', () => onReplenish(item));
    }
  });

  // Botão Compartilhar
  const shareBtn = document.getElementById('btn-share-shopping-list');
  if (shareBtn) {
    shareBtn.addEventListener('click', () => {
      const text = `🛒 Lista de Compras (Inventário):\n\n` + needed.map(i => `• ${i.name} (${i.status === 'em_falta' ? 'Em Falta' : 'Baixo'})`).join('\n');
      if (navigator.share) {
        navigator.share({ title: 'Lista de Compras', text }).catch(() => {});
      } else {
        navigator.clipboard.writeText(text);
        showAppleToast('Lista copiada para a área de transferência!', 'success');
      }
    });
  }
}

// Renderiza a folha de conferência de itens extraídos da NOTA FISCAL
export function renderReceiptReviewSheet(extractedItems, existingMatches, onConfirm) {
  const container = document.getElementById('receipt-review-list');
  if (!container) return;

  container.innerHTML = extractedItems.map((item, index) => {
    const match = existingMatches[index];
    const matchNote = match 
      ? `<span class="text-xs text-blue-600 dark:text-blue-400 font-medium">Já cadastrado: ${match.name} (Atual: ${match.quantity} ${match.unit}) ➔ Somar saldo</span>`
      : `<span class="text-xs text-neutral-400 font-normal">Novo item para o inventário</span>`;

    const priceTag = item.unitPrice > 0 
      ? `<span class="inline-flex items-center px-2 py-0.5 rounded-md bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 text-xs font-semibold">Preço: ${formatBRL(item.unitPrice)}</span>` 
      : '';

    return `
      <div class="p-3.5 bg-neutral-50 dark:bg-neutral-800/60 rounded-xl border border-black/5 dark:border-white/5 flex flex-col gap-2">
        <div class="flex items-start justify-between gap-2">
          <div class="flex items-center gap-2 flex-1">
            <input type="checkbox" id="check-item-${index}" checked class="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer">
            <input type="text" id="name-item-${index}" value="${escapeHTML(item.name)}" class="apple-input text-sm py-1.5 px-2.5 flex-1 font-medium">
          </div>
          ${priceTag}
        </div>

        <div class="flex items-center justify-between gap-2 pl-6">
          <div class="flex items-center gap-2">
            <select id="cat-item-${index}" class="apple-input text-xs py-1 px-2 w-28">
              <option value="alimento" ${item.category === 'alimento' ? 'selected' : ''}>Alimento</option>
              <option value="limpeza" ${item.category === 'limpeza' ? 'selected' : ''}>Limpeza</option>
              <option value="higiene" ${item.category === 'higiene' ? 'selected' : ''}>Higiene</option>
            </select>

            <div class="flex items-center gap-1">
              <input type="number" step="any" min="0.1" id="qty-item-${index}" value="${item.quantity}" class="apple-input text-xs py-1 px-2 w-16 text-center font-bold">
              <select id="unit-item-${index}" class="apple-input text-xs py-1 px-1.5 w-16">
                <option value="un" ${item.unit === 'un' ? 'selected' : ''}>un</option>
                <option value="kg" ${item.unit === 'kg' ? 'selected' : ''}>kg</option>
                <option value="g" ${item.unit === 'g' ? 'selected' : ''}>g</option>
                <option value="l" ${item.unit === 'l' ? 'selected' : ''}>l</option>
                <option value="ml" ${item.unit === 'ml' ? 'selected' : ''}>ml</option>
                <option value="pct" ${item.unit === 'pct' ? 'selected' : ''}>pct</option>
                <option value="cx" ${item.unit === 'cx' ? 'selected' : ''}>cx</option>
              </select>
            </div>
          </div>
        </div>

        <div class="pl-6">
          ${matchNote}
        </div>
      </div>
    `;
  }).join('');

  // Botão Confirmar
  const confirmBtn = document.getElementById('btn-confirm-receipt-import');
  if (confirmBtn) {
    confirmBtn.onclick = () => {
      const selected = [];
      extractedItems.forEach((origItem, index) => {
        const checkbox = document.getElementById(`check-item-${index}`);
        if (checkbox && checkbox.checked) {
          const name = document.getElementById(`name-item-${index}`).value;
          const category = document.getElementById(`cat-item-${index}`).value;
          const quantity = parseFloat(document.getElementById(`qty-item-${index}`).value) || 1;
          const unit = document.getElementById(`unit-item-${index}`).value;

          selected.push({
            name,
            category,
            quantity,
            unit,
            unitPrice: origItem.unitPrice || 0,
            store: origItem.store || '',
            date: origItem.date || '',
            existingMatch: existingMatches[index] || null
          });
        }
      });
      onConfirm(selected);
    };
  }
}
