FROM n8nio/n8n@sha256:d055b7a9ea7da77fbcac60f17ba8517657648b0915a36dde818e44892a718964 AS dependencies
USER root
WORKDIR /opt/leadgen
COPY scripts/dashboard/package.json scripts/dashboard/package-lock.json ./scripts/dashboard/
RUN npm --prefix scripts/dashboard ci --omit=dev --ignore-scripts --no-audit --no-fund

FROM n8nio/n8n@sha256:d055b7a9ea7da77fbcac60f17ba8517657648b0915a36dde818e44892a718964
USER root
WORKDIR /opt/leadgen
COPY --chown=node:node scripts/ ./scripts/
COPY --chown=node:node workflows/ ./workflows/
COPY --chown=node:node dashboard/build/ ./dashboard/build/
COPY --chown=node:node dashboard/src/site.json dashboard/src/routeMetadata.js dashboard/src/release.json ./dashboard/src/
COPY --from=dependencies --chown=node:node /opt/leadgen/scripts/dashboard/node_modules/ ./scripts/dashboard/node_modules/
RUN mkdir -p .local/gmail-onboarding .local/smtp-provisioning .local/campaign-slices .local/sms-gate .local/calling-accounts .local/calling-tools-20261028 && chown -R node:node .local
USER node
ENV DASHBOARD_BIND_HOST=0.0.0.0
ENTRYPOINT ["node"]
CMD ["scripts/dashboard/container-entry.cjs"]
