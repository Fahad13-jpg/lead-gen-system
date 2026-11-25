FROM n8nio/n8n@sha256:d055b7a9ea7da77fbcac60f17ba8517657648b0915a36dde818e44892a718964
USER node
COPY --chown=node:node scripts/credential-adapter/ /opt/credential-adapter/
ENTRYPOINT ["node"]
CMD ["/opt/credential-adapter/server.cjs"]
