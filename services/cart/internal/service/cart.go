package service

import "github.com/gayrat/marketplace/services/cart/internal/repository"

type CartService struct{ Repo *repository.CartRepository }

func NewCartService(repo *repository.CartRepository) *CartService {
	return &CartService{Repo: repo}
}
