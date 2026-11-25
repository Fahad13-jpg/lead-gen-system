FROM n8nio/n8n@sha256:d055b7a9ea7da77fbcac60f17ba8517657648b0915a36dde818e44892a718964
USER node
COPY --chown=node:node scripts/operations/n8n-entry.cjs /opt/leadgen/n8n-entry.cjs
COPY --chown=node:node scripts/network/gmail-ipv4.cjs /opt/leadgen/gmail-ipv4.cjs
ENTRYPOINT ["node"]
CMD ["/opt/leadgen/n8n-entry.cjs"]
