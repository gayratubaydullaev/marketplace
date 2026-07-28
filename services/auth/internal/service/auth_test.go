package service

import (
	"testing"

	commonauth "github.com/gayrat/marketplace/packages/go-common/auth"
	"golang.org/x/crypto/bcrypt"
)

func TestBootstrapAdminSkipsProduction(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	s := &AuthService{} // nil repo must not be touched
	if err := s.BootstrapAdmin(); err != nil {
		t.Fatal(err)
	}
}

func TestBootstrapAdminSkipsProdAlias(t *testing.T) {
	t.Setenv("APP_ENV", "prod")
	s := &AuthService{}
	if err := s.BootstrapAdmin(); err != nil {
		t.Fatal(err)
	}
}

func TestPublicRegisterRoleIsCustomer(t *testing.T) {
	if PublicRegisterRole() != string(commonauth.RoleCustomer) {
		t.Fatalf("public register must force customer, got %s", PublicRegisterRole())
	}
}

func TestPasswordHashRoundTrip(t *testing.T) {
	hash, err := bcrypt.GenerateFromPassword([]byte("Customer123!"), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	if err := bcrypt.CompareHashAndPassword(hash, []byte("Customer123!")); err != nil {
		t.Fatal(err)
	}
	if err := bcrypt.CompareHashAndPassword(hash, []byte("wrong")); err == nil {
		t.Fatal("wrong password must fail")
	}
}
