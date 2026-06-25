FROM node:20-slim

# Install compilation tools for sqlite3 build
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./

RUN npm install --only=production

COPY proxy_wrapper.js admin.html ./
COPY sdk ./sdk

EXPOSE 8317

ENV PORT=8317
ENV TARGET_HOST=127.0.0.1
ENV TARGET_PORT=8319
ENV CONDUCTOR_GEMINI_MODEL=gemini-3.5-flash-low
ENV CLIPROXY_API_KEY=sk-2v5P7lkMzyqoKfprLsk-WYRCtlilAEudjFXZn

CMD ["npm", "start"]
