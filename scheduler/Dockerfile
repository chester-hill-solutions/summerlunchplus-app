FROM alpine:3.20

RUN apk add --no-cache bash curl ca-certificates

ARG SUPERCRONIC_VERSION=v0.2.29
RUN curl -fsSLo /usr/local/bin/supercronic "https://github.com/aptible/supercronic/releases/download/${SUPERCRONIC_VERSION}/supercronic-linux-amd64" \
  && chmod +x /usr/local/bin/supercronic

WORKDIR /app

COPY crontab /app/crontab
COPY scripts /app/scripts

CMD ["/usr/local/bin/supercronic", "/app/crontab"]
