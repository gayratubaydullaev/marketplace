# analytics service
FROM golang:1.24-alpine AS build
WORKDIR /src
COPY packages/go-common /packages/go-common
COPY packages/proto /packages/proto
COPY services/analytics .
RUN go mod download && CGO_ENABLED=0 go build -o /analytics ./cmd/server

FROM alpine:3.20
RUN apk add --no-cache ca-certificates
COPY --from=build /analytics /usr/local/bin/analytics
ENV HTTP_PORT=8010
EXPOSE 8010
CMD ["analytics"]
