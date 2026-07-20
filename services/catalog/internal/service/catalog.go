package service

import (
	"encoding/csv"
	"encoding/json"
	"io"
	"strconv"

	"github.com/gayrat/marketplace/services/catalog/internal/model"
	"github.com/gayrat/marketplace/services/catalog/internal/repository"
	"github.com/google/uuid"
)

type Catalog struct {
	repo *repository.Catalog
}

func New(repo *repository.Catalog) *Catalog {
	return &Catalog{repo: repo}
}

func (s *Catalog) Repository() *repository.Catalog {
	return s.repo
}

func (s *Catalog) BulkCreate(tenantID string, products []model.BulkProductRequest) ([]string, error) {
	createdIDs := make([]string, 0, len(products))
	for _, product := range products {
		id := uuid.NewString()
		if err := s.repo.CreateBulkProduct(id, tenantID, product); err == nil {
			createdIDs = append(createdIDs, id)
		}
	}
	return createdIDs, nil
}

func (s *Catalog) ImportCSV(tenantID string, input io.Reader) ([]string, error) {
	reader := csv.NewReader(input)
	rows, err := reader.ReadAll()
	if err != nil {
		return nil, err
	}

	createdIDs := make([]string, 0, len(rows))
	for index, row := range rows {
		if index == 0 && len(row) > 0 && row[0] == "slug" {
			continue
		}
		if len(row) < 5 {
			continue
		}
		price, _ := strconv.ParseFloat(row[4], 64)
		inventory := 0
		if len(row) > 5 {
			inventory, _ = strconv.Atoi(row[5])
		}
		translations, _ := json.Marshal(map[string]any{
			"uz": map[string]string{"name": row[2]},
			"ru": map[string]string{"name": row[3]},
		})
		id := uuid.NewString()
		request := model.CreateProductRequest{
			CategoryID:        row[1],
			Slug:              row[0],
			Translations:      translations,
			Price:             price,
			Currency:          "UZS",
			InventoryQuantity: inventory,
			Status:            "draft",
			SEO:               json.RawMessage(`{}`),
			Attributes:        json.RawMessage(`{}`),
			Images:            json.RawMessage(`[]`),
		}
		if err := s.repo.CreateImportedProduct(id, tenantID, request); err == nil {
			createdIDs = append(createdIDs, id)
		}
	}
	return createdIDs, nil
}

var productStatusFSM = map[string][]string{
	"draft":          {"pending_review", "active", "archived"},
	"pending_review": {"active", "rejected", "draft"},
	"rejected":       {"draft", "pending_review"},
	"active":         {"out_of_stock", "archived", "draft"},
	"out_of_stock":   {"active", "archived"},
	"archived":       {"draft"},
}

func validateStatusTransition(from, to string) bool {
	allowed, ok := productStatusFSM[from]
	if !ok {
		return true
	}
	for _, status := range allowed {
		if status == to {
			return true
		}
	}
	return false
}

func ValidateStatusTransition(from, to string) bool {
	return validateStatusTransition(from, to)
}
