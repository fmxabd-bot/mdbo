const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const express = require('express');

// ================== WEB SERVER ==================
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Global variables for pairing
let pairingCode = null;
let botNumber = null;
let isConnected = false;
let sockInstance = null;

// HTML Page
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>WhatsApp Bot - Pairing</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body { font-family: Arial, sans-serif; background: #111; color: #fff; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
        .container { background: #222; padding: 40px; border-radius: 12px; text-align: center; max-width: 400px; width: 90%; }
        h1 { color: #25D366; margin-bottom: 20px; }
        input { width: 100%; padding: 12px; margin: 10px 0; border: none; border-radius: 6px; font-size: 16px; box-sizing: border-box; }
        button { background: #25D366; color: #000; border: none; padding: 12px 24px; border-radius: 6px; font-size: 16px; font-weight: bold; cursor: pointer; width: 100%; }
        button:hover { background: #1ebe5a; }
        .code { font-size: 32px; letter-spacing: 8px; color: #25D366; margin: 20px 0; font-weight: bold; }
        .status { margin-top: 20px; padding: 12px; border-radius: 6px; }
        .success { background: #1b5e20; color: #a5d6a7; }
        .error { background: #b71c1c; color: #ef9a9a; }
        .info { background: #0d47a1; color: #90caf9; }
        #step2 { display: none; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🤖 Bot Pairing</h1>
        <div id="step1">
            <p>Apna WhatsApp number country code ke saath likhein</p>
            <input type="text" id="phone" placeholder="923001234567" />
            <button onclick="getCode()">Get Pairing Code</button>
        </div>
        <div id="step2">
            <div class="status info" id="statusMsg">Code generate ho raha hai...</div>
            <div class="code" id="codeDisplay"></div>
            <p style="font-size: 14px; color: #aaa;">WhatsApp > Linked Devices > Link with phone number mein yeh code enter karein</p>
        </div>
    </div>
    <script>
        async function getCode() {
            const phone = document.getElementById('phone').value.trim();
            if (!phone) { alert('Number likhein!'); return; }
            document.getElementById('step1').style.display = 'none';
            document.getElementById('step2').style.display = 'block';
            document.getElementById('statusMsg').textContent = 'Code generate ho raha hai...';
            try {
                const res = await fetch('/pair', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone })
                });
                const data = await res.json();
                if (data.success) {
                    document.getElementById('codeDisplay').textContent = data.code;
                    document.getElementById('statusMsg').textContent = 'Code enter karein WhatsApp mein';
                    document.getElementById('statusMsg').className = 'status success';
                } else {
                    document.getElementById('statusMsg').textContent = data.error || 'Error aya';
                    document.getElementById('statusMsg').className = 'status error';
                }
            } catch (e) {
                document.getElementById('statusMsg').textContent = 'Network error';
                document.getElementById('statusMsg').className = 'status error';
            }
        }
    </script>
</body>
</html>
    `);
});

// Pairing endpoint
app.post('/pair', async (req, res) => {
    const { phone } = req.body;
    
    if (!phone || phone.length < 10) {
        return res.json({ success: false, error: 'Valid number likhein (country code ke saath)' });
    }
    
    if (isConnected) {
        return res.json({ success: false, error: 'Bot already connected hai!' });
    }
    
    if (pairingCode) {
        return res.json({ success: true, code: pairingCode });
    }
    
    botNumber = phone.replace(/[^0-9]/g, '');
    
    // Agar sock already exist karta hai, use karein
    if (sockInstance) {
        try {
            const code = await sockInstance.requestPairingCode(botNumber);
            pairingCode = code;
            return res.json({ success: true, code });
        } catch (err) {
            return res.json({ success: false, error: 'Code generate nahi hua, thodi der baad try karein' });
        }
    }
    
    return res.json({ success: false, error: 'Bot abhi ready nahi hai, 5 second baad try karein' });
});

app.get('/status', (req, res) => {
    res.json({ connected: isConnected, hasCode: !!pairingCode });
});

app.listen(PORT, () => {
    console.log(`🌐 Web server listening on port ${PORT}`);
});

// ================== COMMANDS LOADER ==================
async function loadCommands() {
    const commands = new Map();
    const commandDir = path.join(__dirname, 'commands');

    if (fs.existsSync(commandDir)) {
        const files = fs.readdirSync(commandDir).filter(f => f.endsWith('.js'));
        for (const file of files) {
            try {
                const cmd = require(path.join(commandDir, file));
                if (cmd.name && cmd.execute) {
                    commands.set(cmd.name, cmd);
                    console.log(`✅ Loaded command: ${cmd.name}`);
                }
            } catch (err) {
                console.error(`❌ Failed to load ${file}:`, err.message);
            }
        }
    }
    return commands;
}

// ================== BOT START ==================
async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ['RailwayBot', 'Chrome', '1.0.0']
    });

    sockInstance = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('📱 QR Code available (use web pairing instead)');
        }

        if (connection === 'close') {
            isConnected = false;
            pairingCode = null;
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('❌ Connection closed. Reconnecting:', shouldReconnect);
            if (shouldReconnect) {
                startBot();
            }
        } else if (connection === 'open') {
            isConnected = true;
            pairingCode = null;
            console.log('✅ Bot connected to WhatsApp!');
        }
    });

    // Agar botNumber set hai aur registered nahi hai, toh pairing code request karein
    if (!sock.authState.creds.registered && botNumber) {
        try {
            const code = await sock.requestPairingCode(botNumber);
            pairingCode = code;
            console.log(`🔑 Pairing Code ready: ${code}`);
        } catch (err) {
            console.error('Pairing code error:', err);
        }
    }

    const commands = await loadCommands();

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
        if (!text) return;

        const prefix = '.';
        if (!text.startsWith(prefix)) return;

        const args = text.slice(prefix.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();

        const command = commands.get(commandName);
        if (command) {
            try {
                await command.execute(sock, msg, args);
            } catch (err) {
                console.error(`Error in command ${commandName}:`, err);
                await sock.sendMessage(msg.key.remoteJid, { text: '❌ Command execute karte waqt error aya.' }, { quoted: msg });
            }
        }
    });
}

// Start bot
startBot();
