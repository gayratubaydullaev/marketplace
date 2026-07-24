package model

import "time"

type User struct {
	ID            string    `db:"id" json:"id"`
	TenantID      string    `db:"tenant_id" json:"tenant_id"`
	Email         string    `db:"email" json:"email"`
	PasswordHash  *string   `db:"password_hash" json:"-"`
	Role          string    `db:"role" json:"role"`
	FirstName     *string   `db:"first_name" json:"first_name"`
	LastName      *string   `db:"last_name" json:"last_name"`
	Phone         *string   `db:"phone" json:"phone"`
	AvatarURL     *string   `db:"avatar_url" json:"avatar_url"`
	Locale        string    `db:"locale" json:"locale"`
	EmailVerified bool      `db:"email_verified" json:"email_verified"`
	PhoneVerified bool      `db:"phone_verified" json:"phone_verified"`
	OTPSecret     *string   `db:"otp_secret" json:"-"`
	Status        string    `db:"status" json:"status"`
	CreatedAt     time.Time `db:"created_at" json:"created_at"`
	UpdatedAt     time.Time `db:"updated_at" json:"updated_at"`
}

type RegisterRequest struct {
	Email     string `json:"email" binding:"required,email"`
	Password  string `json:"password" binding:"required,min=8"`
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
	Phone     string `json:"phone"`
	Locale    string `json:"locale"`
	Role      string `json:"role"`
}

type LoginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

type UpdateMeRequest struct {
	FirstName *string `json:"first_name"`
	LastName  *string `json:"last_name"`
	Phone     *string `json:"phone"`
	Locale    *string `json:"locale"`
	AvatarURL *string `json:"avatar_url"`
}

type ForgotPasswordRequest struct {
	Email string `json:"email" binding:"required,email"`
}

type ResetPasswordRequest struct {
	Token       string `json:"token" binding:"required"`
	NewPassword string `json:"new_password" binding:"required,min=8"`
}

type OTPRequest struct {
	Phone string `json:"phone" binding:"required"`
}

type OTPVerifyRequest struct {
	Phone string `json:"phone" binding:"required"`
	Code  string `json:"code" binding:"required"`
}

type EmailOTPRequest struct {
	Email string `json:"email" binding:"required,email"`
}

type EmailOTPVerifyRequest struct {
	Email string `json:"email" binding:"required,email"`
	Code  string `json:"code" binding:"required,len=6"`
}

type OAuthRequest struct {
	Provider    string `json:"provider" binding:"required"`
	AccessToken string `json:"access_token" binding:"required"`
	Email       string `json:"email"`
	FirstName   string `json:"first_name"`
	LastName    string `json:"last_name"`
}

type VerifyEmailRequest struct {
	Token string `json:"token" binding:"required"`
}
