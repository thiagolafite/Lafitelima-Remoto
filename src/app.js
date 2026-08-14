/**
 * LÓGICA PRINCIPAL DO CLIENTE (Conexão Global Zero-Config - Casa <-> Trabalho)
 * =========================================================================
 * 
 * Conecta-se automaticamente ao Servidor Público de Sinalização na Nuvem (wss://)
 * permitindo o acesso remoto entre computadores em cidades/redes diferentes sem
 * precisar digitar nenhum IP.
 */

// Servidores STUN Públicos da Google e Mozilla para perfuração de roteadores/firewalls (NAT Traversal)
const WEBRTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:stun.services.mozilla.com' }
  ],
  iceCandidatePoolSize: 10
};

// URL padrão do Servidor de Sinalização na Nuvem para Conexão Global
const DEFAULT_CLOUD_SERVER = 'wss://lafitelima-remoto.onrender.com';
const DEFAULT_LOCAL_SERVER = 'ws://localhost:8080';

// --- ESTADO GLOBAL DA APLICAÇÃO ---
let myDeviceId = null;           // ID único deste computador
let myHostname = 'Este PC';      // Hostname nativo do sistema operacional
let myPlatform = 'windows';      // Sistema operacional nativo

let currentRole = null;          // 'host' | 'viewer' | null
let activeTargetDeviceId = null; // ID do computador destino
let pendingConnectTarget = null;// Guarda o dispositivo aguardando confirmação de senha

let ws = null;                    // Conexão WebSocket de sinalização
let peerConnection = null;        // Instância da RTCPeerConnection
let dataChannel = null;           // RTCDataChannel para comandos de controle remoto
let isRemoteControlEnabled = true; // Status se controle remoto está ativado no Viewer
let localStream = null;           // MediaStream da tela local do Host
let activeServerUrl = null;

// --- REFERÊNCIAS AOS ELEMENTOS DO DOM ---
const setupView = document.getElementById('setupView');
const hostView = document.getElementById('hostView');
const viewerView = document.getElementById('viewerView');

const deviceGrid = document.getElementById('deviceGrid');
const myHostNameDisplay = document.getElementById('myHostNameDisplay');
const unattendedPasswordInput = document.getElementById('unattendedPasswordInput');
const screenSelect = document.getElementById('screenSelect');

const passwordModal = document.getElementById('passwordModal');
const modalDeviceName = document.getElementById('modalDeviceName');
const targetPasswordInput = document.getElementById('targetPasswordInput');
const cancelPasswordBtn = document.getElementById('cancelPasswordBtn');
const confirmPasswordBtn = document.getElementById('confirmPasswordBtn');

const hostLocalPreview = document.getElementById('hostLocalPreview');
const stopHostBtn = document.getElementById('stopHostBtn');

const viewerRoomCodeDisplay = document.getElementById('viewerRoomCodeDisplay');
const remoteVideo = document.getElementById('remoteVideo');
const videoPlaceholder = document.getElementById('videoPlaceholder');
const placeholderText = document.getElementById('placeholderText');
const controlToggleBtn = document.getElementById('controlToggleBtn');
const fullscreenToggleBtn = document.getElementById('fullscreenToggleBtn');
const disconnectViewerBtn = document.getElementById('disconnectViewerBtn');

const statusBadge = document.getElementById('statusBadge');
const statusText = document.getElementById('statusText');
const logContainer = document.getElementById('logContainer');
const clearLogsBtn = document.getElementById('clearLogsBtn');
const toggleLogsBtn = document.getElementById('toggleLogsBtn');
const logPanel = document.querySelector('.log-panel');

/* ==========================================================================
   1. INICIALIZAÇÃO DO DISPOSITIVO & AUTO-CONEXÃO NA NUVEM / LOCAL
   ========================================================================== */

