# vendor service
FROM golang:1.24-alpine AS build
WORKDIR /src
COPY packages/go-common /packages/go-common
COPY packages/proto /packages/proto
COPY services/vendor .
RUN go mod download && CGO_ENABLED=0 go build -o /vendor ./cmd/server

FROM alpine:3.20
RUN apk add --no-cache ca-certificates
COPY --from=build /vendor /usr/local/bin/vendor
ENV HTTP_PORT=8007
EXPOSE 8007
CMD ["vendor"]
