# Auth Service
FROM golang:1.24-alpine AS build
WORKDIR /src
COPY packages/go-common /packages/go-common
COPY services/auth .
RUN go mod download && CGO_ENABLED=0 go build -o /auth ./cmd/server

FROM alpine:3.20
RUN apk add --no-cache ca-certificates
COPY --from=build /auth /usr/local/bin/auth
ENV HTTP_PORT=8001
EXPOSE 8001
CMD ["auth"]