async function initDeviceIdentity() {
  let savedId = localStorage.getItem('openremote_device_id');
  if (!savedId) {
    savedId = 'device-' + Math.random().toString(36).substring(2, 10);
    localStorage.setItem('openremote_device_id', savedId);
  }
  myDeviceId = savedId;

  // Restaura a senha de acesso salva anteriormente
  const savedPassword = localStorage.getItem('openremote_unattended_password') || '';
  unattendedPasswordInput.value = savedPassword;

  // Busca hostname nativo via Electron Preload
  if (window.electronAPI && window.electronAPI.getDeviceInfo) {
    try {
      const info = await window.electronAPI.getDeviceInfo();
      myHostname = info.hostname || 'PC-Destino';
      myPlatform = info.platform || 'windows';
    } catch (e) {}
  }

  myHostNameDisplay.textContent = `${myHostname} (${myPlatform.toUpperCase()})`;
}

// Obtém a URL do servidor configurada em server-config.json via IPC do Electron
async function getPreconfiguredServerUrl() {
  if (window.electronAPI && window.electronAPI.getServerConfig) {
    try {
      const config = await window.electronAPI.getServerConfig();
      if (config && config.serverUrl) return config.serverUrl;
    } catch (e) {}
  }
  return DEFAULT_CLOUD_SERVER;
}

// Salva a senha de acesso sempre que alterada
unattendedPasswordInput.addEventListener('input', () => {
  const pwd = unattendedPasswordInput.value;
  localStorage.setItem('openremote_unattended_password', pwd);
  
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'register-host',
      deviceId: myDeviceId,
      deviceName: myHostname,
      osPlatform: myPlatform,
      passwordHash: pwd || null
    }));
  }
});

/**
 * Conecta-se ao servidor de sinalização (Nuvem com fallback Local).
 */
function autoConnectSignaling(serverUrl) {
  activeServerUrl = serverUrl;
  addLog('signaling', `Conectando ao sistema global (${serverUrl})...`);
  updateStatusBadge('connecting', 'Conectando...');

  try {
    if (ws) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      ws.close();
    }
    ws = new WebSocket(serverUrl);
  } catch (err) {
    addLog('error', `Erro na conexão: ${err.message}`);
    handleConnectionFailure();
    return;
  }

  let connectionTimeout = setTimeout(() => {
    if (ws && ws.readyState !== WebSocket.OPEN) {
      addLog('warning', 'Conexão com a nuvem demorando. Tentando servidor local...');
      ws.close();
      handleConnectionFailure();
    }
  }, 4000);

  ws.onopen = () => {
    clearTimeout(connectionTimeout);
    const isCloud = serverUrl.startsWith('wss://') || !serverUrl.includes('localhost');
    addLog('success', `Conectado e pronto para acesso remoto (${isCloud ? 'Nuvem Global' : 'Rede Local'})!`);
    updateStatusBadge('connected', isCloud ? '🟢 Online na Nuvem' : '🟢 Online Local');

    const pwd = unattendedPasswordInput.value || null;

    ws.send(JSON.stringify({
      type: 'register-host',
      deviceId: myDeviceId,
      deviceName: myHostname,
      osPlatform: myPlatform,
      passwordHash: pwd
    }));

    ws.send(JSON.stringify({
      type: 'register-viewer'
    }));
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleSignalingMessage(data);
    } catch (err) {
      addLog('error', `Erro de sinalização: ${err.message}`);
    }
  };

  ws.onerror = () => {
    clearTimeout(connectionTimeout);
    addLog('error', `Servidor inacessível em: ${serverUrl}`);
    handleConnectionFailure();
  };

  ws.onclose = () => {
    clearTimeout(connectionTimeout);
    updateStatusBadge('disconnected', 'Desconectado');
  };
}

/**
 * Tenta conectar ao servidor local de fallback caso a nuvem esteja offline ou vice-versa.
 */
function handleConnectionFailure() {
  if (activeServerUrl !== DEFAULT_LOCAL_SERVER) {
    addLog('info', 'Alternando para o servidor de sinalização local (ws://localhost:8080)...');
    autoConnectSignaling(DEFAULT_LOCAL_SERVER);
  }
}

/* ==========================================================================
   2. PROCESSAMENTO DE MENSAGENS E DISPOSITIVOS DISPONÍVEIS
   ========================================================================== */

