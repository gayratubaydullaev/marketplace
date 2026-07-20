package repository

import (
	"github.com/gayrat/marketplace/services/search/internal/model"
	"github.com/jmoiron/sqlx"
)
type ProductRepository struct{ db *sqlx.DB }
func NewProductRepository(db *sqlx.DB) *ProductRepository { return &ProductRepository{db} }
func (r *ProductRepository) Get(id string) (model.Product, error) {
	var product model.Product
	err := r.db.Get(&product, `SELECT id, tenant_id, translations, price, currency FROM products WHERE id=$1`, id)
	return product, err
}
