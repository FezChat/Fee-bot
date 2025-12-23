const express = require('express');
const fs = require('fs');
const path = require('path');
const pino = require('pino');
const { makeid } = require('./id');

const {
    default: Fredi,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers,
    fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');

const router = express.Router();
const sessionDir = path.join(__dirname, "temp");

function removeFile(path) {
    if (fs.existsSync(path)) fs.rmSync(path, { recursive: true, force: true });
}

router.get('/', async (req, res) => {
    const id = makeid();
    const num = (req.query.number || '').replace(/[^0-9]/g, '');
    const tempDir = path.join(sessionDir, id);
    let responseSent = false;
    let sessionCleanedUp = false;

    async function cleanUpSession() {
        if (!sessionCleanedUp) {
            try {
                removeFile(tempDir);
            } catch (cleanupError) {
                console.error("Cleanup error:", cleanupError);
            }
            sessionCleanedUp = true;
        }
    }

    async function startPairing() {
        try {
            const { version } = await fetchLatestBaileysVersion();
            const { state, saveCreds } = await useMultiFileAuthState(tempDir);

            const sock = Fredi({
                version,
                logger: pino({ level: 'fatal' }).child({ level: 'fatal' }),
                printQRInTerminal: false,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' }).child({ level: 'fatal' })),
                },
                browser: ["Ubuntu", "Chrome", "125"],
                syncFullHistory: false,
                generateHighQualityLinkPreview: true,
                shouldIgnoreJid: jid => !!jid?.endsWith('@g.us'),
                getMessage: async () => undefined,
                markOnlineOnConnect: true,
                connectTimeoutMs: 120000,
                keepAliveIntervalMs: 30000,
                emitOwnEvents: true,
                fireInitQueries: true,
                defaultQueryTimeoutMs: 60000,
                transactionOpts: {
                    maxCommitRetries: 10,
                    delayBetweenTriesMs: 3000
                },
                retryRequestDelayMs: 10000
            });

            // === Pairing Code Generation ===  
            if (!sock.authState.creds.registered) {
                await delay(2000); 
                const code = await sock.requestPairingCode(num);
                if (!responseSent && !res.headersSent) {
                    res.json({ code: code });
                    responseSent = true;
                }
            }

            sock.ev.on('creds.update', saveCreds);

            sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect } = update;

                if (connection === 'open') {
                    console.log('✅ Fee-Xmd successfully connected to WhatsApp.');
                    
                        

                    try {
                        await sock.sendMessage(sock.user.id, {
                            text: `

╭┈┈┈┈━━━━━━┈┈┈┈◈◈
┋❒ Hello! 👋 You're now connected to 🄵🄴🄴-🅇🄼🄳.

┋❒ Please wait a moment while we generate your session ID. It will be sent shortly... 🙂
╰┈┈┈┈━━━━━━┈┈┈┈◈
`,
                        });
                    } catch (msgError) {
                        console.log("Welcome message skipped, continuing...");
                    }

                    await delay(15000);

                    const credsPath = path.join(tempDir, "creds.json");


                    let sessionData = null;
                    let attempts = 0;
                    const maxAttempts = 10;

                    while (attempts < maxAttempts && !sessionData) {
                        try {
                            if (fs.existsSync(credsPath)) {
                                const data = fs.readFileSync(credsPath);
                                if (data && data.length > 50) {
                                    sessionData = data;
                                    break;
                                }
                            }
                            await delay(4000);
                            attempts++;
                        } catch (readError) {
                            console.error("Read attempt error:", readError);
                            await delay(2000);
                            attempts++;
                        }
                    }

                    if (!sessionData) {
                        console.error("Failed to read session data");
                        try {
                            await sock.sendMessage(sock.user.id, {
                                text: "Failed to generate session. Please try again."
                            });
                        } catch (e) {}
                        await cleanUpSession();
                        sock.ws.close();
                        return;
                    }

                    const base64 = Buffer.from(sessionData).toString('base64');

                    try {
                        const sentSession = await sock.sendMessage(sock.user.id, {
                            text: base64
                        });

                        const infoMessage = `  
🎄✨ *𝐇𝐀𝐏𝐏𝐘 𝐇𝐎𝐋𝐈𝐃𝐀𝐘𝐒 𝐅𝐑𝐎𝐌 𝐅𝐄𝐄-𝐗𝐌𝐃* ✨🎄  
╭━━━★˚☃️˚★━━━╮  
*🎁 DEVICE CONNECTED SUCCESSFULLY 🎁*  
╰━━━★˚🎅˚★━━━╯

📦 *Your Session ID is Ready!*  
🔐 Please copy and store it securely — you'll need it to deploy your *𝐅𝐄𝐄-𝐗𝐌𝐃* bot.

🎉 *𝑊𝑒 𝑊𝑖𝑠ℎ 𝑌𝑜𝑢 𝑎 𝑀𝑒𝑟𝑟𝑦 𝐶ℎ𝑟𝑖𝑠𝑡𝑚𝑎𝑠 𝑎𝑛𝑑 𝑎 𝐵𝑙𝑒𝑠𝑠𝑒𝑑 𝑁𝑒𝑤 𝑌𝑒𝑎𝑟 𝟐𝟎𝟐𝟔!* 🎊  

🌟 *Let the celebration begin with FEE-XMD power!*

┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈

📌 *Need Assistance? Reach Out Anytime:*  
• 👑 *Owner:* https://wa.me/255752593977  
• 💬 *Group Chat:* https://chat.whatsapp.com/KERPI5K0w0L9rzU00QSw40  
• 📢 *Channel:* https://whatsapp.com/channel/0029Vb6mzVF7tkj42VNPrZ3V  
• 📸 *Instagram:* https://www.instagram.com/frediezra  
• 💻 *GitHub Repo:* https://github.com/Fred1e/Fred1e

🧠 *Support FEE-XMD Project:*  
⭐ Star & 🍴 Fork the repo to stay updated with new features!

🎄 *#MerryChristmas | #HappyNewYear2026 | #FEEBot*
`;

                        await sock.sendMessage(sock.user.id, { text: infoMessage }, { quoted: sentSession });

                        await delay(2000);
                        sock.ws.close();
                        await cleanUpSession();

                    } catch (sendError) {
                        console.error("Error sending session:", sendError);
                        await cleanUpSession();
                        sock.ws.close();
                    }

                } else if (connection === "close") {
                    if (lastDisconnect?.error?.output?.statusCode !== 401) {
                        console.log('⚠️ Connection closed, attempting to reconnect...');
                        await delay(10000);
                        startPairing();
                    } else {
                        console.log('❌ Connection closed permanently');
                        await cleanUpSession();
                    }
                } else if (connection === "connecting") {
                    console.log('⏳ Connecting to WhatsApp...');
                }
            });

            // Handle errors
            sock.ev.on('connection.update', (update) => {
                if (update.qr) {
                    console.log("QR code received");
                }
                if (update.connection === "close") {
                    console.log("Connection closed event");
                }
            });

        } catch (err) {
            console.error('❌ Error during pairing:', err);
            await cleanUpSession();
            if (!responseSent && !res.headersSent) {
                res.status(500).json({ code: 'Service Unavailable. Please try again.' });
                responseSent = true;
            }
        }
    }


    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
            reject(new Error("Pairing process timeout"));
        }, 180000);
    });

    try {
        await Promise.race([startPairing(), timeoutPromise]);
    } catch (finalError) {
        console.error("Final error:", finalError);
        await cleanUpSession();
        if (!responseSent && !res.headersSent) {
            res.status(500).json({ code: "Service Error - Timeout" });
        }
    }
});

module.exports = router;