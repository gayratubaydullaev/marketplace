package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"os"
	"strings"
	"time"

	commonauth "github.com/gayrat/marketplace/packages/go-common/auth"
	"github.com/gayrat/marketplace/packages/go-common/sms"
	"github.com/gayrat/marketplace/packages/go-common/tenant"
	"github.com/gayrat/marketplace/services/auth/internal/model"
	"github.com/gayrat/marketplace/services/auth/internal/repository"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"golang.org/x/crypto/bcrypt"
)

type AuthService struct {
	repo    *repository.UserRepo
	tokens  *commonauth.Manager
	rdb     *redis.Client
}

func NewAuthService(repo *repository.UserRepo, tokens *commonauth.Manager, rdb *redis.Client) *AuthService {
	return &AuthService{repo: repo, tokens: tokens, rdb: rdb}
}

func (s *AuthService) BootstrapAdmin() error {
	hash, err := bcrypt.GenerateFromPassword([]byte("Admin123!"), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	return s.repo.EnsureAdminPassword(string(hash))
}

func (s *AuthService) Register(tenantID string, req model.RegisterRequest) (*model.User, *commonauth.TokenPair, error) {
	existing, err := s.repo.FindByEmail(tenantID, strings.ToLower(req.Email))
	if err != nil {
		return nil, nil, err
	}
	if existing != nil {
		return nil, nil, errors.New("email already registered")
	}
	role := req.Role
	if role == "" {
		role = string(commonauth.RoleCustomer)
	}
	if role != string(commonauth.RoleCustomer) && role != string(commonauth.RoleVendor) {
		role = string(commonauth.RoleCustomer)
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, nil, err
	}
	hashStr := string(hash)
	locale := req.Locale
	if locale == "" {
		locale = "uz"
	}
	var phone *string
	if req.Phone != "" {
		normalized, ok := tenant.NormalizeUZPhone(req.Phone)
		if !ok {
			return nil, nil, errors.New("invalid Uzbekistan phone (+998XXXXXXXXX)")
		}
		phone = &normalized
	}
	fn, ln := req.FirstName, req.LastName
	u := &model.User{
		ID:           uuid.NewString(),
		TenantID:     tenantID,
		Email:        strings.ToLower(req.Email),
		PasswordHash: &hashStr,
		Role:         role,
		FirstName:    &fn,
		LastName:     &ln,
		Phone:        phone,
		Locale:       locale,
		Status:       "active",
	}
	if err := s.repo.Create(u); err != nil {
		return nil, nil, err
	}
	pair, err := s.issueTokens(u)
	return u, pair, err
}

func (s *AuthService) Login(tenantID string, req model.LoginRequest) (*model.User, *commonauth.TokenPair, error) {
	email := strings.ToLower(req.Email)
	if s.rdb != nil {
		fails, _ := s.rdb.Get(context.Background(), "loginfail:"+tenantID+":"+email).Int()
		if fails >= 10 {
			return nil, nil, errors.New("account temporarily locked — too many failed logins")
		}
	}
	u, err := s.repo.FindByEmail(tenantID, email)
	if err != nil {
		return nil, nil, err
	}
	if u == nil || u.PasswordHash == nil {
		s.recordLoginFail(tenantID, email)
		return nil, nil, errors.New("invalid credentials")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(*u.PasswordHash), []byte(req.Password)); err != nil {
		s.recordLoginFail(tenantID, email)
		return nil, nil, errors.New("invalid credentials")
	}
	if u.Status != "active" {
		return nil, nil, errors.New("account is not active")
	}
	if s.rdb != nil {
		_ = s.rdb.Del(context.Background(), "loginfail:"+tenantID+":"+email).Err()
	}
	pair, err := s.issueTokens(u)
	return u, pair, err
}

func (s *AuthService) recordLoginFail(tenantID, email string) {
	if s.rdb == nil {
		return
	}
	key := "loginfail:" + tenantID + ":" + email
	n, err := s.rdb.Incr(context.Background(), key).Result()
	if err == nil && n == 1 {
		_ = s.rdb.Expire(context.Background(), key, 15*time.Minute).Err()
	}
}

func (s *AuthService) Refresh(refreshToken, fingerprint string) (*commonauth.TokenPair, error) {
	claims, err := s.tokens.Parse(refreshToken)
	if err != nil {
		return nil, errors.New("invalid refresh token")
	}
	hash := hashToken(refreshToken)
	ok, err := s.repo.IsRefreshValid(hash)
	if err != nil || !ok {
		return nil, errors.New("refresh token revoked or expired")
	}
	if fingerprint != "" && s.rdb != nil {
		stored, _ := s.rdb.Get(context.Background(), "refreshfp:"+hash).Result()
		if stored != "" && stored != fingerprint {
			_ = s.repo.RevokeRefreshToken(hash)
			return nil, errors.New("refresh fingerprint mismatch")
		}
	}
	u, err := s.repo.FindByID(claims.UserID)
	if err != nil || u == nil {
		return nil, errors.New("user not found")
	}
	_ = s.repo.RevokeRefreshToken(hash)
	if s.rdb != nil {
		_ = s.rdb.Del(context.Background(), "refreshfp:"+hash).Err()
	}
	return s.issueTokensWithFingerprint(u, fingerprint)
}

func (s *AuthService) Logout(refreshToken string) error {
	hash := hashToken(refreshToken)
	if s.rdb != nil {
		_ = s.rdb.Del(context.Background(), "refreshfp:"+hash).Err()
	}
	return s.repo.RevokeRefreshToken(hash)
}

func (s *AuthService) Me(userID string) (*model.User, error) {
	return s.repo.FindByID(userID)
}

func (s *AuthService) UpdateMe(userID string, req model.UpdateMeRequest) (*model.User, error) {
	u, err := s.repo.FindByID(userID)
	if err != nil || u == nil {
		return nil, errors.New("user not found")
	}
	if req.FirstName != nil {
		u.FirstName = req.FirstName
	}
	if req.LastName != nil {
		u.LastName = req.LastName
	}
	if req.Locale != nil {
		u.Locale = *req.Locale
	}
	if req.AvatarURL != nil {
		u.AvatarURL = req.AvatarURL
	}
	if req.Phone != nil {
		normalized, ok := tenant.NormalizeUZPhone(*req.Phone)
		if !ok {
			return nil, errors.New("invalid Uzbekistan phone")
		}
		u.Phone = &normalized
	}
	if err := s.repo.Update(u); err != nil {
		return nil, err
	}
	return u, nil
}

func (s *AuthService) ForgotPassword(tenantID, email string) (string, error) {
	u, err := s.repo.FindByEmail(tenantID, strings.ToLower(email))
	if err != nil || u == nil {
		return "", nil // do not leak
	}
	tokenBytes := make([]byte, 32)
	_, _ = rand.Read(tokenBytes)
	token := hex.EncodeToString(tokenBytes)
	if s.rdb != nil {
		key := fmt.Sprintf("pwdreset:%s", token)
		_ = s.rdb.Set(context.Background(), key, u.ID, time.Hour).Err()
	}
	return token, nil
}

func (s *AuthService) ResetPassword(token, newPassword string) error {
	if s.rdb == nil {
		return errors.New("reset unavailable")
	}
	key := fmt.Sprintf("pwdreset:%s", token)
	userID, err := s.rdb.Get(context.Background(), key).Result()
	if err != nil {
		return errors.New("invalid or expired reset token")
	}
	u, err := s.repo.FindByID(userID)
	if err != nil || u == nil {
		return errors.New("user not found")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	hashStr := string(hash)
	u.PasswordHash = &hashStr
	if err := s.repo.Update(u); err != nil {
		return err
	}
	_ = s.rdb.Del(context.Background(), key).Err()
	return nil
}

func (s *AuthService) SendOTP(phone string) (string, error) {
	normalized, ok := tenant.NormalizeUZPhone(phone)
	if !ok {
		return "", errors.New("invalid Uzbekistan phone")
	}
	n, _ := rand.Int(rand.Reader, big.NewInt(900000))
	code := fmt.Sprintf("%06d", n.Int64()+100000)
	if s.rdb != nil {
		_ = s.rdb.Set(context.Background(), "otp:"+normalized, code, 5*time.Minute).Err()
	}
	msg := fmt.Sprintf("Gayrat code: %s", code)
	_ = sms.FromEnv().Send(normalized, msg)
	// Never return code in production.
	if os.Getenv("APP_ENV") == "production" || os.Getenv("APP_ENV") == "prod" {
		return "", nil
	}
	return code, nil
}

func (s *AuthService) VerifyOTP(tenantID, phone, code string) (*model.User, *commonauth.TokenPair, error) {
	normalized, ok := tenant.NormalizeUZPhone(phone)
	if !ok {
		return nil, nil, errors.New("invalid phone")
	}
	if s.rdb != nil {
		stored, err := s.rdb.Get(context.Background(), "otp:"+normalized).Result()
		if err != nil || stored != code {
			return nil, nil, errors.New("invalid otp")
		}
		_ = s.rdb.Del(context.Background(), "otp:"+normalized).Err()
	}
	email := strings.ReplaceAll(normalized, "+", "") + "@otp.gayrat.uz"
	u, err := s.repo.FindByEmail(tenantID, email)
	if err != nil {
		return nil, nil, err
	}
	if u == nil {
		phoneCopy := normalized
		u = &model.User{
			ID:            uuid.NewString(),
			TenantID:      tenantID,
			Email:         email,
			Role:          string(commonauth.RoleCustomer),
			Phone:         &phoneCopy,
			Locale:        "uz",
			PhoneVerified: true,
			Status:        "active",
		}
		if err := s.repo.Create(u); err != nil {
			return nil, nil, err
		}
	} else {
		u.PhoneVerified = true
		_ = s.repo.Update(u)
	}
	pair, err := s.issueTokens(u)
	return u, pair, err
}

func (s *AuthService) RequestEmailVerification(userID string) (string, error) {
	u, err := s.repo.FindByID(userID)
	if err != nil || u == nil {
		return "", errors.New("user not found")
	}
	if u.EmailVerified {
		return "", nil
	}
	tokenBytes := make([]byte, 32)
	_, _ = rand.Read(tokenBytes)
	token := hex.EncodeToString(tokenBytes)
	hash := hashToken(token)
	expires := time.Now().Add(24 * time.Hour)
	if err := s.repo.SaveEmailVerification(userID, hash, expires); err != nil {
		return "", err
	}
	if s.rdb != nil {
		_ = s.rdb.Set(context.Background(), "emailverify:"+hash, userID, 24*time.Hour).Err()
	}
	return token, nil
}

func (s *AuthService) VerifyEmail(token string) error {
	hash := hashToken(token)
	if s.rdb != nil {
		_ = s.rdb.Del(context.Background(), "emailverify:"+hash).Err()
	}
	_, err := s.repo.ConsumeEmailVerification(hash)
	return err
}

func (s *AuthService) OAuth(tenantID string, req model.OAuthRequest) (*model.User, *commonauth.TokenPair, error) {
	provider := strings.ToLower(req.Provider)
	id, err := verifyOAuthToken(provider, req.AccessToken, req.Email, req.FirstName, req.LastName)
	if err != nil {
		return nil, nil, err
	}
	email := id.Email
	if email == "" {
		return nil, nil, errors.New("oauth email required")
	}
	u, err := s.repo.FindByEmail(tenantID, email)
	if err != nil {
		return nil, nil, err
	}
	if u == nil {
		fn, ln := id.FirstName, id.LastName
		u = &model.User{
			ID:            uuid.NewString(),
			TenantID:      tenantID,
			Email:         email,
			Role:          string(commonauth.RoleCustomer),
			FirstName:     &fn,
			LastName:      &ln,
			Locale:        "uz",
			EmailVerified: true,
			Status:        "active",
		}
		if err := s.repo.Create(u); err != nil {
			return nil, nil, err
		}
	}
	pair, err := s.issueTokens(u)
	return u, pair, err
}

func (s *AuthService) ListUsers(tenantID string, limit int) ([]model.User, error) {
	return s.repo.ListByTenant(tenantID, limit)
}

func (s *AuthService) AnonymizeUser(userID string) error {
	anon := fmt.Sprintf("deleted-%s@anon.gayrat.uz", userID[:8])
	empty := ""
	u, err := s.repo.FindByID(userID)
	if err != nil || u == nil {
		return errors.New("user not found")
	}
	u.Email = anon
	u.FirstName = &empty
	u.LastName = &empty
	u.Phone = &empty
	u.Status = "deleted"
	return s.repo.Update(u)
}

func (s *AuthService) issueTokens(u *model.User) (*commonauth.TokenPair, error) {
	return s.issueTokensWithFingerprint(u, "")
}

func (s *AuthService) issueTokensWithFingerprint(u *model.User, fingerprint string) (*commonauth.TokenPair, error) {
	pair, err := s.tokens.Issue(u.ID, u.TenantID, u.Email, commonauth.Role(u.Role), fingerprint)
	if err != nil {
		return nil, err
	}
	hash := hashToken(pair.RefreshToken)
	_ = s.repo.SaveRefreshToken(u.ID, hash, time.Now().Add(7*24*time.Hour))
	if fingerprint != "" && s.rdb != nil {
		_ = s.rdb.Set(context.Background(), "refreshfp:"+hash, fingerprint, 7*24*time.Hour).Err()
	}
	return pair, nil
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}
