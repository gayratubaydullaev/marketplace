# payments service
FROM golang:1.24-alpine AS build
WORKDIR /src
COPY packages/go-common /packages/go-common
COPY packages/proto /packages/proto
COPY services/payments .
RUN go mod download && CGO_ENABLED=0 go build -o /payments ./cmd/server

FROM alpine:3.20
RUN apk add --no-cache ca-certificates
COPY --from=build /payments /usr/local/bin/payments
ENV HTTP_PORT=8006
EXPOSE 8006
CMD ["payments"]
