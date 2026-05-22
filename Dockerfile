FROM node:20-slim

# Define o fuso horário no sistema
ENV TZ=America/Recife

RUN apt-get update && apt-get install -y \
    curl \
    git \
    tzdata \ 
    && ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copia os arquivos de dependências
COPY package*.json ./

# Com o git instalado, este passo não vai mais dar erro de 'enoent'
RUN npm install

# Copia o restante dos arquivos
COPY . .

CMD ["node", "index.js"]