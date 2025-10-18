# Usa uma imagem leve e estável do Node.js
FROM node:lts-slim

# Evita prompts de configuração durante a instalação
ENV DEBIAN_FRONTEND=noninteractive

# Define diretório de trabalho padrão
ENV HOME=/home/node
WORKDIR $HOME

# Instala o Git e dependências básicas necessárias para o npm funcionar corretamente
RUN apt-get update && apt-get install -y git curl && apt-get clean && rm -rf /var/lib/apt/lists/*

# Copia os arquivos de configuração primeiro (para cache eficiente do Docker)
COPY package*.json ./

# Instala as dependências do projeto
RUN npm install --omit=dev

# Copia o restante dos arquivos do projeto
COPY . .

# Porta padrão (Discloud detecta automaticamente)
EXPOSE 3000

# Define o comando padrão de inicialização
CMD ["npm", "start"]
