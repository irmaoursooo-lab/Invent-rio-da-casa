// js/gemini.js - Inteligência Artificial Gemini para Visão de Produtos e Notas Fiscais
import { db } from './db.js';

// Modelo padrão (Gemini 2.5 Flash - Híbrido e mais recente para assinantes)
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

async function getActiveModel() {
  const customModel = await db.getSetting('geminiModel', DEFAULT_GEMINI_MODEL);
  return customModel || DEFAULT_GEMINI_MODEL;
}

/**
 * Converte arquivo de imagem para Base64 puro (sem o prefixo data:image/...)
 */
export async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      const base64Data = result.split(',')[1];
      const mimeType = file.type || 'image/jpeg';
      resolve({ base64Data, mimeType, dataUrl: result });
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
}

/**
 * Analisa a foto de um PRODUTO individual
 * Retorna: { name, category, unit }
 */
export async function analyzeProductPhoto(base64Data, mimeType) {
  const apiKey = await db.getSetting('geminiApiKey', '');

  // Se não houver chave de API configurada, utiliza simulação inteligente
  if (!apiKey || apiKey.trim() === '') {
    return getSimulatedProductAnalysis();
  }

  const prompt = `Você é um assistente especialista em inventário doméstico e compras de supermercado no Brasil.
Analise a foto deste produto de consumo e extraia as informações em formato JSON.
As categorias permitidas são estritamente: "alimento", "limpeza" ou "higiene".
As unidades permitidas são: "un", "kg", "g", "l", "ml", "pct", "cx".

Responda APENAS com um objeto JSON válido no seguinte formato:
{
  "name": "Nome claro e padronizado do produto (ex: Detergente Ypê Neutro 500ml)",
  "category": "alimento" | "limpeza" | "higiene",
  "unit": "un" | "kg" | "g" | "l" | "ml" | "pct" | "cx"
}`;

  try {
    const model = await getActiveModel();
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey.trim()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: base64Data
                }
              }
            ]
          }
        ],
        generationConfig: {
          response_mime_type: 'application/json',
          temperature: 0.1
        }
      })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || `Erro da API Gemini: HTTP ${response.status}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    const parsed = JSON.parse(text);

    return {
      name: parsed.name || 'Produto Identificado',
      category: validateCategory(parsed.category),
      unit: validateUnit(parsed.unit),
      isSimulation: false
    };
  } catch (error) {
    console.error('Falha na chamada da API Gemini:', error);
    throw new Error(`Falha na IA Gemini: ${error.message}`);
  }
}

/**
 * Analisa a foto de uma NOTA FISCAL (Cupom Fiscal / NFC-e)
 * Retorna array de itens: [{ name, category, quantity, unit }]
 */
export async function analyzeReceiptPhoto(base64Data, mimeType) {
  const apiKey = await db.getSetting('geminiApiKey', '');

  // Se não houver chave de API configurada, utiliza simulação realista de cupom fiscal
  if (!apiKey || apiKey.trim() === '') {
    return getSimulatedReceiptAnalysis();
  }

  const prompt = `Você é um assistente especialista em leitura e extração de Notas Fiscais e Cupons Fiscais do Brasil (NFC-e / SAT / ECF).
Examine esta imagem de nota fiscal e extraia TODOS os itens de consumo doméstico listados.
Para cada item:
1. "name": Expanda as abreviações fiscais para um nome legível (ex: transforme "ARROZ TIO JOAO T1 5KG" em "Arroz Tio João Tipo 1 5kg").
2. "category": Classifique estritamente em uma das 3 opções: "alimento", "limpeza" ou "higiene".
3. "quantity": Quantidade numérica adquirida (número decimal ou inteiro, ex: 1, 2, 0.75).
4. "unit": Unidade ("un", "kg", "g", "l", "ml", "pct", "cx").
5. "unitPrice": Preço unitário pago pelo item em reais (número decimal, ex: 24.90). Se não constar, use o valor total dividido pela quantidade.

