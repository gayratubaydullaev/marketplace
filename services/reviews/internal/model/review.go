package model
type CreateRequest struct { OrderID string `json:"order_id"`; Rating int `json:"rating" binding:"required,min=1,max=5"`; Title string `json:"title"`; Body string `json:"body"`; VendorID *string `json:"vendor_id"` }
