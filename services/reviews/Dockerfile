# reviews service
FROM golang:1.24-alpine AS build
WORKDIR /src
COPY packages/go-common /packages/go-common
COPY packages/proto /packages/proto
COPY services/reviews .
RUN go mod download && CGO_ENABLED=0 go build -o /reviews ./cmd/server

FROM alpine:3.20
RUN apk add --no-cache ca-certificates
COPY --from=build /reviews /usr/local/bin/reviews
ENV HTTP_PORT=8008
EXPOSE 8008
CMD ["reviews"]
