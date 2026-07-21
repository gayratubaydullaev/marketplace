package grpcx

import (
	"context"
	"encoding/json"
	"log"
	"net"
	"net/http"
	"os"

	catalogpb "github.com/gayrat/marketplace/packages/proto/gen/catalog"
	"github.com/gayrat/marketplace/services/catalog/internal/model"
	"github.com/gayrat/marketplace/services/catalog/internal/repository"
	"google.golang.org/grpc"
	"google.golang.org/grpc/encoding"
)

// Server exposes CatalogService RPCs through both the legacy JSON HTTP listener
// and native gRPC with an explicitly selected JSON codec.
type Server struct {
	repo *repository.Catalog
}

func New(repo *repository.Catalog) *Server {
	return &Server{repo: repo}
}

func (s *Server) GetProduct(_ context.Context, req *catalogpb.GetProductRequest) (*catalogpb.Product, error) {
	p, err := s.repo.GetProductBySlug(req.TenantId, req.IdOrSlug)
	if err != nil {
		p, err = s.repo.GetProductByID(req.TenantId, req.IdOrSlug)
	}
	if err != nil {
		return nil, err
	}
	return toPB(p), nil
}

func (s *Server) ListProducts(_ context.Context, req *catalogpb.ListProductsRequest) (*catalogpb.ProductList, error) {
	limit := int(req.Limit)
	if limit <= 0 {
		limit = 20
	}
	page := int(req.Page)
	if page < 1 {
		page = 1
	}
	status := req.Status
	if status == "" {
		status = "active"
	}
	items, total, err := s.repo.ListProducts(req.TenantId, repository.ProductListOpts{
		Status: status,
		Limit:  limit,
		Offset: (page - 1) * limit,
	})
	if err != nil {
		return nil, err
	}
	out := &catalogpb.ProductList{Total: int32(total)}
	for i := range items {
		out.Items = append(out.Items, toPB(items[i]))
	}
	return out, nil
}

func (s *Server) CreateProduct(context.Context, *catalogpb.CreateProductRequest) (*catalogpb.Product, error) {
	return nil, errUnimplemented("CreateProduct")
}

func (s *Server) UpdateProduct(context.Context, *catalogpb.UpdateProductRequest) (*catalogpb.Product, error) {
	return nil, errUnimplemented("UpdateProduct")
}

func (s *Server) DeleteProduct(context.Context, *catalogpb.DeleteProductRequest) (*catalogpb.Empty, error) {
	return nil, errUnimplemented("DeleteProduct")
}

func (s *Server) UpdateInventory(_ context.Context, req *catalogpb.UpdateInventoryRequest) (*catalogpb.InventoryResponse, error) {
	qty, err := s.repo.AdjustInventory(req.TenantId, req.ProductId, int(req.Delta))
	if err != nil {
		return nil, err
	}
	return &catalogpb.InventoryResponse{ProductId: req.ProductId, Quantity: int32(qty)}, nil
}

type rpcError string

func (e rpcError) Error() string { return string(e) }

func errUnimplemented(method string) error {
	return rpcError("unimplemented: " + method)
}

func toPB(p model.Product) *catalogpb.Product {
	name := p.Slug
	var tr map[string]map[string]string
	if json.Unmarshal(p.Translations, &tr) == nil {
		if uz, ok := tr["uz"]; ok && uz["name"] != "" {
			name = uz["name"]
		}
	}
	vendor := ""
	if p.VendorID != nil {
		vendor = *p.VendorID
	}
	return &catalogpb.Product{
		Id: p.ID, TenantId: p.TenantID, VendorId: vendor, Name: name, Slug: p.Slug,
		Price: p.Price, InventoryQuantity: int32(p.InventoryQuantity), Status: p.Status, Currency: p.Currency,
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

type jsonCodec struct{}

func (jsonCodec) Name() string { return "json" }
func (jsonCodec) Marshal(v any) ([]byte, error) {
	return json.Marshal(v)
}
func (jsonCodec) Unmarshal(data []byte, v any) error {
	return json.Unmarshal(data, v)
}

// ListenAndServe starts legacy JSON HTTP RPC on GRPC_PORT (9002) and native
// gRPC JSON RPC on GRPC_NATIVE_PORT (9003). Native callers must set the
// `json` content subtype (e.g. grpc.CallContentSubtype("json")).
func ListenAndServe(repo *repository.Catalog) {
	httpPort := os.Getenv("GRPC_PORT")
	if httpPort == "" {
		httpPort = "9002"
	}
	nativePort := os.Getenv("GRPC_NATIVE_PORT")
	if nativePort == "" {
		nativePort = "9003"
	}
	encoding.RegisterCodec(jsonCodec{})
	srv := New(repo)
	mux := http.NewServeMux()
	mux.HandleFunc("/catalog.CatalogService/GetProduct", func(w http.ResponseWriter, r *http.Request) {
		var req catalogpb.GetProductRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, 400, map[string]string{"error": err.Error()})
			return
		}
		out, err := srv.GetProduct(r.Context(), &req)
		if err != nil {
			writeJSON(w, 404, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, 200, out)
	})
	mux.HandleFunc("/catalog.CatalogService/ListProducts", func(w http.ResponseWriter, r *http.Request) {
		var req catalogpb.ListProductsRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, 400, map[string]string{"error": err.Error()})
			return
		}
		out, err := srv.ListProducts(r.Context(), &req)
		if err != nil {
			writeJSON(w, 500, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, 200, out)
	})
	mux.HandleFunc("/catalog.CatalogService/UpdateInventory", func(w http.ResponseWriter, r *http.Request) {
		var req catalogpb.UpdateInventoryRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, 400, map[string]string{"error": err.Error()})
			return
		}
		out, err := srv.UpdateInventory(r.Context(), &req)
		if err != nil {
			writeJSON(w, 400, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, 200, out)
	})
	mux.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, 200, map[string]string{"status": "ok", "proto": "catalog"})
	})

	go func() {
		log.Printf("catalog-service legacy JSON RPC on :%s", httpPort)
		if err := http.ListenAndServe(":"+httpPort, mux); err != nil {
			log.Printf("catalog proto RPC: %v", err)
		}
	}()
	go func() {
		listener, err := net.Listen("tcp", ":"+nativePort)
		if err != nil {
			log.Printf("catalog native gRPC listen: %v", err)
			return
		}
		grpcServer := grpc.NewServer()
		catalogpb.RegisterCatalogServiceServer(grpcServer, srv)
		log.Printf("catalog-service native gRPC (JSON codec) on :%s", nativePort)
		if err := grpcServer.Serve(listener); err != nil {
			log.Printf("catalog native gRPC: %v", err)
		}
	}()
}
