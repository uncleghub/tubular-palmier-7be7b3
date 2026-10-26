FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN --mount=type=secret,id=proxy_ca,mode=0444 if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; npm ci --no-audit --no-fund
COPY . .
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_APP_NAME="Graham Unlocked AI Studio"
ARG NEXT_PUBLIC_TAGLINE="Create images. Generate videos. Unlock your ideas."
ARG NEXT_PUBLIC_SUPPORT_EMAIL
ARG NEXT_PUBLIC_ACCENT
ARG APP_URL=http://localhost:3000
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME NEXT_PUBLIC_TAGLINE=$NEXT_PUBLIC_TAGLINE NEXT_PUBLIC_SUPPORT_EMAIL=$NEXT_PUBLIC_SUPPORT_EMAIL NEXT_PUBLIC_ACCENT=$NEXT_PUBLIC_ACCENT APP_URL=$APP_URL
RUN npm run build
FROM node:24-bookworm-slim AS runtime
RUN --mount=type=secret,id=proxy_ca,mode=0444 if [ -f /run/secrets/proxy_ca ]; then printf 'Acquire::https::CaInfo "/run/secrets/proxy_ca";\n' > /etc/apt/apt.conf.d/99-cloud-ca; fi; sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list.d/debian.sources && apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/* /etc/apt/apt.conf.d/99-cloud-ca
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app ./
RUN mkdir -p /app/.data && chown node:node /app/.data
USER node
EXPOSE 3000
CMD ["npm","run","start"]
