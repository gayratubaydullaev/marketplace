# Catalog gRPC / Proto RPC

Proto: `packages/proto/catalog/catalog.proto`

Generated stub (typed Go API, no protoc required):
`packages/proto/gen/catalog/catalog.pb.go`

Runtime: catalog listens on **HTTP `:8002`** and a thin **JSON proto RPC on `:9002`**
(`GRPC_PORT`, methods under `/catalog.CatalogService/*`).

Full protobuf wire format (optional):
```bash
protoc --go_out=packages/proto/gen --go-grpc_out=packages/proto/gen \
  packages/proto/catalog/catalog.proto
```
