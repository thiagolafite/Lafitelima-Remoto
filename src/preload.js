/**
 * SCRIPT PRELOAD (Ponte de Contexto entre Main e Renderer)
 * ========================================================
 * 
 * Expõe com segurança APIs nativas do Electron necessárias no frontend (Renderer),
 * mantendo `contextIsolation: true` ativado para evitar vulnerabilidades de segurança.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Solicita a lista de telas/monitores disponíveis para captura.
   * @returns {Promise<Array<{id: string, name: string, thumbnail: string}>>}
   */
  getDesktopSources: () => ipcRenderer.invoke('get-desktop-sources'),

  /**
   * Solicita os argumentos de linha de comando.
   * @returns {Promise<{role: string|null, room: string|null, server: string|null}>}
   */
  getCliArgs: () => ipcRenderer.invoke('get-cli-args'),

  /**
   * Envia comando de entrada remota para ser simulado no sistema operacional Host.
   */
  simulateRemoteInput: (data) => ipcRenderer.invoke('simulate-remote-input', data),

  /**
   * Obtém informações nativas deste dispositivo (Hostname, OS).
   */
  getDeviceInfo: () => ipcRenderer.invoke('get-device-info'),

  /**
   * Obtém a configuração do servidor salva no backend.
   */
  getServerConfig: () => ipcRenderer.invoke('get-server-config')
});

console.log('[Preload] ContextBridge exposto com sucesso (window.electronAPI).');
