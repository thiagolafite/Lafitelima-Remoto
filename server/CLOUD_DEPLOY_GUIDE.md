# 🌐 Guia de Hospedagem Gratuita do Servidor na Nuvem (Para Acesso via Internet)

Para que você possa acessar o computador do seu **Trabalho** estando na sua **Casa** (em redes diferentes), o servidor de sinalização precisa estar rodando na nuvem com um endereço de WebSocket público (`wss://`).

---

## ⚡ Opção 1: Render.com (100% Grátis, 2 minutos)

1. Crie uma conta gratuita em [render.com](https://render.com).
2. Clique em **New +** -> **Web Service**.
3. Conecte com seu GitHub ou use o repositório do projeto.
4. Preencha as configurações:
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server/signaling-server.js`
5. Clique em **Create Web Service**.
6. O Render vai gerar um link como: `wss://meu-acesso-remoto.onrender.com`.
7. **Pronto!** Cole esse link no campo **Servidor de Sinalização** do aplicativo tanto na Casa quanto no Trabalho.

---

## ⚡ Opção 2: Ngrok (Servidor na sua máquina virando público)

Se preferir rodar o servidor na sua própria máquina e apenas expor ele para a Internet gratuitamente:

1. Baixe o [Ngrok](https://ngrok.com).
2. No terminal da sua máquina, inicie o servidor:
   ```bash
   npm run server
   ```
3. Em outro terminal, rode o Ngrok para expor a porta 8080:
   ```bash
   ngrok http 8080
   ```
4. O Ngrok exibirá um link como `wss://xxxx-xxxx.ngrok-free.app`.
5. Cole esse link nos aplicativos do seu Trabalho e da sua Casa!
