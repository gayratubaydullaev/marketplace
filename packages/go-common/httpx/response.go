package httpx

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

type ErrorBody struct {
	Error   string `json:"error"`
	Code    string `json:"code,omitempty"`
	Details any    `json:"details,omitempty"`
}

func OK(c *gin.Context, data any) {
	c.JSON(http.StatusOK, data)
}

func Created(c *gin.Context, data any) {
	c.JSON(http.StatusCreated, data)
}

func Fail(c *gin.Context, status int, code, msg string) {
	c.AbortWithStatusJSON(status, ErrorBody{Error: msg, Code: code})
}

func BadRequest(c *gin.Context, msg string) {
	Fail(c, http.StatusBadRequest, "bad_request", msg)
}

func Unauthorized(c *gin.Context, msg string) {
	Fail(c, http.StatusUnauthorized, "unauthorized", msg)
}

func Forbidden(c *gin.Context, msg string) {
	Fail(c, http.StatusForbidden, "forbidden", msg)
}

func NotFound(c *gin.Context, msg string) {
	Fail(c, http.StatusNotFound, "not_found", msg)
}

func Conflict(c *gin.Context, msg string) {
	Fail(c, http.StatusConflict, "conflict", msg)
}

func TooManyRequests(c *gin.Context, msg string) {
	Fail(c, http.StatusTooManyRequests, "rate_limited", msg)
}

func Internal(c *gin.Context, msg string) {
	Fail(c, http.StatusInternalServerError, "internal_error", msg)
}

// IsInvalidUUID reports Postgres invalid uuid / syntax errors that should be 400.
func IsInvalidUUID(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "invalid input syntax for type uuid") ||
		strings.Contains(msg, "invalid uuid")
}

// WriteDBError maps common Postgres client/input errors to 400; otherwise 500.
func WriteDBError(c *gin.Context, err error) {
	if err == nil {
		return
	}
	if IsInvalidUUID(err) {
		BadRequest(c, "invalid id")
		return
	}
	msg := err.Error()
	lower := strings.ToLower(msg)
	if strings.Contains(lower, "violates check constraint") ||
		strings.Contains(lower, "violates foreign key") ||
		strings.Contains(lower, "duplicate key") ||
		strings.Contains(lower, "violates unique") {
		BadRequest(c, msg)
		return
	}
	Internal(c, msg)
}
