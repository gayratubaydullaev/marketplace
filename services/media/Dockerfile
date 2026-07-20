# media service
FROM golang:1.24-alpine AS build
WORKDIR /src
COPY packages/go-common /packages/go-common
COPY packages/proto /packages/proto
COPY services/media .
RUN go mod download && CGO_ENABLED=0 go build -o /media ./cmd/server

FROM alpine:3.20
RUN apk add --no-cache ca-certificates
COPY --from=build /media /usr/local/bin/media
ENV HTTP_PORT=8011
EXPOSE 8011
CMD ["media"]
