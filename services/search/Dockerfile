# search service
FROM golang:1.24-alpine AS build
WORKDIR /src
COPY packages/go-common /packages/go-common
COPY packages/proto /packages/proto
COPY services/search .
RUN go mod download && CGO_ENABLED=0 go build -o /search ./cmd/server

FROM alpine:3.20
RUN apk add --no-cache ca-certificates
COPY --from=build /search /usr/local/bin/search
ENV HTTP_PORT=8003
EXPOSE 8003
CMD ["search"]
