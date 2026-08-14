# 🖥️ OpenRemote Desktop - Acesso Não Supervisionado de 1-Clique

Aplicativo desktop de acesso remoto open source e sob seu controle, com **Reconhecimento Automático de Dispositivos e Conexão de 1-Clique (Sem necessidade de códigos ou senhas)**.

---

## 🌟 Funcionalidades

- [x] **Acesso Não Supervisionado (1-Clique)**: Detecta o Hostname nativo do computador (ex: `PC-Lafite`) e pré-autoriza conexões.
- [x] **Catálogo de Dispositivos Online**: Lista dinamicamente todos os computadores com o app instalado na rede local com status 🟢 Online.
- [x] **Transmissão de Vídeo P2P**: Vídeo da tela capturado via `desktopCapturer` e transmitido via WebRTC nativo.
- [x] **Controle de Mouse e Teclado**: Transmissão em tempo real via `RTCDataChannel` com simulação nativa.
- [x] **Executável Windows Standalone (`.exe`)**: Pronto para ser instalado ou executado de um pendrive em qualquer PC sem depender de Node.js ou Git.

---

## 🚀 Como Usar

### 1️⃣ No Servidor de Sinalização (qualquer PC na rede)
```bash
npm run server
```

### 2️⃣ Nos Computadores Destino / Controle
- Abra a pasta `dist/OpenRemote Desktop-win32-x64/`
- Execute `OpenRemote Desktop.exe`
- O computador aparecerá automaticamente na lista de dispositivos. Basta clicar em **"⚡ Conectar Agora"**!
