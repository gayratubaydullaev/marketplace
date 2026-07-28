package commerce

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"
)

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

// LocalRulesProvider is the default Uzbekistan flat-rate matrix.
type LocalRulesProvider struct{}

func (LocalRulesProvider) Name() string { return "local" }

func (p LocalRulesProvider) Estimate(region string, subtotal float64) (ShippingEstimate, error) {
	return ShippingEstimate{
		Provider: p.Name(), Cost: EstimateShipping(region, subtotal),
		Currency: "UZS", EstimatedDays: 3,
	}, nil
}

// EasyPostProvider calls EasyPost rate shopping when EASYPOST_API_KEY is set;
// on any failure it falls back to LocalRulesProvider.
type EasyPostProvider struct {
	APIKey string
	HTTP   *http.Client
}

func (p EasyPostProvider) Name() string { return "easypost" }

func (p EasyPostProvider) Estimate(region string, subtotal float64) (ShippingEstimate, error) {
	local, _ := LocalRulesProvider{}.Estimate(region, subtotal)
	if p.APIKey == "" {
		local.Provider = p.Name()
		return local, nil
	}
	client := p.HTTP
	if client == nil {
		client = &http.Client{Timeout: 3 * time.Second}
	}
	body := fmt.Sprintf(`{"shipment":{"to_address":{"country":"UZ","state":%q},"parcel":{"weight":16},"options":{"currency":"UZS"}}}`, region)
	req, err := http.NewRequest(http.MethodPost, "https://api.easypost.com/v2/shipments", strings.NewReader(body))
	if err != nil {
		local.Provider = p.Name()
		return local, nil
	}
	req.SetBasicAuth(p.APIKey, "")
	req.Header.Set("Content-Type", "application/json")
	res, err := client.Do(req)
	if err != nil {
		local.Provider = p.Name()
		return local, nil
	}
	defer res.Body.Close()
	if res.StatusCode >= 300 {
		local.Provider = p.Name()
		return local, nil
	}
	var parsed struct {
		Rates []struct {
			Rate           string `json:"rate"`
			DeliveryDays   int    `json:"delivery_days"`
			EstDeliveryDays int   `json:"est_delivery_days"`
		} `json:"rates"`
	}
	if err := json.NewDecoder(res.Body).Decode(&parsed); err != nil || len(parsed.Rates) == 0 {
		local.Provider = p.Name()
		return local, nil
	}
	var cost float64
	_, _ = fmt.Sscanf(parsed.Rates[0].Rate, "%f", &cost)
	days := parsed.Rates[0].DeliveryDays
	if days == 0 {
		days = parsed.Rates[0].EstDeliveryDays
	}
	if days == 0 {
		days = 3
	}
	if cost <= 0 {
		cost = local.Cost
	}
	return ShippingEstimate{Provider: p.Name(), Cost: cost, Currency: "UZS", EstimatedDays: days}, nil
}

// ShipStationProvider uses ShipStation rates API when credentials exist;
// otherwise falls back to local rules under the shipstation provider name.
type ShipStationProvider struct {
	APIKey    string
	APISecret string
	HTTP      *http.Client
}

func (p ShipStationProvider) Name() string { return "shipstation" }

func (p ShipStationProvider) Estimate(region string, subtotal float64) (ShippingEstimate, error) {
	local, _ := LocalRulesProvider{}.Estimate(region, subtotal)
	local.Provider = p.Name()
	if p.APIKey == "" || p.APISecret == "" {
		return local, nil
	}
	client := p.HTTP
	if client == nil {
		client = &http.Client{Timeout: 3 * time.Second}
	}
	body := fmt.Sprintf(`{"carrierCode":"stamps_com","fromPostalCode":"100000","toCountry":"UZ","toState":%q,"weight":{"value":16,"units":"ounces"},"confirmation":"none","residential":true}`, region)
	req, err := http.NewRequest(http.MethodPost, "https://ssapi.shipstation.com/shipments/getrates", strings.NewReader(body))
	if err != nil {
		return local, nil
	}
	req.SetBasicAuth(p.APIKey, p.APISecret)
	req.Header.Set("Content-Type", "application/json")
	res, err := client.Do(req)
	if err != nil {
		return local, nil
	}
	defer res.Body.Close()
	if res.StatusCode >= 300 {
		return local, nil
	}
	var rates []struct {
		ShipmentCost float64 `json:"shipmentCost"`
		ServiceCode  string  `json:"serviceCode"`
	}
	if err := json.NewDecoder(res.Body).Decode(&rates); err != nil || len(rates) == 0 {
		return local, nil
	}
	cost := rates[0].ShipmentCost
	if cost <= 0 {
		cost = local.Cost
	}
	return ShippingEstimate{Provider: p.Name(), Cost: cost, Currency: "UZS", EstimatedDays: 3}, nil
}

// Deprecated aliases — kept so existing imports compile.
type EasyPostStub = EasyPostProvider
type ShipStationStub = ShipStationProvider

// ProviderFromEnv selects shipping backend:
// SHIPPING_PROVIDER=easypost|shipstation|local (default local).
func ProviderFromEnv() ShippingProvider {
	switch strings.ToLower(strings.TrimSpace(os.Getenv("SHIPPING_PROVIDER"))) {
	case "easypost":
		return EasyPostProvider{APIKey: os.Getenv("EASYPOST_API_KEY")}
	case "shipstation":
		return ShipStationProvider{
			APIKey:    os.Getenv("SHIPSTATION_API_KEY"),
			APISecret: os.Getenv("SHIPSTATION_API_SECRET"),
		}
	default:
		return LocalRulesProvider{}
	}
}
