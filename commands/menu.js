module.exports = {
    name: 'menu',
    description: 'Bot ka menu dikhata hai',
    async execute(sock, msg, args) {
        const jid = msg.key.remoteJid;

        const menuText = `
╭━━━〔 *BOT MENU* 〕━━━╮
┃
┃ 🤖 *Prefix:* .
┃ 📋 *Total Commands:* 1
┃
┃ 📌 *Available Commands:*
┃ ────────────────
┃ • .menu - Yeh menu dikhaye
┃
╰━━━━━━━━━━━━━━━━━━━╯

_More commands coming soon!_
        `.trim();

        await sock.sendMessage(jid, { text: menuText }, { quoted: msg });
    }
};
