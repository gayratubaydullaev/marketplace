# cart service
FROM golang:1.24-alpine AS build
WORKDIR /src
COPY packages/go-common /packages/go-common
COPY packages/proto /packages/proto
COPY services/cart .
RUN go mod download && CGO_ENABLED=0 go build -o /cart ./cmd/server

FROM alpine:3.20
RUN apk add --no-cache ca-certificates
COPY --from=build /cart /usr/local/bin/cart
ENV HTTP_PORT=8004
EXPOSE 8004
CMD ["cart"]
