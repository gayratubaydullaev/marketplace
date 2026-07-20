package grpcx

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"

	catalogpb "github.com/gayrat/marketplace/packages/proto/gen/catalog"
	"github.com/gayrat/marketplace/services/catalog/internal/model"
	"github.com/gayrat/marketplace/services/catalog/internal/repository"
)

// Server exposes CatalogService RPCs over JSON HTTP on GRPC_PORT (default 9002).
// Full protobuf wire format requires protoc; this stub keeps the same method surface.
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

// ListenAndServe starts the JSON RPC listener (proto surface) in a goroutine.
func ListenAndServe(repo *repository.Catalog) {
	port := os.Getenv("GRPC_PORT")
	if port == "" {
		port = "9002"
	}
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
		log.Printf("catalog-service proto RPC (JSON) on :%s", port)
		if err := http.ListenAndServe(":"+port, mux); err != nil {
			log.Printf("catalog proto RPC: %v", err)
		}
	}()
}
