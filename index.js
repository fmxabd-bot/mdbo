const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const express = require('express');

// ================== WEB SERVER (Railway ke liye) ==================
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('🤖 Bot is running!');
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

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('📱 QR Code:', qr);
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('❌ Connection closed. Reconnecting:', shouldReconnect);
            if (shouldReconnect) {
                startBot();
            }
        } else if (connection === 'open') {
            console.log('✅ Bot connected to WhatsApp!');
        }
    });

    // Pairing Code
    if (!sock.authState.creds.registered) {
        const phoneNumber = process.env.BOT_NUMBER || '923001234567';
        if (phoneNumber) {
            setTimeout(async () => {
                try {
                    const code = await sock.requestPairingCode(phoneNumber);
                    console.log(`🔑 Pairing Code: ${code}`);
                    console.log('👆 WhatsApp > Linked Devices > Link with phone number mein yeh code enter karein');
                } catch (err) {
                    console.error('Pairing code error:', err);
                }
            }, 3000);
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

startBot();
