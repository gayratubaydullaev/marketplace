package commerce

// ShippingEstimate is a provider-neutral delivery quote.
type ShippingEstimate struct {
	Provider      string  `json:"provider"`
	Cost          float64 `json:"cost"`
	Currency      string  `json:"currency"`
	EstimatedDays int     `json:"estimated_days"`
}

// ShippingProvider allows a real carrier integration to replace the local
// estimate without changing checkout callers.
type ShippingProvider interface {
	Name() string
	Estimate(region string, subtotal float64) (ShippingEstimate, error)
}

// EasyPostStub preserves the current local shipping rules until EasyPost is
// configured with credentials and a live rate-shopping implementation.
type EasyPostStub struct{}

func (EasyPostStub) Name() string { return "easypost" }

func (p EasyPostStub) Estimate(region string, subtotal float64) (ShippingEstimate, error) {
	return ShippingEstimate{
		Provider: p.Name(), Cost: EstimateShipping(region, subtotal),
		Currency: "UZS", EstimatedDays: 3,
	}, nil
}

// ShipStationStub preserves the current local shipping rules until ShipStation
// credentials and carrier rates are available.
type ShipStationStub struct{}

func (ShipStationStub) Name() string { return "shipstation" }

func (p ShipStationStub) Estimate(region string, subtotal float64) (ShippingEstimate, error) {
	return ShippingEstimate{
		Provider: p.Name(), Cost: EstimateShipping(region, subtotal),
		Currency: "UZS", EstimatedDays: 3,
	}, nil
}