Identifique também no cabeçalho ou rodapé:
- "store": Nome do supermercado ou loja (Razão Social ou Fantasia).
- "date": Data da compra no formato AAAA-MM-DD.

Responda APENAS com um objeto JSON no formato:
{
  "store": "Nome do Estabelecimento / Supermercado",
  "date": "AAAA-MM-DD",
  "items": [
    {
      "name": "Nome do Produto",
      "category": "alimento" | "limpeza" | "higiene",
      "quantity": 2,
      "unit": "un",
      "unitPrice": 14.90
    }
  ]
}`;

  try {
    const model = await getActiveModel();
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey.trim()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: base64Data
                }
              }
            ]
          }
        ],
        generationConfig: {
          response_mime_type: 'application/json',
          temperature: 0.1
        }
      })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || `Erro da API Gemini: HTTP ${response.status}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    const parsed = JSON.parse(text);

    const store = (parsed.store || 'Supermercado').trim();
    const date = parsed.date || new Date().toISOString().slice(0, 10);

    const items = (parsed.items || []).map(item => ({
      name: item.name || 'Item de Compra',
      category: validateCategory(item.category),
      quantity: Math.max(0.1, parseFloat(item.quantity) || 1),
      unit: validateUnit(item.unit),
      unitPrice: parseFloat(item.unitPrice) || 0,
      store: store,
      date: date
    }));

    return {
      store,
      date,
      items,
      isSimulation: false
    };
  } catch (error) {
    console.error('Falha na leitura da nota fiscal via API:', error);
    throw new Error(`Falha na IA Gemini: ${error.message}`);
  }
}

// Helpers de validação
function validateCategory(cat) {
  const valid = ['alimento', 'limpeza', 'higiene'];
  const lower = (cat || '').toLowerCase();
  return valid.includes(lower) ? lower : 'alimento';
}

function validateUnit(unit) {
  const valid = ['un', 'kg', 'g', 'l', 'ml', 'pct', 'cx'];
  const lower = (unit || '').toLowerCase();
  return valid.includes(lower) ? lower : 'un';
}

// Simulação inteligente de produto individual
function getSimulatedProductAnalysis() {
  const samples = [
    { name: 'Azeite de Oliva Extra Virgem 500ml', category: 'alimento', unit: 'un' },
    { name: 'Sabão em Pó Lavagem Perfeita 1.6kg', category: 'limpeza', unit: 'cx' },
    { name: 'Creme Dental Branqueador 90g', category: 'higiene', unit: 'un' },
    { name: 'Café Especial Moído 500g', category: 'alimento', unit: 'pct' },
    { name: 'Detergente Neutro 500ml', category: 'limpeza', unit: 'un' }
  ];
  const item = samples[Math.floor(Math.random() * samples.length)];
  return {
    ...item,
    isSimulation: true
  };
}

// Simulação realista de cupom fiscal com múltiplos itens
function getSimulatedReceiptAnalysis() {
  const today = new Date().toISOString().slice(0, 10);
  const store = 'Supermercado Pão de Açúcar';
  return {
    store,
    date: today,
    items: [
      { name: 'Arroz Branco Tipo 1 5kg', category: 'alimento', quantity: 2, unit: 'pct', unitPrice: 27.90, store, date: today },
      { name: 'Feijão Carioca 1kg', category: 'alimento', quantity: 3, unit: 'pct', unitPrice: 8.49, store, date: today },
      { name: 'Detergente Líquido Neutro 500ml', category: 'limpeza', quantity: 4, unit: 'un', unitPrice: 2.89, store, date: today },
      { name: 'Desinfetante Floral 2L', category: 'limpeza', quantity: 1, unit: 'un', unitPrice: 11.90, store, date: today },
      { name: 'Sabonete em Barra Hidratante', category: 'higiene', quantity: 6, unit: 'un', unitPrice: 3.49, store, date: today },
      { name: 'Papel Higiênico Folha Dupla 12un', category: 'higiene', quantity: 1, unit: 'pct', unitPrice: 19.90, store, date: today }
    ],
    isSimulation: true
  };
}
