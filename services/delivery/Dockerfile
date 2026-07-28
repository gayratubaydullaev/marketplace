# Delivery Service
FROM golang:1.24-alpine AS build
WORKDIR /src
COPY packages/go-common /packages/go-common
COPY services/delivery .
RUN go mod download && CGO_ENABLED=0 go build -o /delivery ./cmd/server

FROM alpine:3.20
RUN apk add --no-cache ca-certificates
COPY --from=build /delivery /usr/local/bin/delivery
ENV HTTP_PORT=8013
EXPOSE 8013
CMD ["delivery"]
