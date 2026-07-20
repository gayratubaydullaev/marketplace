package service

import (
	kafkax "github.com/gayrat/marketplace/packages/go-common/kafka"
	"github.com/gayrat/marketplace/services/vendor-service/internal/repository"
)

type VendorService struct {
	Repo     *repository.VendorRepository
	Producer *kafkax.Producer
}

func NewVendorService(repo *repository.VendorRepository, producer *kafkax.Producer) *VendorService {
	return &VendorService{Repo: repo, Producer: producer}
}
