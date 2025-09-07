const qrcode = require("qrcode");
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, jidNormalizedUser, proto } = require("@whiskeysockets/baileys");

const P = require("pino");
const { Boom } = require("@hapi/boom");
const fs = require("fs");

// const store = makeInMemoryStore({ logger: P().child({ level: "silent", stream: "store" }) });

// Mapa para armazenar o estado da conversa de cada chat
const chatStates = new Map();
// Conjunto para rastrear chats que estão atualmente em processamento
const processingChats = new Set(); 

// ###############################################################
// NOVO: Número do atendente para onde a conversa será "transferida"
// IMPORTANTE: Substitua '55119XXXXXXXX@c.us' pelo número real do seu atendente
// com o código do país (55), código de área (DD) e o número completo.
// Exemplo para um número de São Paulo (11): '5511987654321@c.us'
const SUPPORT_AGENT_NUMBER = '5511965999745@c.us'; 
// ###############################################################

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState("baileys_auth_info");

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false, // Alterado para não imprimir no terminal
        logger: P({ level: "silent" }),
        browser: ["Chrome (Linux)", "", ""], // Simula um navegador para evitar detecção
    });

    // ###############################################################
    // NOVO: Gerar QR Code diretamente para os logs
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
    // ###############################################################

        if (connection === "close") {
            let reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
            if (reason === DisconnectReason.badSession) { console.log(`Bad Session File, Please Delete baileys_auth_info and Scan Again`); sock.logout(); } else if (reason === DisconnectReason.connectionClosed) { console.log("Connection closed, reconnecting...."); connectToWhatsApp(); } else if (reason === DisconnectReason.connectionLost) { console.log("Connection Lost from Server, reconnecting..."); connectToWhatsApp(); } else if (reason === DisconnectReason.connectionReplaced) { console.log("Connection Replaced, Another new session opened, please close current session first"); sock.logout(); } else if (reason === DisconnectReason.loggedOut) { console.log(`Device Logged Out, Please Delete baileys_auth_info and Scan Again.`); sock.logout(); } else if (reason === DisconnectReason.restartRequired) { console.log("Restart Required, Restarting..."); connectToWhatsApp(); } else if (reason === DisconnectReason.timedOut) { console.log("Connection TimedOut, Reconnecting..."); connectToWhatsApp(); } else { sock.end(`Unknown DisconnectReason: ${reason}|${lastDisconnect.error}`); }
        }
        if (connection === "open") {
            console.log("Tudo certo! WhatsApp conectado.");
        }
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("messages.upsert", async m => {
        console.log(JSON.stringify(m, undefined, 2));

        const msg = m.messages[0];
        if (!msg.key.fromMe && m.type === "notify") {
            console.log("replying to", msg.key.remoteJid);
            await sock.sendMessage(msg.key.remoteJid, { text: "Hello there!" });
        }
    });

    // Função auxiliar para criar um atraso (delay) nas respostas do bot
    const delay = ms => new Promise(res => setTimeout(res, ms));

    // Tabela de serviços e valores (extraída do seu documento PDF)
    const serviceTable = [
        {
            id: 1, // Adicionado ID para facilitar a seleção por número
            service: "Limpeza Geral de Escritórios",
            description: "Manutenção de áreas corporativas (mesas, banheiros, lixo).",
            frequency: "Diária",
            daily: "250-450",
            weekly: "1.200-2.000",
            monthly: "4.500-8.000",
            observations: "1-2 funcionários por 500m². Cliente fornece materiais."
        },
        {
            id: 2, // Adicionado ID
            service: "Limpeza de Áreas Comuns de Condomínios",
            description: "Limpeza de halls, elevadores, escadas.",
            frequency: "Diária / Semanal",
            daily: "400-600",
            weekly: "1.800-2.800",
            monthly: "7.500-12.000",
            observations: "Baseado em 2-3 funcionários. Exemplo: licitação em São José dos Campos."
        },
        {
            id: 3, // Adicionado ID
            service: "Limpeza Pós-Obra",
            description: "Remoção de resíduos de construção (cimento, tinta).",
            frequency: "Pontual",
            daily: "600-1.200",
            weekly: "N/A",
            monthly: "N/A",
            observations: "Preço por m². Equipe especializada."
        },
        {
            id: 4, // Adicionado ID
            service: "Limpeza Hospitalar",
            description: "Higienização de UTIs, centros cirúrgicos (protocolos ANVISA/ NR-32).",
            frequency: "Diária",
            daily: "800-1.500",
            weekly: "3.500-6.500",
            monthly: "15.000-28.000",
            observations: "Exige certificação em biossegurança."
        },
        {
            id: 5, // Adicionado ID
            service: "Limpeza de Shopping Centers",
            description: "Limpeza contínua de corredores, banheiros, praças de alimentação.",
            frequency: "Diária (24h/7d)",
            daily: "1.500-3.000",
            weekly: "7.000-14.000",
            monthly: "30.000-60.000",
            observations: "Múltiplos turnos. Inclui equipamentos especiais (ex.: lavadoras industriais)."
        },
        {
            id: 6, // Adicionado ID
            service: "Limpeza Residencial (até 80m²)",
            description: "Serviço pontual ou recorrente. Inclui materiais básicos.",
            frequency: "Semanal/Quinzenal",
            daily: "250-400/visita",
            weekly: "1.000-1.600",
            monthly: "250-400/visita", // Nota: Parece ser um erro de digitação no documento, o valor mensal é o mesmo que o diário/visita
            observations: "1 profissional por visita."
        },
        {
            id: 7, // Adicionado ID
            service: "Limpeza Residencial (+80m²)", // Renomeado para clareza
            description: "Casas ou apartamentos grandes.",
            frequency: "Semanal / Quinzenal", // Adicionado Quinzenal para clareza
            daily: "350-600/visita",
            weekly: "1.400-2.400",
            monthly: "350-600/visita", // Nota: Parece ser um erro de digitação no documento, o valor mensal é o mesmo que o diário/visita
            observations: "1 a 2 profissionais."
        },
        {
            id: 8, // Adicionado ID
            service: "Limpeza de Fachadas",
            description: "Limpeza de vidros e estruturas externas (com alpinismo ou plataformas).",
            frequency: "Pontual/Mensal", // Adicionado Pontual para clareza
            daily: "1.000-2.500",
            weekly: "N/A",
            monthly: "4.000-10.000",
            observations: "Preço por m². Requer equipe certificada em altura."
        },
        {
            id: 9, // Adicionado ID
            service: "Tratamento de Pisos",
            description: "Polimento, cristalização ou aplicação de cera.",
            frequency: "Mensal",
            daily: "N/A",
            weekly: "N/A",
            monthly: "800-3.000",
            observations: "Varia conforme o tipo de piso (vinílico, cerâmico, mármore)."
        },
        {
            id: 10, // Adicionado ID
            service: "Jardinagem Básica",
            description: "Poda, rega e manutenção de áreas verdes.",
            frequency: "Semanal / Mensal",
            daily: "200-400",
            weekly: "900-1.800",
            monthly: "3.500-7.000",
            observations: "Pode ser combinada com serviços de limpeza."
        }
    ];

    // Mapeamento de palavras-chave para cada frequência
    const frequencyKeywords = {
        daily: ["diaria", "diário", "diariamente", "todo dia", "todos os dias"],
        weekly: ["semanal", "semanalmente", "toda semana", "uma vez por semana"],
        biweekly: ["quinzenal", "quinzenalmente", "a cada 15 dias", "de 15 em 15 dias", "15 em 15"],
        monthly: ["mensal", "mensalmente", "todo mês", "a cada mês", "uma vez por mês"],
        punctual: ["pontual", "uma vez", "só uma vez", "única vez"]
    };

    // NEW: Combined list for general service inquiry trigger and service identification
    const serviceInquiryKeywords = [
        "serviços", "servico", "diarista", "limpeza", "conservação", "faxina", "orçamento", "orçamentos", 
        "preço", "quanto custa", "valores", "contato para serviço",
        "limpeza geral de escritórios", "escritórios", "limpeza em casas", "apartamentos",
        "áreas comuns de condomínios", "condomínios", "limpeza pós-obra", "pós-obra",
        "limpeza hospitalar", "hospitalar", "limpeza de shopping centers", "shopping",
        "limpeza residencial", "residencial", "limpeza de fachadas", "fachadas",
        "tratamento de pisos", "pisos", "jardinagem básica", "jardinagem"
    ];

    // Função auxiliar para verificar se a entrada do usuário corresponde a uma frequência
    function matchesFrequency(userInput, targetFrequencies) {
        const lowerInput = userInput.toLowerCase();
        for (const keyword of targetFrequencies) {
            if (lowerInput.includes(keyword)) {
                return true;
            }
        }
        return false;
    }

    // Função para encontrar o serviço mais relevante baseado na entrada do usuário
    function findMatchingService(query) {
        const lowerQuery = String(query).toLowerCase(); // Garante que query seja string
        console.log(`findMatchingService: Recebido query "${query}", lowerQuery "${lowerQuery}"`); // Log de depuração

        // Tenta encontrar por ID primeiro
        const serviceId = parseInt(query);
        if (!isNaN(serviceId) && serviceId >= 1 && serviceId <= serviceTable.length) {
            console.log(`findMatchingService: Encontrado por ID: ${serviceTable[serviceId - 1].service}`); // Log de depuração
            return serviceTable[serviceId - 1]; // IDs são baseados em 1
        }

        // Se não encontrou por ID, tenta por nome ou descrição
        for (const serviceItem of serviceTable) {
            if (serviceItem.service.toLowerCase().includes(lowerQuery) ||
                serviceItem.description.toLowerCase().includes(lowerQuery)) {
                console.log(`findMatchingService: Encontrado por texto: ${serviceItem.service}`); // Log de depuração
                return serviceItem;
            }
        }
        console.log("findMatchingService: Nenhum serviço correspondente encontrado."); // Log de depuração
        return null;
    }

    // Funil de atendimento - Lógica principal do bot
    sock.ev.on("messages.upsert", async ({ messages }) => {
        const msg = messages[0];
        if (!msg.key.fromMe && msg.message) { // Ignora mensagens enviadas pelo próprio bot e mensagens sem conteúdo
            const chatId = msg.key.remoteJid;
            const messageBody = msg.message.conversation || msg.message.extendedTextMessage?.text || "";

            // Adição para ignorar mensagens enviadas pelo próprio bot
            if (msg.key.fromMe) { 
                console.log("Mensagem ignorada: enviada pelo próprio bot.");
                return;
            }
        
            // Verifica se a mensagem veio de um chat individual (não grupo)
            if (!chatId.endsWith("@s.whatsapp.net")) { // Baileys usa @s.whatsapp.net para chats individuais
                console.log("Mensagem ignorada: veio de um grupo.");
                return; // Ignora mensagens de grupos para este funil
            }
        
            let currentState = chatStates.get(chatId) || {};
        
            // *** NOVO: Verifica se o chat está em estado de transferência (handoff) ***
            if (currentState.handoff) {
                console.log(`Chat ${chatId} está em handoff. Ignorando nova mensagem do usuário.`);
                // Opcional: Enviar uma mensagem de lembrete UMA ÚNICA VEZ para o usuário.
                if (!currentState.handoffAcknowledged) {
                    await sock.sendMessage(chatId, { text: "Olá! Um de nossos consultores já está cuidando do seu atendimento. Por favor, aguarde o contato deles. Obrigado pela compreensão." });
                    currentState.handoffAcknowledged = true;
                    chatStates.set(chatId, currentState); // Salva o estado atualizado
                }
                return; // Para o processamento da mensagem imediatamente
            }
        
            // Se este chat já estiver em processamento, ignora esta mensagem para evitar duplicação.
            // E registra o timestamp da última mensagem do usuário para saber se houve interrupção.
            const currentMsgTimestamp = msg.messageTimestamp; 
        
            if (processingChats.has(chatId)) {
                currentState.interrupted = true; 
                currentState.lastUserMessageTimestamp = currentMsgTimestamp; 
                chatStates.set(chatId, currentState); 
                console.log(`Chat ${chatId} já está em processamento, nova mensagem detectada (interrupção).`);
                return; 
            }
        
            console.log(`Mensagem recebida de ${chatId}: "${messageBody}"`);
        
            // Marca este chat como estando em processamento e reseta a flag de interrupção
            processingChats.add(chatId);
            currentState.interrupted = false; 
            currentState.lastUserMessageTimestamp = currentMsgTimestamp; 
            chatStates.set(chatId, currentState); // Garante que o estado seja salvo no início do processamento
        
            try {
                // await store.contacts[chatId]; // Não está definido, então removemos
                // Não há store, então o nome do contato será o chatId
                const name = chatId.split("@")[0];
        
                /**
                 * Envia uma mensagem do bot, verificando antes se a conversa foi interrompida por uma nova mensagem do usuário.
                 * @param {string} messageText O texto da mensagem a ser enviada.
                 * @returns {boolean} True se a mensagem foi enviada, false se foi abortada.
                 */
                async function sendBotMessageIfAllowed(messageText) {
                    // Antes de enviar, verifica se o fluxo atual foi interrompido por uma mensagem mais recente do usuário
                    const latestState = chatStates.get(chatId);
                    // Se a flag de interrupção estiver definida E o timestamp da mensagem que causou a interrupção
                    // for mais novo que o timestamp da mensagem que iniciou esta resposta do bot,
                    // então devemos abortar.
                    if (latestState && latestState.interrupted && latestState.lastUserMessageTimestamp > currentMsgTimestamp) {
                        console.log(`Resposta abortada para ${chatId}: Nova mensagem do usuário detectada.`);
                        return false; // Indica que a mensagem não foi enviada
                    }
                    await sock.sendMessage(chatId, { text: messageText });
                    return true; // Indica que a mensagem foi enviada
                }
        
                /**
                 * Cria um atraso e simula digitação, verificando antes se a conversa foi interrompida.
                 * @param {number} delayMs O tempo de atraso em milissegundos.
                 * @returns {boolean} True se a simulação de digitação foi realizada, false se foi abortada.
                 */
                async function delayAndType(delayMs) {
                    await delay(delayMs);
                    const latestState = chatStates.get(chatId);
                    // Verifica novamente após o atraso se uma nova mensagem do usuário chegou
                    if (latestState && latestState.interrupted && latestState.lastUserMessageTimestamp > currentMsgTimestamp) {
                        console.log(`Simulação de digitação abortada para ${chatId}: Nova mensagem do usuário detectada.`);
                        return false; // Aborta o estado de digitação
                    }
                    await sock.sendPresenceUpdate("composing", chatId); // Simula digitação
                    await delay(2000); // Atraso adicional para a digitação ser visível
                    await sock.sendPresenceUpdate("paused", chatId); // Pausa a digitação
                    return true;
                }
        
                // --- Lógica para "Falar com um atendente" (Opção 5) - ALTA PRIORIDADE ---
                // Este bloco deve ser verificado logo no início para garantir que funcione a qualquer momento.
                if (messageBody === "5" || messageBody.match(/(falar com atendente|falar com consultor|quero falar|atendimento humano|suporte|ajuda|quero contratar)/i)) {
                    console.log("Detectada intenção de falar com atendente/consultor (Opção 5 ou palavras-chave).");
                    if (!(await delayAndType(1500))) return;
                    if (!(await sendBotMessageIfAllowed("Vou transferir o seu atendimento para um de nossos consultores, peço que aguarde um momento. Em breve alguém entrará em contato para te ajudar!"))) return;
                    
                    // ###############################################################
                    // NOVO: Notifica o atendente sobre a solicitação do cliente
                    const clientPhoneNumber = chatId.replace("@s.whatsapp.net", ""); // Remove o sufixo para ter o número puro
                    await sock.sendMessage(SUPPORT_AGENT_NUMBER, 
                        { text: `NOVO ATENDIMENTO SOLICITADO:\n\nUm cliente solicitou falar com um atendente. Por favor, entre em contato com ele:\n\nNúmero: wa.me/${clientPhoneNumber}\nNome: ${name}\n\nÚltima mensagem do cliente: "${messageBody}"` }
                    );
                    console.log(`Notificação de atendimento enviada para ${SUPPORT_AGENT_NUMBER}.`);
                    // ###############################################################
        
                    // *** MUDANÇA AQUI: Define handoff = true em vez de deletar o estado ***
                    currentState.handoff = true;
                    currentState.handoffAcknowledged = false; // Reset para caso o cliente volte a conversar depois de um tempo
                    chatStates.set(chatId, currentState); // Salva o estado atualizado
                    return; // Para o processamento da mensagem imediatamente
                }
        
                // --- Nova lógica para "Vagas de Emprego / RH" ---
                // Verifica se a mensagem contém palavras-chave relacionadas a emprego
                const jobKeywords = /(vaga|emprego|trabalho|oportunidade|curriculo|rh|recursos humanos)/i;
                if (messageBody.match(jobKeywords)) {
                    console.log("Detectada intenção de vaga de emprego/RH. Transferindo para o RH.");
                    if (!(await delayAndType(1500))) return;
                    if (!(await sendBotMessageIfAllowed("Entendi. Para assuntos relacionados a vagas de emprego e oportunidades de trabalho, vou transferir o seu atendimento para o nosso departamento de Recursos Humanos. Por favor, aguarde um momento."))) return;
                    
                    // ###############################################################
                    // NOVO: Notifica o RH sobre a solicitação do cliente (ajuste o número se for um RH diferente)
                    const clientPhoneNumber = chatId.replace("@s.whatsapp.net", ""); 
                    await sock.sendMessage(SUPPORT_AGENT_NUMBER, // Usando o mesmo número de suporte, ou crie uma constante para o RH
                        { text: `SOLICITAÇÃO DE RH:\n\nUm cliente está perguntando sobre vagas de emprego ou RH. Por favor, entre em contato com ele:\n\nNúmero: wa.me/${clientPhoneNumber}\nNome: ${name}\n\nÚltima mensagem do cliente: "${messageBody}"` }
                    );
                    console.log(`Notificação de atendimento enviada para ${SUPPORT_AGENT_NUMBER}.`);
                    // ###############################################################
        
                    currentState.handoff = true;
                    currentState.handoffAcknowledged = false;
                    chatStates.set(chatId, currentState);
                    return;
                }
        
                // --- Lógica principal do funil de atendimento ---
                if (!currentState.stage) {
                    // Primeira interação
                    if (!(await delayAndType(1500))) return;
                    if (!(await sendBotMessageIfAllowed(`Olá ${name}! Eu sou o assistente virtual da [Nome da Empresa].\n\nComo posso te ajudar hoje?\n\n*1.* Conhecer os serviços\n*2.* Solicitar um orçamento\n*3.* Falar com um atendente\n*4.* Outros assuntos`))) return;
                    currentState.stage = "initial";
                } else if (currentState.stage === "initial") {
                    switch (messageBody) {
                        case "1":
                            if (!(await delayAndType(1000))) return;
                            if (!(await sendBotMessageIfAllowed("Nós oferecemos uma ampla gama de serviços de limpeza e conservação. Para qual tipo de ambiente você busca nossos serviços?\n\n*1.* Escritórios\n*2.* Condomínios\n*3.* Residências\n*4.* Outros (Pós-obra, Hospitalar, Shopping, Fachadas, Pisos, Jardinagem)"))) return;
                            currentState.stage = "service_type_selection";
                            break;
                        case "2":
                            if (!(await delayAndType(1000))) return;
                            if (!(await sendBotMessageIfAllowed("Para solicitar um orçamento, preciso de algumas informações. Qual tipo de serviço você está buscando?\n\n(Você pode digitar o nome do serviço ou o número correspondente na nossa lista de serviços, se já souber.)"))) return;
                            currentState.stage = "request_quote_service_name";
                            break;
                        case "3":
                            // Já tratado no bloco de alta prioridade acima
                            break;
                        case "4":
                            if (!(await delayAndType(1000))) return;
                            if (!(await sendBotMessageIfAllowed("Para outros assuntos, por favor, descreva brevemente sua necessidade para que eu possa direcioná-lo ao setor correto."))) return;
                            currentState.stage = "other_matters";
                            break;
                        default:
                            if (!(await delayAndType(1000))) return;
                            if (!(await sendBotMessageIfAllowed("Desculpe, não entendi. Por favor, escolha uma das opções digitando o número correspondente:\n\n*1.* Conhecer os serviços\n*2.* Solicitar um orçamento\n*3.* Falar com um atendente\n*4.* Outros assuntos"))) return;
                    }
                } else if (currentState.stage === "service_type_selection") {
                    let servicesToShow = [];
                    let nextStage = "";
                    switch (messageBody) {
                        case "1":
                            servicesToShow = serviceTable.filter(s => s.service.includes("Escritórios"));
                            nextStage = "show_office_services";
                            break;
                        case "2":
                            servicesToShow = serviceTable.filter(s => s.service.includes("Condomínios"));
                            nextStage = "show_condo_services";
                            break;
                        case "3":
                            servicesToShow = serviceTable.filter(s => s.service.includes("Residencial"));
                            nextStage = "show_residential_services";
                            break;
                        case "4":
                            servicesToShow = serviceTable.filter(s =>
                                s.service.includes("Pós-Obra") ||
                                s.service.includes("Hospitalar") ||
                                s.service.includes("Shopping") ||
                                s.service.includes("Fachadas") ||
                                s.service.includes("Pisos") ||
                                s.service.includes("Jardinagem")
                            );
                            nextStage = "show_other_services";
                            break;
                        default:
                            if (!(await delayAndType(1000))) return;
                            if (!(await sendBotMessageIfAllowed("Opção inválida. Por favor, escolha um tipo de ambiente válido:\n\n*1.* Escritórios\n*2.* Condomínios\n*3.* Residências\n*4.* Outros"))) return;
                            return;
                    }

                    if (servicesToShow.length > 0) {
                        let response = "Aqui estão os serviços que oferecemos para esse tipo de ambiente:\n\n";
                        servicesToShow.forEach(s => {
                            response += `*${s.id}.* ${s.service}: ${s.description}\n`;
                        });
                        response += "\nPara mais detalhes sobre um serviço específico ou para solicitar um orçamento, digite o NÚMERO do serviço ou o nome completo.";
                        if (!(await delayAndType(1500))) return;
                        if (!(await sendBotMessageIfAllowed(response))) return;
                        currentState.stage = nextStage; // Mantém o estado para permitir seleção de serviço
                    } else {
                        if (!(await delayAndType(1000))) return;
                        if (!(await sendBotMessageIfAllowed("Não encontrei serviços para essa categoria. Por favor, tente outra opção ou digite '3' para falar com um atendente."))) return;
                        currentState.stage = "initial"; // Volta para o início
                    }
                } else if (currentState.stage.startsWith("show_")) {
                    const selectedService = findMatchingService(messageBody);
                    if (selectedService) {
                        let response = `*Serviço Selecionado: ${selectedService.service}*\n\n`;
                        response += `*Descrição:* ${selectedService.description}\n`;
                        response += `*Frequência Comum:* ${selectedService.frequency}\n`;
                        response += `*Valores Estimados:*\n`;
                        if (selectedService.daily && selectedService.daily !== "N/A") response += `  Diário: R$ ${selectedService.daily}\n`;
                        if (selectedService.weekly && selectedService.weekly !== "N/A") response += `  Semanal: R$ ${selectedService.weekly}\n`;
                        if (selectedService.monthly && selectedService.monthly !== "N/A") response += `  Mensal: R$ ${selectedService.monthly}\n`;
                        response += `*Observações:* ${selectedService.observations}\n\n`;
                        response += "Gostaria de solicitar um orçamento para este serviço ou voltar ao menu principal?\n\n*1.* Solicitar orçamento\n*2.* Voltar ao menu principal";
                        if (!(await delayAndType(1500))) return;
                        if (!(await sendBotMessageIfAllowed(response))) return;
                        currentState.selectedService = selectedService; // Armazena o serviço selecionado
                        currentState.stage = "service_details_action";
                    } else {
                        if (!(await delayAndType(1000))) return;
                        if (!(await sendBotMessageIfAllowed("Não consegui encontrar o serviço. Por favor, digite o NÚMERO ou o nome completo do serviço da lista, ou '2' para voltar ao menu principal."))) return;
                    }
                } else if (currentState.stage === "service_details_action") {
                    if (messageBody === "1") {
                        if (!(await delayAndType(1000))) return;
                        if (!(await sendBotMessageIfAllowed(`Ótimo! Para o serviço de *${currentState.selectedService.service}*, qual a frequência desejada (diária, semanal, quinzenal, mensal, pontual)?`))) return;
                        currentState.stage = "request_quote_frequency";
                    } else if (messageBody === "2") {
                        if (!(await delayAndType(1000))) return;
                        if (!(await sendBotMessageIfAllowed("Voltando ao menu principal.\n\nComo posso te ajudar hoje?\n\n*1.* Conhecer os serviços\n*2.* Solicitar um orçamento\n*3.* Falar com um atendente\n*4.* Outros assuntos"))) return;
                        currentState.stage = "initial";
                        delete currentState.selectedService; // Limpa o serviço selecionado
                    } else {
                        if (!(await delayAndType(1000))) return;
                        if (!(await sendBotMessageIfAllowed("Opção inválida. Por favor, digite '1' para solicitar orçamento ou '2' para voltar ao menu principal."))) return;
                    }
                } else if (currentState.stage === "request_quote_service_name") {
                    const selectedService = findMatchingService(messageBody);
                    if (selectedService) {
                        currentState.selectedService = selectedService;
                        if (!(await delayAndType(1000))) return;
                        if (!(await sendBotMessageIfAllowed(`Você selecionou o serviço de *${selectedService.service}*. Qual a frequência desejada (diária, semanal, quinzenal, mensal, pontual)?`))) return;
                        currentState.stage = "request_quote_frequency";
                    } else {
                        if (!(await delayAndType(1000))) return;
                        if (!(await sendBotMessageIfAllowed("Não consegui encontrar o serviço. Por favor, digite o nome completo do serviço ou '3' para falar com um atendente."))) return;
                    }
                } else if (currentState.stage === "request_quote_frequency") {
                    const lowerCaseMessage = messageBody.toLowerCase();
                    let frequencyMatched = false;

                    for (const freqType in frequencyKeywords) {
                        if (matchesFrequency(lowerCaseMessage, frequencyKeywords[freqType])) {
                            currentState.requestedFrequency = freqType;
                            frequencyMatched = true;
                            break;
                        }
                    }

                    if (frequencyMatched) {
                        if (!(await delayAndType(1000))) return;
                        if (!(await sendBotMessageIfAllowed(`Certo, para o serviço de *${currentState.selectedService.service}* com frequência *${currentState.requestedFrequency}*, qual o tamanho aproximado da área em m²?`))) return;
                        currentState.stage = "request_quote_area";
                    } else {
                        if (!(await delayAndType(1000))) return;
                        if (!(await sendBotMessageIfAllowed("Não entendi a frequência. Por favor, digite uma das opções: diária, semanal, quinzenal, mensal ou pontual."))) return;
                    }
                } else if (currentState.stage === "request_quote_area") {
                    const area = parseInt(messageBody);
                    if (!isNaN(area) && area > 0) {
                        currentState.requestedArea = area;
                        if (!(await delayAndType(1000))) return;
                        if (!(await sendBotMessageIfAllowed("Entendido. Por favor, informe seu nome completo para o orçamento."))) return;
                        currentState.stage = "request_quote_name";
                    } else {
                        if (!(await delayAndType(1000))) return;
                        if (!(await sendBotMessageIfAllowed("Por favor, digite um número válido para a área em m²."))) return;
                    }
                } else if (currentState.stage === "request_quote_name") {
                    currentState.requesterName = messageBody;
                    if (!(await delayAndType(1000))) return;
                    if (!(await sendBotMessageIfAllowed("Para finalizar, por favor, informe seu e-mail para que possamos enviar o orçamento."))) return;
                    currentState.stage = "request_quote_email";
                } else if (currentState.stage === "request_quote_email") {
                    const emailRegex = /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/;
                    if (emailRegex.test(messageBody)) {
                        currentState.requesterEmail = messageBody;
                        if (!(await delayAndType(1000))) return;
                        if (!(await sendBotMessageIfAllowed("Obrigado! Seu pedido de orçamento foi registrado. Um de nossos consultores entrará em contato em breve para fornecer os detalhes.\n\nSe precisar de mais alguma coisa, digite 'menu' para voltar ao início."))) return;

                        // ###############################################################
                        // NOVO: Notifica o atendente sobre o novo orçamento
                        const clientPhoneNumber = chatId.replace("@s.whatsapp.net", ""); 
                        await sock.sendMessage(SUPPORT_AGENT_NUMBER, 
                            { text: `NOVO ORÇAMENTO SOLICITADO:\n\nServiço: ${currentState.selectedService.service}\nFrequência: ${currentState.requestedFrequency}\nÁrea: ${currentState.requestedArea}m²\nNome: ${currentState.requesterName}\nEmail: ${currentState.requesterEmail}\nNúmero: wa.me/${clientPhoneNumber}` }
                        );
                        console.log(`Notificação de orçamento enviada para ${SUPPORT_AGENT_NUMBER}.`);
                        // ###############################################################

                        chatStates.delete(chatId); // Limpa o estado após o orçamento
                    } else {
                        if (!(await delayAndType(1000))) return;
                        if (!(await sendBotMessageIfAllowed("E-mail inválido. Por favor, digite um e-mail válido."))) return;
                    }
                } else if (currentState.stage === "other_matters") {
                    if (!(await delayAndType(1000))) return;
                    if (!(await sendBotMessageIfAllowed("Agradeço a sua mensagem. Vou encaminhá-la para a equipe responsável e em breve alguém entrará em contato com você para tratar deste assunto.\n\nSe precisar de mais alguma coisa, digite 'menu' para voltar ao início."))) return;

                    // ###############################################################
                    // NOVO: Notifica o atendente sobre outros assuntos
                    const clientPhoneNumber = chatId.replace("@s.whatsapp.net", ""); 
                    await sock.sendMessage(SUPPORT_AGENT_NUMBER, 
                        { text: `NOVO ASSUNTO (OUTROS):\n\nCliente: ${name}\nNúmero: wa.me/${clientPhoneNumber}\nAssunto: "${messageBody}"` }
                    );
                    console.log(`Notificação de outros assuntos enviada para ${SUPPORT_AGENT_NUMBER}.`);
                    // ###############################################################

                    chatStates.delete(chatId); // Limpa o estado
                }

                // Se o usuário digitar "menu" a qualquer momento, volta para o início
                if (messageBody.toLowerCase() === "menu") {
                    if (!(await delayAndType(1000))) return;
                    if (!(await sendBotMessageIfAllowed(`Olá ${name}! Eu sou o assistente virtual da [Nome da Empresa].\n\nComo posso te ajudar hoje?\n\n*1.* Conhecer os serviços\n*2.* Solicitar um orçamento\n*3.* Falar com um atendente\n*4.* Outros assuntos`))) return;
                    currentState.stage = "initial";
                    // Limpa outros estados relevantes para um novo início
                    delete currentState.selectedService;
                    delete currentState.requestedFrequency;
                    delete currentState.requestedArea;
                    delete currentState.requesterName;
                    delete currentState.requesterEmail;
                }

            } catch (error) {
                console.error("Erro ao processar mensagem:", error);
                // Em caso de erro, remove o chat do processamento e informa o usuário
                processingChats.delete(chatId);
                chatStates.delete(chatId); // Limpa o estado para evitar loops de erro
                await sock.sendMessage(chatId, { text: "Desculpe, ocorreu um erro ao processar sua solicitação. Por favor, tente novamente ou digite '3' para falar com um atendente." });
            } finally {
                // Garante que o chat seja removido do conjunto de processamento após a conclusão ou erro
                processingChats.delete(chatId);
            }
        }
    });
}

const startBot = async () => {
  while (true) {
    try {
      await connectToWhatsApp();
      break; // Sai do loop se a conexão for bem sucedida
    } catch (e) {
      console.error("Erro na conexão principal, tentando reconectar em 5s...", e);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
};

startBot();