async function handleSignalingMessage(data) {
  const { type, devices, deviceName, offer, answer, candidate, message } = data;

  switch (type) {
    case 'device-list-update':
      addLog('signaling', `Lista de dispositivos atualizada (${devices.length} computador(es) ativo(s)).`);
      renderDeviceGrid(devices);
      break;

    case 'start-webrtc-stream':
      addLog('signaling', '⚡ Conexão de 1-Clique recebida! Transmitindo tela via WebRTC STUN...');
      currentRole = 'host';
      showView('host');
      await loadScreenSources();
      await startHostWebRTC();
      break;

    case 'connecting-to-host':
      addLog('info', `Iniciando travessia P2P com "${deviceName}"...`);
      break;

    case 'auth-failed':
      addLog('error', `Falha de autenticação: ${message}`);
      alert(`Erro: ${message}`);
      if (pendingConnectTarget) {
        openPasswordModal(pendingConnectTarget);
      }
      break;

    case 'offer':
      if (currentRole === 'viewer') {
        addLog('webrtc', '📥 SDP Offer recebido! Negociando P2P...');
        await handleOfferReceived(offer);
      }
      break;

    case 'answer':
      if (currentRole === 'host') {
        addLog('webrtc', '📥 SDP Answer recebido! Conexão concluída.');
        await handleAnswerReceived(answer);
      }
      break;

    case 'candidate':
      await handleIceCandidateReceived(candidate);
      break;

    case 'error':
      addLog('error', `Erro: ${message}`);
      alert(`Aviso: ${message}`);
      break;

    default:
      break;
  }
}

function renderDeviceGrid(devices) {
  deviceGrid.innerHTML = '';
  const otherDevices = devices.filter(d => d.deviceId !== myDeviceId);

  if (otherDevices.length === 0) {
    deviceGrid.innerHTML = `
      <div class="empty-devices">
        <p>Este computador está 🟢 PRONTO e conectado ao sistema global.</p>
        <small style="color: #64748b;">Abra o OpenRemote Desktop no computador do seu trabalho para que ele apareça aqui automaticamente.</small>
      </div>
    `;
    return;
  }

  otherDevices.forEach(device => {
    const card = document.createElement('div');
    card.className = 'device-card';
    card.innerHTML = `
      <div class="device-card-header">
        <div class="device-icon-name">
          <span class="device-icon">💻</span>
          <div>
            <div class="device-name">${escapeHtml(device.deviceName)}</div>
            <div class="device-os">${escapeHtml(device.osPlatform)} ${device.requiresPassword ? '🔒 (Com Senha)' : ''}</div>
          </div>
        </div>
        <div class="device-status online">
          <span class="status-dot" style="background: #10b981;"></span> Online (Global)
        </div>
      </div>
      <button class="btn-connect-direct" title="Conectar instantaneamente">
        ⚡ Conectar Agora
      </button>
    `;

    const btn = card.querySelector('.btn-connect-direct');
    btn.addEventListener('click', () => {
      if (device.requiresPassword) {
        pendingConnectTarget = device;
        openPasswordModal(device);
      } else {
        connectToDeviceDirect(device.deviceId, device.deviceName, null);
      }
    });

    deviceGrid.appendChild(card);
  });
}

function openPasswordModal(device) {
  modalDeviceName.textContent = device.deviceName;
  targetPasswordInput.value = '';
  passwordModal.classList.add('active');
  targetPasswordInput.focus();
}

function closePasswordModal() {
  passwordModal.classList.remove('active');
}

cancelPasswordBtn.addEventListener('click', closePasswordModal);

confirmPasswordBtn.addEventListener('click', () => {
  const pwd = targetPasswordInput.value.trim();
  if (pendingConnectTarget) {
    closePasswordModal();
    connectToDeviceDirect(pendingConnectTarget.deviceId, pendingConnectTarget.deviceName, pwd);
  }
});

targetPasswordInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    confirmPasswordBtn.click();
  }
});

function connectToDeviceDirect(targetDeviceId, targetDeviceName, passwordInput) {
  addLog('info', `Conectando a "${targetDeviceName}" pela internet...`);
  currentRole = 'viewer';
  activeTargetDeviceId = targetDeviceId;

  viewerRoomCodeDisplay.textContent = `Conectado a: ${targetDeviceName}`;
  showView('viewer');

  setupViewerInputListeners();

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'connect-to-device',
      targetDeviceId,
      passwordInput
    }));
  } else {
    addLog('error', 'Sistema backend desconectado.');
  }
}

