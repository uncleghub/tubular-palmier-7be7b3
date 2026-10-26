# Bootstrap HTTPS trust from the official Node image's bundled public roots.
# The slim Debian image does not include ca-certificates yet.
FROM node:24-bookworm-slim AS public-trust
RUN node -e 'require("node:fs").writeFileSync("/tmp/public-roots.crt", require("node:tls").rootCertificates.join("\n") + "\n")'

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
COPY --from=public-trust /tmp/public-roots.crt /etc/ssl/certs/ca-certificates.crt
RUN --mount=type=secret,id=proxy_ca,mode=0444 set -eu; \
    if [ -s /run/secrets/proxy_ca ]; then \
      printf '%s\n' 'Acquire::https::CaInfo "/run/secrets/proxy_ca";' > /etc/apt/apt.conf.d/99-cloud-ca; \
    fi; \
    sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list.d/debian.sources; \
    apt-get update --error-on=any; \
    apt-get install -y --no-install-recommends ffmpeg ca-certificates; \
    rm -rf /var/lib/apt/lists/* /etc/apt/apt.conf.d/99-cloud-ca
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app ./
RUN mkdir -p /app/.data && chown node:node /app/.data
USER node
EXPOSE 3000
CMD ["npm","run","start"]
