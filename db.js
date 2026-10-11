// js/db.js - Camada de Banco de Dados Local-First (IndexedDB Nativo)
// Funciona 100% Offline no Navegador, iPhone, iPad e Computador.

const DB_NAME = 'AppleHomeInventoryDB';
const DB_VERSION = 1;

class InventoryDB {
  constructor() {
    this.db = null;
    this.initPromise = this.init();
  }

  async init() {
    return new Promise((resolve, reject) => {
      try {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          
          if (!db.objectStoreNames.contains('items')) {
            const itemStore = db.createObjectStore('items', { keyPath: 'id' });
            itemStore.createIndex('category', 'category', { unique: false });
            itemStore.createIndex('status', 'status', { unique: false });
            itemStore.createIndex('name', 'name', { unique: false });
            itemStore.createIndex('updatedAt', 'updatedAt', { unique: false });
          }

          if (!db.objectStoreNames.contains('settings')) {
            db.createObjectStore('settings', { keyPath: 'key' });
          }
        };

        request.onsuccess = async (event) => {
          this.db = event.target.result;
          // Resolve a promessa IMEDIATAMENTE para evitar qualquer deadlock
          resolve(this.db);

          // Popula dados iniciais de demonstração em segundo plano se necessário
          try {
            await this.seedInitialDataIfEmpty();
          } catch (err) {
            console.warn('Aviso ao popular dados iniciais:', err);
          }
        };

        request.onerror = (event) => {
          console.error('Erro ao abrir IndexedDB:', event.target.error);
          reject(event.target.error);
        };
      } catch (err) {
        console.error('Exceção ao inicializar IndexedDB:', err);
        reject(err);
      }
    });
  }

  async ready() {
    if (this.db) return this.db;
    return this.initPromise;
  }

  // Obter todos os itens
  async getAllItems() {
    await this.ready();
    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db.transaction(['items'], 'readonly');
        const store = transaction.objectStore('items');
        const request = store.getAll();

        request.onsuccess = () => {
          const items = request.result || [];
          items.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
          resolve(items);
        };
        request.onerror = () => reject(request.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  // Obter item por ID
  async getItemById(id) {
    await this.ready();
    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db.transaction(['items'], 'readonly');
        const store = transaction.objectStore('items');
        const request = store.get(id);

        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  // Salvar ou atualizar item com regras de status
  async saveItem(item) {
    await this.ready();
    const now = new Date().toISOString();
    
    const quantity = Math.max(0, parseFloat(item.quantity) || 0);
    const threshold = item.minAlertThreshold !== undefined ? parseFloat(item.minAlertThreshold) : 1;
    
    // Regra automática de status:
    // Se a quantidade for 0, o status é forçado para "em_falta"
    let status = item.status || 'ok';
    if (quantity === 0) {
      status = 'em_falta';
    } else if (status === 'em_falta' && quantity > 0) {
      status = quantity <= threshold ? 'baixo' : 'ok';
    }

    const itemToSave = {
      id: item.id || 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      name: (item.name || '').trim(),
      category: item.category || 'alimento',
      quantity: quantity,
      unit: item.unit || 'un',
      minAlertThreshold: threshold,
      status: status,
      priceHistory: Array.isArray(item.priceHistory) ? item.priceHistory : [],
      createdAt: item.createdAt || now,
      updatedAt: now
    };

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db.transaction(['items'], 'readwrite');
        const store = transaction.objectStore('items');
        const request = store.put(itemToSave);

        request.onsuccess = () => resolve(itemToSave);
        request.onerror = () => reject(request.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  // Adicionar novo registro de compra e preço ao histórico
  async addPriceRecord(id, { price, store, date }) {
    const item = await this.getItemById(id);
    if (!item) return null;

    if (!Array.isArray(item.priceHistory)) {
      item.priceHistory = [];
    }

    const numPrice = parseFloat(price) || 0;
    if (numPrice > 0) {
      item.priceHistory.push({
        id: 'price_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        price: numPrice,
        store: (store || 'Mercado').trim(),
        date: date || new Date().toISOString().slice(0, 10),
        createdAt: new Date().toISOString()
      });

      // Ordenar por data mais recente primeiro
      item.priceHistory.sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    return this.saveItem(item);
  }

  // Ajustar quantidade rápida (+ / -)
  async updateQuantity(id, delta) {
    const item = await this.getItemById(id);
    if (!item) return null;

    let newQty = Math.max(0, Math.round((item.quantity + delta) * 100) / 100);
    let newStatus = item.status;

    if (newQty === 0) {
      newStatus = 'em_falta';
    } else if (newQty <= (item.minAlertThreshold || 1)) {
      newStatus = 'baixo';
    } else if (item.status === 'em_falta' || item.status === 'baixo') {
      newStatus = 'ok';
    }

    item.quantity = newQty;
    item.status = newStatus;
    return this.saveItem(item);
  }

  // Alterar status diretamente
  async updateStatus(id, newStatus) {
    const item = await this.getItemById(id);
    if (!item) return null;
    item.status = newStatus;
    return this.saveItem(item);
  }

  // Remover item
  async deleteItem(id) {
    await this.ready();
    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db.transaction(['items'], 'readwrite');
        const store = transaction.objectStore('items');
        const request = store.delete(id);

        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  // Busca item existente por nome aproximado
  async findSimilarItem(name) {
    const all = await this.getAllItems();
    const clean = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const target = clean(name);

    if (!target) return null;

    const exact = all.find(i => clean(i.name) === target);
    if (exact) return exact;

    const match = all.find(i => {
      const itemName = clean(i.name);
      return itemName.includes(target) || target.includes(itemName);
    });
    return match || null;
  }

  // Configurações
  async getSetting(key, defaultValue = null) {
    await this.ready();
    return new Promise((resolve) => {
      try {
        const transaction = this.db.transaction(['settings'], 'readonly');
        const store = transaction.objectStore('settings');
        const request = store.get(key);

        request.onsuccess = () => {
          resolve(request.result ? request.result.value : defaultValue);
        };
        request.onerror = () => resolve(defaultValue);
      } catch (err) {
        resolve(defaultValue);
      }
    });
  }

  async setSetting(key, value) {
    await this.ready();
    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db.transaction(['settings'], 'readwrite');
        const store = transaction.objectStore('settings');
        const request = store.put({ key, value });

        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  // Exportar Backup JSON
  async exportBackup() {
    const items = await this.getAllItems();
    const data = {
      app: 'AppleHomeInventory',
      version: 1,
      exportedAt: new Date().toISOString(),
      items: items
    };
    return JSON.stringify(data, null, 2);
  }

  // Importar Backup JSON
  async importBackup(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      if (!Array.isArray(data.items)) {
        throw new Error('Formato de arquivo inválido: lista de itens não encontrada.');
      }
      for (const item of data.items) {
        await this.saveItem(item);
      }
      return data.items.length;
    } catch (e) {
      console.error('Falha ao importar backup:', e);
      throw e;
    }
  }

  // Dados iniciais (evita reinserção indesejada de produtos)
  async seedInitialDataIfEmpty() {
    if (!this.db) return;
    const alreadySeeded = localStorage.getItem('apple_inventory_has_seeded');
    if (alreadySeeded) {
      return;
    }
    // Marca como inicializado para nunca criar itens aleatórios sozinhos
    localStorage.setItem('apple_inventory_has_seeded', 'true');
  }

  // Limpar todos os itens do inventário (Zerar estoque)
  async clearAllItems() {
    await this.ready();
    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db.transaction(['items'], 'readwrite');
        const store = transaction.objectStore('items');
        const request = store.clear();

        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
      } catch (err) {
        reject(err);
      }
    });
  }
}

export const db = new InventoryDB();