/* ==========================================================================
   3. CAPTURA DE TELA E WEBRTC
   ========================================================================== */

async function loadScreenSources() {
  try {
    const sources = await window.electronAPI.getDesktopSources();
    screenSelect.innerHTML = '';
    sources.forEach(source => {
      const option = document.createElement('option');
      option.value = source.id;
      option.textContent = source.name;
      screenSelect.appendChild(option);
    });

    await captureScreenStream(sources[0].id);

    screenSelect.onchange = async () => {
      await captureScreenStream(screenSelect.value);
      if (peerConnection && localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) sender.replaceTrack(videoTrack);
      }
    };
  } catch (err) {
    addLog('error', `Erro ao carregar tela: ${err.message}`);
  }
}

async function captureScreenStream(sourceId) {
  if (localStream) localStream.getTracks().forEach(t => t.stop());
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId,
          minWidth: 1280,
          maxWidth: 1920,
          minHeight: 720,
          maxHeight: 1080,
          maxFrameRate: 30
        }
      }
    });
    hostLocalPreview.srcObject = localStream;
  } catch (err) {
    addLog('error', `Erro na captura de tela: ${err.message}`);
    throw err;
  }
}

async function startHostWebRTC() {
  if (!localStream) return;
  createPeerConnection();

  try {
    dataChannel = peerConnection.createDataChannel('control', { ordered: true });
    setupDataChannel(dataChannel);
  } catch (e) {}

  localStream.getTracks().forEach(t => peerConnection.addTrack(t, localStream));

  try {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    ws.send(JSON.stringify({ type: 'offer', offer: peerConnection.localDescription }));
  } catch (err) {
    addLog('error', `Erro no SDP Offer: ${err.message}`);
  }
}

async function handleOfferReceived(offer) {
  createPeerConnection();
  try {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    ws.send(JSON.stringify({ type: 'answer', answer: peerConnection.localDescription }));
  } catch (err) {
    addLog('error', `Erro no Offer/Answer: ${err.message}`);
  }
}

async function handleAnswerReceived(answer) {
  if (!peerConnection) return;
  try {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    addLog('success', '✅ Conexão estabelecida com sucesso pela internet!');
  } catch (e) {}
}

/* ==========================================================================
   4. DATACHANNEL E CONTROLE REMOTO DE MOUSE/TECLADO
   ========================================================================== */

function setupDataChannel(channel) {
  dataChannel = channel;
  dataChannel.onopen = () => addLog('success', '🎮 Controle Remoto Ativo!');
  dataChannel.onmessage = (event) => {
    if (currentRole === 'host') {
      try {
        const payload = JSON.parse(event.data);
        if (window.electronAPI && window.electronAPI.simulateRemoteInput) {
          window.electronAPI.simulateRemoteInput(payload);
        }
      } catch (e) {}
    }
  };
}

function setupViewerInputListeners() {
  const sendControlEvent = (payload) => {
    if (!isRemoteControlEnabled) return;
    if (dataChannel && dataChannel.readyState === 'open') {
      dataChannel.send(JSON.stringify(payload));
    }
  };

  let lastMove = 0;
  remoteVideo.addEventListener('mousemove', (e) => {
    const now = Date.now();
    if (now - lastMove < 16) return;
    lastMove = now;

    const rect = remoteVideo.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    sendControlEvent({ type: 'mousemove', x, y });
  });

  remoteVideo.addEventListener('mousedown', (e) => {
    const rect = remoteVideo.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    sendControlEvent({ type: 'mousedown', button: e.button, x, y });
  });

  remoteVideo.addEventListener('mouseup', (e) => {
    const rect = remoteVideo.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    sendControlEvent({ type: 'mouseup', button: e.button, x, y });
  });

  remoteVideo.addEventListener('contextmenu', (e) => e.preventDefault());
  remoteVideo.addEventListener('wheel', (e) => {
    e.preventDefault();
    sendControlEvent({ type: 'wheel', deltaY: e.deltaY });
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (currentRole !== 'viewer' || !isRemoteControlEnabled) return;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
    sendControlEvent({ type: 'keydown', key: e.key, code: e.code, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey });
  });

  window.addEventListener('keyup', (e) => {
    if (currentRole !== 'viewer' || !isRemoteControlEnabled) return;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
    sendControlEvent({ type: 'keyup', key: e.key, code: e.code });
  });
}

