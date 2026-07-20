package repository

import "github.com/jmoiron/sqlx"

type VendorRepository struct{ DB *sqlx.DB }

func NewVendorRepository(db *sqlx.DB) *VendorRepository { return &VendorRepository{DB: db} }
