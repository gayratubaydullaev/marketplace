# realtime service
FROM golang:1.24-alpine AS build
WORKDIR /src
COPY packages/go-common /packages/go-common
COPY packages/proto /packages/proto
COPY services/realtime .
RUN go mod download && CGO_ENABLED=0 go build -o /realtime ./cmd/server

FROM alpine:3.20
RUN apk add --no-cache ca-certificates
COPY --from=build /realtime /usr/local/bin/realtime
ENV HTTP_PORT=8012
EXPOSE 8012
CMD ["realtime"]
