// Hand-maintained generated-style bindings for marketplace scaffold.
// Source: packages/proto/catalog/catalog.proto
package catalogpb

import (
	"context"

	"google.golang.org/grpc"
)

type Empty struct{}

type GetProductRequest struct {
	TenantId string `json:"tenant_id"`
	IdOrSlug string `json:"id_or_slug"`
}

type ListProductsRequest struct {
	TenantId string `json:"tenant_id"`
	Page     int32  `json:"page"`
	Limit    int32  `json:"limit"`
	Status   string `json:"status"`
}

type CreateProductRequest struct {
	TenantId         string  `json:"tenant_id"`
	CategoryId       string  `json:"category_id"`
	Slug             string  `json:"slug"`
	TranslationsJson string  `json:"translations_json"`
	Price            float64 `json:"price"`
	Currency         string  `json:"currency"`
}

type UpdateProductRequest struct {
	TenantId  string `json:"tenant_id"`
	Id        string `json:"id"`
	PatchJson string `json:"patch_json"`
}

type DeleteProductRequest struct {
	TenantId string `json:"tenant_id"`
	Id       string `json:"id"`
}

type UpdateInventoryRequest struct {
	TenantId  string `json:"tenant_id"`
	ProductId string `json:"product_id"`
	Delta     int32  `json:"delta"`
}

type InventoryResponse struct {
	ProductId string `json:"product_id"`
	Quantity  int32  `json:"quantity"`
}

type Product struct {
	Id                string   `json:"id"`
	TenantId          string   `json:"tenant_id"`
	VendorId          string   `json:"vendor_id"`
	Name              string   `json:"name"`
	Slug              string   `json:"slug"`
	Price             float64  `json:"price"`
	InventoryQuantity int32    `json:"inventory_quantity"`
	Status            string   `json:"status"`
	ImageUrls         []string `json:"image_urls"`
	Currency          string   `json:"currency"`
}

type ProductList struct {
	Items []*Product `json:"items"`
	Total int32      `json:"total"`
}

// CatalogServiceServer mirrors the proto CatalogService RPCs.
type CatalogServiceServer interface {
	GetProduct(ctx context.Context, req *GetProductRequest) (*Product, error)
	ListProducts(ctx context.Context, req *ListProductsRequest) (*ProductList, error)
	CreateProduct(ctx context.Context, req *CreateProductRequest) (*Product, error)
	UpdateProduct(ctx context.Context, req *UpdateProductRequest) (*Product, error)
	DeleteProduct(ctx context.Context, req *DeleteProductRequest) (*Empty, error)
	UpdateInventory(ctx context.Context, req *UpdateInventoryRequest) (*InventoryResponse, error)
}

// RegisterCatalogServiceServer registers the JSON-codec compatible native gRPC
// surface without requiring protoc-generated protobuf message implementations.
func RegisterCatalogServiceServer(s grpc.ServiceRegistrar, srv CatalogServiceServer) {
	s.RegisterService(&CatalogService_ServiceDesc, srv)
}

func _CatalogService_GetProduct_Handler(srv any, ctx context.Context, dec func(any) error, interceptor grpc.UnaryServerInterceptor) (any, error) {
	in := new(GetProductRequest)
	if err := dec(in); err != nil {
		return nil, err
	}
	if interceptor == nil {
		return srv.(CatalogServiceServer).GetProduct(ctx, in)
	}
	info := &grpc.UnaryServerInfo{Server: srv, FullMethod: "/catalog.CatalogService/GetProduct"}
	handler := func(ctx context.Context, req any) (any, error) {
		return srv.(CatalogServiceServer).GetProduct(ctx, req.(*GetProductRequest))
	}
	return interceptor(ctx, in, info, handler)
}

func _CatalogService_ListProducts_Handler(srv any, ctx context.Context, dec func(any) error, interceptor grpc.UnaryServerInterceptor) (any, error) {
	in := new(ListProductsRequest)
	if err := dec(in); err != nil {
		return nil, err
	}
	if interceptor == nil {
		return srv.(CatalogServiceServer).ListProducts(ctx, in)
	}
	info := &grpc.UnaryServerInfo{Server: srv, FullMethod: "/catalog.CatalogService/ListProducts"}
	handler := func(ctx context.Context, req any) (any, error) {
		return srv.(CatalogServiceServer).ListProducts(ctx, req.(*ListProductsRequest))
	}
	return interceptor(ctx, in, info, handler)
}

