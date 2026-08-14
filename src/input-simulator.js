/**
 * MÓDULO DE SIMULAÇÃO DE ENTRADA NATIVA (Mouse e Teclado)
 * ======================================================
 * 
 * Recebe comandos remotos do Viewer e executa movimentação do cursor,
 * cliques e pressionamentos de tecla no sistema operacional do Host.
 */

const { mouse, keyboard, Button, Key, Point } = require('@nut-tree-fork/nut-js');
const { screen } = require('electron');

// Configuração de velocidade do mouse para resposta instantânea
mouse.config.autoDelayMs = 0;
keyboard.config.autoDelayMs = 0;

/**
 * Mapeamento simples de botões do navegador para o nut-js
 */
const BUTTON_MAP = {
  0: Button.LEFT,   // Botão esquerdo
  1: Button.MIDDLE, // Botão do meio (scroll)
  2: Button.RIGHT   // Botão direito
};

/**
 * Mapeamento de chaves comuns do teclado do DOM (Key / Code) para a enumeração do nut-js
 */
const KEY_MAP = {
  'Enter': Key.Enter,
  'Tab': Key.Tab,
  'Space': Key.Space,
  'Backspace': Key.Backspace,
  'Delete': Key.Delete,
  'Escape': Key.Escape,
  'ArrowUp': Key.Up,
  'ArrowDown': Key.Down,
  'ArrowLeft': Key.Left,
  'ArrowRight': Key.Right,
  'Control': Key.LeftControl,
  'Shift': Key.LeftShift,
  'Alt': Key.LeftAlt,
  'Meta': Key.LeftSuper
};

/**
 * Processa o pacote de comando recebido via WebRTC DataChannel e simula a ação no OS Host.
 * @param {Object} data - Objeto de comando (ex: { type: 'mousemove', x: 0.5, y: 0.3 })
 */
async function processRemoteInput(data) {
  try {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.bounds;

    switch (data.type) {
      /**
       * 1. MOVIMENTAÇÃO DO MOUSE
       */
      case 'mousemove': {
        const realX = Math.round(data.x * screenWidth);
        const realY = Math.round(data.y * screenHeight);
        await mouse.setPosition(new Point(realX, realY));
        break;
      }

      /**
       * 2. CLIQUE / BOTÃO DO MOUSE PRESSIONADO (MOUSEDOWN)
       */
      case 'mousedown': {
        const realX = Math.round(data.x * screenWidth);
        const realY = Math.round(data.y * screenHeight);
        const button = BUTTON_MAP[data.button] || Button.LEFT;
        
        await mouse.setPosition(new Point(realX, realY));
        await mouse.pressButton(button);
        break;
      }

      /**
       * 3. BOTÃO DO MOUSE SOLTO (MOUSEUP)
       */
      case 'mouseup': {
        const realX = Math.round(data.x * screenWidth);
        const realY = Math.round(data.y * screenHeight);
        const button = BUTTON_MAP[data.button] || Button.LEFT;
        
        await mouse.setPosition(new Point(realX, realY));
        await mouse.releaseButton(button);
        break;
      }

      /**
       * 4. ROLAGEM DO MOUSE (WHEEL / SCROLL)
       */
      case 'wheel': {
        if (data.deltaY > 0) {
          await mouse.scrollDown(Math.abs(Math.round(data.deltaY / 10)));
        } else if (data.deltaY < 0) {
          await mouse.scrollUp(Math.abs(Math.round(data.deltaY / 10)));
        }
        break;
      }

      /**
       * 5. TECLA PRESSIONADA (KEYDOWN)
       */
      case 'keydown': {
        const targetKey = KEY_MAP[data.key] || KEY_MAP[data.code];
        if (targetKey !== undefined) {
          await keyboard.pressKey(targetKey);
        } else if (data.key && data.key.length === 1) {
          // Se for um caractere imprimível comum (ex: 'a', 'B', '1')
          await keyboard.type(data.key);
        }
        break;
      }

      /**
       * 6. TECLA SOLTA (KEYUP)
       */
      case 'keyup': {
        const targetKey = KEY_MAP[data.key] || KEY_MAP[data.code];
        if (targetKey !== undefined) {
          await keyboard.releaseKey(targetKey);
        }
        break;
      }

      default:
        console.warn(`[InputSimulator] Tipo de evento não suportado: ${data.type}`);
    }
  } catch (error) {
    console.error('[InputSimulator] Erro ao simular entrada nativa:', error.message);
  }
}

module.exports = {
  processRemoteInput
};
