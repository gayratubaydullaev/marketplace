package service

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"github.com/gayrat/marketplace/services/search/internal/repository"
)
type Indexer struct { repo *repository.ProductRepository; esURL string }
func NewIndexer(repo *repository.ProductRepository, esURL string) *Indexer { return &Indexer{repo, esURL} }
func (s *Indexer) Index(id string) error {
	product, err := s.repo.Get(id); if err != nil { return err }
	body, _ := json.Marshal(product)
	req, _ := http.NewRequest(http.MethodPut, fmt.Sprintf("%s/products/_doc/%s", s.esURL, id), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json"); resp, err := http.DefaultClient.Do(req); if err == nil { resp.Body.Close() }; return err
}
