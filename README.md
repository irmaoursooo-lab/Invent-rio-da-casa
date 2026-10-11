# 🍎 Inventário Apple - Casa (PWA Multiplataforma)

Um aplicativo moderno, refinado e com estética inspirada diretamente no design da **[Apple (Brasil)](https://www.apple.com/br/)** para controle de estoque doméstico em **Computador (PC/Mac), iPhone e iPad**, com funcionamento **100% offline** e leitura inteligente de fotos e notas fiscais com Inteligência Artificial.

---

## ✨ Principais Funcionalidades

1. **Design Apple & iOS Human Interface Guidelines**:
   - Tipografia limpa baseada em *San Francisco (SF Pro)*.
   - Cabeçalhos e folhas modais com acabamento translúcido e *frosted glass* (`backdrop-filter`).
   - Controles segmentados (*segmented pills*), cartões squircle e micro-interações suaves.
   - Suporte completo a **Modo Claro** e **Modo Escuro** (*Dark Mode*).

2. **Scanner com IA Multimodal (Google Gemini)**:
   - **📦 Foto do Produto**: Você tira uma foto da embalagem e a IA reconhece automaticamente o nome, a categoria (`alimento`, `limpeza` ou `higiene`) e a unidade sugerida; você apenas digita a quantidade adquirida.
   - **🧾 Foto da Nota Fiscal (Cupom / NFC-e)**: A IA lê todo o cupom de supermercado ou farmácia, expande as abreviações fiscais e preenche automaticamente os nomes, categorias, quantidades e unidades em lote.
   - **📋 Folha de Conferência em Lote (*Apple Review Sheet*)**: Permite revisar, desmarcar ou editar os itens da nota antes de salvar. Se o produto já existir no estoque, ele sugere somar a quantidade adquirida ao saldo atual!
   - **Modo Simulado / Demonstração**: Funciona mesmo sem chave de API inicial para você testar imediatamente o fluxo com exemplos realistas brasileiros.

3. **Regras Inteligentes de Estoque**:
   - **Quantidade = 0**: Classifica o produto **automaticamente** como `Em falta` (*badge* vermelho).
   - **Estoque Baixo Inteligente**: Se a quantidade cair para o limite mínimo de alerta (padrão <= 1), sugere o status `Baixo` (*badge* laranja).
   - **Botões Rápidos `+` e `−`**: Ajuste instantâneo de consumo ou reposição diretamente no cartão do produto.
   - **Status Selecionável**: Todos os status (`Ok`, `Baixo`, `Em falta`) também podem ser alterados manualmente a qualquer momento.

4. **Lista de Compras Automática**:
   - Uma aba dedicada reúne todos os produtos que estão com status `Baixo` ou `Em falta`, agrupados por categoria.
   - Botão rápido *"✓ Comprado"* para repor o estoque e atualizar o status para `Ok` com um único clique.
   - Opção de *"Compartilhar"* a lista via WhatsApp, Mensagens ou copiar para a área de transferência.

5. **100% Offline (Local-First)**:
   - Utiliza **IndexedDB** nativo para armazenamento local ultra-rápido no seu dispositivo.
   - **Service Worker** com cache de assets para abrir mesmo sem nenhuma conexão à internet.
   - Exportação e importação de **Backup em JSON** a qualquer momento.

---

## 🚀 Como Executar

### 1. No Computador (PC Windows):
Basta dar um duplo clique no arquivo:
```
iniciar-servidor.bat
```
*(Ou abra o PowerShell na pasta e execute `./server.ps1`)*

O aplicativo abrirá automaticamente no seu navegador em `http://localhost:8080`.

---

### 2. No iPhone e iPad:
1. Certifique-se de que o iPhone/iPad está conectado na **mesma rede Wi-Fi** do computador.
2. Ao iniciar o servidor no PC, ele exibirá no terminal o endereço de rede local, por exemplo:
   ```
   http://192.168.1.15:8080
   ```
3. Abra esse endereço no **Safari** do iPhone ou iPad.
4. Toque no botão **Compartilhar** (ícone do quadrado com a seta para cima) e selecione:
   **"Adicionar à Tela de Início"** (*Add to Home Screen*).
5. O aplicativo será instalado como um app independente, sem barra de endereços e com o ícone oficial!

---

## 🌐 Como Usar Sem Precisar do Computador Ligado (Publicar na Nuvem Grátis)

Se você não quer ter que ligar o computador toda vez que for mexer no inventário pelo iPhone/iPad:

### Opção Recomendada: Netlify Drop (60 segundos, sem instalar nada)
1. Acesse **[app.netlify.com/drop](https://app.netlify.com/drop)** no navegador.
2. Arraste a pasta inteira deste projeto (`Antigravity teste`) para dentro da página.
3. O Netlify gerará um link permanente (ex: `https://meu-inventario-casa.netlify.app`) com certificado de segurança **HTTPS** gratuito.
4. Abra esse link no Safari do iPhone e iPad e adicione à Tela de Início.
5. Pronto! Agora você pode **desligar o computador**. O aplicativo continuará funcionando 24h por dia na nuvem e offline no seu iPhone e iPad!

---

## 🔑 Configuração da IA Gemini

1. No menu superior ou inferior do aplicativo, toque em **Ajustes**.
2. Cole sua chave gratuita da API Gemini (obtida em [Google AI Studio](https://aistudio.google.com/app/apikey)).
3. Clique em **Salvar** e **Testar Conexão**. A chave fica guardada apenas no seu dispositivo.
4. Agora ao tirar foto de um produto ou nota fiscal, a IA `gemini-2.0-flash` processará as informações reais da imagem.