func _CatalogService_CreateProduct_Handler(srv any, ctx context.Context, dec func(any) error, interceptor grpc.UnaryServerInterceptor) (any, error) {
	in := new(CreateProductRequest)
	if err := dec(in); err != nil {
		return nil, err
	}
	if interceptor == nil {
		return srv.(CatalogServiceServer).CreateProduct(ctx, in)
	}
	info := &grpc.UnaryServerInfo{Server: srv, FullMethod: "/catalog.CatalogService/CreateProduct"}
	handler := func(ctx context.Context, req any) (any, error) {
		return srv.(CatalogServiceServer).CreateProduct(ctx, req.(*CreateProductRequest))
	}
	return interceptor(ctx, in, info, handler)
}

func _CatalogService_UpdateProduct_Handler(srv any, ctx context.Context, dec func(any) error, interceptor grpc.UnaryServerInterceptor) (any, error) {
	in := new(UpdateProductRequest)
	if err := dec(in); err != nil {
		return nil, err
	}
	if interceptor == nil {
		return srv.(CatalogServiceServer).UpdateProduct(ctx, in)
	}
	info := &grpc.UnaryServerInfo{Server: srv, FullMethod: "/catalog.CatalogService/UpdateProduct"}
	handler := func(ctx context.Context, req any) (any, error) {
		return srv.(CatalogServiceServer).UpdateProduct(ctx, req.(*UpdateProductRequest))
	}
	return interceptor(ctx, in, info, handler)
}

func _CatalogService_DeleteProduct_Handler(srv any, ctx context.Context, dec func(any) error, interceptor grpc.UnaryServerInterceptor) (any, error) {
	in := new(DeleteProductRequest)
	if err := dec(in); err != nil {
		return nil, err
	}
	if interceptor == nil {
		return srv.(CatalogServiceServer).DeleteProduct(ctx, in)
	}
	info := &grpc.UnaryServerInfo{Server: srv, FullMethod: "/catalog.CatalogService/DeleteProduct"}
	handler := func(ctx context.Context, req any) (any, error) {
		return srv.(CatalogServiceServer).DeleteProduct(ctx, req.(*DeleteProductRequest))
	}
	return interceptor(ctx, in, info, handler)
}

func _CatalogService_UpdateInventory_Handler(srv any, ctx context.Context, dec func(any) error, interceptor grpc.UnaryServerInterceptor) (any, error) {
	in := new(UpdateInventoryRequest)
	if err := dec(in); err != nil {
		return nil, err
	}
	if interceptor == nil {
		return srv.(CatalogServiceServer).UpdateInventory(ctx, in)
	}
	info := &grpc.UnaryServerInfo{Server: srv, FullMethod: "/catalog.CatalogService/UpdateInventory"}
	handler := func(ctx context.Context, req any) (any, error) {
		return srv.(CatalogServiceServer).UpdateInventory(ctx, req.(*UpdateInventoryRequest))
	}
	return interceptor(ctx, in, info, handler)
}

var CatalogService_ServiceDesc = grpc.ServiceDesc{
	ServiceName: "catalog.CatalogService",
	HandlerType: (*CatalogServiceServer)(nil),
	Methods: []grpc.MethodDesc{
		{MethodName: "GetProduct", Handler: _CatalogService_GetProduct_Handler},
		{MethodName: "ListProducts", Handler: _CatalogService_ListProducts_Handler},
		{MethodName: "CreateProduct", Handler: _CatalogService_CreateProduct_Handler},
		{MethodName: "UpdateProduct", Handler: _CatalogService_UpdateProduct_Handler},
		{MethodName: "DeleteProduct", Handler: _CatalogService_DeleteProduct_Handler},
		{MethodName: "UpdateInventory", Handler: _CatalogService_UpdateInventory_Handler},
	},
	Streams:  []grpc.StreamDesc{},
	Metadata: "catalog/catalog.proto",
}
