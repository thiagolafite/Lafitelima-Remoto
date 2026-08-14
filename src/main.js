/**
 * PROCESSO PRINCIPAL DO ELECTRON (Main Process)
 * =============================================
 * 
 * Este arquivo gerencia o ciclo de vida do aplicativo Electron,
 * cria a janela principal e fornece acesso seguro às APIs nativas do sistema
 * (como o `desktopCapturer` para captura de tela) via Comunicação Inter-Processos (IPC).
 */

const { app, BrowserWindow, ipcMain, desktopCapturer } = require('electron');
const path = require('path');

// INICIALIZA O SERVIDOR DE SINALIZAÇÃO EMBUTIDO NO BACKEND AUTOMATICAMENTE
try {
  const { startServer } = require(path.join(__dirname, '../server/signaling-server.js'));
  startServer(8080);
} catch (err) {
  console.log('[Main Process] Servidor de sinalização já em execução ou integrado.');
}

// Ajusta o diretório de dados do usuário se for passado um papel via CLI (--role=host ou --role=viewer)
const roleArg = process.argv.find(arg => arg && arg.startsWith('--role='));
if (roleArg) {
  const role = roleArg.split('=')[1];
  const customUserData = path.join(app.getPath('temp'), `acesso-remoto-data-${role}`);
  app.setPath('userData', customUserData);
}

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    title: 'Acesso Remoto Open Source - Fase 1',
    backgroundColor: '#0f172a', // Cor de fundo escura (slate-900)
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, // Isolamento de contexto para segurança
      nodeIntegration: false,  // Desativa nodeIntegration no renderer
      sandbox: false           // Permite acesso ao preload com APIs de mídia
    }
  });

  // Carrega a interface HTML principal
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Opcional: abre as ferramentas de desenvolvedor em ambiente de dev
  // mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * HANDLER IPC: Obtém as fontes de mídia da área de trabalho (Telas/Monitores).
 * Chamado pelo processo de renderização através do preload bridge.
 */
ipcMain.handle('get-desktop-sources', async () => {
  try {
    console.log('[Main Process] Solicitando fontes de captura de tela via desktopCapturer...');
    
    // Captura apenas fontes do tipo 'screen' (monitores inteiros)
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 320, height: 180 }
    });

    console.log(`[Main Process] ${sources.length} tela(s) encontrada(s):`, sources.map(s => `${s.name} (ID: ${s.id})`));
    
    // Retorna array serializável com id, name e thumbnail (DataURL)
    return sources.map(source => ({
      id: source.id,
      name: source.name,
      display_id: source.display_id,
      thumbnail: source.thumbnail.toDataURL()
    }));
  } catch (error) {
    console.error('[Main Process] Erro ao obter fontes do desktopCapturer:', error);
    throw error;
  }
});

const { processRemoteInput } = require('./input-simulator');

/**
 * HANDLER IPC: Simula comandos de entrada remota (mouse e teclado) recebidos do Viewer.
 */
ipcMain.handle('simulate-remote-input', async (event, data) => {
  await processRemoteInput(data);
});

const os = require('os');

/**
 * HANDLER IPC: Obtém informações nativas do computador (Hostname e Plataforma).
 */
ipcMain.handle('get-device-info', () => {
  return {
    hostname: os.hostname(),
    platform: process.platform
  };
});

/**
 * HANDLER IPC: Obtém argumentos da linha de comando passados ao Electron.
 */
ipcMain.handle('get-cli-args', () => {
  const args = process.argv;
  const roleArg = args.find(arg => arg.startsWith('--role='));
  const roomArg = args.find(arg => arg.startsWith('--room='));
  const serverArg = args.find(arg => arg.startsWith('--server='));

  return {
    role: roleArg ? roleArg.split('=')[1] : null,
    room: roomArg ? roomArg.split('=')[1] : null,
    server: serverArg ? serverArg.split('=')[1] : null
  };
});

// Inicialização do App Electron
app.whenReady().then(() => {
  console.log('[Main Process] Electron pronto. Criando janela...');
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Encerra o app quando todas as janelas forem fechadas (exceto macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
