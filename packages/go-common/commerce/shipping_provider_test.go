package commerce

import "testing"

func TestProviderFromEnvDefaultLocal(t *testing.T) {
	t.Setenv("SHIPPING_PROVIDER", "")
	p := ProviderFromEnv()
	if p.Name() != "local" {
		t.Fatalf("got %s", p.Name())
	}
	est, err := p.Estimate("tashkent", 10000)
	if err != nil || est.Cost != 15_000 {
		t.Fatalf("est=%+v err=%v", est, err)
	}
}

func TestProviderFromEnvEasyPostFallback(t *testing.T) {
	t.Setenv("SHIPPING_PROVIDER", "easypost")
	t.Setenv("EASYPOST_API_KEY", "")
	p := ProviderFromEnv()
	est, err := p.Estimate("tashkent", 10000)
	if err != nil || est.Provider != "easypost" || est.Cost != 15_000 {
		t.Fatalf("est=%+v err=%v", est, err)
	}
}
