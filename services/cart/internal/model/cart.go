package model

import "time"

type Cart struct {
	ID                  string  `db:"id" json:"id"`
	TenantID            string  `db:"tenant_id" json:"tenant_id"`
	UserID              *string `db:"user_id" json:"user_id"`
	GuestID             *string `db:"guest_id" json:"guest_id"`
	CouponCode          *string `db:"coupon_code" json:"coupon_code"`
	GiftCertificateCode *string `db:"gift_certificate_code" json:"gift_certificate_code"`
	Currency            string  `db:"currency" json:"currency"`
}

type CartItem struct {
	ID        string  `db:"id" json:"id"`
	CartID    string  `db:"cart_id" json:"cart_id"`
	ProductID string  `db:"product_id" json:"product_id"`
	VariantID *string `db:"variant_id" json:"variant_id"`
	VendorID  *string `db:"vendor_id" json:"vendor_id"`
	Quantity  int     `db:"quantity" json:"quantity"`
	UnitPrice float64 `db:"unit_price" json:"unit_price"`
	Title     *string `db:"title" json:"title"`
}

type Address struct {
	ID         string  `db:"id" json:"id"`
	TenantID   string  `db:"tenant_id" json:"tenant_id"`
	UserID     string  `db:"user_id" json:"user_id"`
	Label      *string `db:"label" json:"label"`
	FullName   *string `db:"full_name" json:"full_name"`
	Phone      *string `db:"phone" json:"phone"`
	Region     string  `db:"region" json:"region"`
	District   *string `db:"district" json:"district"`
	Mahalla    *string `db:"mahalla" json:"mahalla"`
	Street     *string `db:"street" json:"street"`
	Building   *string `db:"building" json:"building"`
	Apartment  *string `db:"apartment" json:"apartment"`
	PostalCode *string `db:"postal_code" json:"postal_code"`
	IsDefault  bool    `db:"is_default" json:"is_default"`
}

type WishlistItem struct {
	ID         string    `db:"id" json:"id"`
	WishlistID string    `db:"wishlist_id" json:"wishlist_id"`
	TenantID   string    `db:"tenant_id" json:"tenant_id"`
	ProductID  string    `db:"product_id" json:"product_id"`
	VariantID  *string   `db:"variant_id" json:"variant_id"`
	CreatedAt  time.Time `db:"created_at" json:"created_at"`
}
