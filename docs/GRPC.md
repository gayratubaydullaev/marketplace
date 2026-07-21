# Catalog gRPC / Proto RPC

Proto: `packages/proto/catalog/catalog.proto`

Generated stub (typed Go API, no protoc required):
`packages/proto/gen/catalog/catalog.pb.go`

Runtime: catalog listens on **HTTP `:8002`**, the legacy JSON HTTP RPC on
**`:9002`** (`GRPC_PORT`, methods under `/catalog.CatalogService/*`), and a
native gRPC listener on **`:9003`** (`GRPC_NATIVE_PORT`).

The native listener uses the `json` gRPC content subtype because the checked-in
bindings are hand-maintained and do not require `protoc`. Clients should invoke
the normal `catalog.CatalogService/*` methods with
`grpc.CallContentSubtype("json")`; for example, a `GetProduct` call targets
`/catalog.CatalogService/GetProduct`.

The legacy listener remains available for existing clients. New internal
callers should use native gRPC.
