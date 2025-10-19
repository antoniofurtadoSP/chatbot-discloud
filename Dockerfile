# Usa uma imagem leve e estável do Node.js
FROM node:lts-slim

# Evita prompts de configuração durante a instalação
ENV DEBIAN_FRONTEND=noninteractive

# Define diretório de trabalho padrão
ENV HOME=/home/node
WORKDIR $HOME

# Instala as dependências do projeto
# O Git e Build-Essential serão instalados pelo discloud.config antes deste passo.
COPY package*.json ./
RUN npm install --omit=dev

# Copia o restante dos arquivos do projeto
COPY . .

# Define o comando padrão de inicialização
CMD ["npm", "start"]