function createPeerConnection() {
  if (peerConnection) closePeerConnection();
  peerConnection = new RTCPeerConnection(WEBRTC_CONFIG);

  peerConnection.ondatachannel = (event) => setupDataChannel(event.channel);
  peerConnection.onicecandidate = (event) => {
    if (event.candidate && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'candidate', candidate: event.candidate }));
    }
  };

  peerConnection.onconnectionstatechange = () => {
    const state = peerConnection.connectionState;
    if (state === 'connected') {
      updateStatusBadge('connected', 'Conectado (Ao Vivo)');
      if (currentRole === 'viewer') videoPlaceholder.style.display = 'none';
    } else if (state === 'failed' || state === 'disconnected') {
      updateStatusBadge('disconnected', `WebRTC ${state}`);
    }
  };

  peerConnection.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
    videoPlaceholder.style.display = 'none';
  };
}

async function handleIceCandidateReceived(candidate) {
  if (!peerConnection) return;
  try {
    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (e) {}
}

function closePeerConnection() {
  if (dataChannel) { dataChannel.close(); dataChannel = null; }
  if (peerConnection) {
    peerConnection.onicecandidate = null;
    peerConnection.onconnectionstatechange = null;
    peerConnection.ontrack = null;
    peerConnection.ondatachannel = null;
    peerConnection.close();
    peerConnection = null;
  }
}

function resetApp() {
  closePeerConnection();
  if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
  currentRole = null;
  activeTargetDeviceId = null;
  showView('setup');

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'register-viewer' }));
  }
}

/* ==========================================================================
   5. AUXILIARES DE UI
   ========================================================================== */

function addLog(tag, message) {
  const timestamp = new Date().toLocaleTimeString('pt-BR');
  const line = document.createElement('div');
  line.className = `log-line ${tag}`;
  line.textContent = `[${timestamp}] ${message}`;
  logContainer.appendChild(line);
  logContainer.scrollTop = logContainer.scrollHeight;
}

clearLogsBtn.addEventListener('click', () => { logContainer.innerHTML = ''; });
toggleLogsBtn.addEventListener('click', () => {
  logPanel.classList.toggle('collapsed');
  toggleLogsBtn.textContent = logPanel.classList.contains('collapsed') ? 'Expandir Logs' : 'Minimizar';
});

function showView(viewName) {
  setupView.classList.remove('active');
  hostView.classList.remove('active');
  viewerView.classList.remove('active');

  if (viewName === 'setup') setupView.classList.add('active');
  else if (viewName === 'host') hostView.classList.add('active');
  else if (viewName === 'viewer') viewerView.classList.add('active');
}

function updateStatusBadge(state, text) {
  statusBadge.className = `status-badge ${state}`;
  statusText.textContent = text;
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

stopHostBtn.addEventListener('click', () => resetApp());
disconnectViewerBtn.addEventListener('click', () => resetApp());

if (controlToggleBtn) {
  controlToggleBtn.addEventListener('click', () => {
    isRemoteControlEnabled = !isRemoteControlEnabled;
    controlToggleBtn.classList.toggle('active', isRemoteControlEnabled);
    controlToggleBtn.innerHTML = isRemoteControlEnabled
      ? '🎮 <span>Controle: ATIVO</span>'
      : '⚪ <span>Controle: INATIVO</span>';
  });
}

fullscreenToggleBtn.addEventListener('click', () => {
  const wrapper = document.getElementById('viewerWrapper');
  if (!document.fullscreenElement) wrapper.requestFullscreen();
  else document.exitFullscreen();
});

// Inicialização automática: Conecta ao Servidor Pré-Configurado na Nuvem (com Fallback Local)
window.addEventListener('DOMContentLoaded', async () => {
  await initDeviceIdentity();
  const targetServerUrl = await getPreconfiguredServerUrl();
  autoConnectSignaling(targetServerUrl);
});
