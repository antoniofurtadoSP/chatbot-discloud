/**
 * @file chatbot.js
 * @description Bot de atendimento para a empresa Zentex Limpeza, com funil de atendimento,
 * integração com IA para respostas dinâmicas e funcionalidades de áudio (Speech-to-Text).
 * @version 2.1.6 (Corrigido para ambiente Discloud/Dockerfile)
 */

// ###############################################################
// MÓDULOS ESSENCIAIS
// ###############################################################
const qrcode = require("qrcode");
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
const P = require("pino");
const { Boom } = require("@hapi/boom");
const fs = require("fs");
const path = require('path');
// MÓDULO CORRIGIDO: Necessário para a função fetch funcionar no Node.js
const fetch = require('node-fetch'); 

// Mapa para armazenar o estado da conversa de cada chat
const chatStates = new Map();
// Conjunto para rastrear chats que estão atualmente em processamento
const processingChats = new Set(); 

// Número do atendente para onde a conversa será "transferida"
const SUPPORT_AGENT_NUMBER = '5511970554853@c.us'; 

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState("baileys_auth_info");

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: P({ level: "silent" }),
        browser: ["Chrome (Linux)", "", ""],
    });

    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            console.log("QR Code recebido. Escaneie para conectar.");
            qrcode.toDataURL(qr, (err, url) => {
                if (err) {
                    console.error("Erro ao gerar QR Code:", err);
                    return;
                }
                console.log("QR Code disponível em: ", url);
                console.log("Copie a URL acima e cole em um navegador para escanear.");
            });
        }

        if (connection === "close") {
            let reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
            if (reason === DisconnectReason.badSession) { console.log(`Bad Session File, Please Delete baileys_auth_info and Scan Again`); sock.logout(); } else if (reason === DisconnectReason.connectionClosed) { console.log("Connection closed, reconnecting...."); connectToWhatsApp(); } else if (reason === DisconnectReason.connectionLost) { console.log("Connection Lost from Server, reconnecting..."); connectToWhatsApp(); } else if (reason === DisconnectReason.connectionReplaced) { console.log("Connection Replaced, Another new session opened, please close current session first"); sock.logout(); } else if (reason === DisconnectReason.loggedOut) { console.log(`Device Logged Out, Please Delete baileys_auth_info and Scan Again.`); sock.logout(); } else if (reason === DisconnectReason.restartRequired) { console.log("Restart Required, Restarting..."); connectToWhatsApp(); } else if (reason === DisconnectReason.timedOut) { console.log("Connection TimedOut, Reconnecting..."); connectToWhatsApp(); } else { sock.end(`Unknown DisconnectReason: ${reason}|${lastDisconnect.error}`); }
        }
        if (connection === "open") {
            console.log("Tudo certo! WhatsApp conectado.");
        }
    });

    sock.ev.on("creds.update", saveCreds);

    const delay = ms => new Promise(res => setTimeout(res, ms));

    const serviceTable = [
        { id: 1, service: "Limpeza Geral de Escritórios", description: "Manutenção de áreas corporativas (mesas, banheiros, lixo).", frequency: "Diária", daily: "250-450", weekly: "1.200-2.000", monthly: "4.500-8.000", observations: "1-2 funcionários por 500m². Cliente fornece materiais." },
        { id: 2, service: "Limpeza de Áreas Comuns de Condomínios", description: "Limpeza de halls, elevadores, escadas.", frequency: "Diária / Semanal", daily: "400-600", weekly: "1.800-2.800", monthly: "7.500-12.000", observations: "Baseado em 2-3 funcionários. Exemplo: licitação em São José dos Campos." },
        { id: 3, service: "Limpeza Pós-Obra", description: "Remoção de resíduos de construção (cimento, tinta).", frequency: "Pontual", daily: "600-1.200", weekly: "N/A", monthly: "N/A", observations: "Preço por m². Equipe especializada." },
        { id: 4, service: "Limpeza Hospitalar", description: "Higienização de UTIs, centros cirúrgicos (protocolos ANVISA/ NR-32).", frequency: "Diária", daily: "800-1.500", weekly: "3.500-6.500", monthly: "15.000-28.000", observations: "Exige certificação em biossegurança." },
        { id: 5, service: "Limpeza de Shopping Centers", description: "Limpeza contínua de corredores, banheiros, praças de alimentação.", frequency: "Diária (24h/7d)", daily: "1.500-3.000", weekly: "7.000-14.000", monthly: "30.000-60.000", observations: "Múltiplos turnos. Inclui equipamentos especiais (ex.: lavadoras industriais)." },
        { id: 6, service: "Limpeza Residencial (até 80m²)", description: "Serviço pontual ou recorrente. Inclui materiais básicos.", frequency: "Semanal/Quinzenal", daily: "250-400/visita", weekly: "1.000-1.600", monthly: "250-400/visita", observations: "1 profissional por visita." },
        { id: 7, service: "Limpeza Residencial (+80m²)", description: "Casas ou apartamentos grandes.", frequency: "Semanal / Quinzenal", daily: "350-600/visita", weekly: "1.400-2.400", monthly: "350-600/visita", observations: "1 a 2 profissionais." },
        { id: 8, service: "Limpeza de Fachadas", description: "Limpeza de vidros e estruturas externas (com alpinismo ou plataformas).", frequency: "Pontual/Mensal", daily: "1.000-2.500", weekly: "N/A", monthly: "4.000-10.000", observations: "Preço por m². Requer equipe certificada em altura." },
        { id: 9, service: "Tratamento de Pisos", description: "Polimento, cristalização ou aplicação de cera.", frequency: "Mensal", daily: "N/A", weekly: "N/A", monthly: "800-3.000", observations: "Varia conforme o tipo de piso (vinílico, cerâmico, mármore)." },
        { id: 10, service: "Jardinagem Básica", description: "Poda, rega e manutenção de áreas verdes.", frequency: "Semanal / Mensal", daily: "200-400", weekly: "900-1.800", monthly: "3.500-7.000", observations: "Pode ser combinada com serviços de limpeza." }
    ];

    const frequencyKeywords = {
        daily: ["diaria", "diário", "diariamente", "todo dia", "todos os dias"],
        weekly: ["semanal", "semanalmente", "toda semana", "uma vez por semana"],
        biweekly: ["quinzenal", "quinzenalmente", "a cada 15 dias", "de 15 em 15 dias", "15 em 15"],
        monthly: ["mensal", "mensalmente", "todo mês", "a cada mês", "uma vez por mês"],
        punctual: ["pontual", "uma vez", "só uma vez", "única vez"]
    };
    
    function matchesFrequency(message, keywords) {
        return keywords.some(keyword => message.includes(keyword));
    }

    async function generateResponseWithLLM(userQuery) {
        // A chave da API será carregada das Variáveis de Ambiente do Discloud
        const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || 'AIzaSyCBWxVsI9Ss0rfdrGv3251TMh_ySpG6yY0';
        
        if (!apiKey) {
            console.error("Erro: A chave da API não foi encontrada nas variáveis de ambiente.");
            return "Desculpe, não consigo responder a perguntas no momento, por favor, tente novamente mais tarde.";
        }
        
        const systemPrompt = "Você é um assistente virtual profissional e amigável da Zentex Limpeza, uma empresa que oferece serviços de limpeza e conservação em vários ambientes. Seu objetivo é engajar o cliente e fornecer informações de forma natural e prestativa. Responda a perguntas sobre os serviços da empresa, informações de contato, o site oficial é www.zentexlimpeza.com.br, e assuntos relacionados a limpeza. Seja conciso e direto, mas com um toque humano. Se a pergunta for sobre um assunto que não tem a ver com a empresa, diga de forma educada que você é um bot da Zentex, e focado em soluções de limpeza.";
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
        const payload = {
            contents: [{ parts: [{ text: userQuery }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] },
        };

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorBody = await response.text();
                console.error(`Erro na API: ${response.status} - ${response.statusText}. Detalhes: ${errorBody}`);
                return "Desculpe, houve um problema técnico ao processar sua solicitação, por favor, tente novamente mais tarde.";
            }

            const result = await response.json();
            const candidate = result.candidates?.[0];
            if (candidate && candidate.content?.parts?.[0]?.text) {
                return candidate.content.parts[0].text;
            } else {
                console.error("Resposta da API em formato inesperado:", JSON.stringify(result, null, 2));
                return "Desculpe, não consegui gerar uma resposta, por favor, tente de outra forma.";
            }
        } catch (error) {
            console.error("Erro ao chamar a API de IA:", error);
            return "Desculpe, houve um problema de comunicação, por favor, tente novamente mais tarde.";
        }
    }

    async function processAudioMessage(message) {
        console.log("Áudio recebido, processando...");
        await delay(2000); 
        console.log("Áudio convertido para texto (simulação).");
        return "Olá, gostaria de saber mais sobre os serviços de limpeza.";
    }

    function findMatchingService(query) {
        const lowerQuery = String(query).toLowerCase();
        const serviceId = parseInt(query);
        if (!isNaN(serviceId) && serviceId >= 1 && serviceId <= serviceTable.length) {
            return serviceTable[serviceId - 1];
        }
        for (const serviceItem of serviceTable) {
            if (serviceItem.service.toLowerCase().includes(lowerQuery) || serviceItem.description.toLowerCase().includes(lowerQuery)) {
                return serviceItem;
            }
        }
        return null;
    }


    sock.ev.on("messages.upsert", async ({ messages }) => {
        const msg = messages[0];
        if (msg.key.fromMe || !msg.message) return;

        const chatId = msg.key.remoteJid;
        if (!chatId.endsWith("@s.whatsapp.net")) {
            console.log("Mensagem ignorada: veio de um grupo.");
            return;
        }

        let messageBody = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
        if (msg.message.audioMessage) {
            messageBody = await processAudioMessage(msg.message.audioMessage);
        }

        let currentState = chatStates.get(chatId) || {};
        const currentMsgTimestamp = msg.messageTimestamp;

        if (currentState.handoff) {
            console.log(`Mensagem recebida de ${chatId} enquanto em atendimento. Ignorando.`);
            return;
        }

        if (processingChats.has(chatId)) {
            currentState.interrupted = true;
            currentState.lastUserMessageTimestamp = currentMsgTimestamp;
            chatStates.set(chatId, currentState);
            console.log(`Chat ${chatId} já está em processamento, nova mensagem detectada (interrupção).`);
            return;
        }

        console.log(`Mensagem recebida de ${chatId}: "${messageBody}"`);
        processingChats.add(chatId);
        currentState.interrupted = false;
        currentState.lastUserMessageTimestamp = currentMsgTimestamp;
        chatStates.set(chatId, currentState);
        
        try {
            const name = msg.pushName || (chatId ? chatId.split('@')[0] : 'Usuário');

            async function sendBotMessageIfAllowed(messageText) {
                const latestState = chatStates.get(chatId);
                if (latestState && latestState.interrupted && latestState.lastUserMessageTimestamp > currentMsgTimestamp) {
                    console.log(`Resposta abortada para ${chatId}, nova mensagem do usuário detectada.`);
                    return false;
                }
                await sock.sendMessage(chatId, { text: messageText });
                return true;
            }

            async function delayAndType(delayMs) {
                await delay(delayMs);
                const latestState = chatStates.get(chatId);
                if (latestState && latestState.interrupted && latestState.lastUserMessageTimestamp > currentMsgTimestamp) {
                    console.log(`Simulação de digitação abortada para ${chatId}, nova mensagem do usuário detectada.`);
                    return false;
                }
                await sock.sendPresenceUpdate("composing", chatId);
                await delay(1500);
                await sock.sendPresenceUpdate("paused", chatId);
                return true;
            }

            async function handleFallback(chatId, messageBody) {
                const aiResponse = await generateResponseWithLLM(messageBody);
                
                const isUsefulResponse = aiResponse && !aiResponse.includes("problema técnico") && !aiResponse.includes("não consegui gerar uma resposta");

                if (isUsefulResponse) {
                    await sendBotMessageIfAllowed(aiResponse);
                    currentState.stage = "initial"; 
                    return true;
                } else {
                    return false; 
                }
            }
            
            const lowerCaseMessage = messageBody.toLowerCase().trim();
            
            const employmentKeywords = ["vaga", "emprego", "trabalhar", "currículo", "contratação", "oportunidade", "recrutamento", "diarista"];
            const isEmploymentQuery = employmentKeywords.some(keyword => lowerCaseMessage.includes(keyword));

            if (isEmploymentQuery) {
                if (!(await delayAndType(1500))) return;
                if (!(await sendBotMessageIfAllowed(`Olá, para oportunidades de emprego na Zentex Limpeza, por favor, envie seu currículo para o e-mail: contato@zentexlimpeza.com.br. Agradecemos o seu interesse e desejamos boa sorte!`))) return;
                chatStates.delete(chatId);
                return;
            }

            if (lowerCaseMessage === "menu" || lowerCaseMessage === "início" || lowerCaseMessage === "começar") {
                console.log(`Reiniciando o funil para ${chatId} a pedido do usuário.`);
                chatStates.delete(chatId);
                currentState = {};
            }
            
            if (!currentState.stage || currentState.stage === "initial") {
                if (lowerCaseMessage && !["1", "2", "3", "4"].includes(lowerCaseMessage) && lowerCaseMessage !== "menu") {
                    if (!(await delayAndType(1500))) return;
                    if (await handleFallback(chatId, messageBody)) { 
                        return;
                    }
                }
            }
            
            if (!currentState.stage || currentState.stage === "initial") {
                if (!(await delayAndType(1500))) return;
                
                if (!(await sendBotMessageIfAllowed(`Olá ${name}, eu sou o assistente virtual da Zentex Limpeza. Que ótimo ter você por aqui!\n\nSe tiver uma pergunta rápida (ex: "Qual o site de vocês?"), pode digitar que eu respondo. Caso prefira o menu, como posso te ajudar hoje?\n\n*1.* Conhecer os serviços\n*2.* Solicitar um orçamento\n*3.* Falar com um atendente\n*4.* Outros assuntos (Ex: Financeiro)`))) return;
                currentState.stage = "initial";
            } else if (currentState.stage === "initial") {
                switch (messageBody) {
                    case "1":
                        if (!(await delayAndType(1000))) return;
                        if (!(await sendBotMessageIfAllowed("Nós oferecemos uma ampla gama de serviços de limpeza e conservação. Para qual tipo de ambiente você busca nossos serviços?\n\n*1.* Escritórios\n*2.* Condomínios\n*3.* Residências\n*4.* Outros (Pós-obra, Hospitalar, etc.)"))) return;
                        currentState.stage = "service_type_selection";
                        break;
                    case "2":
                        if (!(await delayAndType(1000))) return;
                        if (!(await sendBotMessageIfAllowed("Para solicitar um orçamento, preciso de algumas informações. Qual tipo de serviço você está buscando?"))) return;
                        currentState.stage = "request_quote_service_name";
                        break;
                    case "3":
                        if (!(await delayAndType(1500))) return;
                        if (!(await sendBotMessageIfAllowed("Com certeza, vou transferir o seu atendimento para um de nossos consultores agora mesmo. Aguarde um momento por favor, a equipe de atendimento já foi notificada."))) return;
                        currentState.handoff = true;
                        break;
                    case "4":
                        if (!(await delayAndType(1000))) return;
                        if (!(await sendBotMessageIfAllowed("Certo, para outros assuntos, por favor, descreva brevemente sua necessidade. Vou usar a Inteligência Artificial para tentar responder e, se for muito complexo, te conecto a um atendente."))) return;
                        currentState.stage = "other_matters";
                        break;
                    default:
                        if (!(await delayAndType(1000))) return;
                        await sendBotMessageIfAllowed("Ops, não entendi essa opção. Por favor, digite *1, 2, 3 ou 4* para continuar no menu ou digite *MENU* para recomeçar.");
                }
            } else if (currentState.stage === "service_type_selection") {
                if (!(await delayAndType(1000))) return;
                await sendBotMessageIfAllowed("Essa parte do funil (stage: service_type_selection) ainda precisa de implementação completa para detalhar os serviços. Digite *MENU* para voltar ou *2* para ir direto para o Orçamento.");
            } else if (currentState.stage === "request_quote_service_name") {
                const matchedService = findMatchingService(messageBody);
                if (matchedService) {
                    currentState.selectedService = matchedService;
                    if (!(await delayAndType(1000))) return;
                    if (!(await sendBotMessageIfAllowed(`Certo, para o serviço de *${matchedService.service}*, qual a frequência desejada?\n\n* Diária\n* Semanal\n* Quinzenal\n* Mensal\n* Pontual`))) return;
                    currentState.stage = "request_quote_frequency";
                } else {
                    if (!(await delayAndType(1000))) return;
                    await sendBotMessageIfAllowed(`Não encontrei o serviço que você procura. Vou transferir o seu contato para um consultor que pode te ajudar com a melhor opção.`);
                    currentState.handoff = true;
                }
            } else if (currentState.stage === "request_quote_frequency") {
                const lowerCaseMessage = messageBody.toLowerCase();
                let frequencyMatched = null;

                for (const freqType in frequencyKeywords) {
                    if (matchesFrequency(lowerCaseMessage, frequencyKeywords[freqType])) {
                        frequencyMatched = freqType;
                        break;
                    }
                }

                if (frequencyMatched) {
                    currentState.requestedFrequency = frequencyMatched;
                    if (!(await delayAndType(1000))) return;
                    if (!(await sendBotMessageIfAllowed(`Excelente, para o serviço de *${currentState.selectedService.service}* com frequência *${currentState.requestedFrequency}*, qual o tamanho aproximado da área em m²?`))) return;
                    currentState.stage = "request_quote_area";
                } else {
                    if (!(await delayAndType(1000))) return;
                    await sendBotMessageIfAllowed(`Não consegui identificar a frequência desejada. Para não perder tempo, vou te conectar a um consultor que pode te ajudar a definir isso.`);
                    currentState.handoff = true;
                }
            } else if (currentState.stage === "request_quote_area") {
                const area = parseInt(messageBody);
                if (!isNaN(area) && area > 0) {
                    currentState.requestedArea = area;
                    if (!(await delayAndType(1000))) return;
                    if (!(await sendBotMessageIfAllowed("Entendido. Por favor, informe seu nome completo para o orçamento, assim o consultor saberá quem está solicitando."))) return;
                    currentState.stage = "request_quote_name";
                } else {
                    if (!(await delayAndType(1000))) return;
                    if (!(await sendBotMessageIfAllowed("A área informada não é um número válido, por favor, digite apenas a área em metros quadrados, ex: 150"))) return;
                }
            } else if (currentState.stage === "request_quote_name") {
                currentState.requesterName = messageBody;
                if (!(await delayAndType(1000))) return;
                if (!(await sendBotMessageIfAllowed("Ótimo, agora, para finalizar, por favor, informe seu melhor e-mail para que possamos enviar o orçamento. Se preferir continuar só por aqui, digite *pular*."))) return;
                currentState.stage = "request_quote_email";
            } else if (currentState.stage === "request_quote_email") {
                const emailRegex = /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/;
                const skippedEmail = lowerCaseMessage === "pular";

                if (emailRegex.test(messageBody) || skippedEmail) {
                    if (!skippedEmail) {
                        currentState.requesterEmail = messageBody;
                    } else {
                        currentState.requesterEmail = "Não informado (Cliente pulou a etapa)";
                        currentState.handoff = true;
                    }

                    if (!(await delayAndType(1000))) return;
                    
                    const finalMessage = currentState.handoff
                        ? "Entendido, agradecemos as informações! Nosso consultor já foi notificado e dará continuidade ao seu orçamento. Aguarde mais um momento por favor."
                        : "Obrigado, seu pedido de orçamento foi registrado com sucesso! Um de nossos consultores entrará em contato em breve. Se precisar de mais alguma coisa, digite 'menu' para voltar ao início.";
                    
                    if (!(await sendBotMessageIfAllowed(finalMessage))) return;

                    const clientPhoneNumber = chatId.replace("@s.whatsapp.net", "");
                    await sock.sendMessage(SUPPORT_AGENT_NUMBER,
                        { text: `NOVO ORÇAMENTO SOLICITADO:\n\nServiço: ${currentState.selectedService.service}\nFrequência: ${currentState.requestedFrequency}\nÁrea: ${currentState.requestedArea}m²\nNome: ${currentState.requesterName}\nEmail: ${currentState.requesterEmail}\nNúmero: wa.me/${clientPhoneNumber}\n\n${currentState.handoff ? "ALERTA: CLIENTE PULOU O E-MAIL, INICIAR ATENDIMENTO IMEDIATO." : "Aguardando Contato do Consultor."}` }
                    );
                    console.log(`Notificação de orçamento enviada para ${SUPPORT_AGENT_NUMBER}.`);

                    chatStates.delete(chatId);
                } else {
                    if (!(await delayAndType(1000))) return;
                    if (!(await sendBotMessageIfAllowed("E-mail inválido ou opção incorreta, por favor, digite um e-mail válido ou digite *pular* para continuar com um atendente."))) return;
                }
            }
            else if (currentState.stage === "other_matters") {
                if (!(await delayAndType(1500))) return;
                const aiSuccess = await handleFallback(chatId, messageBody);
                if (aiSuccess) {
                    currentState.stage = "initial";
                    await sendBotMessageIfAllowed("\n\nSe precisar de mais alguma coisa, pode perguntar ou digitar *MENU* para voltar ao início.");
                } else {
                    await sendBotMessageIfAllowed("Puxa, não consegui entender essa questão. Para te ajudar melhor, vou transferir o seu contato para um consultor especialista no assunto. Aguarde um momento.");
                    currentState.handoff = true;
                }
            }

        } catch (error) {
            console.error("Erro ao processar mensagem:", error);
            await sock.sendMessage(chatId, { text: "Desculpe, ocorreu um erro inesperado no sistema, tente novamente ou digite 'menu' para recomeçar." });
        } finally {
            chatStates.set(chatId, currentState);
            processingChats.delete(chatId);
        }
    });
}

const startBot = async () => {
    while (true) {
        try {
            await connectToWhatsApp();
            break;
        } catch (e) {
            console.error("Erro na conexão principal, tentando reconectar em 5s...", e);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
};

startBot();