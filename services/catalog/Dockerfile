# catalog service
FROM golang:1.24-alpine AS build
WORKDIR /src
COPY packages/go-common /packages/go-common
COPY packages/proto /packages/proto
COPY services/catalog .
RUN go mod download && CGO_ENABLED=0 go build -o /catalog ./cmd/server

FROM alpine:3.20
RUN apk add --no-cache ca-certificates
COPY --from=build /catalog /usr/local/bin/catalog
ENV HTTP_PORT=8002
EXPOSE 8002
CMD ["catalog"]
