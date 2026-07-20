# notifications service
FROM golang:1.24-alpine AS build
WORKDIR /src
COPY packages/go-common /packages/go-common
COPY packages/proto /packages/proto
COPY services/notifications .
RUN go mod download && CGO_ENABLED=0 go build -o /notifications ./cmd/server

FROM alpine:3.20
RUN apk add --no-cache ca-certificates
COPY --from=build /notifications /usr/local/bin/notifications
ENV HTTP_PORT=8009
EXPOSE 8009
CMD ["notifications"]
