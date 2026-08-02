package handler

import "testing"

func TestExposeOTPDebugRequiresExplicitFlag(t *testing.T) {
	t.Setenv("OTP_DEBUG", "")
	t.Setenv("APP_ENV", "development")
	if exposeOTPDebug() {
		t.Fatal("OTP_DEBUG unset must not expose codes even in development")
	}
	t.Setenv("OTP_DEBUG", "1")
	if !exposeOTPDebug() {
		t.Fatal("OTP_DEBUG=1 must enable debug codes")
	}
}
