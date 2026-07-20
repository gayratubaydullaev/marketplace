# orders service
FROM golang:1.24-alpine AS build
WORKDIR /src
COPY packages/go-common /packages/go-common
COPY packages/proto /packages/proto
COPY services/orders .
RUN go mod download && CGO_ENABLED=0 go build -o /orders ./cmd/server

FROM alpine:3.20
RUN apk add --no-cache ca-certificates
COPY --from=build /orders /usr/local/bin/orders
ENV HTTP_PORT=8005
EXPOSE 8005
CMD ["orders"]
