FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server.mjs tools.mjs kharcha-coach.html make-demo.mjs make-icons.mjs manifest.webmanifest sw.js icon.svg ./
RUN node make-demo.mjs && node make-icons.mjs
ENV HOST=0.0.0.0 PORT=8787 TRUST_PROXY=1
EXPOSE 8787
# Set ANTHROPIC_API_KEY and ALLOWED_HOSTS (your public hostname) in the host's environment settings.
CMD ["node", "server.mjs"]
